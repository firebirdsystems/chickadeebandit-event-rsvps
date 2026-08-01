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
-- `event_date` is stored as a full ISO-8601 UTC instant (new Date().toISOString(),
-- e.g. 2026-07-30T18:00:00.000Z). datetime('now') renders 'YYYY-MM-DD HH:MM:SS',
-- so comparing the two only worked because 'T' sorts above ' ' — which silently
-- kept every event dated today, however long ago it ended. Match the stored
-- format exactly. UTC is correct here: the column is an instant, not a local date.
  AND e.event_date >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
ORDER BY e.event_date ASC, r.status ASC
LIMIT 200
