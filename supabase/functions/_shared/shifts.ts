// Canonical shift catalog & helpers — EMSchedule / EDAMC ED operational alignment

export type ShiftCode =
  | "D1" | "D2" | "MIDA" | "MIDB" | "E" | "N"
  | "6" | "8" | "11" | "14" | "16" | "21"
  | "6a" | "8a" | "11a" | "1p" | "3p" | "5p" | "10p"
  | "FT" | "FT W" | "FT W12" | "FT AM" | "FT PM"
  | "FT 7a" | "FT 2p" | "FT 9" | "FT W9"
  | "C" | "A10";

export interface ShiftDef {
  code: ShiftCode;
  startHour: number;
  endHour: number;
  hours: number;
}

export const SHIFT_DEFS: Record<ShiftCode, ShiftDef> = {
  D1: { code: "D1", startHour: 6, endHour: 16, hours: 10 },
  D2: { code: "D2", startHour: 8, endHour: 18, hours: 10 },
  MIDA: { code: "MIDA", startHour: 11, endHour: 21, hours: 10 },
  MIDB: { code: "MIDB", startHour: 14, endHour: 24, hours: 10 },
  E: { code: "E", startHour: 16, endHour: 26, hours: 10 },
  N: { code: "N", startHour: 21, endHour: 31, hours: 10 },
  "6": { code: "6", startHour: 6, endHour: 16, hours: 10 },
  "8": { code: "8", startHour: 8, endHour: 18, hours: 10 },
  "11": { code: "11", startHour: 11, endHour: 21, hours: 10 },
  "14": { code: "14", startHour: 14, endHour: 24, hours: 10 },
  "16": { code: "16", startHour: 16, endHour: 26, hours: 10 },
  "21": { code: "21", startHour: 21, endHour: 31, hours: 10 },
  "6a": { code: "6a", startHour: 6, endHour: 15, hours: 9 },
  "8a": { code: "8a", startHour: 8, endHour: 17, hours: 9 },
  "11a": { code: "11a", startHour: 11, endHour: 20, hours: 9 },
  "1p": { code: "1p", startHour: 13, endHour: 22, hours: 9 },
  "3p": { code: "3p", startHour: 15, endHour: 24, hours: 9 },
  "5p": { code: "5p", startHour: 17, endHour: 26, hours: 9 },
  "10p": { code: "10p", startHour: 22, endHour: 31, hours: 9 },
  FT: { code: "FT", startHour: 10, endHour: 20, hours: 10 },
  "FT W": { code: "FT W", startHour: 10, endHour: 20, hours: 10 },
  "FT W12": { code: "FT W12", startHour: 12, endHour: 22, hours: 10 },
  "FT AM": { code: "FT AM", startHour: 7, endHour: 16, hours: 9 },
  "FT PM": { code: "FT PM", startHour: 14, endHour: 23, hours: 9 },
  "FT 7a": { code: "FT 7a", startHour: 7, endHour: 16, hours: 9 },
  "FT 2p": { code: "FT 2p", startHour: 14, endHour: 23, hours: 9 },
  "FT 9": { code: "FT 9", startHour: 9, endHour: 19, hours: 10 },
  "FT W9": { code: "FT W9", startHour: 9, endHour: 19, hours: 10 },
  C: { code: "C", startHour: 0, endHour: 24, hours: 24 },
  A10: { code: "A10", startHour: 9, endHour: 19, hours: 10 },
};

/** Synonyms → canonical slot codes used by the scheduler */
export const SHIFT_ALIASES: Record<string, ShiftCode> = {
  "6": "D1",
  "8": "D2",
  "11": "MIDA",
  "14": "MIDB",
  "16": "E",
  "21": "N",
  "FT 7a": "FT AM",
  "FT 2p": "FT PM",
  "FT W9": "FT 9",
};

export function canonicalShift(code: string): ShiftCode | null {
  if (code === undefined || code === null) return null;
  const t = String(code).trim().replace(/\s+/g, " ");
  if (!t) return null;
  const u = t.toUpperCase().replace(/\s+/g, " ");
  const lower = t.toLowerCase();
  if (SHIFT_ALIASES[t]) return SHIFT_ALIASES[t];
  if (SHIFT_ALIASES[u]) return SHIFT_ALIASES[u];
  if (SHIFT_ALIASES[lower]) return SHIFT_ALIASES[lower];
  if ((SHIFT_DEFS as Record<string, ShiftDef>)[t]) return canonicalizeDefCode(t as ShiftCode);
  if ((SHIFT_DEFS as Record<string, ShiftDef>)[u]) return canonicalizeDefCode(u as ShiftCode);
  if ((SHIFT_DEFS as Record<string, ShiftDef>)[lower]) return canonicalizeDefCode(lower as ShiftCode);
  return null;
}

function canonicalizeDefCode(c: ShiftCode): ShiftCode {
  return SHIFT_ALIASES[c] ?? SHIFT_ALIASES[c.toUpperCase()] ?? c;
}

/** Resolves any code to canonical ShiftCode; applies alias chain once */
export function toCanonicalShift(code: ShiftCode | string): ShiftCode | null {
  const once = canonicalShift(String(code));
  if (!once) return null;
  return SHIFT_ALIASES[once] ?? once;
}

export function creditHours(code: ShiftCode | string): number {
  const canon = toCanonicalShift(code);
  if (canon === null) return 0;
  if (canon === "C" || canon === "A10") return 10;
  return SHIFT_DEFS[canon].hours;
}

export const ALL_SHIFTS = Object.keys(SHIFT_DEFS) as ShiftCode[];

export const REGULAR_SHIFTS: ShiftCode[] = [
  "D1", "D2", "MIDA", "MIDB", "E", "N",
  "6", "8", "11", "14", "16", "21",
  "6a", "8a", "11a", "1p", "3p", "5p", "10p",
  "FT", "FT W", "FT W12", "FT AM", "FT PM",
  "FT 7a", "FT 2p", "FT 9", "FT W9",
];

export const NON_REGULAR_SHIFTS: ShiftCode[] = ["C", "A10"];

export const OFF_CODES = new Set(["L", "HL", "X", "SL", "TL", "DP", "TDY"]);
export const WHOLE_MONTH_OFF = new Set(["TL", "DP"]);

export const SUMMARY_ROW_MARKERS = new Set([
  "D1", "D2", "MIDA", "MIDB", "E", "N", "FT", "FT W", "FT W12", "FT AM", "FT PM",
  "C", "A10", "TOTAL", "TOTALS",
]);

export function normalizeShiftToken(raw: string): ShiftCode | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  let t = trimmed.replace(/\s+/g, " ");
  if (t === "A") return "A10";
  const compact = t.replace(/\s+/g, "");
  if (compact.toUpperCase() === "FTW") return "FT W";
  if (compact.toUpperCase() === "FTAM") return "FT AM";
  if (compact.toUpperCase() === "FTPM") return "FT PM";
  if (compact.toUpperCase() === "FTW12") return "FT W12";
  const u = t.toUpperCase().replace(/\s+/g, " ");
  if (u === "MID" || u === "MID1") return "MIDA";
  if (u === "MID2") return "MIDB";
  const direct = canonicalShift(t);
  if (!direct) return null;
  return toCanonicalShift(direct) ?? direct;
}

export function requiredShifts(
  coverage: number,
  dayOfWeek: number,
  mondayFtRuleActive: boolean,
): ShiftCode[] {
  const base: ShiftCode[] = ["D1", "D2", "MIDA", "MIDB", "E", "N"];
  if (coverage === 6) {
    if (dayOfWeek === 1 && mondayFtRuleActive) return [...base, "FT"];
    return base;
  }
  if (coverage === 7) return [...base, "FT W"];
  if (coverage === 8) return [...base, "FT AM", "FT PM"];
  return base;
}

export const TIGHTNESS_ORDER: ShiftCode[] = [
  "N", "21", "10p", "E", "16", "5p", "MIDB", "14", "MIDA", "11", "11a",
  "D1", "6", "D2", "8", "FT", "FT W", "FT W12", "FT 9", "FT W9", "FT AM", "FT 7a", "FT PM", "FT 2p",
  "6a", "8a", "1p", "3p",
];

export function hoursBetween(
  dA: Date, shiftA: ShiftCode | string,
  dB: Date, shiftB: ShiftCode | string,
): number {
  const ca = toCanonicalShift(shiftA);
  const cb = toCanonicalShift(shiftB);
  if (!ca || !cb) return 0;
  const a = SHIFT_DEFS[ca];
  const b = SHIFT_DEFS[cb];
  const aEnd = new Date(dA);
  aEnd.setHours(0, 0, 0, 0);
  aEnd.setTime(aEnd.getTime() + a.endHour * 3600 * 1000);
  const bStart = new Date(dB);
  bStart.setHours(0, 0, 0, 0);
  bStart.setTime(bStart.getTime() + b.startHour * 3600 * 1000);
  return (bStart.getTime() - aEnd.getTime()) / 3600000;
}

export const NINE_HOUR_SHIFT_CODES = new Set<ShiftCode>(["6a", "8a", "11a", "1p", "3p", "5p", "10p"]);

export const BASE_TEN_HOUR_SLOT_CODES = new Set<ShiftCode>(["D1", "D2", "MIDA", "MIDB", "E", "N"]);

export function isNightCanonical(code: ShiftCode | null): boolean {
  if (!code) return false;
  const c = toCanonicalShift(code) ?? code;
  return c === "N" || c === "10p";
}
