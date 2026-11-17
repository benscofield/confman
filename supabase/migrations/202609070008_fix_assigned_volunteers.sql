-- Fix assigned-volunteer data so conference-scoped dropdowns only show valid current assignees.
-- This migration does 3 things:
-- 1) Remove conference volunteers that do not match an active church volunteer for that conference's church.
-- 2) Deduplicate conference volunteers by normalized identity within each conference.
-- 3) If tasks.assigned_conference_volunteer_id exists, remap duplicate task references to the kept volunteer row.

-- Normalization rules:
-- - full_name: trim + lowercase
-- - email: trim + lowercase, null -> empty
-- - phone: keep digits only, null -> empty

-- 1) Remove stale conference volunteers not present in active church roster
with stale_rows as (
  select cv.id
  from public.conference_volunteers cv
  join public.conferences c on c.id = cv.conference_id
  where not exists (
    select 1
    from public.church_volunteers chv
    where chv.church_id = c.church_id
      and chv.is_active = true
      and lower(trim(chv.full_name)) = lower(trim(cv.full_name))
      and coalesce(lower(trim(chv.email)), '') = coalesce(lower(trim(cv.email)), '')
      and regexp_replace(coalesce(chv.phone, ''), '\\D', '', 'g') = regexp_replace(coalesce(cv.phone, ''), '\\D', '', 'g')
  )
)
delete from public.conference_volunteers cv
using stale_rows s
where cv.id = s.id;

-- 2) Deduplicate by normalized identity per conference
-- Keep the oldest row by created_at, then id for deterministic tie-break.
create temporary table if not exists tmp_conference_volunteer_dupes (
  duplicate_id uuid not null,
  keep_id uuid not null
) on commit drop;

truncate table tmp_conference_volunteer_dupes;

insert into tmp_conference_volunteer_dupes (duplicate_id, keep_id)
with ranked as (
  select
    cv.id,
    first_value(cv.id) over (
      partition by
        cv.conference_id,
        lower(trim(cv.full_name)),
        coalesce(lower(trim(cv.email)), ''),
        regexp_replace(coalesce(cv.phone, ''), '\\D', '', 'g')
      order by cv.created_at asc, cv.id asc
    ) as keep_id,
    row_number() over (
      partition by
        cv.conference_id,
        lower(trim(cv.full_name)),
        coalesce(lower(trim(cv.email)), ''),
        regexp_replace(coalesce(cv.phone, ''), '\\D', '', 'g')
      order by cv.created_at asc, cv.id asc
    ) as rn
  from public.conference_volunteers cv
)
select id as duplicate_id, keep_id
from ranked
where rn > 1;

-- 3) Remap tasks assigned volunteer ids if that column exists
-- (safe for environments where migration 202609070007 is not yet applied)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tasks'
      and column_name = 'assigned_conference_volunteer_id'
  ) then
    update public.tasks t
    set assigned_conference_volunteer_id = d.keep_id,
        updated_at = now()
    from tmp_conference_volunteer_dupes d
    where t.assigned_conference_volunteer_id = d.duplicate_id;
  end if;
end $$;

-- Remove duplicate conference volunteer rows after reference remap.
delete from public.conference_volunteers cv
using tmp_conference_volunteer_dupes d
where cv.id = d.duplicate_id;
