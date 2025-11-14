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

import { SHIFT_CODES } from "./scheduleParser";

export class HardScheduler {
  providers: any[] = [];
  providerDays: any[] = [];  // per-provider per-date instructions
  coveragePattern: Record<string, number> = {}; // e.g., { "2026-01-01": 7 }

  schedule: Record<string, Record<string, string | null>> = {}; 
  providerTotals: Record<string, number> = {};
  payPeriodTotals: Record<number, number> = {};
  warnings: string[] = [];
  
  // Night block recovery tracking
  recoveryWindows: Map<string, Set<string>> = new Map(); // providerName -> Set of dates in recovery

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
  // NIGHT BLOCK RECOVERY HELPERS
  // --------------------------------------------------------------------------
  
  isNight(shift: string | null | undefined): boolean {
    return shift === "N";
  }

  wasNightYesterday(providerName: string, date: string): boolean {
    const prevDate = this.getPreviousDate(date);
    if (!prevDate) return false;
    const prevShift = this.schedule[prevDate]?.[providerName];
    return this.isNight(prevShift);
  }

  isBlockEnding(providerName: string, date: string, currentShift: string): boolean {
    // Block ends when:
    // - Yesterday was N
    // - Today is NOT N
    const yesterday = this.getPreviousDate(date);
    if (!yesterday) return false;
    
    const yesterdayShift = this.schedule[yesterday]?.[providerName];
    return this.isNight(yesterdayShift) && !this.isNight(currentShift);
  }

  getRequiredRecoveryDays(providerName: string): number {
    // David Coffin requires 4 days, others require 2
    return providerName === "David Coffin" ? 4 : 2;
  }

  enforcePostNightBlockRecovery(providerName: string, blockEndDate: string) {
    const recoveryDays = this.getRequiredRecoveryDays(providerName);
    const dates = Object.keys(this.schedule).sort();
    const endIndex = dates.indexOf(blockEndDate);
    
    if (endIndex === -1) return;

    // Initialize recovery set for this provider
    if (!this.recoveryWindows.has(providerName)) {
      this.recoveryWindows.set(providerName, new Set());
    }
    const recoverySet = this.recoveryWindows.get(providerName)!;

    // Mark next recoveryDays as recovery period
    for (let i = 1; i <= recoveryDays && endIndex + i < dates.length; i++) {
      recoverySet.add(dates[endIndex + i]);
    }
  }

  isInRecoveryWindow(providerName: string, date: string): boolean {
    const recoverySet = this.recoveryWindows.get(providerName);
    return recoverySet ? recoverySet.has(date) : false;
  }

  isDateLocked(providerName: string, date: string): boolean {
    const providerDay = this.providerDays.find((p: any) => 
      p.name.trim().toLowerCase() === providerName.trim().toLowerCase()
    );
    if (!providerDay) return false;

    const day = providerDay.days.find((d: any) => d.date === date);
    return day?.locked === true;
  }

  // --------------------------------------------------------------------------
  // MAIN SOLVER
  // --------------------------------------------------------------------------
  solve() {
    // preload fixed assignments
    this.preloadAssignments();
    
    // Scan preassigned shifts to detect and enforce existing night block recoveries
    const dates = Object.keys(this.schedule).sort();
    for (const providerData of this.providerDays) {
      const providerName = providerData.name;
      
      for (let i = 0; i < dates.length; i++) {
        const date = dates[i];
        const shift = this.schedule[date]?.[providerName];
        
        // Check if a night block is ending
        if (shift && !this.isNight(shift) && this.wasNightYesterday(providerName, date)) {
          this.enforcePostNightBlockRecovery(providerName, date);
        }
      }
    }

    for (let date of dates) {
      let coverageNeeded = this.coveragePattern[date] || 0;

      if (coverageNeeded <= 0) continue; // all covered by preassignments

      for (let provider of this.providers) {
        if (coverageNeeded <= 0) break;

        const providerDay = this.getProviderDay(provider.name, date);

        // Already scheduled due to preassignment?
        if (this.schedule[date][provider.name]) continue;

        // OFF block?
        if (providerDay.assigned === "OFF") continue;

        // Check if in recovery window (unless date is locked)
        if (this.isInRecoveryWindow(provider.name, date) && !this.isDateLocked(provider.name, date)) {
          continue;
        }

        // Try assigning each shift
        for (let shift of SHIFT_CODES) {
          // rest-hour check
          if (this.violatesRest(provider.name, date, shift, provider))
            continue;

          // rule/constraint eligibility
          if (!this.isShiftAllowed(provider, providerDay, shift, date))
            continue;

          // assign
          this.schedule[date][provider.name] = shift;
          
          // Track night blocks and enforce recovery
          if (this.isNight(shift)) {
            // Provider assigned a night shift - track but don't enforce recovery yet
          } else if (this.wasNightYesterday(provider.name, date)) {
            // Block is ending - enforce recovery starting AFTER this date
            this.enforcePostNightBlockRecovery(provider.name, date);
          }
          
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
    const provider = this.providerDays.find((p: any) => p.name === providerName);
    if (!provider) throw new Error(`Provider ${providerName} missing in parser output.`);

    const day = provider.days.find((d: any) => d.date === date);
    if (!day) throw new Error(`Missing day record for ${providerName} on ${date}`);

    return day;
  }

  // --------------------------------------------------------------------------
  // COMPUTE TOTALS (per provider + per pay period)
  // --------------------------------------------------------------------------
  computeTotals() {
    const providers = this.providers.map(p => p.name);

    providers.forEach(name => {
      this.providerTotals[name] = 0;
    });

    const dates = Object.keys(this.schedule).sort();

    let ppCounter = 1;
    for (let date of dates) {
      this.payPeriodTotals[ppCounter] = this.payPeriodTotals[ppCounter] || 0;

      for (let providerName in this.schedule[date]) {
        const shift = this.schedule[date][providerName];
        if (shift && shift !== "OFF") {
          this.providerTotals[providerName] += 1;
          this.payPeriodTotals[ppCounter] += 1;
        }
      }

      // bump PP counter every 14 days
      if (ppCounter < 14) ppCounter++;
      else ppCounter = 1;
    }
  }
}
