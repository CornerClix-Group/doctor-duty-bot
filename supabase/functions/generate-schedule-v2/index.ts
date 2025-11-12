import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Deterministic Constraint Satisfaction Scheduler
class DeterministicScheduler {
  private scheduleData: any;
  private providerProfiles: any[];
  private lockedCells: Map<string, string>;
  private schedule: any[];
  private providerAssignments: Map<string, Map<string, string>>;
  private warnings: string[];
  private regularShifts = new Set(['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W', 'FT W12']);

  constructor(scheduleData: any, providerProfiles: any[]) {
    this.scheduleData = scheduleData;
    this.providerProfiles = providerProfiles;
    this.lockedCells = new Map();
    this.schedule = [];
    this.providerAssignments = new Map();
    this.warnings = [];
    
    this.buildLockedCells();
  }

  private buildLockedCells() {
    for (const provider of this.scheduleData.providers) {
      if (!provider.name) continue;
      for (const day of provider.days ?? []) {
        if (day.locked && day.value) {
          this.lockedCells.set(`${day.date}|${provider.name}`, day.value);
        }
      }
    }
  }

  private getProviderProfile(providerName: string) {
    return this.providerProfiles.find(
      (p: any) => `${p.first_name} ${p.last_name}` === providerName
    );
  }

  private getRequiredShifts(date: string, pattern: number): string[] {
    const shifts = pattern === 7
      ? ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT W']
      : ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM'];
    
    // Add FT W12 on Sundays for pattern 7
    if (pattern === 7 && new Date(date).getDay() === 0) {
      shifts.push('FT W12');
    }
    
    return shifts;
  }

  private isWeekend(date: string): boolean {
    const day = new Date(date).getDay();
    return day === 0 || day === 6;
  }

  private getShiftEndTime(shift: string, pattern: number): number {
    const shiftTimes: Record<string, number> = pattern === 7 ? {
      'D1': 16, 'D2': 18, 'MIDA': 21, 'MIDB': 24,
      'E': 26, 'N': 31, 'FT W': 18, 'FT W12': 22, 'C': 22, 'A10': 17
    } : {
      'D1': 15, 'D2': 17, 'MIDA': 20, 'MIDB': 24,
      'E': 26, 'N': 31, 'FT AM': 15, 'FT PM': 24, 'C': 22, 'A10': 17
    };
    return shiftTimes[shift] || 18;
  }

  private getShiftStartTime(shift: string, pattern: number): number {
    const shiftTimes: Record<string, number> = pattern === 7 ? {
      'D1': 6, 'D2': 8, 'MIDA': 11, 'MIDB': 14,
      'E': 16, 'N': 21, 'FT W': 8, 'FT W12': 12, 'C': 6, 'A10': 8
    } : {
      'D1': 6, 'D2': 8, 'MIDA': 11, 'MIDB': 15,
      'E': 17, 'N': 22, 'FT AM': 6, 'FT PM': 15, 'C': 6, 'A10': 8
    };
    return shiftTimes[shift] || 8;
  }

  private violatesRestRequirement(providerName: string, date: string, shift: string, pattern: number): boolean {
    const assignments = this.providerAssignments.get(providerName);
    if (!assignments) return false;

    const currentDate = new Date(date);
    const shiftStart = this.getShiftStartTime(shift, pattern);

    // Check previous day
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];
    const prevShift = assignments.get(prevDateStr);
    
    if (prevShift) {
      const prevPattern = this.scheduleData.coverage_pattern[prevDateStr] || pattern;
      const prevEnd = this.getShiftEndTime(prevShift, prevPattern);
      const hoursBetween = (24 - prevEnd) + shiftStart;
      if (hoursBetween < 12) return true;

      // N-shift recovery: 2 full days off after N shift before any non-N shift
      if (prevShift === 'N' && shift !== 'N') {
        const daysSinceN = this.countDaysSinceLastN(providerName, date);
        if (daysSinceN < 2) return true;
      }
    }

    return false;
  }

  private countDaysSinceLastN(providerName: string, currentDate: string): number {
    const assignments = this.providerAssignments.get(providerName);
    if (!assignments) return 999;

    const current = new Date(currentDate);
    let daysOff = 0;
    
    for (let i = 1; i <= 3; i++) {
      const checkDate = new Date(current);
      checkDate.setDate(checkDate.getDate() - i);
      const checkDateStr = checkDate.toISOString().split('T')[0];
      const shift = assignments.get(checkDateStr);
      
      if (shift === 'N') return daysOff;
      if (!shift || shift === 'X' || shift === 'L') daysOff++;
    }
    
    return 999;
  }

  private isProviderEligible(providerName: string, date: string, shift: string, pattern: number): boolean {
    // Check locked status
    const lockedValue = this.lockedCells.get(`${date}|${providerName}`);
    if (lockedValue === 'X' || lockedValue === 'L' || lockedValue === 'LH') return false;
    if (lockedValue && lockedValue !== shift) return false;

    // Check if already assigned on this day
    const assignments = this.providerAssignments.get(providerName);
    if (assignments?.has(date)) return false;

    // Check weekend restrictions for C and A10
    if ((shift === 'C' || shift === 'A10') && this.isWeekend(date)) return false;

    // Check rest requirements
    if (this.violatesRestRequirement(providerName, date, shift, pattern)) return false;

    // Check provider constraints
    const profile = this.getProviderProfile(providerName);
    if (profile) {
      const allowed = profile.allowed_shifts || [];
      const disallowed = profile.rules?.disallowed_shifts || [];
      
      if (allowed.length > 0 && !allowed.includes(shift)) return false;
      if (disallowed.includes(shift)) return false;

      // Check Saturday/Sunday restrictions
      const dayOfWeek = new Date(date).getDay();
      if (dayOfWeek === 6 && profile.rules?.saturday_restrictions) {
        const satRestrictions = profile.rules.saturday_restrictions.split(',').map((s: string) => s.trim());
        if (!satRestrictions.includes(shift) && !satRestrictions.includes('all')) return false;
      }
      if (dayOfWeek === 0 && profile.rules?.sunday_restrictions) {
        const sunRestrictions = profile.rules.sunday_restrictions.split(',').map((s: string) => s.trim());
        if (!sunRestrictions.includes(shift) && !sunRestrictions.includes('all')) return false;
      }
    }

    return true;
  }

  private getEligibleProviders(date: string, shift: string, pattern: number): string[] {
    const eligible: string[] = [];
    
    for (const provider of this.scheduleData.providers) {
      if (!provider.name) continue;
      if (this.isProviderEligible(provider.name, date, shift, pattern)) {
        eligible.push(provider.name);
      }
    }

    return this.sortProvidersByPriority(eligible, shift, date);
  }

  private sortProvidersByPriority(providers: string[], shift: string, date: string): string[] {
    return providers.sort((a, b) => {
      const aAssignments = this.providerAssignments.get(a);
      const bAssignments = this.providerAssignments.get(b);
      const aCount = aAssignments ? aAssignments.size : 0;
      const bCount = bAssignments ? bAssignments.size : 0;

      const aProvider = this.scheduleData.providers.find((p: any) => p.name === a);
      const bProvider = this.scheduleData.providers.find((p: any) => p.name === b);
      const aTarget = aProvider?.target_shifts || 0;
      const bTarget = bProvider?.target_shifts || 0;

      const aDeficit = aTarget - aCount;
      const bDeficit = bTarget - bCount;

      // Prioritize providers furthest behind their target
      if (aDeficit !== bDeficit) return bDeficit - aDeficit;

      // For D1 shifts, prioritize Lopez > Arnett > others
      if (shift === 'D1') {
        if (a.includes('Lopez')) return -1;
        if (b.includes('Lopez')) return 1;
        if (a.includes('Arnett')) return -1;
        if (b.includes('Arnett')) return 1;
      }

      return 0;
    });
  }

  private assignShift(providerName: string, date: string, shift: string) {
    if (!this.providerAssignments.has(providerName)) {
      this.providerAssignments.set(providerName, new Map());
    }
    this.providerAssignments.get(providerName)!.set(date, shift);
  }

  private applyLockedCells() {
    console.log("[CSP] Applying locked cells...");
    
    for (const [key, value] of this.lockedCells.entries()) {
      const [date, providerName] = key.split('|');
      
      // X, L, LH mean off - no assignment needed
      if (value === 'X' || value === 'L' || value === 'LH') continue;
      
      // Assign the locked shift
      this.assignShift(providerName, date, value);
    }
  }

  private fillSchedule() {
    console.log("[CSP] Filling schedule with backtracking search...");
    
    // Get all dates sorted
    const dates = Object.keys(this.scheduleData.coverage_pattern).sort();
    
    // Build list of all unfilled shift slots
    const unfilledSlots: Array<{ date: string; shift: string; pattern: number }> = [];
    
    for (const date of dates) {
      const pattern = this.scheduleData.coverage_pattern[date];
      const requiredShifts = this.getRequiredShifts(date, pattern);
      
      // Get already assigned shifts (from locked cells)
      const assignedShifts = new Set<string>();
      for (const [pName, assignments] of this.providerAssignments.entries()) {
        const shift = assignments.get(date);
        if (shift) assignedShifts.add(shift);
      }
      
      // Collect unfilled slots
      for (const shift of requiredShifts) {
        if (!assignedShifts.has(shift)) {
          unfilledSlots.push({ date, shift, pattern });
        }
      }
    }
    
    console.log(`[CSP] Found ${unfilledSlots.length} unfilled slots, starting backtracking search...`);
    
    // Attempt backtracking search
    const success = this.backtrackSearch(unfilledSlots, 0);
    
    if (!success) {
      console.log("[CSP] Backtracking search exhausted - some shifts could not be filled");
    } else {
      console.log("[CSP] Backtracking search completed successfully");
    }
  }

  private backtrackSearch(slots: Array<{ date: string; shift: string; pattern: number }>, slotIndex: number): boolean {
    // Base case: all slots filled
    if (slotIndex >= slots.length) {
      return true;
    }
    
    const { date, shift, pattern } = slots[slotIndex];
    const eligible = this.getEligibleProviders(date, shift, pattern);
    
    // No eligible providers for this slot - backtrack
    if (eligible.length === 0) {
      this.warnings.push(`No eligible providers for ${shift} on ${date} - backtracking...`);
      return false;
    }
    
    // Try each eligible provider
    for (const providerName of eligible) {
      // Make assignment
      this.assignShift(providerName, date, shift);
      
      // Recursively try to fill remaining slots
      if (this.backtrackSearch(slots, slotIndex + 1)) {
        return true; // Success!
      }
      
      // Backtrack: undo this assignment
      this.undoAssignment(providerName, date);
    }
    
    // All providers tried and failed - backtrack further
    return false;
  }

  private undoAssignment(providerName: string, date: string) {
    const assignments = this.providerAssignments.get(providerName);
    if (assignments) {
      assignments.delete(date);
    }
  }

  private computePayPeriod(date: string): number {
    const startDate = new Date(this.scheduleData.providers[0].days[0].date);
    const currentDate = new Date(date);
    const daysDiff = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return Math.floor(daysDiff / 14) + 1;
  }

  private buildOutputSchedule() {
    console.log("[CSP] Building output schedule...");
    
    const dates = Object.keys(this.scheduleData.coverage_pattern).sort();
    const schedule = [];
    
    for (const date of dates) {
      const pattern = this.scheduleData.coverage_pattern[date];
      const payPeriod = this.computePayPeriod(date);
      const requiredShifts = this.getRequiredShifts(date, pattern);
      
      const assignments = [];
      
      for (const shift of requiredShifts) {
        let provider = '';
        
        // Find who is assigned to this shift
        for (const [pName, pAssignments] of this.providerAssignments.entries()) {
          if (pAssignments.get(date) === shift) {
            provider = pName;
            break;
          }
        }
        
        assignments.push({ shift, provider });
      }
      
      // Add X/L/LH locked entries
      for (const [key, value] of this.lockedCells.entries()) {
        const [lockedDate, providerName] = key.split('|');
        if (lockedDate === date && (value === 'X' || value === 'L' || value === 'LH')) {
          assignments.push({ shift: value, provider: providerName });
        }
      }
      
      schedule.push({ date, pattern, pay_period: payPeriod, assignments });
    }
    
    return schedule;
  }

  private computeTotals() {
    console.log("[CSP] Computing provider totals...");
    
    const providerTotals: Record<string, any> = {};
    const payPeriodTotals: Record<string, Record<string, number>> = {};
    
    for (const provider of this.scheduleData.providers) {
      const name = provider.name;
      if (!name) continue;
      
      providerTotals[name] = {
        worked: 0,
        weekends: 0,
        call: 0,
        admin: 0,
        target: provider.target_shifts || 0,
        weekend_quota: provider.weekend_quota || 0
      };
      payPeriodTotals[name] = {};
    }
    
    const dates = Object.keys(this.scheduleData.coverage_pattern).sort();
    
    for (const date of dates) {
      const payPeriod = this.computePayPeriod(date);
      const isWeekend = this.isWeekend(date);
      
      for (const [providerName, assignments] of this.providerAssignments.entries()) {
        const shift = assignments.get(date);
        if (!shift) continue;
        
        if (!providerTotals[providerName]) continue;
        
        const ppKey = `PP${payPeriod}`;
        if (!payPeriodTotals[providerName][ppKey]) {
          payPeriodTotals[providerName][ppKey] = 0;
        }
        
        if (shift === 'C') {
          providerTotals[providerName].call++;
          payPeriodTotals[providerName][ppKey]++;
        } else if (shift === 'A10') {
          providerTotals[providerName].admin++;
          payPeriodTotals[providerName][ppKey]++;
        } else if (this.regularShifts.has(shift)) {
          providerTotals[providerName].worked++;
          payPeriodTotals[providerName][ppKey]++;
          if (isWeekend) {
            providerTotals[providerName].weekends++;
          }
        }
      }
    }
    
    return { providerTotals, payPeriodTotals };
  }

  generate() {
    console.log("[CSP] Starting deterministic schedule generation...");
    
    // Step 1: Apply locked cells
    this.applyLockedCells();
    
    // Step 2: Fill remaining shifts
    this.fillSchedule();
    
    // Step 3: Build output
    const schedule = this.buildOutputSchedule();
    const { providerTotals, payPeriodTotals } = this.computeTotals();
    
    return {
      month: this.scheduleData.month,
      schedule,
      provider_totals: providerTotals,
      pay_period_totals: payPeriodTotals,
      warnings: this.warnings
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider_profiles, schedule_data } = await req.json();

    // Validate inputs
    if (!schedule_data?.month || !schedule_data?.providers?.length) {
      return new Response(
        JSON.stringify({ error: "Invalid schedule_data" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (!Array.isArray(provider_profiles) || provider_profiles.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing provider_profiles" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[CSP] Using deterministic constraint satisfaction scheduler...");

    // Generate schedule using deterministic algorithm
    const scheduler = new DeterministicScheduler(schedule_data, provider_profiles);
    const data = scheduler.generate();

    // Validation report
    const validationReport = {
      lockedCellsPreserved: 0,
      lockedCellViolations: [] as string[],
      constraintViolations: [] as string[],
      unfilledShifts: [] as string[],
      providerMismatches: [] as string[]
    };

    // Build locked cells map for validation
    const lockedMap = new Map<string, string>();
    for (const p of schedule_data.providers) {
      if (!p.name) continue;
      for (const d of p.days ?? []) {
        if (d.locked && d.value) {
          lockedMap.set(`${d.date}|${p.name}`, d.value);
        }
      }
    }

    console.log("[CSP] Locked cells map:", Array.from(lockedMap.entries()).slice(0, 20));

    // Track all locked cells and verify preservation
    lockedMap.forEach((lockedValue, key) => {
      const [date, providerName] = key.split("|");
      const daySchedule = data.schedule?.find((d: any) => d.date === date);
      if (!daySchedule) return;

      const providerAssignments = daySchedule.assignments?.filter((a: any) => a.provider === providerName) || [];

      if (lockedValue === 'X' || lockedValue === 'L' || lockedValue === 'LH') {
        // Provider MUST be off (no assignments)
        if (providerAssignments.length > 0) {
          validationReport.lockedCellViolations.push(
            `${date} ${providerName}: locked as ${lockedValue} but assigned to ${providerAssignments.map((a: any) => a.shift).join(', ')}`
          );
        } else {
          validationReport.lockedCellsPreserved++;
        }
      } else {
        // Provider MUST be assigned to exact shift
        const hasCorrectShift = providerAssignments.some((a: any) => a.shift === lockedValue);
        const otherShifts = providerAssignments.filter((a: any) => a.shift !== lockedValue);
        
        if (!hasCorrectShift) {
          validationReport.lockedCellViolations.push(
            `${date} ${providerName}: expected ${lockedValue}, but assigned to ${providerAssignments.map((a: any) => a.shift).join(', ') || 'nothing'}`
          );
        } else if (otherShifts.length > 0) {
          validationReport.lockedCellViolations.push(
            `${date} ${providerName}: locked to ${lockedValue} but also assigned to ${otherShifts.map((a: any) => a.shift).join(', ')}`
          );
        } else {
          validationReport.lockedCellsPreserved++;
        }
      }
    });

    // Check for constraint violations and unfilled shifts
    for (const daySchedule of data.schedule ?? []) {
      const requiredShifts = daySchedule.pattern === 7 
        ? ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT W']
        : ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM'];
      
      if (daySchedule.pattern === 7 && new Date(daySchedule.date).getDay() === 0) {
        requiredShifts.push('FT W12');
      }

      for (const shift of requiredShifts) {
        const assignment = daySchedule.assignments?.find((a: any) => a.shift === shift);
        if (!assignment || !assignment.provider) {
          validationReport.unfilledShifts.push(`${daySchedule.date} ${shift}`);
        } else {
          // Check if provider is allowed to work this shift
          const profile = provider_profiles.find((pp: any) => 
            `${pp.first_name} ${pp.last_name}` === assignment.provider
          );
          if (profile) {
            const allowed = profile.allowed_shifts || [];
            const disallowed = profile.rules?.disallowed_shifts || [];
            
            if (allowed.length > 0 && !allowed.includes(shift)) {
              validationReport.constraintViolations.push(
                `${daySchedule.date} ${assignment.provider} assigned to ${shift}, but only allowed: ${allowed.join(', ')}`
              );
            }
            if (disallowed.includes(shift)) {
              validationReport.constraintViolations.push(
                `${daySchedule.date} ${assignment.provider} assigned to ${shift}, but it's disallowed`
              );
            }
          }
        }
      }
    }

    // Block schedule if critical violations exist
    if (validationReport.lockedCellViolations.length > 0) {
      console.error("[CSP] CRITICAL: Locked cell violations detected:", validationReport.lockedCellViolations);
      return new Response(
        JSON.stringify({
          error: "Locked cell violations detected",
          validation: validationReport
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Attach validation report to response (even if successful)
    const result = {
      ...data,
      validation: validationReport
    };

    console.log("[CSP] Schedule generated successfully");
    console.log("[CSP] Validation report:", {
      preserved: validationReport.lockedCellsPreserved,
      violations: validationReport.lockedCellViolations.length,
      constraintIssues: validationReport.constraintViolations.length,
      unfilled: validationReport.unfilledShifts.length
    });

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[CSP] Error in generate-schedule-v2 function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate schedule" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
