// ============================================================================
// HardScheduler.ts — COMPLETE REWRITE FOR MEDICAL-GRADE SCHEDULING
// Supports:
//   - Preassigned shifts
//   - OFF blocks (X/L/LH)
//   - Constraint overrides (Option A)
//   - Off allowed by default (Option 2)
//   - Coverage patterns
//   - Provider-specific rules
//   - Rest-hour protection
//   - Night recovery
//   - Deterministic assignment
// ============================================================================

import { SHIFT_CODES } from "./scheduleParser.ts";

export class HardScheduler {
  providers: any[] = [];
  providerDays: any[] = [];  // per-provider per-date instructions
  coveragePattern: Record<string, number> = {}; // e.g., { "2026-01-01": 7 }

  schedule: Record<string, Record<string, string | null>> = {}; 
  providerTotals: Record<string, { worked: number; weekends: number; target: number; weekend_quota: number }> = {};
  payPeriodTotals: Record<number, number> = {};
  warnings: string[] = [];

  constructor() {}

  // --------------------------------------------------------------------------
  // LOAD PROVIDERS (merged with constraints)
  // --------------------------------------------------------------------------
  loadProviders(providers: any[]) {
    this.providers = providers;
  }

  // --------------------------------------------------------------------------
  // LOAD PROVIDER DAYS extracted from parser
  // --------------------------------------------------------------------------
  setProviderDays(providerDays: any[]) {
    this.providerDays = providerDays;
  }

  // --------------------------------------------------------------------------
  // SET COVERAGE PATTERN PER DATE
  // --------------------------------------------------------------------------
  setCoveragePattern(pattern: Record<string, number>) {
    this.coveragePattern = pattern;

    // initialize schedule object for each date
    Object.keys(pattern).forEach(date => {
      this.schedule[date] = {};
    });
  }

  // --------------------------------------------------------------------------
  // PRELOAD FIXED ASSIGNMENTS (from parser)
  // This consumes coverage capacity before scheduling.
  // --------------------------------------------------------------------------
  preloadAssignments() {
    for (let provider of this.providerDays) {
      const name = provider.name;

      for (let day of provider.days) {
        const date = day.date;

        // OFF block
        if (day.assigned === "OFF") {
          this.schedule[date][name] = "OFF";
          continue;
        }

        // Preassigned real shift (like D1, A10...)
        if (day.assigned && SHIFT_CODES.has(day.assigned)) {
          this.schedule[date][name] = day.assigned;

          // reduce coverage requirement
          if (this.coveragePattern[date] > 0) {
            this.coveragePattern[date] -= 1;
          }

          continue;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // CHECK IF SHIFT IS ALLOWED FOR PROVIDER ON A GIVEN DATE
  // Handles:
  //   - Constraint overrides (Option A)
  //   - Provider allowed_shifts
  //   - Provider disallowed_shifts
  //   - Weekend restrictions
  //   - OFF always allowed
  // --------------------------------------------------------------------------
  isShiftAllowed(provider: any, providerDay: any, shift: string, date: string): boolean {

    const constraint = providerDay.constraint;  // array of allowed shifts OR "OFF"

    // If constraint exists (Option A): override all rules except OFF
    if (constraint) {
      if (shift === "OFF") return true;
      return constraint.includes(shift);
    }

    // OFF always allowed (Option 2)
    if (shift === "OFF") return true;

    // Normal rules apply...
    const allowed = provider.allowed_shifts || [];
    const disallowed = provider.rules?.disallowed_shifts || [];

    if (allowed.length > 0 && !allowed.includes(shift)) return false;
    if (disallowed.includes(shift)) return false;

    // Weekend restrictions
    const dayOfWeek = new Date(date).getDay(); // 0=Sun,6=Sat
    if (dayOfWeek === 6 && provider.rules?.saturday_restrictions) {
      const sat = provider.rules.saturday_restrictions.split(",").map((s: string) => s.trim());
      if (!sat.includes(shift) && !sat.includes("all")) return false;
    }
    if (dayOfWeek === 0 && provider.rules?.sunday_restrictions) {
      const sun = provider.rules.sunday_restrictions.split(",").map((s: string) => s.trim());
      if (!sun.includes(shift) && !sun.includes("all")) return false;
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // CHECK REST HOURS + NIGHT RECOVERY
  // --------------------------------------------------------------------------
  violatesRest(providerName: string, date: string, shift: string, provider: any): boolean {
    // Option A + your rules: preassigned shifts already validated before scheduling;
    // rest-hour enforcement applies only during generation.
    // Implement minimal rest-hour protection:

    // Find previous date assignment
    const prevDate = this.getPreviousDate(date);
    if (!prevDate) return false;

    const prevShift = this.schedule[prevDate]?.[providerName];
    if (!prevShift || prevShift === "OFF") return false;

    // naive rest-hour block:
    if (prevShift === "N" && ["D1","D2","MIDA","MIDB","FT AM"].includes(shift)) {
      return true;
    }

    return false;
  }

  getPreviousDate(date: string): string | null {
    const keys = Object.keys(this.schedule).sort();
    const i = keys.indexOf(date);
    if (i <= 0) return null;
    return keys[i - 1];
  }

  // --------------------------------------------------------------------------
  // MAIN SOLVER
  // --------------------------------------------------------------------------
  solve() {
    // preload fixed assignments
    this.preloadAssignments();

    const dates = Object.keys(this.schedule).sort();

    for (let date of dates) {
      let coverageNeeded = this.coveragePattern[date] || 0;

      if (coverageNeeded <= 0) continue; // all covered by preassignments

      for (let provider of this.providers) {
        if (coverageNeeded <= 0) break;

        const providerDay = this.getProviderDay(provider.name, date);
        // Use the name from providerDay (Excel) for consistency
        const providerName = providerDay ? 
          this.providerDays.find((p: any) => 
            p.name.trim().toLowerCase() === provider.name.trim().toLowerCase()
          )?.name || provider.name 
          : provider.name;

        // Already scheduled due to preassignment?
        if (this.schedule[date][providerName]) continue;

        // OFF block?
        if (providerDay.assigned === "OFF") continue;

        // Try assigning each shift
        for (let shift of SHIFT_CODES) {
          // rest-hour check
          if (this.violatesRest(providerName, date, shift, provider))
            continue;

          // rule/constraint eligibility
          if (!this.isShiftAllowed(provider, providerDay, shift, date))
            continue;

          // assign
          this.schedule[date][providerName] = shift;
          coverageNeeded -= 1;
          break;
        }
      }

      // If coverage still not met — fail hard
      if (coverageNeeded > 0) {
        throw new Error(
          `Cannot satisfy coverage for date ${date}. Remaining unmet: ${coverageNeeded}`
        );
      }
    }

    this.computeTotals();
    return {
      schedule: this.schedule,
      providerTotals: this.providerTotals,
      payPeriodTotals: this.payPeriodTotals,
      warnings: this.warnings
    };
  }

  // --------------------------------------------------------------------------
  // UTILITY: find the providerDay entry
  // --------------------------------------------------------------------------
  getProviderDay(providerName: string, date: string) {
    const provider = this.providerDays.find((p: any) => 
      p.name.trim().toLowerCase() === providerName.trim().toLowerCase()
    );
    if (!provider) throw new Error(`Provider ${providerName} missing in parser output.`);

    const day = provider.days.find((d: any) => d.date === date);
    if (!day) throw new Error(`Missing day record for ${providerName} on ${date}`);

    return day;
  }

  // --------------------------------------------------------------------------
  // COMPUTE TOTALS (per provider + per pay period)
  // --------------------------------------------------------------------------
  computeTotals() {
    // Initialize totals using provider names from schedule (Excel format)
    const dates = Object.keys(this.schedule).sort();
    
    // Collect all unique provider names from the schedule
    const scheduleProviderNames = new Set<string>();
    dates.forEach(date => {
      Object.keys(this.schedule[date]).forEach(name => scheduleProviderNames.add(name));
    });

    // Initialize provider totals with full structure
    scheduleProviderNames.forEach(name => {
      // Find the provider in providerDays to get target and quota
      const providerData = this.providerDays.find((p: any) => 
        p.name.trim().toLowerCase() === name.trim().toLowerCase()
      );
      
      this.providerTotals[name] = {
        worked: 0,
        weekends: 0,
        target: providerData?.target_shifts || 0,
        weekend_quota: providerData?.weekend_quota || 0
      };
    });

    let ppCounter = 1;
    for (let date of dates) {
      this.payPeriodTotals[ppCounter] = this.payPeriodTotals[ppCounter] || 0;
      
      // Check if date is a weekend (0=Sunday, 6=Saturday)
      const dayOfWeek = new Date(date).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      for (let providerName in this.schedule[date]) {
        const shift = this.schedule[date][providerName];
        if (shift && shift !== "OFF") {
          this.providerTotals[providerName].worked += 1;
          this.payPeriodTotals[ppCounter] += 1;
          
          // Count weekend shifts
          if (isWeekend) {
            this.providerTotals[providerName].weekends += 1;
          }
        }
      }

      // bump PP counter every 14 days
      if (ppCounter < 14) ppCounter++;
      else ppCounter = 1;
    }
  }
}
