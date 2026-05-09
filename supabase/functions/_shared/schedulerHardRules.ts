/**
 * Shared scheduling rule helpers — client HardScheduler and edge solver alignment.
 */

import {
  REGULAR_SHIFTS,
  SHIFT_DEFS,
  toCanonicalShift,
  type ShiftCode,
} from "./shifts.ts";

export type ViolationType =
  | "coverage_unfilled"
  | "pp_hours_short"
  | "pp_hours_over"
  | "eligibility"
  | "max_consecutive_clinical"
  | "rolling_7_clinical"
  | "night_block_length"
  | "nights_clean_window"
  | "monthly_max_nights"
  | "circadian_ratchet";

export interface ScheduleViolation {
  type: ViolationType;
  provider?: string;
  date?: string;
  shift?: string;
  message: string;
}

export interface SchedulerProviderProfile {
  night_only?: boolean | null;
  evening_only?: boolean | null;
  ft_or_mida_only?: boolean | null;
  monthly_max_nights?: number | null;
  night_block_min_length?: number | null;
  night_block_max_length?: number | null;
  nights_clean_days_after_block?: number | null;
  requires_80hr_pp?: boolean | null;
  provider_group?: string | null;
  counts_in_quotas?: boolean | null;
}

const OFF_BREAK_STREAK = new Set([
  "OFF", "X", "L", "HL", "LH", "SL", "TL", "DP", "TDY", "A10", "C",
]);

export function isClinicalShift(shift: string | null | undefined): boolean {
  if (!shift || shift === "OFF") return false;
  if (OFF_BREAK_STREAK.has(shift)) return false;
  return true;
}

export function isNightShiftToken(shift: string | null | undefined): boolean {
  if (!shift || shift === "OFF") return false;
  const c = toCanonicalShift(shift);
  return c === "N" || c === "10p";
}

const NIGHT_ELIGIBLE = new Set<string>(["N", "21", "10p", "A10", "C"]);
const EVENING_ELIGIBLE = new Set<string>(["E", "16", "5p", "A10", "C"]);
const FT_MIDA_ELIGIBLE = new Set<string>([
  "FT", "FT W", "FT W12", "FT AM", "FT PM", "FT 7a", "FT 2p", "FT 9", "FT W9",
  "MIDA", "11", "11a", "A10", "C",
]);

/** Shifts the scheduler may assign for this provider (string codes; canonical forms). */
export function eligibleShiftCodesForProfile(
  profile: SchedulerProviderProfile | undefined,
): Set<string> {
  const all = new Set<string>([...REGULAR_SHIFTS.map(String), "A10", "C"]);
  if (!profile) return all;
  if (profile.night_only) return new Set(NIGHT_ELIGIBLE);
  if (profile.evening_only) return new Set(EVENING_ELIGIBLE);
  if (profile.ft_or_mida_only) return new Set(FT_MIDA_ELIGIBLE);
  return all;
}

export function isShiftEligibleForProfile(
  profile: SchedulerProviderProfile | undefined,
  shift: string,
): boolean {
  return eligibleShiftCodesForProfile(profile).has(shift);
}

export function recoveryDaysAfterNightBlock(
  profile: SchedulerProviderProfile | undefined,
  defaultDays: number,
): number {
  const n = profile?.nights_clean_days_after_block;
  if (n != null && Number.isFinite(n)) return Math.max(0, n);
  return defaultDays;
}

export function maxConsecutiveClinicalDays(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  sortedDates: string[],
): number {
  let maxRun = 0;
  let run = 0;
  for (const d of sortedDates) {
    const sh = schedule[d]?.[providerName];
    if (isClinicalShift(sh ?? undefined)) {
      run++;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  return maxRun;
}

export function maxClinicalInRolling7(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  sortedDates: string[],
): number {
  let worst = 0;
  for (let i = 0; i < sortedDates.length; i++) {
    let c = 0;
    for (let j = i; j < sortedDates.length && j < i + 7; j++) {
      const sh = schedule[sortedDates[j]]?.[providerName];
      if (isClinicalShift(sh ?? undefined)) c++;
    }
    worst = Math.max(worst, c);
  }
  return worst;
}

export function circadianRatchetViolations(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  sortedDates: string[],
): ScheduleViolation[] {
  const out: ScheduleViolation[] = [];
  let prevClinicalDate: string | null = null;
  let prevStart: number | null = null;
  for (const d of sortedDates) {
    const sh = schedule[d]?.[providerName];
    if (!isClinicalShift(sh ?? undefined)) {
      prevClinicalDate = null;
      prevStart = null;
      continue;
    }
    const canon = (toCanonicalShift(sh!) ?? sh) as ShiftCode;
    const start = SHIFT_DEFS[canon]?.startHour ?? 0;
    if (prevClinicalDate !== null && prevStart !== null) {
      const prevIdx = sortedDates.indexOf(prevClinicalDate);
      const curIdx = sortedDates.indexOf(d);
      if (curIdx === prevIdx + 1 && start < prevStart) {
        out.push({
          type: "circadian_ratchet",
          provider: providerName,
          date: d,
          shift: sh!,
          message: `Start hour ${start} < previous clinical day ${prevStart}`,
        });
      }
    }
    prevClinicalDate = d;
    prevStart = start;
  }
  return out;
}
