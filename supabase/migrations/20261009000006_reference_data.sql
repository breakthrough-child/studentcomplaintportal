-- =============================================================================
-- 0006  Reference data required for the application to operate
--
-- Idempotent. Contains NO accounts, NO passwords and NO demo data.
-- Example departments are in supabase/seed.sql (development only).
-- =============================================================================

-- Default academic levels 100..700 (medicine programmes go to 700). Administrators
-- can add, rename or deactivate levels in the UI; nothing in the app hardcodes them.
insert into public.academic_levels (name, level_number) values
  ('100 Level', 100), ('200 Level', 200), ('300 Level', 300), ('400 Level', 400),
  ('500 Level', 500), ('600 Level', 600), ('700 Level', 700)
on conflict (level_number) do nothing;

insert into public.complaint_categories (name, description, is_sensitive) values
  ('Academic and examination issues',  'Grades, marking, examinations, course content.',        false),
  ('Lecturers and teaching',           'Teaching quality, attendance and conduct of classes.',  false),
  ('Registration and administrative issues', 'Course registration, records, fees processing.',  false),
  ('Facilities and equipment',         'Classrooms, laboratories, equipment, learning spaces.', false),
  ('Harassment or misconduct',         'Allegations of harassment, abuse or serious misconduct. Restricted routing: reviewed by a main lecturer first.', true),
  ('Other',                            'Anything that does not fit another category.',          false)
on conflict (lower(name)) do nothing;

insert into public.app_settings (key, value, description) values
  ('max_attachment_size_bytes',     to_jsonb(10485760),  'Maximum size of one attachment in bytes (default 10 MB). Keep the storage bucket file_size_limit in step.'),
  ('max_attachments_per_submission', to_jsonb(5),        'Maximum live attachments per uploader per submission/message.'),
  ('max_request_bytes',             to_jsonb(52428800),  'Maximum total request body for an upload request (enforced by the application server).'),
  ('allowed_attachment_mime_types', to_jsonb(array[
      'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/webm']),
                                                          'Allow-list of declared MIME types. SVG and executables are intentionally absent.'),
  ('allowed_student_email_domains', '[]'::jsonb,         'Allowed school e-mail domains for student records, e.g. ["university.edu.ng"]. EMPTY MEANS ANY DOMAIN: set this before go-live.'),
  ('allow_student_scope_override',  to_jsonb(true),      'Let students pick a level/department for a complaint other than their own profile values.'),
  ('complaints_per_hour',           to_jsonb(10),        'Complaints one student may submit per rolling hour.'),
  ('messages_per_minute',           to_jsonb(20),        'Messages one user may post per rolling minute.'),
  ('uploads_per_hour',              to_jsonb(60),        'Attachments one user may register per rolling hour.'),
  ('reopen_window_days',            to_jsonb(30),        'Days after resolution during which a student may ask to reopen.'),
  ('overdue_after_days',            to_jsonb(14),        'Days without activity before an open complaint counts as overdue.')
on conflict (key) do nothing;
