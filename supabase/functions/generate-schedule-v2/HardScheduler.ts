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
  // MAIN SOLVER - BACKTRACKING WITH TARGET ENFORCEMENT
  // --------------------------------------------------------------------------
  solve() {
    // preload fixed assignments
    this.preloadAssignments();

    // Count preassigned shifts for each provider
    const currentCounts = this.getInitialCounts();
    
    // Build list of unfilled slots (date, slot_index)
    const unfilledSlots = this.buildUnfilledSlots();
    
    // Attempt backtracking assignment
    const success = this.backtrack(unfilledSlots, 0, currentCounts);
    
    if (!success) {
      throw new Error("Cannot find valid assignment that meets all targets and coverage requirements");
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
  // Get initial counts from preassigned shifts
  // --------------------------------------------------------------------------
  getInitialCounts(): Map<string, { worked: number; weekends: number }> {
    const counts = new Map<string, { worked: number; weekends: number }>();
    const WORK_SHIFTS = new Set(["D1","D2","MIDA","MIDB","E","N","FT W","FT W12","FT AM","FT PM"]);
    
    // Initialize all providers from Excel
    this.providerDays.forEach(p => {
      counts.set(this.normalizeKey(p.name), { worked: 0, weekends: 0 });
    });

    // Count preassigned shifts
    const dates = Object.keys(this.schedule).sort();
    for (const date of dates) {
      const dow = new Date(date).getDay();
      const isWeekend = dow === 0 || dow === 6;
      
      for (const providerName in this.schedule[date]) {
        const shift = this.schedule[date][providerName];
        if (shift && shift !== "OFF" && WORK_SHIFTS.has(shift)) {
          const key = this.normalizeKey(providerName);
          const count = counts.get(key);
          if (count) {
            count.worked++;
            if (isWeekend) count.weekends++;
          }
        }
      }
    }
    
    return counts;
  }

  // --------------------------------------------------------------------------
  // Build list of unfilled coverage slots
  // --------------------------------------------------------------------------
  buildUnfilledSlots(): Array<{ date: string; remaining: number }> {
    const slots: Array<{ date: string; remaining: number }> = [];
    const dates = Object.keys(this.schedule).sort();
    
    for (const date of dates) {
      const needed = this.coveragePattern[date] || 0;
      if (needed > 0) {
        slots.push({ date, remaining: needed });
      }
    }
    
    return slots;
  }

  // --------------------------------------------------------------------------
  // Backtracking recursive solver
  // --------------------------------------------------------------------------
  backtrack(
    slots: Array<{ date: string; remaining: number }>,
    slotIndex: number,
    currentCounts: Map<string, { worked: number; weekends: number }>
  ): boolean {
    // Base case: all slots filled
    if (slotIndex >= slots.length) {
      // Verify all targets met
      return this.verifyTargetsMet(currentCounts);
    }

    const slot = slots[slotIndex];
    const { date, remaining } = slot;

    // If this date's coverage is fully met, move to next slot
    if (remaining <= 0) {
      return this.backtrack(slots, slotIndex + 1, currentCounts);
    }

    // Try assigning each eligible provider
    const eligibleProviders = this.getEligibleProviders(date, currentCounts);
    
    for (const provider of eligibleProviders) {
      const providerName = provider.excelName;
      const providerData = provider.data;
      
      // Try each possible shift
      const possibleShifts = this.getPossibleShifts(providerData, date, providerName);
      
      for (const shift of possibleShifts) {
        // Make assignment
        this.schedule[date][providerName] = shift;
        
        // Update counts
        const key = this.normalizeKey(providerName);
        const count = currentCounts.get(key)!;
        const dow = new Date(date).getDay();
        const isWeekend = dow === 0 || dow === 6;
        const WORK_SHIFTS = new Set(["D1","D2","MIDA","MIDB","E","N","FT W","FT W12","FT AM","FT PM"]);
        
        if (WORK_SHIFTS.has(shift)) {
          count.worked++;
          if (isWeekend) count.weekends++;
        }
        
        // Update slot remaining
        slot.remaining--;
        
        // Recurse
        const success = this.backtrack(slots, slotIndex, currentCounts);
        
        if (success) return true;
        
        // Backtrack: undo assignment
        delete this.schedule[date][providerName];
        if (WORK_SHIFTS.has(shift)) {
          count.worked--;
          if (isWeekend) count.weekends--;
        }
        slot.remaining++;
      }
    }

    return false; // No valid assignment found
  }

  // --------------------------------------------------------------------------
  // Get eligible providers for a date, sorted by priority
  // --------------------------------------------------------------------------
  getEligibleProviders(date: string, currentCounts: Map<string, { worked: number; weekends: number }>): Array<{ excelName: string; data: any; priority: number }> {
    const eligible: Array<{ excelName: string; data: any; priority: number }> = [];
    
    for (const provider of this.providers) {
      const providerDay = this.getProviderDay(provider.name, date);
      const excelName = providerDay ? 
        this.providerDays.find((p: any) => 
          this.normalizeKey(p.name) === this.normalizeKey(provider.name)
        )?.name || provider.name 
        : provider.name;

      // Skip if already scheduled
      if (this.schedule[date][excelName]) continue;

      // Skip if OFF block
      if (providerDay.assigned === "OFF") continue;

      // Check if provider can work on this date (has eligible shifts)
      const possibleShifts = this.getPossibleShifts(provider, date, excelName);
      if (possibleShifts.length === 0) continue;

      // Calculate priority (providers below target get higher priority)
      const excelProviderData = this.providerDays.find(p => this.normalizeKey(p.name) === this.normalizeKey(excelName));
      const target = excelProviderData?.target_shifts || 0;
      const weekendQuota = excelProviderData?.weekend_quota || 0;
      const count = currentCounts.get(this.normalizeKey(excelName))!;
      
      // Priority: negative number = how far below target (higher = more priority)
      const priority = (target - count.worked) * 10 + (weekendQuota - count.weekends);
      
      eligible.push({ excelName, data: provider, priority });
    }

    // Sort by priority (descending)
    return eligible.sort((a, b) => b.priority - a.priority);
  }

  // --------------------------------------------------------------------------
  // Get possible shifts for provider on date
  // --------------------------------------------------------------------------
  getPossibleShifts(provider: any, date: string, providerName: string): string[] {
    const providerDay = this.getProviderDay(providerName, date);
    const possible: string[] = [];

    for (const shift of Array.from(SHIFT_CODES)) {
      // Check rest violations
      if (this.violatesRest(providerName, date, shift, provider)) continue;

      // Check eligibility
      if (!this.isShiftAllowed(provider, providerDay, shift, date)) continue;

      possible.push(shift);
    }

    return possible;
  }

  // --------------------------------------------------------------------------
  // Verify all providers met their targets
  // --------------------------------------------------------------------------
  verifyTargetsMet(currentCounts: Map<string, { worked: number; weekends: number }>): boolean {
    for (const providerData of this.providerDays) {
      const key = this.normalizeKey(providerData.name);
      const count = currentCounts.get(key)!;
      const target = providerData.target_shifts || 0;
      const weekendQuota = providerData.weekend_quota || 0;

      // Allow ±1 tolerance for targets
      if (Math.abs(count.worked - target) > 1) return false;
      if (Math.abs(count.weekends - weekendQuota) > 1) return false;
    }
    
    return true;
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
