/**
 * Bundled month solve — shared by client HardScheduler and edge generate-schedule-v2.
 */

import type { DayMode } from "../shifts.ts";
import {
  applyLeaveCredits,
  computeSoftScoresFull,
  fillAdminToHitPPTarget,
  runPlacementLoop,
  verifyFinalHardRules,
  verifyGsEightyHours,
  verifyNightBlocksPostPlacement,
  type SolverProviderDayCell,
  type SolverProviderRow,
} from "../scheduleSolverCore.ts";
import type { ProviderRuleProfile, ScheduleViolation } from "../schedulerHardRules.ts";

export interface MonthSolveInput {
  dates: string[];
  dayMode: (d: string) => DayMode;
  mondayFtRuleActive: boolean;
  schedule: Record<string, Record<string, string | null>>;
  assignedByDate: Record<string, Set<string>>;
  providers: SolverProviderRow[];
  getCell: (providerName: string, date: string) => SolverProviderDayCell | undefined;
  profiles: Record<string, ProviderRuleProfile>;
}

export interface MonthSolveResult {
  violations: ScheduleViolation[];
  softScores: ReturnType<typeof computeSoftScoresFull>;
}

export function runMonthSolve(input: MonthSolveInput): MonthSolveResult {
  const violations: ScheduleViolation[] = [];
  const {
    dates,
    dayMode,
    mondayFtRuleActive,
    schedule,
    assignedByDate,
    providers,
    getCell,
    profiles: profilesRaw,
  } = input;

  const profiles: Record<string, ProviderRuleProfile> = {};
  for (const [k, v] of Object.entries(profilesRaw)) {
    profiles[k.trim().toLowerCase()] = v;
  }

  runPlacementLoop({
    dates,
    dayMode,
    mondayFtRuleActive,
    schedule,
    assignedByDate,
    providers,
    getCell,
    profiles,
    violations,
  });

  fillAdminToHitPPTarget(dates, schedule, providers, profiles);
  applyLeaveCredits(dates, schedule, getCell, providers, profiles);

  violations.push(...verifyFinalHardRules(schedule, dates, providers));
  violations.push(...verifyNightBlocksPostPlacement(schedule, dates, providers, profiles));
  violations.push(...verifyGsEightyHours(dates, schedule, providers, profiles));

  const softScores = computeSoftScoresFull(schedule, dates, providers);
  return { violations, softScores };
}
