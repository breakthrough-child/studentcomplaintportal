# Student Complaint Management System

Private complaints from verified university students to lecturers, with role-based access enforced in PostgreSQL.
Stack (per `docs/SPECIFICATION.md`): Next.js App Router, TypeScript, Tailwind, Supabase (Postgres, Auth, private Storage).

## Status: database layer done (stand-in tested); app foundation written (partly verified)

| Layer | State |
|---|---|
| Database schema, RLS, storage policies, RPCs, seed (`supabase/`) | **Written. 243 database tests pass on local PostgreSQL 16 with Supabase stubs** (237 original + 6 for migrations 0008/0009). |
| Same SQL on a real Supabase project / local Supabase stack | **NOT run: blocked** (no Docker daemon, no Supabase CLI, image/CLI downloads return 403). See Validation log. |
| App foundation, pure modules (env schema, roles/routes, redirect safety, auth zod schemas, profile parsing) | **Written. Strict type-check (0 errors) and 63 unit tests pass locally** (see Application log). |
| App foundation, framework glue (Supabase clients, middleware, guards, login/reset/callback/sign-out, pages) | **Written, NOT compiled or run.** Syntax-parsed only (35 files, 0 syntax errors). `next`, `@supabase/*`, `@types/react` are not installable here. |
| Student portal: submit, list, detail, reply | **Written. Pure logic verified (173 unit tests); pages/actions NOT compiled or run.** Attachments not built. |
| Lecturer, main-lecturer and admin portals | **NOT started** (Stage 4) |
| Playwright end-to-end tests, Vitest | **NOT written, NOT run** (packages unavailable) |
| `npm install` / lockfile, `next lint`, `next build` | **NOT run.** `package.json` version ranges are unverified; there is no lockfile. |
| Email notifications, malware scanning | Not implemented (in-app indicators only, as the spec allows) |

The full original requirements are in `docs/SPECIFICATION.md` and still apply to the remaining work.

## Application (Stage 2: foundation)

Layout: `src/lib/*` holds dependency-free **pure** modules (verified) and thin framework **glue** (unverified, each file starts with `// UNVERIFIED`).

| Piece | Files | Verification |
|---|---|---|
| Environment validation (public vs server, https-only except localhost, no secret-looking `NEXT_PUBLIC_*`, service key must differ from anon key; errors never echo values) | `src/lib/env/schema.ts` (pure), `public.ts`, `server.ts` | schema: type-checked + tested. loaders: unverified |
| Roles and route areas (`/student`, `/lecturer`, `/main-lecturer`, `/admin`; admins get no complaint pages by role) | `src/lib/auth/roles.ts` | type-checked + tested |
| Open-redirect and CSRF helpers | `src/lib/auth/redirect.ts` | type-checked + tested |
| Profile row parsing (inactive = missing) | `src/lib/auth/profile.ts` | type-checked + tested |
| Zod schemas for login / forgot / reset, form-state helper | `src/lib/validation/*.ts` | type-checked + tested |
| Supabase clients: browser, server (per-request, user session, RLS applies), middleware refresh, isolated service-role client (imported by nothing yet) | `src/lib/supabase/*.ts` | **unverified** |
| Session middleware, `requireUser` / `requireRole` (use `auth.getUser()`, never `getSession()`) | `src/middleware.ts`, `src/lib/auth/guards.ts` | **unverified** |
| Pages and actions: `/`, `/login`, `/forgot-password`, `/reset-password`, `/unauthorized`, `/auth/callback`, `/auth/signout` | `src/app/**` | **unverified** |
| Static boundary check (no server modules in Client Components, service key only in env modules, no `getSession()`, no `dangerouslySetInnerHTML`, `.env.example` placeholders only) | `scripts/check-boundaries.mjs` | runs; 10 negative controls verified |

Security decisions in the foundation:

- Sign-in failures all return one message, so the form cannot reveal which e-mail addresses exist. Password reset answers identically for known and unknown addresses.
- `next=` redirects only accept same-site relative paths and fall back to the user's own dashboard when their role may not open the target.
- Sign-out is POST-only with an Origin / `Sec-Fetch-Site` check. A completed password reset signs the user out everywhere.
- The middleware only checks "signed in?"; every protected page and action must still call `requireRole()`, and RLS decides rows.
- Not yet built: login rate limiting (rely on Supabase Auth's built-in limits; the database already limits submissions, messages and uploads), typed database models (Supabase type generator unavailable), the invitation workflow that will use the service-role client.

### Application log (2026-10-09)

Environment: Node 22.22.0, npm 10.9.4. No `npm install` was possible. These checks used locally pre-installed tools (TypeScript 6.0.3, zod 3.25.76, tsx 4.23.12, `@types/node`); `package.json` asks for TypeScript ^5.9.

```bash
# 1. Strict type-check of the pure modules + their tests (config kept outside the repo; it only
#    points "zod" and the type roots at /opt/npm-tools). Result: 0 errors.
/opt/npm-tools/node_modules/.bin/tsc -p <scratch>/verify.tsconfig.json

# 2. Unit tests (Node's built-in node:test runner via tsx). Result: 63 pass, 0 fail.
NODE_PATH=/opt/npm-tools/node_modules /opt/npm-tools/node_modules/.bin/tsx --test tests/unit/*.test.ts

# 3. Syntax-only parse of all .ts/.tsx (no types, no module resolution). Result: 35 files, 0 errors.
#    This does NOT prove the glue code compiles or works.

# 4. Static boundary check. Result: passed (30 source files); 10 deliberate violations all caught.
node scripts/check-boundaries.mjs

# 5. Database suite, unchanged. Result: 237 passed / 0 failed (stand-ins, not real Supabase).
./supabase/tests/run-local.sh
```

Mutation check on the unit tests: 7 deliberate security regressions (redirect, role areas, https-only, key reuse, inactive profile, CSRF) were applied to a scratch copy; 6 made tests fail. The 7th (removing the explicit `//` check) is an equivalent mutant because a second layer rejects the same input; removing both layers does fail the tests.

Unit tests use `node:test` rather than Vitest only because Vitest cannot be installed here. The API is close; port when it can.

**Not run, so unverified:** `npm install`, `npm run lint`, `npm run typecheck` (full project), `npm run build`, running the dev server, any request through the glue code, sign-in/reset against a real Auth server, cookie handling in Server Actions, middleware behaviour, Tailwind output, accessibility and responsive layout, Playwright flows.

## Student portal (Stage 3: submission workflow)

Status legend: **verified** = type-checked (strict) and unit-tested; **UNVERIFIED** = never compiled or run (next/react/@supabase packages could not be installed), only syntax-parsed.

| Step | Files | Status |
|---|---|---|
| 3.1 Validation | `src/lib/complaints/schema.ts`, `options.ts` | verified |
| 3.2 Lecturer search | `lecturers.ts`, `rpc-errors.ts` (verified); `data.ts`, `app/student/complaints/new/{search-action.ts,lecturer-picker.tsx}`, `guards.ts#requireApprovedStudent`, `unauthorized/page.tsx` | pure verified, glue UNVERIFIED |
| 3.3 Submission | `rpc.ts` (verified); `data.ts#submitComplaint`, `new/{actions.ts,page.tsx,complaint-form.tsx}` | pure verified, glue UNVERIFIED |
| 3.4 List/detail/reply | `student-view.ts`, `reply.ts` (verified); `student-data.ts`, `app/student/complaints/{page,loading,error,actions}`, `[id]/{page,not-found,reply-form}` | pure verified, glue UNVERIFIED |

Tests: `tests/unit/{complaint-schema,form-options,lecturer-search,rpc-errors,submit-rpc,student-view,reply}.test.ts`.

Design decisions
- The only write path is the atomic `submit_complaint` RPC; there is no second insert path. Student identity is never sent: the function reads `auth.uid()`. The schema is `.strict()`, so `studentId`, `role`, `status`, etc. are rejected, and the FormData extractor reads allow-listed fields only.
- The lecturer is chosen from `search_lecturers` (all departments and levels). The complaint's own level/department are separate fields (blank = student's profile values) and are never derived from the lecturer. Levels come from the database (100-700 seeded), not code.
- The browser receives only `{id, name, title, department}` per lecturer; `scope_labels` and `home_department_id` returned by the RPC are dropped on the server.
- Eligibility, sensitive-category routing, the explicit assignment and the rate limit are enforced inside the database function. Raw DB error text is never shown (`rpc-errors.ts`).
- List/detail use RLS-bound reads (`student_id` filter is defence in depth). Missing, malformed and not-yours ids all give `not_found`. Staff ids are not sent to the browser.

Commands and actual results (2026-10-09, `verify.sh`)
- Type check (strict, pure modules + tests, TypeScript 6.0.3 from /opt/npm-tools): **0 errors**.
- Unit tests, `tsx --test tests/unit/*.test.ts` (same as `npm run test:unit`): **163 tests, 163 pass, 0 fail**.
- `node scripts/check-boundaries.mjs`: **passed (43 files)**.
- Syntax parse of all ts/tsx: **54 files, 0 errors** (syntax only, not type-checked).
- Database stand-in suite: 243/243 after migrations 0008 and 0009 (see the audit section).

NOT verified
- `next build`, `next dev`, any rendering, Server Action behaviour, `useActionState`, `@supabase/ssr` calls, the Supabase column lists in `.select()` against a live PostgREST, and any browser/E2E behaviour. Unit tests prove validation and pure logic only, not DB or integration behaviour; the static contract tests only compare names against the migration text.

## Integration and security audit (2026-10-09)

Scope: contracts between the TypeScript code and the SQL, and the student-facing attack surface. No git repository exists in this folder, so there was no `git status`; nothing was discarded or overwritten.

### Install and build: BLOCKED (not run)
- `timeout 60 npm view next version` was killed after 60 s with no output; `curl https://registry.npmjs.org/next` failed with "Could not resolve host". Node 22.22.0 / npm 10.9.4 are present; no lockfile exists, so nothing was regenerated. One attempt only; not retried.
- Therefore NOT run: `npm install`, `npm run lint`, `next build`, `next dev`, Vitest, Playwright. Locally available: TypeScript 6.0.3, zod 3.25.76, tsx; `next`, `@supabase/*`, `eslint`, `@types/react` are absent.
- Extra check (a weaker substitute, NOT a compile): the framework glue was type-checked against permissive local stubs of next/react/@supabase (`scratchpad/stubs`). It reported no cross-module errors (wrong imports, names or props between our own files); the only errors were stub artefacts (implicit-any callback parameters, the `.css` side-effect import). It says nothing about the real framework APIs.

### Findings and fixes (new migrations; the original seven are untouched)
1. **Lecturer assignments disclosed to students (fixed, migration 0008).** `search_lecturers` returned `scope_labels` (which levels/departments a lecturer covers) to any approved student calling the RPC directly; the app hid it but the API did not. 0008 drops and recreates the function without that column and re-applies grants (revoked from public/anon). Tests C12a-C12c; with 0008 removed C12a and C12b fail. Residual: the department/level *filters* still let a student infer whether a lecturer has an assignment in a given level or department (inherent to filtering; the spec asks for those filters). `home_department_id`/name remain (needed to tell lecturers apart).
2. **Duplicate submissions (fixed, migration 0009).** A double click or retry created two complaints. `submit_complaint` now returns the existing complaint when the same student resubmits identical text, category, recipient and scope within two minutes. Tests C18a-C18c; with 0009 removed they fail (plus 6 downstream count tests, showing the duplicate really was created). Same signature, so grants are kept. Only identical content is deduplicated; the hourly rate limit still applies.
3. Checked, no change needed: `submit_complaint` and `post_message` parameter names match the TypeScript (static contract tests); identity comes from `auth.uid()`; the recipient is validated by `_is_eligible_lecturer` (active, accepts complaints, role lecturer/main lecturer; same generic error for every failure); the lecturer's department never feeds the complaint's level/department (database test C5/C17 and unit tests); sensitive categories are not auto-assigned; `complaints`/`complaint_messages`/attachments have no write grants for API roles (K6); the evidence bucket is private (K7); the service-role key appears only in `env/schema.ts`, `env/server.ts`, `supabase/admin.ts` (boundary check).

### Verified vs pending
- Verified (local only): strict type-check of pure modules (0 errors); 173/173 unit tests; boundary check (51 files); 63 files syntax-parsed; 243/243 database stand-in tests.
- Pending: everything that needs real packages or a real Supabase project. No Supabase project or credentials are configured, so migrations 0001-0009 have never run on Supabase. To validate: install with `npm install`, create a disposable Supabase project (or `supabase start`), apply `supabase/migrations/*`, run `supabase/tests/run-supabase.sh` (never executed), then `npm run typecheck && npm run lint && npm run build`.

## Student portal limitations (current)
- Attachments are NOT built. Before building: private upload with server-side size/type/magic-byte validation, `register_attachment`, signed URLs from the server, and tests against the real storage policies.
- No dashboards, so post-login redirects still land on a 404; the student pages are reachable by URL (`/student/complaints`).
- Staff names are not shown in the conversation (only "Staff"); the recipient's name comes from `profiles`, readable to the student under `can_view_profile`; if that lookup fails the page says "Your chosen lecturer".
- No search rate limit; lecturers with identical name, title and department look the same in the picker.
- Reply availability in the UI is only "not closed"; `post_message` is the real gate. Times are shown in UTC.
- Next recommended task: run the real install/build/lint and the Supabase validation above before building more features.

## Validation log (2026-10-09)

### Real local Supabase validation: BLOCKED, NOT RUN

Nothing below was executed against a real Supabase stack. Exact blockers, observed in the build session:

| Needed | Result |
|---|---|
| Docker daemon | `docker` client 29.8.2 is installed, but there is no daemon and no `/var/run/docker.sock`; `docker info` fails. No local images exist (`/var/lib/docker` absent). |
| Supabase images (`ghcr.io`, `registry-1.docker.io`) | Egress proxy answered **403 to CONNECT** for both hosts (policy denial). |
| Supabase CLI | Not installed. Release downloads from `github.com` returned **403**; `npm view supabase` (registry.npmjs.org) hung until timeout, and earlier returned **403**. |

I did not try to route around these restrictions. To finish this validation, run on a machine with Docker and the Supabase CLI:

```bash
./supabase/tests/run-supabase.sh      # supabase start, db reset, run the suite against the real stack
```

`run-supabase.sh` is written but **has never been executed**.

### Stand-in validation: PASSED (237/237)

Commands executed (build session, PostgreSQL 16.15, throwaway cluster):

```bash
PGHOST=... PGPORT=... PGUSER=postgres ./supabase/tests/run-local.sh
# applies supabase_stubs.sql, the 7 migrations, seed.sql, then rls_and_workflow.test.sql
# result: "# passed 237 / failed 0 / total 237"  (re-run after the final edits)
```

What this proves: the migration SQL applies in order; RLS, grants, triggers, RPCs and storage policies behave as the tests assert, with `auth.uid()` and role switching emulated the way PostgREST does it.
What it does **not** prove: anything that depends on real Supabase components (see below).

### Test coverage map (all stand-in only)

| Area | Test ids |
|---|---|
| Student onboarding, claims, rate limit, e-mail domain allow-list, first admin | A1-A17 |
| Privilege escalation, config writes, levels 100-700 | B1-B30 |
| Submission, validation, lecturer selector, cross-department routing, rate limit | C1-C31 |
| Student/anon isolation | D1-D17 |
| Lecturer scope, institution grants, admin has no default content access | E1-E24 |
| Sensitive routing, triage, release, revoke, escalation | F1-F16 |
| Conversation, status machine, reopen window, history | G1-G35 |
| Attachments, storage policies, path guessing, soft delete | H1-H32 |
| Deactivation, last-admin guard | I1-I11 |
| Audit log hygiene, append-only, overdue report | J1-J15 |
| Catalog guards (RLS on, no anon/PUBLIC execute on SECURITY DEFINER, private bucket) | K1-K7 |

## Remaining risks and unverified items

Unverified against real Supabase (each is a place the stand-ins could differ):

1. **`auth.users` triggers.** Creating them from a migration needs the migration role to own/alter `auth.users`; the real table has more columns and GoTrue sets `email_confirmed_at` itself. Test fixtures insert `(id, email, email_confirmed_at)` directly, which may need extra columns on the real table.
2. **Storage.** The real Storage API (not SQL inserts) writes `storage.objects`, sets `owner`/`metadata` itself, and evaluates policies as `supabase_storage_admin` with the caller's JWT. `register_attachment` assumes `metadata->>'size'` holds the byte size; policies on `storage.objects` created from a migration may need the dashboard or CLI to apply. Signed-URL creation for non-owners has not been tried.
3. **Role defaults.** Real Supabase pre-grants broadly on `public`; migration 0007 revokes them, and tests K1-K6 only checked this on the stand-in default privileges.
4. **JWT/session.** `auth.uid()` was driven by `request.jwt.claim.sub`; PostgREST on current Supabase uses `request.jwt.claims`. The real `auth.uid()` handles both, but the tests never exercised a real token.
5. **`SECURITY DEFINER` ownership.** Functions are owned by the migration role (`postgres`); the "not FORCEd RLS" design assumes that role bypasses RLS, as it does on Supabase.

Other known limitations:

- File **content** sniffing (magic bytes) is not in the database; the server upload route must do it.
- Read receipts use wall-clock time; a message committed just after a reader's receipt could be shown as read.
- Soft-deleted attachments stay in the bucket until a trusted purge job removes them.
- New SQL functions must revoke PUBLIC execute explicitly (test K1 catches mistakes).
- Not started: the Next.js application, Zod validation, Vitest unit tests, Playwright end-to-end tests, type check, lint, build.

## What the database layer enforces

- **Writes only through RPCs.** Complaints, messages, attachments, history and events have no write grants for API roles. `submit_complaint`, `post_message`, `transition_complaint_status`, `register_attachment`, `delete_attachment`, `assign_complaint`, `revoke_complaint_access`, `escalate_complaint`, `claim_student_record`.
- **Student recipient choice without wider access.** A student can pick any active lecturer who accepts complaints (`search_lecturers`). The pick creates one explicit `complaint_access` row, and nothing else. Level and department stay a snapshot on the complaint; the student's own profile never changes.
- **Lecturer scope.** Active `lecturer_assignments` (`institution`, `level`, `department`, `department_level`; shape enforced by a CHECK so a NULL never means "everything"). Matching uses the complaint's snapshot.
- **Sensitive categories.** Not auto-assigned. Only a main lecturer with institution scope, or an explicit grant, sees them. Sensitivity can be raised, never lowered.
- **Admins** get no complaint content unless another admin grants a scope. They can read granted complaints but never act on them.
- **Onboarding.** An `auth.users` trigger rejects any e-mail that is neither an unconsumed staff invitation nor a pre-registered student. Students link by verified e-mail only; the registration number is a second check, and failed claims are rate limited.
- **Append-only** messages, status history, events and audit logs (also for the table owner). Audit metadata holds column names/ids, never complaint text, names, e-mails or registration numbers.
- **Private bucket** `complaint-evidence`, objects named `<complaint_id>/<random uuid>`, read/insert policies tied to complaint access, no update/delete policy.

## Run the app (once packages can be installed; never yet done)

```bash
npm install                      # also creates the lockfile; versions in package.json are unverified
cp .env.example .env.local       # fill in the Supabase URL and anon key, never commit the file
npm run typecheck && npm run lint && npm run test:unit && npm run check:boundaries
npm run dev
```

## Run the database tests (local, disposable PostgreSQL)

```bash
# needs a running PostgreSQL 16 you do not mind losing a database on
export PGHOST=... PGPORT=... PGUSER=postgres
./supabase/tests/run-local.sh          # drops/recreates DB "scms_test"
```

`supabase/tests/support/supabase_stubs.sql` emulates `auth`, `storage` and the Supabase roles. It is test-only; never apply it to a real project.

## Apply to a real Supabase project (not yet done)

1. Create a project. Turn off public sign-ups (Auth settings) and require e-mail confirmation. The `auth.users` trigger rejects unknown e-mails regardless, as defence in depth.
2. `supabase link --project-ref <ref>` then `supabase db push` (applies `supabase/migrations/*` in order). Run `supabase/seed.sql` only in development.
3. Set `allowed_student_email_domains` in `app_settings` before go-live (empty means any domain).
4. Create the first administrator from the SQL editor: `select public.bootstrap_first_admin('you@school.edu', 'Your Name');` then invite that address from Authentication > Users. It refuses once an administrator exists, and no API role can call it.
5. Validate locally first with `./supabase/tests/run-supabase.sh` (written, never executed; see Validation log).

## Known gaps and risks (database layer)

- Untested on real Supabase: Storage API behaviour (the policies and `storage.objects.metadata->>'size'` check are modelled on documented behaviour), GoTrue, and creating triggers/policies in `auth`/`storage` from a migration.
- File **content** sniffing (magic bytes) is not in the database; the server upload route must do it before registering an attachment.
- Read receipts use wall-clock time; a message committed just after a reader's receipt but stamped before it could be shown as read.
- Soft-deleted attachments stay in the bucket until a trusted purge job removes them.
- New SQL functions must revoke PUBLIC execute explicitly (test K1 catches mistakes).
