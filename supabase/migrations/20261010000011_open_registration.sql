-- =============================================================================
-- 0011  Open self-registration for students and lecturers, mandatory admin
--       approval, and profile pictures
--
-- Change of policy: the university's student and staff records are not
-- available to this system, so a sign-up no longer has to match a
-- pre-registered student or an invitation. Anyone may register as a STUDENT or
-- LECTURER (never main lecturer / administrator) and the account starts
-- `pending`. Nothing protected is reachable until an administrator approves it:
--
--   * students: unchanged gate. is_approved_student() already requires
--     students.approval_status = 'approved' (and a confirmed e-mail), and every
--     complaint read/write path goes through it.
--   * lecturers: new staff_details.approval_status. current_user_role() now
--     returns NULL for a lecturer / main lecturer whose staff record is not
--     approved, so every helper, policy and RPC that is built on it (is_admin,
--     is_lecturer_staff, can_access_complaint, can_participate_complaint, the
--     reference-data policies, ...) fails closed exactly as for a deactivated
--     account. Pending lecturers are also never selectable as recipients and
--     cannot be given assignments.
--
-- E-mail verification is separate and untouched: Supabase's "Confirm email"
-- setting still applies, and is_approved_student() still requires it.
--
-- Invitations and pre-registered student records keep working exactly as
-- before and take precedence over self-registration.
--
-- Forward-only: no existing row loses data. Existing staff are 'approved'.
-- =============================================================================

-- ---- schema changes ---------------------------------------------------------

-- Self-registered students have no registration number (optional at sign-up)
-- and no level / department until an administrator sets them on approval.
alter table public.students alter column registration_number drop not null;
alter table public.students alter column level_id           drop not null;
alter table public.students alter column department_id      drop not null;
-- An approved student must have an academic scope: complaints snapshot it.
alter table public.students add constraint students_approved_has_scope
  check (approval_status <> 'approved' or (level_id is not null and department_id is not null));

-- Approval for staff accounts. Existing rows (all invited) are approved.
alter table public.staff_details
  add column approval_status public.approval_status not null default 'approved',
  add column approved_by     uuid references public.profiles (id) on delete set null,
  add column approved_at     timestamptz;

-- Personal details supplied at registration that only the person and
-- administrators may read. Kept out of `profiles` / `staff_details`, which other
-- complaint participants can read.
create table public.registration_details (
  profile_id      uuid primary key references public.profiles (id) on delete cascade,
  personal_email  text check (personal_email is null or char_length(personal_email) between 3 and 320),
  staff_number    text check (staff_number is null or staff_number ~ '^[A-Z0-9][A-Z0-9/._-]{1,39}$'),
  created_at      timestamptz not null default now()
);

-- Profile picture: object name in the private `avatars` bucket, always
-- "<profile id>/<random uuid>" so nobody can point their profile at another
-- person's file.
alter table public.profiles add column avatar_path text;
alter table public.profiles add constraint profiles_avatar_path_format check (
  avatar_path is null or (
    avatar_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and split_part(avatar_path, '/', 1) = id::text));

insert into public.app_settings (key, value, description) values
  ('self_registration_enabled', to_jsonb(true),
   'Allow students and lecturers to create their own (pending) accounts at /signup. Approval by an administrator is always required.')
on conflict (key) do nothing;

-- ---- identity helpers -------------------------------------------------------

-- Role of the signed-in user; NULL when signed out, deactivated, or a staff
-- account that is not (yet) approved.
create or replace function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role
  from public.profiles p
  left join public.staff_details sd on sd.profile_id = p.id
  where p.id = auth.uid()
    and p.is_active
    and (p.role not in ('lecturer', 'main_lecturer') or coalesce(sd.approval_status, 'approved') = 'approved')
$$;

create or replace function public._is_eligible_lecturer(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.profiles p
    join public.staff_details sd on sd.profile_id = p.id
    where p.id = p_profile_id
      and p.is_active
      and p.role in ('lecturer', 'main_lecturer')
      and sd.accepts_complaints
      and sd.approval_status = 'approved'
  )
$$;

-- The student-facing lecturer selector has its own eligibility filter (0008);
-- recreated with one added condition: the lecturer's account is approved.
-- Same signature and return type, so existing grants are kept.
create or replace function public.search_lecturers(
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
  home_department_name  text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q      text;
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
  end if;

  return query
  select p.id, p.full_name, sd.title, d.id, d.name
  from public.profiles p
  join public.staff_details sd on sd.profile_id = p.id
  left join public.departments d on d.id = sd.department_id
  where p.role in ('lecturer', 'main_lecturer')
    and p.is_active
    and sd.accepts_complaints
    and sd.approval_status = 'approved'
    and (v_q is null or p.full_name ilike '%' || v_q || '%' escape '\')
    and (p_department_id is null or sd.department_id = p_department_id
         or exists (select 1 from public.lecturer_assignments a
                    where a.lecturer_profile_id = p.id and a.is_active
                      and a.department_id = p_department_id))
    and (p_level_id is null
         or exists (select 1 from public.lecturer_assignments a
                    where a.lecturer_profile_id = p.id and a.is_active
                      and a.level_id = p_level_id))
  order by p.full_name, p.id
  limit v_limit offset v_offset;
end $$;

-- Approval state of the signed-in user, for the application's routing and
-- messages (the database enforces access independently of what this returns).
--   'approved' | 'pending' | 'rejected' | 'suspended' | 'unlinked' (student with
--   no student record) | NULL (signed out or deactivated).
create or replace function public.my_approval_status() returns text
language sql stable security definer set search_path = '' as $$
  select case
    when p.role = 'student' then coalesce(
      (select s.approval_status::text from public.students s where s.profile_id = p.id), 'unlinked')
    when p.role in ('lecturer', 'main_lecturer') then coalesce(
      (select sd.approval_status::text from public.staff_details sd where sd.profile_id = p.id), 'approved')
    else 'approved'
  end
  from public.profiles p
  where p.id = auth.uid() and p.is_active
$$;

-- ---- policies: a signed-in person can always read their own rows -------------
-- Previously these required current_user_role(), which is now NULL for pending
-- lecturers; they still need to see their own profile to be told they are pending.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid() or public.can_view_profile(id));

drop policy staff_details_select on public.staff_details;
create policy staff_details_select on public.staff_details
  for select to authenticated using (profile_id = auth.uid() or public.can_view_profile(profile_id));

alter table public.registration_details enable row level security;
create policy registration_details_select on public.registration_details
  for select to authenticated using (profile_id = auth.uid() or public.is_admin());

-- ---- guards -----------------------------------------------------------------

-- Assignments only for approved staff (in addition to the existing checks).
create or replace function public.guard_assignment() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_role public.user_role;
begin
  if tg_op = 'INSERT' then
    select p.role into v_role from public.profiles p where p.id = new.lecturer_profile_id;
    if v_role is null or v_role not in ('lecturer', 'main_lecturer', 'admin') then
      raise exception 'assignments can only be created for staff accounts' using errcode = '22023';
    end if;
    if exists (select 1 from public.staff_details sd
               where sd.profile_id = new.lecturer_profile_id and sd.approval_status <> 'approved') then
      raise exception 'assignments can only be created for approved staff' using errcode = '22023';
    end if;
    if auth.uid() is not null then
      new.created_by := auth.uid();
      if new.lecturer_profile_id = auth.uid() then
        raise exception 'you cannot grant yourself access' using errcode = '42501';
      end if;
    end if;
    if new.level_id is not null
       and not exists (select 1 from public.academic_levels l where l.id = new.level_id and l.is_active) then
      raise exception 'level is not active' using errcode = '22023';
    end if;
    if new.department_id is not null
       and not exists (select 1 from public.departments d where d.id = new.department_id and d.is_active) then
      raise exception 'department is not active' using errcode = '22023';
    end if;
  else
    if new.lecturer_profile_id <> old.lecturer_profile_id then
      raise exception 'assignee cannot be changed' using errcode = '42501';
    end if;
    if auth.uid() is not null and old.lecturer_profile_id = auth.uid() then
      raise exception 'you cannot modify your own access' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- staff_details: approval is admin-only (through review_registration) and is
-- stamped with who/when. Existing rules (department admin-only) are kept.
create or replace function public.guard_staff_details_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.profile_id <> old.profile_id then
    raise exception 'profile_id is immutable' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin()
     and new.department_id is distinct from old.department_id then
    raise exception 'only administrators can change a lecturer department' using errcode = '42501';
  end if;
  if new.approval_status is distinct from old.approval_status then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'only administrators can approve staff' using errcode = '42501';
    end if;
    if new.approval_status = 'approved' then
      new.approved_at := now();
      new.approved_by := coalesce(auth.uid(), new.approved_by);
    else
      new.approved_at := null;
      new.approved_by := null;
    end if;
  end if;
  return new;
end $$;

-- ---- auth.users hook: invitations, pre-registered students, self-registration
--
-- Order of precedence (first match wins):
--   1. an open staff invitation for the e-mail      -> invited role (trusted)
--   2. an unclaimed pre-registered student record   -> student, linked on confirmation
--   3. self-registration metadata                   -> student or lecturer, PENDING
--   4. anything else                                -> rejected
--
-- raw_user_meta_data is supplied by whoever calls the sign-up API, so it is
-- treated as untrusted input: only 'student' and 'lecturer' are accepted as the
-- registration type, the role is fixed by this function (never read from the
-- metadata), every value is validated, and the result is always `pending`.
create or replace function public._meta_text(p_meta jsonb, p_key text, p_max integer) returns text
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p_meta -> p_key) = 'string'
     and char_length(btrim(p_meta ->> p_key)) between 1 and p_max
    then regexp_replace(btrim(p_meta ->> p_key), '\s+', ' ', 'g')
  end
$$;

create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inv      public.staff_invitations%rowtype;
  v_student  public.students%rowtype;
  v_meta     jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_kind     text  := public._meta_text(coalesce(new.raw_user_meta_data, '{}'::jsonb), 'registration_type', 20);
  v_name     text;
  v_personal text;
  v_number   text;
begin
  if new.email is null then
    raise exception 'sign-up is not permitted' using errcode = '42501';
  end if;

  -- Optional personal e-mail (any registration path). Invalid values are dropped, not trusted.
  v_personal := lower(public._meta_text(v_meta, 'personal_email', 320));
  if v_personal is not null and (v_personal !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_personal = lower(new.email)) then
    v_personal := null;
  end if;

  select * into v_inv from public.staff_invitations i
   where lower(i.email) = lower(new.email) and i.consumed_at is null for update;

  if found then
    -- 1. invitation (unchanged behaviour)
    insert into public.profiles (id, full_name, email, role)
    values (new.id, v_inv.full_name, new.email, v_inv.role);
    if v_inv.role in ('lecturer', 'main_lecturer') then
      insert into public.staff_details (profile_id, department_id, title)
      values (new.id, v_inv.department_id, v_inv.title)
      on conflict (profile_id) do update
        set department_id = excluded.department_id, title = excluded.title;
    end if;
    update public.staff_invitations set consumed_at = now(), consumed_by = new.id where id = v_inv.id;
  else
    if v_kind is null or v_kind = 'student' then
      select * into v_student from public.students s
       where s.school_email = lower(btrim(new.email)) and s.profile_id is null for update;
    end if;

    if v_student.id is not null then
      -- 2. pre-registered student (unchanged behaviour; linked once the e-mail is confirmed)
      insert into public.profiles (id, full_name, email, role)
      values (new.id, v_student.full_name, new.email, 'student');
    elsif v_kind in ('student', 'lecturer') then
      -- 3. open self-registration
      if not public._setting_bool('self_registration_enabled', true) then
        raise exception 'sign-up is not permitted' using errcode = '42501';
      end if;
      v_name := public._meta_text(v_meta, 'full_name', 200);
      if v_name is null then
        raise exception 'a full name is required' using errcode = '22023';
      end if;
      -- Optional registration / staff number. Same shape as students.registration_number.
      v_number := nullif(upper(regexp_replace(coalesce(public._meta_text(v_meta, 'identifier', 40), ''), '\s', '', 'g')), '');
      if v_number is not null and v_number !~ '^[A-Z0-9][A-Z0-9/._-]{1,39}$' then
        raise exception 'invalid registration or staff number' using errcode = '22023';
      end if;

      if v_kind = 'student' then
        insert into public.profiles (id, full_name, email, role)
        values (new.id, v_name, new.email, 'student');
        -- Linked immediately (it is this user's own record). is_approved_student()
        -- still requires a confirmed e-mail AND administrator approval.
        insert into public.students (profile_id, school_email, full_name, registration_number, approval_status)
        values (new.id, new.email, v_name, v_number, 'pending');
      else
        insert into public.profiles (id, full_name, email, role)
        values (new.id, v_name, new.email, 'lecturer');
        insert into public.staff_details (profile_id, approval_status)
        values (new.id, 'pending')
        on conflict (profile_id) do update set approval_status = 'pending';
      end if;

      insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
      values (new.id, 'registration.submitted', 'profiles', new.id, jsonb_build_object('kind', v_kind));
    else
      -- 4. not invited, not pre-registered, not a recognised registration
      raise exception 'sign-up is not permitted' using errcode = '42501';
    end if;
  end if;

  if v_personal is not null or (v_kind = 'lecturer' and v_number is not null and v_inv.id is null) then
    insert into public.registration_details (profile_id, personal_email, staff_number)
    values (new.id, v_personal, case when v_kind = 'lecturer' and v_inv.id is null then v_number end);
  end if;

  if new.email_confirmed_at is not null then
    perform public._link_student(new.id, new.email);
  end if;
  return new;
end $$;

-- ---- administrator review ---------------------------------------------------

-- Pending (or other state) student and lecturer accounts for the review screen.
-- SECURITY DEFINER because it reports whether the e-mail is verified
-- (auth.users), which no API role can read. Administrators only.
create or replace function public.list_registrations(
  p_status  public.approval_status default 'pending',
  p_kind    text    default null,
  p_query   text    default null,
  p_limit   integer default 50,
  p_offset  integer default 0
) returns table (
  profile_id           uuid,
  kind                 text,
  role                 public.user_role,
  full_name            text,
  email                text,
  personal_email       text,
  identifier           text,
  email_verified       boolean,
  is_active            boolean,
  approval_status      public.approval_status,
  level_id             uuid,
  department_id        uuid,
  created_at           timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q      text := nullif(btrim(coalesce(p_query, '')), '');
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_kind is not null and p_kind not in ('student', 'lecturer') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if v_q is not null then
    if char_length(v_q) > 100 then
      raise exception 'query too long' using errcode = '22023';
    end if;
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
  select x.* from (
    select p.id, 'student'::text, p.role, p.full_name, p.email, rd.personal_email, s.registration_number,
           u.email_confirmed_at is not null, p.is_active, s.approval_status, s.level_id, s.department_id, p.created_at
    from public.students s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
    left join public.registration_details rd on rd.profile_id = p.id
    where p.role = 'student'
    union all
    select p.id, 'lecturer'::text, p.role, p.full_name, p.email, rd.personal_email, rd.staff_number,
           u.email_confirmed_at is not null, p.is_active, sd.approval_status, null::uuid, sd.department_id, p.created_at
    from public.staff_details sd
    join public.profiles p on p.id = sd.profile_id
    join auth.users u on u.id = p.id
    left join public.registration_details rd on rd.profile_id = p.id
    where p.role in ('lecturer', 'main_lecturer')
  ) as x (profile_id, kind, role, full_name, email, personal_email, identifier, email_verified, is_active,
          approval_status, level_id, department_id, created_at)
  where (p_status is null or x.approval_status = p_status)
    and (p_kind is null or x.kind = p_kind)
    and (v_q is null or x.full_name ilike '%' || v_q || '%' escape '\'
                     or x.email ilike '%' || v_q || '%' escape '\'
                     or coalesce(x.identifier, '') ilike '%' || v_q || '%' escape '\')
  order by x.created_at desc, x.profile_id
  limit v_limit offset v_offset;
end $$;

-- Approve or reject a student or lecturer registration. Administrators only.
-- Approving a student requires a level and department (taken from the
-- arguments, or kept if the record already has them). Every decision is written
-- to audit_logs (in addition to the row-level audit triggers).
create or replace function public.review_registration(
  p_profile_id     uuid,
  p_decision       public.approval_status,
  p_level_id       uuid default null,
  p_department_id  uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin  uuid := auth.uid();
  v_role   public.user_role;
  v_old    public.approval_status;
  v_level  uuid;
  v_dept   uuid;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  if p_profile_id = v_admin then
    raise exception 'administrators cannot review their own account' using errcode = '42501';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_profile_id;
  if v_role is null then
    raise exception 'account not found' using errcode = 'P0002';
  end if;

  if p_level_id is not null
     and not exists (select 1 from public.academic_levels l where l.id = p_level_id and l.is_active) then
    raise exception 'level is not active' using errcode = '22023';
  end if;
  if p_department_id is not null
     and not exists (select 1 from public.departments d where d.id = p_department_id and d.is_active) then
    raise exception 'department is not active' using errcode = '22023';
  end if;

  if v_role = 'student' then
    select s.approval_status, coalesce(p_level_id, s.level_id), coalesce(p_department_id, s.department_id)
      into v_old, v_level, v_dept
      from public.students s where s.profile_id = p_profile_id for update;
    if not found then
      raise exception 'student record not found' using errcode = 'P0002';
    end if;
    if p_decision = 'approved' and (v_level is null or v_dept is null) then
      raise exception 'choose a level and department before approving' using errcode = '22023';
    end if;
    update public.students s
       set approval_status = p_decision, level_id = v_level, department_id = v_dept
     where s.profile_id = p_profile_id;
  elsif v_role in ('lecturer', 'main_lecturer') then
    insert into public.staff_details (profile_id) values (p_profile_id) on conflict (profile_id) do nothing;
    select sd.approval_status into v_old from public.staff_details sd where sd.profile_id = p_profile_id for update;
    update public.staff_details sd
       set approval_status = p_decision,
           department_id = coalesce(p_department_id, sd.department_id)
     where sd.profile_id = p_profile_id;
  else
    raise exception 'only student and lecturer registrations are reviewed' using errcode = '22023';
  end if;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_admin, 'registration.' || p_decision::text, 'profiles', p_profile_id,
          jsonb_build_object('kind', case when v_role = 'student' then 'student' else 'lecturer' end,
                             'from', v_old, 'to', p_decision));
end $$;

-- ---- profile pictures -------------------------------------------------------
-- Private bucket. The application validates the upload (signature, size,
-- decodable image) and RE-ENCODES it to a small WebP without metadata before
-- storing, so only image/webp is accepted here.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 524288, array['image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Owner (profile id) of an avatar object name, or NULL if the name is not "<uuid>/<uuid>".
create or replace function public.storage_avatar_owner(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

-- An active account (pending accounts included: a picture is not protected content).
create or replace function public._is_active_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active)
$$;

-- Readable by the owner and by anyone allowed to see that profile.
create or replace function public.storage_avatar_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.storage_avatar_owner(p_name) is not null
     and public._is_active_user()
     and (public.storage_avatar_owner(p_name) = auth.uid()
          or public.can_view_profile(public.storage_avatar_owner(p_name)))
$$;

create or replace function public.storage_avatar_writable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.storage_avatar_owner(p_name) = auth.uid() and public._is_active_user()
$$;

create policy avatars_select on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and public.storage_avatar_readable(name));
create policy avatars_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and public.storage_avatar_writable(name));
create policy avatars_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.storage_avatar_writable(name));

-- Points the caller's profile at an avatar they uploaded (or clears it with NULL).
-- Returns the previous object name so the caller can delete it.
create or replace function public.set_my_avatar(p_path text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_old text;
begin
  if v_uid is null or not public._is_active_user() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_path is not null then
    if public.storage_avatar_owner(p_path) is distinct from v_uid then
      raise exception 'invalid avatar path' using errcode = '22023';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = p_path) then
      raise exception 'avatar not uploaded' using errcode = 'P0002';
    end if;
  end if;
  select p.avatar_path into v_old from public.profiles p where p.id = v_uid for update;
  update public.profiles set avatar_path = p_path where id = v_uid;
  return case when v_old is distinct from p_path then v_old end;
end $$;

-- ---- privileges -------------------------------------------------------------
revoke all on public.registration_details from anon, authenticated;
grant select on public.registration_details to authenticated;

revoke all on function public.my_approval_status() from public, anon;
revoke all on function public._meta_text(jsonb, text, integer) from public, anon, authenticated;
revoke all on function public.list_registrations(public.approval_status, text, text, integer, integer) from public, anon;
revoke all on function public.review_registration(uuid, public.approval_status, uuid, uuid) from public, anon;
revoke all on function public.storage_avatar_owner(text) from public, anon;
revoke all on function public._is_active_user() from public, anon, authenticated;
revoke all on function public.storage_avatar_readable(text) from public, anon;
revoke all on function public.storage_avatar_writable(text) from public, anon;
revoke all on function public.set_my_avatar(text) from public, anon;

grant execute on function
  public.my_approval_status(),
  public.list_registrations(public.approval_status, text, text, integer, integer),
  public.review_registration(uuid, public.approval_status, uuid, uuid),
  public.storage_avatar_owner(text),
  public.storage_avatar_readable(text),
  public.storage_avatar_writable(text),
  public.set_my_avatar(text)
to authenticated;
-- _is_active_user() is called only from SECURITY DEFINER helpers (as their owner).
