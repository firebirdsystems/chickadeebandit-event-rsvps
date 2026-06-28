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
