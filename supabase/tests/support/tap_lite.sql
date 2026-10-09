-- =============================================================================
-- tap_lite: a tiny assertion helper for plain `psql` (no pgTAP required).
-- TEST-ONLY. Loaded by supabase/tests/run-local.sh inside the test transaction.
--
-- Output is TAP-like ("ok N - name" / "not ok N - name # detail"), and the
-- runner fails if any "not ok" line is printed.
-- =============================================================================

create schema if not exists tap_lite;

create table if not exists tap_lite.results (
  n       serial primary key,
  ok      boolean not null,
  name    text not null,
  detail  text
);
-- Key/value scratch space for fixture ids (readable under any test role).
create table if not exists tap_lite.fx (k text primary key, v uuid not null);

grant usage on schema tap_lite to public;
grant all on tap_lite.results, tap_lite.fx to public;
grant usage on sequence tap_lite.results_n_seq to public;

create or replace function tap_lite.ok(p_ok boolean, p_name text, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into tap_lite.results (ok, name, detail) values (coalesce(p_ok, false), p_name, p_detail);
end $$;

-- tap_lite.id('studA') -> fixture uuid
create or replace function tap_lite.id(p_key text) returns uuid
language sql stable as $$ select v from tap_lite.fx where k = p_key $$;

-- Statement must raise; optionally with a specific SQLSTATE.
create or replace function tap_lite.throws(p_sql text, p_state text, p_name text)
returns void language plpgsql as $$
declare v_state text; v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_state := sqlstate;
  end;
  perform tap_lite.ok(
    v_state is not null and (p_state is null or v_state = p_state),
    p_name,
    case when v_state is null then 'did not raise'
         else 'raised ' || v_state || ' (expected ' || coalesce(p_state, 'any') || '): ' || v_msg end);
end $$;

create or replace function tap_lite.lives(p_sql text, p_name text)
returns void language plpgsql as $$
declare v_msg text; v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_state := sqlstate;
  end;
  perform tap_lite.ok(v_state is null, p_name, 'raised ' || coalesce(v_state, '') || ': ' || coalesce(v_msg, ''));
end $$;

-- Number of rows returned / affected by a statement (SELECT, or UPDATE/DELETE ... ).
create or replace function tap_lite.rows_are(p_sql text, p_expected bigint, p_name text)
returns void language plpgsql as $$
declare v_n bigint; v_msg text; v_state text;
begin
  begin
    execute p_sql;
    get diagnostics v_n = row_count;
  exception when others then
    get stacked diagnostics v_msg = message_text;
    v_state := sqlstate;
  end;
  perform tap_lite.ok(v_state is null and v_n = p_expected, p_name,
    case when v_state is not null then 'raised ' || v_state || ': ' || v_msg
         else 'expected ' || p_expected || ' rows, got ' || v_n end);
end $$;

-- Scalar comparison helper.
create or replace function tap_lite.is_equal(p_actual anyelement, p_expected anyelement, p_name text)
returns void language plpgsql as $$
begin
  perform tap_lite.ok(p_actual is not distinct from p_expected, p_name,
    'expected ' || coalesce(p_expected::text, 'NULL') || ', got ' || coalesce(p_actual::text, 'NULL'));
end $$;

-- Role switching (works from any current role: RESET ROLE returns to the session user).
create or replace function tap_lite.as_user(p_user uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

create or replace function tap_lite.as_anon() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;

create or replace function tap_lite.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
end $$;

create or replace function tap_lite.finish() returns setof text language plpgsql as $$
declare r record; v_pass int; v_fail int;
begin
  perform tap_lite.as_postgres();
  for r in select * from tap_lite.results order by n loop
    return next case when r.ok then 'ok ' || r.n || ' - ' || r.name
                     else 'not ok ' || r.n || ' - ' || r.name || coalesce(' # ' || r.detail, '') end;
  end loop;
  select count(*) filter (where ok), count(*) filter (where not ok) into v_pass, v_fail from tap_lite.results;
  return next '# passed ' || v_pass || ' / failed ' || v_fail || ' / total ' || (v_pass + v_fail);
end $$;

grant execute on all functions in schema tap_lite to public;
