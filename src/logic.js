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
