import { describe, it, expect } from "vitest";
import {
  canCreateEvent, canManageEvent,
  isUpcoming, deadlinePassed,
  myRsvp, rsvpCounts, totalAttendees,
  guestRsvpsFor, guestTotals, duplicateGuestNames, csvCell, normalizeTimestamp,
  buildReminderNotification, summarizeReminderDelivery, searchableFields,
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

// ── reminders ────────────────────────────────────────────────────────────────

describe("buildReminderNotification", () => {
  it("targets only non-responders", () => {
    const event = { id: "event 1", title: "Chapter Dinner" };
    const nonResponders = [
      { id: "c1", name: "Charlie" },
      { id: "m3", name: "Morgan" },
    ];

    const reminder = buildReminderNotification(event, nonResponders, "Fri, Jul 3, 2026");

    expect(reminder.audience).toEqual(["c1", "m3"]);
    expect(reminder.title).toBe("RSVP needed: Chapter Dinner");
    expect(reminder.url).toBe("/open/event-rsvps?eventId=event%201");
    expect(reminder.body).toContain("Charlie, Morgan");
    expect(reminder.body).toContain("Chapter Dinner");
    expect(reminder.body).toContain("Fri, Jul 3, 2026");
  });
});

describe("summarizeReminderDelivery", () => {
  it("explains when recipients have no registered devices", () => {
    expect(summarizeReminderDelivery({ web: { total: 0 }, expo: { total: 0 } }, 2))
      .toContain("No notification subscriptions found");
  });

  it("explains when subscriptions exist but no sends succeeded", () => {
    const message = summarizeReminderDelivery(
      { web: { total: 1, sent: 0 }, expo: { total: 0, sent: 0 } },
      1,
    );
    expect(message).toContain("no notifications were delivered");
  });

  it("summarizes successful delivery counts", () => {
    const message = summarizeReminderDelivery(
      { web: { total: 2, sent: 1 }, expo: { total: 1, sent: 1 } },
      2,
    );
    expect(message).toBe("Reminder sent to 2 devices for 2 non-responders.");
  });
});

describe("searchableFields", () => {
  it("matches on the location and description, not just the title", () => {
    const fields = searchableFields({ title: "AGM", description: "budget vote", location: "Clubhouse" });
    expect(fields).toContain("Clubhouse");
    expect(fields).toContain("budget vote");
  });
});

// ── RSVPs from a share link ───────────────────────────────────────────────────
// A link submission is anonymous and insert-only: there is no identity to
// dedupe on and no update lane, so a visitor correcting their own answer
// arrives as a SECOND row. These helpers exist so the organiser can see that
// and fix the headcount by hand, which is the only fix available.
const GUESTS = [
  { id: "g1", event_id: "e1", guest_name: "Sam Chen",   guest_count: 4, status: "going", created_at: "2026-08-01T10:00:00Z" },
  { id: "g2", event_id: "e1", guest_name: "sam chen",   guest_count: 2, status: "going", created_at: "2026-08-03T10:00:00Z" },
  { id: "g3", event_id: "e1", guest_name: "Priya Nair", guest_count: 1, status: "maybe", created_at: "2026-08-02T10:00:00Z" },
  { id: "g4", event_id: "e2", guest_name: "Dana Lee",   guest_count: 3, status: "going", created_at: "2026-08-02T10:00:00Z" },
];

describe("guestRsvpsFor", () => {
  it("keeps one event's rows, newest first", () => {
    expect(guestRsvpsFor("e1", GUESTS).map(g => g.id)).toEqual(["g2", "g3", "g1"]);
  });

  it("does not mutate the array it was given", () => {
    const order = GUESTS.map(g => g.id);
    guestRsvpsFor("e1", GUESTS);
    expect(GUESTS.map(g => g.id)).toEqual(order);
  });

  it("is empty for an event nobody responded to", () => {
    expect(guestRsvpsFor("e9", GUESTS)).toEqual([]);
  });
});

describe("guestTotals", () => {
  it("counts heads from 'going' rows only, matching the public aggregate", () => {
    // 4 + 2 — the duplicate is counted, because nothing can tell it apart from
    // two real households replying. That inflation is the thing the organiser
    // is being shown so they can correct it.
    expect(guestTotals("e1", GUESTS)).toEqual({ submissions: 3, going: 2, maybe: 1, heads: 6 });
  });

  it("treats a missing or unparseable count as nobody", () => {
    const rows = [{ event_id: "e1", status: "going" }, { event_id: "e1", status: "going", guest_count: "x" }];
    expect(guestTotals("e1", rows).heads).toBe(0);
  });

  it("is all zeroes when no one used the link", () => {
    expect(guestTotals("e9", GUESTS)).toEqual({ submissions: 0, going: 0, maybe: 0, heads: 0 });
  });
});

describe("duplicateGuestNames", () => {
  it("flags a name that responded twice, ignoring case and padding", () => {
    expect([...duplicateGuestNames("e1", GUESTS)]).toEqual(["sam chen"]);
  });

  it("does not flag a name that responded once", () => {
    expect(duplicateGuestNames("e1", GUESTS).has("priya nair")).toBe(false);
  });

  it("never flags unnamed submissions as each other's duplicates", () => {
    // Two people who left the name blank are not evidence of one person
    // answering twice, and pairing them would send the organiser deleting a
    // real RSVP.
    const rows = [
      { event_id: "e1", guest_name: "",   guest_count: 1, status: "going" },
      { event_id: "e1", guest_name: "  ", guest_count: 1, status: "going" },
    ];
    expect(duplicateGuestNames("e1", rows).size).toBe(0);
  });

  it("scopes duplicates to one event", () => {
    const rows = [
      { event_id: "e1", guest_name: "Dana Lee", guest_count: 1, status: "going" },
      { event_id: "e2", guest_name: "Dana Lee", guest_count: 1, status: "going" },
    ];
    expect(duplicateGuestNames("e1", rows).size).toBe(0);
  });
});

// ── CSV export safety ─────────────────────────────────────────────────────────
// `guest_name` arrives from an unauthenticated share form and lands in a file
// the organiser opens in Excel/Sheets. Quoting is NOT a defence: a quoted
// field starting with a formula lead-in is still handed to the formula parser.
// Mirrors the hub's own export guard (cloudflare/reports.ts) character for
// character — one product must not neutralise the same attack two ways.
describe("normalizeTimestamp", () => {
  it("rewrites SQLite's datetime('now') shape into the ISO UTC instant it is", () => {
    // guest_rsvps.created_at defaults to datetime('now') → space-separated,
    // zone-less. Parsed raw, JS treats it as LOCAL time (off by the viewer's
    // UTC offset — a different calendar day for evening submissions).
    expect(normalizeTimestamp("2026-08-22 01:30:00")).toBe("2026-08-22T01:30:00Z");
    expect(new Date(normalizeTimestamp("2026-08-22 01:30:00")).getTime())
      .toBe(Date.UTC(2026, 7, 22, 1, 30, 0));
  });

  it("passes app-written ISO timestamps and non-strings through untouched", () => {
    expect(normalizeTimestamp("2026-08-22T01:30:00Z")).toBe("2026-08-22T01:30:00Z");
    expect(normalizeTimestamp("2026-08-22")).toBe("2026-08-22");
    expect(normalizeTimestamp(null)).toBe(null);
    expect(normalizeTimestamp(undefined)).toBe(undefined);
  });
});

describe("csvCell", () => {
  it("neutralises every formula lead-in a spreadsheet acts on", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    // Excel strips a leading tab/CR before parsing, so they smuggle a formula
    // past a naive "starts with =" check.
    expect(csvCell("\t=cmd")).toBe("'\t=cmd");   // tab needs no CSV quoting
    expect(csvCell("\r=cmd")).toBe('"\'\r=cmd"');
  });

  it("defuses the canonical command-execution payload", () => {
    // The classic DDE payload. Quoting alone would have shipped it live.
    const payload = `=cmd|' /C calc'!A0`;
    const cell = csvCell(payload);
    expect(cell.startsWith("'") || cell.startsWith(`"'`)).toBe(true);
    expect(cell).not.toMatch(/^"?=/);
  });

  it("still quotes and escapes what CSV itself requires", () => {
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell("Smith, Dana")).toBe('"Smith, Dana"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    // A dangerous cell needs BOTH: the apostrophe and the comma quoting.
    expect(csvCell("=A1,B2")).toBe(`"'=A1,B2"`);
  });

  it("leaves ordinary values untouched", () => {
    expect(csvCell("Priya Nair")).toBe("Priya Nair");
    expect(csvCell("going")).toBe("going");
    expect(csvCell("4")).toBe("4");
  });

  it("renders absent values as an empty cell, never 'null'", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(0)).toBe("0");
  });

  it("guards a hyphen-leading name, accepting the cost to negative numbers", () => {
    // "-Anne" is a plausible name and "-5" a plausible note; both come back as
    // text. That is the deliberate trade the hub's rule already makes — a
    // divergent numeric exemption here would be a second rule to keep in sync.
    expect(csvCell("-Anne")).toBe("'-Anne");
    expect(csvCell("-5")).toBe("'-5");
  });
});
