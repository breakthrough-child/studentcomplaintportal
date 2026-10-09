-- =============================================================================
-- 0002  Helper functions, guard triggers, auth hooks, audit trigger
--
-- Every function sets `search_path = ''` and schema-qualifies all objects.
-- SECURITY DEFINER is used only where RLS would otherwise recurse or where a
-- narrow, validated capability is needed. EXECUTE grants are handled in 0007.
-- =============================================================================

-- ---- generic triggers -------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_set_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger departments_set_updated_at   before update on public.departments   for each row execute function public.set_updated_at();
create trigger students_set_updated_at      before update on public.students      for each row execute function public.set_updated_at();
create trigger staff_details_set_updated_at before update on public.staff_details for each row execute function public.set_updated_at();

-- Append-only tables: no UPDATE / DELETE / TRUNCATE, for any role (including
-- the table owner). Maintenance that must bypass this has to disable the
-- trigger explicitly, which is itself an auditable DDL action.
create or replace function public.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '55000';
end $$;

create trigger complaint_messages_append_only       before update or delete on public.complaint_messages       for each row       execute function public.forbid_mutation();
create trigger complaint_status_history_append_only before update or delete on public.complaint_status_history for each row       execute function public.forbid_mutation();
create trigger complaint_events_append_only         before update or delete on public.complaint_events         for each row       execute function public.forbid_mutation();
create trigger audit_logs_append_only               before update or delete on public.audit_logs               for each row       execute function public.forbid_mutation();
create trigger complaint_messages_no_truncate       before truncate on public.complaint_messages       for each statement execute function public.forbid_mutation();
create trigger complaint_status_history_no_truncate before truncate on public.complaint_status_history for each statement execute function public.forbid_mutation();
create trigger complaint_events_no_truncate         before truncate on public.complaint_events         for each statement execute function public.forbid_mutation();
create trigger audit_logs_no_truncate               before truncate on public.audit_logs               for each statement execute function public.forbid_mutation();

-- ---- settings accessors (internal) -----------------------------------------
create or replace function public._setting_int(p_key text, p_default integer) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric::integer end
       from public.app_settings s where s.key = p_key),
    p_default)
$$;

create or replace function public._setting_bigint(p_key text, p_default bigint) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'number' then (s.value #>> '{}')::numeric::bigint end
       from public.app_settings s where s.key = p_key),
    p_default)
$$;

create or replace function public._setting_bool(p_key text, p_default boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'boolean' then (s.value #>> '{}')::boolean end
       from public.app_settings s where s.key = p_key),
    p_default)
$$;

create or replace function public._setting_json(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select s.value from public.app_settings s where s.key = p_key
$$;

-- ---- identity helpers -------------------------------------------------------
-- Role of the signed-in user; NULL when signed out or deactivated, so every
-- helper below fails closed for deactivated accounts even with a valid JWT.
create or replace function public.current_user_role() returns public.user_role
language sql stable security definer set search_path = '' as $$
  select p.role from public.profiles p where p.id = auth.uid() and p.is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create or replace function public.is_main_lecturer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() = 'main_lecturer', false)
$$;

create or replace function public.is_lecturer_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.current_user_role() in ('lecturer', 'main_lecturer'), false)
$$;

-- Approved + active + e-mail-verified + linked student.
create or replace function public.is_approved_student() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.students s
    join public.profiles p on p.id = s.profile_id
    join auth.users u on u.id = p.id
    where s.profile_id = auth.uid()
      and s.approval_status = 'approved'
      and p.is_active
      and p.role = 'student'
      and u.email_confirmed_at is not null
  )
$$;

-- A lecturer who may be chosen as a complaint recipient.
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
  )
$$;

-- ---- complaint authorization ------------------------------------------------
-- Does the signed-in staff member's ACTIVE assignment cover this scope?
--   * level / department / department_level scopes match the complaint's
--     snapshot level and department and never cover sensitive complaints.
--   * institution scope covers everything non-sensitive; sensitive complaints
--     only for the main_lecturer role.
create or replace function public.staff_scope_allows(
  p_level_id uuid, p_department_id uuid, p_is_sensitive boolean
) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.lecturer_assignments a
    join public.profiles p on p.id = a.lecturer_profile_id
    where a.lecturer_profile_id = auth.uid()
      and a.is_active
      and p.is_active
      and p.role in ('lecturer', 'main_lecturer', 'admin')
      and (
        (a.scope_type = 'institution' and (not p_is_sensitive or p.role = 'main_lecturer'))
        or (not p_is_sensitive and (
              (a.scope_type = 'level'            and a.level_id = p_level_id)
           or (a.scope_type = 'department'       and a.department_id = p_department_id)
           or (a.scope_type = 'department_level' and a.level_id = p_level_id
                                                 and a.department_id = p_department_id)))
      )
  )
$$;

-- Row-level access decision, used directly by the complaints SELECT policy.
create or replace function public.can_access_complaint(
  p_complaint_id uuid, p_student_id uuid, p_level_id uuid,
  p_department_id uuid, p_is_sensitive boolean
) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when r.role = 'student' then exists (
        select 1 from public.students s
        where s.id = p_student_id
          and s.profile_id = auth.uid()
          and s.approval_status = 'approved')
      when r.role in ('lecturer', 'main_lecturer', 'admin') then
        exists (select 1 from public.complaint_access ca
                where ca.complaint_id = p_complaint_id
                  and ca.profile_id = auth.uid()
                  and ca.is_active)
        or public.staff_scope_allows(p_level_id, p_department_id, p_is_sensitive)
      else false
    end
    from (select public.current_user_role() as role) r
  ), false)
$$;

create or replace function public.can_access_complaint_id(p_complaint_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select public.can_access_complaint(c.id, c.student_id, c.level_id, c.department_id, c.is_sensitive)
    from public.complaints c where c.id = p_complaint_id
  ), false)
$$;

-- Lecturers / main lecturers who can access a complaint may act on it.
-- Admins can read content only if explicitly granted, and can never act on it.
create or replace function public.can_manage_complaint(p_complaint_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_lecturer_staff() and public.can_access_complaint_id(p_complaint_id)
$$;

-- Who may post messages / upload evidence.
create or replace function public.can_participate_complaint(p_complaint_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
      when r.role = 'student' then public.is_approved_student()
        and exists (select 1 from public.students s
                    where s.id = c.student_id and s.profile_id = auth.uid())
      when r.role in ('lecturer', 'main_lecturer') then
        public.can_access_complaint(c.id, c.student_id, c.level_id, c.department_id, c.is_sensitive)
      else false
    end
    from public.complaints c
    cross join (select public.current_user_role() as role) r
    where c.id = p_complaint_id
  ), false)
$$;

-- Profiles visible to the signed-in user: self, admins see all, otherwise only
-- people who take part in a complaint the user may access.
create or replace function public.can_view_profile(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_user_role() is not null
    and (
      p_profile_id = auth.uid()
      or public.is_admin()
      or exists (
        select 1 from public.complaints c
        where public.can_access_complaint(c.id, c.student_id, c.level_id, c.department_id, c.is_sensitive)
          and (
               c.target_lecturer_profile_id   = p_profile_id
            or c.assigned_lecturer_profile_id = p_profile_id
            or exists (select 1 from public.students s
                       where s.id = c.student_id and s.profile_id = p_profile_id)
            or exists (select 1 from public.complaint_messages m
                       where m.complaint_id = c.id and m.author_profile_id = p_profile_id)
            or exists (select 1 from public.complaint_access ca
                       where ca.complaint_id = c.id and ca.profile_id = p_profile_id)
          )
      )
    )
$$;

-- Student rows visible to staff: only students with a complaint the staff member can access.
create or replace function public.can_view_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.current_user_role() is not null
    and exists (
      select 1 from public.complaints c
      where c.student_id = p_student_id
        and public.can_access_complaint(c.id, c.student_id, c.level_id, c.department_id, c.is_sensitive)
    )
$$;

-- ---- status machine (single source of truth) --------------------------------
create or replace function public.is_valid_status_transition(
  p_old public.complaint_status, p_new public.complaint_status
) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(case p_old
    when 'submitted'        then p_new in ('under_review', 'awaiting_student', 'closed')
    when 'under_review'     then p_new in ('awaiting_student', 'resolved', 'closed')
    when 'awaiting_student' then p_new in ('under_review', 'resolved', 'closed')
    when 'resolved'         then p_new in ('closed', 'reopened')
    when 'closed'           then p_new in ('reopened')
    when 'reopened'         then p_new in ('under_review', 'awaiting_student', 'resolved', 'closed')
  end, false)
$$;

-- Internal: apply a status change, history row, timestamps and timeline event.
-- Callers are responsible for authorization.
create or replace function public._apply_status_change(
  p_complaint_id uuid, p_new public.complaint_status, p_actor uuid, p_reason text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.complaint_status;
  v_first boolean;
begin
  select c.status, c.first_reviewed_at is null
    into v_old, v_first
    from public.complaints c where c.id = p_complaint_id for update;
  if not found then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  if not public.is_valid_status_transition(v_old, p_new) then
    raise exception 'invalid status transition: % -> %', v_old, p_new using errcode = '22023';
  end if;

  update public.complaints c set
    status            = p_new,
    last_activity_at  = now(),
    first_reviewed_at = case when p_new = 'under_review' and c.first_reviewed_at is null
                             then now() else c.first_reviewed_at end,
    resolved_at       = case when p_new = 'resolved' then now()
                             when p_new = 'reopened' then null else c.resolved_at end,
    closed_at         = case when p_new = 'closed' then now()
                             when p_new = 'reopened' then null else c.closed_at end,
    updated_at        = now()
  where c.id = p_complaint_id;

  insert into public.complaint_status_history (complaint_id, actor_profile_id, old_status, new_status, reason)
  values (p_complaint_id, p_actor, v_old, p_new, nullif(btrim(coalesce(p_reason, '')), ''));

  insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
  values (p_complaint_id, p_actor, 'status_changed',
          jsonb_build_object('from', v_old, 'to', p_new));

  if p_new = 'under_review' and v_first then
    insert into public.complaint_events (complaint_id, actor_profile_id, event_type)
    values (p_complaint_id, p_actor, 'first_reviewed');
  end if;
end $$;

-- ---- row guards -------------------------------------------------------------
-- Complaints are never edited by users; identity/content columns are immutable
-- for everyone, and sensitivity can only be raised (escalation), never lowered.
create or replace function public.guard_complaint_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id                         is distinct from old.id
  or new.reference_number           is distinct from old.reference_number
  or new.student_id                 is distinct from old.student_id
  or new.title                      is distinct from old.title
  or new.description                is distinct from old.description
  or new.category_id                is distinct from old.category_id
  or new.level_id                   is distinct from old.level_id
  or new.department_id              is distinct from old.department_id
  or new.target_lecturer_profile_id is distinct from old.target_lecturer_profile_id
  or new.created_at                 is distinct from old.created_at then
    raise exception 'complaint identity and content are immutable' using errcode = '42501';
  end if;
  if old.is_sensitive and not new.is_sensitive then
    raise exception 'complaint sensitivity cannot be lowered' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger complaints_guard_update before update on public.complaints
  for each row execute function public.guard_complaint_update();

create or replace function public.set_complaint_reference() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.reference_number := 'CMP-' || to_char(now() at time zone 'utc', 'YYYY') || '-'
                          || lpad(nextval('public.complaint_reference_seq')::text, 6, '0');
  return new;
end $$;

create trigger complaints_set_reference before insert on public.complaints
  for each row execute function public.set_complaint_reference();

-- profiles: role / activation are admin-only, never self-service; e-mail is
-- immutable for end users; the last active admin cannot be removed.
create or replace function public.guard_profile_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_trusted boolean := auth.uid() is null;  -- migrations, SQL editor, service role
begin
  if new.id <> old.id then
    raise exception 'profile id is immutable' using errcode = '42501';
  end if;
  if not v_trusted then
    if new.email is distinct from old.email then
      raise exception 'email can only be changed through the trusted administrative workflow'
        using errcode = '42501';
    end if;
    if new.role is distinct from old.role or new.is_active is distinct from old.is_active then
      if not public.is_admin() then
        raise exception 'only administrators can change roles or activation' using errcode = '42501';
      end if;
      if old.id = auth.uid() then
        raise exception 'administrators cannot change their own role or activation'
          using errcode = '42501';
      end if;
    end if;
  end if;
  if old.role = 'admin' and old.is_active
     and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.profiles p
                     where p.role = 'admin' and p.is_active and p.id <> old.id) then
    raise exception 'cannot remove the last active administrator' using errcode = '55000';
  end if;
  return new;
end $$;

create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profile_update();

-- Staff get a staff_details row when they become lecturers.
create or replace function public.ensure_staff_details() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role in ('lecturer', 'main_lecturer') then
    insert into public.staff_details (profile_id) values (new.id) on conflict (profile_id) do nothing;
  end if;
  return new;
end $$;

create trigger profiles_ensure_staff_details after update of role on public.profiles
  for each row when (old.role is distinct from new.role) execute function public.ensure_staff_details();

-- staff_details: lecturers may toggle accepts_complaints / title on their own
-- row; the home department is admin-only.
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
  return new;
end $$;

create trigger staff_details_guard_update before update on public.staff_details
  for each row execute function public.guard_staff_details_update();

-- lecturer_assignments: the assignee must be staff, nobody can grant themselves
-- access, and the assignee cannot be swapped after creation.
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

create trigger lecturer_assignments_guard before insert or update on public.lecturer_assignments
  for each row execute function public.guard_assignment();

-- staff_invitations: record who created it; normalise e-mail.
create or replace function public.prepare_staff_invitation() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  new.consumed_at := null;
  new.consumed_by := null;
  return new;
end $$;

create trigger staff_invitations_prepare before insert on public.staff_invitations
  for each row execute function public.prepare_staff_invitation();

-- students: normalise identifiers, enforce e-mail domain allow-list, stamp approvals.
create or replace function public.prepare_student() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_domains jsonb := public._setting_json('allowed_student_email_domains');
  v_domain  text;
begin
  new.school_email        := lower(btrim(new.school_email));
  new.registration_number := upper(btrim(new.registration_number));

  if tg_op = 'UPDATE' and new.profile_id is distinct from old.profile_id
     and old.profile_id is not null and auth.uid() is not null then
    raise exception 'a linked student record cannot be re-linked' using errcode = '42501';
  end if;

  if (tg_op = 'INSERT' or new.school_email is distinct from old.school_email)
     and v_domains is not null and jsonb_typeof(v_domains) = 'array'
     and jsonb_array_length(v_domains) > 0 then
    v_domain := split_part(new.school_email, '@', 2);
    if not exists (select 1 from jsonb_array_elements_text(v_domains) d where lower(d) = v_domain) then
      raise exception 'school email domain is not allowed' using errcode = '22023';
    end if;
  end if;

  if new.approval_status = 'approved'
     and (tg_op = 'INSERT' or old.approval_status is distinct from 'approved') then
    new.approved_at := now();
    new.approved_by := coalesce(auth.uid(), new.approved_by);
  elsif new.approval_status <> 'approved' and tg_op = 'UPDATE' then
    new.approved_at := null;
    new.approved_by := null;
  end if;
  return new;
end $$;

create trigger students_prepare before insert or update on public.students
  for each row execute function public.prepare_student();

create or replace function public.touch_app_setting() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end $$;

create trigger app_settings_touch before update on public.app_settings
  for each row execute function public.touch_app_setting();

-- ---- auth.users hooks -------------------------------------------------------
-- Link a verified auth user to its pre-registered student record. Matching is by
-- verified e-mail only: a registration number is never accepted as proof of identity.
create or replace function public._link_student(p_user_id uuid, p_email text) returns void
language sql security definer set search_path = '' as $$
  update public.students s
     set profile_id = p_user_id
   where s.profile_id is null
     and s.school_email = lower(btrim(p_email))
     and exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'student');
$$;

-- Only invited staff or pre-registered students may ever get an account.
-- Everything else is rejected here, even if public sign-up is left enabled.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_inv     public.staff_invitations%rowtype;
  v_student public.students%rowtype;
begin
  if new.email is null then
    raise exception 'sign-up is not permitted' using errcode = '42501';
  end if;

  select * into v_inv from public.staff_invitations i
   where lower(i.email) = lower(new.email) and i.consumed_at is null for update;

  if found then
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
    select * into v_student from public.students s
     where s.school_email = lower(btrim(new.email)) and s.profile_id is null for update;
    if not found then
      raise exception 'sign-up is not permitted' using errcode = '42501';
    end if;
    insert into public.profiles (id, full_name, email, role)
    values (new.id, v_student.full_name, new.email, 'student');
  end if;

  if new.email_confirmed_at is not null then
    perform public._link_student(new.id, new.email);
  end if;
  return new;
end $$;

create or replace function public.handle_auth_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._link_student(new.id, new.email);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_auth_user();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.handle_auth_user_confirmed();

-- ---- audit trigger (admin / configuration changes) --------------------------
-- Stores column names and old/new values for non-personal columns only. Personal
-- columns (names, e-mails, registration numbers) are recorded by name, never value.
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_private  constant text[] := array['full_name', 'email', 'school_email', 'registration_number'];
  v_ignored  constant text[] := array['created_at', 'updated_at', 'updated_by'];
  v_old      jsonb;
  v_new      jsonb;
  v_row      jsonb;
  v_changed  jsonb := '{}'::jsonb;
  v_private_changed text[] := '{}';
  v_key      text;
  v_id       uuid;
  v_meta     jsonb;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_row := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_row := v_old;
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new); v_row := v_new;
  end if;

  v_id := coalesce(nullif(v_row ->> 'id', ''), nullif(v_row ->> 'profile_id', ''))::uuid;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any (v_ignored);
      if v_new -> v_key is distinct from v_old -> v_key then
        if v_key = any (v_private) then
          v_private_changed := v_private_changed || v_key;
        else
          v_changed := v_changed || jsonb_build_object(
            v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
        end if;
      end if;
    end loop;
    if v_changed = '{}'::jsonb and cardinality(v_private_changed) = 0 then
      return null;  -- nothing meaningful changed
    end if;
    v_meta := jsonb_build_object('op', tg_op, 'changed', v_changed,
                                 'changed_private_columns', to_jsonb(v_private_changed));
  else
    v_meta := jsonb_build_object('op', tg_op,
                                 'values', v_row - v_private - v_ignored);
  end if;

  if tg_table_name = 'app_settings' then
    v_meta := v_meta || jsonb_build_object('key', v_row ->> 'key');
  end if;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), tg_table_name || '.' || lower(tg_op), tg_table_name, v_id, v_meta);
  return null;
end $$;

create trigger audit_profiles              after insert or update or delete on public.profiles              for each row execute function public.audit_row_change();
create trigger audit_students              after insert or update or delete on public.students              for each row execute function public.audit_row_change();
create trigger audit_lecturer_assignments  after insert or update or delete on public.lecturer_assignments  for each row execute function public.audit_row_change();
create trigger audit_departments           after insert or update or delete on public.departments           for each row execute function public.audit_row_change();
create trigger audit_academic_levels       after insert or update or delete on public.academic_levels       for each row execute function public.audit_row_change();
create trigger audit_complaint_categories  after insert or update or delete on public.complaint_categories  for each row execute function public.audit_row_change();
create trigger audit_app_settings          after insert or update or delete on public.app_settings          for each row execute function public.audit_row_change();
create trigger audit_staff_details         after insert or update or delete on public.staff_details         for each row execute function public.audit_row_change();
create trigger audit_staff_invitations     after insert or update or delete on public.staff_invitations     for each row execute function public.audit_row_change();
