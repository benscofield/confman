-- Preacher Portal: Sample Data Population Script
-- Use this to add test/sample data for preachers

-- OPTION 1: Add speaking slots for existing preachers
-- Adjust dates and times as needed for your conference

INSERT INTO preacher_speaking_slots (church_preacher_id, service_name, starts_at, ends_at, altar_call, stage_assignment)
SELECT 
  cp.id,
  'Sunday Morning Keynote',
  NOW() + INTERVAL '3 days' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  NOW() + INTERVAL '3 days 1 hour' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  true,
  'Main Stage'
FROM church_preachers cp
WHERE cp.is_active = true
LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO preacher_speaking_slots (church_preacher_id, service_name, starts_at, ends_at, altar_call, stage_assignment)
SELECT 
  cp.id,
  'Evening Worship Service',
  NOW() + INTERVAL '4 days 6 hours' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  NOW() + INTERVAL '4 days 7 hours' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  false,
  'Main Stage'
FROM church_preachers cp
WHERE cp.is_active = true
LIMIT 1 OFFSET 1
ON CONFLICT DO NOTHING;

-- OPTION 2: Add hotel and logistics for preachers
-- Update the values to match your conference logistics

INSERT INTO preacher_logistics (church_preacher_id, hotel_name, room_number, check_in_at, check_out_at, dietary_notes, flight_number, flight_arrival_at, flight_departure_at, pickup_notes)
SELECT
  cp.id,
  'Hilton Downtown Conference Center',
  ROW_NUMBER() OVER (ORDER BY cp.id) || '12',
  NOW() + INTERVAL '2 days' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  NOW() + INTERVAL '5 days' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  'No restrictions',
  'UA' || ROW_NUMBER() OVER (ORDER BY cp.id),
  NOW() + INTERVAL '2 days 1 hour' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  NOW() + INTERVAL '5 days 3 hours' AT TIME ZONE 'America/Chicago' AT TIME ZONE 'UTC',
  'Airport pickup arranged by church. Driver will meet in baggage claim with name sign.'
FROM church_preachers cp
WHERE cp.is_active = true
ON CONFLICT (church_preacher_id) DO UPDATE SET
  hotel_name = EXCLUDED.hotel_name,
  check_in_at = EXCLUDED.check_in_at,
  check_out_at = EXCLUDED.check_out_at;

-- OPTION 3: Assign personal assistants to preachers
-- Make sure to have created personal assistants first

INSERT INTO preacher_pa_assignments (church_preacher_id, church_personal_assistant_id)
SELECT 
  cp.id,
  cpa.id
FROM church_preachers cp
CROSS JOIN church_personal_assistants cpa
WHERE cp.is_active = true 
  AND cpa.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM preacher_pa_assignments ppa
    WHERE ppa.church_preacher_id = cp.id
  )
LIMIT 1
ON CONFLICT (church_preacher_id) DO NOTHING;

-- OPTION 4: Query all preachers and their current schedule
SELECT 
  cp.full_name,
  cp.email,
  cp.ministry_name,
  COUNT(DISTINCT pss.id) as speaking_slots,
  pl.hotel_name,
  pl.check_in_at,
  ppa.church_personal_assistant_id
FROM church_preachers cp
LEFT JOIN preacher_speaking_slots pss ON cp.id = pss.church_preacher_id
LEFT JOIN preacher_logistics pl ON cp.id = pl.church_preacher_id
LEFT JOIN preacher_pa_assignments ppa ON cp.id = ppa.church_preacher_id
WHERE cp.is_active = true
GROUP BY cp.id, cp.full_name, cp.email, cp.ministry_name, pl.hotel_name, pl.check_in_at, ppa.church_personal_assistant_id
ORDER BY cp.full_name;

-- OPTION 5: View accommodation requests by priority
SELECT 
  par.id,
  cp.full_name,
  par.title,
  par.category,
  par.priority,
  par.status,
  par.created_at
FROM preacher_accommodation_requests par
JOIN church_preachers cp ON par.church_preacher_id = cp.id
WHERE par.status = 'pending'
ORDER BY 
  CASE 
    WHEN par.priority = 'high' THEN 1
    WHEN par.priority = 'medium' THEN 2
    ELSE 3
  END,
  par.created_at;

-- OPTION 6: Update accommodation request status (admin only)
-- Replace 'REQUEST_ID' with actual ID and 'approved' or 'declined' for status
UPDATE preacher_accommodation_requests
SET status = 'approved', admin_notes = 'Approved and arranged with hotel'
WHERE id = 'REQUEST_ID';

-- OPTION 7: Add biographical notes to preachers
UPDATE church_preachers
SET biography = 'Pastor John Smith is a dynamic communicator with over 20 years of ministry experience. He leads worship initiatives and discipleship programs at Grace Fellowship Church. John holds a Master''s degree in Theology and is passionate about mentoring the next generation of leaders.'
WHERE full_name = 'John Smith' AND is_active = true
LIMIT 1;

-- OPTION 8: View all flight documents uploaded
SELECT 
  cp.full_name,
  pfd.filename,
  pfd.file_type,
  pfd.document_url,
  pfd.created_at
FROM preacher_flight_documents pfd
JOIN church_preachers cp ON pfd.church_preacher_id = cp.id
ORDER BY pfd.created_at DESC;

-- OPTION 9: Add dietary restrictions for a preacher
UPDATE preacher_logistics
SET dietary_notes = 'Vegetarian, no gluten, nut allergy'
WHERE church_preacher_id IN (
  SELECT id FROM church_preachers WHERE full_name = 'John Smith' LIMIT 1
);

-- OPTION 10: Add hospitality notes
UPDATE preacher_logistics
SET hospitality_notes = 'Wife attending - needs room for 2. Prefers ground floor for mobility reasons. Coffee drinker.'
WHERE church_preacher_id IN (
  SELECT id FROM church_preachers WHERE full_name = 'John Smith' LIMIT 1
);

-- Helpful queries for admins

-- Count preachers by assignment status
SELECT 
  'Preachers with speaking slots' as metric,
  COUNT(DISTINCT church_preacher_id) as count
FROM preacher_speaking_slots
UNION ALL
SELECT 
  'Preachers with logistics assigned',
  COUNT(DISTINCT church_preacher_id)
FROM preacher_logistics
UNION ALL
SELECT 
  'Preachers with PA assigned',
  COUNT(DISTINCT church_preacher_id)
FROM preacher_pa_assignments
UNION ALL
SELECT 
  'Total active preachers',
  COUNT(id)
FROM church_preachers
WHERE is_active = true;

-- List preachers missing required info
SELECT 
  cp.full_name,
  cp.email,
  CASE WHEN pss.id IS NULL THEN '❌ No speaking slots' ELSE '✅ Has slots' END as speaking_slots,
  CASE WHEN pl.id IS NULL THEN '❌ No logistics' ELSE '✅ Has logistics' END as logistics,
  CASE WHEN ppa.id IS NULL THEN '❌ No PA assigned' ELSE '✅ Has PA' END as pa_assigned
FROM church_preachers cp
LEFT JOIN preacher_speaking_slots pss ON cp.id = pss.church_preacher_id
LEFT JOIN preacher_logistics pl ON cp.id = pl.church_preacher_id
LEFT JOIN preacher_pa_assignments ppa ON cp.id = ppa.church_preacher_id
WHERE cp.is_active = true
ORDER BY cp.full_name;
