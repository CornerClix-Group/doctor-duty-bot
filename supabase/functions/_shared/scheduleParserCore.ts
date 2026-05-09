/**
 * Canonical Excel schedule parser — shared by Vite client and Deno edge function.
 * Auto-detects production vs legacy template column/row layout and tolerates
 * datetime A1, alternate month text, lowercase shift tokens, and summary rows.
 */

// --- Types (must stay aligned with generate-schedule-v2 solver expectations) ---

export type ShiftCode =
  | "D1" | "D2" | "MIDA" | "MIDB" | "E" | "N"
  | "FT" | "FT W" | "FT W12" | "FT AM" | "FT PM"
  | "C" | "A10";

export interface ParsedDay {
  date: string;
  dayOfMonth: number;
  dayOfWeek: number;
  coverage: number;
  ppLabel?: string;
}

export interface ParsedProviderDay {
  date: string;
  rawValue: string;
  locked: boolean;
  assigned: ShiftCode | null;
  offCode: string | null;
  constraint: ShiftCode[] | null;
  offAllowedByConstraint: boolean;
}

export interface ParsedProvider {
  name: string;
  weekend_quota: number;
  night_quota: number;
  target_shifts: number;
  active: boolean;
  days: ParsedProviderDay[];
}

export interface ParsedSchedule {
  month: string;
  monthIndex: number;
  year: number;
  daysInMonth: number;
  base_coverage_value: number;
  monday_ft_rule_active: boolean;
  coverage_pattern: Record<string, number>;
  days: ParsedDay[];
  providers: ParsedProvider[];
}

// --- Catalogs (scheduler behavior preserved vs legacy SHIFT_CODES path) ---

export const OFF_CODES = new Set(["L", "HL", "LH", "X", "SL", "TL", "DP", "TDY"]);
export const WHOLE_MONTH_OFF = new Set(["TL", "DP"]);

/** Row labels in column A that are totals / shift buckets, not provider names */
export const SUMMARY_ROW_MARKERS = new Set([
  "D1", "D2", "MIDA", "MIDB", "E", "N", "FT", "FT W", "FT W12", "FT AM", "FT PM",
  "FT WKND",
  "C", "A10", "C SHIFTS",
  "TOTAL", "TOTALS", "SUBTOTAL", "SUB-TOTAL", "GRAND TOTAL", "SUM",
]);

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

type XLSXModule = {
  utils: {
    decode_range: (ref: string) => { s: { r: number; c: number }; e: { r: number; c: number } };
    encode_cell: (rc: { r: number; c: number }) => string;
  };
};

function excelSerialToDate(serial: number): Date {
  const whole = Math.floor(serial);
  const frac = serial - whole;
  const utcMs = (whole - 25569) * 86400000 + Math.round(frac * 86400000);
  return new Date(utcMs);
}

function safeCell(sheet: Record<string, any>, r: number, c: number, XLSX: XLSXModule): string {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = sheet[addr];
  if (!cell) return "";
  if (cell.v === undefined || cell.v === null) return "";
  if (cell.t === "d" && cell.v instanceof Date) {
    return String(cell.v.getDate());
  }
  if (typeof cell.v === "number" && cell.t === "n") {
    const z = String(cell.z || "");
    if (/[dy]|m{1,4}|y{2,4}/i.test(z) || serialLooksLikeDate(cell.v)) {
      const d = excelSerialToDate(cell.v);
      return String(d.getDate());
    }
  }
  const w = cell.w != null ? String(cell.w).trim() : "";
  if (w) return w;
  return String(cell.v).trim();
}

function serialLooksLikeDate(v: number): boolean {
  return v > 20000 && v < 60000;
}

function getRawCell(sheet: Record<string, any>, r: number, c: number, XLSX: XLSXModule): any {
  return sheet[XLSX.utils.encode_cell({ r, c })];
}

function parseMonthYearFromText(text: string): { month: string; year: number } | null {
  if (!text) return null;
  const t = text.replace(/\s+/g, " ").trim();
  let m = t.match(/([A-Za-z]{3,})\s*[,\s]+\s*(\d{4})/);
  if (m) {
    const cand = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
    const idx = MONTH_NAMES.findIndex((x) => x.toLowerCase() === cand.toLowerCase());
    if (idx >= 0) return { month: MONTH_NAMES[idx], year: Number(m[2]) };
  }
  m = t.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const mo = Number(m[1]);
    const year = Number(m[3]);
    if (mo >= 1 && mo <= 12) return { month: MONTH_NAMES[mo - 1], year };
  }
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const year = Number(m[1]);
    const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12) return { month: MONTH_NAMES[mo - 1], year };
  }
  return null;
}

function tryMonthYearFromCell(cell: any): { month: string; year: number } | null {
  if (!cell) return null;
  if (cell.t === "d" && cell.v instanceof Date) {
    const d = cell.v;
    return { month: MONTH_NAMES[d.getMonth()], year: d.getFullYear() };
  }
  if (typeof cell.v === "number" && (cell.t === "n" || cell.t === undefined)) {
    if (serialLooksLikeDate(cell.v)) {
      const d = excelSerialToDate(cell.v);
      return { month: MONTH_NAMES[d.getMonth()], year: d.getFullYear() };
    }
  }
  const w = cell.w != null ? String(cell.w) : "";
  const fromW = parseMonthYearFromText(w);
  if (fromW) return fromW;
  if (cell.v != null && typeof cell.v !== "object") {
    return parseMonthYearFromText(String(cell.v));
  }
  return null;
}

function extractMonthYear(
  sheet: Record<string, any>,
  range: { e: { r: number; c: number } },
  XLSX: XLSXModule,
): { month: string; year: number } {
  const tryA1 = tryMonthYearFromCell(getRawCell(sheet, 0, 0, XLSX));
  if (tryA1) return tryA1;
  const a1Text = safeCell(sheet, 0, 0, XLSX);
  const fromA1 = parseMonthYearFromText(a1Text);
  if (fromA1) return fromA1;

  for (let r = 0; r <= Math.min(5, range.e.r); r++) {
    for (let c = 0; c <= Math.min(12, range.e.c); c++) {
      const cell = getRawCell(sheet, r, c, XLSX);
      const my = tryMonthYearFromCell(cell);
      if (my) return my;
      const t = safeCell(sheet, r, c, XLSX);
      const my2 = parseMonthYearFromText(t);
      if (my2) return my2;
    }
  }
  throw new Error(
    `Invalid Month/Year in sheet header (A1 was "${a1Text}"). Expected a month name and year or an Excel date.`,
  );
}

function normalizeShiftToken(raw: string): ShiftCode | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase().replace(/\s+/g, " ");
  if (t === "A") return "A10";
  if (t === "FTW") return "FT W";
  if (t === "FTAM") return "FT AM";
  if (t === "FTPM") return "FT PM";
  if (t === "MID" || t === "MID1") return "MIDA";
  if (t === "MID2") return "MIDB";
  if (t === "FTW12") return "FT W12";
  const known: Record<string, ShiftCode> = {
    D1: "D1", D2: "D2", MIDA: "MIDA", MIDB: "MIDB", E: "E", N: "N",
    FT: "FT", "FT W": "FT W", "FT W12": "FT W12", "FT AM": "FT AM", "FT PM": "FT PM",
    C: "C", A10: "A10",
  };
  return known[t] ?? null;
}

function parseConstraintCode(raw: string): { allowed: ShiftCode[]; offAllowed: boolean } | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (
    !lower.includes("/") &&
    !["1", "2", "3", "5", "6", "7", "10", "10p", "am", "pm", "ft", "w", "wk", "ftw", "x"].includes(lower)
  ) {
    return null;
  }
  const parts = lower.split("/").map((p) => p.trim());
  const allowed: ShiftCode[] = [];
  let offAllowed = false;
  for (let p of parts) {
    const cleaned = p.replace(/x$/i, "").trim();
    if (p.endsWith("x") || p === "x") offAllowed = true;
    if (cleaned === "") continue;
    if (cleaned === "1") allowed.push("D1");
    else if (cleaned === "2") allowed.push("D2");
    else if (cleaned === "3") allowed.push("MIDA");
    else if (cleaned === "5") allowed.push("E");
    else if (cleaned === "6") allowed.push("MIDB");
    else if (cleaned === "7" || cleaned === "10" || cleaned === "10p") allowed.push("N");
    else if (cleaned === "am") allowed.push("FT AM");
    else if (cleaned === "pm") allowed.push("FT PM");
    else if (["ft", "w", "wk", "ftw"].includes(cleaned)) {
      allowed.push("FT");
      allowed.push("FT W");
    }
  }
  offAllowed = true;
  if (allowed.length === 0 && !offAllowed) return null;
  return { allowed, offAllowed };
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0] ?? 6;
  let max = 0;
  for (const [v, c] of counts) if (c > max) {
    max = c;
    best = v;
  }
  return best;
}

interface DateHeaderResult {
  dateRow: number;
  startCol: number;
  dayCols: { col: number; dayNum: number }[];
}

function findDateHeader(
  sheet: Record<string, any>,
  range: { e: { r: number; c: number } },
  daysInMonth: number,
  XLSX: XLSXModule,
): DateHeaderResult {
  let best: DateHeaderResult | null = null;
  let bestScore = 0;

  const maxScanRow = Math.min(range.e.r, 12);
  for (let dateRow = 1; dateRow <= maxScanRow; dateRow++) {
    for (let startCol = 1; startCol <= 5; startCol++) {
      const dayCols: { col: number; dayNum: number }[] = [];
      for (let i = 0; i < daysInMonth; i++) {
        const col = startCol + i;
        if (col > range.e.c) break;
        const t = safeCell(sheet, dateRow, col, XLSX);
        const n = Number(t);
        if (!Number.isFinite(n)) break;
        if (n !== i + 1) break;
        dayCols.push({ col, dayNum: n });
      }
      const score = dayCols.length;
      const minDays = Math.min(daysInMonth, 28);
      if (score > bestScore && score >= Math.max(14, minDays - 3)) {
        bestScore = score;
        best = { dateRow, startCol, dayCols };
      }
    }
  }

  if (!best || best.dayCols.length === 0) {
    throw new Error("No day header row detected. Expected consecutive 1…N day numbers in a row.");
  }
  return best;
}

export function parseScheduleWorkbook(workbook: { Sheets: Record<string, any>; SheetNames: string[] }, XLSX: XLSXModule): ParsedSchedule {
  const sheet = workbook.Sheets["Schedule"] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Workbook has no sheets.");
  if (!sheet["!ref"]) throw new Error("Sheet is empty.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  const { month: monthName, year } = extractMonthYear(sheet, range, XLSX);
  const monthIndex = MONTH_NAMES.indexOf(monthName);
  if (monthIndex < 0) throw new Error(`Unknown month: ${monthName}`);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const { dateRow, startCol, dayCols } = findDateHeader(sheet, range, daysInMonth, XLSX);

  const coverageRow = Math.max(0, dateRow - 2);
  const headerRowPP = Math.max(0, dateRow - 3);

  const days: ParsedDay[] = [];
  const coverage_pattern: Record<string, number> = {};

  for (const { col, dayNum } of dayCols) {
    if (dayNum < 1 || dayNum > daysInMonth) continue;
    const dateStr =
      `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const dateObj = new Date(year, monthIndex, dayNum);
    const covRaw = safeCell(sheet, coverageRow, col, XLSX);
    const cov = Number(covRaw);
    const coverage = cov === 6 || cov === 7 || cov === 8 ? cov : 6;
    const ppRaw = safeCell(sheet, headerRowPP, col, XLSX);
    const ppLabel = ppRaw || undefined;

    days.push({
      date: dateStr,
      dayOfMonth: dayNum,
      dayOfWeek: dateObj.getDay(),
      coverage,
      ppLabel,
    });
    coverage_pattern[dateStr] = coverage;
  }

  if (days.length === 0) throw new Error("No valid day columns after layout detection.");

  const lastDayCol = dayCols[dayCols.length - 1].col;
  let targetCol = range.e.c;
  if (targetCol <= lastDayCol) targetCol = lastDayCol + 1;

  const providers: ParsedProvider[] = [];
  const providerStartRow = dateRow + 1;

  for (let row = providerStartRow; row <= range.e.r; row++) {
    const nameRaw = safeCell(sheet, row, 0, XLSX);
    if (!nameRaw) continue;
    const nameUpper = nameRaw.trim().toUpperCase();
    // Production layout: provider block, then summary rows, then notes / zeros / duplicates.
    // Once we hit a known summary label, everything below is out of scope.
    if (SUMMARY_ROW_MARKERS.has(nameUpper)) break;

    const weekendQuotaCell = safeCell(sheet, row, 1, XLSX);
    const weekend_quota = Number(weekendQuotaCell) || 0;

    const targetRaw = safeCell(sheet, row, targetCol, XLSX);
    const target_shifts = Number(targetRaw) || 0;
    const targetBlank = targetRaw === "";

    const providerDays: ParsedProviderDay[] = [];
    let nightQuota = 0;
    let wholeMonthOff = false;

    for (const d of days) {
      const col = startCol + d.dayOfMonth - 1;
      const raw = safeCell(sheet, row, col, XLSX);
      const upper = raw.toUpperCase();
      let locked = false;
      let assigned: ShiftCode | null = null;
      let offCode: string | null = null;
      let constraint: ShiftCode[] | null = null;
      let offAllowedByConstraint = false;

      if (upper && OFF_CODES.has(upper)) {
        locked = true;
        offCode = upper;
        if (WHOLE_MONTH_OFF.has(upper)) wholeMonthOff = true;
      } else if (upper === "C") {
        locked = true;
        assigned = "C";
      } else if (upper === "A" || upper === "A10") {
        locked = true;
        assigned = "A10";
      } else {
        const norm = normalizeShiftToken(raw);
        if (norm) {
          locked = true;
          assigned = norm;
          if (norm === "N") nightQuota += 1;
        } else {
          const c = parseConstraintCode(raw);
          if (c) {
            constraint = c.allowed;
            offAllowedByConstraint = c.offAllowed;
          }
        }
      }

      providerDays.push({
        date: d.date,
        rawValue: raw,
        locked,
        assigned,
        offCode,
        constraint,
        offAllowedByConstraint,
      });
    }

    providers.push({
      name: nameRaw.trim(),
      weekend_quota,
      night_quota: nightQuota,
      target_shifts,
      active: !targetBlank && target_shifts > 0 && !wholeMonthOff,
      days: providerDays,
    });
  }

  const base_coverage_value = mode(days.map((d) => d.coverage));
  const monday_ft_rule_active = base_coverage_value === 6;

  return {
    month: monthName,
    monthIndex,
    year,
    daysInMonth,
    base_coverage_value,
    monday_ft_rule_active,
    coverage_pattern,
    days,
    providers,
  };
}

/** Map edge ParsedSchedule to legacy client shape (ScheduleUpload / UI). */
export function toClientLegacySchedule(parsed: ParsedSchedule): {
  month: string;
  year: number;
  coverage_pattern: Record<string, number>;
  providers: {
    name: string;
    weekend_quota: number;
    night_quota: number;
    target_shifts: number;
    days: { date: string; locked: boolean; assigned: string | null; constraint: string[] | null; value: string }[];
  }[];
} {
  return {
    month: parsed.month,
    year: parsed.year,
    coverage_pattern: parsed.coverage_pattern,
    providers: parsed.providers.map((p) => ({
      name: p.name,
      weekend_quota: p.weekend_quota,
      night_quota: p.night_quota,
      target_shifts: p.target_shifts,
      days: p.days.map((d) => {
        let assigned: string | null = d.assigned;
        let locked = d.locked;
        let constraint: string[] | null = d.constraint;
        if (d.offCode) {
          locked = true;
          assigned = "OFF";
          constraint = null;
        }
        return {
          date: d.date,
          locked,
          assigned,
          constraint,
          value: d.rawValue,
        };
      }),
    })),
  };
}
