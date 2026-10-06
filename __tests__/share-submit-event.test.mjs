import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

/**
 * The share link's guest form, and the hub event each guest submission fires.
 * The hub publishes the event (an app can never POST it) and decides its
 * payload from the event catalog; what this app owns is which table the form
 * writes, whether members are alerted, and the row policy that bounds what the
 * event may say.
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

const migrationsDir = join(__dirname, "../migrations");
const schema = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf-8"))
  .join("\n");

function columnsOf(table) {
  const body = schema.match(
    new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?app_[a-z0-9_]+__${table}\\s*\\(([\\s\\S]*?)\\n\\);`),
  );
  expect(body, `no CREATE TABLE for ${table}`).toBeTruthy();
  const created = body[1]
    .split("\n")
    .map((line) => line.trim().match(/^([a-z_]+)\s+(TEXT|INTEGER|REAL|BLOB)\b/i))
    .filter(Boolean)
    .map((m) => m[1]);
  const altered = [...schema.matchAll(
    new RegExp(`ALTER TABLE app_[a-z0-9_]+__${table} ADD COLUMN ([a-z_]+)\\b`, "g"),
  )].map((m) => m[1]);
  return [...created, ...altered];
}

const items = Object.entries(manifest.shareable ?? {}).filter(([, item]) => item.submit);
const [itemType, item] = items[0] ?? [];
const submit = item?.submit;

// A guest RSVP changes the head count the organiser plans around.
const ALERTS_MEMBERS = true;

describe("share-link guest submissions", () => {
  it("has exactly one writable share item", () => {
    expect(items.map(([t]) => t)).toEqual([itemType]);
  });

  it("fires a namespaced hub event", () => {
    expect(submit.event).toMatch(/^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_]*$/);
  });

  it(ALERTS_MEMBERS ? "alerts members on every guest submission" : "does not alert members per guest submission", () => {
    expect((manifest.alert_on ?? []).includes(submit.event)).toBe(ALERTS_MEMBERS);
  });

  it("never lists the event in publishes, which would let a member forge one", () => {
    expect(manifest.publishes ?? []).not.toContain(submit.event);
  });

  it("writes only columns the target table has", () => {
    const columns = columnsOf(submit.table);
    for (const column of [submit.fk_column, ...submit.fields.map((f) => f.column), ...Object.keys(submit.fixed_values ?? {})]) {
      expect(columns, `${submit.table}.${column}`).toContain(column);
    }
  });

  // guest_rsvps is steward-read-only, so the hub publishes the event with the
  // event id ALONE — never the guest's name, count or answer (hub:
  // share-submit-event.ts). The bell tells stewards to look; the row says who.
  it("keeps guest answers steward-only", () => {
    expect(manifest.row_policies[submit.table].steward_reads_only).toBe(true);
  });

  it("marks guest rows as external", () => {
    expect(submit.fixed_values).toMatchObject({ source: "external" });
  });
  // The link stops taking guest RSVPs at the event's RSVP deadline (else its
  // start) while the page stays readable. Without this a guest could RSVP to an
  // event days after it happened. `rsvp_deadline` itself is encrypted, and the
  // hub compares the cutoff in the clear — hence a plaintext `_at` column.
  it("closes guest RSVPs at the event's own cutoff column", () => {
    expect(submit.until_column).toBe("guest_rsvps_close_at");
    expect(columnsOf(manifest.shareable[itemType].table)).toContain(submit.until_column);
    expect(submit.until_column.endsWith("_at")).toBe(true);
    expect(submit.until_grace_minutes).toBeUndefined();
  });

  it("gives automation-created events a cutoff too", () => {
    // The create_event action writes its date-only event_date, which the hub
    // reads as the end of that household day.
    const insert = manifest.automation_actions.create_event.steps.find((s) => s.op === "insert" && s.table === "events");
    expect(insert.values.guest_rsvps_close_at).toBe(":event_date");
  });

  it("backfills existing events from their start, the only plaintext date a migration can read", () => {
    expect(schema).toMatch(/UPDATE app_event_rsvps__events SET guest_rsvps_close_at = event_date WHERE guest_rsvps_close_at IS NULL/);
  });
});
