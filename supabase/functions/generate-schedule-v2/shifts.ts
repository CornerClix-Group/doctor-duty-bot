// Canonical shift catalog & helpers — ED Schedule Manager spec

export type ShiftCode =
  | "D1" | "D2" | "MIDA" | "MIDB" | "E" | "N"
  | "FT" | "FT W" | "FT W12" | "FT AM" | "FT PM"
  | "C" | "A10";

export interface ShiftDef {
  code: ShiftCode;
  startHour: number; // 0-23, decimal allowed
  endHour: number;   // hour relative to start day; may exceed 24 for overnight
  hours: number;
}

export const SHIFT_DEFS: Record<ShiftCode, ShiftDef> = {
  D1:      { code: "D1",      startHour: 6,  endHour: 16, hours: 10 },
  D2:      { code: "D2",      startHour: 8,  endHour: 18, hours: 10 },
  MIDA:    { code: "MIDA",    startHour: 11, endHour: 21, hours: 10 },
  MIDB:    { code: "MIDB",    startHour: 14, endHour: 24, hours: 10 },
  E:       { code: "E",       startHour: 16, endHour: 26, hours: 10 },
  N:       { code: "N",       startHour: 21, endHour: 31, hours: 10 },
  FT:      { code: "FT",      startHour: 10, endHour: 20, hours: 10 },
  "FT W":  { code: "FT W",    startHour: 10, endHour: 20, hours: 10 },
  "FT W12":{ code: "FT W12",  startHour: 12, endHour: 22, hours: 10 },
  "FT AM": { code: "FT AM",   startHour: 7,  endHour: 16, hours: 9  },
  "FT PM": { code: "FT PM",   startHour: 14, endHour: 24, hours: 10 },
  C:       { code: "C",       startHour: 6,  endHour: 22, hours: 16 },
  A10:     { code: "A10",     startHour: 9,  endHour: 19, hours: 10 },
};

export const ALL_SHIFTS = Object.keys(SHIFT_DEFS) as ShiftCode[];
export const REGULAR_SHIFTS: ShiftCode[] = [
  "D1","D2","MIDA","MIDB","E","N","FT","FT W","FT W12","FT AM","FT PM",
];
export const NON_REGULAR_SHIFTS: ShiftCode[] = ["C","A10"];

// Codes that lock a cell off (no shift assigned, no target credit)
export const OFF_CODES = new Set(["L","HL","X","SL","TL","DP","TDY"]);
// Whole-month off codes
export const WHOLE_MONTH_OFF = new Set(["TL","DP"]);
// Summary/total row markers (not providers) found in col A bottom rows
export const SUMMARY_ROW_MARKERS = new Set([
  "D1","D2","MIDA","MIDB","E","N","FT","FT W","FT W12","FT AM","FT PM",
  "C","A10","TOTAL","TOTALS",
]);

// Coverage pattern -> required shift codes for a given day-of-week (0=Sun..6=Sat)
// Coverage 6: D1 D2 MIDA MIDB E N + FT on Mondays only (Mon FT layered rule)
// Coverage 7: D1 D2 MIDA MIDB E N FT W
// Coverage 8: D1 D2 MIDA MIDB E N FT AM FT PM
export function requiredShifts(
  coverage: number,
  dayOfWeek: number,
  mondayFtRuleActive: boolean,
): ShiftCode[] {
  const base: ShiftCode[] = ["D1","D2","MIDA","MIDB","E","N"];
  if (coverage === 6) {
    if (dayOfWeek === 1 && mondayFtRuleActive) return [...base, "FT"];
    return base;
  }
  if (coverage === 7) return [...base, "FT W"];
  if (coverage === 8) return [...base, "FT AM", "FT PM"];
  return base;
}

// Tightness order — rarest/hardest first
export const TIGHTNESS_ORDER: ShiftCode[] = [
  "N","E","MIDB","MIDA","D1","D2","FT","FT W","FT AM","FT PM","FT W12",
];

// Hours between end of shift A on date dA and start of shift B on date dB
export function hoursBetween(
  dA: Date, shiftA: ShiftCode,
  dB: Date, shiftB: ShiftCode,
): number {
  const a = SHIFT_DEFS[shiftA];
  const b = SHIFT_DEFS[shiftB];
  const aEnd = new Date(dA);
  aEnd.setHours(0, 0, 0, 0);
  aEnd.setTime(aEnd.getTime() + a.endHour * 3600 * 1000);
  const bStart = new Date(dB);
  bStart.setHours(0, 0, 0, 0);
  bStart.setTime(bStart.getTime() + b.startHour * 3600 * 1000);
  return (bStart.getTime() - aEnd.getTime()) / 3600000;
}

export function normalizeShiftToken(raw: string): ShiftCode | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (t === "A") return "A10";
  if (t === "FTW") return "FT W";
  if (t === "FTAM") return "FT AM";
  if (t === "FTPM") return "FT PM";
  if (t === "MID" || t === "MID1") return "MIDA";
  if (t === "MID2") return "MIDB";
  if (t === "FTW12") return "FT W12";
  if ((SHIFT_DEFS as any)[t]) return t as ShiftCode;
  return null;
}