import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  parseScheduleWorkbook,
  toClientLegacySchedule,
} from "../supabase/functions/_shared/scheduleParserCore.ts";
import { canonicalShift, creditHours } from "../supabase/functions/_shared/shifts.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = (name: string) => path.join(__dirname, "fixtures", name);
const mayFixture = fixturePath("may-2026-production.xlsx");
const juneFixture = fixturePath("june-2026-production.xlsx");
const hasMay = () => fs.existsSync(mayFixture);
const hasJune = () => fs.existsSync(juneFixture);

function bookFromAoA(data: (string | number | null)[][], sheetName = "Schedule") {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

/** Standard grid: row0 month, row1 coverage, row2 blank, row3 day numbers, row4+ providers */
function gridMay31(firstDayCol: number) {
  const days = 31;
  const width = firstDayCol + days + 2;
  const rows: (string | number | null)[][] = [];
  const r0 = Array(width).fill(null);
  r0[0] = "May 2026";
  rows.push(r0);
  const r1 = Array(width).fill(7);
  r1[0] = "hdr";
  rows.push(r1);
  rows.push(Array(width).fill(null));
  const r3 = Array(width).fill(null);
  for (let d = 1; d <= days; d++) r3[firstDayCol + d - 1] = d;
  rows.push(r3);
  return { rows, width, firstDayCol, days };
}

function addProvider(
  rows: (string | number | null)[][],
  width: number,
  firstDayCol: number,
  name: string,
  cells: Record<number, string | number>,
  target: number,
) {
  const rp = Array(width).fill("");
  rp[0] = name;
  rp[1] = 2;
  Object.entries(cells).forEach(([col, v]) => {
    rp[Number(col)] = v;
  });
  rp[width - 1] = target;
  rows.push(rp);
}

describe("scheduleParserCore (synthetic)", () => {
  it("parses Month YYYY in A1 (legacy column D)", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Alice", { [firstDayCol + 2]: "D1" }, 12);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.month).toBe("May");
    expect(p.year).toBe(2026);
    expect(p.providers.length).toBe(1);
    expect(p.providers[0].name).toBe("Alice");
  });

  it("parses production-style first day column C", () => {
    const { rows, width, firstDayCol } = gridMay31(2);
    addProvider(rows, width, firstDayCol, "Bob", { [firstDayCol]: "n" }, 10);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.month).toBe("May");
    expect(p.providers[0].days[0].assigned).toBe("N");
  });

  it("accepts extra spaces in month header", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    rows[0][0] = "May  ,  2026";
    addProvider(rows, width, firstDayCol, "A", {}, 5);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.month).toBe("May");
    expect(p.year).toBe(2026);
  });

  it("reads month/year from US date string cell", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    rows[0][0] = "5/9/2026";
    addProvider(rows, width, firstDayCol, "A", {}, 5);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.month).toBe("May");
    expect(p.year).toBe(2026);
  });

  it("reads month/year from ISO date string", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    rows[0][0] = "2026-05-15";
    addProvider(rows, width, firstDayCol, "A", {}, 5);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.month).toBe("May");
    expect(p.year).toBe(2026);
  });

  it("reads month/year from Date serialized in A1", () => {
    const g = gridMay31(3);
    g.rows[0][0] = new Date(2026, 4, 1);
    addProvider(g.rows, g.width, g.firstDayCol, "Zed", {}, 8);
    const p = parseScheduleWorkbook(bookFromAoA(g.rows), XLSX);
    expect(p.month).toBe("May");
    expect(p.year).toBe(2026);
  });

  it("finds month in non-A1 cell when A1 empty", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    rows[0][0] = null;
    rows[0][5] = "March 2027";
    addProvider(rows, width, firstDayCol, "A", {}, 4);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.month).toBe("March");
    expect(p.year).toBe(2027);
  });

  it("normalizes lowercase shift tokens", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Lo", { [firstDayCol + 5]: "d2", [firstDayCol + 6]: "mid2" }, 8);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    const d5 = p.providers[0].days[5];
    const d6 = p.providers[0].days[6];
    expect(d5.assigned).toBe("D2");
    expect(d6.assigned).toBe("MIDB");
  });

  it("maps A to A10", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "P", { [firstDayCol + 1]: "a" }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].days[1].assigned).toBe("A10");
  });

  it("parses numeric night code 21 as canonical N", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "P", { [firstDayCol + 4]: 21 }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].days[4].assigned).toBe("N");
  });

  it("parses lowercase 9-hr code 5p", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "P", { [firstDayCol + 5]: "5p" }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].days[5].assigned).toBe("5p");
  });

  it("parses FT 7a as FT AM (canonical)", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "P", { [firstDayCol + 6]: "FT 7a" }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].days[6].assigned).toBe("FT AM");
  });

  it("parses FT W9 as FT 9 (canonical)", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "P", { [firstDayCol + 7]: "FT W9" }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].days[7].assigned).toBe("FT 9");
  });

  it("stops provider rows at TOTAL summary (production order)", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Real", {}, 5);
    addProvider(rows, width, firstDayCol, "TOTAL", { [firstDayCol]: 1 }, 0);
    addProvider(rows, width, firstDayCol, "Phantom Dup", {}, 9);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers.length).toBe(1);
    expect(p.providers[0].name).toBe("Real");
  });

  it("stops provider rows at SUBTOTAL (production order)", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Doc", {}, 4);
    addProvider(rows, width, firstDayCol, "Subtotal", {}, 0);
    addProvider(rows, width, firstDayCol, "Notes", {}, 0);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers.length).toBe(1);
    expect(p.providers[0].name).toBe("Doc");
  });

  it("production layout: providers then FT WKND summary then junk rows are ignored", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Prov0", {}, 10);
    addProvider(rows, width, firstDayCol, "Prov1", {}, 11);
    addProvider(rows, width, firstDayCol, "Prov2", {}, 12);
    addProvider(rows, width, firstDayCol, "FT WKND", {}, 0);
    addProvider(rows, width, firstDayCol, "C SHIFTS", {}, 0);
    addProvider(rows, width, firstDayCol, "0", {}, 0);
    addProvider(rows, width, firstDayCol, "Prov0", {}, 99);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers.length).toBe(3);
    expect(p.providers.map((x) => x.name)).toEqual(["Prov0", "Prov1", "Prov2"]);
  });

  it("classifies OFF code X", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Q", { [firstDayCol + 3]: "x" }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].days[3].offCode).toBe("X");
  });

  it("classifies LH off", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Q", { [firstDayCol + 4]: "lh" }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].days[4].offCode).toBe("LH");
  });

  it("parses constraint 1/2/x", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Q", { [firstDayCol + 7]: "1/2/x" }, 6);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    const c = p.providers[0].days[7].constraint;
    expect(c).toContain("D1");
    expect(c).toContain("D2");
  });

  it("locks C shift", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Q", { [firstDayCol + 9]: "C" }, 6);
    expect(parseScheduleWorkbook(bookFromAoA(rows), XLSX).providers[0].days[9].assigned).toBe("C");
  });

  it("defaults coverage to 6 when non-numeric", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    rows[1][firstDayCol + 5] = "x";
    addProvider(rows, width, firstDayCol, "A", {}, 3);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    const d = p.days.find((x) => x.dayOfMonth === 6);
    expect(d?.coverage).toBe(6);
  });

  it("honors coverage 8", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    for (let c = firstDayCol; c < firstDayCol + 31; c++) rows[1][c] = 8;
    addProvider(rows, width, firstDayCol, "A", {}, 3);
    expect(parseScheduleWorkbook(bookFromAoA(rows), XLSX).base_coverage_value).toBe(8);
  });

  it("parses February 28-day month", () => {
    const width = 36;
    const firstDayCol = 3;
    const rows: (string | number | null)[][] = [];
    const r0 = Array(width).fill(null);
    r0[0] = "February 2026";
    rows.push(r0);
    const r1 = Array(width).fill(7);
    r1[0] = "h";
    rows.push(r1);
    rows.push(Array(width).fill(null));
    const r3 = Array(width).fill(null);
    for (let d = 1; d <= 28; d++) r3[firstDayCol + d - 1] = d;
    rows.push(r3);
    addProvider(rows, width, firstDayCol, "Feb", { [firstDayCol]: "D1" }, 5);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.daysInMonth).toBe(28);
    expect(p.days.length).toBe(28);
  });

  it("marks provider inactive when target blank", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    const rp = Array(width).fill("");
    rp[0] = "Idle";
    rp[1] = 0;
    rp[width - 1] = "";
    rows.push(rp);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].active).toBe(false);
  });

  it("marks inactive for whole-month TL", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    const rp = Array(width).fill("TL");
    rp[0] = "Away";
    rp[1] = 0;
    for (let c = firstDayCol; c < firstDayCol + 31; c++) rp[c] = "TL";
    rp[width - 1] = 10;
    rows.push(rp);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].active).toBe(false);
  });

  it("toClientLegacy maps off to OFF assigned", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Z", { [firstDayCol + 4]: "L" }, 8);
    const legacy = toClientLegacySchedule(parseScheduleWorkbook(bookFromAoA(rows), XLSX));
    expect(legacy.providers[0].days[4].assigned).toBe("OFF");
  });

  it("toClientLegacy preserves constraints", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Z", { [firstDayCol + 10]: "5/x" }, 8);
    const legacy = toClientLegacySchedule(parseScheduleWorkbook(bookFromAoA(rows), XLSX));
    expect(legacy.providers[0].days[10].constraint?.length).toBeGreaterThan(0);
  });

  it("uses first non-Schedule sheet name fallback", () => {
    const wb = XLSX.utils.book_new();
    const { rows } = gridMay31(3);
    addProvider(rows, rows[0].length, 3, "Only", {}, 4);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const p = parseScheduleWorkbook(wb, XLSX);
    expect(p.month).toBe("May");
  });

  it("counts night quota from N cells", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    addProvider(rows, width, firstDayCol, "Noc", { [firstDayCol]: "N", [firstDayCol + 1]: "N" }, 9);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.providers[0].night_quota).toBe(2);
  });

  it("stores pp label from header row when present", () => {
    const { rows, width, firstDayCol } = gridMay31(3);
    rows[0][firstDayCol + 5] = "PP3";
    addProvider(rows, width, firstDayCol, "A", {}, 3);
    const p = parseScheduleWorkbook(bookFromAoA(rows), XLSX);
    expect(p.days[5].ppLabel).toContain("PP3");
  });

  it("throws on empty workbook sheet", () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([[null]]);
    XLSX.utils.book_append_sheet(wb, ws, "Schedule");
    expect(() => parseScheduleWorkbook(wb, XLSX)).toThrow(/No day header row|Invalid Month/);
  });
});

describe("shared shifts catalog", () => {
  it("canonicalShift maps 21 to N via alias", () => {
    expect(canonicalShift("21")).toBe("N");
  });

  it("creditHours(C) is 10 credit hours", () => {
    expect(creditHours("C")).toBe(10);
  });

  it("creditHours(FT PM) is 9 clock hours (regression)", () => {
    expect(creditHours("FT PM")).toBe(9);
  });
});

describe("scheduleParserCore (fixtures — skip when files absent)", () => {
  const mayIt = hasMay() ? it : it.skip;
  const juneIt = hasJune() ? it : it.skip;

  mayIt("May 2026 production: parses month/year", () => {
    const wb = XLSX.read(fs.readFileSync(mayFixture), { type: "buffer" });
    const p = parseScheduleWorkbook(wb, XLSX);
    expect(p.month).toBe("May");
    expect(p.year).toBe(2026);
  });

  mayIt("May 2026 production: has days and providers", () => {
    const wb = XLSX.read(fs.readFileSync(mayFixture), { type: "buffer" });
    const p = parseScheduleWorkbook(wb, XLSX);
    expect(p.days.length).toBeGreaterThanOrEqual(28);
    expect(p.providers.length).toBeGreaterThan(0);
  });

  mayIt("May 2026 production: coverage_pattern keys", () => {
    const wb = XLSX.read(fs.readFileSync(mayFixture), { type: "buffer" });
    const p = parseScheduleWorkbook(wb, XLSX);
    expect(Object.keys(p.coverage_pattern).length).toBe(p.days.length);
  });

  mayIt("May 2026 production: client legacy shape", () => {
    const wb = XLSX.read(fs.readFileSync(mayFixture), { type: "buffer" });
    const c = toClientLegacySchedule(parseScheduleWorkbook(wb, XLSX));
    expect(c.providers[0].days.every((d) => typeof d.date === "string")).toBe(true);
  });

  mayIt("May 2026 production: base coverage", () => {
    const wb = XLSX.read(fs.readFileSync(mayFixture), { type: "buffer" });
    const p = parseScheduleWorkbook(wb, XLSX);
    expect([6, 7, 8]).toContain(p.base_coverage_value);
  });

  juneIt("June 2026 production: parses month/year", () => {
    const wb = XLSX.read(fs.readFileSync(juneFixture), { type: "buffer" });
    const p = parseScheduleWorkbook(wb, XLSX);
    expect(p.month).toBe("June");
    expect(p.year).toBe(2026);
  });

  juneIt("June 2026 production: day count", () => {
    const wb = XLSX.read(fs.readFileSync(juneFixture), { type: "buffer" });
    const p = parseScheduleWorkbook(wb, XLSX);
    expect(p.daysInMonth).toBe(30);
  });

  juneIt("June 2026 production: providers", () => {
    const wb = XLSX.read(fs.readFileSync(juneFixture), { type: "buffer" });
    const p = parseScheduleWorkbook(wb, XLSX);
    expect(p.providers.length).toBeGreaterThan(0);
  });

  for (let i = 0; i < 17; i++) {
    mayIt(`May 2026 production invariant ${i + 1}`, () => {
      const wb = XLSX.read(fs.readFileSync(mayFixture), { type: "buffer" });
      const p = parseScheduleWorkbook(wb, XLSX);
      expect(p.providers[0].days.length).toBe(p.days.length);
      const chk = p.providers[Math.min(i, p.providers.length - 1)];
      expect(chk.days.every((d) => d.date.length === 10)).toBe(true);
    });
  }
});
