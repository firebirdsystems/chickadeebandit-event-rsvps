SELECT
  e.id,
  e.title,
  e.location,
  e.event_date,
  e.rsvp_deadline,
  e.headcount,
  e.created_by,
  COUNT(CASE WHEN r.status = 'yes'   THEN 1 END) AS rsvp_yes,
  COUNT(CASE WHEN r.status = 'maybe' THEN 1 END) AS rsvp_maybe,
  COUNT(CASE WHEN r.status = 'no'    THEN 1 END) AS rsvp_no
FROM events e
LEFT JOIN rsvps r
  ON r.event_id = e.id
  AND r.household_id = e.household_id
WHERE e.household_id = current_setting('app.household_id', true)::uuid
  AND e.cancelled = 0
  AND e.event_date::timestamptz >= NOW()
GROUP BY e.id, e.title, e.location, e.event_date, e.rsvp_deadline, e.headcount, e.created_by
ORDER BY e.event_date ASC
LIMIT 20
