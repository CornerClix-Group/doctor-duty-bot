/**
 * Shared month placement solver — used by client HardScheduler and edge generate-schedule-v2.
 * Mutates schedule + assignedByDate in place.
 */

import {
  SHIFT_DEFS,
  TIGHTNESS_ORDER,
  creditHours,
  requiredShiftsForDay,
  toCanonicalShift,
  type DayMode,
  type ShiftCode,
} from "./shifts.ts";
import {
  type PlacementCheckContext,
  type ProviderRuleProfile,
  type ScheduleViolation,
  checkPlacement,
  circadianRatchetViolations,
  isClinicalShift,
  isNightShiftToken,
  maxClinicalInRolling7,
  maxConsecutiveClinicalDays,
} from "./schedulerHardRules.ts";

export type { PlacementCheckContext, ProviderRuleProfile };

export interface SolverProviderDayCell {
  locked?: boolean;
  assigned?: string | null;
  offCode?: string | null;
  constraint?: string[] | null;
}

export interface SolverProviderRow {
  name: string;
  active?: boolean;
  allowed_shifts?: string[];
  rules?: { disallowed_shifts?: string[]; saturday_restrictions?: string; sunday_restrictions?: string };
}

export interface RunSolverParams {
  dates: string[];
  dayMode: (d: string) => DayMode;
  mondayFtRuleActive: boolean;
  schedule: Record<string, Record<string, string | null>>;
  assignedByDate: Record<string, Set<string>>;
  providers: SolverProviderRow[];
  getCell: (providerName: string, date: string) => SolverProviderDayCell | undefined;
  profiles: Record<string, ProviderRuleProfile>;
  violations: ScheduleViolation[];
}

function sortSlotsForDay(slots: ShiftCode[]): ShiftCode[] {
  return [...slots].sort(
    (a, b) => TIGHTNESS_ORDER.indexOf(a) - TIGHTNESS_ORDER.indexOf(b),
  );
}

function isProviderOff(cell: SolverProviderDayCell | undefined): boolean {
  if (!cell) return false;
  if (cell.offCode) return true;
  if (cell.assigned === "OFF") return true;
  return false;
}

function legacyAllowed(provider: SolverProviderRow, shift: string, date: string): boolean {
  const allowed = provider.allowed_shifts || [];
  const disallowed = provider.rules?.disallowed_shifts || [];
  if (allowed.length > 0 && !allowed.includes(shift)) return false;
  if (disallowed.includes(shift)) return false;
  const dayOfWeek = new Date(date + "T12:00:00").getDay();
  if (dayOfWeek === 6 && provider.rules?.saturday_restrictions) {
    const sat = provider.rules.saturday_restrictions.split(",").map((s) => s.trim());
    if (!sat.includes(shift) && !sat.includes("all")) return false;
  }
  if (dayOfWeek === 0 && provider.rules?.sunday_restrictions) {
    const sun = provider.rules.sunday_restrictions.split(",").map((s) => s.trim());
    if (!sun.includes(shift) && !sun.includes("all")) return false;
  }
  return true;
}

export function scoreProviderForSlotFixed(
  p: SolverProviderRow,
  schedule: Record<string, Record<string, string | null>>,
  dates: string[],
  date: string,
  slot: ShiftCode,
  profiles: Record<string, ProviderRuleProfile>,
): number {
  const name = p.name;
  const idx = dates.indexOf(date);
  let clinical = 0;
  let calls = 0;
  let wknd = 0;
  for (const d of dates) {
    const s = schedule[d]?.[name];
    if (!s || s === "OFF") continue;
    if (isClinicalShift(s)) clinical++;
    if (s === "C") calls++;
    const dow = new Date(d + "T12:00:00").getDay();
    if ((dow === 0 || dow === 6) && isClinicalShift(s)) wknd++;
  }
  const dow = new Date(date + "T12:00:00").getDay();
  let extendStretch = 0;
  if (idx > 0) {
    const prev = schedule[dates[idx - 1]]?.[name];
    const prev2 = idx > 1 ? schedule[dates[idx - 2]]?.[name] : null;
    if (isClinicalShift(prev) && isClinicalShift(prev2)) {
      extendStretch = 1;
    }
  }
  let nextOffLen = 0;
  for (let j = idx + 1; j < dates.length; j++) {
    const s = schedule[dates[j]]?.[name];
    if (!s || s === "OFF" || !isClinicalShift(s)) {
      let k = j;
      while (k < dates.length) {
        const s2 = schedule[dates[k]]?.[name];
        if (s2 && s2 !== "OFF" && isClinicalShift(s2)) break;
        nextOffLen++;
        k++;
      }
      break;
    }
  }
  let circFlip = 0;
  if (idx > 0) {
    const prevS = schedule[dates[idx - 1]]?.[name];
    if (isClinicalShift(prevS) && isClinicalShift(slot as string)) {
      const c1 = toCanonicalShift(prevS!)!;
      const c2 = toCanonicalShift(slot)!;
      const sh = SHIFT_DEFS[c2]?.startHour ?? 0;
      const sp = SHIFT_DEFS[c1]?.startHour ?? 0;
      if (sh < sp) circFlip = 1;
    }
  }
  /** Prefer continuing an in-progress night block (real roster stability). */
  let nightBlockContinue = 0;
  if (idx > 0 && isNightShiftToken(slot as string)) {
    const prevShift = schedule[dates[idx - 1]]?.[name];
    if (isNightShiftToken(prevShift)) {
      nightBlockContinue = 750;
    }
  }
  return (
    1000 * extendStretch +
    nightBlockContinue +
    500 * Math.min(nextOffLen, 14) -
    300 * circFlip -
    50 * clinical -
    30 * calls -
    20 * ((dow === 0 || dow === 6) ? wknd : 0)
  );
}

export function runPlacementLoop(params: RunSolverParams): void {
  const {
    dates,
    dayMode,
    mondayFtRuleActive,
    schedule,
    assignedByDate,
    providers,
    getCell,
    profiles,
    violations,
  } = params;

  const placementCtx: PlacementCheckContext = {
    dayMode,
    mondayFtRuleActive,
  };

  for (const date of dates) {
    const dow = new Date(date + "T12:00:00").getDay();
    const mode = dayMode(date);
    const required = sortSlotsForDay(requiredShiftsForDay(mode, dow, mondayFtRuleActive));

    for (const slot of required) {
      if (assignedByDate[date]?.has(slot)) continue;

      const candidates = providers
        .filter((p) => p.active !== false)
        .filter((p) => {
          const c = getCell(p.name, date);
          if (!c) return true;
          if (c.constraint && c.constraint.length > 0 && !c.constraint.includes(slot)) {
            return false;
          }
          if (c.locked && c.assigned && c.assigned !== slot) return false;
          if (isProviderOff(c)) return false;
          return true;
        })
        .filter((p) => !schedule[date]?.[p.name] || schedule[date]?.[p.name] === "OFF")
        .map((p) => ({
          provider: p,
          score: scoreProviderForSlotFixed(p, schedule, dates, date, slot, profiles),
        }))
        .filter(({ provider: p }) => {
          const cell = getCell(p.name, date);
          if (cell?.locked && cell.assigned === slot) return true;
          if (!legacyAllowed(p, slot, date)) return false;
          const prof = profiles[p.name.trim().toLowerCase()];
          const v = checkPlacement(
            schedule,
            p.name,
            prof,
            date,
            slot,
            dates,
            placementCtx,
          );
          return v === null;
        })
        .sort((a, b) => b.score - a.score);

      if (candidates.length === 0) {
        violations.push({
          type: "coverage_unfilled",
          date,
          shift: slot,
          message: `No eligible provider for ${slot} on ${date}`,
        });
        continue;
      }

      const pick = candidates[0].provider.name;
      if (!schedule[date]) schedule[date] = {};
      schedule[date][pick] = slot;
      if (!assignedByDate[date]) assignedByDate[date] = new Set();
      assignedByDate[date].add(slot);
    }
  }
}

export function creditForPP(shift: string | null | undefined): number {
  if (!shift || shift === "OFF") return 0;
  if (shift === "L" || shift === "HL" || shift === "LH") return 10;
  return creditHours(shift);
}

function exemptFromGsEightyHourTarget(prof: ProviderRuleProfile | undefined): boolean {
  if (!prof) return false;
  if (prof.requires_80hr_pp === false) return true;
  if ((prof.provider_group || "").toLowerCase() === "military") return true;
  return false;
}

export function fillAdminToHitPPTarget(
  dates: string[],
  schedule: Record<string, Record<string, string | null>>,
  providers: SolverProviderRow[],
  profiles: Record<string, ProviderRuleProfile>,
): void {
  const pp1 = dates.filter((_, i) => i < 14);
  const pp2 = dates.slice(14);

  for (const p of providers) {
    const prof = profiles[p.name.toLowerCase()];
    if (exemptFromGsEightyHourTarget(prof)) continue;

    for (const segment of [pp1, pp2]) {
      if (segment.length === 0) continue;
      let total = 0;
      for (const d of segment) {
        const s = schedule[d]?.[p.name];
        total += creditForPP(s ?? undefined);
      }
      if (total >= 80) continue;
      for (const d of segment) {
        if (total >= 80) break;
        const cur = schedule[d]?.[p.name];
        if (cur && cur !== "OFF") continue;
        const add = Math.min(10, 80 - total);
        if (add <= 0) break;
        if (!schedule[d]) schedule[d] = {};
        schedule[d][p.name] = "A10";
        total += 10;
      }
    }
  }
}

export function applyLeaveCredits(
  dates: string[],
  schedule: Record<string, Record<string, string | null>>,
  getCell: (name: string, d: string) => SolverProviderDayCell | undefined,
  providers: SolverProviderRow[],
  _profiles: Record<string, ProviderRuleProfile>,
): void {
  const pp1 = dates.filter((_, i) => i < 14);
  const pp2 = dates.slice(14);

  for (const p of providers) {
    for (const segment of [pp1, pp2]) {
      if (segment.length === 0) continue;
      const leaveDays: string[] = [];
      for (const d of segment) {
        const c = getCell(p.name, d);
        if (c?.offCode === "L" || c?.offCode === "HL") leaveDays.push(d);
      }
      if (leaveDays.length === 0) continue;

      let nonLeave = 0;
      for (const d of segment) {
        if (leaveDays.includes(d)) continue;
        nonLeave += creditForPP(schedule[d]?.[p.name] ?? undefined);
      }
      let room = Math.max(0, 80 - nonLeave);
      const sortedLeave = [...leaveDays].sort((a, b) => b.localeCompare(a));
      for (const d of sortedLeave) {
        if (!schedule[d]) schedule[d] = {};
        if (room >= 10) {
          room -= 10;
        } else {
          schedule[d][p.name] = "OFF";
        }
      }
    }
  }
}

export function verifyGsEightyHours(
  dates: string[],
  schedule: Record<string, Record<string, string | null>>,
  providers: SolverProviderRow[],
  profiles: Record<string, ProviderRuleProfile>,
): ScheduleViolation[] {
  const out: ScheduleViolation[] = [];
  const pp1 = dates.filter((_, i) => i < 14);
  const pp2 = dates.slice(14);
  for (const p of providers) {
    const prof = profiles[p.name.toLowerCase()];
    if (exemptFromGsEightyHourTarget(prof)) continue;
    for (const segment of [pp1, pp2]) {
      if (segment.length === 0) continue;
      let t = 0;
      for (const d of segment) {
        t += creditForPP(schedule[d]?.[p.name] ?? undefined);
      }
      if (t !== 80) {
        out.push({
          type: "pp_hours_short",
          provider: p.name,
          message: `PP total ${t} ≠ 80 for ${p.name}`,
        });
      }
    }
  }
  return out;
}

export function computeSoftScoresFull(
  schedule: Record<string, Record<string, string | null>>,
  dates: string[],
  providers: SolverProviderRow[],
): {
  isolatedShifts: number;
  circadianFlips: number;
  shiftFairnessVariance: number;
  callFairnessVariance: number;
  weekendFairnessVariance: number;
} {
  let isolated = 0;
  let circFlips = 0;
  const clinicalCounts: number[] = [];
  const callCounts: number[] = [];
  const wkndCounts: number[] = [];

  for (const p of providers) {
    const name = p.name;
    let cCount = 0;
    let callC = 0;
    let wk = 0;
    for (const d of dates) {
      const s = schedule[d]?.[name];
      if (isClinicalShift(s)) cCount++;
      if (s === "C") callC++;
      const dow = new Date(d + "T12:00:00").getDay();
      if ((dow === 0 || dow === 6) && isClinicalShift(s)) wk++;
    }
    clinicalCounts.push(cCount);
    callCounts.push(callC);
    wkndCounts.push(wk);

    for (let i = 0; i < dates.length; i++) {
      const d = dates[i];
      const s = schedule[d]?.[name];
      if (!isClinicalShift(s)) continue;
      const prev = i > 0 ? schedule[dates[i - 1]]?.[name] : null;
      const next = i + 1 < dates.length ? schedule[dates[i + 1]]?.[name] : null;
      const prevOff = !prev || !isClinicalShift(prev);
      const nextOff = !next || !isClinicalShift(next);
      if (prevOff && nextOff) isolated++;
    }
    circFlips += circadianRatchetViolations(schedule, name, dates).length;
  }

  const varOf = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, x) => s + (x - m) * (x - m), 0) / arr.length;
  };

  return {
    isolatedShifts: isolated,
    circadianFlips: circFlips,
    shiftFairnessVariance: varOf(clinicalCounts),
    callFairnessVariance: varOf(callCounts),
    weekendFairnessVariance: varOf(wkndCounts),
  };
}

export function verifyFinalHardRules(
  schedule: Record<string, Record<string, string | null>>,
  dates: string[],
  providers: SolverProviderRow[],
): ScheduleViolation[] {
  const out: ScheduleViolation[] = [];
  for (const p of providers) {
    const name = p.name;
    if (maxConsecutiveClinicalDays(schedule, name, dates) > 4) {
      out.push({
        type: "max_consecutive_clinical",
        provider: name,
        message: "Exceeds 4 consecutive clinical days",
      });
    }
    if (maxClinicalInRolling7(schedule, name, dates) > 4) {
      out.push({
        type: "rolling_7_clinical",
        provider: name,
        message: "Exceeds 4 clinical shifts in a rolling 7-day window",
      });
    }
    out.push(...circadianRatchetViolations(schedule, name, dates));
  }
  return out;
}

/**
 * After placement, every contiguous night run for night_only providers must sit in [min,max].
 */
export function verifyNightBlocksPostPlacement(
  schedule: Record<string, Record<string, string | null>>,
  dates: string[],
  providers: SolverProviderRow[],
  profiles: Record<string, ProviderRuleProfile>,
): ScheduleViolation[] {
  const out: ScheduleViolation[] = [];
  for (const p of providers) {
    const prof = profiles[p.name.trim().toLowerCase()];
    if (!prof?.night_only) continue;
    const minL = prof.night_block_min_length ?? 3;
    const maxL = prof.night_block_max_length ?? 4;
    const name = p.name;
    let i = 0;
    while (i < dates.length) {
      if (!isNightShiftToken(schedule[dates[i]]?.[name])) {
        i++;
        continue;
      }
      let j = i;
      while (j < dates.length && isNightShiftToken(schedule[dates[j]]?.[name])) j++;
      const len = j - i;
      if (len < minL || len > maxL) {
        out.push({
          type: "night_block_length",
          provider: name,
          date: dates[j - 1],
          message: `Final night block length ${len} outside allowed ${minL}-${maxL} (ends ${dates[j - 1]})`,
        });
      }
      i = j;
    }
  }
  return out;
}
