import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { describe, it, expect } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, "../manifest.json"), "utf-8"));

const VALID_STORAGE   = ["kv", "db", "none"];
const VALID_AUDIENCES = ["everyone", "adults", "children"];

describe("manifest.json", () => {
  it("has required string fields", () => {
    for (const field of ["id", "name", "version", "description", "entrypoint", "runtime", "icon"]) {
      expect(manifest[field], `missing field: ${field}`).toBeTruthy();
    }
  });

  it("entrypoint is index.html", () => expect(manifest.entrypoint).toBe("index.html"));
  it("runtime is static",        () => expect(manifest.runtime).toBe("static"));

  it("storage is declared and valid", () => {
    expect(manifest.storage, "storage field is required").toBeTruthy();
    expect(VALID_STORAGE).toContain(manifest.storage);
  });

  it("version follows semver", () => expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/));

  it("permissions.default_audience is valid", () => {
    expect(VALID_AUDIENCES).toContain(manifest.permissions.default_audience);
  });

  it("permissions.requires_approval is boolean", () => {
    expect(typeof manifest.permissions.requires_approval).toBe("boolean");
  });

  it("data_access has reads and writes arrays", () => {
    expect(Array.isArray(manifest.data_access.reads)).toBe(true);
    expect(Array.isArray(manifest.data_access.writes)).toBe(true);
  });

  // Only `activity` had retention; past events, their member RSVPs and their
  // external guest RSVPs accumulated forever, which in an events app is the
  // bulk of the data. Keyed on event_date rather than created_at so the window
  // runs from when the event happened — an event entered years ahead of time is
  // not old. The runner truncates its cutoff to a date for a `_date` column,
  // and events_date_cancelled (002) already leads on it, so no index migration
  // is needed. Both child tables hang off event_id and would otherwise be
  // orphaned by the parent prune; `activity` is not listed because its own
  // 365-day window already retires those rows first.
  it("expires events two years after they happen, with both RSVP tables", () => {
    const retain = manifest.row_policies?.events?.retain_days;
    expect(retain?.default).toBe(730);
    expect(retain?.timestamp_column).toBe("event_date");
    expect(retain?.override_key).toBe("event_history");
    expect(retain?.dependent_tables).toEqual([
      { table: "rsvps", foreign_key: "event_id" },
      { table: "guest_rsvps", foreign_key: "event_id" },
    ]);
  });

  // Link RSVPs were `endpoint_only`, which denies every app-originated write —
  // so a duplicate submission (the share-submit path only inserts, and has no
  // identity to dedupe on) was permanent, and the public headcount aggregate,
  // a SUM over guest_count, could only ever climb. `adult_writable` gives the
  // organiser a delete. It also opens INSERT and UPDATE on externally-authored
  // rows, which is acceptable here and would not be on a ballot: the same
  // adults already own the parent `events` row under an identical policy, so
  // forging or rewriting outside attendance grants no authority they lack —
  // unlike a poll, where a forged outside vote decides something. Because those
  // writes now touch rows the household did NOT author (and the CSV export
  // labels them "shared link"), `audit_writes` keeps a hub-side trail the
  // writer cannot erase — the app's own `activity` table is owner_only with
  // adults_bypass, so it is no trail at all.
  //
  // `steward_reads_only` is load-bearing, not decoration: without it,
  // `steward_writes_only` makes the hub classify this table as a steward
  // broadcast — safe for every roster participant to read — but share
  // submissions bypass the write lock, so the rows are externally authored
  // names and headcounts, not steward content.
  //
  // It must be THIS modifier and not a member_read_column over a never-filled
  // column: that collapses reads in every tenant kind, so a non-admin adult
  // organiser in a general shared space (where steward_writes_only is inert
  // and any adult may create and share an event) could not see or export
  // responses to their own link. steward_reads_only is roster-gated, so the
  // household and general-space organisers keep their data and only roster
  // peers are excluded.
  it("lets the organiser remove a link RSVP, hidden from roster peers only", () => {
    expect(manifest.row_policies.guest_rsvps).toEqual({
      kind: "adult_writable",
      steward_writes_only: true,
      steward_reads_only: true,
      audit_writes: true,
      max_rows: 200,
    });
    // No member-shaped column on this table at all, so nothing to declare —
    // and nothing for an external submission to steer a read scope with.
    expect(manifest.member_references.guest_rsvps).toBeUndefined();
  });

  it("keeps the public headcount and the in-app one on the same rule", () => {
    // The share page's aggregate sums `guest_count` over 'going' rows; the app's
    // own guestTotals() does the same. If one ever counted 'maybe' the organiser
    // and the visitors would read different numbers off the same table.
    const agg = manifest.shareable.event.aggregates.find(a => a.table === "guest_rsvps");
    expect(agg).toMatchObject({ op: "sum", value_column: "guest_count", where_values: ["going"] });
  });
});

// ── ai_access SQL file validation ─────────────────────────────────────────────

if (manifest.ai_access) {
  const ai = manifest.ai_access;

  const SQL_TYPES = [
    { field: "db_exports",   dir: "queries",   keyword: /^(SELECT|WITH)\b/i, label: "SELECT or WITH" },
    { field: "db_mutations", dir: "mutations",  keyword: /^UPDATE\b/i,        label: "UPDATE"         },
    { field: "db_inserts",   dir: "inserts",    keyword: /^INSERT\b/i,        label: "INSERT"         },
    { field: "db_deletes",   dir: "deletes",    keyword: /^DELETE\b/i,        label: "DELETE"         },
  ];

  for (const { field, dir, keyword, label } of SQL_TYPES) {
    const names = ai[field] ?? [];
    if (names.length === 0) continue;

    describe(`ai_access.${field}`, () => {
      it(`each name has a src/${dir}/{name}.sql file`, () => {
        for (const name of names) {
          const path = join(__dirname, `../src/${dir}/${name}.sql`);
          expect(existsSync(path), `missing: src/${dir}/${name}.sql`).toBe(true);
        }
      });

      it(`each SQL file starts with ${label}`, () => {
        for (const name of names) {
          const path = join(__dirname, `../src/${dir}/${name}.sql`);
          if (!existsSync(path)) continue;
          const sql = readFileSync(path, "utf-8").trim();
          expect(
            keyword.test(sql),
            `src/${dir}/${name}.sql must start with ${label}, got: ${sql.slice(0, 50)}`
          ).toBe(true);
        }
      });

      it(`each SQL file is a single statement (no semicolons)`, () => {
        for (const name of names) {
          const path = join(__dirname, `../src/${dir}/${name}.sql`);
          if (!existsSync(path)) continue;
          const sql = readFileSync(path, "utf-8");
          expect(
            sql.includes(";"),
            `src/${dir}/${name}.sql must not contain semicolons`
          ).toBe(false);
        }
      });
    });
  }
}
