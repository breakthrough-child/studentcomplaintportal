-- =============================================================================
-- 0010  Main lecturers can list the lecturers a complaint may be assigned to
--
-- Need (application): assign_complaint(complaint, lecturer) takes a lecturer id, but a
-- main lecturer cannot read arbitrary lecturer profiles (profiles_select only exposes people
-- who take part in complaints the caller may access). Without a listing function the
-- assignment form could not work, and widening profiles_select would expose far more.
--
-- This SECURITY DEFINER function returns only what the assignment form needs, only to main
-- lecturers, and only lecturers who are currently eligible recipients (_is_eligible_lecturer:
-- active, lecturer/main_lecturer role, accepts complaints). Unlike the student selector it
-- includes scope labels: main lecturers manage routing and are staff.
-- =============================================================================
create or replace function public.list_assignable_lecturers(
  p_query text default null,
  p_limit integer default 50
) returns table (
  profile_id       uuid,
  full_name        text,
  title            text,
  department_name  text,
  scope_labels     text[]
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q     text := nullif(btrim(coalesce(p_query, '')), '');
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not public.is_main_lecturer() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_q is not null then
    if char_length(v_q) > 100 then
      raise exception 'query too long' using errcode = '22023';
    end if;
    v_q := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  end if;

  return query
  select p.id, p.full_name, sd.title, d.name,
         coalesce((
           select array_agg(distinct x.label order by x.label)
           from (
             select concat_ws(' / ', l.name, dd.name) as label
             from public.lecturer_assignments a
             left join public.academic_levels l on l.id = a.level_id
             left join public.departments dd on dd.id = a.department_id
             where a.lecturer_profile_id = p.id and a.is_active and a.scope_type <> 'institution'
           ) x
         ), '{}'::text[])
  from public.profiles p
  join public.staff_details sd on sd.profile_id = p.id
  left join public.departments d on d.id = sd.department_id
  where public._is_eligible_lecturer(p.id)
    and (v_q is null or p.full_name ilike '%' || v_q || '%' escape '\')
  order by p.full_name, p.id
  limit v_limit;
end $$;

revoke all on function public.list_assignable_lecturers(text, integer) from public, anon;
grant execute on function public.list_assignable_lecturers(text, integer) to authenticated;
