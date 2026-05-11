import { SHIFT_DEFS, coverageToDayMode, requiredShiftsForDay, toCanonicalShift, type DayMode, type ShiftCode } from "./shifts.ts";
import type { ParsedSchedule, ParsedProvider } from "./scheduleParser.ts";
import { runMonthSolve } from "../_shared/scheduler/monthSolve.ts";
import type { ProviderRuleProfile, ScheduleViolation } from "../_shared/schedulerHardRules.ts";
import type { SolverProviderDayCell, SolverProviderRow } from "../_shared/scheduleSolverCore.ts";

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
  /** Hard window: ban Sat shifts that start strictly after this hour. NULL = no rule. */
  sat_no_start_after_hour: number | null;
  /** Hard window: ban Sun shifts that start strictly before this hour. NULL = no rule. */
  sun_no_start_before_hour: number | null;
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
  assignments_by_provider: Record<string, Record<string, string>>;
  generated_at: string;
  success: boolean;
  violations: ScheduleViolation[];
  softScores: {
    isolatedShifts: number;
    circadianFlips: number;
    shiftFairnessVariance: number;
    callFairnessVariance: number;
    weekendFairnessVariance: number;
  };
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  info: ValidationIssue[];
}

function ymdToDate(s: string): Date {
  const [y,m,d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function normalizeName(name: string): string {
  return (name || "").trim().toLowerCase();
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
    sat_no_start_after_hour: null,
    sun_no_start_before_hour: null,
    recovery_days: 2,
    block_min: null,
    block_max: null,
    max_consec: null,
    max_consec_n: null,
    max_consec_e: null,
    recovery_after_e: null,
    rest_hours: 12,
    is_specialist_n: false,
    is_specialist_e: false,
    is_specialist_ft: false,
  };
}

function toSolverProviders(
  parsed: ParsedSchedule,
  rulesByName: Map<string, ProviderRules>,
): SolverProviderRow[] {
  return parsed.providers.map((p) => {
    const r = rulesByName.get(normalizeName(p.name)) ?? defaultRules(p);
    return {
      name: p.name,
      active: p.active !== false,
      allowed_shifts: r.allowed_shifts ?? undefined,
      rules: {
        disallowed_shifts: r.disallowed_shifts,
        sat_disallowed_shifts: r.sat_disallowed_shifts,
        sun_allowed_shifts: r.sun_allowed_shifts,
        saturday_restrictions: undefined,
        sunday_restrictions: undefined,
      } as any,
    };
  });
}

function getCellLookup(parsed: ParsedSchedule) {
  const byProvider = new Map<string, Map<string, SolverProviderDayCell>>();
  for (const p of parsed.providers) {
    const dayMap = new Map<string, SolverProviderDayCell>();
    for (const d of p.days) {
      const assigned = d.offCode ? "OFF" : d.assigned;
      dayMap.set(d.date, {
        locked: d.locked,
        assigned: assigned ?? null,
        offCode: d.offCode ?? null,
        constraint: d.constraint ?? null,
      });
    }
    byProvider.set(normalizeName(p.name), dayMap);
  }
  return (providerName: string, date: string): SolverProviderDayCell | undefined =>
    byProvider.get(normalizeName(providerName))?.get(date);
}

function buildScheduleState(parsed: ParsedSchedule): {
  schedule: Record<string, Record<string, string | null>>;
  assignedByDate: Record<string, Set<string>>;
} {
  const schedule: Record<string, Record<string, string | null>> = {};
  const assignedByDate: Record<string, Set<string>> = {};
  for (const d of parsed.days) {
    schedule[d.date] = {};
    assignedByDate[d.date] = new Set<string>();
  }
  for (const p of parsed.providers) {
    for (const d of p.days) {
      if (!d.locked) continue;
      if (d.offCode) {
        schedule[d.date][p.name] = "OFF";
        continue;
      }
      if (!d.assigned) continue;
      const canon = (toCanonicalShift(d.assigned) ?? d.assigned) as string;
      schedule[d.date][p.name] = canon;
      if (canon !== "C" && canon !== "A10") {
        assignedByDate[d.date].add(canon);
      }
    }
  }
  return { schedule, assignedByDate };
}

function toDayOutput(
  parsed: ParsedSchedule,
  schedule: Record<string, Record<string, string | null>>,
): DayOutput[] {
  const providerNames = parsed.providers.map((p) => p.name);
  return [...parsed.days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const required = requiredShiftsForDay(day.mode, day.dayOfWeek, parsed.monday_ft_rule_active);
      const assignments: DayAssignment[] = [];

      for (const shift of required) {
        let provider = "";
        for (const name of providerNames) {
          const raw = schedule[day.date]?.[name];
          if (!raw || raw === "OFF") continue;
          const canon = (toCanonicalShift(raw) ?? raw) as string;
          if (canon === shift) {
            provider = name;
            break;
          }
        }
        assignments.push({ shift, provider, locked: false, unfilled: !provider });
      }

      for (const name of providerNames) {
        const raw = schedule[day.date]?.[name];
        if (!raw || raw === "OFF") continue;
        const canon = (toCanonicalShift(raw) ?? raw) as string;
        if (canon === "C" || canon === "A10") {
          const exists = assignments.some((a) => a.shift === canon && a.provider === name);
          if (!exists) assignments.push({ shift: canon, provider: name, locked: false, unfilled: false });
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
}

function providerTotals(
  parsed: ParsedSchedule,
  schedule: Record<string, Record<string, string | null>>,
): SolveResult["provider_totals"] {
  const totals: SolveResult["provider_totals"] = {};
  for (const p of parsed.providers) {
    totals[p.name] = {
      worked: 0,
      weekends: 0,
      nights: 0,
      call: 0,
      admin: 0,
      target: p.target_shifts,
      weekend_quota: p.weekend_quota,
    };
  }
  const dates = Object.keys(schedule).sort();
  for (const date of dates) {
    const d = new Date(date + "T12:00:00").getDay();
    for (const [providerName, shift] of Object.entries(schedule[date] || {})) {
      if (!shift || shift === "OFF") continue;
      if (shift === "C") {
        totals[providerName].call += 1;
        continue;
      }
      if (shift === "A10") {
        totals[providerName].admin += 1;
        continue;
      }
      totals[providerName].worked += 1;
      if (d === 0 || d === 6) totals[providerName].weekends += 1;
      if (shift === "N" || shift === "10p" || shift === "21") totals[providerName].nights += 1;
    }
  }
  return totals;
}

function payPeriodHours(
  schedule: Record<string, Record<string, string | null>>,
): SolveResult["pp_hours"] {
  const out: SolveResult["pp_hours"] = {};
  for (const [date, assignments] of Object.entries(schedule)) {
    for (const [providerName, shift] of Object.entries(assignments)) {
      if (!shift || shift === "OFF") continue;
      const pp = computePPKey(date);
      out[providerName] = out[providerName] || {};
      out[providerName][pp] = (out[providerName][pp] || 0) + (SHIFT_DEFS[shift as ShiftCode]?.hours ?? 0);
    }
  }
  return out;
}

function assignmentsByProvider(
  schedule: Record<string, Record<string, string | null>>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [date, assignments] of Object.entries(schedule)) {
    for (const [providerName, shift] of Object.entries(assignments)) {
      if (!shift || shift === "OFF") continue;
      out[providerName] = out[providerName] || {};
      out[providerName][date] = shift;
    }
  }
  return out;
}

function toValidationIssues(violations: ScheduleViolation[]): ValidationIssue[] {
  return violations.map((v) => ({
    rule: 2,
    severity: "error",
    provider: v.provider,
    date: v.date,
    shift: v.shift,
    message: v.message,
  }));
}

export function solve(
  parsed: ParsedSchedule,
  rulesByName: Map<string, ProviderRules>,
  requests: MonthlyRequest[],
  profiles: Record<string, ProviderRuleProfile>,
): SolveResult {
  void requests;
  const dates = parsed.days.map((d) => d.date).sort();
  const dayModes = new Map(parsed.days.map((d) => [d.date, d.mode]));
  const { schedule, assignedByDate } = buildScheduleState(parsed);
  const providers = toSolverProviders(parsed, rulesByName);
  const getCell = getCellLookup(parsed);

  const { violations, softScores } = runMonthSolve({
    dates,
    dayMode: (d) => dayModes.get(d) ?? coverageToDayMode(parsed.coverage_pattern[d] ?? 8),
    mondayFtRuleActive: parsed.monday_ft_rule_active,
    schedule,
    assignedByDate,
    providers,
    getCell,
    profiles,
  });

  const scheduleDays = toDayOutput(parsed, schedule);
  const totalByProvider = providerTotals(parsed, schedule);
  const ppHours = payPeriodHours(schedule);

  return {
    month: parsed.month,
    year: parsed.year,
    base_coverage_value: parsed.base_coverage_value,
    monday_ft_rule_active: parsed.monday_ft_rule_active,
    coverage_pattern: parsed.coverage_pattern,
    schedule: scheduleDays,
    provider_totals: totalByProvider,
    pp_hours: ppHours,
    assignments_by_provider: assignmentsByProvider(schedule),
    generated_at: new Date().toISOString(),
    success: violations.length === 0,
    violations,
    softScores,
    errors: toValidationIssues(violations),
    warnings: [],
    info: [],
  };
}

// Federal pay period key — PP anchored to 2025-12-28 Sunday, 14-day cycles
const PP_ANCHOR = new Date(2025, 11, 28).getTime();
function computePPKey(dateStr: string): string {
  const t = ymdToDate(dateStr).getTime();
  const idx = Math.floor((t - PP_ANCHOR) / (14 * 86400000));
  return `PP${idx + 1}`;
}

export async function loadProviderRuleProfiles(
  supabaseAdmin: {
    from: (table: string) => {
      select: (cols: string) => { eq: (col: string, value: unknown) => Promise<{ data: any[] | null; error: any }> };
    };
  },
): Promise<Record<string, ProviderRuleProfile>> {
  const { data, error } = await supabaseAdmin
    .from("provider_profiles")
    .select("id, last_name, night_only, evening_only, ft_or_mida_only, monthly_max_nights, night_block_min_length, night_block_max_length, nights_clean_days_after_block, provider_group, requires_80hr_pp")
    .eq("active", true);
  if (error) throw error;
  const out: Record<string, ProviderRuleProfile> = {};
  for (const row of data || []) {
    const key = normalizeName(row.last_name || "");
    if (!key) continue;
    out[key] = {
      night_only: row.night_only ?? null,
      evening_only: row.evening_only ?? null,
      ft_or_mida_only: row.ft_or_mida_only ?? null,
      monthly_max_nights: row.monthly_max_nights ?? null,
      night_block_min_length: row.night_block_min_length ?? null,
      night_block_max_length: row.night_block_max_length ?? null,
      nights_clean_days_after_block: row.nights_clean_days_after_block ?? null,
      provider_group: row.provider_group ?? null,
      requires_80hr_pp: row.requires_80hr_pp ?? null,
    };
  }
  return out;
}