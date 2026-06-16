SELECT
  e.id AS event_id,
  e.title,
  e.event_date,
  r.member_id,
  r.status,
  r.guest_count,
  r.note
FROM app_event_rsvps__events e
LEFT JOIN app_event_rsvps__rsvps r
  ON r.event_id = e.id
WHERE e.cancelled = 0
  AND e.event_date >= datetime('now')
ORDER BY e.event_date ASC, r.status ASC
LIMIT 200
