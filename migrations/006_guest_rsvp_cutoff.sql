-- When a writable share link stops taking guest RSVPs. Declared as the share
-- item's `submit.until_column`, so the hub refuses a guest RSVP once it has
-- passed while the event page itself stays readable.
--
-- A column of its own rather than `rsvp_deadline`: the hub compares the cutoff
-- in the clear, and `rsvp_deadline` is encrypted. The `_at` suffix makes this
-- one plaintext by the platform's built-in list.
--
-- The app writes the RSVP deadline when the event has one, else the event's own
-- start (`guestRsvpsCloseAt` in src/logic.js). The `create_event` automation
-- writes its date-only `event_date`, which the hub reads as the END of that
-- household day.
--
-- Backfill: migrations run outside the encryption codec, so `rsvp_deadline`
-- cannot be read here. Every existing event gets its start as the cutoff — the
-- latest a guest RSVP could sensibly land — and an event with an earlier RSVP
-- deadline tightens to it the next time an adult saves it.
ALTER TABLE app_event_rsvps__events ADD COLUMN guest_rsvps_close_at TEXT;

UPDATE app_event_rsvps__events SET guest_rsvps_close_at = event_date WHERE guest_rsvps_close_at IS NULL
