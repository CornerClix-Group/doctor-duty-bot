// ED Schedule Manager — best-effort solver with relaxation
// Always produces output. Emits errors/warnings/info with rule numbers.

import {
  REGULAR_SHIFTS,
  SHIFT_DEFS,
  TIGHTNESS_ORDER,
  hoursBetween,
  requiredShiftsForDay,
  type DayMode,
  type ShiftCode,
} from "./shifts.ts";
import type { ParsedSchedule, ParsedProvider, ParsedProviderDay } from "./scheduleParser.ts";

export interface ProviderRules {
  name: string;
  active: boolean;
  target: number;
  weekend_quota: number;
  allowed_shifts: ShiftCode[] | null;     // null = all allowed
  disallowed_shifts: ShiftCode[];
  sat_disallowed_shifts: ShiftCode[];
  sun_allowed_shifts: ShiftCode[] | null; // null = all allowed
  avoid_sunday: boolean;
  recovery_days: number;                  // after Night block
  block_min: number | null;
  block_max: number | null;
  max_consec: number | null;
  max_consec_n: number | null;
  max_consec_e: number | null;
  recovery_after_e: number | null;
  rest_hours: number;
  is_specialist_n: boolean;
  is_specialist_e: boolean;
  is_specialist_ft: boolean;
}

export interface MonthlyRequest {
  provider_name: string;
  date: string;
  type: "off" | "must_work" | "prefer" | "avoid" | "must_avoid";
  shift_code?: ShiftCode | null;
  note?: string | null;
}

export interface DayAssignment {
  shift: ShiftCode | "OFF";
  provider: string; // empty when OFF / unfilled
  locked?: boolean;
  unfilled?: boolean;
}

export interface DayOutput {
  date: string;
  dayOfWeek: number;
  coverage: number;
  /** Per-day staffing mode (6/7/8); source of truth for required slot list */
  mode: DayMode;
  required: ShiftCode[];
  assignments: DayAssignment[];
}

export interface ValidationIssue {
  rule: number;
  severity: "error" | "warning" | "info";
  provider?: string;
  date?: string;
  shift?: string;
  message: string;
  suggestion?: string;
}

export interface SolveResult {
  month: string;
  year: number;
  base_coverage_value: number;
  monday_ft_rule_active: boolean;
  coverage_pattern: Record<string, number>;
  schedule: DayOutput[];
  provider_totals: Record<string, {
    worked: number;
    weekends: number;
    nights: number;
    call: number;
    admin: number;
    target: number;
    weekend_quota: number;
  }>;
  pp_hours: Record<string, Record<string, number>>; // provider -> { ppKey: hours }
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

function ymdToDate(s: string): Date {
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dow(s: string): number {
  return ymdToDate(s).getDay();
}

function isWeekend(s: string): boolean {
  const d = dow(s);
  return d === 0 || d === 6;
}

function eligible(
  rules: ProviderRules,
  day: { date: string; dayOfWeek: number },
  shift: ShiftCode,
  pdy: ParsedProviderDay | undefined,
): boolean {
  // Locked cell: only the locked shift is eligible
  if (pdy?.locked) return pdy.assigned === shift;
  // Constraint code restricts allowed shifts
  if (pdy?.constraint && pdy.constraint.length > 0 && !pdy.constraint.includes(shift)) return false;

  if (rules.allowed_shifts && !rules.allowed_shifts.includes(shift)) return false;
  if (rules.disallowed_shifts.includes(shift)) return false;

  // Weekend rules
  if (day.dayOfWeek === 6 && rules.sat_disallowed_shifts.includes(shift)) return false;
  if (day.dayOfWeek === 0 && rules.sun_allowed_shifts && !rules.sun_allowed_shifts.includes(shift)) return false;

  // C and A10 never on weekends
  if ((shift === "C" || shift === "A10") && (day.dayOfWeek === 0 || day.dayOfWeek === 6)) return false;

  return true;
}

function checkRest(
  prevDate: string | null,
  prevShift: ShiftCode | null,
  curDate: string,
  curShift: ShiftCode,
  rules: ProviderRules,
): boolean {
  if (!prevDate || !prevShift) return true;
  const hrs = hoursBetween(ymdToDate(prevDate), prevShift, ymdToDate(curDate), curShift);
  return hrs >= rules.rest_hours;
}

/** Greedy assignment with bounded retry. Best-effort, never throws. */
export function solve(
  parsed: ParsedSchedule,
  rulesByName: Map<string, ProviderRules>,
  requests: MonthlyRequest[],
): SolveResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const info: ValidationIssue[] = [];

  // Build provider day index for quick lookup
  const providerDayIndex = new Map<string, Map<string, ParsedProviderDay>>();
  for (const p of parsed.providers) {
    const byDate = new Map<string, ParsedProviderDay>();
    for (const d of p.days) byDate.set(d.date, d);
    providerDayIndex.set(p.name, byDate);
  }

  // Per-provider running state
  interface PState {
    name: string;
    rules: ProviderRules;
    assignments: Map<string, ShiftCode>;  // date -> shift (regular + locked)
    locked: Map<string, ShiftCode | "OFF">;
    workedRegular: number;
    weekends: number;
    nights: number;
    call: number;
    admin: number;
    consec: number;
    consecN: number;
    consecE: number;
    lastShiftDate: string | null;
    lastShift: ShiftCode | null;
    lastNightEnd: string | null; // date of last N
  }

  const state = new Map<string, PState>();
  for (const p of parsed.providers) {
    const r = rulesByName.get(p.name.toLowerCase());
    if (!r) {
      warnings.push({
        rule: 3, severity: "warning", provider: p.name,
        message: `Provider "${p.name}" has no profile in database. Using defaults.`,
        suggestion: "Add this provider in Providers page.",
      });
    }
    state.set(p.name, {
      name: p.name,
      rules: r ?? defaultRules(p),
      assignments: new Map(),
      locked: new Map(),
      workedRegular: 0, weekends: 0, nights: 0, call: 0, admin: 0,
      consec: 0, consecN: 0, consecE: 0,
      lastShiftDate: null, lastShift: null, lastNightEnd: null,
    });
  }

  // Apply locked cells (Phase 0)
  for (const p of parsed.providers) {
    const st = state.get(p.name)!;
    for (const d of p.days) {
      if (!d.locked) continue;
      if (d.offCode) {
        st.locked.set(d.date, "OFF");
      } else if (d.assigned) {
        st.locked.set(d.date, d.assigned);
        st.assignments.set(d.date, d.assigned);
        if (d.assigned === "C") st.call++;
        else if (d.assigned === "A10") st.admin++;
        else {
          st.workedRegular++;
          if (isWeekend(d.date)) st.weekends++;
          if (d.assigned === "N") st.nights++;
        }
      }
    }
  }

  // Apply monthly requests (off / must_avoid -> add to constraint)
  const requestIndex = new Map<string, MonthlyRequest[]>();
  for (const req of requests) {
    const key = `${req.provider_name.toLowerCase()}::${req.date}`;
    if (!requestIndex.has(key)) requestIndex.set(key, []);
    requestIndex.get(key)!.push(req);
  }
  function requestScore(name: string, date: string, shift: ShiftCode): number {
    const reqs = requestIndex.get(`${name.toLowerCase()}::${date}`) || [];
    let s = 0;
    for (const r of reqs) {
      if (r.type === "off" || r.type === "must_avoid") return -10000;
      if (r.type === "avoid") s -= 30;
      if (r.type === "prefer") {
        if (!r.shift_code || r.shift_code === shift) s += 30;
      }
      if (r.type === "must_work") {
        if (!r.shift_code || r.shift_code === shift) s += 100;
      }
    }
    return s;
  }

  // Phase 1-3: chronological assignment
  const sortedDays = [...parsed.days].sort((a,b) => a.date.localeCompare(b.date));

  for (const day of sortedDays) {
    const required = requiredShiftsForDay(day.mode, day.dayOfWeek, parsed.monday_ft_rule_active);
    // Sort by tightness
    const ordered = [...required].sort((a,b) => TIGHTNESS_ORDER.indexOf(a) - TIGHTNESS_ORDER.indexOf(b));
    // Track who is already assigned today (locked or just-assigned)
    const usedToday = new Set<string>();
    for (const [name, st] of state) if (st.assignments.has(day.date)) usedToday.add(name);

    for (const shift of ordered) {
      // Already filled by lock?
      let fillerName: string | null = null;
      for (const [name, st] of state) {
        if (st.assignments.get(day.date) === shift) { fillerName = name; break; }
      }
      if (fillerName) continue;

      // Build candidate list
      const candidates: { name: string; score: number }[] = [];
      for (const [name, st] of state) {
        if (!st.rules.active) continue;
        if (usedToday.has(name)) continue;
        const pdy = providerDayIndex.get(name)?.get(day.date);
        if (pdy?.offCode) continue; // locked off
        if (!eligible(st.rules, day, shift, pdy)) continue;
        if (!checkRest(st.lastShiftDate, st.lastShift, day.date, shift, st.rules)) continue;

        // Night recovery
        if (st.lastNightEnd && shift !== "N") {
          const daysSince = Math.floor(
            (ymdToDate(day.date).getTime() - ymdToDate(st.lastNightEnd).getTime()) / 86400000,
          );
          // Only block if last N was the most recent shift (consecN > 0 means still in block)
          if (st.lastShift === "N" && daysSince <= st.rules.recovery_days) continue;
        }

        // Consec limits
        if (shift === "N" && st.rules.max_consec_n && st.consecN >= st.rules.max_consec_n) continue;
        if (shift === "E" && st.rules.max_consec_e && st.consecE >= st.rules.max_consec_e) continue;
        if (st.rules.max_consec && st.consec >= st.rules.max_consec) continue;
        if (st.rules.block_max && shift === "N" && st.consecN >= st.rules.block_max) continue;

        // Score
        let score = 0;
        // Distance from target (heaviest)
        const remaining = st.rules.target - st.workedRegular;
        const daysLeft = sortedDays.filter(d => d.date >= day.date).length;
        score += remaining * 50;
        if (remaining <= 0) score -= 200; // already at target
        if (remaining > daysLeft * 0.5) score += 100; // urgent

        // Block continuity for generalists
        if (st.lastShiftDate) {
          const dDelta = Math.floor(
            (ymdToDate(day.date).getTime() - ymdToDate(st.lastShiftDate).getTime()) / 86400000,
          );
          if (dDelta === 1 && !st.rules.is_specialist_n) score += 15;
        }

        // Specialist preference
        if (shift === "N" && st.rules.is_specialist_n) score += 80;
        if (shift === "E" && st.rules.is_specialist_e) score += 60;
        if ((shift === "FT" || shift === "FT W" || shift === "FT AM" || shift === "FT PM") && st.rules.is_specialist_ft) score += 60;

        // D1 priority order
        if (shift === "D1") {
          const order = ["lopez","arnett","beres","illston","freeman","ferguson","jones"];
          const idx = order.findIndex(o => name.toLowerCase().includes(o));
          if (idx >= 0) score += 40 - idx * 4;
        }

        // Avoid Sunday penalty
        if (day.dayOfWeek === 0 && st.rules.avoid_sunday) score -= 25;

        // Weekend distribution
        if (isWeekend(day.date)) {
          const wkRemaining = st.rules.weekend_quota - st.weekends;
          if (wkRemaining > 0) score += 20;
          else score -= 30;
        }

        // Monthly request bias
        score += requestScore(name, day.date, shift);

        candidates.push({ name, score });
      }

      candidates.sort((a,b) => b.score - a.score);

      if (candidates.length === 0) {
        errors.push({
          rule: 2, severity: "error", date: day.date, shift,
          message: `Unfilled ${shift} on ${day.date} — no eligible provider.`,
          suggestion: "Check provider availability, locked cells, and constraint codes for this day.",
        });
        continue;
      }

      const pick = candidates[0].name;
      const st = state.get(pick)!;
      st.assignments.set(day.date, shift);
      usedToday.add(pick);
      st.workedRegular++;
      if (isWeekend(day.date)) st.weekends++;
      if (shift === "N") {
        st.nights++;
        st.consecN += 1;
        st.lastNightEnd = day.date;
      } else {
        st.consecN = 0;
      }
      if (shift === "E") st.consecE += 1; else st.consecE = 0;
      st.consec = st.lastShiftDate &&
        Math.floor((ymdToDate(day.date).getTime() - ymdToDate(st.lastShiftDate).getTime()) / 86400000) === 1
        ? st.consec + 1 : 1;
      st.lastShiftDate = day.date;
      st.lastShift = shift;
    }
  }

  // ----- Build output -----
  const schedule: DayOutput[] = sortedDays.map(day => {
    const required = requiredShiftsForDay(day.mode, day.dayOfWeek, parsed.monday_ft_rule_active);
    const assignments: DayAssignment[] = [];
    const seen = new Set<string>();
    for (const shift of required) {
      let provider = "";
      let locked = false;
      for (const [name, st] of state) {
        if (st.assignments.get(day.date) === shift) {
          provider = name;
          locked = st.locked.get(day.date) === shift;
          break;
        }
      }
      assignments.push({ shift, provider, locked, unfilled: provider === "" });
      seen.add(shift);
    }
    // Append locked C / A10 / OFF for visibility
    for (const [name, st] of state) {
      const locked = st.locked.get(day.date);
      const cur = st.assignments.get(day.date);
      if (cur && (cur === "C" || cur === "A10")) {
        assignments.push({ shift: cur, provider: name, locked: true });
      } else if (locked === "OFF") {
        // Optional: include OFF entries; keep schedule lean for now
      }
    }
    return {
      date: day.date,
      dayOfWeek: day.dayOfWeek,
      coverage: day.coverage,
      mode: day.mode,
      required,
      assignments,
    };
  });

  const provider_totals: SolveResult["provider_totals"] = {};
  for (const [name, st] of state) {
    provider_totals[name] = {
      worked: st.workedRegular,
      weekends: st.weekends,
      nights: st.nights,
      call: st.call,
      admin: st.admin,
      target: st.rules.target,
      weekend_quota: st.rules.weekend_quota,
    };
    // Rule 1 — exact target
    if (st.rules.active && st.workedRegular !== st.rules.target) {
      const delta = st.workedRegular - st.rules.target;
      errors.push({
        rule: 1, severity: "error", provider: name,
        message: `${name} worked ${st.workedRegular} regular shifts but target is ${st.rules.target} (delta ${delta > 0 ? "+" : ""}${delta}).`,
        suggestion: delta < 0 ? "Add shifts or reduce target." : "Remove shifts or raise target.",
      });
    }
    // Rule 11 — weekend quota
    if (st.rules.active && st.weekends !== st.rules.weekend_quota) {
      warnings.push({
        rule: 11, severity: "warning", provider: name,
        message: `${name} worked ${st.weekends} weekend shifts; quota is ${st.rules.weekend_quota}.`,
      });
    }
  }

  // Pay period hours (basic — group by 14-day federal anchor: PP1 starts Sun)
  const pp_hours: SolveResult["pp_hours"] = {};
  for (const [name, st] of state) {
    const map: Record<string, number> = {};
    for (const [date, shift] of st.assignments) {
      const d = SHIFT_DEFS[shift].hours;
      const ppKey = computePPKey(date);
      map[ppKey] = (map[ppKey] || 0) + d;
    }
    pp_hours[name] = map;
    // Rule 10 — soft 80h
    for (const [pp, hrs] of Object.entries(map)) {
      if (hrs < 80 && st.rules.active) {
        warnings.push({
          rule: 10, severity: "warning", provider: name,
          message: `${name} ${pp} totals ${hrs}h (target 80h).`,
          suggestion: "Assign A10/C or designate L codes to fill the gap.",
        });
      }
    }
  }

  return {
    month: parsed.month,
    year: parsed.year,
    base_coverage_value: parsed.base_coverage_value,
    monday_ft_rule_active: parsed.monday_ft_rule_active,
    coverage_pattern: parsed.coverage_pattern,
    schedule,
    provider_totals,
    pp_hours,
    errors,
    warnings,
    info,
  };
}

// Federal pay period key — PP anchored to 2025-12-28 Sunday, 14-day cycles
const PP_ANCHOR = new Date(2025, 11, 28).getTime();
function computePPKey(dateStr: string): string {
  const t = ymdToDate(dateStr).getTime();
  const idx = Math.floor((t - PP_ANCHOR) / (14 * 86400000));
  return `PP${idx + 1}`;
}

function defaultRules(p: ParsedProvider): ProviderRules {
  return {
    name: p.name,
    active: p.active,
    target: p.target_shifts,
    weekend_quota: p.weekend_quota,
    allowed_shifts: null,
    disallowed_shifts: [],
    sat_disallowed_shifts: [],
    sun_allowed_shifts: null,
    avoid_sunday: false,
    recovery_days: 2,
    block_min: null, block_max: null,
    max_consec: null, max_consec_n: null, max_consec_e: null,
    recovery_after_e: null,
    rest_hours: 12,
    is_specialist_n: false, is_specialist_e: false, is_specialist_ft: false,
  };
}