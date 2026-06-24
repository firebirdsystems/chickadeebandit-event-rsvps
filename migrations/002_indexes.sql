CREATE INDEX IF NOT EXISTS events_date_cancelled ON app_event_rsvps__events(event_date, cancelled);
CREATE INDEX IF NOT EXISTS activity_record ON app_event_rsvps__activity(record_id);
CREATE INDEX IF NOT EXISTS activity_created ON app_event_rsvps__activity(created_at);
