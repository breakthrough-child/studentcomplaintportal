-- =============================================================================
-- 0001  Schema: enums, tables, constraints, indexes
--
-- Conventions
--   * UUID primary keys, timestamptz everywhere, ON DELETE RESTRICT for
--     anything referenced by historical complaints.
--   * No table is writable by end users directly unless a later migration
--     grants it (see 20261009000007_grants.sql). Complaint data is written only
--     through SECURITY DEFINER functions (20261009000003_rpc.sql).
-- =============================================================================

-- ---- enums ------------------------------------------------------------------
create type public.user_role as enum ('student', 'lecturer', 'main_lecturer', 'admin');
create type public.approval_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.complaint_status as enum
  ('submitted', 'under_review', 'awaiting_student', 'resolved', 'closed', 'reopened');
create type public.complaint_priority as enum ('low', 'normal', 'high', 'urgent');
-- Scope shapes are enforced by a CHECK constraint on lecturer_assignments, so a
-- NULL level/department can never be read as "unlimited" by accident.
create type public.assignment_scope as enum ('department_level', 'level', 'department', 'institution');
create type public.access_reason as enum ('target', 'assigned', 'delegated');

-- ---- academic structure -----------------------------------------------------
create table public.academic_levels (
  id            uuid primary key default gen_random_uuid(),
  name          text    not null check (char_length(btrim(name)) between 1 and 60),
  level_number  integer not null check (level_number > 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint academic_levels_level_number_key unique (level_number)
);
create unique index academic_levels_name_lower_key on public.academic_levels (lower(name));

create table public.departments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 120),
  code         text check (code is null or char_length(btrim(code)) between 1 and 20),
  description  text check (description is null or char_length(description) <= 1000),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index departments_name_lower_key on public.departments (lower(name));
create unique index departments_code_lower_key on public.departments (lower(code)) where code is not null;

-- ---- identity ---------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (char_length(btrim(full_name)) between 1 and 200),
  email       text not null check (char_length(email) between 3 and 320),
  role        public.user_role not null default 'student',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index profiles_email_lower_key on public.profiles (lower(email));
create index profiles_role_active_idx on public.profiles (role) where is_active;

-- Extra staff attributes used by the lecturer selector (home department, title).
create table public.staff_details (
  profile_id          uuid primary key references public.profiles (id) on delete cascade,
  department_id       uuid references public.departments (id) on delete restrict,
  title               text check (title is null or char_length(title) <= 100),
  accepts_complaints  boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Trusted onboarding for lecturer / main_lecturer / admin accounts. A new
-- auth.users row is only accepted if an unconsumed invitation (or a
-- pre-registered student) matches its email (see handle_new_auth_user).
create table public.staff_invitations (
  id             uuid primary key default gen_random_uuid(),
  email          text not null check (char_length(email) between 3 and 320),
  full_name      text not null check (char_length(btrim(full_name)) between 1 and 200),
  role           public.user_role not null check (role in ('lecturer', 'main_lecturer', 'admin')),
  department_id  uuid references public.departments (id) on delete restrict,
  title          text check (title is null or char_length(title) <= 100),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  consumed_at    timestamptz,
  consumed_by    uuid references public.profiles (id) on delete set null
);
create unique index staff_invitations_open_email_key
  on public.staff_invitations (lower(email)) where consumed_at is null;

create table public.students (
  id                   uuid primary key default gen_random_uuid(),
  -- NULL until the verified auth user claims the pre-registered record.
  profile_id           uuid unique references public.profiles (id) on delete set null,
  school_email         text not null check (char_length(school_email) between 3 and 320),
  full_name            text not null check (char_length(btrim(full_name)) between 1 and 200),
  registration_number  text not null,
  level_id             uuid not null references public.academic_levels (id) on delete restrict,
  department_id        uuid not null references public.departments (id) on delete restrict,
  approval_status      public.approval_status not null default 'pending',
  approved_by          uuid references public.profiles (id) on delete set null,
  approved_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint students_registration_number_key unique (registration_number),
  constraint students_registration_number_format
    check (registration_number ~ '^[A-Z0-9][A-Z0-9/._-]{1,39}$'),
  constraint students_approved_has_timestamp
    check (approval_status <> 'approved' or approved_at is not null)
);
create unique index students_school_email_lower_key on public.students (lower(school_email));
create index students_level_department_idx on public.students (level_id, department_id);

-- ---- lecturer authorization scope ------------------------------------------
create table public.lecturer_assignments (
  id                   uuid primary key default gen_random_uuid(),
  lecturer_profile_id  uuid not null references public.profiles (id) on delete cascade,
  scope_type           public.assignment_scope not null,
  level_id             uuid references public.academic_levels (id) on delete restrict,
  department_id        uuid references public.departments (id) on delete restrict,
  is_active            boolean not null default true,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  constraint lecturer_assignments_scope_shape check (
       (scope_type = 'institution'      and level_id is null     and department_id is null)
    or (scope_type = 'level'            and level_id is not null and department_id is null)
    or (scope_type = 'department'       and level_id is null     and department_id is not null)
    or (scope_type = 'department_level' and level_id is not null and department_id is not null)
  )
);
create unique index lecturer_assignments_unique_scope on public.lecturer_assignments (
  lecturer_profile_id, scope_type,
  coalesce(level_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
create index lecturer_assignments_lecturer_idx
  on public.lecturer_assignments (lecturer_profile_id) where is_active;

-- ---- complaints -------------------------------------------------------------
create table public.complaint_categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  description   text check (description is null or char_length(description) <= 1000),
  is_sensitive  boolean not null default false,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create unique index complaint_categories_name_lower_key on public.complaint_categories (lower(name));

create sequence public.complaint_reference_seq as bigint minvalue 1 start 1;

create table public.complaints (
  id                          uuid primary key default gen_random_uuid(),
  reference_number            text not null,
  student_id                  uuid not null references public.students (id) on delete restrict,
  title                       text not null check (char_length(title) between 3 and 200),
  description                 text not null check (char_length(description) between 10 and 10000),
  category_id                 uuid not null references public.complaint_categories (id) on delete restrict,
  -- Snapshot of the academic scope the complaint concerns (see README: "Scope snapshot").
  level_id                    uuid not null references public.academic_levels (id) on delete restrict,
  department_id               uuid not null references public.departments (id) on delete restrict,
  status                      public.complaint_status not null default 'submitted',
  priority                    public.complaint_priority not null default 'normal',
  target_lecturer_profile_id  uuid not null references public.profiles (id) on delete restrict,
  assigned_lecturer_profile_id uuid references public.profiles (id) on delete set null,
  -- Snapshot of category sensitivity at submission; can only be raised later.
  is_sensitive                boolean not null default false,
  requires_triage             boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  last_activity_at            timestamptz not null default now(),
  first_reviewed_at           timestamptz,
  resolved_at                 timestamptz,
  closed_at                   timestamptz,
  constraint complaints_reference_number_key unique (reference_number)
);
create index complaints_student_idx        on public.complaints (student_id);
create index complaints_status_idx         on public.complaints (status);
create index complaints_scope_idx          on public.complaints (level_id, department_id);
create index complaints_category_idx       on public.complaints (category_id);
create index complaints_assigned_idx       on public.complaints (assigned_lecturer_profile_id);
create index complaints_target_idx         on public.complaints (target_lecturer_profile_id);
create index complaints_created_at_idx     on public.complaints (created_at desc);
create index complaints_last_activity_idx  on public.complaints (last_activity_at desc);
create index complaints_triage_idx         on public.complaints (created_at) where requires_triage;

-- Explicit per-complaint grant. This (and only this) is how a student-selected
-- lecturer gets access, without receiving any wider scope.
create table public.complaint_access (
  id            uuid primary key default gen_random_uuid(),
  complaint_id  uuid not null references public.complaints (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  reason        public.access_reason not null,
  granted_by    uuid references public.profiles (id) on delete set null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint complaint_access_unique unique (complaint_id, profile_id)
);
create index complaint_access_profile_idx on public.complaint_access (profile_id) where is_active;

create table public.complaint_messages (
  id                 uuid primary key default gen_random_uuid(),
  complaint_id       uuid not null references public.complaints (id) on delete cascade,
  author_profile_id  uuid not null references public.profiles (id) on delete restrict,
  body               text not null check (char_length(body) between 1 and 5000),
  -- clock_timestamp(): strictly ordered even for rows written in one transaction.
  created_at         timestamptz not null default clock_timestamp(),
  edited_at          timestamptz,
  constraint complaint_messages_id_complaint_key unique (id, complaint_id)
);
create index complaint_messages_thread_idx on public.complaint_messages (complaint_id, created_at, id);

create table public.complaint_attachments (
  id                      uuid primary key default gen_random_uuid(),
  complaint_id            uuid not null references public.complaints (id) on delete cascade,
  message_id              uuid,
  uploaded_by_profile_id  uuid not null references public.profiles (id) on delete restrict,
  storage_path            text not null,
  original_filename       text not null check (char_length(original_filename) between 1 and 255),
  mime_type               text not null check (char_length(mime_type) between 3 and 127),
  file_size               bigint not null check (file_size > 0),
  created_at              timestamptz not null default now(),
  deleted_at              timestamptz,
  deleted_by              uuid references public.profiles (id) on delete set null,
  constraint complaint_attachments_storage_path_key unique (storage_path),
  -- <complaint_id>/<random uuid>: random object name, grouped by complaint.
  constraint complaint_attachments_path_format
    check (storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  constraint complaint_attachments_path_matches_complaint
    check (split_part(storage_path, '/', 1) = complaint_id::text),
  -- A message attachment must belong to a message of the same complaint.
  constraint complaint_attachments_message_fk
    foreign key (message_id, complaint_id)
    references public.complaint_messages (id, complaint_id) on delete cascade
);
create index complaint_attachments_complaint_idx on public.complaint_attachments (complaint_id);

create table public.complaint_status_history (
  id                uuid primary key default gen_random_uuid(),
  complaint_id      uuid not null references public.complaints (id) on delete cascade,
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  old_status        public.complaint_status,
  new_status        public.complaint_status not null,
  reason            text check (reason is null or char_length(reason) <= 1000),
  created_at        timestamptz not null default clock_timestamp()
);
create index complaint_status_history_idx on public.complaint_status_history (complaint_id, created_at, id);

-- Activity timeline. Metadata never contains complaint text.
create table public.complaint_events (
  id                uuid primary key default gen_random_uuid(),
  complaint_id      uuid not null references public.complaints (id) on delete cascade,
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  event_type        text not null check (event_type in (
    'submitted', 'assigned', 'escalated', 'access_revoked', 'first_reviewed',
    'status_changed', 'message_posted', 'attachment_added', 'attachment_removed')),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default clock_timestamp()
);
create index complaint_events_idx on public.complaint_events (complaint_id, created_at, id);

create table public.complaint_read_receipts (
  complaint_id  uuid not null references public.complaints (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  last_read_at  timestamptz not null default now(),
  primary key (complaint_id, profile_id)
);

-- ---- audit & settings -------------------------------------------------------
create table public.audit_logs (
  id                uuid primary key default gen_random_uuid(),
  actor_profile_id  uuid references public.profiles (id) on delete set null,
  action            text not null check (char_length(action) between 1 and 100),
  entity_type       text not null check (char_length(entity_type) between 1 and 60),
  entity_id         uuid,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default clock_timestamp()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx   on public.audit_logs (actor_profile_id);

create table public.app_settings (
  key          text primary key check (key ~ '^[a-z][a-z0-9_]{1,63}$'),
  value        jsonb not null,
  description  text,
  updated_by   uuid references public.profiles (id) on delete set null,
  updated_at   timestamptz not null default now()
);
