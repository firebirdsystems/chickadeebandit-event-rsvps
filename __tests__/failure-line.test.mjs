import { describe, it, expect } from "vitest";
import { failureLine } from "../src/logic.js";

const err = (props, message = "hub text") => Object.assign(new Error(message), props);
const words = { action: "save the event", thing: "event" };

describe("failureLine", () => {
  it("names a duplicate by code, or by the hub's text while production lags", () => {
    expect(failureLine(err({ status: 400, code: "UNIQUE_CONSTRAINT" }), words)).toBe("That event already exists.");
    expect(failureLine(err({ status: 400 }, "UNIQUE constraint failed: x.id"), words)).toBe("That event already exists.");
  });
  it("names a refusal without asking for a retry", () => {
    expect(failureLine(err({ status: 403 }), words)).toBe("You don’t have permission to save the event.");
    expect(failureLine(err({ status: 507 }), words)).toBe("The household’s storage is full — free up space first.");
  });
  it("asks for a wait on a rate limit", () => {
    expect(failureLine(err({ status: 429 }), words)).toBe("Too many tries — wait a minute and try again.");
  });
  it("splits a write that changed nothing by the caller's re-read", () => {
    expect(failureLine(null, { ...words, found: false })).toBe("This event has been removed.");
    // Still there after a plain WHERE id = ? write: the row policy refused it.
    expect(failureLine(null, { ...words, found: true })).toBe("You don’t have permission to save the event.");
    expect(failureLine(null, { ...words, found: null })).toBe("Couldn’t save the event — try again.");
  });
  it("reads a 404 as removed and a 409 as changed by someone else", () => {
    expect(failureLine(err({ status: 404 }), words)).toBe("This event has been removed.");
    expect(failureLine(err({ status: 409 }), words)).toBe("This event was changed by someone else — check it first.");
  });
  it("asks for a retry only when retrying can work", () => {
    for (const e of [err({}), err({ status: 500 }), err({ status: 503 }), err({ status: 400 }), new TypeError("Failed to fetch"), undefined]) {
      expect(failureLine(e, words)).toBe("Couldn’t save the event — try again.");
    }
  });
  it("keeps a line the app wrote for the user, and never shows hub text", () => {
    expect(failureLine(err({ forUser: true }, "Title is required."), words)).toBe("Title is required.");
    expect(failureLine(err({ status: 500 }, "D1_ERROR: boom"), words)).not.toMatch(/D1_ERROR/);
    expect(failureLine(new TypeError("Failed to fetch"), words)).not.toMatch(/Failed to fetch/);
  });
});
