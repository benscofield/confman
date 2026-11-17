-- Restore missing conference volunteer assignments for one conference.
-- Use this when cleanup removed too many assigned volunteers.
--
-- Steps:
-- 1) Replace the UUID in the params CTE with the conference id you want to repair.
-- 2) Run the script.
-- 3) Refresh the app and verify task add/edit volunteer dropdown options.

begin;

with params as (
  select 'adc8e48b-481e-4ab3-8e57-79922eadbab9'::uuid as target_conference_id
),
conference_ctx as (
  select c.id as conference_id, c.church_id
  from public.conferences c
  join params p on p.target_conference_id = c.id
),
current_assigned as (
  select
    cv.conference_id,
    lower(trim(cv.full_name)) as full_name_key,
    coalesce(lower(trim(cv.email)), '') as email_key,
    regexp_replace(coalesce(cv.phone, ''), '\\D', '', 'g') as phone_key
  from public.conference_volunteers cv
  join conference_ctx cc on cc.conference_id = cv.conference_id
),
roster as (
  select
    cc.conference_id,
    chv.full_name,
    chv.email,
    chv.phone,
    chv.default_role_name,
    chv.notes,
    lower(trim(chv.full_name)) as full_name_key,
    coalesce(lower(trim(chv.email)), '') as email_key,
    regexp_replace(coalesce(chv.phone, ''), '\\D', '', 'g') as phone_key
  from conference_ctx cc
  join public.church_volunteers chv on chv.church_id = cc.church_id
  where chv.is_active = true
),
missing as (
  select r.*
  from roster r
  left join current_assigned a
    on a.conference_id = r.conference_id
   and a.full_name_key = r.full_name_key
   and a.email_key = r.email_key
   and a.phone_key = r.phone_key
  where a.conference_id is null
)
insert into public.conference_volunteers (
  conference_id,
  full_name,
  email,
  phone,
  role_name,
  notes
)
select
  m.conference_id,
  m.full_name,
  m.email,
  m.phone,
  coalesce(nullif(trim(m.default_role_name), ''), 'Volunteer') as role_name,
  m.notes
from missing m;

commit;
