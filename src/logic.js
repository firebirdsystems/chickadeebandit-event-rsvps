import { isAdult } from "./shared.js";
export { isAdult };

export function canCreateEvent(member) {
  return isAdult(member);
}

export function canManageEvent(event, member) {
  if (!member) return false;
  return isAdult(member) || event.created_by === member.id;
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
