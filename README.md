# Student Complaint Management System

A private, role-based system where approved students send complaints to a lecturer of their choice (including a lecturer in another department), lecturers and main lecturers handle them, and administrators manage people and reference data. Built with Next.js (App Router), strict TypeScript, Tailwind, Supabase (Postgres, Auth, private Storage) and Zod.

The original specification is preserved verbatim in [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md). The detailed history of the build, audit and validation notes is in [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md).

> **Read this first: what has and has not been verified.**
> Dependencies are installed locally and `tsc`, ESLint, `next build`, the unit tests and the SQL tests run and pass (see [Tests and checks](#tests-and-checks)). **The browser UI and a real Supabase project (Auth, Storage, e-mail) have not been exercised end to end.** The database layer is tested against a plain PostgreSQL with Supabase stand-ins, not real Supabase. See [Implemented vs verified](#implemented-vs-verified).

## Roles and what they can do

| Role | Area | Capabilities |
| --- | --- | --- |
| Student | `/signup`, `/student/*` | Register themselves (account is pending until an admin approves it), or claim a record an admin pre-registered; once approved: submit complaints (any lecturer, any department), attach files, search/filter their own complaints, converse, reopen a resolved complaint inside the window, see unread indicators; profile picture |
| Lecturer | `/signup?as=lecturer`, `/lecturer/*` | Register themselves (pending until approved, ordinary lecturer role only) or join by invitation; once approved: queue of complaints they are authorised to see (assignment scope or explicit access), filters (status, level, department, category, priority, dates, sort), detail, replies with attachments, permitted status transitions, escalation to a main lecturer, own settings and profile picture |
| Main lecturer | `/main-lecturer/*` + `/lecturer/complaints/[id]` | Everything a lecturer can do, plus oversight, triage of sensitive complaints, assigning/revoking access, reports (status counts, trend, overdue) |
| Administrator | `/admin/*` | Registrations (approve / reject pending students and lecturers), users, students (register, approve, CSV import, invite), staff invitations, departments, academic levels, complaint categories, lecturer assignments, audit logs, settings. **Cannot read or act on complaints.** |

## Security model (summary)

* All complaint data is reached through Row Level Security and `SECURITY DEFINER` RPCs; the browser has no direct write access to complaint tables.
* A student sees only their own complaints. A lecturer sees only complaints addressed/assigned to them or inside an explicit assignment scope. Sensitive complaints are visible by institution scope only to main lecturers. Administrators have no complaint-content access.
* Authorisation uses `auth.getUser()` (never `getSession()`), re-checked in every layout, page, Server Action and route handler. The role layouts only choose which area a user may enter; RLS decides rows.
* History, events and audit logs are append-only. Audit rows omit names, emails and registration numbers.
* **Self-registration never grants access by itself.** New student and lecturer accounts start `pending`; the database (not just the UI) withholds every protected capability until an administrator approves them (see [Registration and approval](#registration-and-approval)). Main-lecturer and administrator roles can never be self-assigned.
* The **service-role key is used in exactly one place**: sending invitation e-mails (`src/lib/admin/invite.ts` via `src/lib/supabase/admin.ts`), after an admin check. It is never imported by client code (enforced by `npm run check:boundaries`).
* Profile pictures live in a separate **private** bucket (`avatars`), are re-encoded on the server, and are shown through short-lived signed URLs.
* Attachments live in a **private** bucket. Uploads and downloads use the signed-in user's own session, so Storage policies decide access; there are no public URLs.
* Security headers (HSTS, nosniff, frame deny, referrer and permissions policy) are set in `next.config.ts`. There is no Content-Security-Policy yet.

## Setup

### Prerequisites

* Node.js 20.9 or newer, npm.
* A Supabase project (or the local Supabase stack: Docker + Supabase CLI).
* An SMTP provider configured in Supabase (Auth → SMTP) for invitation and reset e-mails. Supabase's built-in mailer is rate-limited and for testing only.

### 1. Install

```bash
npm install          # NOT YET RUN. There is no lockfile; commit package-lock.json after the first install.
```

`package.json` version ranges were chosen without registry access. Pin or adjust them on first install.

### 2. Environment variables

Copy `.env.example` to `.env.local` (never commit it) and fill in:

| Variable | Where it comes from | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same (anon / publishable key) | public |
| `NEXT_PUBLIC_SITE_URL` | your deployed origin, e.g. `https://complaints.example.edu` (`http://localhost:3000` locally) | public |
| `SUPABASE_SERVICE_ROLE_KEY` | same page (service role key) | **server only**, needed only for sending invitations |

Without the service-role key everything works except the "Send invitation" actions, which then report that invitations are not configured (you can still invite from the Supabase dashboard).

### 3. Database migrations

Apply, in order, the files in `supabase/migrations/`:

```
20261009000001_schema.sql
20261009000002_functions.sql
20261009000003_rpc.sql
20261009000004_rls.sql
20261009000005_storage.sql          (creates the private bucket "complaint-evidence", 10 MB limit)
20261009000006_reference_data.sql   (levels 100–700, categories, default settings)
20261009000007_grants.sql
20261009000008_lecturer_selector_minimal.sql
20261009000009_submit_idempotent.sql
20261009000010_assignable_lecturers.sql
20261010000011_open_registration.sql (self-registration, approval, private "avatars" bucket)
20261010000012_no_email_confirmation.sql (sign-up without a confirmation link; admin overview counts)
20261010000013_registration_scope.sql (level / department chosen at sign-up; public registration_options())
```

* Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
* Or paste each file into the SQL editor, in order.
* Migrations 0001–0007 are the original baseline and must not be edited; changes are new migrations.

### 4. Seed (development only)

`supabase/seed.sql` adds example departments only (no accounts, no passwords). It runs automatically on `supabase db reset`. **Do not run it in production**: create real departments at `/admin/departments`.

### 5. Supabase Auth configuration

Authentication → URL Configuration:
* Site URL = `NEXT_PUBLIC_SITE_URL`.
* Redirect URLs: add `<site>/auth/callback`.

**Manual dashboard settings (the app cannot change these for you):**

1. Authentication → Sign In / Providers → **Email**: enabled.
2. Same page: **"Allow new users to sign up" ON** (needed for `/signup`).
3. Same page: **"Confirm email" OFF**, so a new account can sign in immediately without clicking a link. The hosted project's public settings endpoint reported `mailer_autoconfirm: false` on 2026-10-10, i.e. confirmation was still required then.
4. Authentication → URL Configuration: as above.

The local stack (`supabase start`) gets the same values from `supabase/config.toml`.

What switching "Confirm email" off does and does not do:
* New sign-ups are created already confirmed and are signed in straight away (`/signup` then routes them by their real role and approval status: students to their dashboard, which only shows their status, and lecturers to `/pending`).
* It grants **no** role and **no** approval: new students and lecturers are still `pending` until an administrator approves them.
* An auto-confirmed e-mail address is **not** proof of identity. Since migration 0012, `profiles.email_ownership_verified` is set only when an address is confirmed through a link after the account exists (an invitation, or a confirmation e-mail while confirmation was on). If a sign-up uses the school e-mail of a pre-registered student record that an administrator had already approved, the record is linked but set back to `pending` for review. The review page shows "Email not verified: confirm identity".
* Accounts created **before** the switch that never clicked their link still cannot sign in (Supabase keeps requiring confirmation for them). To let them in without counting it as proof of ownership, run this in the SQL editor: `select public.confirm_existing_unconfirmed_users();` (not callable through the API).

Sign-up through the Auth API is still constrained by the database trigger: it only accepts an invited e-mail, a pre-registered student e-mail, or a registration whose type is `student` or `lecturer`, and the result is always `pending`. Profile creation happens in the same database transaction as the Auth user, so a rejected or failed profile creation rolls the sign-up back (no half-created accounts). If you want invitations only, turn the app setting **"Students and lecturers may register themselves"** off in `/admin/settings` (the trigger then rejects self-registrations) and/or turn Supabase sign-ups off again.

Only if you keep "Confirm email" on: Authentication → Email Templates → **Confirm signup**: route the link through the callback so confirmation works even when the link is opened in another browser:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup&next=/login
```

Authentication → Email Templates → **Invite user** and **Reset password**: make the link go through the app's callback so it works with the server-side session handling:

```
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=invite&next=/reset-password
```
(use `type=recovery` in the reset template).

### 6. Create the first administrator

Nobody can sign up as an admin, so the first one is bootstrapped from the **Supabase SQL editor** (the function cannot be called through the API, not even with the service role):

```sql
select public.bootstrap_first_admin('you@your-school.edu', 'Your Name');
```

* If no account exists for that e-mail yet, it records an admin invitation. Then in the Supabase Dashboard → Authentication → Users, either **Add user → Create new user** (enter the e-mail and a strong password, tick "Auto confirm"), which needs no e-mail, or **Invite user**. The new account becomes an administrator because the invitation matches it.
* If an account already exists for that e-mail (for example you registered at `/signup` first), it promotes that account directly. Sign in with its password.

It refuses to run once an administrator exists or is invited, and it is not callable through the API (not even with the service role). There are no default administrator credentials anywhere in the code or migrations. Nobody can become an administrator through `/signup`, a URL, a request body or browser state: the sign-up trigger only accepts `student` / `lecturer`, and role changes are refused by the database for anyone but another administrator. Further staff (including other administrators, which needs an explicit confirmation tick) are invited from `/admin/lecturers`.

### 7. Before go-live

* Set **allowed student e-mail domains** in `/admin/settings` (empty means any domain is accepted).
* Create departments; check categories (the sensitive flag controls restricted routing); review self-registrations at `/admin/registrations` (or pre-register students one by one / by CSV at `/admin/students` and send invitations); assign lecturers at `/admin/assignments`.

### 8. Run

```bash
npm run dev          # http://localhost:3000
npm run build && npm start
```

## Admin area

**URL:** `/admin` (redirects to **`/admin/dashboard`**), e.g. `http://localhost:3000/admin` locally or `https://<your-site>/admin` in production.

**How to get there:** sign in at `/login` with an administrator account. Administrators are sent to `/admin/dashboard` automatically. If you open any `/admin/...` link while signed out, you are asked to sign in and then returned to that page. The admin pages and links are only shown to administrators; there is no public "admin" link. See [Create the first administrator](#6-create-the-first-administrator) for how the first account is made.

**Protection (three layers):**
1. The middleware sends signed-out visitors to `/login`.
2. `src/app/admin/layout.tsx` calls `requireRole(["admin"])` (verified with `auth.getUser()`). Every admin data function and Server Action calls `requireAdmin()` again; a unit test fails if one does not.
3. The database independently refuses non-administrators: RLS `is_admin()` policies, admin-only RPCs and guard triggers. Covered by the SQL tests in sections B, J, M and P.

| Page | What it does |
| --- | --- |
| `/admin/dashboard` | Waiting approvals; students by status; lecturers, main lecturers and administrators; deactivated accounts; complaint **counts** by status (no content) |
| `/admin/registrations` | Approve or reject self-registered students (approval sets level and department) and lecturers; audit-logged |
| `/admin/students` | Search and filter, register, CSV import, set level, department and approval status, (de)activate the account, invite pre-registered students |
| `/admin/lecturers` | Invite staff (lecturer, main lecturer, or administrator with explicit confirmation); edit home department, title and "accepts complaints"; activate or deactivate; change lecturer ↔ main lecturer |
| `/admin/users` | All accounts: activate/deactivate, lecturer roles |
| `/admin/departments`, `/admin/levels` | Academic configuration. Levels 100–700 are seeded and more can be added (level numbers up to 9999; nothing caps at 500) |
| `/admin/categories`, `/admin/assignments`, `/admin/settings`, `/admin/audit-logs` | Complaint categories, lecturer scopes, settings (including self-registration on/off), audit trail |

**Complaint oversight:** administrators see complaint numbers on the dashboard, never complaint content. Content is visible to an administrator only if another administrator explicitly grants a scope at `/admin/assignments`. Even then administrators cannot act on complaints. This is unchanged.

**Validation and audit:** role changes, (de)activation, approvals, invitations, assignments and settings are validated on the server (Zod) and again by database guards. An administrator cannot change their own role or activation, and the last active administrator cannot be removed. All of these changes are recorded in `/admin/audit-logs` by database triggers and the approval RPC.

## Registration and approval

The university's student and staff records are not available to this system, so registration is open and **an administrator approves every account**.

**Students** register at `/signup` with full name, school e-mail, **level and department**, optional personal e-mail, optional registration/matriculation number, and a password (twice). **Lecturers** use the same page (`/signup?as=lecturer`) with institutional e-mail, **home department** and an optional staff ID. The level and department lists show only **active** rows. They come from `registration_options()`, the one database function signed-out visitors may call; it returns only active level and department names. **Create departments at `/admin/departments` first**: until at least one active department exists, the sign-up page says registration is not open yet. The database rejects a missing, unknown or inactive level/department, and the chosen values are only the applicant's claim: the administrator reviews (and can correct) them when approving. Nothing is matched against a university record and no invitation is needed.

1. The form calls Supabase Auth `signUp` with the anon key (no service role). The Auth account is created immediately with the chosen password. With "Confirm email" off (the intended setting) the user is signed in at once and sent to the page that matches their real role and approval status. If confirmation is still on, they are asked to use the link first.
2. The `handle_new_auth_user` trigger creates the profile. The sign-up metadata is treated as untrusted: only `student` or `lecturer` is accepted as the registration type, the role is set by the trigger (never read from metadata), and every value is re-validated. A student gets a linked `students` row with `approval_status = 'pending'` and no level/department yet. A lecturer gets the `lecturer` role with `staff_details.approval_status = 'pending'`. The personal e-mail and staff ID go into `registration_details`, which only the person and administrators can read. The registration is written to the audit log.
3. A pending user can sign in. Students see their status on the dashboard. Lecturers are sent to `/pending`. In the database a pending student is not an "approved student", and a pending lecturer has **no effective role** (`current_user_role()` returns NULL). So every complaint policy and RPC refuses them, they cannot be chosen as a complaint recipient, and they cannot be given scope assignments.
4. An administrator reviews them at **`/admin/registrations`** (filter by status and type; shows whether the e-mail is confirmed). Approving a student requires choosing a level and department. Approving a lecturer can set the home department. Rejecting keeps the sign-in but grants nothing. Decisions go through the `review_registration` RPC and are recorded in the audit log (`registration.approved` / `registration.rejected`) in addition to the row-level audit triggers.
5. **E-mail confirmation and approval are separate.** Without a confirmation link, an e-mail address proves nothing about identity, so administrators should check identity (for example the registration number with the registry) before approving. The review list marks addresses that were never verified by a link. Signing up or confirming an e-mail never approves anyone.

Self-registered lecturers always get the ordinary lecturer role. An administrator can promote them under **Users** after approval. Main lecturers and administrators are otherwise created only by invitation.

**Existing flows still work.** An invitation for the e-mail takes precedence over self-registration. An admin can still pre-register students (one by one or by CSV, `school_email,full_name,registration_number,level,department`) and invite them. When a student signs up with a pre-registered school e-mail, the record is linked once the e-mail is confirmed, and the "claim your record" form remains for edge cases.

## Profile pictures

Students (on `/student/profile`) and lecturers / main lecturers (on `/lecturer/settings`) can upload, replace or remove a profile picture. It appears there and in the header. Without one, an initials avatar is shown.

* Accepted: JPEG, PNG or WebP up to 2 MB. Checked on the server by size, **file signature**, declared type and extension. SVG, GIF and everything else are refused.
* The server then **decodes and re-encodes** the image with `sharp` to a 256×256 WebP. This drops EXIF/XMP data such as camera details and GPS location, and bounds decoding (pixel limit against decompression bombs). Only the re-encoded file is stored.
* Storage: private bucket `avatars` (WebP only, 512 KB limit), object name `<profile id>/<random uuid>`. Storage policies let users write and delete only in their own folder. A picture is readable by its owner and by people who may see that profile (`can_view_profile`). `set_my_avatar` verifies ownership and that the object exists. A CHECK constraint stops a profile from referencing another person's folder.
* Display uses one-hour signed URLs minted with the viewer's own session.

## Attachments

* Types: JPEG, PNG, WebP, PDF, DOC, DOCX, MP3, M4A, WAV, WebM audio. SVG, HTML and executables are not supported.
* Each file is validated on the server **before** the complaint or message is created: size, extension, **file signature (magic bytes)**, declared type, and the admin allow-list (`/admin/settings`). One bad file rejects the whole request, so nothing is half-saved.
* Flow: validate all files → create complaint/message through the RPC → upload each file to `complaint-evidence/<complaint id>/<random uuid>` with the **user's session** (the Storage insert policy decides) → `register_attachment` (re-checks access, size, type, counts, rate limits).
* Download: `GET /api/attachments/[id]` reads the row under RLS, then issues a 60-second signed URL with forced download and `no-store`. Anyone who cannot open the complaint gets 404.
* Delete: the uploader can remove their own file while the complaint is open (`delete_attachment`, a soft delete; the file immediately becomes unreadable).
* **Limits you must know:** no malware scanning; magic bytes prove a file starts like its type, not that it is harmless; `audio/webm` cannot be told apart from `video/webm`; M4A detection accepts only the "M4A "/"M4B " brands; physically purging soft-deleted or orphaned objects needs the service role and **is not built** (a trusted scheduled job should list objects with no live `complaint_attachments` row and delete them).
* **Hosting limit:** uploads go through Server Actions (`serverActions.bodySizeLimit` is `50mb` in `next.config.ts`). Serverless hosts impose their own request-body ceiling (Vercel Functions: about 4.5 MB). On such hosts large files fail; either lower the limits in `/admin/settings` or move uploads to direct-to-Storage signed upload URLs (a design change that needs a signed-upload policy review). Not tested.

## Tests and checks

```bash
npm run typecheck        # tsc --noEmit
npm run test:unit        # 289 unit tests (node:test via tsx)
npm run check:boundaries # server-only/secret/invisible-character static checks
npm run test:db          # 359 SQL tests on local PostgreSQL 16 + Supabase stand-ins
npm run test:db:supabase # same suite on a real local Supabase stack (needs Docker + CLI)
npm run lint             # ESLint
```

Unit tests cover validation schemas, routing/view parsers, error mapping, navigation, onboarding, attachment signature/policy checks, CSV import, admin schemas/settings, and static contract checks that RPC argument names match the migrations. The SQL suite covers RLS isolation (students, lecturers, main lecturers, admins), sensitive-complaint restrictions, status transitions, append-only history/audit, attachments registration/deletion rules, rate limits, claim flow and reporting, open self-registration (no privileged self-assignment, pending users locked out of complaints, admin-only review with audit entries, verification vs approval) and profile-picture storage policies. Unit tests include avatar re-encoding with real `sharp` (metadata stripped, corrupt files and decompression bombs refused).

## Deployment

1. Create the Supabase project; apply migrations; configure Auth, SMTP and templates (above); bootstrap the first admin.
2. Deploy the Next.js app (Vercel, a container, or any Node host). Set the four environment variables as **server environment variables**; only the three `NEXT_PUBLIC_*` values are exposed to the browser.
3. Set `NEXT_PUBLIC_SITE_URL` to the final HTTPS origin and add `<origin>/auth/callback` to Supabase redirect URLs.
4. Review the hosting body-size limit for attachments (above).
5. Schedule the storage purge job you will need for orphaned/deleted files.
6. Run `npm run build` locally or in CI first; fix whatever the first real build reports.

## Implemented vs verified

| Area | Implemented | Verified how |
| --- | --- | --- |
| Database (schema, RLS, RPCs, storage policies, reporting, registration/approval, avatars) | Yes (13 migrations) | 359 SQL tests passed on PostgreSQL 16 with Supabase stand-ins. **Not** run on real Supabase. |
| Pure logic (validation, parsers, policies, CSV, error mapping, nav, registration, avatars) | Yes | Strict `tsc` clean and 289 unit tests passed. |
| Next.js pages, layouts, Server Actions, route handlers, components | Yes (student, lecturer, main-lecturer, admin, attachments, auth, registration, avatars) | `tsc`, ESLint (0 errors) and `next build` pass. Not opened in a browser. |
| Supabase Auth/Storage/SMTP integration, invitations, self-registration sign-up, avatar uploads | Yes | **Not run** against a project. Needs the migrations applied, Auth sign-ups enabled and the e-mail templates (section 5). |
| Browser/E2E tests, accessibility audit | Not run | |
| Deployment | Documented only | Not attempted. |

Some older files still carry an `// UNVERIFIED` header from before dependencies could be installed; they are now covered by `tsc` and `next build`, but those headers have not been removed file by file.

## Known gaps and risks

* No lockfile is committed yet.
* Self-registration relies on Supabase's own sign-up rate limits and e-mail confirmation; there is no CAPTCHA. Anyone can create a pending account, which grants nothing until approved, but administrators should expect to reject spam registrations.
* A self-registered student who mistypes their school e-mail must be rejected and register again; e-mail changes are not self-service.
* No malware scanning; storage purge job not built; direct-to-Storage uploads not built.
* Notifications are in-app unread indicators only (shell badge, lists); no e-mail notifications for new messages.
* Students cannot be bulk-invited; invitations are sent one at a time.
* Lecturers' scope assignments are managed by admins only.
* The report pages use the existing reporting functions; there is no CSV export.
* Rate limits are enforced in the database per user; there is no per-IP limiting at the edge.
* Real-Supabase differences (auth schema details, storage metadata) may require adjusting the SQL stand-in assumptions; see `docs/BUILD_LOG.md` for the list of likely first-run adjustments.
