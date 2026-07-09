-- External guest RSVPs, submitted through a writable share link (premium
-- `sharing`). Kept in a DEDICATED table, separate from member `rsvps`: external
-- rows have no member identity, so they must not collide with the member-scoped
-- row policies / UNIQUE(event_id, member_id) on `rsvps`.
--
-- The hub's share-submit path sets only id, event_id (fk), and the declared
-- plaintext fields + fixed_values; every other column carries a DB default so
-- the hub never has to know about it.
CREATE TABLE IF NOT EXISTS app_event_rsvps__guest_rsvps (
  id          TEXT    PRIMARY KEY,
  event_id    TEXT    NOT NULL,
  guest_name  TEXT    NOT NULL DEFAULT '',
  guest_count INTEGER NOT NULL DEFAULT 1,
  status      TEXT    NOT NULL DEFAULT 'going',
  source      TEXT    NOT NULL DEFAULT 'external',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS guest_rsvps_event ON app_event_rsvps__guest_rsvps(event_id);
