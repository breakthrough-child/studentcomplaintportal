-- =============================================================================
-- 0009  submit_complaint: idempotent against double submits
--
-- Finding (application audit): nothing stopped a double click or a retried request
-- from creating two identical complaints (only the hourly rate limit bounded it).
-- This recreates submit_complaint with one added step: an identical complaint by the
-- same student within two minutes is returned instead of inserted again. Everything
-- else (authorization, eligibility, routing, audit) is byte-for-byte the 0003 body.
-- Same signature and return type, so CREATE OR REPLACE keeps existing grants.
-- =============================================================================
create or replace function public.submit_complaint(
  p_title                       text,
  p_description                 text,
  p_category_id                 uuid,
  p_target_lecturer_profile_id  uuid,
  p_level_id                    uuid default null,
  p_department_id               uuid default null,
  p_priority                    public.complaint_priority default 'normal'
) returns table (new_complaint_id uuid, new_reference_number text)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_student public.students%rowtype;
  v_cat     public.complaint_categories%rowtype;
  v_title   text := btrim(coalesce(p_title, ''));
  v_desc    text := btrim(coalesce(p_description, ''));
  v_level   uuid;
  v_dept    uuid;
  v_id      uuid;
  v_ref     text;
  v_recent  integer;
  v_dup     record;
begin
  if v_uid is null or not public.is_approved_student() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_student from public.students s where s.profile_id = v_uid;

  if char_length(v_title) not between 3 and 200 then
    raise exception 'invalid title' using errcode = '22023';
  end if;
  if char_length(v_desc) not between 10 and 10000 then
    raise exception 'invalid description' using errcode = '22023';
  end if;

  select * into v_cat from public.complaint_categories c where c.id = p_category_id and c.is_active;
  if not found then
    raise exception 'invalid category' using errcode = '22023';
  end if;

  -- Same generic error for "does not exist", "not a lecturer", "inactive", "opted out".
  if not public._is_eligible_lecturer(p_target_lecturer_profile_id) then
    raise exception 'invalid recipient' using errcode = '22023';
  end if;

  if public._setting_bool('allow_student_scope_override', true) then
    v_level := coalesce(p_level_id, v_student.level_id);
    v_dept  := coalesce(p_department_id, v_student.department_id);
  else
    v_level := v_student.level_id;
    v_dept  := v_student.department_id;
  end if;
  if not exists (select 1 from public.academic_levels l where l.id = v_level and l.is_active)
     or not exists (select 1 from public.departments d where d.id = v_dept and d.is_active) then
    raise exception 'invalid level or department' using errcode = '22023';
  end if;

  -- Duplicate-submit guard: an identical complaint (same text, category and recipient) from the
  -- same student within two minutes is a double click or a retry. Return the existing one instead
  -- of creating another. The comparison uses the already-trimmed text and the resolved scope.
  select c.id, c.reference_number into v_dup
    from public.complaints c
   where c.student_id = v_student.id
     and c.title = v_title and c.description = v_desc
     and c.category_id = v_cat.id
     and c.target_lecturer_profile_id = p_target_lecturer_profile_id
     and c.level_id = v_level and c.department_id = v_dept
     and c.created_at > now() - interval '2 minutes'
   order by c.created_at desc limit 1;
  if found then
    return query select v_dup.id, v_dup.reference_number;
    return;
  end if;

  select count(*) into v_recent from public.complaints c
   where c.student_id = v_student.id and c.created_at > now() - interval '1 hour';
  if v_recent >= public._setting_int('complaints_per_hour', 10) then
    raise exception 'rate limit exceeded' using errcode = '54000';
  end if;

  insert into public.complaints (
    student_id, title, description, category_id, level_id, department_id, priority,
    target_lecturer_profile_id, assigned_lecturer_profile_id, is_sensitive, requires_triage)
  values (
    v_student.id, v_title, v_desc, v_cat.id, v_level, v_dept, p_priority,
    p_target_lecturer_profile_id,
    case when v_cat.is_sensitive then null else p_target_lecturer_profile_id end,
    v_cat.is_sensitive, v_cat.is_sensitive)
  returning id, reference_number into v_id, v_ref;

  insert into public.complaint_status_history (complaint_id, actor_profile_id, old_status, new_status, reason)
  values (v_id, v_uid, null, 'submitted', 'Complaint submitted');

  insert into public.complaint_events (complaint_id, actor_profile_id, event_type)
  values (v_id, v_uid, 'submitted');

  if v_cat.is_sensitive then
    -- Restricted routing: the chosen lecturer is recorded but NOT granted access
    -- until a main lecturer releases the complaint (assign_complaint).
    insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
    values (v_id, v_uid, 'escalated', jsonb_build_object('reason', 'sensitive_category'));
  else
    insert into public.complaint_access (complaint_id, profile_id, reason, granted_by)
    values (v_id, p_target_lecturer_profile_id, 'target', v_uid);
    insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
    values (v_id, v_uid, 'assigned', jsonb_build_object('to_profile_id', p_target_lecturer_profile_id));
  end if;

  insert into public.complaint_read_receipts (complaint_id, profile_id, last_read_at)
  values (v_id, v_uid, now());

  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_uid, 'complaint.submitted', 'complaint', v_id,
          jsonb_build_object('reference_number', v_ref, 'sensitive', v_cat.is_sensitive));

  return query select v_id, v_ref;
end $$;
