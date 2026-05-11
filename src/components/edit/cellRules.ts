// Lightweight client-side rule check for inline cell edits.
// Mirrors a subset of the solver's eligibility rules so the user gets
// instant feedback. Authoritative validation still runs server-side.

import { shiftStartHour } from "../../../supabase/functions/_shared/shifts.ts";

export type DayMode = 6 | 7 | 8;

function formatHour(h: number): string {
  if (!Number.isFinite(h)) return String(h);
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  if (h < 12) return `${h} am`;
  return `${h - 12} pm`;
}

export interface ProviderRule {
  name: string;
  active: boolean;
  target: number;
  weekend_quota: number;
  allowed_shifts: string[] | null;
  disallowed_shifts: string[];
  sat_disallowed_shifts: string[];
  sun_allowed_shifts: string[] | null;
  avoid_sunday: boolean;
  /** Hard window: ban Sat shifts that start strictly after this hour. null = no rule. */
  sat_no_start_after_hour?: number | null;
  /** Hard window: ban Sun shifts that start strictly before this hour. null = no rule. */
  sun_no_start_before_hour?: number | null;
  max_consec: number | null;
  max_consec_n: number | null;
  recovery_days: number;
}

export interface DayAssignment {
  shift: string;
  provider: string;
  locked?: boolean;
  unfilled?: boolean;
}
export interface DayOutput {
  date: string; // YYYY-MM-DD
  dayOfWeek: number;
  /** Staffing mode when present (from solver / parser); drives required slots */
  mode?: DayMode;
  coverage?: number;
  required?: string[];
  assignments: DayAssignment[];
}

export interface CellIssue {
  severity: "error" | "warning";
  message: string;
}

function dow(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

function consecBefore(
  schedule: DayOutput[],
  providerName: string,
  date: string,
  predicate: (shift: string) => boolean,
): number {
  const idx = schedule.findIndex((d) => d.date === date);
  if (idx < 0) return 0;
  let count = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const a = schedule[i].assignments.find((x) => x.provider === providerName);
    if (a && predicate(a.shift)) count++;
    else break;
  }
  return count;
}

function consecAfter(
  schedule: DayOutput[],
  providerName: string,
  date: string,
  predicate: (shift: string) => boolean,
): number {
  const idx = schedule.findIndex((d) => d.date === date);
  if (idx < 0) return 0;
  let count = 0;
  for (let i = idx + 1; i < schedule.length; i++) {
    const a = schedule[i].assignments.find((x) => x.provider === providerName);
    if (a && predicate(a.shift)) count++;
    else break;
  }
  return count;
}

function recentNight(
  schedule: DayOutput[],
  providerName: string,
  date: string,
  recovery: number,
): string | null {
  const idx = schedule.findIndex((d) => d.date === date);
  if (idx < 0) return null;
  for (let i = idx - 1; i >= Math.max(0, idx - recovery); i--) {
    const a = schedule[i].assignments.find((x) => x.provider === providerName);
    if (a && a.shift === "N") return schedule[i].date;
  }
  return null;
}

/**
 * Check whether assigning `provider` to `shift` on `date` violates any rule.
 * Returns an array of issues; empty means clean.
 */
export function checkCellEdit(
  schedule: DayOutput[],
  date: string,
  shift: string,
  provider: string,
  rule: ProviderRule | undefined,
): CellIssue[] {
  const issues: CellIssue[] = [];
  if (!provider || provider === "—") return issues;

  if (!rule) {
    issues.push({ severity: "warning", message: `No rules profile for ${provider}.` });
    return issues;
  }

  if (!rule.active) {
    issues.push({ severity: "error", message: `${provider} is inactive.` });
  }

  // Allowed / disallowed
  if (rule.allowed_shifts && rule.allowed_shifts.length && !rule.allowed_shifts.includes(shift)) {
    issues.push({
      severity: "error",
      message: `${provider} not allowed to work ${shift} (allowed: ${rule.allowed_shifts.join(", ")}).`,
    });
  }
  if (rule.disallowed_shifts.includes(shift)) {
    issues.push({ severity: "error", message: `${provider} cannot work ${shift}.` });
  }

  // Weekend rules
  const day = dow(date);
  if (day === 6 && rule.sat_disallowed_shifts.includes(shift)) {
    issues.push({ severity: "error", message: `${provider} cannot work ${shift} on Saturdays.` });
  }
  if (day === 0 && rule.sun_allowed_shifts && !rule.sun_allowed_shifts.includes(shift)) {
    issues.push({
      severity: "error",
      message: `On Sundays ${provider} can only work ${rule.sun_allowed_shifts.join(", ")}.`,
    });
  }
  if (day === 0 && rule.avoid_sunday) {
    issues.push({ severity: "warning", message: `${provider} prefers to avoid Sundays.` });
  }

  // Weekend time-of-day windows (e.g. Will Arnett: no Sat shift starting after 3 pm,
  // no Sun shift starting before 2 pm). These are HARD rules — emit as errors.
  if (day === 6 && rule.sat_no_start_after_hour != null) {
    const sh = shiftStartHour(shift);
    if (sh != null && sh > rule.sat_no_start_after_hour) {
      issues.push({
        severity: "error",
        message: `${provider} cannot work shifts starting after ${formatHour(rule.sat_no_start_after_hour)} on Saturdays (${shift} starts at ${formatHour(sh)}).`,
      });
    }
  }
  if (day === 0 && rule.sun_no_start_before_hour != null) {
    const sh = shiftStartHour(shift);
    if (sh != null && sh < rule.sun_no_start_before_hour) {
      issues.push({
        severity: "error",
        message: `${provider} cannot work shifts starting before ${formatHour(rule.sun_no_start_before_hour)} on Sundays (${shift} starts at ${formatHour(sh)}).`,
      });
    }
  }

  // C / A10 weekend ban
  if ((shift === "C" || shift === "A10") && (day === 0 || day === 6)) {
    issues.push({ severity: "error", message: `${shift} cannot be assigned on weekends.` });
  }

  // Same provider already assigned same day
  const sameDay = schedule.find((d) => d.date === date);
  const dup = sameDay?.assignments.find(
    (a) => a.provider === provider && a.shift !== shift,
  );
  if (dup) {
    issues.push({
      severity: "error",
      message: `${provider} is already assigned ${dup.shift} on ${date}.`,
    });
  }

  // Consecutive limits (work)
  if (rule.max_consec) {
    const before = consecBefore(schedule, provider, date, () => true);
    const after = consecAfter(schedule, provider, date, () => true);
    if (before + 1 + after > rule.max_consec) {
      issues.push({
        severity: "warning",
        message: `Exceeds max ${rule.max_consec} consecutive shifts for ${provider} (${before + 1 + after}).`,
      });
    }
  }

  // Consecutive nights
  if (shift === "N" && rule.max_consec_n) {
    const before = consecBefore(schedule, provider, date, (s) => s === "N");
    const after = consecAfter(schedule, provider, date, (s) => s === "N");
    if (before + 1 + after > rule.max_consec_n) {
      issues.push({
        severity: "warning",
        message: `Exceeds max ${rule.max_consec_n} consecutive nights.`,
      });
    }
  }

  // Night recovery
  if (shift !== "N" && shift !== "OFF") {
    const last = recentNight(schedule, provider, date, rule.recovery_days);
    if (last) {
      issues.push({
        severity: "warning",
        message: `${provider} worked Night on ${last}; needs ${rule.recovery_days}-day recovery.`,
      });
    }
  }

  return issues;
}