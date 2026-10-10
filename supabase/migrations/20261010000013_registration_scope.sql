-- =============================================================================
-- 0013  Students choose their level and department, lecturers their home
--       department, at sign-up
--
-- * registration_options(): the ONE function anonymous visitors may call. It
--   returns the ids and names of ACTIVE academic levels and departments, which
--   the sign-up form needs before anyone is signed in. Nothing else (no
--   people, no complaints, no inactive rows) is exposed. Reference tables stay
--   unreadable for `anon`.
-- * handle_new_auth_user: a self-registering STUDENT must supply level_id and
--   department_id, a self-registering LECTURER must supply department_id. Both
--   are validated (well-formed uuid, row exists, row active); anything else
--   rejects the sign-up (the auth user is rolled back with it). The values are
--   the applicant's claim only: the account is still PENDING, and an
--   administrator reviews (and may change) them when approving.
-- * Invitations and pre-registered student records are unchanged: their level /
--   department come from the administrator, never from sign-up metadata.
-- =============================================================================

create or replace function public.registration_options()
returns table (kind text, id uuid, name text, sort_key integer)
language sql stable security definer set search_path = '' as $$
  select 'level'::text, l.id, l.name, l.level_number
    from public.academic_levels l where l.is_active
  union all
  select 'department'::text, d.id, d.name, 0
    from public.departments d where d.is_active
  order by 1, 4, 3
$$;

-- uuid from sign-up metadata, or NULL if missing / not a uuid string.
create or replace function public._meta_uuid(p_meta jsonb, p_key text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(p_meta -> p_key) = 'string'
     and (p_meta ->> p_key) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then (p_meta ->> p_key)::uuid
  end
$$;

-- Same as 0011, plus the level / department handling in the self-registration branch.
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
  v_level    uuid;
  v_dept     uuid;
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
      -- 2. pre-registered student (unchanged; level/department come from the administrator's record)
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
      v_number := nullif(upper(regexp_replace(coalesce(public._meta_text(v_meta, 'identifier', 40), ''), '\s', '', 'g')), '');
      if v_number is not null and v_number !~ '^[A-Z0-9][A-Z0-9/._-]{1,39}$' then
        raise exception 'invalid registration or staff number' using errcode = '22023';
      end if;

      -- Department: required for both; level: required for students. Must exist and be active.
      v_dept := public._meta_uuid(v_meta, 'department_id');
      if v_dept is null or not exists (select 1 from public.departments d where d.id = v_dept and d.is_active) then
        raise exception 'choose a valid department' using errcode = '22023';
      end if;
      if v_kind = 'student' then
        v_level := public._meta_uuid(v_meta, 'level_id');
        if v_level is null or not exists (select 1 from public.academic_levels l where l.id = v_level and l.is_active) then
          raise exception 'choose a valid level' using errcode = '22023';
        end if;
      end if;

      if v_kind = 'student' then
        insert into public.profiles (id, full_name, email, role)
        values (new.id, v_name, new.email, 'student');
        -- Linked immediately (it is this user's own record) and PENDING. The level and department are
        -- what the applicant claimed; an administrator confirms or corrects them on approval.
        insert into public.students (profile_id, school_email, full_name, registration_number, level_id, department_id, approval_status)
        values (new.id, new.email, v_name, v_number, v_level, v_dept, 'pending');
      else
        insert into public.profiles (id, full_name, email, role)
        values (new.id, v_name, new.email, 'lecturer');
        insert into public.staff_details (profile_id, department_id, approval_status)
        values (new.id, v_dept, 'pending')
        on conflict (profile_id) do update set approval_status = 'pending', department_id = excluded.department_id;
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

revoke all on function public._meta_uuid(jsonb, text) from public, anon, authenticated;
revoke all on function public.registration_options() from public;
-- Deliberately public: the sign-up form runs before anyone is signed in. Returns active names only.
grant execute on function public.registration_options() to anon, authenticated;
