import { describe, it, expect } from "vitest";
import {
  canCreateEvent, canManageEvent,
  isUpcoming, deadlinePassed,
  myRsvp, rsvpCounts, totalAttendees,
} from "../src/logic.js";

const ADULT = { id: "a1", name: "Alice", role: "adult" };
const CHILD = { id: "c1", name: "Charlie", role: "child" };
const OTHER = { id: "m3", name: "Morgan", role: "adult" };

const FUTURE = new Date(Date.now() + 7 * 86400000).toISOString();
const PAST   = new Date(Date.now() - 7 * 86400000).toISOString();

const BASE_EVENT = {
  id: "e1",
  created_by: "a1",
  event_date: FUTURE,
  rsvp_deadline: null,
  cancelled: 0,
};

// ── canCreateEvent ────────────────────────────────────────────────────────────

describe("canCreateEvent", () => {
  it("allows adults", ()   => expect(canCreateEvent(ADULT)).toBe(true));
  it("blocks children", () => expect(canCreateEvent(CHILD)).toBe(false));
  it("blocks null", ()     => expect(canCreateEvent(null)).toBe(false));
});

// ── canManageEvent ────────────────────────────────────────────────────────────

describe("canManageEvent", () => {
  it("allows adult non-creator",  () => expect(canManageEvent({ ...BASE_EVENT, created_by: "other" }, ADULT)).toBe(true));
  it("allows adult creator",      () => expect(canManageEvent(BASE_EVENT, ADULT)).toBe(true));
  it("blocks child non-creator",  () => expect(canManageEvent(BASE_EVENT, CHILD)).toBe(false));
  it("blocks null member",        () => expect(canManageEvent(BASE_EVENT, null)).toBe(false));
});

// ── isUpcoming ────────────────────────────────────────────────────────────────

describe("isUpcoming", () => {
  it("future event is upcoming",                () => expect(isUpcoming(BASE_EVENT)).toBe(true));
  it("past event is not upcoming",              () => expect(isUpcoming({ ...BASE_EVENT, event_date: PAST })).toBe(false));
  it("cancelled future event is not upcoming", () => expect(isUpcoming({ ...BASE_EVENT, cancelled: 1 })).toBe(false));
});

// ── deadlinePassed ────────────────────────────────────────────────────────────

describe("deadlinePassed", () => {
  it("no deadline => false",     () => expect(deadlinePassed({ rsvp_deadline: null })).toBe(false));
  it("past deadline => true",    () => expect(deadlinePassed({ rsvp_deadline: PAST })).toBe(true));
  it("future deadline => false", () => expect(deadlinePassed({ rsvp_deadline: FUTURE })).toBe(false));
});

// ── myRsvp ────────────────────────────────────────────────────────────────────

describe("myRsvp", () => {
  const rsvps = [
    { event_id: "e1", member_id: "a1", status: "yes",   guest_count: 1, note: "" },
    { event_id: "e1", member_id: "c1", status: "maybe", guest_count: 0, note: "" },
    { event_id: "e2", member_id: "a1", status: "no",    guest_count: 0, note: "" },
  ];

  it("returns the matching rsvp",       () => expect(myRsvp("e1", rsvps, "a1")?.status).toBe("yes"));
  it("returns null for wrong event",    () => expect(myRsvp("e3", rsvps, "a1")).toBeNull());
  it("returns null for no rsvp",        () => expect(myRsvp("e1", rsvps, "m3")).toBeNull());
});

// ── rsvpCounts ────────────────────────────────────────────────────────────────

describe("rsvpCounts", () => {
  const members = [ADULT, CHILD, OTHER];
  const rsvps = [
    { event_id: "e1", member_id: "a1", status: "yes",   guest_count: 2, note: "" },
    { event_id: "e1", member_id: "c1", status: "maybe", guest_count: 0, note: "" },
  ];

  it("counts yes, maybe, no", () => {
    const c = rsvpCounts("e1", rsvps, members);
    expect(c.yes.length).toBe(1);
    expect(c.maybe.length).toBe(1);
    expect(c.no.length).toBe(0);
  });

  it("identifies non-responders", () => {
    const c = rsvpCounts("e1", rsvps, members);
    expect(c.noResponse.length).toBe(1);
    expect(c.noResponse[0].id).toBe("m3");
  });

  it("returns empty noResponse when everyone responded", () => {
    const allRsvps = [
      ...rsvps,
      { event_id: "e1", member_id: "m3", status: "no", guest_count: 0, note: "" },
    ];
    const c = rsvpCounts("e1", allRsvps, members);
    expect(c.noResponse.length).toBe(0);
  });

  it("ignores rsvps for other events", () => {
    const c = rsvpCounts("e2", rsvps, members);
    expect(c.yes.length).toBe(0);
    expect(c.noResponse.length).toBe(3);
  });
});

// ── totalAttendees ────────────────────────────────────────────────────────────

describe("totalAttendees", () => {
  const rsvps = [
    { event_id: "e1", member_id: "a1", status: "yes",   guest_count: 2 },
    { event_id: "e1", member_id: "c1", status: "maybe", guest_count: 1 },
    { event_id: "e1", member_id: "m3", status: "no",    guest_count: 0 },
  ];

  it("counts only yes members + their guests", () => {
    expect(totalAttendees("e1", rsvps)).toBe(3); // 1 member + 2 guests
  });

  it("returns 0 when no yes rsvps", () => {
    expect(totalAttendees("e2", rsvps)).toBe(0);
  });

  it("handles zero guests", () => {
    const r = [{ event_id: "e1", member_id: "a1", status: "yes", guest_count: 0 }];
    expect(totalAttendees("e1", r)).toBe(1);
  });
});
