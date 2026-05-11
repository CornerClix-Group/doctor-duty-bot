/**
 * Shared scheduling rule helpers — client HardScheduler and edge solver alignment.
 */

import {
  REGULAR_SHIFTS,
  SHIFT_DEFS,
  requiredShiftsForDay,
  shiftStartHour,
  toCanonicalShift,
  type DayMode,
  type ShiftCode,
  type ShiftDef,
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
  sat_no_start_after_hour?: number | null;
  sun_no_start_before_hour?: number | null;
  avoid_sunday?: boolean | null;
}

/** @alias */
export type ProviderRuleProfile = SchedulerProviderProfile;

export interface PlacementCheckContext {
  dayMode: (date: string) => DayMode;
  mondayFtRuleActive: boolean;
  shiftDefs?: Record<string, ShiftDef>;
  shiftAliases?: Record<string, ShiftCode>;
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

export function weekendTimeWindowAllows(
  profile: SchedulerProviderProfile | undefined,
  shift: string,
  dayOfWeek: number,
): boolean {
  if (!profile) return true;
  if (dayOfWeek !== 0 && dayOfWeek !== 6) return true;
  const startHour = shiftStartHour(shift);
  if (startHour == null) return true;
  if (dayOfWeek === 6) {
    const cap = profile.sat_no_start_after_hour;
    if (cap != null && Number.isFinite(cap) && startHour > cap) return false;
  } else {
    const floor = profile.sun_no_start_before_hour;
    if (floor != null && Number.isFinite(floor) && startHour < floor) return false;
  }
  return true;
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

function trialSchedule(
  schedule: Record<string, Record<string, string | null>>,
  date: string,
  providerName: string,
  shift: ShiftCode,
): Record<string, Record<string, string | null>> {
  const row = { ...(schedule[date] || {}), [providerName]: shift };
  return { ...schedule, [date]: row };
}

function consecutiveNightsEndingAt(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  dates: string[],
  endIdx: number,
): number {
  let n = 0;
  for (let i = endIdx; i >= 0; i--) {
    const s = schedule[dates[i]]?.[providerName];
    if (isNightShiftToken(s)) n++;
    else break;
  }
  return n;
}

function lastCompletedNightBlockLastNightIdx(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  dates: string[],
  beforeIdx: number,
): number {
  let i = beforeIdx - 1;
  let lastN = -1;
  while (i >= 0) {
    if (isNightShiftToken(schedule[dates[i]]?.[providerName])) {
      lastN = i;
      break;
    }
    i--;
  }
  if (lastN < 0) return -1;
  let j = lastN;
  while (j > 0 && isNightShiftToken(schedule[dates[j - 1]]?.[providerName])) j--;
  return lastN;
}

function nightCleanWindowViolation(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  date: string,
  shift: ShiftCode,
  dates: string[],
  prof: SchedulerProviderProfile,
): ScheduleViolation | null {
  if (!prof.night_only || !isNightShiftToken(shift)) return null;
  const cleanN = prof.nights_clean_days_after_block ?? 3;
  const idx = dates.indexOf(date);
  if (idx <= 0) return null;
  const continuing = isNightShiftToken(schedule[dates[idx - 1]]?.[providerName]);
  if (continuing) return null;
  const lastNIdx = lastCompletedNightBlockLastNightIdx(schedule, providerName, dates, idx);
  if (lastNIdx < 0) return null;
  const firstAfter = lastNIdx + 1;
  if (idx >= firstAfter && idx < firstAfter + cleanN) {
    return {
      type: "nights_clean_window",
      provider: providerName,
      date,
      shift,
      message: `Night within ${cleanN}-day clean window after prior block`,
    };
  }
  return null;
}

function nightBlockLengthViolation(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  date: string,
  shift: ShiftCode,
  dates: string[],
  prof: SchedulerProviderProfile,
): ScheduleViolation | null {
  if (!prof.night_only || !isNightShiftToken(shift)) return null;
  const minL = prof.night_block_min_length ?? 3;
  const maxL = prof.night_block_max_length ?? 4;
  const idx = dates.indexOf(date);
  const yN = idx > 0 && isNightShiftToken(schedule[dates[idx - 1]]?.[providerName]);
  const nBefore = yN ? consecutiveNightsEndingAt(schedule, providerName, dates, idx - 1) : 0;
  const streakAfter = nBefore + 1;

  if (!yN && minL >= 3 && streakAfter < minL) {
    if (idx + (minL - streakAfter) > dates.length) {
      return {
        type: "night_block_length",
        provider: providerName,
        date,
        shift,
        message: `Cannot complete minimum ${minL}-night block before month end`,
      };
    }
  }

  if (streakAfter > maxL) {
    return {
      type: "night_block_length",
      provider: providerName,
      date,
      shift,
      message: `Would exceed max night block ${maxL}`,
    };
  }
  return null;
}

/**
 * Returns null if (provider, date, shift) is legal under hard rules given current schedule.
 */
export function checkPlacement(
  schedule: Record<string, Record<string, string | null>>,
  providerName: string,
  profile: ProviderRuleProfile | undefined,
  date: string,
  shift: ShiftCode,
  dates: string[],
  context: PlacementCheckContext,
): ScheduleViolation | null {
  const defs = context.shiftDefs ?? SHIFT_DEFS;

  if (!isShiftEligibleForProfile(profile, shift)) {
    return {
      type: "eligibility",
      provider: providerName,
      date,
      shift,
      message: `Shift ${shift} not eligible for this provider profile`,
    };
  }

  const dow = new Date(date + "T12:00:00").getDay();

  // Weekend time-of-day window (Arnett-style hard rule):
  //   Sat: ban shifts starting AFTER sat_no_start_after_hour
  //   Sun: ban shifts starting BEFORE sun_no_start_before_hour
  if (!weekendTimeWindowAllows(profile, shift, dow)) {
    return {
      type: "eligibility",
      provider: providerName,
      date,
      shift,
      message: `Shift ${shift} violates ${providerName}'s weekend time-of-day window`,
    };
  }

  const mode = context.dayMode(date);
  const req = requiredShiftsForDay(mode, dow, context.mondayFtRuleActive);
  if (!req.includes(shift)) {
    return {
      type: "eligibility",
      provider: providerName,
      date,
      shift,
      message: `Shift ${shift} not in required set for mode ${mode} (weekday ${dow})`,
    };
  }

  const row = schedule[date] || {};
  for (const [p, s] of Object.entries(row)) {
    if (s === shift && p !== providerName) {
      return {
        type: "eligibility",
        provider: providerName,
        date,
        shift,
        message: `${shift} already assigned to ${p} on ${date}`,
      };
    }
  }

  const existing = row[providerName];
  if (existing && existing !== "OFF" && existing !== shift) {
    return {
      type: "eligibility",
      provider: providerName,
      date,
      message: `Provider already assigned ${existing} on ${date}`,
    };
  }

  const trial = trialSchedule(schedule, date, providerName, shift);

  if (maxConsecutiveClinicalDays(trial, providerName, dates) > 4) {
    return {
      type: "max_consecutive_clinical",
      provider: providerName,
      date,
      shift,
      message: "Would exceed 4 consecutive clinical days",
    };
  }

  if (maxClinicalInRolling7(trial, providerName, dates) > 4) {
    return {
      type: "rolling_7_clinical",
      provider: providerName,
      date,
      shift,
      message: "Would exceed 4 clinical shifts in a 7-day window",
    };
  }

  const idx = dates.indexOf(date);
  if (idx > 0) {
    const prevD = dates[idx - 1];
    const prevS = trial[prevD]?.[providerName];
    if (isClinicalShift(prevS) && isClinicalShift(shift)) {
      const cPrev = (toCanonicalShift(prevS!) ?? prevS!) as ShiftCode;
      const cNew = (toCanonicalShift(shift) ?? shift) as ShiftCode;
      const startP = defs[cPrev]?.startHour ?? 0;
      const startN = defs[cNew]?.startHour ?? 0;
      if (startN < startP) {
        return {
          type: "circadian_ratchet",
          provider: providerName,
          date,
          shift,
          message: `Circadian: start ${startN} < previous ${startP}`,
        };
      }
    }
  }

  if (profile?.night_only && isNightShiftToken(shift)) {
    const nc = nightCleanWindowViolation(schedule, providerName, date, shift, dates, profile);
    if (nc) return nc;
    const nb = nightBlockLengthViolation(schedule, providerName, date, shift, dates, profile);
    if (nb) return nb;
    if (profile.monthly_max_nights != null) {
      let nightN = 0;
      for (const d of dates) {
        if (isNightShiftToken(trial[d]?.[providerName])) nightN++;
      }
      if (nightN > profile.monthly_max_nights) {
        return {
          type: "monthly_max_nights",
          provider: providerName,
          date,
          shift,
          message: `Monthly night cap ${profile.monthly_max_nights} exceeded`,
        };
      }
    }
  }

  return null;
}
