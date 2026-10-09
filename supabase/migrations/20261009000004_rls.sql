-- =============================================================================
-- 0004  Row Level Security
--
-- Defence in depth: table grants (0007) already withhold INSERT/UPDATE/DELETE on
-- complaint data from end users; these policies are the second layer and are
-- the ONLY layer for reads. Policies call SECURITY DEFINER helpers (0002) that
-- read the underlying tables without re-entering RLS, which avoids recursion.
--
-- Not FORCEd: SECURITY DEFINER functions are owned by `postgres`, which has
-- BYPASSRLS on Supabase and is the table owner locally. Do not give API roles
-- (anon, authenticated, service_role) ownership of any of these tables.
-- =============================================================================

alter table public.academic_levels          enable row level security;
alter table public.departments              enable row level security;
alter table public.profiles                 enable row level security;
alter table public.staff_details            enable row level security;
alter table public.staff_invitations        enable row level security;
alter table public.students                 enable row level security;
alter table public.lecturer_assignments     enable row level security;
alter table public.complaint_categories     enable row level security;
alter table public.complaints               enable row level security;
alter table public.complaint_access         enable row level security;
alter table public.complaint_messages       enable row level security;
alter table public.complaint_attachments    enable row level security;
alter table public.complaint_status_history enable row level security;
alter table public.complaint_events         enable row level security;
alter table public.complaint_read_receipts  enable row level security;
alter table public.audit_logs               enable row level security;
alter table public.app_settings             enable row level security;

-- ---- reference data: readable by any active signed-in user, admin-managed -----
create policy academic_levels_select on public.academic_levels
  for select to authenticated using (public.current_user_role() is not null);
create policy academic_levels_admin_write on public.academic_levels
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy departments_select on public.departments
  for select to authenticated using (public.current_user_role() is not null);
create policy departments_admin_write on public.departments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy complaint_categories_select on public.complaint_categories
  for select to authenticated using (public.current_user_role() is not null);
create policy complaint_categories_admin_write on public.complaint_categories
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy app_settings_select on public.app_settings
  for select to authenticated using (public.current_user_role() is not null);
create policy app_settings_admin_update on public.app_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- profiles ---------------------------------------------------------------
-- No INSERT/DELETE policy: profiles are created by the auth.users trigger only.
-- UPDATE: users may touch their own row, but column grants limit them to
-- full_name and guard_profile_update() blocks role/is_active/email changes.
create policy profiles_select on public.profiles
  for select to authenticated using (public.can_view_profile(id));
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() and public.current_user_role() is not null)
  with check (id = auth.uid());
create policy profiles_update_admin on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy staff_details_select on public.staff_details
  for select to authenticated using (public.can_view_profile(profile_id));
create policy staff_details_update_self on public.staff_details
  for update to authenticated
  using (profile_id = auth.uid() and public.is_lecturer_staff())
  with check (profile_id = auth.uid());
create policy staff_details_update_admin on public.staff_details
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy staff_invitations_admin on public.staff_invitations
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- students ---------------------------------------------------------------
create policy students_select on public.students
  for select to authenticated
  using (
    (profile_id = auth.uid() and public.current_user_role() is not null)
    or public.is_admin()
    or public.can_view_student(id)
  );
create policy students_admin_write on public.students
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- lecturer scope ---------------------------------------------------------
create policy lecturer_assignments_select on public.lecturer_assignments
  for select to authenticated
  using (
    (lecturer_profile_id = auth.uid() and public.current_user_role() is not null)
    or public.is_admin()
    or public.is_main_lecturer()
  );
create policy lecturer_assignments_admin_write on public.lecturer_assignments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---- complaints & children (read-only for API roles; writes via RPC) --------
create policy complaints_select on public.complaints
  for select to authenticated
  using (public.can_access_complaint(id, student_id, level_id, department_id, is_sensitive));

create policy complaint_access_select on public.complaint_access
  for select to authenticated
  using (public.current_user_role() in ('lecturer', 'main_lecturer', 'admin')
         and public.can_access_complaint_id(complaint_id));

create policy complaint_messages_select on public.complaint_messages
  for select to authenticated using (public.can_access_complaint_id(complaint_id));

create policy complaint_attachments_select on public.complaint_attachments
  for select to authenticated
  using (deleted_at is null and public.can_access_complaint_id(complaint_id));

create policy complaint_status_history_select on public.complaint_status_history
  for select to authenticated using (public.can_access_complaint_id(complaint_id));

create policy complaint_events_select on public.complaint_events
  for select to authenticated using (public.can_access_complaint_id(complaint_id));

create policy complaint_read_receipts_select on public.complaint_read_receipts
  for select to authenticated using (profile_id = auth.uid());

-- ---- audit ------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs
  for select to authenticated using (public.is_admin());
