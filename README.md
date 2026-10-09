# Student Complaint Management System

A private, role-based system where approved students send complaints to a lecturer of their choice (including a lecturer in another department), lecturers and main lecturers handle them, and administrators manage people and reference data. Built with Next.js (App Router), strict TypeScript, Tailwind, Supabase (Postgres, Auth, private Storage) and Zod.

The original specification is preserved verbatim in [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md). The detailed history of the build, audit and validation notes is in [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md).

> **Read this first: what has and has not been verified.**
> The package registry and Docker were unreachable in the environment this was written in, so **`npm install`, `next build`, ESLint, the browser UI and a real Supabase project have never been run.** The database layer is tested against a plain PostgreSQL with Supabase stand-ins (not real Supabase). The application code that imports `next`, `react` or `@supabase/*` has only been syntax-parsed. See [Implemented vs verified](#implemented-vs-verified). Expect to fix small compile or runtime issues on first install.

## Roles and what they can do

| Role | Area | Capabilities |
| --- | --- | --- |
| Student | `/student/*` | Claim their pre-registered record, submit complaints (any lecturer, any department), attach files, search/filter their own complaints, converse, reopen a resolved complaint inside the window, see unread indicators |
| Lecturer | `/lecturer/*` | Queue of complaints they are authorised to see (assignment scope or explicit access), filters (status, level, department, category, priority, dates, sort), detail, replies with attachments, permitted status transitions, escalation to a main lecturer, own settings |
| Main lecturer | `/main-lecturer/*` + `/lecturer/complaints/[id]` | Everything a lecturer can do, plus oversight, triage of sensitive complaints, assigning/revoking access, reports (status counts, trend, overdue) |
| Administrator | `/admin/*` | Users, students (register, approve, CSV import, invite), staff invitations, departments, academic levels, complaint categories, lecturer assignments, audit logs, settings. **Cannot read or act on complaints.** |

## Security model (summary)

* All complaint data is reached through Row Level Security and `SECURITY DEFINER` RPCs; the browser has no direct write access to complaint tables.
* A student sees only their own complaints. A lecturer sees only complaints addressed/assigned to them or inside an explicit assignment scope. Sensitive complaints are visible by institution scope only to main lecturers. Administrators have no complaint-content access.
* Authorisation uses `auth.getUser()` (never `getSession()`), re-checked in every layout, page, Server Action and route handler. The role layouts only choose which area a user may enter; RLS decides rows.
* History, events and audit logs are append-only. Audit rows omit names, emails and registration numbers.
* The **service-role key is used in exactly one place**: sending invitation e-mails (`src/lib/admin/invite.ts` via `src/lib/supabase/admin.ts`), after an admin check. It is never imported by client code (enforced by `npm run check:boundaries`).
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

Authentication → Providers → Email: enable e-mail sign-in, **disable open sign-ups** (new accounts are accepted only if an invitation or pre-registered student record matches; the database trigger enforces this too), and keep "Confirm email" on.

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

It creates an admin invitation. Then in Supabase Dashboard → Authentication → Users → **Invite user** with the same e-mail. Open the e-mail link, set a password, and you land on `/admin/dashboard`. It refuses to run once an administrator exists. Further staff are invited from `/admin/lecturers`.

### 7. Before go-live

* Set **allowed student e-mail domains** in `/admin/settings` (empty means any domain is accepted).
* Create departments; check categories (the sensitive flag controls restricted routing); register students (one by one, or CSV at `/admin/students`) and send invitations; assign lecturers at `/admin/assignments`.

### 8. Run

```bash
npm run dev          # http://localhost:3000
npm run build && npm start
```

## Student onboarding flow

1. Admin registers the student (school e-mail, registration number, level, department, status) or imports a CSV (`school_email,full_name,registration_number,level,department`; the page validates every row first and imports nothing if any row is invalid).
2. Admin sends the invitation; the student sets a password via the e-mail link.
3. The database links the account to the record when the verified e-mail matches; if needed the student confirms with their registration number on the dashboard ("claim your record").
4. Only **approved** students can submit complaints.

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
npm run test:unit        # 262 unit tests (node:test via tsx)
npm run check:boundaries # server-only/secret/invisible-character static checks
npm run test:db          # 252 SQL tests on local PostgreSQL 16 + Supabase stand-ins
npm run test:db:supabase # same suite on a real local Supabase stack (needs Docker + CLI)
npm run lint             # ESLint (not yet run)
```

Unit tests cover validation schemas, routing/view parsers, error mapping, navigation, onboarding, attachment signature/policy checks, CSV import, admin schemas/settings, and static contract checks that RPC argument names match the migrations. The SQL suite covers RLS isolation (students, lecturers, main lecturers, admins), sensitive-complaint restrictions, status transitions, append-only history/audit, attachments registration/deletion rules, rate limits, claim flow and reporting.

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
| Database (schema, RLS, RPCs, storage policies, reporting) | Yes (10 migrations) | 252 SQL tests passed on PostgreSQL 16 with Supabase stand-ins. **Not** run on real Supabase. |
| Pure logic (validation, parsers, policies, CSV, error mapping, nav) | Yes | Strict `tsc` clean and 262 unit tests passed. |
| Next.js pages, layouts, Server Actions, route handlers, components | Yes (student, lecturer, main-lecturer, admin, attachments, auth) | **Syntax-parse only** (137 files) plus static boundary checks. Never compiled by Next, never rendered, never opened in a browser. |
| Supabase Auth/Storage/SMTP integration, invitations | Yes | **Not run.** Needs a project, the service key, and the e-mail template change. |
| Lint, production build, browser/E2E tests, accessibility audit | Not run | Blocked: registry unreachable. |
| Deployment | Documented only | Not attempted. |

Details of the type-check method: the strict type check covers the "pure" modules (those without an `// UNVERIFIED` header) and their tests, using local copies of `zod` and Node types. It is **not** a Next.js compile.

## Known gaps and risks

* No lockfile; dependency versions untested.
* No malware scanning; storage purge job not built; direct-to-Storage uploads not built.
* Notifications are in-app unread indicators only (shell badge, lists); no e-mail notifications for new messages.
* Students cannot be bulk-invited; invitations are sent one at a time.
* Lecturers' scope assignments are managed by admins only.
* The report pages use the existing reporting functions; there is no CSV export.
* Rate limits are enforced in the database per user; there is no per-IP limiting at the edge.
* Real-Supabase differences (auth schema details, storage metadata) may require adjusting the SQL stand-in assumptions; see `docs/BUILD_LOG.md` for the list of likely first-run adjustments.
