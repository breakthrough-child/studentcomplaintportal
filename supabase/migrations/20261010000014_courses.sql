-- =============================================================================
-- 0014  Courses: a shared catalogue, lecturers pick (and drop) the courses they
--       take, and students can find a lecturer by course
--
-- * courses: catalogue rows (code, title, optional department / level). Readable
--   by every signed-in user with an effective role (course names are not private).
--   Administrators manage it directly; approved lecturers may ADD a missing course
--   through add_course() (normalised, de-duplicated by code, rate-limited, audited)
--   but cannot edit or deactivate catalogue rows.
-- * lecturer_courses: which lecturer takes which course. A lecturer can only add
--   or remove their OWN rows, only while approved, and only for active courses.
-- * search_lecturers: the query now also matches course code / title, the level /
--   department filters also match a lecturer's courses, and each result carries
--   the codes of the courses the lecturer takes (that is the point of the feature:
--   a student who does not know the department can search by course).
-- =============================================================================

create table public.courses (
  id             uuid primary key default gen_random_uuid(),
  code           text not null check (code ~ '^[A-Z0-9][A-Z0-9 /._-]{1,19}$'),
  title          text not null check (char_length(btrim(title)) between 2 and 200),
  department_id  uuid references public.departments (id) on delete restrict,
  level_id       uuid references public.academic_levels (id) on delete restrict,
  is_active      boolean not null default true,
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- "CSC 301", "csc301" and "CSC  301" are the same course.
create unique index courses_code_key on public.courses (regexp_replace(code, '\s', '', 'g'));
create index courses_department_idx on public.courses (department_id) where is_active;
create index courses_level_idx on public.courses (level_id) where is_active;

create table public.lecturer_courses (
  lecturer_profile_id  uuid not null references public.profiles (id) on delete cascade,
  course_id            uuid not null references public.courses (id) on delete cascade,
  created_at           timestamptz not null default now(),
  primary key (lecturer_profile_id, course_id)
);
create index lecturer_courses_course_idx on public.lecturer_courses (course_id);

-- ---- normalisation / guards -------------------------------------------------
create or replace function public.prepare_course() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.code  := upper(regexp_replace(btrim(new.code), '\s+', ' ', 'g'));
  new.title := regexp_replace(btrim(new.title), '\s+', ' ', 'g');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_by := old.created_by;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger courses_prepare before insert or update on public.courses
  for each row execute function public.prepare_course();

-- At most 40 courses per lecturer; the course must be active when it is added.
create or replace function public.guard_lecturer_course() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.courses c where c.id = new.course_id and c.is_active) then
    raise exception 'that course is not available' using errcode = '22023';
  end if;
  if (select count(*) from public.lecturer_courses lc where lc.lecturer_profile_id = new.lecturer_profile_id) >= 40 then
    raise exception 'you can take at most 40 courses' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger lecturer_courses_guard before insert on public.lecturer_courses
  for each row execute function public.guard_lecturer_course();

create trigger audit_courses          after insert or update or delete on public.courses          for each row execute function public.audit_row_change();
create trigger audit_lecturer_courses after insert or delete on public.lecturer_courses           for each row execute function public.audit_row_change();

-- ---- row level security -----------------------------------------------------
alter table public.courses          enable row level security;
alter table public.lecturer_courses enable row level security;

create policy courses_select on public.courses
  for select to authenticated using (public.current_user_role() is not null);
create policy courses_admin_write on public.courses
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy lecturer_courses_select on public.lecturer_courses
  for select to authenticated
  using (lecturer_profile_id = auth.uid() or public.is_admin() or public.is_main_lecturer());
create policy lecturer_courses_insert_self on public.lecturer_courses
  for insert to authenticated
  with check (lecturer_profile_id = auth.uid() and public.is_lecturer_staff());
create policy lecturer_courses_delete on public.lecturer_courses
  for delete to authenticated
  using ((lecturer_profile_id = auth.uid() and public.current_user_role() is not null) or public.is_admin());

-- ---- lecturers add a missing course ----------------------------------------
-- Creates the course if no course with that code exists (codes compared without
-- spaces), otherwise reuses the existing one, then adds it to the caller's
-- courses. Approved lecturers / main lecturers only; at most 20 new catalogue
-- entries per lecturer per 24 hours.
create or replace function public.add_course(
  p_code text, p_title text, p_department_id uuid default null, p_level_id uuid default null
) returns table (course_id uuid, created boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_code  text := upper(regexp_replace(btrim(coalesce(p_code, '')), '\s+', ' ', 'g'));
  v_title text := regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g');
  v_id    uuid;
  v_active boolean;
  v_new   boolean := false;
begin
  if v_uid is null or not public.is_lecturer_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9 /._-]{1,19}$' then
    raise exception 'invalid course code' using errcode = '22023';
  end if;

  select c.id, c.is_active into v_id, v_active from public.courses c
   where regexp_replace(c.code, '\s', '', 'g') = regexp_replace(v_code, '\s', '', 'g');

  if v_id is null then
    if char_length(v_title) not between 2 and 200 then
      raise exception 'invalid course title' using errcode = '22023';
    end if;
    if p_department_id is not null
       and not exists (select 1 from public.departments d where d.id = p_department_id and d.is_active) then
      raise exception 'department is not active' using errcode = '22023';
    end if;
    if p_level_id is not null
       and not exists (select 1 from public.academic_levels l where l.id = p_level_id and l.is_active) then
      raise exception 'level is not active' using errcode = '22023';
    end if;
    if (select count(*) from public.courses c where c.created_by = v_uid and c.created_at > now() - interval '24 hours') >= 20 then
      raise exception 'rate limit exceeded' using errcode = '54000';
    end if;
    insert into public.courses (code, title, department_id, level_id)
    values (v_code, v_title, p_department_id, p_level_id)
    returning id into v_id;
    v_new := true;
  elsif not v_active then
    raise exception 'that course is not available' using errcode = '22023';
  end if;

  insert into public.lecturer_courses (lecturer_profile_id, course_id) values (v_uid, v_id)
  on conflict do nothing;
  return query select v_id, v_new;
end $$;

-- ---- student-facing lecturer search, now also by course ----------------------
-- The return type gains `courses`, so the function is dropped and recreated
-- (grants re-applied below). Eligibility and error codes are unchanged.
drop function if exists public.search_lecturers(text, uuid, uuid, integer, integer);

create function public.search_lecturers(
  p_query          text    default null,
  p_department_id  uuid    default null,
  p_level_id       uuid    default null,
  p_limit          integer default 20,
  p_offset         integer default 0
) returns table (
  profile_id            uuid,
  full_name             text,
  title                 text,
  home_department_id    uuid,
  home_department_name  text,
  courses               text[]
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q      text;
  v_code   text;
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_approved_student() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_q := nullif(btrim(coalesce(p_query, '')), '');
  if v_q is not null then
    if char_length(v_q) > 100 then
      raise exception 'query too long' using errcode = '22023';
    end if;
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
    v_code := regexp_replace(v_q, '\s', '', 'g');  -- "csc 301" also finds "CSC301"
  end if;

  return query
  select p.id, p.full_name, sd.title, d.id, d.name,
         coalesce((
           select array_agg(x.code order by x.code)
           from (select c.code from public.lecturer_courses lc
                   join public.courses c on c.id = lc.course_id and c.is_active
                  where lc.lecturer_profile_id = p.id
                  order by c.code limit 8) x
         ), '{}'::text[])
  from public.profiles p
  join public.staff_details sd on sd.profile_id = p.id
  left join public.departments d on d.id = sd.department_id
  where p.role in ('lecturer', 'main_lecturer')
    and p.is_active
    and sd.accepts_complaints
    and sd.approval_status = 'approved'
    and (v_q is null
         or p.full_name ilike '%' || v_q || '%' escape '\'
         or exists (select 1 from public.lecturer_courses lc
                      join public.courses c on c.id = lc.course_id and c.is_active
                     where lc.lecturer_profile_id = p.id
                       and (regexp_replace(c.code, '\s', '', 'g') ilike '%' || v_code || '%' escape '\'
                            or c.title ilike '%' || v_q || '%' escape '\')))
    and (p_department_id is null or sd.department_id = p_department_id
         or exists (select 1 from public.lecturer_assignments a
                    where a.lecturer_profile_id = p.id and a.is_active
                      and a.department_id = p_department_id)
         or exists (select 1 from public.lecturer_courses lc
                      join public.courses c on c.id = lc.course_id and c.is_active
                     where lc.lecturer_profile_id = p.id and c.department_id = p_department_id))
    and (p_level_id is null
         or exists (select 1 from public.lecturer_assignments a
                    where a.lecturer_profile_id = p.id and a.is_active
                      and a.level_id = p_level_id)
         or exists (select 1 from public.lecturer_courses lc
                      join public.courses c on c.id = lc.course_id and c.is_active
                     where lc.lecturer_profile_id = p.id and c.level_id = p_level_id))
  order by p.full_name, p.id
  limit v_limit offset v_offset;
end $$;

-- ---- privileges -------------------------------------------------------------
revoke all on public.courses, public.lecturer_courses from anon, authenticated;
grant select on public.courses, public.lecturer_courses to authenticated;
grant insert, delete on public.courses to authenticated;                                     -- RLS: admins only
grant update (code, title, department_id, level_id, is_active) on public.courses to authenticated; -- RLS: admins only
grant insert, delete on public.lecturer_courses to authenticated;                            -- RLS: own rows / admins

revoke all on function public.prepare_course() from public, anon, authenticated;
revoke all on function public.guard_lecturer_course() from public, anon, authenticated;
revoke all on function public.add_course(text, text, uuid, uuid) from public, anon;
grant execute on function public.add_course(text, text, uuid, uuid) to authenticated;
revoke all on function public.search_lecturers(text, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.search_lecturers(text, uuid, uuid, integer, integer) to authenticated;
