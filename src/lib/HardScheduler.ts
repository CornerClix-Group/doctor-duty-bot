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
import {
  type ScheduleViolation,
  type SchedulerProviderProfile,
  circadianRatchetViolations,
  isClinicalShift,
  isNightShiftToken,
  isShiftEligibleForProfile,
  maxClinicalInRolling7,
  maxConsecutiveClinicalDays,
  recoveryDaysAfterNightBlock,
} from "../../supabase/functions/_shared/schedulerHardRules.ts";

export class HardScheduler {
  providers: any[] = [];
  providerDays: any[] = [];  // per-provider per-date instructions
  coveragePattern: Record<string, number> = {}; // e.g., { "2026-01-01": 7 }
  /** Lowercased provider name → DB rule profile */
  providerRuleProfiles: Record<string, SchedulerProviderProfile> = {};

  schedule: Record<string, Record<string, string | null>> = {}; 
  providerTotals: Record<string, { worked: number; weekends: number; nights: number; target: number; weekend_quota: number; night_quota: number }> = {};
  payPeriodTotals: Record<number, number> = {};
  warnings: string[] = [];
  violations: ScheduleViolation[] = [];
  
  // Night block recovery tracking
  recoveryWindows: Map<string, Set<string>> = new Map(); // providerName -> Set of dates in recovery
  
  // Track which shift types have been assigned per date (to prevent duplicates)
  assignedShiftsPerDate: Record<string, Set<string>> = {}; // date -> Set of shift codes already assigned

  constructor() {}

  setProviderRuleProfiles(profiles: Record<string, SchedulerProviderProfile>) {
    this.providerRuleProfiles = profiles;
  }

  getRuleProfile(providerName: string): SchedulerProviderProfile | undefined {
    return this.providerRuleProfiles[(providerName || "").trim().toLowerCase()];
  }

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

    // initialize schedule object and shift tracking for each date
    Object.keys(pattern).forEach(date => {
      this.schedule[date] = {};
      this.assignedShiftsPerDate[date] = new Set();
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
          
          // Track the assigned shift type
          if (!this.assignedShiftsPerDate[date]) {
            this.assignedShiftsPerDate[date] = new Set();
          }
          this.assignedShiftsPerDate[date].add(day.assigned);

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

    const prof = this.getRuleProfile(provider.name);
    if (!isShiftEligibleForProfile(prof, shift)) return false;

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
    // 48-hour rest AFTER the last night shift in a block.
    // Allow consecutive nights within a block.
    const dates = Object.keys(this.schedule).sort();
    const idx = dates.indexOf(date);
    const prev = idx > 0 ? dates[idx - 1] : null;
    const prev2 = idx > 1 ? dates[idx - 2] : null;

    const prevShift = prev ? this.schedule[prev]?.[providerName] : undefined;
    const prev2Shift = prev2 ? this.schedule[prev2]?.[providerName] : undefined;

    // If assigning a Night today, allow even if last night was yesterday (continue block)
    if (isNightShiftToken(shift)) return false;

    // If yesterday was a night and today is not a night -> violation
    if (isNightShiftToken(prevShift) && shift !== 'OFF') return true;

    // If two days ago was a night and yesterday was not -> still within 48h window
    if (isNightShiftToken(prev2Shift) && !isNightShiftToken(prevShift) && shift !== 'OFF') return true;

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
    return isNightShiftToken(shift);
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
    return recoveryDaysAfterNightBlock(this.getRuleProfile(providerName), 2);
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

    // Mark next recoveryDays as recovery period, and explicitly set OFF unless locked
    for (let i = 1; i <= recoveryDays && endIndex + i < dates.length; i++) {
      const recDate = dates[endIndex + i];
      recoverySet.add(recDate);

      // If not locked and not already assigned, force OFF
      if (!this.isDateLocked(providerName, recDate) && !this.schedule[recDate][providerName]) {
        this.schedule[recDate][providerName] = "OFF";
      }
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

  getCurrentNightCount(providerName: string): number {
    let count = 0;
    const dates = Object.keys(this.schedule).sort();
    for (const date of dates) {
      const shift = this.schedule[date]?.[providerName];
      if (this.isNight(shift)) {
        count++;
      }
    }
    return count;
  }

  // --------------------------------------------------------------------------
  // NIGHT BLOCK SIZE VALIDATION (for David Coffin)
  // --------------------------------------------------------------------------
  
  getConsecutiveNightCount(providerName: string, endDate: string): number {
    const dates = Object.keys(this.schedule).sort();
    const endIndex = dates.indexOf(endDate);
    if (endIndex === -1) return 0;

    let count = 0;
    for (let i = endIndex; i >= 0; i--) {
      const shift = this.schedule[dates[i]]?.[providerName];
      if (this.isNight(shift)) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  canFormValidNightBlock(providerName: string, date: string): boolean {
    const prof = this.getRuleProfile(providerName);
    if (!prof?.night_only) return true;

    const dates = Object.keys(this.schedule).sort();
    const dateIndex = dates.indexOf(date);
    if (dateIndex === -1) return false;

    // Count consecutive nights before this date
    const nightsBefore = this.getConsecutiveNightCount(providerName, dates[dateIndex - 1] || date);

    const blockMax = prof.night_block_max_length ?? 4;
    if (nightsBefore >= blockMax) return false;

    // Look ahead to see how many consecutive nights are feasible after this date
    const provider = this.providers.find(p => p.name.trim().toLowerCase() === providerName.trim().toLowerCase());
    if (!provider) return false;

    let canExtend = 0;
    for (let i = dateIndex + 1; i < dates.length; i++) {
      const d = dates[i];
      // stop if in recovery window
      if (this.isInRecoveryWindow(providerName, d)) break;
      const pd = this.getProviderDay(providerName, d);

      // If the date is locked to a non-night shift, stop
      if (pd.locked && pd.assigned && !this.isNight(pd.assigned)) break;

      // If locked night, ok to continue
      if (pd.locked && pd.assigned && this.isNight(pd.assigned)) {
        canExtend++;
        continue;
      }

      // Otherwise check eligibility for N
      if (this.isShiftAllowed(provider, pd, "N", d)) {
        canExtend++;
      } else {
        break;
      }

      if (nightsBefore + 1 + canExtend >= blockMax) break;
    }

    const potential = nightsBefore + 1 + canExtend;
    const blockMin = prof.night_block_min_length ?? 3;

    if (potential < blockMin) return false;

    if (nightsBefore + 1 > blockMax) return false;

    return true;
  }

  validateNightBlockSize(providerName: string, blockEndDate: string): boolean {
    const prof = this.getRuleProfile(providerName);
    if (!prof?.night_only) return true;

    const blockSize = this.getConsecutiveNightCount(providerName, blockEndDate);
    const minL = prof.night_block_min_length ?? 3;
    const maxL = prof.night_block_max_length ?? 4;
    if (blockSize < minL || blockSize > maxL) {
      this.warnings.push(
        `${providerName}: Night block of ${blockSize} shifts (allowed ${minL}-${maxL}). Block ending ${blockEndDate}`,
      );
      return false;
    }

    return true;
  }

  // --------------------------------------------------------------------------
  // STREAK LOGIC FOR CONSECUTIVE WORK DAYS
  // --------------------------------------------------------------------------
  
  /**
   * Check if provider should use streak logic (excludes Coffin, Lopez, Venugopal)
   */
  shouldUseStreakLogic(providerName: string): boolean {
    const p = this.getRuleProfile(providerName);
    return p?.counts_in_quotas !== false;
  }

  /**
   * Get consecutive work days before this date
   */
  getWorkStreak(providerName: string, date: string): number {
    const dates = Object.keys(this.schedule).sort();
    const dateIndex = dates.indexOf(date);
    if (dateIndex <= 0) return 0;

    let streak = 0;
    for (let i = dateIndex - 1; i >= 0; i--) {
      const d = dates[i];
      const shift = this.schedule[d]?.[providerName];
      
      if (isClinicalShift(shift)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  /**
   * Check if provider can potentially work tomorrow (for 2-3 day blocks)
   */
  canWorkTomorrow(providerName: string, provider: any, date: string): boolean {
    const dates = Object.keys(this.schedule).sort();
    const dateIndex = dates.indexOf(date);
    if (dateIndex >= dates.length - 1) return false;

    const nextDate = dates[dateIndex + 1];
    const nextProviderDay = this.getProviderDay(providerName, nextDate);
    
    // Check if tomorrow is locked or OFF
    if (nextProviderDay.assigned === "OFF") return false;
    if (nextProviderDay.locked && nextProviderDay.assigned) return false;
    
    // Basic eligibility check (simplified)
    return true;
  }

  /**
   * Score provider for assignment on this date (higher = better)
   */
  scoreProviderForDate(providerName: string, provider: any, date: string): number {
    if (!this.shouldUseStreakLogic(providerName)) {
      return 0; // Neutral score for excluded providers
    }

    const streak = this.getWorkStreak(providerName, date);
    const canContinue = this.canWorkTomorrow(providerName, provider, date);

    // Prefer continuing 1-2 day streaks
    if (streak === 1 || streak === 2) {
      return 10 + streak; // Priority: complete 2-3 day blocks
    }

    // Avoid creating single-day assignments
    if (streak === 1 && !canContinue) {
      return -10; // Bad: creates isolated work day
    }

    // Fresh start (no recent work) is good
    if (streak === 0) {
      return 5; // Good for starting new block
    }

    // Already worked 3+ days in a row - lower priority
    if (streak >= 3) {
      return -5;
    }

    return 0; // Neutral
  }

  // --------------------------------------------------------------------------
  // MAIN SOLVER
  // --------------------------------------------------------------------------
  solve() {
    this.violations = [];
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
          const prevDate = this.getPreviousDate(date);
          if (prevDate) {
            this.validateNightBlockSize(providerName, prevDate);
          }
          this.enforcePostNightBlockRecovery(providerName, date);
        }
      }
      
      // Check if month ends with an incomplete night block
      const lastDate = dates[dates.length - 1];
      const lastShift = this.schedule[lastDate]?.[providerName];
      if (this.isNight(lastShift)) {
        this.validateNightBlockSize(providerName, lastDate);
      }
    }

    for (let date of dates) {
      let coverageNeeded = this.coveragePattern[date] || 0;

      if (coverageNeeded <= 0) continue; // all covered by preassignments

      // Sort providers by streak score for this date (highest first)
      const scoredProviders = this.providers.map(provider => ({
        provider,
        score: this.scoreProviderForDate(provider.name, provider, date)
      })).sort((a, b) => b.score - a.score);

      for (let { provider } of scoredProviders) {
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
          // Check if this shift type is already assigned to someone else today
          if (this.assignedShiftsPerDate[date]?.has(shift)) {
            continue; // Skip - this shift type is already taken today
          }

          // rest-hour check
          if (this.violatesRest(provider.name, date, shift, provider))
            continue;

          // rule/constraint eligibility
          if (!this.isShiftAllowed(provider, providerDay, shift, date))
            continue;

          if (this.isNight(shift) && !this.canFormValidNightBlock(provider.name, date)) {
            continue;
          }

          const prof = this.getRuleProfile(provider.name);
          const cap = prof?.monthly_max_nights;
          if (cap != null && this.isNight(shift) && this.getCurrentNightCount(provider.name) >= cap) {
            continue;
          }

          // Check if provider is at or exceeding night quota (soft limit)
          if (this.isNight(shift)) {
            const providerData = this.providerDays.find((p: any) => p.name === provider.name);
            const nightQuota = providerData?.night_quota || 0;
            const currentNights = this.getCurrentNightCount(provider.name);
            if (currentNights >= nightQuota + 1) {
              continue; // Try to avoid exceeding quota by more than 1
            }
          }

          // assign
          this.schedule[date][provider.name] = shift;
          
          // Track the assigned shift type
          if (!this.assignedShiftsPerDate[date]) {
            this.assignedShiftsPerDate[date] = new Set();
          }
          this.assignedShiftsPerDate[date].add(shift);
          
          // Track night blocks and enforce recovery
          if (this.isNight(shift)) {
            // Provider assigned a night shift - track but don't enforce recovery yet
          } else if (this.wasNightYesterday(provider.name, date)) {
            // Block is ending - validate size and enforce recovery
            const prevDate = this.getPreviousDate(date);
            if (prevDate) {
              this.validateNightBlockSize(provider.name, prevDate);
            }
            this.enforcePostNightBlockRecovery(provider.name, date);
          }
          
          coverageNeeded -= 1;
          break;
        }
      }

      if (coverageNeeded > 0) {
        this.violations.push({
          type: "coverage_unfilled",
          date,
          message: `Cannot satisfy coverage for ${date}; ${coverageNeeded} slot(s) unfilled.`,
        });
        break;
      }
    }

    this.computeTotals();
    const allDates = Object.keys(this.schedule).sort();
    for (const p of this.providers) {
      const name = p.name;
      if (maxConsecutiveClinicalDays(this.schedule, name, allDates) > 4) {
        this.violations.push({
          type: "max_consecutive_clinical",
          provider: name,
          message: "Exceeds 4 consecutive clinical days",
        });
      }
      if (maxClinicalInRolling7(this.schedule, name, allDates) > 4) {
        this.violations.push({
          type: "rolling_7_clinical",
          provider: name,
          message: "Exceeds 4 clinical shifts in a rolling 7-day window",
        });
      }
      this.violations.push(...circadianRatchetViolations(this.schedule, name, allDates));
    }

    return {
      schedule: this.schedule,
      providerTotals: this.providerTotals,
      payPeriodTotals: this.payPeriodTotals,
      warnings: this.warnings,
      violations: this.violations,
      success: this.violations.length === 0,
      softScores: {
        isolatedShifts: 0,
        circadianFlips: 0,
        shiftFairnessVariance: 0,
        callFairnessVariance: 0,
        weekendFairnessVariance: 0,
      },
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
    // Initialize totals from providerDays
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
    for (let date of dates) {
      this.payPeriodTotals[ppCounter] = this.payPeriodTotals[ppCounter] || 0;

      for (let providerName in this.schedule[date]) {
        const shift = this.schedule[date][providerName];
        if (isClinicalShift(shift) && shift !== "C" && shift !== "A10") {
          this.providerTotals[providerName].worked += 1;
          const dow = new Date(date).getDay();
          if (dow === 0 || dow === 6) {
            this.providerTotals[providerName].weekends += 1;
          }
          if (this.isNight(shift)) {
            this.providerTotals[providerName].nights += 1;
          }
          this.payPeriodTotals[ppCounter] += 1;
        }
      }

      // bump PP counter every 14 days
      if (ppCounter < 14) ppCounter++;
      else ppCounter = 1;
    }
  }
}
