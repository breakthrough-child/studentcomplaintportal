-- =============================================================================
-- supabase/seed.sql  --  DEVELOPMENT DATA ONLY
--
-- Runs automatically on `supabase db reset` (local development). Do NOT run it
-- against production. It contains no accounts, passwords or credentials.
--
-- Academic levels (100-700), complaint categories and application settings are
-- reference data required by the app, so they live in migration
-- 20261009000006_reference_data.sql and are present in every environment.
--
-- Example departments below are illustrative; administrators manage the real
-- list in the UI (/admin/departments).
-- =============================================================================

insert into public.departments (name, code, description) values
  ('Computer Science',    'CSC', 'Example department'),
  ('Engineering',         'ENG', 'Example department'),
  ('Mathematics',         'MTH', 'Example department'),
  ('Physics',             'PHY', 'Example department'),
  ('Medicine and Surgery','MBS', 'Example department (programme runs to 700 Level)'),
  ('Nursing',             'NUR', 'Example department')
on conflict (lower(name)) do nothing;
