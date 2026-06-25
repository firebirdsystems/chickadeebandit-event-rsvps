-- RSVPs are public headcount data: everyone reads, each member writes only their
-- own row. The `owner_or_visibility` row policy keys reads on this `visibility`
-- column (kept plaintext via the platform encryption skip-list). Default 'everyone'
-- so all existing and new RSVPs are visible to the whole household, while writes
-- stay owner-only. (`visibility` is also indexable for the policy's read filter.)
ALTER TABLE app_event_rsvps__rsvps
  ADD COLUMN visibility TEXT NOT NULL DEFAULT 'everyone';

-- The policy rewrites reads to `WHERE member_id = ? OR visibility IN (...)`;
-- index member_id so the owner-scoped branch stays cheap at org scale.
CREATE INDEX IF NOT EXISTS rsvps_member ON app_event_rsvps__rsvps(member_id);
