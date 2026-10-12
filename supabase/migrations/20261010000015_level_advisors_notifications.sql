-- =============================================================================
-- 0015  Level advisors, and e-mail notifications to lecturers for new complaints
--
-- LEVEL ADVISORS (visibility only)
-- * One lecturer per (department, level), e.g. "CSC · 400 Level". Appointed by
--   administrators. A lecturer may advise several levels.
-- * Being an advisor grants NO extra complaint access: students see their level
--   advisor and can address a complaint to them in one click; the advisor then
--   sees it exactly like any lecturer who was chosen as the recipient.
-- * my_level_advisor(): an approved student's advisor (name / title only).
-- * search_lecturers(): results also say which levels a lecturer advises, and the
--   department / level filters match advisors.
--
-- E-MAIL NOTIFICATIONS (outbox)
-- * notification_outbox rows are created IN THE DATABASE, in the same transaction
--   as the event, so no notification is lost if the web request dies:
--     - complaint_access granted to a lecturer (reason target / assigned)
--         -> 'complaint_received' for that lecturer
--     - a sensitive complaint is submitted (requires_triage)
--         -> 'triage_needed' for each main lecturer who can triage it
--           (active, approved, institution-wide assignment)
-- * The application server sends them over SMTP with the service role:
--   claim_notifications() hands out a batch (SKIP LOCKED, so two senders never
--   send the same row) and complete_notification() records the result. Both are
--   callable by service_role only. Failed sends are retried (max 5 attempts).
-- * E-mails never contain complaint text, titles or student identities: only the
--   reference number and a sign-in link. Lecturers can switch them off.
-- =============================================================================

-- ---- level advisors ---------------------------------------------------------
create table public.level_advisors (
  department_id        uuid not null references public.departments (id) on delete restrict,
  level_id             uuid not null references public.academic_levels (id) on delete restrict,
  lecturer_profile_id  uuid not null references public.profiles (id) on delete cascade,
  assigned_by          uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  primary key (department_id, level_id)
);
create index level_advisors_lecturer_idx on public.level_advisors (lecturer_profile_id);

create or replace function public.guard_level_advisor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.profiles p
    left join public.staff_details sd on sd.profile_id = p.id
    where p.id = new.lecturer_profile_id and p.is_active
      and p.role in ('lecturer', 'main_lecturer')
      and coalesce(sd.approval_status, 'approved') = 'approved') then
    raise exception 'a level advisor must be an active, approved lecturer' using errcode = '22023';
  end if;
  if not exists (select 1 from public.departments d where d.id = new.department_id and d.is_active)
     or not exists (select 1 from public.academic_levels l where l.id = new.level_id and l.is_active) then
    raise exception 'department and level must be active' using errcode = '22023';
  end if;
  if auth.uid() is not null then
    new.assigned_by := auth.uid();
  end if;
  return new;
end $$;
create trigger level_advisors_guard before insert or update on public.level_advisors
  for each row execute function public.guard_level_advisor();
create trigger audit_level_advisors after insert or update or delete on public.level_advisors
  for each row execute function public.audit_row_change();

alter table public.level_advisors enable row level security;
create policy level_advisors_select on public.level_advisors
  for select to authenticated using (public.current_user_role() is not null);
create policy level_advisors_admin_write on public.level_advisors
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- "CSC · 400 Level" (department code when there is one, otherwise its name).
create or replace function public._advisor_label(p_department_id uuid, p_level_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(d.code), ''), d.name) || ' · ' || l.name
  from public.departments d, public.academic_levels l
  where d.id = p_department_id and l.id = p_level_id
$$;

-- The calling student's level advisor, if one is appointed and can currently receive complaints.
create or replace function public.my_level_advisor()
returns table (profile_id uuid, full_name text, title text, advises text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, sd.title, public._advisor_label(a.department_id, a.level_id)
  from public.students s
  join public.level_advisors a on a.department_id = s.department_id and a.level_id = s.level_id
  join public.profiles p on p.id = a.lecturer_profile_id
  join public.staff_details sd on sd.profile_id = p.id
  where s.profile_id = auth.uid()
    and public.is_approved_student()
    and public._is_eligible_lecturer(p.id)
$$;

-- Return type gains `advises`: drop and recreate (grants re-applied below). Otherwise as in 0014.
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
  courses               text[],
  advises               text[]
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
    v_code := regexp_replace(v_q, '\s', '', 'g');
  end if;

  return query
  select p.id, p.full_name, sd.title, d.id, d.name,
         coalesce((
           select array_agg(x.code order by x.code)
           from (select c.code from public.lecturer_courses lc
                   join public.courses c on c.id = lc.course_id and c.is_active
                  where lc.lecturer_profile_id = p.id
                  order by c.code limit 8) x
         ), '{}'::text[]),
         coalesce((
           select array_agg(public._advisor_label(a.department_id, a.level_id) order by 1)
           from public.level_advisors a where a.lecturer_profile_id = p.id
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
                    where a.lecturer_profile_id = p.id and a.is_active and a.department_id = p_department_id)
         or exists (select 1 from public.lecturer_courses lc
                      join public.courses c on c.id = lc.course_id and c.is_active
                     where lc.lecturer_profile_id = p.id and c.department_id = p_department_id)
         or exists (select 1 from public.level_advisors la
                    where la.lecturer_profile_id = p.id and la.department_id = p_department_id))
    and (p_level_id is null
         or exists (select 1 from public.lecturer_assignments a
                    where a.lecturer_profile_id = p.id and a.is_active and a.level_id = p_level_id)
         or exists (select 1 from public.lecturer_courses lc
                      join public.courses c on c.id = lc.course_id and c.is_active
                     where lc.lecturer_profile_id = p.id and c.level_id = p_level_id)
         or exists (select 1 from public.level_advisors la
                    where la.lecturer_profile_id = p.id and la.level_id = p_level_id))
  order by p.full_name, p.id
  limit v_limit offset v_offset;
end $$;

-- ---- notification preference -------------------------------------------------
alter table public.staff_details add column email_notifications boolean not null default true;
grant update (email_notifications) on public.staff_details to authenticated;  -- RLS: own row / admins

-- ---- outbox -----------------------------------------------------------------
create table public.notification_outbox (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null check (kind in ('complaint_received', 'triage_needed')),
  complaint_id          uuid not null references public.complaints (id) on delete cascade,
  recipient_profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_at            timestamptz not null default now(),
  attempts              integer not null default 0,
  locked_until          timestamptz,
  sent_at               timestamptz,
  skipped_reason        text,
  last_error            text check (last_error is null or char_length(last_error) <= 500),
  constraint notification_outbox_once unique (kind, complaint_id, recipient_profile_id)
);
create index notification_outbox_pending_idx on public.notification_outbox (created_at)
  where sent_at is null and skipped_reason is null;

-- No API role can read or write the outbox; only the service role (BYPASSRLS) and
-- the SECURITY DEFINER functions below touch it.
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated;

create or replace function public.enqueue_access_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.is_active and new.reason in ('target', 'assigned') then
    insert into public.notification_outbox (kind, complaint_id, recipient_profile_id)
    values ('complaint_received', new.complaint_id, new.profile_id)
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger complaint_access_notify after insert or update of is_active, reason on public.complaint_access
  for each row execute function public.enqueue_access_notification();

create or replace function public.enqueue_triage_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.requires_triage then
    insert into public.notification_outbox (kind, complaint_id, recipient_profile_id)
    select distinct 'triage_needed', new.id, p.id
    from public.profiles p
    join public.lecturer_assignments a on a.lecturer_profile_id = p.id and a.is_active and a.scope_type = 'institution'
    left join public.staff_details sd on sd.profile_id = p.id
    where p.role = 'main_lecturer' and p.is_active and coalesce(sd.approval_status, 'approved') = 'approved'
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger complaints_notify_triage after insert on public.complaints
  for each row execute function public.enqueue_triage_notification();

-- Hands out up to p_limit due notifications to ONE sender (rows are locked for
-- 5 minutes; a crashed sender's rows become due again). Rows whose recipient
-- opted out, was deactivated, or has no e-mail are marked skipped instead.
create or replace function public.claim_notifications(p_limit integer default 20)
returns table (id uuid, kind text, complaint_id uuid, reference_number text,
               recipient_email text, recipient_name text, attempts integer)
language plpgsql security definer set search_path = '' as $$
begin
  update public.notification_outbox o
     set skipped_reason = case when not p.is_active then 'recipient deactivated'
                               else 'recipient turned e-mail notifications off' end
    from public.profiles p
    left join public.staff_details sd on sd.profile_id = p.id
   where p.id = o.recipient_profile_id
     and o.sent_at is null and o.skipped_reason is null
     and (not p.is_active or not coalesce(sd.email_notifications, true));

  return query
  with due as (
    select o.id from public.notification_outbox o
     where o.sent_at is null and o.skipped_reason is null and o.attempts < 5
       and (o.locked_until is null or o.locked_until < now())
     order by o.created_at
     limit least(greatest(coalesce(p_limit, 20), 1), 100)
     for update skip locked
  ), claimed as (
    update public.notification_outbox o
       set attempts = o.attempts + 1, locked_until = now() + interval '5 minutes'
      from due where o.id = due.id
    returning o.id, o.kind, o.complaint_id, o.recipient_profile_id, o.attempts
  )
  select c.id, c.kind, c.complaint_id, cm.reference_number, p.email, p.full_name, c.attempts
  from claimed c
  join public.complaints cm on cm.id = c.complaint_id
  join public.profiles p on p.id = c.recipient_profile_id;
end $$;

create or replace function public.complete_notification(p_id uuid, p_ok boolean, p_error text default null)
returns void
language sql security definer set search_path = '' as $$
  update public.notification_outbox
     set sent_at = case when p_ok then now() end,
         locked_until = null,
         last_error = case when p_ok then null else left(coalesce(p_error, 'send failed'), 500) end
   where id = p_id and sent_at is null;
$$;

-- ---- privileges -------------------------------------------------------------
revoke all on public.level_advisors from anon, authenticated;
grant select on public.level_advisors to authenticated;
grant insert, update, delete on public.level_advisors to authenticated;  -- RLS: admins only

revoke all on function public.guard_level_advisor() from public, anon, authenticated;
revoke all on function public._advisor_label(uuid, uuid) from public, anon, authenticated;
revoke all on function public.my_level_advisor() from public, anon;
grant execute on function public.my_level_advisor() to authenticated;
revoke all on function public.search_lecturers(text, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.search_lecturers(text, uuid, uuid, integer, integer) to authenticated;

revoke all on function public.enqueue_access_notification() from public, anon, authenticated;
revoke all on function public.enqueue_triage_notification() from public, anon, authenticated;
revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.complete_notification(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function public.complete_notification(uuid, boolean, text) to service_role;
