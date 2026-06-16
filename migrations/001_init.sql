CREATE TABLE IF NOT EXISTS app_event_rsvps__events (
  id            TEXT    PRIMARY KEY,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL DEFAULT '',
  location      TEXT    NOT NULL DEFAULT '',
  event_date    TEXT    NOT NULL,
  rsvp_deadline TEXT,
  headcount     INTEGER,
  created_by    TEXT    NOT NULL,
  created_at    TEXT    NOT NULL,
  cancelled     INTEGER NOT NULL DEFAULT 0
);


CREATE TABLE IF NOT EXISTS app_event_rsvps__rsvps (
  id            TEXT    PRIMARY KEY,
  event_id      TEXT    NOT NULL,
  member_id     TEXT    NOT NULL,
  status        TEXT    NOT NULL CHECK (status IN ('yes', 'no', 'maybe')),
  guest_count   INTEGER NOT NULL DEFAULT 0,
  note          TEXT    NOT NULL DEFAULT '',
  updated_at    TEXT    NOT NULL,
  UNIQUE (event_id, member_id)
);

CREATE INDEX IF NOT EXISTS rsvps_event ON app_event_rsvps__rsvps(event_id);

CREATE TABLE IF NOT EXISTS app_event_rsvps__activity (
  id            TEXT    PRIMARY KEY,
  record_id     TEXT    NOT NULL,
  actor_id      TEXT    NOT NULL,
  action        TEXT    NOT NULL,
  detail        TEXT    NOT NULL DEFAULT '',
  created_at    TEXT    NOT NULL
)
