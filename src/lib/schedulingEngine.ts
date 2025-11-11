import { DayData, Provider, ScheduleData } from './scheduleParser';

interface Assignment {
  shift: string;
  provider: string;
}

interface DaySchedule {
  date: string;
  pattern: number;
  assignments: Assignment[];
}

interface ScheduleResult {
  month: string;
  schedule: DaySchedule[];
  provider_totals: {
    [provider: string]: {
      worked: number;
      weekends: number;
      target: number;
      weekendQuota: number;
    };
  };
  warnings?: string[];
}

const SHIFT_TIMES: { [shift: string]: { start: number; end: number } } = {
  'D1': { start: 6, end: 16 },
  'FT AM': { start: 7, end: 17 },
  'D2': { start: 8, end: 18 },
  'MIDA': { start: 11, end: 21 },
  'FT PM': { start: 14, end: 24 },
  'MIDB': { start: 15, end: 1 },
  'E': { start: 17, end: 3 },
  'N': { start: 22, end: 8 },
  'FT W': { start: 10, end: 20 }
};

const PATTERN_SHIFTS: { [pattern: number]: string[] } = {
  7: ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT W'],
  8: ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM']
};

const D1_PROVIDERS = ['Lopez', 'Arnett', 'Beres', 'Illston', 'Freeman', 'Ferguson', 'Jones'];
const D1_PRIORITY = ['Lopez', 'Arnett', 'Beres', 'Illston', 'Freeman', 'Ferguson', 'Jones'];

class SchedulingEngine {
  private scheduleData: ScheduleData;
  private providerStats: Map<string, { worked: number; weekends: number; lastShift: { date: string; shift: string } | null; consecutiveN: number }>;
  private providerBlocked: Map<string, Set<string>>; // provider -> set of blocked dates
  private schedule: DaySchedule[];
  private warnings: string[];

  constructor(scheduleData: ScheduleData) {
    this.scheduleData = scheduleData;
    this.providerStats = new Map();
    this.providerBlocked = new Map();
    this.schedule = [];
    this.warnings = [];

    // Initialize provider stats and load blocked days from parsed data
    Object.keys(scheduleData.providers).forEach(name => {
      this.providerStats.set(name, {
        worked: 0,
        weekends: 0,
        lastShift: null,
        consecutiveN: 0
      });
      
      // Load blocked days from parsed data
      const blocked = scheduleData.providerBlocked[name] || new Set();
      this.providerBlocked.set(name, blocked);
    });
  }
  
  private buildBlockedDaysMap() {
    // No longer needed - blocked days are now passed in from parser
  }

  generate(): ScheduleResult {
    // First pass: count existing assignments
    this.scheduleData.days.forEach(day => {
      Object.entries(day.shifts).forEach(([shift, provider]) => {
        if (provider && !['X', 'L', 'HL', ''].includes(provider)) {
          const stats = this.providerStats.get(provider);
          if (stats) {
            stats.worked++;
            if (day.isWeekend) stats.weekends++;
          }
        }
      });
    });

    // Second pass: fill blank shifts
    this.scheduleData.days.forEach(day => {
      const requiredShifts = PATTERN_SHIFTS[day.pattern] || PATTERN_SHIFTS[7];
      const assignments: Assignment[] = [];

      requiredShifts.forEach(shiftType => {
        let provider = day.shifts[shiftType];

        // Check if shift is already filled or blocked
        if (provider && !['X', 'L', 'HL', ''].includes(provider)) {
          assignments.push({ shift: shiftType, provider });
          return;
        }

        // Skip if blocked
        if (['X', 'L', 'HL'].includes(provider)) {
          return;
        }

        // Find best provider for this shift
        provider = this.findBestProvider(day, shiftType);
        if (provider) {
          assignments.push({ shift: shiftType, provider });
          
          // Update stats
          const stats = this.providerStats.get(provider);
          if (stats) {
            stats.worked++;
            if (day.isWeekend) stats.weekends++;
            stats.lastShift = { date: day.date, shift: shiftType };
            
            if (shiftType === 'N') {
              stats.consecutiveN++;
            } else {
              stats.consecutiveN = 0;
            }
          }
        } else {
          this.warnings.push(`Could not assign ${shiftType} on ${day.date}`);
        }
      });

      this.schedule.push({
        date: day.date,
        pattern: day.pattern,
        assignments
      });
    });

    // Build result
    const provider_totals: ScheduleResult['provider_totals'] = {};
    Object.entries(this.scheduleData.providers).forEach(([name, provider]) => {
      const stats = this.providerStats.get(name);
      provider_totals[name] = {
        worked: stats?.worked || 0,
        weekends: stats?.weekends || 0,
        target: provider.targetShifts,
        weekendQuota: provider.weekendQuota
      };
    });

    return {
      month: `${this.scheduleData.month} ${this.scheduleData.year}`,
      schedule: this.schedule,
      provider_totals,
      warnings: this.warnings.length > 0 ? this.warnings : undefined
    };
  }

  private findBestProvider(day: DayData, shiftType: string): string | null {
    // D1 priority logic
    if (shiftType === 'D1') {
      for (const provider of D1_PRIORITY) {
        if (this.canAssign(provider, day, shiftType)) {
          return provider;
        }
      }
      return null;
    }

    // Find eligible providers
    const eligible: { name: string; score: number }[] = [];
    
    Object.entries(this.scheduleData.providers).forEach(([name, provider]) => {
      if (this.canAssign(name, day, shiftType)) {
        const stats = this.providerStats.get(name)!;
        const shiftDeficit = provider.targetShifts - stats.worked;
        const weekendDeficit = provider.weekendQuota - stats.weekends;
        
        // Score: prioritize those behind on shifts and weekend quotas
        let score = shiftDeficit * 10;
        if (day.isWeekend) {
          score += weekendDeficit * 20;
        }
        
        // Bonus for preferred shifts
        if (provider.constraints.preferredShifts?.includes(shiftType)) {
          score += 15;
        }
        
        eligible.push({ name, score });
      }
    });

    if (eligible.length === 0) return null;

    // Sort by score (descending) and return best
    eligible.sort((a, b) => b.score - a.score);
    return eligible[0].name;
  }

  private canAssign(providerName: string, day: DayData, shiftType: string): boolean {
    const provider = this.scheduleData.providers[providerName];
    if (!provider) return false;

    const stats = this.providerStats.get(providerName)!;
    const constraints = provider.constraints;
    
    // Check if provider is blocked on this day (X, L, etc.)
    const blockedDays = this.providerBlocked.get(providerName);
    if (blockedDays?.has(day.date)) {
      return false;
    }

    // Check if provider can work this shift type
    if (constraints.allowedShifts && !constraints.allowedShifts.includes(shiftType)) {
      return false;
    }
    if (constraints.disallowedShifts?.includes(shiftType)) {
      return false;
    }

    // D1 eligibility
    if (shiftType === 'D1' && !D1_PROVIDERS.includes(providerName)) {
      return false;
    }

    // Weekend rules
    if (day.dayOfWeek === 'Sat' && constraints.weekendRules?.includes('no-e-n-sat')) {
      if (shiftType === 'E' || shiftType === 'N') return false;
    }
    if (day.dayOfWeek === 'Sun' && constraints.weekendRules?.includes('only-midb-e-n-sun')) {
      if (!['MIDB', 'E', 'N'].includes(shiftType)) return false;
    }
    if (day.dayOfWeek === 'Sun' && constraints.weekendRules?.includes('avoid-sun')) {
      // Deprioritize but don't block
    }

    // Check rest requirements
    if (stats.lastShift) {
      const lastDay = this.scheduleData.days.find(d => d.date === stats.lastShift!.date);
      const currentDayIndex = this.scheduleData.days.findIndex(d => d.date === day.date);
      const lastDayIndex = this.scheduleData.days.findIndex(d => d.date === stats.lastShift!.date);
      
      if (lastDay && currentDayIndex > lastDayIndex) {
        const daysDiff = currentDayIndex - lastDayIndex;
        
        // After N shift, need 2+ days off before non-N
        if (stats.lastShift.shift === 'N' && shiftType !== 'N' && daysDiff < 3) {
          return false;
        }

        // 12-hour rest between shifts
        if (daysDiff === 1) {
          if (!this.hasEnoughRest(stats.lastShift.shift, shiftType)) {
            return false;
          }
        }
      }
    }

    // Check consecutive limits
    if (shiftType === 'N' && constraints.maxConsecutive?.['N']) {
      if (stats.consecutiveN >= constraints.maxConsecutive['N']) {
        return false;
      }
    }

    // Check if at target already
    if (stats.worked >= provider.targetShifts) {
      return false;
    }

    return true;
  }

  private hasEnoughRest(lastShift: string, nextShift: string): boolean {
    const last = SHIFT_TIMES[lastShift];
    const next = SHIFT_TIMES[nextShift];
    if (!last || !next) return true;

    let endTime = last.end;
    let startTime = next.start;

    // Handle overnight shifts
    if (endTime < last.start) endTime += 24;
    if (startTime < endTime - 24) startTime += 24;

    const restHours = startTime - endTime;
    return restHours >= 12 || restHours <= -12; // Allow next day
  }
}

export function generateSchedule(scheduleData: ScheduleData): ScheduleResult {
  const engine = new SchedulingEngine(scheduleData);
  return engine.generate();
}
