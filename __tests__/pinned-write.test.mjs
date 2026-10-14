import { describe, it, expect } from "vitest";
import { outcomeUnknown, storedDiffers } from "../src/logic.js";

const err = (props, message = "hub text") => Object.assign(new Error(message), props);

describe("outcomeUnknown", () => {
  it("is unknown with no status, a 400, or a 5xx other than 507", () => {
    for (const e of [new TypeError("Failed to fetch"), err({ status: 0 }), err({ status: 400 }), err({ status: 500 }), err({ status: 503 })]) {
      expect(outcomeUnknown(e)).toBe(true);
    }
  });
  it("is known for a refusal", () => {
    for (const e of [err({ status: 403 }), err({ status: 404 }), err({ status: 409 }), err({ status: 507 })]) {
      expect(outcomeUnknown(e)).toBe(false);
    }
  });
  it("reads back on a duplicate: a retry that landed collides on its own pinned id", () => {
    for (const e of [err({ status: 400, code: "UNIQUE_CONSTRAINT" }), err({ status: 400 }, "UNIQUE constraint failed: x.id")]) {
      expect(outcomeUnknown(e)).toBe(true);
    }
  });
});

describe("storedDiffers", () => {
  const fields = { name: "Milk", quantity: 2, expiry_date: "", note: "" };
  it("treats a stored row matching the form as the same, as text", () => {
    expect(storedDiffers({ id: "x", name: "Milk", quantity: "2", expiry_date: null, note: "" }, fields)).toBe(false);
  });
  it("sees an edit made since the first try", () => {
    expect(storedDiffers({ name: "Milk", quantity: 1, expiry_date: "", note: "" }, fields)).toBe(true);
  });
});
