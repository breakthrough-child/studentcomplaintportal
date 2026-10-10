-- =============================================================================
-- Database / RLS / workflow tests (plain psql; no pgTAP needed)
--
-- Runs inside one transaction that is ROLLED BACK at the end, against a
-- database that already has the stubs (local only) + all migrations applied.
-- Role switching mimics PostgREST: SET ROLE authenticated + request.jwt.claim.sub.
--
-- Spec scenarios 1-12 (section 20) are marked [S1]..[S12].
-- =============================================================================
\set ON_ERROR_STOP on
\pset pager off
begin;
\i tests/support/tap_lite.sql

-- ============================== FIXTURES =====================================
insert into tap_lite.fx
select 'L' || level_number, id from public.academic_levels where level_number in (100, 200, 300, 700);

with d as (
  insert into public.departments (name, code)
  values ('Test Computer Science', 'TCS'), ('Test Engineering', 'TENG'), ('Test Mathematics', 'TMTH')
  returning id, code)
insert into tap_lite.fx select 'D_' || code, id from d;

insert into tap_lite.fx select 'catAcad',   id from public.complaint_categories where name = 'Academic and examination issues';
insert into tap_lite.fx select 'catHarass', id from public.complaint_categories where name = 'Harassment or misconduct';

insert into tap_lite.fx (k, v) values
  ('admin1',      'a1000000-0000-0000-0000-000000000001'),
  ('admin2',      'a1000000-0000-0000-0000-000000000002'),
  ('lecCS',       'a1000000-0000-0000-0000-000000000011'),
  ('lecEng',      'a1000000-0000-0000-0000-000000000012'),
  ('lecMain',     'a1000000-0000-0000-0000-000000000013'),
  ('lecTarget',   'a1000000-0000-0000-0000-000000000014'),
  ('lecInactive', 'a1000000-0000-0000-0000-000000000015'),
  ('lecOptOut',   'a1000000-0000-0000-0000-000000000016'),
  ('studA',       'a1000000-0000-0000-0000-000000000021'),
  ('studB',       'a1000000-0000-0000-0000-000000000022'),
  ('studPending', 'a1000000-0000-0000-0000-000000000023'),
  ('studUnconf',  'a1000000-0000-0000-0000-000000000024'),
  ('studD',       'a1000000-0000-0000-0000-000000000025'),
  ('studF',       'a1000000-0000-0000-0000-000000000026'),
  ('studG',       'a1000000-0000-0000-0000-000000000027'),
  ('stranger',    'a1000000-0000-0000-0000-0000000000ff');

-- ============================ A. ONBOARDING ==================================
select tap_lite.throws($$insert into auth.users (id, email) values (tap_lite.id('stranger'), 'stranger@test.example')$$,
  '42501', 'A1 sign-up for an unknown e-mail is rejected by the database');

select public.bootstrap_first_admin('admin1@test.example', 'Admin One');
insert into auth.users (id, email, email_confirmed_at)
values (tap_lite.id('admin1'), 'admin1@test.example', now());
select tap_lite.is_equal((select role::text from public.profiles where id = tap_lite.id('admin1')), 'admin',
  'A2 bootstrap_first_admin + invitation creates exactly the invited admin');
select tap_lite.throws($$select public.bootstrap_first_admin('x@test.example', 'X')$$, '55000',
  'A3 bootstrap_first_admin refuses once an administrator exists');

insert into public.staff_invitations (email, full_name, role) values ('admin2@test.example', 'Admin Two', 'admin');
insert into auth.users (id, email, email_confirmed_at)
values (tap_lite.id('admin2'), 'admin2@test.example', now());

insert into public.staff_invitations (email, full_name, role, department_id, title) values
  ('leccs@test.example',       'Lecturer CS',       'lecturer',      tap_lite.id('D_TCS'),  'Dr'),
  ('leceng@test.example',      'Lecturer Eng',      'lecturer',      tap_lite.id('D_TENG'), 'Prof'),
  ('lecmain@test.example',     'Main Lecturer',     'main_lecturer', tap_lite.id('D_TCS'),  'Prof'),
  ('lectarget@test.example',   'Lecturer Target',   'lecturer',      tap_lite.id('D_TENG'), 'Dr'),
  ('lecinactive@test.example', 'Lecturer Inactive', 'lecturer',      tap_lite.id('D_TENG'), null),
  ('lecoptout@test.example',   'Lecturer OptOut',   'lecturer',      tap_lite.id('D_TENG'), null);
insert into auth.users (id, email, email_confirmed_at)
select f.v, e.email, now()
from (values ('lecCS','leccs@test.example'), ('lecEng','leceng@test.example'),
             ('lecMain','lecmain@test.example'), ('lecTarget','lectarget@test.example'),
             ('lecInactive','lecinactive@test.example'), ('lecOptOut','lecoptout@test.example')) e(k, email)
join tap_lite.fx f on f.k = e.k;

select tap_lite.is_equal((select count(*) from public.staff_invitations where consumed_at is null), 0::bigint,
  'A4 every staff invitation was consumed by its matching sign-up');
select tap_lite.is_equal((select role::text from public.profiles where id = tap_lite.id('lecMain')), 'main_lecturer',
  'A5 role comes from the invitation, never from the sign-up');
select tap_lite.is_equal((select department_id from public.staff_details where profile_id = tap_lite.id('lecEng')),
  tap_lite.id('D_TENG'), 'A6 staff_details carries the home department from the invitation');

update public.profiles set is_active = false where id = tap_lite.id('lecInactive');
update public.staff_details set accepts_complaints = false where profile_id = tap_lite.id('lecOptOut');

insert into public.students (school_email, full_name, registration_number, level_id, department_id, approval_status) values
  ('a@test.example',       'Student A',       'tst/0001', tap_lite.id('L200'), tap_lite.id('D_TCS'),  'approved'),
  ('b@test.example',       'Student B',       'tst/0002', tap_lite.id('L300'), tap_lite.id('D_TENG'), 'approved'),
  ('pending@test.example', 'Student Pending', 'tst/0003', tap_lite.id('L200'), tap_lite.id('D_TCS'),  'pending'),
  ('unconf@test.example',  'Student Unconf',  'tst/0004', tap_lite.id('L100'), tap_lite.id('D_TCS'),  'approved'),
  ('d@test.example',       'Student D',       'tst/0005', tap_lite.id('L100'), tap_lite.id('D_TMTH'), 'approved'),
  ('f@test.example',       'Student F',       'tst/0006', tap_lite.id('L100'), tap_lite.id('D_TMTH'), 'approved'),
  ('g@test.example',       'Student G',       'tst/0007', tap_lite.id('L100'), tap_lite.id('D_TMTH'), 'approved');

select tap_lite.is_equal((select registration_number from public.students where school_email = 'a@test.example'),
  'TST/0001', 'A7 registration numbers are normalised to upper case');

-- Created unconfirmed, then confirmed by "clicking the link" (an UPDATE), which is what proves
-- mailbox ownership since migration 0012 (an auto-confirmed sign-up does not).
insert into auth.users (id, email, email_confirmed_at)
select f.v, e.email, null
from (values ('studA','a@test.example',true), ('studB','b@test.example',true),
             ('studPending','pending@test.example',true), ('studUnconf','unconf@test.example',false),
             ('studD','d@test.example',false), ('studF','f@test.example',true),
             ('studG','g@test.example',true)) e(k, email, confirmed)
join tap_lite.fx f on f.k = e.k;
update auth.users set email_confirmed_at = now()
 where id in (select v from tap_lite.fx where k in ('studA', 'studB', 'studPending', 'studF', 'studG'));

select tap_lite.is_equal((select profile_id from public.students where school_email = 'a@test.example'),
  tap_lite.id('studA'), 'A8 confirmed sign-up is linked to its pre-registered student record');
select tap_lite.is_equal((select profile_id from public.students where school_email = 'd@test.example'),
  null::uuid, 'A9 an UNCONFIRMED e-mail does not claim the student record');
update auth.users set email_confirmed_at = now() where id = tap_lite.id('studD');
select tap_lite.is_equal((select profile_id from public.students where school_email = 'd@test.example'),
  tap_lite.id('studD'), 'A10 confirming the e-mail later links the record');

-- claim_student_record: identity = verified e-mail; registration number is only a second check.
update public.students set profile_id = null where school_email = 'f@test.example';
select tap_lite.as_user(tap_lite.id('studG'));
select tap_lite.is_equal(public.claim_student_record('TST/0006'), false,
  'A11 a student cannot claim a registration number that belongs to someone else');
select tap_lite.as_user(tap_lite.id('studF'));
select tap_lite.is_equal(public.claim_student_record('TST/9999'), false, 'A12 wrong registration number is refused');
select tap_lite.is_equal(public.claim_student_record('tst/0006'), true, 'A13 the rightful, verified owner can claim (case-insensitive)');
select tap_lite.as_postgres();
update public.students set profile_id = null where school_email = 'f@test.example';
select tap_lite.as_user(tap_lite.id('studF'));
select public.claim_student_record('WRONG/1'), public.claim_student_record('WRONG/2'),
       public.claim_student_record('WRONG/3'), public.claim_student_record('WRONG/4');
select tap_lite.is_equal(public.claim_student_record('TST/0006'), false,
  'A14 repeated failed claims are rate-limited, even with the correct number');
select tap_lite.as_postgres();

select tap_lite.throws($$insert into public.students (school_email, full_name, registration_number, level_id, department_id)
  values ('dup@test.example', 'Dup', 'tst/0001', (select v from tap_lite.fx where k='L200'), (select v from tap_lite.fx where k='D_TCS'))$$,
  '23505', 'A15 duplicate registration numbers are rejected by a unique constraint');
select tap_lite.throws($$insert into public.students (school_email, full_name, registration_number, level_id, department_id)
  values ('A@TEST.EXAMPLE', 'Dup', 'TST/7777', (select v from tap_lite.fx where k='L200'), (select v from tap_lite.fx where k='D_TCS'))$$,
  '23505', 'A16 duplicate school e-mails (case-insensitive) are rejected');

update public.app_settings set value = '["uni.test"]'::jsonb where key = 'allowed_student_email_domains';
select tap_lite.throws($$insert into public.students (school_email, full_name, registration_number, level_id, department_id)
  values ('x@other.example', 'X', 'TST/8888', (select v from tap_lite.fx where k='L200'), (select v from tap_lite.fx where k='D_TCS'))$$,
  '22023', 'A17 student e-mail domain allow-list is enforced when configured');
update public.app_settings set value = '[]'::jsonb where key = 'allowed_student_email_domains';

-- ===================== B. PRIVILEGE ESCALATION & CONFIG ======================
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$update public.profiles set role = 'admin' where id = auth.uid()$$, '42501',
  'B1 [S7] a student cannot promote themselves to admin');
select tap_lite.throws($$update public.profiles set role = 'lecturer' where id = auth.uid()$$, '42501',
  'B2 [S7] a student cannot promote themselves to lecturer');
select tap_lite.throws($$update public.profiles set is_active = false where id = auth.uid()$$, '42501',
  'B3 a student cannot change their own activation state');
select tap_lite.throws($$update public.profiles set email = 'new@test.example' where id = auth.uid()$$, '42501',
  'B4 a student cannot change their own e-mail');
select tap_lite.lives($$update public.profiles set full_name = 'Student A Renamed' where id = auth.uid()$$,
  'B5 a student can rename themselves');
select tap_lite.rows_are($$update public.profiles set full_name = 'Hijack' where id <> auth.uid()$$, 0,
  'B6 a student cannot edit anyone else''s profile');
select tap_lite.rows_are($$update public.students set level_id = (select v from tap_lite.fx where k='L700') where profile_id = auth.uid()$$, 0,
  'B7 a student cannot change their own level (RLS filters the update to zero rows)');
select tap_lite.rows_are($$update public.students set approval_status = 'approved' where profile_id = auth.uid()$$, 0,
  'B7b a student cannot change their own approval status');
select tap_lite.throws($$insert into public.departments (name) values ('Hacked Dept')$$, '42501',
  'B8 a student cannot create departments');
select tap_lite.throws($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type)
  values (auth.uid(), 'institution')$$, null, 'B9 a student cannot create assignments');
select tap_lite.rows_are($$update public.app_settings set value = '1'::jsonb where key = 'complaints_per_hour'$$, 0,
  'B10 a student cannot change settings');
select tap_lite.rows_are($$select 1 from public.audit_logs$$, 0, 'B11 a student sees no audit logs');
select tap_lite.rows_are($$select 1 from public.staff_invitations$$, 0, 'B12 a student sees no staff invitations');
select tap_lite.throws($$select public.bootstrap_first_admin('evil@test.example', 'Evil')$$, '42501',
  'B13 bootstrap_first_admin is not callable by API roles');

select tap_lite.as_user(tap_lite.id('lecCS'));
select tap_lite.throws($$update public.profiles set role = 'admin' where id = auth.uid()$$, '42501',
  'B14 a lecturer cannot promote themselves');
select tap_lite.throws($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type)
  values (auth.uid(), 'institution')$$, '42501',
  'B15 [S5] a lecturer cannot grant themselves additional assignments');
select tap_lite.throws($$insert into public.complaint_access (complaint_id, profile_id, reason)
  values (gen_random_uuid(), auth.uid(), 'delegated')$$, '42501',
  'B16 a lecturer cannot write complaint_access directly');
select tap_lite.throws($$update public.staff_details set department_id = (select v from tap_lite.fx where k='D_TMTH')
  where profile_id = auth.uid()$$, '42501', 'B17 a lecturer cannot change their home department');
select tap_lite.rows_are($$select 1 from public.staff_invitations$$, 0, 'B18 a lecturer sees no staff invitations');
select tap_lite.as_postgres();

-- Admin workflow (as the signed-in admin).
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.throws($$update public.profiles set role = 'student' where id = auth.uid()$$, '42501',
  'B19 an admin cannot change their own role');
select tap_lite.throws($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type)
  values (auth.uid(), 'institution')$$, '42501', 'B20 an admin cannot grant themselves complaint access');
select tap_lite.lives($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type, level_id, department_id)
  values ((select v from tap_lite.fx where k='lecCS'), 'department_level',
          (select v from tap_lite.fx where k='L200'), (select v from tap_lite.fx where k='D_TCS'))$$,
  'B21 an admin can assign a lecturer to 200 Level / Computer Science');
select tap_lite.lives($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type, level_id, department_id)
  values ((select v from tap_lite.fx where k='lecEng'), 'department_level',
          (select v from tap_lite.fx where k='L300'), (select v from tap_lite.fx where k='D_TENG'))$$,
  'B22 an admin can assign a lecturer to 300 Level / Engineering');
select tap_lite.throws($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type, level_id)
  values ((select v from tap_lite.fx where k='lecCS'), 'department_level', (select v from tap_lite.fx where k='L200'))$$,
  '23514', 'B23 a department_level assignment without a department is rejected (no accidental wide scope)');
select tap_lite.throws($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type, level_id)
  values ((select v from tap_lite.fx where k='lecCS'), 'institution', (select v from tap_lite.fx where k='L200'))$$,
  '23514', 'B24 an institution assignment must not carry a level');
select tap_lite.throws($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type)
  values ((select v from tap_lite.fx where k='studA'), 'institution')$$, '22023',
  'B25 assignments cannot be created for student accounts');
select tap_lite.is_equal((select created_by from public.lecturer_assignments
   where lecturer_profile_id = tap_lite.id('lecCS')), tap_lite.id('admin1'),
  'B26 created_by is stamped server-side from the session');
select tap_lite.lives($$insert into public.academic_levels (name, level_number) values ('800 Level', 800)$$,
  'B27 an admin can add an academic level without code changes');
select tap_lite.lives($$update public.academic_levels set is_active = false where level_number = 800$$,
  'B28 an admin can deactivate an academic level');
select tap_lite.throws($$delete from public.academic_levels where level_number = 200$$, '23503',
  'B29 a level in use cannot be deleted (foreign key restrict)');
select tap_lite.as_postgres();

select tap_lite.is_equal((select count(*) from public.academic_levels where level_number in (100,200,300,400,500,600,700)),
  7::bigint, 'B30 all seven default academic levels (100-700) are seeded');

-- ========================= C. SUBMISSION & ROUTING ===========================
select tap_lite.as_user(tap_lite.id('studPending'));
select tap_lite.throws($$select * from public.submit_complaint('Pending student complaint', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '42501',
  'C1 [S6] an unapproved (pending) student cannot submit a complaint');
select tap_lite.as_user(tap_lite.id('studUnconf'));
select tap_lite.throws($$select * from public.submit_complaint('Unverified student complaint', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '42501',
  'C2 a student with an unverified e-mail cannot submit');
select tap_lite.as_anon();
select tap_lite.throws($$select * from public.submit_complaint('Anon complaint', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '42501',
  'C3 a signed-out visitor cannot call submit_complaint');

select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$insert into public.complaints (student_id, title, description, category_id, level_id, department_id, target_lecturer_profile_id)
  select s.id, 'Direct insert attempt', 'Direct insert description', (select v from tap_lite.fx where k='catAcad'),
         s.level_id, s.department_id, (select v from tap_lite.fx where k='lecCS') from public.students s where s.profile_id = auth.uid()$$,
  '42501', 'C4 complaints cannot be inserted directly, only through submit_complaint');

-- Lecturer selector.
select tap_lite.rows_are($$select 1 from public.search_lecturers('Target')$$, 1,
  'C5 the selector finds a lecturer from ANOTHER department by name');
select tap_lite.rows_are($$select 1 from public.search_lecturers(null, (select v from tap_lite.fx where k='D_TENG'))$$, 2,
  'C6 filtering by department lists only eligible lecturers (inactive and opted-out are excluded)');
select tap_lite.rows_are($$select 1 from public.search_lecturers('Inactive')$$, 0, 'C7 a deactivated lecturer cannot be selected');
select tap_lite.rows_are($$select 1 from public.search_lecturers('OptOut')$$, 0, 'C8 a lecturer who opted out cannot be selected');
select tap_lite.rows_are($$select 1 from public.search_lecturers('Admin')$$, 0, 'C9 administrators are never selectable');
select tap_lite.rows_are($$select 1 from public.search_lecturers('Student')$$, 0, 'C10 students are never selectable');
select tap_lite.rows_are($$select 1 from public.search_lecturers('%')$$, 0, 'C11 LIKE wildcards in the search text are escaped');
select tap_lite.is_equal((select title from public.search_lecturers('Target') limit 1), 'Dr',
  'C12 selector rows carry a title/department to tell similar names apart');
select tap_lite.throws($$select scope_labels from public.search_lecturers('Target')$$, '42703',
  'C12a the selector no longer exposes lecturer level/department assignments');
select tap_lite.is_equal(
  (select pg_get_function_result('public.search_lecturers(text,uuid,uuid,integer,integer)'::regprocedure) not like '%scope%'),
  true, 'C12b the selector return type has no assignment column');
select tap_lite.is_equal(
  (select has_function_privilege('anon', 'public.search_lecturers(text,uuid,uuid,integer,integer)'::regprocedure, 'execute')),
  false, 'C12c anon cannot execute the selector at the privilege level');

select tap_lite.as_user(tap_lite.id('lecCS'));
select tap_lite.throws($$select * from public.search_lecturers('Target')$$, '42501', 'C13 only approved students can use the selector');
select tap_lite.as_anon();
select tap_lite.throws($$select * from public.search_lecturers('Target')$$, '42501', 'C14 signed-out visitors cannot use the selector');

-- Student A (200 / CS) submits to lecTarget (Engineering, no scope assignment).
select tap_lite.as_user(tap_lite.id('studA'));
insert into tap_lite.fx
select 'c1', new_complaint_id from public.submit_complaint(
  'Exam result issue', 'My exam result seems to have been recorded incorrectly for last semester.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'));
select tap_lite.ok((select reference_number ~ '^CMP-[0-9]{4}-[0-9]{6}$' from public.complaints where id = tap_lite.id('c1')),
  'C15 a human-readable reference is generated on the server');
select tap_lite.is_equal((select status::text from public.complaints where id = tap_lite.id('c1')), 'submitted',
  'C16 new complaints start as submitted');
select tap_lite.is_equal((select level_id from public.complaints where id = tap_lite.id('c1')), tap_lite.id('L200'),
  'C17 level snapshot defaults to the student''s own level');
select tap_lite.is_equal((select count(*) from public.complaint_status_history where complaint_id = tap_lite.id('c1')),
  1::bigint, 'C18 an initial status-history row is written');
select tap_lite.is_equal(
  (select new_complaint_id from public.submit_complaint(
     'Exam result issue', 'My exam result seems to have been recorded incorrectly for last semester.',
     (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))),
  tap_lite.id('c1'), 'C18a an identical resubmission within two minutes returns the existing complaint');
select tap_lite.is_equal((select count(*) from public.complaints where title = 'Exam result issue'),
  1::bigint, 'C18b the double submit created no second complaint');
select tap_lite.is_equal((select count(*) from public.complaint_status_history where complaint_id = tap_lite.id('c1')),
  1::bigint, 'C18c the double submit wrote no second history row');

select tap_lite.throws($$select * from public.submit_complaint('Bad recipient one', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecInactive'))$$, '22023',
  'C19 an inactive lecturer cannot be used as recipient');
select tap_lite.throws($$select * from public.submit_complaint('Bad recipient two', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='studB'))$$, '22023',
  'C20 a student account cannot be used as recipient');
select tap_lite.throws($$select * from public.submit_complaint('Bad recipient three', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='admin1'))$$, '22023',
  'C21 an administrator cannot be used as recipient');
select tap_lite.throws($$select * from public.submit_complaint('Bad recipient four', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), gen_random_uuid())$$, '22023',
  'C22 a random/guessed recipient id is rejected with the same generic error');
select tap_lite.throws($$select * from public.submit_complaint('No', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '22023',
  'C23 a too-short title is rejected');
select tap_lite.throws($$select * from public.submit_complaint('Valid title here', 'short',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '22023',
  'C24 a too-short description is rejected');
select tap_lite.throws($$select * from public.submit_complaint('Valid title here', repeat('x', 10001),
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '22023',
  'C25 an oversized description is rejected');
select tap_lite.throws($$select * from public.submit_complaint('Valid title here', 'A description that is long enough.',
  gen_random_uuid(), (select v from tap_lite.fx where k='lecTarget'))$$, '22023', 'C26 an unknown category is rejected');
select tap_lite.throws($$select * from public.submit_complaint('Valid title here', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'),
  (select id from public.academic_levels where level_number = 800))$$, '22023',
  'C27 an inactive academic level is rejected');

-- A cross-department complaint with an overridden (700 Level) scope; student profile must not change.
insert into tap_lite.fx
select 'c1b', new_complaint_id from public.submit_complaint(
  'Scope override complaint', 'A complaint about a module taught in another level and department.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'),
  (select v from tap_lite.fx where k='L700'), (select v from tap_lite.fx where k='D_TMTH'));
select tap_lite.is_equal((select level_id from public.complaints where id = tap_lite.id('c1b')), tap_lite.id('L700'),
  'C28 the complaint keeps the level chosen on the form');
select tap_lite.is_equal((select level_id from public.students where profile_id = tap_lite.id('studA')), tap_lite.id('L200'),
  'C29 selecting another scope/lecturer does NOT change the student''s own level');
select tap_lite.is_equal((select department_id from public.students where profile_id = tap_lite.id('studA')), tap_lite.id('D_TCS'),
  'C30 ... nor the student''s own department');

-- Student B (300 / Engineering): c2 to lecEng, c3 to lecTarget.
select tap_lite.as_user(tap_lite.id('studB'));
insert into tap_lite.fx
select 'c2', new_complaint_id from public.submit_complaint(
  'Lab equipment broken', 'The equipment in the engineering lab has been broken for weeks now.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecEng'));
insert into tap_lite.fx
select 'c3', new_complaint_id from public.submit_complaint(
  'Timetable clash problem', 'Two of my required courses are scheduled at the same time slot.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'));

-- Rate limit.
select tap_lite.as_postgres();
update public.app_settings set value = '2'::jsonb where key = 'complaints_per_hour';
select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.throws($$select * from public.submit_complaint('Third complaint soon', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '54000',
  'C31 complaint submission is rate limited per student');
select tap_lite.as_postgres();
update public.app_settings set value = '10'::jsonb where key = 'complaints_per_hour';

-- ======================= D. ISOLATION (students) =============================
select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c1')$$, 0,
  'D1 [S1] Student B cannot read Student A''s complaint');
select tap_lite.rows_are($$select 1 from public.complaints$$, 2, 'D2 Student B sees exactly their own two complaints');
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), 'I should not be able to post here')$$, 'P0002',
  'D3 Student B cannot post into Student A''s thread (and learns nothing about it)');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 2, 'D4 Student A sees exactly their own two complaints');
select tap_lite.rows_are($$select 1 from public.students where profile_id <> auth.uid()$$, 0,
  'D5 a student cannot read other students'' records');
select tap_lite.rows_are($$select 1 from public.profiles where role = 'student' and id <> auth.uid()$$, 0,
  'D6 a student cannot read other students'' profiles');
select tap_lite.rows_are($$select 1 from public.lecturer_assignments$$, 0, 'D7 a student cannot read lecturer assignments');

select public.post_message(tap_lite.id('c1'), 'Here is some extra context about my exam result.');
select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.rows_are($$select 1 from public.complaint_messages$$, 0,
  'D8 [S2] Student B cannot read Student A''s messages');
select tap_lite.rows_are($$select 1 from public.complaint_events where complaint_id = tap_lite.id('c1')$$, 0,
  'D9 Student B cannot read Student A''s activity timeline');
select tap_lite.rows_are($$select 1 from public.complaint_status_history where complaint_id = tap_lite.id('c1')$$, 0,
  'D10 Student B cannot read Student A''s status history');

-- Signed-out visitors.
select tap_lite.as_anon();
select tap_lite.throws($$select 1 from public.complaints$$, '42501', 'D11 [S9] anon cannot read complaints');
select tap_lite.throws($$select 1 from public.complaint_messages$$, '42501', 'D12 [S9] anon cannot read messages');
select tap_lite.throws($$select 1 from public.complaint_attachments$$, '42501', 'D13 [S9] anon cannot read attachment metadata');
select tap_lite.throws($$select 1 from public.profiles$$, '42501', 'D14 [S9] anon cannot read profiles');
select tap_lite.throws($$select 1 from public.students$$, '42501', 'D15 [S9] anon cannot read students');
select tap_lite.throws($$select 1 from public.app_settings$$, '42501', 'D16 anon cannot read settings');
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), 'anon message here')$$, '42501', 'D17 anon cannot post messages');

-- ======================= E. LECTURER SCOPE ===================================
select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 3,
  'E1 the selected lecturer sees exactly the three complaints addressed to them (c1, c1b, c3)');
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c2')$$, 0,
  'E2 selecting a lecturer on some complaints grants no access to unrelated ones (c2)');
select tap_lite.rows_are($$select 1 from public.lecturer_assignments$$, 0, 'E3 an unscoped lecturer holds no assignments');
select tap_lite.rows_are($$select 1 from public.students where profile_id = (select v from tap_lite.fx where k='studA')$$, 1,
  'E4 staff can read the student record of a complaint they may access');
select tap_lite.rows_are($$select 1 from public.students where profile_id = (select v from tap_lite.fx where k='studF')$$, 0,
  'E5 ... but not students without such a complaint');

select tap_lite.as_user(tap_lite.id('lecCS'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c1')$$, 1,
  'E6 a lecturer assigned to 200 Level / Computer Science sees complaints in that scope');
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c2')$$, 0,
  'E7 [S4] ... but not 300 Level / Engineering complaints');
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c1b')$$, 0,
  'E8 scope matches the complaint SNAPSHOT (700 / Mathematics), not the student''s current profile');
select tap_lite.rows_are($$select 1 from public.complaint_messages where complaint_id = tap_lite.id('c2')$$, 0,
  'E9 an out-of-scope lecturer cannot read that complaint''s messages');

select tap_lite.as_user(tap_lite.id('lecEng'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 2,
  'E10 the 300/Engineering lecturer sees exactly c2 and c3 (the 300/Engineering scope), not c1/c1b');
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), 'I am not allowed in this thread')$$, 'P0002',
  'E11 an unauthorised lecturer cannot reply to a complaint');
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'under_review')$$, 'P0002',
  'E12 [S8] an unauthorised lecturer cannot change status (and learns nothing)');
select tap_lite.throws($$update public.complaints set status = 'resolved' where id = tap_lite.id('c2')$$, '42501',
  'E13 [S8] status cannot be changed with a direct UPDATE, even on an accessible complaint');
select tap_lite.throws($$delete from public.complaints where id = tap_lite.id('c2')$$, '42501',
  'E14 complaints cannot be deleted by lecturers');

-- Main lecturer: no scope -> nothing; institution scope -> everything non-sensitive (and sensitive: main only).
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 0,
  'E15 [S10] a main lecturer WITHOUT an institution grant sees no complaints');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 0,
  'E16 an administrator has no complaint-content access by default');
select tap_lite.rows_are($$select 1 from public.complaint_status_counts()$$, 0,
  'E17 ... and reporting reveals nothing to them either');
select tap_lite.lives($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type)
  values ((select v from tap_lite.fx where k='lecMain'), 'institution')$$,
  'E18 an admin can grant a main lecturer institution-wide scope');
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 4,
  'E19 [S10] with the explicit institution grant the main lecturer sees all four complaints (c1, c1b, c2, c3)');
select tap_lite.is_equal((select sum(total)::int from public.complaint_status_counts()), 4,
  'E20 reports are computed only from authorised rows');

-- Admin content access is explicit, read-only and never acting.
select tap_lite.as_user(tap_lite.id('admin2'));
select tap_lite.lives($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type, level_id, department_id)
  values ((select v from tap_lite.fx where k='admin1'), 'department_level',
          (select v from tap_lite.fx where k='L200'), (select v from tap_lite.fx where k='D_TCS'))$$,
  'E21 a SECOND admin can explicitly grant an admin complaint-content access');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 1, 'E22 the granted admin sees only that scope (c1)');
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), 'Admins cannot reply to complaints')$$, 'P0002',
  'E23 admins can read granted complaints but never act on them');
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'under_review')$$, '42501',
  'E24 admins cannot change complaint status (role check, independent of the complaint id)');

-- ===================== F. SENSITIVE ROUTING & ESCALATION =====================
select tap_lite.as_user(tap_lite.id('studA'));
insert into tap_lite.fx
select 'cs', new_complaint_id from public.submit_complaint(
  'Misconduct allegation', 'I would like to report serious misconduct that happened during a lab session.',
  (select v from tap_lite.fx where k='catHarass'), (select v from tap_lite.fx where k='lecCS'));
select tap_lite.ok((select is_sensitive and requires_triage and assigned_lecturer_profile_id is null
                    from public.complaints where id = tap_lite.id('cs')),
  'F1 sensitive complaints are flagged, put in triage and NOT auto-assigned');
select tap_lite.as_user(tap_lite.id('lecCS'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('cs')$$, 0,
  'F2 the student-selected lecturer does NOT see a sensitive complaint, even inside their scope');
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('cs')$$, 1,
  'F3 the main lecturer (institution scope) triages it');
select tap_lite.throws($$select public.assign_complaint(tap_lite.id('cs'), (select v from tap_lite.fx where k='lecInactive'))$$, '22023',
  'F4 a complaint cannot be released to an ineligible lecturer');
select tap_lite.lives($$select public.assign_complaint(tap_lite.id('cs'), (select v from tap_lite.fx where k='lecCS'))$$,
  'F5 the main lecturer releases it to a chosen lecturer');
select tap_lite.as_user(tap_lite.id('lecCS'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('cs')$$, 1,
  'F6 the released lecturer can now see exactly that complaint');
select tap_lite.throws($$select public.assign_complaint(tap_lite.id('c1'), (select v from tap_lite.fx where k='lecEng'))$$, '42501',
  'F7 a plain lecturer cannot assign complaints');
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.lives($$select public.revoke_complaint_access(tap_lite.id('cs'), (select v from tap_lite.fx where k='lecCS'))$$,
  'F8 the main lecturer can revoke an explicit grant');
select tap_lite.as_user(tap_lite.id('lecCS'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('cs')$$, 0, 'F9 revocation takes effect immediately');

-- Escalation by a lecturer who manages the complaint (c3, 300/Engineering): scope-only lecturers lose sight of it.
select tap_lite.as_user(tap_lite.id('lecEng'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c3')$$, 1,
  'F10 before escalation the 300/Engineering lecturer sees c3 through scope');
select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.throws($$select public.escalate_complaint(tap_lite.id('c3'), '', true)$$, '22023',
  'F11 escalation requires a reason');
select tap_lite.lives($$select public.escalate_complaint(tap_lite.id('c3'), 'Needs restricted handling', true)$$,
  'F12 a managing lecturer can escalate to restricted triage');
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c3')$$, 1,
  'F13 the explicitly granted target keeps access after escalation');
select tap_lite.as_user(tap_lite.id('lecEng'));
select tap_lite.rows_are($$select 1 from public.complaints where id = tap_lite.id('c3')$$, 0,
  'F14 scope-only lecturers lose access once a complaint is restricted');
select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.throws($$update public.complaints set is_sensitive = false where id = tap_lite.id('c3')$$, '42501',
  'F15 sensitivity cannot be lowered or edited by students');
select tap_lite.as_postgres();
select tap_lite.throws($$update public.complaints set is_sensitive = false where id = tap_lite.id('c3')$$, '42501',
  'F16 sensitivity cannot be lowered even by the table owner');

-- ======================== G. CONVERSATION & STATUS ===========================
select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.rows_are($$select 1 from public.complaint_messages where complaint_id = tap_lite.id('c1')$$, 1,
  'G1 the authorised lecturer reads the student''s message');
select tap_lite.rows_are($$select 1 from public.unread_message_counts() where complaint_id = tap_lite.id('c1') and unread_messages = 1$$, 1,
  'G2 unread indicator: one unread message from the student');
select tap_lite.rows_are($$select 1 from public.unread_message_counts() where complaint_id = tap_lite.id('c3') and never_opened$$, 1,
  'G3 a complaint the lecturer never opened is flagged new');
select tap_lite.lives($$select public.mark_complaint_read(tap_lite.id('c3'))$$, 'G4 marking a complaint read works');
select tap_lite.rows_are($$select 1 from public.unread_message_counts() where complaint_id = tap_lite.id('c3')$$, 0,
  'G5 ... and clears the indicator');
select tap_lite.as_user(tap_lite.id('lecEng'));
select tap_lite.throws($$select public.mark_complaint_read(tap_lite.id('c1'))$$, 'P0002', 'G6 an outsider cannot mark someone else''s complaint read');

select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.lives($$select public.post_message(tap_lite.id('c1'), 'Thanks, I am looking into your exam result.')$$, 'G7 a lecturer can reply');
select tap_lite.is_equal((select status::text from public.complaints where id = tap_lite.id('c1')), 'under_review',
  'G8 the first lecturer reply starts the review automatically');
select tap_lite.ok((select first_reviewed_at is not null from public.complaints where id = tap_lite.id('c1')),
  'G9 first_reviewed_at is stamped');
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'reopened')$$, '22023',
  'G10 invalid transitions (under_review -> reopened) are rejected');
select tap_lite.lives($$select public.transition_complaint_status(tap_lite.id('c1'), 'awaiting_student', 'Please send the module code')$$,
  'G11 a lecturer can request more information');

select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'closed')$$, '42501',
  'G12 a student cannot close their own complaint');
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'under_review')$$, '42501',
  'G13 a student cannot set arbitrary statuses');
select tap_lite.throws($$update public.complaints set status = 'resolved' where id = tap_lite.id('c1')$$, '42501',
  'G14 [S8] a student cannot change status with a direct UPDATE');
select tap_lite.throws($$update public.complaints set title = 'Edited title' where id = tap_lite.id('c1')$$, '42501',
  'G15 complaint content is not directly editable');
select tap_lite.lives($$select public.post_message(tap_lite.id('c1'), 'The module code is CSC 201.')$$, 'G16 the student answers');
select tap_lite.is_equal((select status::text from public.complaints where id = tap_lite.id('c1')), 'under_review',
  'G17 a student reply automatically returns the case to under_review');
select tap_lite.throws($$update public.complaint_messages set body = 'rewritten history' where complaint_id = tap_lite.id('c1')$$, '42501',
  'G18 messages are append-only for users (no UPDATE privilege)');
select tap_lite.throws($$delete from public.complaint_messages where complaint_id = tap_lite.id('c1')$$, '42501',
  'G19 messages cannot be deleted by users');
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), '   ')$$, '22023', 'G20 empty messages are rejected');
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), repeat('x', 5001))$$, '22023', 'G21 oversized messages are rejected');

select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.lives($$select public.transition_complaint_status(tap_lite.id('c1'), 'resolved', 'Result corrected')$$, 'G22 a lecturer can resolve');
select tap_lite.ok((select resolved_at is not null from public.complaints where id = tap_lite.id('c1')), 'G23 resolved_at is stamped');

select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'reopened')$$, '22023',
  'G24 reopening requires a reason');
-- Reopen window.
select tap_lite.as_postgres();
update public.complaints set resolved_at = now() - interval '40 days' where id = tap_lite.id('c1');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'reopened', 'Still wrong')$$, '55000',
  'G25 reopening after the reopen window is refused');
select tap_lite.as_postgres();
update public.complaints set resolved_at = now() where id = tap_lite.id('c1');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.lives($$select public.transition_complaint_status(tap_lite.id('c1'), 'reopened', 'The score is still wrong')$$,
  'G26 a student can request reopening inside the window');
select tap_lite.ok((select resolved_at is null from public.complaints where id = tap_lite.id('c1')), 'G27 reopening clears resolved_at');
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'reopened', 'again')$$, '42501',
  'G28 students can only reopen RESOLVED complaints');

select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.lives($$select public.transition_complaint_status(tap_lite.id('c1'), 'resolved', 'Corrected again')$$, 'G29 resolve again');
select tap_lite.lives($$select public.transition_complaint_status(tap_lite.id('c1'), 'closed', 'Formally closed')$$, 'G30 close');
select tap_lite.ok((select closed_at is not null from public.complaints where id = tap_lite.id('c1')), 'G31 closed_at is stamped');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), 'Can I still write here after closing?')$$, '55000',
  'G32 students cannot post into a closed complaint');
select tap_lite.throws($$select public.transition_complaint_status(tap_lite.id('c1'), 'reopened', 'reopen please')$$, '42501',
  'G33 students cannot reopen a CLOSED complaint (only staff can)');
select tap_lite.is_equal((select count(*) from public.complaint_status_history where complaint_id = tap_lite.id('c1')),
  8::bigint, 'G34 every status change is preserved in history (submitted..closed)');
select tap_lite.is_equal((select string_agg(new_status::text, '>' order by created_at, id) from public.complaint_status_history
   where complaint_id = tap_lite.id('c1')),
  'submitted>under_review>awaiting_student>under_review>resolved>reopened>resolved>closed', 'G35 history order is preserved');

-- ======================== H. ATTACHMENTS & STORAGE ===========================
select tap_lite.as_postgres();
insert into tap_lite.fx (k, v) values
  ('obj1', gen_random_uuid()), ('obj2', gen_random_uuid()), ('obj3', gen_random_uuid()), ('obj4', gen_random_uuid()),
  ('objB', gen_random_uuid());
-- c1 is closed; use c1b (A's open complaint, target lecTarget) for attachment tests.
insert into storage.objects (bucket_id, name, metadata) values
  ('complaint-evidence', tap_lite.id('c1b')::text || '/' || tap_lite.id('obj1')::text, '{"size":1000,"mimetype":"image/png"}'),
  ('complaint-evidence', tap_lite.id('c1b')::text || '/' || tap_lite.id('obj2')::text, '{"size":2000,"mimetype":"image/svg+xml"}'),
  ('complaint-evidence', tap_lite.id('c1b')::text || '/' || tap_lite.id('obj3')::text, '{"size":999999999,"mimetype":"application/pdf"}'),
  ('complaint-evidence', tap_lite.id('c2')::text  || '/' || tap_lite.id('objB')::text, '{"size":500,"mimetype":"image/png"}');

select tap_lite.as_user(tap_lite.id('studA'));
insert into tap_lite.fx
select 'att1', public.register_attachment(
  tap_lite.id('c1b'), null, tap_lite.id('c1b')::text || '/' || tap_lite.id('obj1')::text,
  '../../etc/passwd.png', 'image/png', 1000);
select tap_lite.ok((select original_filename !~ '[/\\]' from public.complaint_attachments where id = tap_lite.id('att1')),
  'H1 original filenames are sanitised (no path separators) before storage');
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c1b'), null,
  tap_lite.id('c1b')::text || '/' || tap_lite.id('obj2')::text, 'x.svg', 'image/svg+xml', 2000)$$, '22023',
  'H2 SVG uploads are rejected (not on the allow-list)');
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c1b'), null,
  tap_lite.id('c1b')::text || '/' || tap_lite.id('obj3')::text, 'big.pdf', 'application/pdf', 999999999)$$, '22023',
  'H3 oversized files are rejected');
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c1b'), null,
  tap_lite.id('c1b')::text || '/' || tap_lite.id('obj1')::text, 'dup.png', 'image/png', 1)$$, '22023',
  'H4 a declared size that does not match the stored object is rejected');
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c1b'), null,
  tap_lite.id('c1b')::text || '/' || gen_random_uuid()::text, 'ghost.png', 'image/png', 10)$$, '22023',
  'H5 metadata cannot be registered for an object that was never uploaded');
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c1b'), null, 'not-a-valid-path', 'x.png', 'image/png', 10)$$, '22023',
  'H6 storage paths must be <complaint_id>/<uuid>');
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c1b'), null,
  tap_lite.id('c2')::text || '/' || tap_lite.id('objB')::text, 'steal.png', 'image/png', 500)$$, '22023',
  'H7 a path under a different complaint id than the one declared is rejected');
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c2'), null,
  tap_lite.id('c2')::text || '/' || tap_lite.id('objB')::text, 'steal.png', 'image/png', 500)$$, 'P0002',
  'H8 cannot attach files to another student''s complaint');

-- Storage policies (as the Storage API would evaluate them for each caller).
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'complaint-evidence'
  and name = tap_lite.id('c1b')::text || '/' || tap_lite.id('obj1')::text$$, 1, 'H9 the owner can read their own evidence');
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'complaint-evidence'
  and name = tap_lite.id('c2')::text || '/' || tap_lite.id('objB')::text$$, 0, 'H10 a student cannot read another student''s evidence object');
select tap_lite.lives($$insert into storage.objects (bucket_id, name, metadata)
  values ('complaint-evidence', tap_lite.id('c1b')::text || '/' || tap_lite.id('obj4')::text, '{"size":10,"mimetype":"image/png"}')$$,
  'H11 a participant can upload to their own complaint folder');
select tap_lite.throws($$insert into storage.objects (bucket_id, name, metadata)
  values ('complaint-evidence', tap_lite.id('c2')::text || '/' || gen_random_uuid()::text, '{"size":10}')$$, '42501',
  'H12 a student cannot upload into another complaint''s folder');
select tap_lite.throws($$insert into storage.objects (bucket_id, name, metadata)
  values ('complaint-evidence', 'evil.png', '{"size":10}')$$, '42501',
  'H13 object names that are not <complaint>/<random uuid> are refused');
select tap_lite.throws($$insert into storage.objects (bucket_id, name, metadata)
  values ('complaint-evidence', tap_lite.id('c1b')::text || '/evil.png', '{"size":10}')$$, '42501',
  'H14 original-style filenames are refused as object names');
select tap_lite.rows_are($$update storage.objects set name = name || 'x' where bucket_id = 'complaint-evidence'$$, 0,
  'H15 evidence objects cannot be renamed by users (no UPDATE policy)');
select tap_lite.rows_are($$delete from storage.objects where bucket_id = 'complaint-evidence'$$, 0,
  'H16 evidence objects cannot be deleted by users (no DELETE policy)');

select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.rows_are($$select 1 from public.complaint_attachments$$, 0, 'H17 [S3] Student B cannot read Student A''s attachment metadata');
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'complaint-evidence'
  and name = tap_lite.id('c1b')::text || '/' || tap_lite.id('obj1')::text$$, 0,
  'H18 [S3] Student B cannot read Student A''s file even knowing the exact path');
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'complaint-evidence'
  and name = tap_lite.id('c1b')::text || '/' || gen_random_uuid()::text$$, 0,
  'H19 [S12] guessing a storage path yields nothing');
select tap_lite.throws($$insert into storage.objects (bucket_id, name, metadata)
  values ('complaint-evidence', tap_lite.id('c1b')::text || '/' || gen_random_uuid()::text, '{"size":10}')$$, '42501',
  'H20 Student B cannot upload into A''s complaint folder');
select tap_lite.throws($$select public.delete_attachment(tap_lite.id('att1'))$$, 'P0002',
  'H21 Student B cannot delete Student A''s attachment');
select tap_lite.rows_are($$select 1 from storage.objects$$, 1, 'H22 Student B sees only their own object (c2/objB)');

select tap_lite.as_user(tap_lite.id('lecEng'));
select tap_lite.rows_are($$select 1 from storage.objects where name like '%/' || (select v::text from tap_lite.fx where k='obj1')$$, 0,
  'H23 [S12] an out-of-scope lecturer cannot read the file');
select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'complaint-evidence'
  and name = tap_lite.id('c1b')::text || '/' || tap_lite.id('obj1')::text$$, 1, 'H24 the authorised lecturer can read the file');
select tap_lite.rows_are($$select 1 from public.complaint_attachments where id = tap_lite.id('att1')$$, 1, 'H25 ... and its metadata');
select tap_lite.throws($$select public.delete_attachment(tap_lite.id('att1'))$$, 'P0002',
  'H26 a lecturer cannot delete a student''s evidence');

select tap_lite.as_anon();
select tap_lite.throws($$select 1 from storage.objects$$, '42501', 'H27 [S12] anon cannot list storage objects at all');

select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.lives($$select public.delete_attachment(tap_lite.id('att1'))$$, 'H28 the uploader can remove their own attachment');
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'complaint-evidence'
  and name = tap_lite.id('c1b')::text || '/' || tap_lite.id('obj1')::text$$, 0,
  'H29 a removed attachment is no longer readable, even by its owner');
select tap_lite.as_user(tap_lite.id('lecTarget'));
select tap_lite.rows_are($$select 1 from public.complaint_attachments where id = tap_lite.id('att1')$$, 0,
  'H30 ... and its metadata disappears from lists');

-- Attachment count limit.
select tap_lite.as_postgres();
update public.app_settings set value = '1'::jsonb where key = 'max_attachments_per_submission';
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.lives($$select public.register_attachment(tap_lite.id('c1b'), null,
  tap_lite.id('c1b')::text || '/' || tap_lite.id('obj4')::text, 'one.png', 'image/png', 10)$$, 'H31 first attachment within the limit');
select tap_lite.as_postgres();
insert into storage.objects (bucket_id, name, metadata)
values ('complaint-evidence', tap_lite.id('c1b')::text || '/' || gen_random_uuid()::text, '{"size":10,"mimetype":"image/png"}');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$select public.register_attachment(tap_lite.id('c1b'), null,
  (select name from storage.objects where bucket_id='complaint-evidence' and name like tap_lite.id('c1b')::text || '/%'
     and name not like '%' || (select v::text from tap_lite.fx where k in ('obj1','obj4') limit 1) order by created_at desc limit 1),
  'two.png', 'image/png', 10)$$, null, 'H32 the per-submission attachment limit is enforced');
select tap_lite.as_postgres();
update public.app_settings set value = '5'::jsonb where key = 'max_attachments_per_submission';

-- ============================ I. DEACTIVATION ================================
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.lives($$update public.profiles set is_active = false where id = (select v from tap_lite.fx where k='lecEng')$$,
  'I1 an admin can deactivate a lecturer');
select tap_lite.as_user(tap_lite.id('lecEng'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 0,
  'I2 [S11] a deactivated lecturer loses access to every assigned complaint');
select tap_lite.throws($$select public.post_message(tap_lite.id('c2'), 'I was deactivated but I am trying anyway')$$, null,
  'I3 ... and cannot post into them');
select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.rows_are($$select 1 from public.search_lecturers('Eng')$$, 0, 'I4 a deactivated lecturer disappears from the selector');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.lives($$update public.profiles set is_active = false where id = (select v from tap_lite.fx where k='admin2')$$,
  'I5 an admin can deactivate another admin');
select tap_lite.as_postgres();
select tap_lite.throws($$update public.profiles set is_active = false where id = (select v from tap_lite.fx where k='admin1')$$, '55000',
  'I6 the last active administrator cannot be deactivated');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.lives($$update public.profiles set is_active = true where id = (select v from tap_lite.fx where k='admin2')$$,
  'I7 an admin can reactivate an admin');

-- A deactivated STUDENT loses access to their own complaints and cannot submit.
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.lives($$update public.profiles set is_active = false where id = (select v from tap_lite.fx where k='studB')$$,
  'I8 an admin can deactivate a student');
select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.rows_are($$select 1 from public.complaints$$, 0, 'I9 a deactivated student sees no complaints');
select tap_lite.throws($$select * from public.submit_complaint('Deactivated complaint', 'A description that is long enough.',
  (select v from tap_lite.fx where k='catAcad'), (select v from tap_lite.fx where k='lecTarget'))$$, '42501',
  'I10 a deactivated student cannot submit');
select tap_lite.rows_are($$update public.profiles set full_name = 'Still here' where id = auth.uid()$$, 0,
  'I11 a deactivated user cannot even edit their profile');

-- ============================ J. AUDIT & HYGIENE =============================
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.ok((select count(*) from public.audit_logs) > 10, 'J1 admins can read the audit log and it has entries');
select tap_lite.ok((select count(*) from public.audit_logs where action = 'lecturer_assignments.insert') >= 3,
  'J2 assignment changes are audited automatically by trigger');
select tap_lite.ok((select count(*) from public.audit_logs where action = 'profiles.update'
     and metadata -> 'changed' ? 'is_active') >= 1, 'J3 deactivations are audited with old/new activation state');
select tap_lite.ok(not exists (select 1 from public.audit_logs
   where metadata::text ilike any (array['%Exam result%', '%lab session%', '%@test.example%', '%Student A%', '%TST/0001%', '%Lecturer CS%'])),
  'J4 audit metadata never contains complaint text, e-mails, names or registration numbers',
  (select string_agg(action || ' ' || left(metadata::text, 160), ' | ') from public.audit_logs
   where metadata::text ilike any (array['%Exam result%', '%lab session%', '%@test.example%', '%Student A%', '%TST/0001%', '%Lecturer CS%'])));
select tap_lite.ok((select count(*) from public.audit_logs where action = 'complaint.submitted') >= 4,
  'J5 complaint submissions are audited (reference only)');
select tap_lite.throws($$update public.audit_logs set action = 'tampered'$$, '42501', 'J6 users cannot edit audit logs');
select tap_lite.throws($$delete from public.audit_logs$$, '42501', 'J7 users cannot delete audit logs');
select tap_lite.as_postgres();
select tap_lite.throws($$update public.audit_logs set action = 'tampered'$$, '55000', 'J8 audit logs are append-only even for the owner');
select tap_lite.throws($$delete from public.complaint_status_history$$, '55000', 'J9 status history is append-only even for the owner');
select tap_lite.throws($$truncate public.complaint_messages cascade$$, '55000', 'J10 messages cannot be truncated');
select tap_lite.throws($$update public.complaints set title = 'Changed by owner' where id = tap_lite.id('c1')$$, '42501',
  'J11 complaint content is immutable even for the table owner');

select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.rows_are($$select 1 from public.audit_logs$$, 0, 'J12 students cannot read audit logs');
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.rows_are($$select 1 from public.audit_logs$$, 0, 'J13 main lecturers cannot read audit logs');
-- p_days = -1 means "inactive since tomorrow", i.e. every open complaint (a single test transaction cannot age rows).
select tap_lite.is_equal((select count(*) from public.list_overdue_complaints(-1)), 4::bigint,
  'J14 main lecturer oversight: open complaints are listed with their inactivity (c1b, c2, c3, cs; closed c1 excluded)');
select tap_lite.is_equal((select count(*) from public.list_overdue_complaints()), 0::bigint,
  'J14b nothing is overdue under the default 14-day window');

-- Reporting is scope-limited for students too.
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.is_equal((select coalesce(sum(total), 0)::int from public.complaint_status_counts()), 3,
  'J15 a student''s statistics count only their own complaints');

-- ======================== K. PRIVILEGE GUARDS (catalog) ======================
select tap_lite.as_postgres();
select tap_lite.is_equal(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and p.proname <> 'registration_options'  -- the one deliberate exception (0013), tested in section Q
      and (has_function_privilege('anon', p.oid, 'execute')
           or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                      where a.grantee = 0 and a.privilege_type = 'EXECUTE'))),
  0::bigint, 'K1 no SECURITY DEFINER function in public is executable by anon or PUBLIC (except registration_options)');
select tap_lite.is_equal(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '\_%' and has_function_privilege('authenticated', p.oid, 'execute')),
  0::bigint, 'K2 internal helper functions (_*) are not executable by API roles');
select tap_lite.is_equal(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'bootstrap_first_admin'
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('service_role', p.oid, 'execute'))),
  0::bigint, 'K3 bootstrap_first_admin is not executable by authenticated or service_role');
select tap_lite.is_equal(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0::bigint, 'K4 row level security is enabled on every public table');
select tap_lite.is_equal(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'),
  0::bigint, 'K5 anon holds no table privileges in public');
select tap_lite.is_equal(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'authenticated'
      and table_name in ('complaints','complaint_messages','complaint_attachments','complaint_status_history',
                         'complaint_events','complaint_read_receipts','complaint_access','audit_logs')
      and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')),
  0::bigint, 'K6 authenticated has no write privileges on complaint data or audit logs');
select tap_lite.is_equal((select public from storage.buckets where id = 'complaint-evidence'), false,
  'K7 the evidence bucket is private');

-- ---- L: assignable lecturers (migration 0010) ------------------------------
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.ok((select count(*) from public.list_assignable_lecturers('Target')) = 1,
  'L1 a main lecturer can list an eligible lecturer by name');
select tap_lite.rows_are($$select 1 from public.list_assignable_lecturers('Inactive')$$, 0,
  'L2 deactivated lecturers are not assignable');
select tap_lite.rows_are($$select 1 from public.list_assignable_lecturers('OptOut')$$, 0,
  'L3 lecturers who opted out are not assignable');
select tap_lite.rows_are($$select 1 from public.list_assignable_lecturers('%')$$, 0,
  'L4 LIKE wildcards are escaped');
select tap_lite.rows_are($$select 1 from public.list_assignable_lecturers('Student')$$, 0,
  'L5 students are never listed');
select tap_lite.as_user(tap_lite.id('lecCS'));
select tap_lite.throws($$select * from public.list_assignable_lecturers()$$, '42501',
  'L6 an ordinary lecturer cannot list assignable lecturers');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$select * from public.list_assignable_lecturers()$$, '42501',
  'L7 a student cannot list assignable lecturers');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.throws($$select * from public.list_assignable_lecturers()$$, '42501',
  'L8 an administrator cannot list assignable lecturers (routing is a main-lecturer duty)');
select tap_lite.as_anon();
select tap_lite.throws($$select * from public.list_assignable_lecturers()$$, '42501',
  'L9 signed-out visitors cannot list assignable lecturers');

-- ================= M. OPEN SELF-REGISTRATION + APPROVAL (migration 0011) =====
select tap_lite.as_postgres();
insert into tap_lite.fx (k, v) values
  ('regStud',    'a1000000-0000-0000-0000-0000000000a1'),
  ('regStud2',   'a1000000-0000-0000-0000-0000000000a2'),
  ('regLec',     'a1000000-0000-0000-0000-0000000000a3'),
  ('regLec2',    'a1000000-0000-0000-0000-0000000000a4'),
  ('regAdmin',   'a1000000-0000-0000-0000-0000000000a5'),
  ('regUnconf',  'a1000000-0000-0000-0000-0000000000a6'),
  ('regInvited', 'a1000000-0000-0000-0000-0000000000a7');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (tap_lite.id('regStud'), 'reg.student@uni.test', now(),
   ('{"registration_type":"student","full_name":"  Reg   Student ","identifier":"reg/0001","personal_email":"Reg.Personal@Mail.Example"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS')))),
  (tap_lite.id('regStud2'), 'reg.student2@uni.test', now(),
   ('{"registration_type":"student","full_name":"Reg Student Two"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS')))),
  (tap_lite.id('regLec'), 'reg.lecturer@uni.test', now(),
   ('{"registration_type":"lecturer","full_name":"Reg Lecturer","identifier":"stf-77","role":"admin"}'::jsonb || jsonb_build_object('department_id', tap_lite.id('D_TENG')))),
  (tap_lite.id('regLec2'), 'reg.lecturer2@uni.test', now(),
   ('{"registration_type":"lecturer","full_name":"Reg Lecturer Two"}'::jsonb || jsonb_build_object('department_id', tap_lite.id('D_TENG')))),
  (tap_lite.id('regUnconf'), 'reg.unconf@uni.test', null,
   ('{"registration_type":"student","full_name":"Reg Unconfirmed"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))));

select tap_lite.is_equal((select role::text from public.profiles where id = tap_lite.id('regStud')), 'student',
  'M1 a student can register without a pre-registered record or invitation');
select tap_lite.ok((select approval_status = 'pending' and profile_id = tap_lite.id('regStud')
                           and registration_number = 'REG/0001' and level_id = tap_lite.id('L200') and department_id = tap_lite.id('D_TCS')
                           and full_name = 'Reg Student'
                    from public.students where school_email = 'reg.student@uni.test'),
  'M2 the self-registered student record is linked, PENDING, normalised, with the level and department chosen at sign-up');
select tap_lite.is_equal((select registration_number from public.students where profile_id = tap_lite.id('regStud2')), null::text,
  'M3 the registration number is optional');
select tap_lite.is_equal((select personal_email from public.registration_details where profile_id = tap_lite.id('regStud')),
  'reg.personal@mail.example', 'M4 the optional personal e-mail is stored (normalised) outside the profile');
select tap_lite.is_equal((select role::text from public.profiles where id = tap_lite.id('regLec')), 'lecturer',
  'M5 a "role" in sign-up metadata is ignored: a lecturer registration is only ever a lecturer');
select tap_lite.ok((select approval_status = 'pending' from public.staff_details where profile_id = tap_lite.id('regLec'))
                   and (select staff_number = 'STF-77' from public.registration_details where profile_id = tap_lite.id('regLec')),
  'M6 a self-registered lecturer is PENDING and keeps the optional staff number');
select tap_lite.throws($$insert into auth.users (id, email, raw_user_meta_data)
  values (tap_lite.id('regAdmin'), 'reg.admin@uni.test', '{"registration_type":"admin","full_name":"Wannabe Admin"}')$$,
  '42501', 'M7 nobody can self-register as an administrator');
select tap_lite.throws($$insert into auth.users (id, email, raw_user_meta_data)
  values (tap_lite.id('regAdmin'), 'reg.admin@uni.test', '{"registration_type":"main_lecturer","full_name":"Wannabe Main"}')$$,
  '42501', 'M8 nobody can self-register as a main lecturer');
select tap_lite.throws($$insert into auth.users (id, email, raw_user_meta_data)
  values (tap_lite.id('regAdmin'), 'reg.admin@uni.test', ('{"registration_type":"student","full_name":"   "}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))))$$,
  '22023', 'M9 a full name is required');
select tap_lite.throws($$insert into auth.users (id, email, raw_user_meta_data)
  values (tap_lite.id('regAdmin'), 'reg.admin@uni.test', ('{"registration_type":"student","full_name":"X","identifier":"<script>"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))))$$,
  '22023', 'M10 a malformed registration number is rejected');
select tap_lite.throws($$insert into auth.users (id, email, raw_user_meta_data)
  values (tap_lite.id('regAdmin'), 'reg.admin@uni.test', ('{"registration_type":"student","full_name":"X","identifier":"REG/0001"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))))$$,
  '23505', 'M11 a registration number already in use is rejected');
update public.app_settings set value = 'false'::jsonb where key = 'self_registration_enabled';
select tap_lite.throws($$insert into auth.users (id, email, raw_user_meta_data)
  values (tap_lite.id('regAdmin'), 'reg.admin@uni.test', ('{"registration_type":"student","full_name":"X"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))))$$,
  '42501', 'M12 administrators can switch self-registration off');
update public.app_settings set value = 'true'::jsonb where key = 'self_registration_enabled';

-- An invitation still wins over self-registration metadata (role comes from the invitation).
insert into public.staff_invitations (email, full_name, role) values ('reg.invited@uni.test', 'Invited Main', 'main_lecturer');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (tap_lite.id('regInvited'), 'reg.invited@uni.test', now(), ('{"registration_type":"student","full_name":"Ignored"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))));
select tap_lite.ok((select role = 'main_lecturer' and full_name = 'Invited Main' from public.profiles where id = tap_lite.id('regInvited'))
                   and (select approval_status = 'approved' from public.staff_details where profile_id = tap_lite.id('regInvited')),
  'M13 an invitation still takes precedence and is approved by the invitation itself');
select tap_lite.ok(exists (select 1 from public.audit_logs where action = 'registration.submitted' and entity_id = tap_lite.id('regLec')),
  'M14 every self-registration is recorded in the audit log');

-- Pending student: may sign in and see their own state, nothing protected.
select tap_lite.as_user(tap_lite.id('regStud'));
select tap_lite.is_equal(public.is_approved_student(), false, 'M15 a pending student is not an approved student');
select tap_lite.is_equal(public.my_approval_status(), 'pending', 'M16 a pending student is told their status');
select tap_lite.rows_are($$select 1 from public.students where profile_id = tap_lite.id('regStud')$$, 1,
  'M17 a pending student can read their own record');
select tap_lite.throws($$select * from public.submit_complaint('Pending student complaint', 'This should never be accepted.',
  tap_lite.id('catAcad'), tap_lite.id('lecTarget'), tap_lite.id('L200'), tap_lite.id('D_TCS'))$$,
  '42501', 'M18 a pending student cannot submit a complaint');
select tap_lite.throws($$select * from public.search_lecturers()$$, '42501', 'M19 a pending student cannot search lecturers');
select tap_lite.rows_are($$select 1 from public.complaints$$, 0, 'M20 a pending student sees no complaints');

-- Pending lecturer: signed in, can read own profile, no staff privileges at all.
select tap_lite.as_user(tap_lite.id('regLec'));
select tap_lite.is_equal(public.current_user_role(), null::public.user_role, 'M21 a pending lecturer has no effective role');
select tap_lite.is_equal(public.my_approval_status(), 'pending', 'M22 a pending lecturer is told their status');
select tap_lite.rows_are($$select 1 from public.profiles where id = tap_lite.id('regLec')$$, 1,
  'M23 a pending lecturer can read their own profile');
select tap_lite.rows_are($$select 1 from public.profiles where id <> tap_lite.id('regLec')$$, 0,
  'M24 a pending lecturer cannot read anyone else''s profile');
select tap_lite.rows_are($$select 1 from public.complaints$$, 0, 'M25 a pending lecturer sees no complaints');
select tap_lite.rows_are($$select 1 from public.complaint_messages$$, 0, 'M26 a pending lecturer sees no complaint messages');
select tap_lite.rows_are($$select 1 from public.students$$, 0, 'M27 a pending lecturer sees no student records');
select tap_lite.throws($$select public.post_message(tap_lite.id('c1'), 'pending lecturer message')$$, null,
  'M28 a pending lecturer cannot post to a complaint');
select tap_lite.throws($$update public.staff_details set approval_status = 'approved' where profile_id = tap_lite.id('regLec')$$,
  '42501', 'M29 a pending lecturer cannot approve themselves');
select tap_lite.throws($$select public.review_registration(tap_lite.id('regLec'), 'approved')$$,
  '42501', 'M30 only administrators can review registrations');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.rows_are($$select 1 from public.search_lecturers('Reg Lecturer')$$, 0,
  'M31 pending lecturers cannot be chosen as complaint recipients');
select tap_lite.rows_are($$select 1 from public.registration_details$$, 0,
  'M32 personal registration details are not visible to other users');
select tap_lite.throws($$select * from public.list_registrations()$$, '42501', 'M33 students cannot list registrations');
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.rows_are($$select 1 from public.list_assignable_lecturers('Reg Lecturer')$$, 0,
  'M34 pending lecturers are not assignable');

-- Administrator review.
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.throws($$insert into public.lecturer_assignments (lecturer_profile_id, scope_type)
  values (tap_lite.id('regLec'), 'institution')$$, '22023', 'M35 pending lecturers cannot be given an assignment');
select tap_lite.ok((select count(*) from public.list_registrations('pending') where profile_id in
                     (tap_lite.id('regStud'), tap_lite.id('regLec'), tap_lite.id('regUnconf'))) = 3,
  'M36 administrators see pending student and lecturer registrations');
select tap_lite.ok((select email_verified = false from public.list_registrations('pending', 'student', 'Unconfirmed'))
                   and (select personal_email = 'reg.personal@mail.example' from public.list_registrations('pending', 'student', 'REG/0001')),
  'M37 the review list shows e-mail verification and the private details to administrators');
select tap_lite.as_postgres();
update public.students set level_id = null where profile_id = tap_lite.id('regStud2');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.throws($$select public.review_registration(tap_lite.id('regStud2'), 'approved')$$,
  '22023', 'M38 a student cannot be approved without a level and department');
select tap_lite.throws($$select public.review_registration(tap_lite.id('regStud'), 'suspended')$$,
  '22023', 'M39 review decisions are only approve or reject');
select tap_lite.throws($$select public.review_registration(tap_lite.id('admin1'), 'rejected')$$,
  '42501', 'M40 administrators cannot review their own account');
select tap_lite.lives($$select public.review_registration(tap_lite.id('regStud'), 'approved', tap_lite.id('L200'), tap_lite.id('D_TCS'))$$,
  'M41 an administrator approves a student, setting level and department');
select tap_lite.lives($$select public.review_registration(tap_lite.id('regLec'), 'approved', null, tap_lite.id('D_TENG'))$$,
  'M42 an administrator approves a lecturer');
select tap_lite.lives($$select public.review_registration(tap_lite.id('regLec2'), 'rejected')$$,
  'M43 an administrator rejects a lecturer');
select tap_lite.lives($$select public.review_registration(tap_lite.id('regUnconf'), 'approved', tap_lite.id('L100'), tap_lite.id('D_TCS'))$$,
  'M44 approval does not depend on e-mail verification (they are separate)');
select tap_lite.is_equal((select count(*) from public.audit_logs
                           where action in ('registration.approved', 'registration.rejected')
                             and actor_profile_id = tap_lite.id('admin1')
                             and entity_id in (tap_lite.id('regStud'), tap_lite.id('regLec'), tap_lite.id('regLec2'), tap_lite.id('regUnconf'))),
  4::bigint, 'M45 every review decision is in the audit log with the administrator as actor');
select tap_lite.ok((select approved_by = tap_lite.id('admin1') and approved_at is not null
                    from public.staff_details where profile_id = tap_lite.id('regLec')),
  'M46 staff approval is stamped with who approved and when');

select tap_lite.as_user(tap_lite.id('regStud'));
select tap_lite.is_equal(public.is_approved_student(), true, 'M47 an approved, verified student is an approved student');
select tap_lite.as_user(tap_lite.id('regUnconf'));
select tap_lite.is_equal(public.is_approved_student(), false, 'M48 approval alone does not bypass e-mail verification');
select tap_lite.as_user(tap_lite.id('regLec'));
select tap_lite.is_equal(public.current_user_role()::text, 'lecturer', 'M49 an approved lecturer gets the lecturer role (never more)');
select tap_lite.as_user(tap_lite.id('regLec2'));
select tap_lite.ok(public.current_user_role() is null and public.my_approval_status() = 'rejected',
  'M50 a rejected lecturer still has no staff privileges');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.rows_are($$select 1 from public.search_lecturers('Reg Lecturer')$$, 1,
  'M51 an approved lecturer becomes selectable');
select tap_lite.as_postgres();
select tap_lite.throws($$update public.students set level_id = null where profile_id = tap_lite.id('regStud')$$,
  '23514', 'M52 an approved student must keep a level and department');

-- ======================== N. PROFILE PICTURES (migration 0011) ===============
select tap_lite.is_equal((select public from storage.buckets where id = 'avatars'), false, 'N1 the avatar bucket is private');
insert into tap_lite.fx (k, v) values ('av1', 'b2000000-0000-0000-0000-000000000001'), ('av2', 'b2000000-0000-0000-0000-000000000002');
select tap_lite.as_user(tap_lite.id('regStud'));
select tap_lite.lives($$insert into storage.objects (bucket_id, name) values ('avatars', tap_lite.id('regStud')::text || '/' || tap_lite.id('av1')::text)$$,
  'N2 a user can upload a picture into their own folder');
select tap_lite.throws($$insert into storage.objects (bucket_id, name) values ('avatars', tap_lite.id('studA')::text || '/' || tap_lite.id('av2')::text)$$,
  '42501', 'N3 a user cannot upload into someone else''s folder');
select tap_lite.throws($$select public.set_my_avatar(tap_lite.id('studA')::text || '/' || tap_lite.id('av1')::text)$$,
  '22023', 'N4 a user cannot point their profile at someone else''s file');
select tap_lite.throws($$select public.set_my_avatar(tap_lite.id('regStud')::text || '/' || tap_lite.id('av2')::text)$$,
  'P0002', 'N5 a user cannot point their profile at a file that was not uploaded');
select tap_lite.is_equal(public.set_my_avatar(tap_lite.id('regStud')::text || '/' || tap_lite.id('av1')::text), null::text,
  'N6 a user can set their uploaded picture');
select tap_lite.is_equal((select avatar_path from public.profiles where id = tap_lite.id('regStud')),
  tap_lite.id('regStud')::text || '/' || tap_lite.id('av1')::text, 'N7 the profile records the picture');
select tap_lite.throws($$update public.profiles set avatar_path = null where id = tap_lite.id('regStud')$$,
  '42501', 'N8 the picture can only be changed through set_my_avatar');
select tap_lite.as_user(tap_lite.id('regLec2'));
select tap_lite.lives($$insert into storage.objects (bucket_id, name) values ('avatars', tap_lite.id('regLec2')::text || '/' || tap_lite.id('av2')::text)$$,
  'N9 pending and rejected (but active) accounts may still manage their own picture');
select tap_lite.as_user(tap_lite.id('studB'));
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'avatars' and name like tap_lite.id('regStud')::text || '/%'$$, 0,
  'N10 an unrelated user cannot read someone else''s picture');
select tap_lite.rows_are($$delete from storage.objects where bucket_id = 'avatars' and name like tap_lite.id('regStud')::text || '/%' returning 1$$, 0,
  'N11 an unrelated user cannot delete someone else''s picture');
select tap_lite.as_user(tap_lite.id('regStud'));
select tap_lite.rows_are($$select 1 from storage.objects where bucket_id = 'avatars' and name like tap_lite.id('regStud')::text || '/%'$$, 1,
  'N12 the owner can read their own picture');
select tap_lite.is_equal(public.set_my_avatar(null), tap_lite.id('regStud')::text || '/' || tap_lite.id('av1')::text,
  'N13 clearing the picture returns the old object name for deletion');
select tap_lite.rows_are($$delete from storage.objects where bucket_id = 'avatars' and name like tap_lite.id('regStud')::text || '/%' returning 1$$, 1,
  'N14 the owner can delete their own picture');
select tap_lite.as_postgres();
select tap_lite.throws($$update public.profiles set avatar_path = tap_lite.id('studA')::text || '/' || tap_lite.id('av1')::text
  where id = tap_lite.id('studB')$$, '23514', 'N15 a profile can never reference a file in another person''s folder');

-- ============ O. NO E-MAIL CONFIRMATION LINK (migration 0012) =================
-- With "Confirm email" off, Supabase creates users already confirmed. That must not
-- let anyone take over a pre-registered (approved) student record by typing its e-mail.
select tap_lite.as_postgres();
insert into tap_lite.fx (k, v) values
  ('autoImpostor', 'a1000000-0000-0000-0000-0000000000b1'),
  ('autoSelf',     'a1000000-0000-0000-0000-0000000000b2'),
  ('autoClaim',    'a1000000-0000-0000-0000-0000000000b3'),
  ('autoInvited',  'a1000000-0000-0000-0000-0000000000b4'),
  ('autoOld',      'a1000000-0000-0000-0000-0000000000b5'),
  ('autoAdmin',    'a1000000-0000-0000-0000-0000000000b6');
insert into public.students (school_email, full_name, registration_number, level_id, department_id, approval_status) values
  ('preapproved@uni.test', 'Pre Approved', 'PRE/0001', tap_lite.id('L100'), tap_lite.id('D_TCS'), 'approved'),
  ('claimme@uni.test',     'Claim Me',     'PRE/0002', tap_lite.id('L100'), tap_lite.id('D_TCS'), 'approved'),
  ('invited.stud@uni.test','Invited Stud', 'PRE/0003', tap_lite.id('L100'), tap_lite.id('D_TCS'), 'approved');

-- Auto-confirmed sign-up (email_confirmed_at set at creation) with a pre-registered approved e-mail.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (tap_lite.id('autoImpostor'), 'preapproved@uni.test', now(), ('{"registration_type":"student","full_name":"Someone Else"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))));
select tap_lite.ok((select profile_id = tap_lite.id('autoImpostor') and approval_status = 'pending'
                    from public.students where school_email = 'preapproved@uni.test'),
  'O1 an auto-confirmed sign-up with a pre-registered e-mail is linked but set back to PENDING (e-mail is not proof of identity)');
select tap_lite.as_user(tap_lite.id('autoImpostor'));
select tap_lite.is_equal(public.is_approved_student(), false, 'O2 ... so it gets no student privileges until an administrator approves');
select tap_lite.as_postgres();
select tap_lite.is_equal((select email_ownership_verified from public.profiles where id = tap_lite.id('autoImpostor')), false,
  'O3 an auto-confirmed account is not marked as having verified its mailbox');

-- Ordinary self-registration with auto-confirm: account usable for sign-in at once, still pending.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (tap_lite.id('autoSelf'), 'auto.self@uni.test', now(), ('{"registration_type":"lecturer","full_name":"Auto Lecturer","role":"admin"}'::jsonb || jsonb_build_object('department_id', tap_lite.id('D_TENG'))));
select tap_lite.ok((select role = 'lecturer' from public.profiles where id = tap_lite.id('autoSelf'))
                   and (select approval_status = 'pending' from public.staff_details where profile_id = tap_lite.id('autoSelf')),
  'O4 with auto-confirm a lecturer sign-up is still only a PENDING lecturer');
select tap_lite.as_user(tap_lite.id('autoSelf'));
select tap_lite.is_equal(public.current_user_role(), null::public.user_role, 'O5 ... with no effective role');
select tap_lite.as_postgres();

-- claim_student_record by an auto-confirmed account: also pending.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (tap_lite.id('autoClaim'), 'claim.later@uni.test', now(), ('{"registration_type":"student","full_name":"Claim Later"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))));
delete from public.students where profile_id = tap_lite.id('autoClaim');
update public.students set school_email = 'claim.later@uni.test' where school_email = 'claimme@uni.test';
select tap_lite.as_user(tap_lite.id('autoClaim'));
select tap_lite.is_equal(public.claim_student_record('PRE/0002'), true, 'O6 an auto-confirmed account can still claim its record');
select tap_lite.as_postgres();
select tap_lite.is_equal((select approval_status::text from public.students where registration_number = 'PRE/0002'), 'pending',
  'O7 ... but the claimed record goes back to PENDING for review');

-- Invitation link: created unconfirmed, confirmed by clicking -> ownership proven, approval kept.
insert into auth.users (id, email, email_confirmed_at) values (tap_lite.id('autoInvited'), 'invited.stud@uni.test', null);
update auth.users set email_confirmed_at = now() where id = tap_lite.id('autoInvited');
select tap_lite.ok((select profile_id = tap_lite.id('autoInvited') and approval_status = 'approved'
                    from public.students where school_email = 'invited.stud@uni.test')
                   and (select email_ownership_verified from public.profiles where id = tap_lite.id('autoInvited')),
  'O8 a student who confirms through an e-mail link (invitation) keeps the approval an administrator gave');

-- Bulk-confirming old unconfirmed accounts does not count as proof.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (tap_lite.id('autoOld'), 'old.unconfirmed@uni.test', null, ('{"registration_type":"student","full_name":"Old Unconfirmed"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_TCS'))));
select tap_lite.ok(public.confirm_existing_unconfirmed_users() >= 1, 'O9a confirm_existing_unconfirmed_users confirms old accounts');
select tap_lite.ok((select email_confirmed_at is not null from auth.users where id = tap_lite.id('autoOld'))
                   and not (select email_ownership_verified from public.profiles where id = tap_lite.id('autoOld')),
  'O9 confirm_existing_unconfirmed_users lets old accounts sign in without marking their mailbox verified');
select tap_lite.ok(not has_function_privilege('authenticated', 'public.confirm_existing_unconfirmed_users()', 'execute')
                   and not has_function_privilege('anon', 'public.confirm_existing_unconfirmed_users()', 'execute')
                   and not has_function_privilege('service_role', 'public.confirm_existing_unconfirmed_users()', 'execute'),
  'O10 confirm_existing_unconfirmed_users is not callable through the API');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.ok((select email_verified = false from public.list_registrations('pending', 'student', 'PRE/0001')),
  'O11 the review list shows administrators that the e-mail was not verified');

-- ============ P. ADMIN AREA: protection and overview (migration 0012) ==========
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.ok((select total from public.admin_overview_counts() where metric = 'complaints_total') >= 1
                   and exists (select 1 from public.admin_overview_counts() where metric = 'students_approved'),
  'P1 an administrator gets aggregate dashboard counts');
select tap_lite.rows_are($$select 1 from public.complaints$$, 1,
  'P2 ... while complaint content stays limited to the one scope explicitly granted in E21 (privacy unchanged)');
select tap_lite.as_user(tap_lite.id('studA'));
select tap_lite.throws($$select * from public.admin_overview_counts()$$, '42501', 'P3 a student cannot read the admin overview');
select tap_lite.throws($$update public.profiles set role = 'admin' where id = tap_lite.id('studA')$$, '42501',
  'P4a a student cannot make themselves an administrator ...');
select tap_lite.is_equal((select role::text from public.profiles where id = tap_lite.id('studA')), 'student', 'P4b ... and stays a student');
select tap_lite.throws($$insert into public.departments (name) values ('Student Dept')$$, '42501', 'P5 a student cannot create departments');
select tap_lite.throws($$insert into public.staff_invitations (email, full_name, role) values ('me2@x.test', 'Me', 'admin')$$, '42501',
  'P6 a student cannot create an administrator invitation');
select tap_lite.rows_are($$update public.app_settings set value = 'false'::jsonb where key = 'self_registration_enabled' returning 1$$, 0,
  'P7 a student cannot change settings');
select tap_lite.throws($$select public.review_registration(tap_lite.id('autoImpostor'), 'approved', tap_lite.id('L100'), tap_lite.id('D_TCS'))$$, '42501',
  'P8 a student cannot approve registrations');
select tap_lite.as_user(tap_lite.id('lecMain'));
select tap_lite.throws($$select * from public.admin_overview_counts()$$, '42501', 'P9 a main lecturer cannot read the admin overview');
select tap_lite.as_anon();
select tap_lite.throws($$select * from public.admin_overview_counts()$$, '42501', 'P10 signed-out visitors cannot read the admin overview');
select tap_lite.as_postgres();
select tap_lite.throws($$select public.bootstrap_first_admin('auto.self@uni.test', 'X')$$, '55000',
  'P11 bootstrap_first_admin still refuses once an administrator exists');

-- ============ Q. LEVEL / DEPARTMENT CHOSEN AT SIGN-UP (migration 0013) =========
select tap_lite.as_postgres();
insert into public.departments (name, code, is_active) values ('Test Closed Dept', 'TCLD', false);
insert into tap_lite.fx select 'D_CLOSED', id from public.departments where code = 'TCLD';
insert into tap_lite.fx (k, v) values
  ('qStud', 'a1000000-0000-0000-0000-0000000000c1'), ('qLec', 'a1000000-0000-0000-0000-0000000000c2'),
  ('qBad',  'a1000000-0000-0000-0000-0000000000c3'), ('qPre', 'a1000000-0000-0000-0000-0000000000c4');

select tap_lite.as_anon();
select tap_lite.ok((select count(*) from public.registration_options() where kind = 'level') >= 7
                   and exists (select 1 from public.registration_options() where kind = 'department' and name = 'Test Computer Science'),
  'Q1 signed-out visitors can list active levels and departments for the sign-up form');
select tap_lite.rows_are($$select 1 from public.registration_options() where name = 'Test Closed Dept'$$, 0,
  'Q2 inactive departments are not offered');
select tap_lite.throws($$select 1 from public.departments$$, '42501', 'Q3 signed-out visitors still cannot read the departments table');
select tap_lite.as_postgres();
select tap_lite.is_equal(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')), 1::bigint,
  'Q4 registration_options is the only definer function anon can execute');

select tap_lite.throws($$insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (tap_lite.id('qBad'), 'q.bad@uni.test', now(),
  '{"registration_type":"student","full_name":"Q Bad"}'::jsonb || jsonb_build_object('department_id', tap_lite.id('D_TCS')))$$,
  '22023', 'Q5 a student must choose a level');
select tap_lite.throws($$insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (tap_lite.id('qBad'), 'q.bad@uni.test', now(),
  '{"registration_type":"student","full_name":"Q Bad"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200')))$$,
  '22023', 'Q6 a student must choose a department');
select tap_lite.throws($$insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (tap_lite.id('qBad'), 'q.bad@uni.test', now(),
  '{"registration_type":"student","full_name":"Q Bad"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L200'), 'department_id', tap_lite.id('D_CLOSED')))$$,
  '22023', 'Q7 an inactive department is rejected');
select tap_lite.throws($$insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (tap_lite.id('qBad'), 'q.bad@uni.test', now(),
  '{"registration_type":"student","full_name":"Q Bad","level_id":"not-a-uuid","department_id":"00000000-0000-0000-0000-000000000000"}'::jsonb)$$,
  '22023', 'Q8 malformed or unknown ids are rejected');
select tap_lite.throws($$insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (tap_lite.id('qBad'), 'q.bad@uni.test', now(),
  '{"registration_type":"lecturer","full_name":"Q Bad"}'::jsonb)$$,
  '22023', 'Q9 a lecturer must choose a home department');
select tap_lite.rows_are($$select 1 from auth.users where id = tap_lite.id('qBad')$$, 0,
  'Q10 a rejected sign-up leaves no auth user behind (same transaction)');

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  (tap_lite.id('qStud'), 'q.stud@uni.test', now(),
   '{"registration_type":"student","full_name":"Q Student"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L300'), 'department_id', tap_lite.id('D_TMTH'))),
  (tap_lite.id('qLec'), 'q.lec@uni.test', now(),
   '{"registration_type":"lecturer","full_name":"Q Lecturer"}'::jsonb || jsonb_build_object('department_id', tap_lite.id('D_TMTH'), 'level_id', tap_lite.id('L300')));
select tap_lite.ok((select level_id = tap_lite.id('L300') and department_id = tap_lite.id('D_TMTH') and approval_status = 'pending'
                    from public.students where profile_id = tap_lite.id('qStud')),
  'Q11 a student''s chosen level and department are stored, and the account is still pending');
select tap_lite.ok((select department_id = tap_lite.id('D_TMTH') and approval_status = 'pending'
                    from public.staff_details where profile_id = tap_lite.id('qLec')),
  'Q12 a lecturer''s chosen home department is stored, and the account is still pending');
select tap_lite.as_user(tap_lite.id('qStud'));
select tap_lite.is_equal(public.is_approved_student(), false, 'Q13 choosing a department grants nothing before approval');
select tap_lite.as_user(tap_lite.id('admin1'));
select tap_lite.lives($$select public.review_registration(tap_lite.id('qStud'), 'approved', tap_lite.id('L100'), tap_lite.id('D_TCS'))$$,
  'Q14 an administrator can correct the level and department while approving');
select tap_lite.ok((select level_id = tap_lite.id('L100') and department_id = tap_lite.id('D_TCS') from public.students where profile_id = tap_lite.id('qStud')),
  'Q15 ... and the corrected values are saved');
select tap_lite.as_postgres();
insert into public.students (school_email, full_name, registration_number, level_id, department_id, approval_status)
values ('q.pre@uni.test', 'Q Pre', 'PRE/0099', tap_lite.id('L700'), tap_lite.id('D_TENG'), 'pending');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (tap_lite.id('qPre'), 'q.pre@uni.test', null,
  '{"registration_type":"student","full_name":"Q Pre"}'::jsonb || jsonb_build_object('level_id', tap_lite.id('L100'), 'department_id', tap_lite.id('D_TCS')));
select tap_lite.ok((select level_id = tap_lite.id('L700') and department_id = tap_lite.id('D_TENG') from public.students where school_email = 'q.pre@uni.test'),
  'Q16 a pre-registered record keeps the administrator''s level and department');

select * from tap_lite.finish();
rollback;
