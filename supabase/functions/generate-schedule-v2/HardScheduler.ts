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
      this.normalizeKey(p.name) === this.normalizeKey(providerName)
    );
    if (!providerDay) return false;

    const day = providerDay.days.find((d: any) => d.date === date);
    return day?.locked === true;
  }

  // --------------------------------------------------------------------------
  // MAIN SOLVER - TARGET-AWARE GREEDY WITH MULTI-PASS
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

    const maxPasses = 3; // Limit passes to prevent infinite loops

    // Run multiple passes to fill coverage while considering targets
    for (let pass = 0; pass < maxPasses; pass++) {
      let assignmentsMade = false;

      for (const date of dates) {
        let coverageNeeded = this.coveragePattern[date] || 0;
        if (coverageNeeded <= 0) continue;

        // Get providers sorted by priority (furthest below target = highest priority)
        const eligibleProviders = this.getEligibleProvidersGreedy(date);

        for (const providerInfo of eligibleProviders) {
          if (coverageNeeded <= 0) break;

      const { providerName, provider } = providerInfo;
      
      // Check if in recovery window (unless date is locked)
      if (this.isInRecoveryWindow(providerName, date) && !this.isDateLocked(providerName, date)) {
        continue;
      }
      
      const providerDay = this.getProviderDay(provider.name, date);

          // Skip if already scheduled
          if (this.schedule[date][providerName]) continue;

          // Skip if OFF block
          if (providerDay.assigned === "OFF") continue;

          // Try to assign a shift
          const assigned = this.tryAssignShift(providerName, provider, providerDay, date);
          if (assigned) {
            coverageNeeded--;
            assignmentsMade = true;
          }
        }

        // Update coverage pattern for next pass
        this.coveragePattern[date] = coverageNeeded;
      }

      // If no assignments made in this pass, we're done
      if (!assignmentsMade) break;
    }

    // Check if all coverage is met
    for (const date of dates) {
      if (this.coveragePattern[date] > 0) {
        this.warnings.push(
          `Unable to fill ${this.coveragePattern[date]} shifts on ${date}. Consider relaxing provider constraints.`
        );
      }
    }

    this.computeTotals();
    this.checkTargetDeviations();

    // Transform schedule object into array format expected by frontend
    const scheduleArray = Object.keys(this.schedule).sort().map(date => {
      const assignments = Object.entries(this.schedule[date])
        .filter(([_, shift]) => shift && shift !== "OFF")
        .map(([provider, shift]) => ({
          shift: shift as string,
          provider
        }));
      
      // Calculate pay period (assuming 14-day cycles starting from a base date)
      const dateObj = new Date(date);
      const baseDate = new Date("2026-01-01");
      const daysDiff = Math.floor((dateObj.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      const pay_period = ((Math.floor(daysDiff / 14) + 4) % 14) + 1; // PP5 starts on Jan 1, 2026

      return {
        date,
        pattern: this.coveragePattern[date] || 7,
        pay_period,
        assignments
      };
    });

    return {
      schedule: scheduleArray,
      providerTotals: this.providerTotals,
      payPeriodTotals: this.payPeriodTotals,
      warnings: this.warnings
    };
  }

  // --------------------------------------------------------------------------
  // Try to assign a shift to provider on date
  // --------------------------------------------------------------------------
  tryAssignShift(providerName: string, provider: any, providerDay: any, date: string): boolean {
    const WORK_SHIFTS = new Set(["D1","D2","MIDA","MIDB","E","N","FT W","FT W12","FT AM","FT PM"]);
    
    // Check if in recovery window (unless date is locked)
    if (this.isInRecoveryWindow(providerName, date) && !this.isDateLocked(providerName, date)) {
      return false;
    }
    
    // Get current counts for this provider
    const currentCounts = this.getCurrentCounts(providerName);
    const providerData = this.providerDays.find(p => 
      this.normalizeKey(p.name) === this.normalizeKey(providerName)
    );
    const target = providerData?.target_shifts || 0;
    const weekendQuota = providerData?.weekend_quota || 0;
    const dow = new Date(date).getDay();
    const isWeekend = dow === 0 || dow === 6;

    // Don't overfill if already at or above target (unless needed for coverage)
    if (currentCounts.worked >= target + 1) {
      return false;
    }

    // Try each shift in priority order
    for (const shift of Array.from(SHIFT_CODES)) {
      // Check rest violations
      if (this.violatesRest(providerName, date, shift, provider)) continue;

      // Check eligibility
      if (!this.isShiftAllowed(provider, providerDay, shift, date)) continue;

      // If weekend and already at quota, skip (unless really needed)
      if (isWeekend && WORK_SHIFTS.has(shift) && currentCounts.weekends >= weekendQuota + 1) {
        continue;
      }

      // Assign the shift
      this.schedule[date][providerName] = shift;
      
      // Track night blocks and enforce recovery
      if (this.isNight(shift)) {
        // Provider assigned a night shift - track but don't enforce recovery yet
      } else if (this.wasNightYesterday(providerName, date)) {
        // Block is ending - enforce recovery starting AFTER this date
        this.enforcePostNightBlockRecovery(providerName, date);
      }
      
      return true;
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // Get current shift counts for a provider
  // --------------------------------------------------------------------------
  getCurrentCounts(providerName: string): { worked: number; weekends: number } {
    const WORK_SHIFTS = new Set(["D1","D2","MIDA","MIDB","E","N","FT W","FT W12","FT AM","FT PM"]);
    const counts = { worked: 0, weekends: 0 };
    const dates = Object.keys(this.schedule).sort();

    for (const date of dates) {
      const shift = this.schedule[date][providerName];
      if (shift && shift !== "OFF" && WORK_SHIFTS.has(shift)) {
        counts.worked++;
        const dow = new Date(date).getDay();
        if (dow === 0 || dow === 6) counts.weekends++;
      }
    }

    return counts;
  }

  // --------------------------------------------------------------------------
  // Get eligible providers sorted by priority
  // --------------------------------------------------------------------------
  getEligibleProvidersGreedy(date: string): Array<{ providerName: string; provider: any; priority: number }> {
    const eligible: Array<{ providerName: string; provider: any; priority: number }> = [];

    for (const provider of this.providers) {
      const providerDay = this.getProviderDay(provider.name, date);
      const providerName = providerDay ? 
        this.providerDays.find((p: any) => 
          this.normalizeKey(p.name) === this.normalizeKey(provider.name)
        )?.name || provider.name 
        : provider.name;

      // Skip if already scheduled or OFF
      if (this.schedule[date][providerName]) continue;
      if (providerDay.assigned === "OFF") continue;

      // Check if provider has any eligible shifts
      let hasEligibleShift = false;
      for (const shift of Array.from(SHIFT_CODES)) {
        if (!this.violatesRest(providerName, date, shift, provider) &&
            this.isShiftAllowed(provider, providerDay, shift, date)) {
          hasEligibleShift = true;
          break;
        }
      }
      if (!hasEligibleShift) continue;

      // Calculate priority based on distance from target
      const currentCounts = this.getCurrentCounts(providerName);
      const providerData = this.providerDays.find(p => 
        this.normalizeKey(p.name) === this.normalizeKey(providerName)
      );
      const target = providerData?.target_shifts || 0;
      const weekendQuota = providerData?.weekend_quota || 0;

      // Higher priority = further below target
      const priority = (target - currentCounts.worked) * 10 + (weekendQuota - currentCounts.weekends);

      eligible.push({ providerName, provider, priority });
    }

    // Sort by priority descending
    return eligible.sort((a, b) => b.priority - a.priority);
  }

  // --------------------------------------------------------------------------
  // Check for target deviations and add warnings
  // --------------------------------------------------------------------------
  checkTargetDeviations() {
    for (const providerData of this.providerDays) {
      const name = providerData.name;
      const totals = this.providerTotals[name];
      if (!totals) continue;

      const targetDiff = totals.worked - providerData.target_shifts;
      const quotaDiff = totals.weekends - providerData.weekend_quota;

      if (Math.abs(targetDiff) > 1) {
        this.warnings.push(
          `${name}: Assigned ${totals.worked} shifts vs target ${providerData.target_shifts} (${targetDiff > 0 ? '+' : ''}${targetDiff})`
        );
      }

      if (Math.abs(quotaDiff) > 1) {
        this.warnings.push(
          `${name}: Assigned ${totals.weekends} weekend shifts vs quota ${providerData.weekend_quota} (${quotaDiff > 0 ? '+' : ''}${quotaDiff})`
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // Normalize provider name for matching
  // --------------------------------------------------------------------------
  normalizeKey(name: string): string {
    return name.trim().toLowerCase();
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

  computeTotals() {
    const dates = Object.keys(this.schedule).sort();

    // Build index from Excel provider rows so providers with 0 assignments still show
    const toKey = (s: string) => s.trim().toLowerCase();
    const excelProviders = new Map<string, any>();
    this.providerDays.forEach((p: any) => excelProviders.set(toKey(p.name), p));

    // Initialize totals for every Excel provider
    this.providerTotals = {} as any;
    for (const [, p] of excelProviders) {
      this.providerTotals[p.name] = {
        worked: 0,
        weekends: 0,
        target: p.target_shifts || 0,
        weekend_quota: p.weekend_quota || 0,
      };
    }

    // Classification per business rules
    const WORK_SHIFTS = new Set(["D1","D2","MIDA","MIDB","E","N","FT W","FT W12","FT AM","FT PM"]);

    let ppCounter = 1;
    for (const date of dates) {
      this.payPeriodTotals[ppCounter] = this.payPeriodTotals[ppCounter] || 0;

      const dow = new Date(date).getDay(); // 0=Sun,6=Sat
      const isWeekend = dow === 0 || dow === 6;
      const assignments = this.schedule[date] || {};

      for (const assignedName in assignments) {
        const shift = assignments[assignedName];
        if (!shift || shift === "OFF") continue; // OFF/leave never counts

        // Map to canonical Excel name (preserve display casing from sheet)
        const canonical = Object.keys(this.providerTotals).find(n => toKey(n) === toKey(assignedName)) || assignedName;

        // Pay period totals: count all non-OFF assignments (includes C/A10)
        this.payPeriodTotals[ppCounter] += 1;

        // Worked + weekend counts: ONLY real work shifts (exclude C/A10)
        if (WORK_SHIFTS.has(shift)) {
          this.providerTotals[canonical].worked += 1;
          if (isWeekend) this.providerTotals[canonical].weekends += 1;
        }
      }

      // bump PP counter every 14 days
      if (ppCounter < 14) ppCounter++; else ppCounter = 1;
    }
  }
}
