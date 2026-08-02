-- Automation support for the `create_event` action.
--
-- `source_event_id` records which app event produced the row. The dispatcher's
-- dedupe guard matches on it (SELECT 1 FROM ... WHERE source_event_id = ?
-- LIMIT 1), so a redelivered trigger reuses the event already on the calendar
-- rather than opening a second RSVP sheet for the same gathering.
--
-- Nullable on purpose: events created by a person have no source event, and the
-- guard only ever looks for a specific non-null id.
ALTER TABLE app_event_rsvps__events ADD COLUMN source_event_id TEXT;

CREATE INDEX IF NOT EXISTS app_event_rsvps__idx_events_source_event_id
  ON app_event_rsvps__events(source_event_id);
