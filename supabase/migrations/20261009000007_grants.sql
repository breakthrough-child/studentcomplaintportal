-- =============================================================================
-- 0007  Privileges (deny by default)
--
-- Supabase grants new public objects to anon/authenticated/service_role. This
-- migration narrows that:
--   * anon gets nothing (public pages never need the database).
--   * authenticated gets SELECT where a policy exists, writes only where the
--     table is intentionally admin-managed (policies still require is_admin()),
--     and EXECUTE on an explicit list of functions.
--   * Anything not listed is unreachable through the API.
-- Re-run the REVOKE/GRANT blocks if you add tables or functions in later migrations.
-- =============================================================================

-- Future objects created by the migration role: no implicit API access.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- NOTE: PostgreSQL grants EXECUTE on new functions to PUBLIC by default, and that
-- default cannot be removed per schema. This migration deliberately does not
-- change the role-wide default (it would also affect extension functions).
-- Instead: every function in a future migration must end with
--   revoke all on function <sig> from public, anon, authenticated;
--   grant execute on function <sig> to authenticated;   -- only if it is public API
-- The database test "K1" fails if a SECURITY DEFINER function is callable by anon/PUBLIC.

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

-- ---- table privileges -------------------------------------------------------
grant select on
  public.academic_levels, public.departments, public.complaint_categories, public.app_settings,
  public.profiles, public.staff_details, public.staff_invitations, public.students,
  public.lecturer_assignments, public.complaints, public.complaint_access,
  public.complaint_messages, public.complaint_attachments, public.complaint_status_history,
  public.complaint_events, public.complaint_read_receipts, public.audit_logs
to authenticated;

-- Self-service and admin-managed writes (every one is also gated by RLS and guard triggers).
grant update (full_name, role, is_active)                      on public.profiles             to authenticated;
grant update (department_id, title, accepts_complaints)        on public.staff_details        to authenticated;
grant insert, update, delete                                   on public.academic_levels      to authenticated;
grant insert, update, delete                                   on public.departments          to authenticated;
grant insert, update, delete                                   on public.complaint_categories to authenticated;
grant insert, update, delete                                   on public.students             to authenticated;
grant insert, delete                                           on public.staff_invitations    to authenticated;
grant insert, delete                                           on public.lecturer_assignments to authenticated;
grant update (scope_type, level_id, department_id, is_active)  on public.lecturer_assignments to authenticated;
grant update (value)                                           on public.app_settings         to authenticated;
-- Complaints, messages, attachments, history, events, receipts, audit_logs and
-- complaint_access have NO write grants: they change only through the RPCs.

-- ---- function privileges ----------------------------------------------------
-- Used inside RLS policies / storage policies (evaluated as the caller).
grant execute on function
  public.current_user_role(), public.is_admin(), public.is_main_lecturer(),
  public.is_lecturer_staff(), public.is_approved_student(),
  public.can_access_complaint(uuid, uuid, uuid, uuid, boolean),
  public.can_access_complaint_id(uuid), public.can_manage_complaint(uuid),
  public.can_participate_complaint(uuid), public.can_view_profile(uuid),
  public.can_view_student(uuid),
  public.storage_complaint_id(text), public.storage_object_readable(text),
  public.storage_upload_allowed(text),
  public.is_valid_status_transition(public.complaint_status, public.complaint_status)
to authenticated;

-- Public API (RPC).
grant execute on function
  public.search_lecturers(text, uuid, uuid, integer, integer),
  public.submit_complaint(text, text, uuid, uuid, uuid, uuid, public.complaint_priority),
  public.post_message(uuid, text),
  public.transition_complaint_status(uuid, public.complaint_status, text),
  public.assign_complaint(uuid, uuid),
  public.revoke_complaint_access(uuid, uuid),
  public.escalate_complaint(uuid, text, boolean),
  public.mark_complaint_read(uuid),
  public.unread_message_counts(),
  public.register_attachment(uuid, uuid, text, text, text, bigint),
  public.delete_attachment(uuid),
  public.claim_student_record(text),
  public.complaint_status_counts(),
  public.complaint_counts_by_scope(),
  public.complaint_daily_trend(integer),
  public.list_overdue_complaints(integer),
  public.overdue_after_days()
to authenticated;

-- Not callable through the API by anyone: only the SQL editor / postgres role.
revoke all on function public.bootstrap_first_admin(text, text) from service_role;
