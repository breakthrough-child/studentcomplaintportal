-- =============================================================================
-- 0003  RPC layer: the only write path for complaints, messages, attachments
--
-- Every function derives identity from auth.uid(), re-checks authorization in
-- the database, and uses one error vocabulary so callers cannot learn whether
-- an inaccessible complaint exists:
--   42501  not authorized               P0002  not found (also for "no access")
--   22023  invalid input                54000  rate limit exceeded
--   55000  state conflict (e.g. closed)
-- =============================================================================

-- ---- lecturer selector ------------------------------------------------------
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
  home_department_name  text,
  scope_labels          text[]
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
  select p.id, p.full_name, sd.title, d.id, d.name,
         coalesce((
           select array_agg(distinct x.label order by x.label)
           from (
             select concat_ws(' / ', l.name, dd.name) as label
             from public.lecturer_assignments a
             left join public.academic_levels l on l.id = a.level_id
             left join public.departments dd on dd.id = a.department_id
             where a.lecturer_profile_id = p.id and a.is_active and a.scope_type <> 'institution'
           ) x
         ), '{}'::text[])
  from public.profiles p
  join public.staff_details sd on sd.profile_id = p.id
  left join public.departments d on d.id = sd.department_id
  where p.role in ('lecturer', 'main_lecturer')
    and p.is_active
    and sd.accepts_complaints
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

-- ---- submit -----------------------------------------------------------------
-- One transaction: complaint + initial history + timeline + routing + receipt +
-- audit. Attachments are registered afterwards (register_attachment) because
-- storage paths are grouped by the complaint id.
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

-- ---- conversation -----------------------------------------------------------
create or replace function public.post_message(p_complaint_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.user_role := public.current_user_role();
  v_body   text := btrim(coalesce(p_body, ''));
  v_status public.complaint_status;
  v_msg    uuid;
  v_recent integer;
begin
  if v_uid is null or v_role is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if char_length(v_body) not between 1 and 5000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  if not public.can_participate_complaint(p_complaint_id) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;

  select c.status into v_status from public.complaints c where c.id = p_complaint_id for update;
  if v_status = 'closed' and v_role = 'student' then
    raise exception 'complaint is closed' using errcode = '55000';
  end if;

  select count(*) into v_recent from public.complaint_messages m
   where m.author_profile_id = v_uid and m.created_at > now() - interval '1 minute';
  if v_recent >= public._setting_int('messages_per_minute', 20) then
    raise exception 'rate limit exceeded' using errcode = '54000';
  end if;

  insert into public.complaint_messages (complaint_id, author_profile_id, body)
  values (p_complaint_id, v_uid, v_body) returning id into v_msg;

  update public.complaints set last_activity_at = now(), updated_at = now() where id = p_complaint_id;

  insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
  values (p_complaint_id, v_uid, 'message_posted', jsonb_build_object('message_id', v_msg));

  insert into public.complaint_read_receipts (complaint_id, profile_id, last_read_at)
  values (p_complaint_id, v_uid, clock_timestamp())
  on conflict (complaint_id, profile_id) do update set last_read_at = excluded.last_read_at;

  if v_role = 'student' and v_status = 'awaiting_student' then
    perform public._apply_status_change(p_complaint_id, 'under_review', v_uid, 'Student responded');
  elsif v_role in ('lecturer', 'main_lecturer') and v_status = 'submitted' then
    perform public._apply_status_change(p_complaint_id, 'under_review', v_uid, 'Review started with first reply');
  end if;

  return v_msg;
end $$;

-- ---- status -----------------------------------------------------------------
create or replace function public.transition_complaint_status(
  p_complaint_id uuid, p_new_status public.complaint_status, p_reason text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.user_role := public.current_user_role();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_c      public.complaints%rowtype;
begin
  if v_uid is null or v_role is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception 'reason too long' using errcode = '22023';
  end if;

  if v_role = 'student' then
    if not public.is_approved_student() or not exists (
         select 1 from public.complaints c join public.students s on s.id = c.student_id
          where c.id = p_complaint_id and s.profile_id = v_uid) then
      raise exception 'complaint not found' using errcode = 'P0002';
    end if;
    select * into v_c from public.complaints c where c.id = p_complaint_id for update;
    -- Students may only ask to reopen a resolved complaint, inside the reopen window.
    if p_new_status <> 'reopened' or v_c.status <> 'resolved' then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    if v_c.resolved_at < now() - make_interval(days => public._setting_int('reopen_window_days', 30)) then
      raise exception 'reopen window has passed' using errcode = '55000';
    end if;
    if v_reason is null then
      raise exception 'a reason is required to reopen a complaint' using errcode = '22023';
    end if;
  elsif v_role in ('lecturer', 'main_lecturer') then
    if not public.can_manage_complaint(p_complaint_id) then
      raise exception 'complaint not found' using errcode = 'P0002';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform public._apply_status_change(p_complaint_id, p_new_status, v_uid, v_reason);
end $$;

-- ---- routing / escalation ---------------------------------------------------
-- Main lecturers (who can already access the complaint) release or reassign it.
create or replace function public.assign_complaint(
  p_complaint_id uuid, p_lecturer_profile_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_main_lecturer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.can_manage_complaint(p_complaint_id) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  if not public._is_eligible_lecturer(p_lecturer_profile_id) then
    raise exception 'invalid recipient' using errcode = '22023';
  end if;

  perform 1 from public.complaints c where c.id = p_complaint_id for update;

  insert into public.complaint_access (complaint_id, profile_id, reason, granted_by)
  values (p_complaint_id, p_lecturer_profile_id, 'assigned', v_uid)
  on conflict (complaint_id, profile_id) do update
    set is_active = true, reason = 'assigned', granted_by = excluded.granted_by;

  update public.complaints
     set assigned_lecturer_profile_id = p_lecturer_profile_id,
         requires_triage = false,
         last_activity_at = now(), updated_at = now()
   where id = p_complaint_id;

  insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
  values (p_complaint_id, v_uid, 'assigned', jsonb_build_object('to_profile_id', p_lecturer_profile_id));
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_uid, 'complaint.assigned', 'complaint', p_complaint_id,
          jsonb_build_object('to_profile_id', p_lecturer_profile_id));
end $$;

create or replace function public.revoke_complaint_access(
  p_complaint_id uuid, p_profile_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_main_lecturer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.can_manage_complaint(p_complaint_id) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;

  update public.complaint_access set is_active = false
   where complaint_id = p_complaint_id and profile_id = p_profile_id and is_active;
  if not found then
    raise exception 'access grant not found' using errcode = 'P0002';
  end if;

  update public.complaints
     set assigned_lecturer_profile_id = null, last_activity_at = now(), updated_at = now()
   where id = p_complaint_id and assigned_lecturer_profile_id = p_profile_id;

  insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
  values (p_complaint_id, v_uid, 'access_revoked', jsonb_build_object('profile_id', p_profile_id));
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_uid, 'complaint.access_revoked', 'complaint', p_complaint_id,
          jsonb_build_object('profile_id', p_profile_id));
end $$;

-- Any lecturer who can manage a complaint may escalate it to main-lecturer
-- triage; p_restrict also raises it to "sensitive" (restricted scope access).
create or replace function public.escalate_complaint(
  p_complaint_id uuid, p_reason text, p_restrict boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null or not public.is_lecturer_staff() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.can_manage_complaint(p_complaint_id) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'a reason (max 1000 characters) is required' using errcode = '22023';
  end if;

  update public.complaints
     set requires_triage = true,
         is_sensitive = is_sensitive or coalesce(p_restrict, false),
         last_activity_at = now(), updated_at = now()
   where id = p_complaint_id;

  insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
  values (p_complaint_id, v_uid, 'escalated', jsonb_build_object('restricted', coalesce(p_restrict, false)));
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_uid, 'complaint.escalated', 'complaint', p_complaint_id,
          jsonb_build_object('restricted', coalesce(p_restrict, false)));
end $$;

-- ---- read state -------------------------------------------------------------
create or replace function public.mark_complaint_read(p_complaint_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_access_complaint_id(p_complaint_id) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  insert into public.complaint_read_receipts (complaint_id, profile_id, last_read_at)
  values (p_complaint_id, auth.uid(), clock_timestamp())
  on conflict (complaint_id, profile_id) do update set last_read_at = excluded.last_read_at;
end $$;

-- Runs with the caller's rights, so RLS limits it to complaints they may see.
create or replace function public.unread_message_counts()
returns table (complaint_id uuid, unread_messages bigint, never_opened boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id,
         count(m.id) as unread_messages,
         (r.profile_id is null) as never_opened
  from public.complaints c
  left join public.complaint_read_receipts r
         on r.complaint_id = c.id and r.profile_id = auth.uid()
  left join public.complaint_messages m
         on m.complaint_id = c.id
        and m.author_profile_id <> auth.uid()
        and (r.last_read_at is null or m.created_at > r.last_read_at)
  group by c.id, r.profile_id
  having count(m.id) > 0 or r.profile_id is null
$$;

-- ---- attachments ------------------------------------------------------------
-- Registers metadata for an object that was already uploaded to the private
-- bucket at "<complaint_id>/<random uuid>". Content sniffing (magic bytes) is
-- the responsibility of the trusted server upload route; the database enforces
-- everything it can see: path shape, ownership, declared type/size, counts.
create or replace function public.register_attachment(
  p_complaint_id      uuid,
  p_message_id        uuid,
  p_storage_path      text,
  p_original_filename text,
  p_mime_type         text,
  p_file_size         bigint
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_role     public.user_role := public.current_user_role();
  v_status   public.complaint_status;
  v_name     text;
  v_obj      record;
  v_id       uuid;
  v_recent   integer;
  v_existing integer;
  v_mimes    jsonb := public._setting_json('allowed_attachment_mime_types');
begin
  if v_uid is null or v_role is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.can_participate_complaint(p_complaint_id) then
    raise exception 'complaint not found' using errcode = 'P0002';
  end if;
  select c.status into v_status from public.complaints c where c.id = p_complaint_id;
  if v_status = 'closed' and v_role = 'student' then
    raise exception 'complaint is closed' using errcode = '55000';
  end if;

  if p_storage_path is null
     or split_part(p_storage_path, '/', 1) <> p_complaint_id::text
     or p_storage_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid storage path' using errcode = '22023';
  end if;

  if v_mimes is null or jsonb_typeof(v_mimes) <> 'array'
     or not exists (select 1 from jsonb_array_elements_text(v_mimes) m where m = lower(p_mime_type)) then
    raise exception 'file type is not allowed' using errcode = '22023';
  end if;
  if p_file_size is null or p_file_size < 1
     or p_file_size > public._setting_bigint('max_attachment_size_bytes', 10485760) then
    raise exception 'file size is not allowed' using errcode = '22023';
  end if;

  -- Sanitise the display name: no path separators or control characters.
  v_name := left(btrim(regexp_replace(coalesce(p_original_filename, ''), '[\x00-\x1f\x7f/\\]', '', 'g')), 255);
  if v_name = '' then v_name := 'file'; end if;

  -- The object must really exist in the private bucket, and match what was declared.
  select o.metadata into v_obj from storage.objects o
   where o.bucket_id = 'complaint-evidence' and o.name = p_storage_path;
  if not found then
    raise exception 'uploaded object not found' using errcode = '22023';
  end if;
  if v_obj.metadata ->> 'size' is not null and (v_obj.metadata ->> 'size')::bigint <> p_file_size then
    raise exception 'declared size does not match uploaded object' using errcode = '22023';
  end if;

  if p_message_id is not null and not exists (
       select 1 from public.complaint_messages m
        where m.id = p_message_id and m.complaint_id = p_complaint_id and m.author_profile_id = v_uid) then
    raise exception 'invalid message' using errcode = '22023';
  end if;

  select count(*) into v_existing from public.complaint_attachments a
   where a.complaint_id = p_complaint_id and a.uploaded_by_profile_id = v_uid
     and a.deleted_at is null and a.message_id is not distinct from p_message_id;
  if v_existing >= public._setting_int('max_attachments_per_submission', 5) then
    raise exception 'too many attachments' using errcode = '22023';
  end if;

  select count(*) into v_recent from public.complaint_attachments a
   where a.uploaded_by_profile_id = v_uid and a.created_at > now() - interval '1 hour';
  if v_recent >= public._setting_int('uploads_per_hour', 60) then
    raise exception 'rate limit exceeded' using errcode = '54000';
  end if;

  insert into public.complaint_attachments (
    complaint_id, message_id, uploaded_by_profile_id, storage_path,
    original_filename, mime_type, file_size)
  values (p_complaint_id, p_message_id, v_uid, p_storage_path, v_name, lower(p_mime_type), p_file_size)
  returning id into v_id;

  update public.complaints set last_activity_at = now(), updated_at = now() where id = p_complaint_id;
  insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
  values (p_complaint_id, v_uid, 'attachment_added', jsonb_build_object('attachment_id', v_id));
  return v_id;
end $$;

-- Only the uploader may remove their own file, and only while the complaint is
-- open. Soft delete: the row stays for audit, the object becomes unreadable
-- (storage policy) and should be purged by a trusted job.
create or replace function public.delete_attachment(p_attachment_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_att  public.complaint_attachments%rowtype;
  v_stat public.complaint_status;
begin
  if v_uid is null or public.current_user_role() is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_att from public.complaint_attachments a
   where a.id = p_attachment_id and a.deleted_at is null;
  if not found or v_att.uploaded_by_profile_id <> v_uid
     or not public.can_participate_complaint(v_att.complaint_id) then
    raise exception 'attachment not found' using errcode = 'P0002';
  end if;
  select c.status into v_stat from public.complaints c where c.id = v_att.complaint_id;
  if v_stat = 'closed' then
    raise exception 'complaint is closed' using errcode = '55000';
  end if;

  update public.complaint_attachments set deleted_at = now(), deleted_by = v_uid where id = p_attachment_id;
  insert into public.complaint_events (complaint_id, actor_profile_id, event_type, metadata)
  values (v_att.complaint_id, v_uid, 'attachment_removed', jsonb_build_object('attachment_id', p_attachment_id));
  insert into public.audit_logs (actor_profile_id, action, entity_type, entity_id, metadata)
  values (v_uid, 'attachment.deleted', 'complaint_attachment', p_attachment_id,
          jsonb_build_object('complaint_id', v_att.complaint_id));
end $$;

-- ---- student claim ----------------------------------------------------------
-- Explicit, rate-limited claim of the caller's own pre-registered record.
-- Identity comes from the VERIFIED e-mail on the auth user; the registration
-- number is only a second check, never a credential. All failures look the same.
create or replace function public.claim_student_record(p_registration_number text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_reg   text := upper(btrim(coalesce(p_registration_number, '')));
  v_failures integer;
  v_id    uuid;
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

  update public.students s set profile_id = v_uid
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

-- ---- bootstrap --------------------------------------------------------------
-- Creates the first administrator invitation. Not executable by any API role:
-- run it from the Supabase SQL editor (postgres). Refuses once an admin exists.
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
    insert into public.profiles (id, full_name, email, role) values (v_user, v_name, v_email, 'admin');
    return 'existing auth user promoted to administrator';
  end if;

  insert into public.staff_invitations (email, full_name, role) values (v_email, v_name, 'admin');
  return 'invitation created: now invite ' || v_email || ' from Authentication > Users in the Supabase dashboard';
end $$;

-- ---- reporting (security invoker: RLS scopes every number) ------------------
create or replace function public.complaint_status_counts()
returns table (status public.complaint_status, total bigint)
language sql stable security invoker set search_path = '' as $$
  select c.status, count(*) from public.complaints c group by c.status
$$;

create or replace function public.complaint_counts_by_scope()
returns table (level_id uuid, department_id uuid, status public.complaint_status, total bigint)
language sql stable security invoker set search_path = '' as $$
  select c.level_id, c.department_id, c.status, count(*)
  from public.complaints c group by c.level_id, c.department_id, c.status
$$;

create or replace function public.complaint_daily_trend(p_days integer default 30)
returns table (day date, submitted bigint, resolved bigint)
language sql stable security invoker set search_path = '' as $$
  with d as (
    select generate_series(
             (now() at time zone 'utc')::date - (least(greatest(coalesce(p_days, 30), 1), 366) - 1),
             (now() at time zone 'utc')::date, interval '1 day')::date as day)
  select d.day,
         (select count(*) from public.complaints c where (c.created_at at time zone 'utc')::date = d.day),
         (select count(*) from public.complaints c where (c.resolved_at at time zone 'utc')::date = d.day)
  from d order by d.day
$$;

-- Read-only accessor so SECURITY INVOKER reports can read this one setting
-- without API roles being able to execute the internal _setting_* helpers.
create or replace function public.overdue_after_days() returns integer
language sql stable security definer set search_path = '' as $$
  select public._setting_int('overdue_after_days', 14)
$$;

-- Open complaints with no activity for p_days (default: setting overdue_after_days).
create or replace function public.list_overdue_complaints(p_days integer default null)
returns table (
  complaint_id uuid, reference_number text, status public.complaint_status,
  priority public.complaint_priority, created_at timestamptz,
  last_activity_at timestamptz, days_inactive integer)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.reference_number, c.status, c.priority, c.created_at, c.last_activity_at,
         floor(extract(epoch from (now() - c.last_activity_at)) / 86400)::integer
  from public.complaints c
  where c.status not in ('resolved', 'closed')
    and c.last_activity_at < now() - make_interval(
          days => coalesce(p_days, public.overdue_after_days()))
  order by c.last_activity_at
$$;
