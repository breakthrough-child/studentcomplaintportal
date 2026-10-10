-- =============================================================================
-- 0012  Sign-up without an e-mail confirmation link; admin overview counts
--
-- Context: the project is switching Supabase Auth's "Confirm email" OFF so a new
-- account can be used immediately. Supabase then "auto-confirms" every sign-up:
-- auth.users.email_confirmed_at is filled in at creation, so it no longer proves
-- that the person controls the mailbox.
--
-- Until now a sign-up whose e-mail matched an administrator's PRE-REGISTERED
-- student record was linked to that record (approval status included) once the
-- e-mail was confirmed. With auto-confirm, anyone could type a pre-registered
-- student's school e-mail and inherit their (possibly already approved) record.
-- This migration closes that:
--
--   * profiles.email_ownership_verified is TRUE only when the address was
--     confirmed by a link AFTER the account was created (invitation, confirm-
--     signup e-mail, or an administrator confirming it in the dashboard), i.e.
--     the on_auth_user_confirmed trigger fired. Auto-confirmed sign-ups stay FALSE.
--   * Linking a pre-registered record (trigger or claim_student_record) without
--     verified ownership resets an 'approved' record to 'pending', so an
--     administrator reviews it at /admin/registrations. Rejected / suspended
--     records keep their status. Nothing is ever approved by signing up.
--   * Self-registration (0011) is unchanged: always pending.
--
-- Approval and roles are untouched: no sign-up path grants a role beyond
-- student / lecturer, and none grants approval.
--
-- Also adds admin_overview_counts(): aggregate counts for the admin dashboard
-- (no complaint content, no identities), and makes bootstrap_first_admin work
-- when the chosen e-mail already has a (self-registered) profile.
-- =============================================================================

alter table public.profiles add column email_ownership_verified boolean not null default false;

-- Existing confirmed accounts were confirmed while "Confirm email" was required.
update public.profiles p set email_ownership_verified = true
  from auth.users u
 where u.id = p.id and u.email_confirmed_at is not null;

-- ---- linking pre-registered student records ---------------------------------
create or replace function public._link_student(p_user_id uuid, p_email text) returns void
language sql security definer set search_path = '' as $$
  update public.students s
     set profile_id = p_user_id,
         approval_status = case
           when s.approval_status = 'approved'
            and not coalesce((select p.email_ownership_verified from public.profiles p where p.id = p_user_id), false)
           then 'pending'::public.approval_status
           else s.approval_status end
   where s.profile_id is null
     and s.school_email = lower(btrim(p_email))
     and exists (select 1 from public.profiles p where p.id = p_user_id and p.role = 'student');
$$;

-- A confirmation that happens after creation is a link the user clicked (or an
-- administrator's deliberate confirmation): mailbox ownership is proven.
-- confirm_existing_unconfirmed_users() below sets scms.skip_mailbox_proof so a
-- bulk confirmation does not count as proof.
create or replace function public.handle_auth_user_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('scms.skip_mailbox_proof', true), '') <> 'on' then
    update public.profiles set email_ownership_verified = true
     where id = new.id and not email_ownership_verified;
  end if;
  perform public._link_student(new.id, new.email);
  return new;
end $$;

-- Same as 0003, with one change: without verified mailbox ownership an
-- 'approved' record is linked as 'pending'.
create or replace function public.claim_student_record(p_registration_number text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_reg   text := upper(btrim(coalesce(p_registration_number, '')));
  v_failures integer;
  v_id    uuid;
  v_verified boolean;
begin
  if v_uid is null then
    return false;
  end if;

  select count(*) into v_failures from public.audit_logs l
   where l.actor_profile_id = v_uid and l.action = 'student.claim_failed'
     and l.created_at > now() - interval '1 hour';
  if v_failures >= 5 then
    return false;
  end if;

  select u.email into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  select coalesce(p.email_ownership_verified, false) into v_verified from public.profiles p where p.id = v_uid;

  update public.students s
     set profile_id = v_uid,
         approval_status = case when s.approval_status = 'approved' and not coalesce(v_verified, false)
                                then 'pending'::public.approval_status else s.approval_status end
   where v_email is not null
     and s.registration_number = v_reg
     and s.school_email = lower(v_email)
     and (s.profile_id is null or s.profile_id = v_uid)
     and exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'student' and p.is_active)
  returning s.id into v_id;

  if v_id is null then
    insert into public.audit_logs (actor_profile_id, action, entity_type, metadata)
    values (v_uid, 'student.claim_failed', 'student', '{}'::jsonb);
    return false;
  end if;

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id)
  values (v_uid, 'student.claimed', 'student', v_id);
  return true;
end $$;

-- For switching "Confirm email" off: accounts created earlier that never
-- clicked their link cannot sign in (Supabase keeps requiring confirmation for
-- them). Run from the SQL editor to let them in WITHOUT treating it as proof of
-- mailbox ownership. Not callable through the API. Returns the number confirmed.
create or replace function public.confirm_existing_unconfirmed_users() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  perform set_config('scms.skip_mailbox_proof', 'on', true);
  update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
  get diagnostics v_count = row_count;
  perform set_config('scms.skip_mailbox_proof', '', true);
  return v_count;
end $$;

-- ---- review list: show verified ownership, not Supabase's auto-confirm flag --
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
           p.email_ownership_verified, p.is_active, s.approval_status, s.level_id, s.department_id, p.created_at
    from public.students s
    join public.profiles p on p.id = s.profile_id
    left join public.registration_details rd on rd.profile_id = p.id
    where p.role = 'student'
    union all
    select p.id, 'lecturer'::text, p.role, p.full_name, p.email, rd.personal_email, rd.staff_number,
           p.email_ownership_verified, p.is_active, sd.approval_status, null::uuid, sd.department_id, p.created_at
    from public.staff_details sd
    join public.profiles p on p.id = sd.profile_id
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

-- ---- admin dashboard: aggregate counts only ---------------------------------
-- Administrators have no complaint-content access (RLS), and this does not
-- change that: it returns numbers only, never a complaint, student or lecturer.
create or replace function public.admin_overview_counts()
returns table (metric text, total bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
  select 'students_' || s.approval_status::text, count(*)
    from public.students s join public.profiles p on p.id = s.profile_id
   group by s.approval_status
  union all
  select 'student_records_unlinked', count(*) from public.students s where s.profile_id is null
  union all
  select 'lecturers_' || coalesce(sd.approval_status, 'approved')::text, count(*)
    from public.profiles p left join public.staff_details sd on sd.profile_id = p.id
   where p.role in ('lecturer', 'main_lecturer') and p.is_active
   group by coalesce(sd.approval_status, 'approved')
  union all
  select 'main_lecturers', count(*) from public.profiles p where p.role = 'main_lecturer' and p.is_active
  union all
  select 'administrators', count(*) from public.profiles p where p.role = 'admin' and p.is_active
  union all
  select 'deactivated_accounts', count(*) from public.profiles p where not p.is_active
  union all
  select 'complaints_' || c.status::text, count(*) from public.complaints c group by c.status
  union all
  select 'complaints_total', count(*) from public.complaints;
end $$;

-- ---- bootstrap: also works when the e-mail already has a profile -------------
-- 0003 inserted a profile for an existing auth user, which fails if the person
-- already self-registered (0011). Still SQL-editor only; still refuses once an
-- administrator exists.
create or replace function public.bootstrap_first_admin(p_email text, p_full_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_name  text := btrim(coalesce(p_full_name, ''));
  v_user  uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or v_name = '' then
    raise exception 'a valid email and full name are required' using errcode = '22023';
  end if;
  if exists (select 1 from public.profiles where role = 'admin')
     or exists (select 1 from public.staff_invitations where role = 'admin' and consumed_at is null) then
    raise exception 'an administrator already exists or has been invited' using errcode = '55000';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is not null then
    insert into public.profiles (id, full_name, email, role) values (v_user, v_name, v_email, 'admin')
    on conflict (id) do update set role = 'admin', is_active = true, full_name = excluded.full_name;
    insert into public.audit_logs (action, entity_type, entity_id, metadata)
    values ('admin.bootstrapped', 'profiles', v_user, '{"source":"sql_editor"}'::jsonb);
    return 'existing account promoted to administrator; sign in with its password';
  end if;

  insert into public.staff_invitations (email, full_name, role) values (v_email, v_name, 'admin');
  return 'admin invitation created: now create the user ' || v_email
      || ' in Authentication > Users (Add user > Create new user, or Invite user)';
end $$;

-- ---- privileges -------------------------------------------------------------
revoke all on function public.confirm_existing_unconfirmed_users() from public, anon, authenticated, service_role;
revoke all on function public.admin_overview_counts() from public, anon;
grant execute on function public.admin_overview_counts() to authenticated;
-- CREATE OR REPLACE keeps the existing grants of the other functions; restate the important ones.
revoke all on function public.bootstrap_first_admin(text, text) from public, anon, authenticated, service_role;
revoke all on function public._link_student(uuid, text) from public, anon, authenticated;
