SELECT
  e.id AS event_id,
  e.title,
  e.event_date,
  r.member_id,
  r.status,
  r.guest_count,
  r.note
FROM events e
LEFT JOIN rsvps r
  ON r.event_id = e.id
  AND r.household_id = e.household_id
WHERE e.household_id = current_setting('app.household_id', true)::uuid
  AND e.cancelled = 0
  AND e.event_date::timestamptz >= NOW()
ORDER BY e.event_date ASC, r.status ASC
LIMIT 200
