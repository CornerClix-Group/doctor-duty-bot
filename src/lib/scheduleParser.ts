// ============================================================================
// scheduleParser.ts — COMPLETE REWRITE
// Final Version with Preassignments, Off Blocks, Constraint Overrides (Option A),
// OFF always allowed by default (Option 2), and zero formatting dependency.
// ============================================================================

import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// SHIFT DEFINITIONS
// ---------------------------------------------------------------------------
export const SHIFT_CODES = new Set([
  "D1", "D2",
  "MIDA", "MIDB",
  "E", "N",
  "FT AM", "FT PM", "FT W",
  "C", "A10"
]);

export const OFF_CODES = new Set(["X", "L", "LH"]);

// ---------------------------------------------------------------------------
// PARSE CONSTRAINT CODES  (Option A + Option 2 behavior)
// ---------------------------------------------------------------------------

/**
 * Converts a constraint cell like:
 *   1/2/x
 *   1/2
 *   5/10/x
 *   am
 *   pmx
 *
 * Into normalized shift code list. OFF is always allowed (Option 2).
 */
function parseConstraintCode(value: string): string[] | null {
  if (!value) return null;

  const lower = value.toLowerCase().trim();

  if (!lower.includes("/") && !["1","2","5","10","10p","am","pm","w","wk","ftw"].includes(lower)) {
    // not a constraint code
    return null;
  }

  const parts = lower.split("/");

  const out: string[] = [];

  for (let part of parts) {
    part = part.replace(/x$/i, "").trim(); // remove trailing x

    if (part === "1") out.push("D1");
    else if (part === "2") out.push("D2");
    else if (part === "5") out.push("E");
    else if (part === "10" || part === "10p") out.push("N");
    else if (part === "am") out.push("FT AM");
    else if (part === "pm") out.push("FT PM");
    else if (["w","wk","ftw"].includes(part)) out.push("FT W");
  }

  // Option 2: OFF is ALWAYS allowed, even without "/x"
  out.push("OFF");

  return out.length > 0 ? out : null;
}

// ---------------------------------------------------------------------------
// SAFE CELL VALUE EXTRACTOR
// ---------------------------------------------------------------------------

/**
 * Handles empty cells, styled cells with no value, etc.
 */
function safeCellValue(cell: any): string {
  if (!cell) return "";
  if (cell.v === undefined || cell.v === null) return "";
  return String(cell.v).trim();
}

// ---------------------------------------------------------------------------
// MAIN PARSER FUNCTION
// ---------------------------------------------------------------------------

export function parseSchedule(workbook: XLSX.WorkBook) {
  // Try "Schedule" sheet first, then fall back to first sheet
  let sheet = workbook.Sheets["Schedule"];
  if (!sheet) {
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) throw new Error("Workbook has no sheets.");
    sheet = workbook.Sheets[firstSheetName];
    console.log(`Using sheet: ${firstSheetName}`);
  }
  
  if (!sheet["!ref"]) throw new Error("Sheet is empty.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // --------------------------------------
  // ROW DEFINITIONS
  // Row 0: Month/PP
  // Row 1: Coverage # (7/8)
  // Row 2: Day
  // Row 3: Date
  // Row 4+: Providers
  // --------------------------------------

  // --------------------------------------
  // Extract Month + Year
  // --------------------------------------
  const monthCell = safeCellValue(sheet["A1"]);
  const match = monthCell.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) {
    throw new Error("Invalid Month/Year format in A1.");
  }

  const monthName = match[1];
  const year = Number(match[2]);

  // Determine month index
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // --------------------------------------
  // Build date strings + coverage pattern
  // --------------------------------------
  const coverage_pattern: Record<string, number> = {};
  const days: Array<{ date: string, pattern: number }> = [];

  for (let col = 2; col < 2 + daysInMonth; col++) {
    const dateCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: 3, c: col })]);
    if (!dateCell) continue;

    const dayNumber = Number(dateCell);
    const fullDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;

    const patternCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: 1, c: col })]);
    const pattern = Number(patternCell) || 7;

    coverage_pattern[fullDate] = pattern;

    days.push({
      date: fullDate,
      pattern
    });
  }

  // --------------------------------------
  // Parse Provider Rows
  // --------------------------------------
  const providers: any[] = [];

  for (let row = 4; row <= range.e.r; row++) {
    const nameCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]);
    if (!nameCell) continue;

    const weekendQuotaCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: row, c: 1 })]);
    const weekend_quota = Number(weekendQuotaCell) || 0;

    const targetShiftsCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: row, c: range.e.c })]);
    const target_shifts = Number(targetShiftsCell) || 0;

    const providerDays: any[] = [];

    // --------------------------------------
    // Parse daily cells
    // --------------------------------------
    for (let i = 0; i < days.length; i++) {
      const col = 2 + i;
      const date = days[i].date;

      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const raw = safeCellValue(sheet[cellRef]);

      let locked = false;
      let assigned: string | null = null;
      let constraint: string[] | null = null;

      // OFF block?
      if (OFF_CODES.has(raw)) {
        locked = true;
        assigned = "OFF";
      }
      // Preassigned shift?
      else if (SHIFT_CODES.has(raw)) {
        locked = true;
        assigned = raw;
      }
      // Constraint code?
      else {
        const parsed = parseConstraintCode(raw);
        if (parsed) {
          locked = false;
          constraint = parsed;   // overrides rules
        }
      }

      providerDays.push({
        date,
        locked,
        assigned,
        constraint,
        value: raw
      });
    }

    providers.push({
      name: nameCell,
      weekend_quota,
      target_shifts,
      days: providerDays
    });
  }

  return {
    month: monthName,
    year,
    coverage_pattern,
    providers
  };
}
