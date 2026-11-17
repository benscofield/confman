-- Diagnose mismatch between conference-assigned volunteers and active church roster
-- for one conference.
--
-- Replace the UUID in params.target_conference_id before running.

with params as (
  select 'adc8e48b-481e-4ab3-8e57-79922eadbab9'::uuid as target_conference_id
),
conference_ctx as (
  select c.id as conference_id, c.church_id
  from public.conferences c
  join params p on p.target_conference_id = c.id
),
assigned as (
  select
    cv.id,
    cv.full_name,
    cv.email,
    cv.phone,
    lower(trim(cv.full_name)) as full_name_key,
    coalesce(lower(trim(cv.email)), '') as email_key,
    regexp_replace(coalesce(cv.phone, ''), '\\D', '', 'g') as phone_key
  from public.conference_volunteers cv
  join conference_ctx cc on cc.conference_id = cv.conference_id
),
roster as (
  select
    chv.id,
    chv.full_name,
    chv.email,
    chv.phone,
    lower(trim(chv.full_name)) as full_name_key,
    coalesce(lower(trim(chv.email)), '') as email_key,
    regexp_replace(coalesce(chv.phone, ''), '\\D', '', 'g') as phone_key
  from public.church_volunteers chv
  join conference_ctx cc on cc.church_id = chv.church_id
  where chv.is_active = true
)
select
  (select count(*) from assigned) as assigned_count,
  (select count(*) from roster) as active_roster_count,
  (
    select count(*)
    from roster r
    left join assigned a
      on a.full_name_key = r.full_name_key
     and a.email_key = r.email_key
     and a.phone_key = r.phone_key
    where a.id is null
  ) as roster_missing_from_assigned,
  (
    select count(*)
    from assigned a
    left join roster r
      on a.full_name_key = r.full_name_key
     and a.email_key = r.email_key
     and a.phone_key = r.phone_key
    where r.id is null
  ) as assigned_not_in_active_roster;
