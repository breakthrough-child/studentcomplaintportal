-- =============================================================================
-- 0005  Private storage bucket + Storage RLS
--
-- Bucket `complaint-evidence` is PRIVATE. Objects live at
--   <complaint_id>/<random uuid>          (no original filename, no student id)
-- Downloads are only ever served through short-lived signed URLs minted by the
-- server AFTER an authorization check; the policies below make the same check
-- at the storage layer so the signed-URL call itself fails for outsiders.
--
-- authenticated users get SELECT and INSERT only. There is deliberately no
-- UPDATE or DELETE policy: removal is a soft delete in the database plus a
-- trusted purge job using the service role.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'complaint-evidence', 'complaint-evidence', false, 10485760,
  array[
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm'
  ])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Complaint id from an object name, or NULL if the name is not "<uuid>/<uuid>".
create or replace function public.storage_complaint_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

-- May the caller read this object? Complaint access, and the file must not have
-- been removed.
create or replace function public.storage_object_readable(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.storage_complaint_id(p_name) is not null
     and public.can_access_complaint_id(public.storage_complaint_id(p_name))
     and not exists (select 1 from public.complaint_attachments a
                      where a.storage_path = p_name and a.deleted_at is not null)
$$;

-- May the caller upload this object? A participant of an open-for-them complaint.
create or replace function public.storage_upload_allowed(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.storage_complaint_id(p_name) is not null
     and public.can_participate_complaint(public.storage_complaint_id(p_name))
     and not (public.current_user_role() = 'student' and exists (
           select 1 from public.complaints c
            where c.id = public.storage_complaint_id(p_name) and c.status = 'closed'))
$$;

create policy complaint_evidence_select on storage.objects
  for select to authenticated
  using (bucket_id = 'complaint-evidence' and public.storage_object_readable(name));

create policy complaint_evidence_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'complaint-evidence' and public.storage_upload_allowed(name));
