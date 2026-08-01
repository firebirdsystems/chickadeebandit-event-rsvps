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
FROM app_event_rsvps__events e
LEFT JOIN app_event_rsvps__rsvps r
  ON r.event_id = e.id
WHERE e.cancelled = 0
-- `event_date` is a full ISO-8601 UTC instant (…T18:00:00.000Z). datetime('now')
-- renders 'YYYY-MM-DD HH:MM:SS'. The comparison only worked because 'T' sorts
-- above ' ', which kept every event dated today regardless of its time.
  AND e.event_date >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
GROUP BY e.id, e.title, e.location, e.event_date, e.rsvp_deadline, e.headcount, e.created_by
ORDER BY e.event_date ASC
LIMIT 20
