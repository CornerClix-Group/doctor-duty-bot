// ============================================================================
// HardScheduler — mode-aware placement with shared hard-rule enforcement
// ============================================================================

import { SHIFT_CODES } from "./scheduleParser";
import {
  SHIFT_DEFS,
  coverageToDayMode,
  requiredShiftsForDay,
  toCanonicalShift,
  type DayMode,
} from "../../supabase/functions/_shared/shifts.ts";
import {
  type ScheduleViolation,
  type SchedulerProviderProfile,
  isNightShiftToken,
  isClinicalShift,
} from "../../supabase/functions/_shared/schedulerHardRules.ts";
import {
  computeSoftScoresFull,
  type SolverProviderDayCell,
  type SolverProviderRow,
} from "../../supabase/functions/_shared/scheduleSolverCore.ts";
import { runMonthSolve } from "../../supabase/functions/_shared/scheduler/monthSolve.ts";

export interface HardSolveResult {
  success: boolean;
  schedule: ReturnType<HardScheduler["toGeneratedSchedule"]> | null;
  violations: ScheduleViolation[];
  softScores: ReturnType<typeof computeSoftScoresFull>;
  providerTotals: Record<string, {
    worked: number;
    weekends: number;
    nights: number;
    target: number;
    weekend_quota: number;
    night_quota: number;
  }>;
  payPeriodTotals: Record<number, number>;
  warnings: string[];
}

export class HardScheduler {
  providers: any[] = [];
  providerDays: any[] = [];
  coveragePattern: Record<string, number> = {};
  /** Per-date staffing mode (6/7/8); not decremented during preload */
  dayModes: Record<string, DayMode> = {};
  providerRuleProfiles: Record<string, SchedulerProviderProfile> = {};
  mondayFtRuleActive = false;

  schedule: Record<string, Record<string, string | null>> = {};
  providerTotals: Record<string, {
    worked: number;
    weekends: number;
    nights: number;
    target: number;
    weekend_quota: number;
    night_quota: number;
  }> = {};
  payPeriodTotals: Record<number, number> = {};
  warnings: string[] = [];
  violations: ScheduleViolation[] = [];
  assignedShiftsPerDate: Record<string, Set<string>> = {};

  constructor() {}

  setProviderRuleProfiles(profiles: Record<string, SchedulerProviderProfile>) {
    // Normalize keys to lowercase + trimmed so getRuleProfile lookups match
    // regardless of how the caller cased the provider name.
    const normalized: Record<string, SchedulerProviderProfile> = {};
    for (const [name, prof] of Object.entries(profiles || {})) {
      normalized[(name || "").trim().toLowerCase()] = prof;
    }
    this.providerRuleProfiles = normalized;
  }

  getRuleProfile(providerName: string): SchedulerProviderProfile | undefined {
    return this.providerRuleProfiles[(providerName || "").trim().toLowerCase()];
  }

  setMondayFtRuleActive(v: boolean) {
    this.mondayFtRuleActive = v;
  }

  loadProviders(providers: any[]) {
    this.providers = providers;
  }

  setProviderDays(providerDays: any[]) {
    this.providerDays = providerDays;
  }

  setCoveragePattern(pattern: Record<string, number>) {
    this.coveragePattern = { ...pattern };
    this.dayModes = {};
    for (const date of Object.keys(pattern)) {
      this.dayModes[date] = coverageToDayMode(pattern[date]);
      this.schedule[date] = this.schedule[date] || {};
      this.assignedShiftsPerDate[date] = this.assignedShiftsPerDate[date] || new Set();
    }
  }

  preloadAssignments() {
    for (const provider of this.providerDays) {
      const name = provider.name;
      for (const day of provider.days) {
        const date = day.date;
        if (!this.schedule[date]) this.schedule[date] = {};
        if (day.assigned === "OFF") {
          this.schedule[date][name] = "OFF";
          continue;
        }
        if (day.assigned) {
          const canon = (toCanonicalShift(day.assigned) ?? day.assigned) as string;
          const inCatalog =
            !!(SHIFT_DEFS as Record<string, unknown>)[canon] ||
            canon === "C" ||
            canon === "A10" ||
            SHIFT_CODES.has(canon);
          if (inCatalog) {
            this.schedule[date][name] = canon;
            if (!this.assignedShiftsPerDate[date]) {
              this.assignedShiftsPerDate[date] = new Set();
            }
            const slotCode = (toCanonicalShift(canon) ?? canon) as string;
            if (slotCode && slotCode !== "C" && slotCode !== "A10") {
              this.assignedShiftsPerDate[date].add(slotCode);
            }
          }
        }
      }
    }
  }

  private toSolverProviders(): SolverProviderRow[] {
    return this.providers.map((p: any) => ({
      name: p.name,
      active: p.active !== false,
      allowed_shifts: p.allowed_shifts,
      rules: p.rules,
    }));
  }

  private getSolverCell(providerName: string, date: string): SolverProviderDayCell | undefined {
    const provider = this.providerDays.find(
      (p: any) => p.name.trim().toLowerCase() === providerName.trim().toLowerCase(),
    );
    if (!provider) return undefined;
    const day = provider.days.find((d: any) => d.date === date);
    if (!day) return undefined;
    return {
      locked: day.locked,
      assigned: day.assigned ?? null,
      offCode: day.offCode ?? null,
      constraint: day.constraint ?? null,
    };
  }

  getProviderDay(providerName: string, date: string) {
    const provider = this.providerDays.find((p: any) => p.name === providerName);
    if (!provider) throw new Error(`Provider ${providerName} missing in parser output.`);
    const day = provider.days.find((d: any) => d.date === date);
    if (!day) throw new Error(`Missing day record for ${providerName} on ${date}`);
    return day;
  }

  isDateLocked(providerName: string, date: string): boolean {
    const providerDay = this.providerDays.find(
      (p: any) => p.name.trim().toLowerCase() === providerName.trim().toLowerCase(),
    );
    if (!providerDay) return false;
    const day = providerDay.days.find((d: any) => d.date === date);
    return day?.locked === true;
  }

  solve(): HardSolveResult {
    this.violations = [];
    this.warnings = [];
    this.preloadAssignments();

    const dates = Object.keys(this.schedule).sort();
    const profiles = this.providerRuleProfiles;
    const sp = this.toSolverProviders();

    const { violations: genViol, softScores } = runMonthSolve({
      dates,
      dayMode: (d) => this.dayModes[d] ?? coverageToDayMode(this.coveragePattern[d] ?? 8),
      mondayFtRuleActive: this.mondayFtRuleActive,
      schedule: this.schedule,
      assignedByDate: this.assignedShiftsPerDate,
      providers: sp,
      getCell: (name, date) => this.getSolverCell(name, date),
      profiles,
    });
    this.violations.push(...genViol);
    this.computeTotals();
    const success = this.violations.length === 0;
    return {
      success,
      schedule: success ? this.toGeneratedSchedule() : null,
      violations: this.violations,
      softScores,
      providerTotals: this.providerTotals,
      payPeriodTotals: this.payPeriodTotals,
      warnings: this.warnings,
    };
  }

  toGeneratedSchedule() {
    const dates = Object.keys(this.schedule).sort();
    return dates.map((date) => {
      const dow = new Date(date + "T12:00:00").getDay();
      const mode = this.dayModes[date] ?? coverageToDayMode(this.coveragePattern[date] ?? 8);
      const required = requiredShiftsForDay(mode, dow, this.mondayFtRuleActive);
      const assignments: {
        shift: string;
        provider: string;
        locked?: boolean;
        unfilled?: boolean;
      }[] = [];

      for (const shift of required) {
        let provider = "";
        let locked = false;
        for (const p of this.providers) {
          const raw = this.schedule[date]?.[p.name];
          if (!raw || raw === "OFF") continue;
          const canon = (toCanonicalShift(raw) ?? raw) as string;
          if (canon === shift) {
            provider = p.name;
            try {
              const pd = this.getProviderDay(p.name, date);
              locked = !!pd.locked && pd.assigned === raw;
            } catch {
              locked = false;
            }
            break;
          }
        }
        assignments.push({ shift, provider, locked, unfilled: !provider });
      }

      for (const p of this.providers) {
        const raw = this.schedule[date]?.[p.name];
        if (!raw || raw === "OFF") continue;
        const canon = (toCanonicalShift(raw) ?? raw) as string;
        if (canon === "C" || canon === "A10") {
          const exists = assignments.some((a) => a.shift === canon && a.provider === p.name);
          if (!exists) {
            let locked = false;
            try {
              const pd = this.getProviderDay(p.name, date);
              locked = !!pd.locked;
            } catch {
              locked = false;
            }
            assignments.push({ shift: canon, provider: p.name, locked, unfilled: false });
          }
        }
      }

      return {
        date,
        dayOfWeek: dow,
        coverage: mode,
        mode,
        required,
        assignments,
      };
    });
  }

  computeTotals() {
    for (const providerData of this.providerDays) {
      const name = providerData.name;
      this.providerTotals[name] = {
        worked: 0,
        weekends: 0,
        nights: 0,
        target: providerData.target_shifts || 0,
        weekend_quota: providerData.weekend_quota || 0,
        night_quota: providerData.night_quota || 0,
      };
    }

    const dates = Object.keys(this.schedule).sort();
    let ppCounter = 1;
    for (const date of dates) {
      this.payPeriodTotals[ppCounter] = this.payPeriodTotals[ppCounter] || 0;
      for (const providerName in this.schedule[date]) {
        const shift = this.schedule[date][providerName];
        if (isClinicalShift(shift) && shift !== "C" && shift !== "A10") {
          this.providerTotals[providerName].worked += 1;
          const dow = new Date(date + "T12:00:00").getDay();
          if (dow === 0 || dow === 6) {
            this.providerTotals[providerName].weekends += 1;
          }
          if (isNightShiftToken(shift)) {
            this.providerTotals[providerName].nights += 1;
          }
          this.payPeriodTotals[ppCounter] += 1;
        }
      }
      if (ppCounter < 14) ppCounter++;
      else ppCounter = 1;
    }
  }
}
