# Build a Complete Student Complaint Management System

Act as a senior full-stack engineer, database architect, UI/UX designer, and application security engineer. Build a production-minded Student Complaint Management System using **Next.js App Router, TypeScript, Tailwind CSS, and Supabase**.

This must be a real, working application—not a static UI prototype. Implement the database, authentication, authorization, complaint workflows, private file uploads, messaging, dashboards, validation, tests, and documentation.

Work directly in the current repository.

## 1. First inspect the project

Before making changes:

1. Inspect the repository structure, `package.json`, existing source code, environment files, Git status, and installed dependencies.
2. Determine whether this is a new project or an existing application.
3. If an existing application is present, preserve its working functionality and established conventions.
4. Identify missing dependencies and the safest implementation path.
5. Present a concise implementation plan, including the major files and database changes, then proceed with implementation unless a genuinely blocking decision requires clarification.

Do not delete existing functionality, replace the project unnecessarily, or overwrite user data. Never display or expose the contents of secret environment files.

## 2. Technology requirements

Use:

- Next.js App Router.
- TypeScript with strict type checking.
- Tailwind CSS.
- Supabase PostgreSQL.
- Supabase Auth.
- Supabase private Storage buckets.
- Zod for validating untrusted input.
- React Hook Form where it improves form management.
- A consistent icon library such as Lucide React.
- A suitable testing framework, such as Vitest, plus Playwright for critical end-to-end flows.

Use compatible stable versions appropriate for the existing repository. Avoid unnecessary dependencies.

Follow server/client component boundaries correctly. Use Server Components by default and Client Components only when interactivity requires them.

## 3. Application purpose

The system allows verified university students to submit private complaints to their lecturers. A main lecturer oversees the system, while other lecturers can be assigned access to specific academic levels and departments.

Students can:

- Sign in securely.
- Submit complaints.
- Upload supporting evidence.
- Track the progress of their complaints.
- Read lecturer responses.
- Send follow-up messages and additional evidence.
- See their complaint history.

Lecturers can:

- View complaints they are authorized to handle.
- Browse complaints by academic level and department.
- Review complaint descriptions and attachments.
- Respond to students.
- Request additional information.
- Update complaint statuses.
- Track unresolved and resolved cases.

Administrators can:

- Manage users and roles.
- Approve student accounts.
- Manage departments.
- Assign students to levels and departments.
- Assign lecturers to levels and departments.
- Configure system settings.
- Audit administrative actions.

The entire application must be responsive on mobile phones, tablets, and desktop computers.

## 4. Roles and permissions

Implement the following roles:

### Student

- Can view and manage only their own complaints.
- Can create complaints when their account is approved and active.
- Can read messages belonging to their complaints.
- Can send messages only within their own complaints.
- Can upload attachments to their own complaints.
- Cannot change their own role, approval state, matriculation number, department, or assigned level.
- Cannot access lecturer or administrative dashboards.

- Can search for and submit complaints to any eligible lecturer in the institution, regardless of the student's own department or academic level.
- Can select the intended lecturer through a database-backed searchable selector.
- Cannot access another student's complaints or choose unauthorized accounts as complaint recipients.

### Lecturer

- Can view complaints only within their assigned academic scope.
- Can read and respond to complaints for which they have explicit authorization.
- Can update statuses only on complaints they are authorized to manage.
- Can download attachments only from authorized complaints.
- Cannot approve users, grant themselves access, assign roles, or modify system permissions.
- Cannot access unrelated departments or levels.

- Can access complaints explicitly assigned to them, including complaints submitted by students from other departments or academic levels.
- Can access additional complaints only when their active academic assignment or explicitly granted institution-wide scope authorizes it.
- Must not gain unrestricted access to another department's complaints merely because a student selected them as the recipient of one complaint.

### Main Lecturer

- Has a dedicated overview of all complaints in the institution or configured scope.
- Can access all complaints only if explicitly granted institution-wide scope.
- Can assign complaints or lecturers where permitted.
- Can oversee escalations, overdue cases, and unresolved complaints.
- Cannot bypass database authorization just because they have a privileged UI role.

### Administrator

- Manages users, account approvals, departments, academic assignments, and lecturer access.
- Can configure academic levels and complaint categories.
- Can view audit logs.
- Should not automatically receive unrestricted complaint-content access merely because they are an administrator. Make access to complaint content an explicit permission granted to the relevant role or user.
- Cannot use client-side role selection to elevate their privileges.

Enforce all permissions on the server and in PostgreSQL Row Level Security (RLS). Hiding a button or protecting a page is not sufficient authorization.

Never trust role, student ID, department ID, level ID, complaint ownership, or lecturer assignment supplied by the browser without checking it against authenticated database records.

## 5. Authentication and account approval

Use Supabase Auth for authentication.

The required student identity information is:

- Full name.
- School email address.
- Student registration/matriculation number.
- Academic level.
- Department.
- Account approval status.

A student must have a verified school email and a registration number linked to their account.

Implement an administrator-controlled onboarding workflow:

1. An administrator creates or imports an approved student record containing the student's school email and registration number.
2. The system invites the student or lets them securely claim their pre-registered record.
3. The student verifies their school email and establishes authentication credentials.
4. The system links the verified Supabase Auth user ID to the approved student record.
5. The student can use the system only after approval and verification are confirmed server-side.

Never allow a student to claim a registration number belonging to another student.

Do not treat a registration number alone as authentication. Do not allow public sign-up to create a privileged account or arbitrary student profile.

Implement secure password reset, logout, session handling, and account deactivation. Use secure Supabase session practices compatible with the selected Next.js version.

Lecturer and administrator accounts must be created or authorized through a trusted administrative workflow. Users must never select their own privileged role during registration.

Use environment variables for Supabase configuration. Keep service-role keys server-only and never expose them through `NEXT_PUBLIC_` variables.

## 6. Academic Structure

Support these default academic levels:

- 100 Level
- 200 Level
- 300 Level
- 400 Level
- 500 Level
- 600 Level
- 700 Level

Build a database-backed academic level and department management system.

The system must support medical students and other programmes that use academic levels up to 700 Level. Academic levels must not be limited to five levels or hardcoded into the application.

Example departments may include:

- Computer Science
- Engineering
- Mathematics
- Physics
- Medicine and Surgery
- Nursing
- Other departments configured by an administrator

These are examples, not a permanently hardcoded department list.

Administrators must be able to create, edit, deactivate, and manage departments and academic levels through the interface.

Academic levels must be stored in the database, seeded with the seven default levels, and managed through safe administrative configuration.

Students must be assigned a valid level and department. Use foreign keys and server-side checks to ensure assignments are valid.

All dashboards, filters, lecturer assignments, reports, and complaint forms must dynamically use the levels and departments configured in the database.
## 7. Main application pages

Build a polished, professional university portal.

### Public pages

- `/` — Landing page describing the system.
- `/login` — Login page.
- `/forgot-password` — Password reset request.
- `/reset-password` — Password reset completion.
- `/unauthorized` — Access denied page.

Do not expose complaint details on public pages.

### Student pages

- `/student/dashboard`
- `/student/complaints`
- `/student/complaints/new`
- `/student/complaints/[id]`
- `/student/profile`

The student dashboard should display:

- Total complaints.
- New complaints.
- Complaints in progress.
- Resolved complaints.
- Recent activity.
- A clear button to submit a complaint.

The complaint list must show the complaint reference, title, category, creation date, and current status.

Students must be able to search and filter their own complaints.

### Lecturer pages

- `/lecturer/dashboard`
- `/lecturer/complaints`
- `/lecturer/complaints/[id]`
- `/lecturer/levels/[levelId]`
- `/lecturer/departments/[departmentId]`
- `/lecturer/settings` where appropriate.

The lecturer dashboard should include:

- Total accessible complaints.
- New and unread complaints.
- In-progress complaints.
- Resolved complaints.
- Complaints awaiting a student response.
- Recent activity.

Provide a clear academic navigation structure with tabs or sidebar links such as:

- All Authorized Complaints
- 100 Level
- 200 Level
- 300 Level
- 400 Level
- 500 Level
- Department-specific views, such as 200 Level → Computer Science
- Department-specific views, such as 200 Level → Engineering

Allow level and department filters to work together.

Do not display complaints merely because a lecturer can see a particular tab. Every returned record must satisfy the lecturer's server-side authorization scope.

### Main lecturer pages

- `/main-lecturer/dashboard`
- `/main-lecturer/complaints`
- `/main-lecturer/assignments`
- `/main-lecturer/reports`

Provide overview statistics, assignment management, escalation tracking, and authorized complaint review.

### Administrator pages

- `/admin/dashboard`
- `/admin/users`
- `/admin/students`
- `/admin/lecturers`
- `/admin/departments`
- `/admin/levels`
- `/admin/categories`
- `/admin/assignments`
- `/admin/audit-logs`
- `/admin/settings`

Use pagination for large lists. Use confirmation dialogs for destructive actions and display helpful empty, loading, and error states.

## 8. Complaint submission

Create a complaint form containing:

- Complaint title.
- Complaint category.
- Academic level, prefilled from the student's profile but editable where appropriate.
- Department, prefilled from the student's profile but editable where appropriate.
- Target lecturer: a required searchable lecturer selector that allows students to find and select any authorized lecturer across all departments and academic levels in the institution.
- Detailed complaint description.
- Optional urgency selection.
- Optional supporting attachments.
- A clear privacy notice before submission.

Students must not be restricted to lecturers in their own department or academic level. They must be able to search by lecturer name and, where useful, filter by department or academic level.

The lecturer selector must retrieve lecturer records from the database, support searching and filtering, and display enough information to distinguish lecturers with similar names.

Only active, institution-approved lecturer accounts should appear in the selector. Students must not be able to submit complaints to arbitrary users or manipulate lecturer IDs to bypass authorization.

The selected target lecturer must be stored as part of the complaint or its assignment records. The complaint must be routed to that lecturer according to the application's authorization and complaint-handling policies.

Preserve the student's actual department and academic level as their profile information. Selecting a lecturer from another department must not change the student's own academic details.

Ensure the selected lecturer can access the complaint through explicit complaint assignment or another clearly defined authorization mechanism, without granting them unrestricted access to unrelated complaints.

If a complaint requires escalation or restricted handling, follow the system's existing sensitive-complaint and escalation policies.

Complaint categories should be database-driven and configurable by administrators. Provide reasonable initial categories, such as:

- Academic and examination issues.
- Lecturers and teaching.
- Registration and administrative issues.
- Facilities and equipment.
- Harassment or misconduct.
- Other.

Treat sensitive allegations carefully. Do not automatically broadcast high-sensitivity complaint categories to a broad group of lecturers. Provide a restricted routing/escalation policy controlled by authorized staff.

Generate a unique, human-readable complaint reference on the server. Ensure uniqueness using a database constraint or equivalent reliable mechanism.

The server must derive the authenticated student's identity from the verified session and database. Never accept a browser-supplied student ID as proof of ownership.

Validate all form data server-side using Zod. Set sensible maximum lengths and reject malformed or oversized requests.

After successful submission:

1. Persist the complaint.
2. Persist any validated attachment metadata.
3. Create an audit/activity event.
4. Route the complaint to the authorized main lecturer or relevant assigned lecturers according to the configured routing policy.
5. Display a success message and the complaint reference.

Use appropriate database transactions or safe compensating operations to avoid inconsistent records when multiple steps fail.

## 9. Complaint statuses and lifecycle

Implement these statuses:

- `submitted` — Complaint received.
- `under_review` — A lecturer has begun reviewing it.
- `awaiting_student` — More information is required from the student.
- `resolved` — The issue has been resolved.
- `closed` — The case has been formally closed.
- `reopened` — The case has been reopened for further review.

Define allowed status transitions in a central server-side service. Reject invalid transitions and unauthorized changes.

Students can view status history and request reopening where policy permits. Only authorized lecturers or the main lecturer may perform privileged status changes.

Store timestamps for submission, first review, resolution, and closure when applicable.

Keep a status history containing the previous status, new status, actor, timestamp, and optional reason. Do not silently overwrite historical events.

## 10. Private complaint conversations

Each complaint must have a conversation thread.

A conversation supports:

- Student messages.
- Lecturer replies.
- Follow-up questions.
- Optional attachments.
- Message timestamps.
- Read/unread indicators.
- Author identity and role.
- Activity history.

Only the complaint's student and authorized lecturers may access its messages.

Do not create a globally visible message feed.

Implement pagination for long conversations. Preserve message ordering. Use server timestamps.

If real-time updates are implemented using Supabase Realtime, apply the same authorization requirements to subscriptions and events. Polling or refresh-based updates are acceptable for the initial implementation if real-time access would introduce unnecessary risk.

Notify users in the dashboard when they have new messages. Email notifications can be added as an optional integration, but do not claim email notifications work unless they are fully configured and tested.

## 11. File attachments

Students and authorized lecturers must be able to attach evidence to complaint conversations.

Support these formats:

- Images: JPEG, PNG, and WebP.
- Documents: PDF, DOC, and DOCX.
- Audio: MP3, M4A, WAV, and WebM audio where supported by the chosen browser.
- Additional formats only when explicitly validated and justified.

Set configurable limits for individual file size, total attachment count, and total request size. Use conservative defaults, for example a 10 MB limit per file and up to five attachments per submission. Make these values configurable through trusted server settings.

Implement all of the following:

1. Validate file extension, declared MIME type, actual file signature where practical, and file size.
2. Generate random storage object names. Do not use the original filename as the storage path.
3. Store files in a **private Supabase Storage bucket**.
4. Never make complaint evidence publicly accessible.
5. Keep storage paths and attachment metadata in PostgreSQL.
6. Associate each attachment with its complaint and message or submission.
7. Authorize every upload, read, download, and deletion on the server.
8. Use short-lived signed URLs only after authorization has been verified.
9. Do not return permanent public URLs for evidence.
10. Escape and safely display original filenames.
11. Restrict SVG and executable formats by default.
12. Avoid trusting file extensions alone.
13. Consider malware scanning integration as a future enhancement; do not claim files are malware-free without scanning.
14. Ensure deleting or removing an attachment cannot be used to access another complaint's file.

Use a storage path structure that avoids leaking student identity, such as randomized object identifiers grouped by complaint ID, with access still protected by server authorization and Storage policies.

Configure Storage RLS policies where supported. Do not rely solely on application code for private bucket security.

If the application uploads files directly to Supabase Storage, make sure Storage policies authorize the operation. If a trusted server upload flow is used, keep the service-role credential on the server and perform explicit authorization before using it.

Provide a file preview or download experience appropriate to each format. Do not render untrusted file content as raw HTML.

## 12. Database schema and migrations

Create version-controlled SQL migrations under `supabase/migrations/`.

Use UUID primary keys, foreign keys, indexes, timestamps, and database constraints where appropriate.

Implement at least these tables:

### `profiles`

Fields:

- `id` UUID referencing `auth.users`.
- `full_name`.
- `email`.
- `role` — student, lecturer, main_lecturer, or admin.
- `is_active`.
- `created_at`.
- `updated_at`.

Do not let users modify their own role through profile updates. Use trusted server-side role management.

### `academic_levels`

Fields:

- `id`.
- `name`, such as 200 Level.
- `level_number`.
- `is_active`.
- `created_at`.

- Seed the seven default levels, from 100 Level through 700 Level.
- Support additional levels through administrator-managed configuration when required.


### `departments`

Fields:

- `id`.
- `name`.
- `code` where useful.
- `description` where useful.
- `is_active`.
- `created_at`.
- `updated_at`.

Enforce suitable uniqueness constraints.

### `students`

Fields:

- `id`.
- `profile_id`, linked to the student's profile after identity verification.
- `registration_number`, unique and protected.
- `level_id`.
- `department_id`.
- `approval_status`, such as pending, approved, rejected, or suspended.
- `approved_by`.
- `approved_at`.
- `created_at`.
- `updated_at`.

Allow securely pre-registered student records to exist before they are linked to an authenticated profile. Prevent duplicate claims and race conditions.

### `lecturer_assignments`

Fields:

- `id`.
- `lecturer_profile_id`.
- `level_id`, nullable only if the assignment model explicitly permits broader scope.
- `department_id`, nullable only if the assignment model explicitly permits broader scope.
- `scope_type`, for example department-level, level-wide, or institution-wide.
- `is_active`.
- `created_by`.
- `created_at`.

Enforce a clear, testable authorization model. Avoid interpreting missing scope fields as unlimited access by accident.

### `complaint_categories`

Fields:

- `id`.
- `name`.
- `description`.
- `is_sensitive`.
- `is_active`.
- `created_at`.

### `complaints`

Fields:

- `id`.
- `reference_number`, unique.
- `student_id`.
- `title`.
- `description`.
- `category_id`.
- `level_id`.
- `department_id`.
- `status`.
- `priority`.
- `assigned_lecturer_profile_id`, nullable where the routing model allows.
- `created_at`.
- `updated_at`.
- `first_reviewed_at`.
- `resolved_at`.
- `closed_at`.

- `target_lecturer_profile_id`, referencing the lecturer selected by the student.

Use foreign keys and indexes for owner, status, level, department, category, assigned lecturer, and creation time.

Keep the level and department snapshot on a complaint so historical cases remain correctly categorized if a student changes academic assignment later. Clearly document how that snapshot interacts with current lecturer assignments.

### `complaint_messages`

Fields:

- `id`.
- `complaint_id`.
- `author_profile_id`.
- `body`.
- `created_at`.
- `edited_at` where editing is supported.

Prevent unauthorized edits or deletions of conversation history. Prefer append-only messages for the initial version.

### `complaint_attachments`

Fields:

- `id`.
- `complaint_id`.
- `message_id`, nullable for initial complaint attachments.
- `uploaded_by_profile_id`.
- `storage_path`.
- `original_filename`.
- `mime_type`.
- `file_size`.
- `created_at`.

Enforce complaint and message relationships. Never store public URLs as the authorization mechanism.

### `complaint_status_history`

Fields:

- `id`.
- `complaint_id`.
- `actor_profile_id`.
- `old_status`.
- `new_status`.
- `reason`.
- `created_at`.

### `complaint_read_receipts` or equivalent read-state structure

Track read/unread state per authorized user and complaint or message, with appropriate constraints.

### `audit_logs`

Fields:

- `id`.
- `actor_profile_id`, nullable for trusted system events.
- `action`.
- `entity_type`.
- `entity_id`.
- `metadata` containing only safe, non-secret details.
- `created_at`.

Do not store passwords, access tokens, service-role keys, raw attachment contents, or unnecessarily sensitive complaint text in audit metadata.

Create additional tables only when justified by the architecture, such as complaint assignments, invitations, notification preferences, or app settings.

## 13. Row Level Security and database security

Enable RLS on every table that contains private data or controls authorization.

Create explicit policies and helper functions where appropriate.

Required security properties:

- Students can select only their own student record and complaints.
- Students can insert complaints only when their account is approved and active.
- Students cannot impersonate another student by changing submitted IDs.
- Students cannot update their complaint ownership, assigned lecturer, status, or other privileged fields.
- Students can read and write messages only in their own authorized complaint threads.
- Lecturers can read complaints only when an active assignment authorizes access to the complaint's level and department, or an explicit institution-wide assignment grants access.
- Lecturers cannot assign themselves broader access.
- Administrators can manage configuration and accounts only within their permissions.
- Complaint-content access must be explicitly authorized.
- Attachment access must follow complaint authorization.
- Unauthenticated users cannot read private complaints, messages, profiles, or attachment metadata.
- Role and approval fields must not be user-editable through generic profile update policies.

Use narrowly scoped database functions where needed. If using `SECURITY DEFINER`, set a safe `search_path`, minimize privileges, validate inputs, and prevent privilege escalation.

Review policies for recursion and accidental privilege leaks.

Never use the Supabase service-role key in browser code. Do not use a service-role client as a shortcut around missing RLS policies.

## 14. User interface and design

Design a professional university system that feels trustworthy and easy to use.

Visual direction:

- Clean, modern, restrained university portal.
- Accessible typography and clear hierarchy.
- Neutral backgrounds with one consistent accent color.
- Clear status badges.
- Responsive sidebar on desktop and suitable mobile navigation.
- Comfortable form spacing.
- Readable complaint conversation timeline.
- Distinct student and staff dashboard layouts.
- Loading skeletons, empty states, confirmation dialogs, success feedback, and useful error messages.
- Accessible keyboard navigation, visible focus states, labels, and adequate contrast.

The lecturer's level and department navigation must be easy to discover. Use nested navigation, tabs, or filters as appropriate.

Never display a student's private complaint title, description, or attachment preview in a global dashboard unless the signed-in user is authorized to see it.

## 15. Search, filtering, and reporting

Implement:

- Search by complaint reference and title within the user's authorized scope.
- Filters for status, level, department, category, priority, and date.
- Sorting by newest, oldest, priority, and last activity.
- Server-side pagination.
- Summary statistics computed from authorized records.
- Main lecturer reports for counts and trends within the lecturer's granted scope.

Do not calculate global statistics in a way that leaks complaint existence or private details to unauthorized users.

## 16. Notifications and activity

Create an activity timeline for important events:

- Complaint submitted.
- Complaint assigned.
- Lecturer first reviewed complaint.
- Student or lecturer added a message.
- Status changed.
- Complaint resolved, closed, or reopened.

Show in-app unread indicators. Use safe, non-sensitive notification text.

Make notifications subject to the same authorization rules as complaints. Do not expose private complaint details in notification payloads visible to unauthorized users.

## 17. Seed data and demo mode

Provide a seed script or documented development-only SQL for:

- The five academic levels.
- Example departments.
- Example complaint categories.

Do not seed production with default administrator credentials.

Do not create a backdoor or hardcoded admin password.

If demo accounts are needed, provide an explicit development-only setup procedure using Supabase Auth and clearly fake sample data. Ensure demo setup cannot run accidentally in production.

Include instructions for creating the first administrator securely.

## 18. Environment configuration

Create or update `.env.example` with placeholder values only, such as:

`NEXT_PUBLIC_SUPABASE_URL=`

`NEXT_PUBLIC_SUPABASE_ANON_KEY=`

`SUPABASE_SERVICE_ROLE_KEY=`

Add any other required variables with explanations.

Use the publishable/anonymous key in the browser only where appropriate. Keep `SUPABASE_SERVICE_ROLE_KEY` strictly server-only.

Never commit `.env.local`, real API keys, service-role keys, passwords, or other credentials.

If any real secrets are found in tracked files, do not print them. Explain the risk and provide safe remediation steps.

## 19. Error handling and operational safety

Implement:

- Server-side input validation.
- Safe error messages that do not reveal secrets or internal database details.
- Logging that excludes credentials and unnecessary sensitive content.
- Rate limiting or an appropriate abuse-control mechanism for login, complaint submission, and uploads.
- Protection against unauthorized ID guessing.
- Secure session checks on every protected server action and API route.
- Safe handling of expired sessions.
- Upload size and request limits.
- Clear failure behavior if database or storage operations fail.
- A reliable not-found response for inaccessible complaint IDs without revealing whether another user's complaint exists.

Use transactions or database functions for multi-step operations that must remain consistent.

## 20. Automated tests

Write meaningful automated tests, not just a checklist.

### Unit tests

Test:

- Zod validation for complaint forms.
- File type and size validation.
- Complaint reference generation.
- Status transition rules.
- Role and assignment authorization helpers.
- Level and department filtering.
- Student registration claim validation.

### Database and RLS tests

Test the following scenarios against a dedicated test Supabase project or local Supabase instance:

1. Student A cannot read Student B's complaint.
2. Student A cannot read Student B's messages.
3. Student A cannot download Student B's attachments.
4. A lecturer assigned to 200 Level Computer Science cannot access 300 Level Engineering complaints unless explicitly assigned.
5. A lecturer cannot grant themselves additional assignments.
6. An unapproved student cannot submit a complaint.
7. A student cannot promote themselves to lecturer or admin.
8. An unauthorized user cannot change complaint status.
9. A signed-out user cannot read complaint data.
10. A main lecturer can access complaints only within the scope explicitly granted to them.
11. A deactivated lecturer loses access to assigned complaints.
12. An attachment cannot be accessed by guessing its storage path.

Do not claim these tests pass unless they were actually run.

### End-to-end tests

Use Playwright for critical flows:

- Student login.
- Complaint submission.
- Attachment upload.
- Lecturer receives and opens an authorized complaint.
- Lecturer replies to the student.
- Student reads the reply.
- Lecturer updates complaint status.
- Student sees the updated status.
- Administrator manages a department.
- Unauthorized access attempts are rejected.

- A student can search for lecturers outside their own department and academic level.
- A student can submit a complaint to an eligible lecturer from another department.
- An unauthorized or inactive account cannot be selected as a complaint recipient.
- A lecturer can access a cross-department complaint explicitly assigned to them.
- Selecting a lecturer does not grant them access to unrelated complaints.
- Academic levels from 100 Level through 700 Level appear correctly in forms, filters, assignments, and reports.
- Administrators can configure academic levels without requiring code changes.

Use separate test identities and isolated test data. Never run destructive tests against production data.

## 21. Documentation and deployment

Create a comprehensive `README.md` containing:

- Project overview.
- Prerequisites.
- Installation commands.
- Environment variable setup.
- Supabase project setup.
- Database migration instructions.
- Storage bucket setup.
- RLS policy deployment.
- First administrator creation.
- Student invitation and approval workflow.
- Lecturer assignment workflow.
- Development server instructions.
- Type checking, linting, unit tests, and end-to-end test commands.
- Production deployment instructions for Vercel.
- Security considerations and known limitations.

Include the exact commands appropriate to the final project.

Document any required Supabase Dashboard actions that cannot be automated safely. Do not claim migrations have been applied to a remote Supabase project unless they actually have.

## 22. Implementation sequence

Implement in this order:

1. Inspect the repository and present the implementation plan.
2. Establish or preserve the application foundation and dependencies.
3. Create database migrations, seed scripts, and typed database models.
4. Implement Supabase clients and secure authentication/session handling.
5. Implement roles, account approval, assignments, and authorization helpers.
6. Enable RLS and private Storage policies.
7. Build student complaint creation, listing, and detail views.
8. Implement private conversation threads and status history.
9. Implement secure attachment upload, preview, and download.
10. Build lecturer dashboards, level navigation, department filters, and complaint workflows.
11. Build main lecturer and administrative dashboards.
12. Implement audit logs, unread indicators, and reporting.
13. Add unit, authorization, database, and end-to-end tests.
14. Update documentation and `.env.example`.
15. Run the available validation commands and fix the issues introduced by the implementation.

## 23. Final verification and completion report

Before declaring the application complete:

- Run the package manager's installation/lockfile consistency check.
- Run TypeScript type checking.
- Run linting.
- Run unit tests.
- Run a production build.
- Run database/RLS tests when a test database is available.
- Run critical end-to-end tests when their required environment is available.
- Inspect for accidental client exposure of service-role credentials.
- Review all complaint and attachment access paths for authorization gaps.
- Review RLS policies for unauthorized access.
- Confirm no public Storage bucket or permanent public attachment URL is used for private evidence.
- Confirm no hardcoded privileged credentials or production demo accounts exist.

Fix implementation-caused failures before completion. If an external dependency or missing Supabase configuration prevents a test from running, report exactly which test was blocked and why. Do not claim unexecuted tests passed.

At the end, provide:

1. A concise summary of what was implemented.
2. The important files and migrations created.
3. Any Supabase Dashboard setup still required.
4. The environment variables the developer must configure.
5. Exact commands to run locally.
6. Exact commands to run tests and build for production.
7. A clear list of tests that passed, failed, or could not run.
8. Any remaining limitations or production-readiness concerns.

**Final requirement:** Deliver a functional, secure, maintainable application. Do not stop after generating the UI, do not leave core functionality as TODOs, and do not weaken authorization to make a demo work.