import { isAdult } from "./shared.js";
export { isAdult };

export function canCreateEvent(member) {
  return isAdult(member);
}

export function canManageEvent(event, member) {
  if (!member) return false;
  return isAdult(member);
}

export function isUpcoming(event) {
  return new Date(event.event_date) >= new Date() && !event.cancelled;
}

export function deadlinePassed(event) {
  if (!event.rsvp_deadline) return false;
  return new Date(event.rsvp_deadline) < new Date();
}

/**
 * When the share link stops taking guest RSVPs (`guest_rsvps_close_at`, the
 * share item's `until_column`): the RSVP deadline when the event has one, else
 * the event's own start. The earlier of the two if a deadline was set after the
 * event — a guest RSVP for an event that has already begun is no use to anyone.
 */
export function guestRsvpsCloseAt(eventDate, rsvpDeadline) {
  if (!rsvpDeadline) return eventDate;
  const deadline = new Date(rsvpDeadline).getTime();
  if (!Number.isFinite(deadline)) return eventDate;
  const start = new Date(eventDate).getTime();
  return Number.isFinite(start) && start < deadline ? eventDate : rsvpDeadline;
}

export function myRsvp(eventId, rsvps, memberId) {
  return rsvps.find(r => r.event_id === eventId && r.member_id === memberId) ?? null;
}

/**
 * Returns { yes: rsvp[], no: rsvp[], maybe: rsvp[], noResponse: member[] }
 * noResponse contains full member objects for members with no RSVP for this event.
 */
export function rsvpCounts(eventId, rsvps, members) {
  const eventRsvps = rsvps.filter(r => r.event_id === eventId);
  const responded = new Set(eventRsvps.map(r => r.member_id));
  const byStatus = { yes: [], no: [], maybe: [] };
  for (const r of eventRsvps) {
    if (byStatus[r.status]) byStatus[r.status].push(r);
  }
  const noResponse = members.filter(m => !responded.has(m.id));
  return { ...byStatus, noResponse };
}

/**
 * Total confirmed attendees: yes RSVPs + their guests.
 * Maybe/no are excluded from this definite count.
 */
export function totalAttendees(eventId, rsvps) {
  return rsvps
    .filter(r => r.event_id === eventId && r.status === "yes")
    .reduce((sum, r) => sum + 1 + (r.guest_count ?? 0), 0);
}

/**
 * Leading characters that make a spreadsheet treat a cell as a formula rather
 * than text. Tab and CR are included because Excel strips them before parsing,
 * so `\t=cmd` reaches the formula parser as `=cmd`.
 *
 * Kept character-for-character identical to the hub's own export guard
 * (cloudflare/reports.ts) — one product must not neutralise the same attack
 * two different ways.
 */
const CSV_FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One CSV cell: formula-neutralised, then quoted only if it needs quoting.
 *
 * Quoting alone is not a defence. `"=cmd|' /C calc'!A0"` is a perfectly
 * well-formed quoted field that Excel, Sheets and LibreOffice all hand to the
 * formula parser on open — and `guest_name` arrives from an unauthenticated
 * share form, so the organiser exporting their own attendee list is the
 * delivery mechanism. A leading apostrophe is the spreadsheet's own
 * "treat as text" marker.
 *
 * This is deliberately done at EXPORT, not at ingest:
 * - the app has no ingest hook at all — guest rows are written by the hub's
 *   share-submit endpoint, which bypasses app code by design;
 * - the stored value is the truth, and the payload is only dangerous in a
 *   spreadsheet. Escaping belongs at the sink, exactly as the HTML path uses
 *   esc() at render rather than storing escaped markup;
 * - export-time covers rows already in the database. Ingest-time never can.
 */
export function csvCell(value) {
  const text = value == null ? "" : String(value);
  const guarded = CSV_FORMULA_LEAD.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/**
 * Rewrites SQLite's default-timestamp shape into the ISO instant it actually
 * is. `guest_rsvps.created_at` defaults to `datetime('now')` (migration 004),
 * which emits `YYYY-MM-DD HH:MM:SS` — space-separated, zone-less UTC. `new
 * Date()` parses that as LOCAL time (silently off by the viewer's UTC offset)
 * or, on older WebKit, as Invalid Date. Every app-written timestamp is already
 * ISO and passes through untouched; only the hub-inserted guest rows carry the
 * SQLite shape.
 */
export function normalizeTimestamp(ts) {
  if (typeof ts !== "string") return ts;
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts) ? ts.replace(" ", "T") + "Z" : ts;
}

/**
 * Guest RSVPs for one event, newest first.
 *
 * These are a SEPARATE ledger from member `rsvps` and are deliberately never
 * merged into `rsvpCounts`/`totalAttendees`: a guest row has no member behind
 * it, so "5 going" and "3 from the link" are two different kinds of evidence
 * and adding them silently would hide which is which.
 */
export function guestRsvpsFor(eventId, guestRsvps) {
  return guestRsvps
    .filter(g => g.event_id === eventId)
    .slice()
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
}

/**
 * Headcount from the shared link: submissions, and the people they speak for.
 * `heads` sums `guest_count` over 'going' rows only — the same rule the
 * manifest's public aggregate uses, so the two never disagree.
 */
export function guestTotals(eventId, guestRsvps) {
  const rows = guestRsvpsFor(eventId, guestRsvps);
  const going = rows.filter(g => g.status === "going");
  return {
    submissions: rows.length,
    going: going.length,
    maybe: rows.filter(g => g.status === "maybe").length,
    heads: going.reduce((sum, g) => sum + (Number(g.guest_count) || 0), 0),
  };
}

/**
 * Names that submitted more than once for this event, lower-cased.
 *
 * A share link has no identity to dedupe on and the submit path only ever
 * inserts, so somebody correcting "4 of us" to "2 of us" leaves BOTH rows and
 * the headcount reads 6. Nothing can prevent that; surfacing it lets the
 * organiser delete the stale row instead of catering for phantom guests.
 */
export function duplicateGuestNames(eventId, guestRsvps) {
  const seen = new Map();
  for (const g of guestRsvpsFor(eventId, guestRsvps)) {
    const key = String(g.guest_name ?? "").trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
}

export function buildReminderNotification(event, nonResponders, formattedEventDate, appId = "event-rsvps") {
  const audience = nonResponders.map(m => m.id);
  const names = nonResponders.map(m => m.name).join(", ");
  const qs = event.id ? `?eventId=${encodeURIComponent(event.id)}` : "";
  return {
    audience,
    title: `RSVP needed: ${event.title}`,
    body: `Please respond: ${names} — haven't RSVPed for "${event.title}" on ${formattedEventDate}.`,
    url: `/open/${appId}${qs}`,
  };
}

export function summarizeReminderDelivery(result, nonResponderCount) {
  const web = result?.web ?? {};
  const expo = result?.expo ?? {};
  const total = (web.total ?? 0) + (expo.total ?? 0);
  const sent = (web.sent ?? 0) + (expo.sent ?? 0);

  if (total === 0) {
    return "No notification subscriptions found for the non-responders. Ask them to enable notifications in Settings on their browser or device.";
  }
  if (sent === 0) {
    return "Reminder queued, but no notifications were delivered. Their notification subscription may be stale or blocked by the browser/OS.";
  }
  return `Reminder sent to ${sent} device${sent === 1 ? "" : "s"} for ${nonResponderCount} non-responder${nonResponderCount === 1 ? "" : "s"}.`;
}

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * Description and location count as well as the title — an event is
 * looked up by where it is at least as often as by what it is called.
 */
export function searchableFields(item) {
  return [item.title, item.description, item.location];
}

/**
 * The line a failed share-link create or revoke shows ("Hub endpoints other than `/api/db`"
 * in the app-template guide). The SDK's share helper puts the hub's `.status` (and `.code`)
 * on its error; the hub's text never reaches the screen.
 *   402 — on a plain link, the free plan's active-link cap (a 402 for a password, guest RSVPs
 *         or a longer expiry is the caller's plan line, checked before this)
 *   409 — `code: "share_link_limit"` is a paid household's active-link cap; a 409 without
 *         that code (a failure inside the mint, or an older hub) keeps "try again"
 *   400 — `code: "password_too_short"`; the caller pre-checks the length, so this is a backstop
 *   403 — not allowed, including `code: "not_owner"` (revoking another member's link)
 *   404 — the event is gone (a revoke's 404 is the caller's: the link is already gone)
 *   429 — too many requests just now
 */
export function shareFailureLine(e, { action, thing } = {}) {
  if (e?.status === 402) return "Too many share links are active — revoke one first.";
  if (e?.status === 409 && e?.code === "share_link_limit") return "Too many share links are active — revoke one first.";
  if (e?.status === 400 && e?.code === "password_too_short") return "The password needs at least 6 characters.";
  if (e?.status === 403) return `You don’t have permission to ${action}.`;
  if (e?.status === 404) return `This ${thing} has been removed.`;
  if (e?.status === 429) return "Too many tries — wait a minute and try again.";
  return `Couldn’t ${action} — try again.`;
}

/**
 * "Retry after a lost response" (app-template guide): whether a failed
 * write's answer leaves its outcome unknown — no status, a 400, or a 5xx
 * other than 507 — so the page reads the row back by its pinned id. A
 * `UNIQUE_CONSTRAINT` answer is a 400 too: the usual retry of a create that
 * landed collides on its own pinned id. Only finding the row under that id
 * says it landed; not found keeps the "already exists" line.
 */
export function outcomeUnknown(e) {
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return true;
  const status = Number(e?.status) || 0;
  return status === 0 || status === 400 || (status >= 500 && status !== 507);
}

/**
 * Whether a stored row differs from what the form holds now, over the form's
 * own fields only, compared as text with a missing value as empty.
 */
export function storedDiffers(row, fields) {
  return Object.keys(fields).some((k) => String(row?.[k] ?? "") !== String(fields[k] ?? ""));
}

export const SAVED_AS_FIRST = "Saved as first entered — check it and update what changed.";

/**
 * The line a failed write shows ("Refused, gone, or failed" in the app-template
 * guide): "try again" only when retrying can work. `action` and `thing` are the
 * app's own words ("save the event", "event"). An error the app worded for the
 * user (`forUser`) keeps its message. Decided from the error's `status` /
 * `code`, never from the hub's text.
 *
 * `found` is the caller's re-read after a write that changed nothing: false —
 * the row is gone; true — it is still there, which on this app's plain
 * `WHERE id = ?` writes means the row policy narrowed the write away; null —
 * the re-read itself failed.
 */
export function failureLine(e, { action, thing, found } = {}) {
  if (e?.forUser) return e.message;
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return `That ${thing} already exists.`;
  if (e?.status === 403 || found === true) return `You don’t have permission to ${action}.`;
  if (e?.status === 507) return "The household’s storage is full — free up space first.";
  if (e?.status === 429) return "Too many tries — wait a minute and try again.";
  if (found === null) return `Couldn’t ${action} — try again.`;
  if (found === false || e?.status === 404) return `This ${thing} has been removed.`;
  if (e?.status === 409) return `This ${thing} was changed by someone else — check it first.`;
  return `Couldn’t ${action} — try again.`;
}
