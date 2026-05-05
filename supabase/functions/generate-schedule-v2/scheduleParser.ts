// ED Schedule Manager — Excel parser (spec-compliant rewrite)
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import {
  OFF_CODES,
  SUMMARY_ROW_MARKERS,
  WHOLE_MONTH_OFF,
  normalizeShiftToken,
  type ShiftCode,
} from "./shifts.ts";

export interface ParsedDay {
  date: string;          // YYYY-MM-DD
  dayOfMonth: number;
  dayOfWeek: number;     // 0=Sun..6=Sat
  coverage: number;      // 6/7/8 (per-day cell)
  ppLabel?: string;      // optional label from row 1 (PP1..PP14)
}

export interface ParsedProviderDay {
  date: string;
  rawValue: string;
  locked: boolean;
  assigned: ShiftCode | null;       // pre-assigned shift (locked)
  offCode: string | null;           // L, HL, X, SL, TL, DP, TDY
  constraint: ShiftCode[] | null;   // allowed shifts when constraint code present
  offAllowedByConstraint: boolean;  // OFF token present in constraint
}

export interface ParsedProvider {
  name: string;
  weekend_quota: number;
  night_quota: number;
  target_shifts: number;            // adjusted target (rightmost col)
  active: boolean;                  // false when target blank or DP/TL whole-month
  days: ParsedProviderDay[];
}

export interface ParsedSchedule {
  month: string;
  monthIndex: number;               // 0-11
  year: number;
  daysInMonth: number;
  base_coverage_value: number;      // mode of per-day coverage values
  monday_ft_rule_active: boolean;
  coverage_pattern: Record<string, number>;
  days: ParsedDay[];
  providers: ParsedProvider[];
}

function safeCell(cell: any): string {
  if (!cell) return "";
  if (cell.v === undefined || cell.v === null) return "";
  return String(cell.v).trim();
}

function parseConstraintCode(raw: string): { allowed: ShiftCode[]; offAllowed: boolean } | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (!lower.includes("/") && !["1","2","3","5","6","7","10","10p","am","pm","ft","w","wk","ftw","x"].includes(lower)) {
    return null;
  }
  const parts = lower.split("/").map(p => p.trim());
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
    else if (["ft","w","wk","ftw"].includes(cleaned)) { allowed.push("FT"); allowed.push("FT W"); }
  }
  // Always allow OFF on a constrained day per spec
  offAllowed = true;
  if (allowed.length === 0 && !offAllowed) return null;
  return { allowed, offAllowed };
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = values[0] ?? 6;
  let max = 0;
  for (const [v, c] of counts) if (c > max) { max = c; best = v; }
  return best;
}

export function parseSchedule(workbook: XLSX.WorkBook): ParsedSchedule {
  let sheet = workbook.Sheets["Schedule"] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Workbook has no sheets.");
  if (!sheet["!ref"]) throw new Error("Sheet is empty.");
  const range = XLSX.utils.decode_range(sheet["!ref"]);

  // ----- Month / Year from A1 -----
  const monthCell = safeCell(sheet["A1"]);
  const m = monthCell.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!m) throw new Error(`Invalid Month/Year in A1 (got "${monthCell}"). Expected "Month YYYY".`);
  const monthName = m[1];
  const year = Number(m[2]);
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // ----- Day columns (row 4 = dates, row 2 = coverage, row 1 = PP labels) -----
  // Row indices are 0-based: 0=row1 month/PP, 1=row2 coverage, 2=row3 day-of-week, 3=row4 date
  const days: ParsedDay[] = [];
  const coverage_pattern: Record<string, number> = {};
  const dayCols: { col: number; date: string }[] = [];

  for (let col = 2; col <= range.e.c; col++) {
    const dateRaw = safeCell(sheet[XLSX.utils.encode_cell({ r: 3, c: col })]);
    const dayNum = Number(dateRaw);
    if (!Number.isFinite(dayNum) || dayNum < 1 || dayNum > 31) continue;
    if (dayCols.length >= daysInMonth) break;

    const dateObj = new Date(year, monthIndex, dayNum);
    const dateStr = `${year}-${String(monthIndex + 1).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
    const covRaw = safeCell(sheet[XLSX.utils.encode_cell({ r: 1, c: col })]);
    const cov = Number(covRaw);
    const coverage = (cov === 6 || cov === 7 || cov === 8) ? cov : 6;
    const ppLabel = safeCell(sheet[XLSX.utils.encode_cell({ r: 0, c: col })]) || undefined;

    days.push({
      date: dateStr,
      dayOfMonth: dayNum,
      dayOfWeek: dateObj.getDay(),
      coverage,
      ppLabel,
    });
    coverage_pattern[dateStr] = coverage;
    dayCols.push({ col, date: dateStr });
  }

  if (dayCols.length === 0) throw new Error("No day columns detected. Check row 4 contains date numbers.");

  // ----- Determine rightmost target column (skip past last day column) -----
  const lastDayCol = dayCols[dayCols.length - 1].col;
  // Heuristic: rightmost non-empty header in row 4 area is the target column.
  // Per spec the rightmost shift count column in the file is the adjusted target.
  let targetCol = range.e.c;
  if (targetCol <= lastDayCol) targetCol = lastDayCol + 1;

  // ----- Provider rows (row 5 onward) -----
  const providers: ParsedProvider[] = [];
  for (let row = 4; row <= range.e.r; row++) {
    const nameRaw = safeCell(sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]);
    if (!nameRaw) continue;
    // Filter summary/total rows
    if (SUMMARY_ROW_MARKERS.has(nameRaw.toUpperCase())) continue;

    const weekendQuotaCell = safeCell(sheet[XLSX.utils.encode_cell({ r: row, c: 1 })]);
    const weekend_quota = Number(weekendQuotaCell) || 0;

    const targetRaw = safeCell(sheet[XLSX.utils.encode_cell({ r: row, c: targetCol })]);
    const target_shifts = Number(targetRaw) || 0;
    const targetBlank = targetRaw === "";

    const providerDays: ParsedProviderDay[] = [];
    let nightQuota = 0;
    let wholeMonthOff = false;

    for (const { col, date } of dayCols) {
      const raw = safeCell(sheet[XLSX.utils.encode_cell({ r: row, c: col })]);
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
        const norm = normalizeShiftToken(upper);
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
        date,
        rawValue: raw,
        locked,
        assigned,
        offCode,
        constraint,
        offAllowedByConstraint,
      });
    }

    providers.push({
      name: nameRaw,
      weekend_quota,
      night_quota: nightQuota, // recomputed later from solver output if needed
      target_shifts,
      active: !targetBlank && target_shifts > 0 && !wholeMonthOff,
      days: providerDays,
    });
  }

  // base coverage = mode of per-day coverage
  const base_coverage_value = mode(days.map(d => d.coverage));
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