-- =============================================================================
-- 0008  Lecturer selector: stop returning lecturer assignments to students
--
-- Finding (application audit): search_lecturers returned `scope_labels`, the list
-- of levels/departments a lecturer is assigned to. Any approved student could read
-- it by calling the RPC directly, although the selector needs only name, title and
-- department to tell lecturers apart. Assignments are staff-side configuration.
--
-- The return type changes, so the function is dropped and recreated (CREATE OR
-- REPLACE cannot change a return type). No data is touched. Behaviour, filters,
-- eligibility rules and error codes are unchanged; only the last column is gone.
-- Grants are re-applied explicitly because DROP removes them.
-- =============================================================================
drop function if exists public.search_lecturers(text, uuid, uuid, integer, integer);

create or replace function public.search_lecturers(
  p_query          text    default null,
  p_department_id  uuid    default null,
  p_level_id       uuid    default null,
  p_limit          integer default 20,
  p_offset         integer default 0
) returns table (
  profile_id            uuid,
  full_name             text,
  title                 text,
  home_department_id    uuid,
  home_department_name  text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q      text;
  v_limit  integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.is_approved_student() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_q := nullif(btrim(coalesce(p_query, '')), '');
  if v_q is not null then
    if char_length(v_q) > 100 then
      raise exception 'query too long' using errcode = '22023';
    end if;
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
  select p.id, p.full_name, sd.title, d.id, d.name
  from public.profiles p
  join public.staff_details sd on sd.profile_id = p.id
  left join public.departments d on d.id = sd.department_id
  where p.role in ('lecturer', 'main_lecturer')
    and p.is_active
    and sd.accepts_complaints
    and (v_q is null or p.full_name ilike '%' || v_q || '%' escape '\')
    and (p_department_id is null or sd.department_id = p_department_id
         or exists (select 1 from public.lecturer_assignments a
                    where a.lecturer_profile_id = p.id and a.is_active
                      and a.department_id = p_department_id))
    and (p_level_id is null
         or exists (select 1 from public.lecturer_assignments a
                    where a.lecturer_profile_id = p.id and a.is_active
                      and a.level_id = p_level_id))
  order by p.full_name, p.id
  limit v_limit offset v_offset;
end $$;

revoke all on function public.search_lecturers(text, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.search_lecturers(text, uuid, uuid, integer, integer) to authenticated;
