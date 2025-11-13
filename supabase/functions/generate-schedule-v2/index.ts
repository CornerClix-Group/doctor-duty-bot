// ====================================================================
// ========== HARD-CONSTRAINT MEDICAL SCHEDULING ENGINE ===============
// ====================================================================
//
// Architecture:
//  - Frontend uploads raw Excel base64 file
//  - Edge function parses Excel
//  - Provider rules merged from provider_profiles + provider_constraints
//  - Hard-constraint deterministic scheduler (backtracking + validation)
//  - Call (C) shift distribution
//  - Save schedule to DB (Option C)
//  - Return schedule JSON to frontend
//
// ====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/v135/xlsx@0.18.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// -------- Supabase Admin Client (service role) --------
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// -------- Shift Definitions --------
const SHIFT_START: Record<string, number> = {
  "D1": 6,
  "FT AM": 7,
  "D2": 8,
  "MIDA": 11,
  "FT PM": 14,
  "MIDB": 15,
  "E": 17,
  "N": 22,
  "FT W": 10,
  "FT W12": 12,
  "C": 6,
  "A10": 6
};

const SHIFT_END: Record<string, number> = {
  "D1": 16,
  "FT AM": 17,
  "D2": 18,
  "MIDA": 21,
  "FT PM": 24,
  "MIDB": 25,
  "E": 27,
  "N": 32,
  "FT W": 20,
  "FT W12": 22,
  "C": 24,
  "A10": 16
};

const PATTERN7 = ["D1", "D2", "MIDA", "MIDB", "E", "N", "FT W"];
const PATTERN8 = ["D1", "D2", "MIDA", "MIDB", "E", "N", "FT AM", "FT PM"];

// ====================================================================
// ========================== EXCEL PARSER ============================
// ====================================================================

function parseScheduleFromExcel(workbook: XLSX.WorkBook) {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  // Extract month and year from Row 1
  const monthCell = sheet['A1']?.v || '';
  const monthMatch = monthCell.match(/([A-Za-z]+)\s+(\d{4})/);
  const month = monthMatch ? monthMatch[1] : '';
  const year = monthMatch ? parseInt(monthMatch[2]) : new Date().getFullYear();

  const dates: string[] = [];
  const coverage_pattern: Record<string, number> = {};

  // Row 4 = day number, Row 5 = pattern
  for (let col = 2; col <= 32; col++) {
    const dayNumCell = sheet[XLSX.utils.encode_cell({ r: 3, c: col })];
    const patternCell = sheet[XLSX.utils.encode_cell({ r: 4, c: col })];
    
    if (dayNumCell?.v) {
      const dayNum = parseInt(dayNumCell.v.toString());
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthNum = monthNames.indexOf(month) + 1;
      const dateStr = `${year}-${monthNum.toString().padStart(2, '0')}-${dayNum.toString().padStart(2, '0')}`;
      dates.push(dateStr);
      
      const pattern = patternCell?.v ? parseInt(patternCell.v.toString()) : 7;
      coverage_pattern[dateStr] = pattern;
    }
  }

  // Parse providers starting from Row 6
  const providers: any[] = [];
  
  for (let row = 5; row <= range.e.r; row++) {
    const nameCell = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    if (!nameCell?.v) continue;
    
    const name = nameCell.v.toString().trim();
    if (!name || name === 'TOTAL') break;

    const weekendQuotaCell = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    const targetShiftsCell = sheet[XLSX.utils.encode_cell({ r: row, c: 34 })];

    const weekend_quota = weekendQuotaCell?.v ? parseInt(weekendQuotaCell.v.toString()) : 0;
    const target_shifts = targetShiftsCell?.v ? parseInt(targetShiftsCell.v.toString()) : 0;

    const days: any[] = [];

    dates.forEach((dateStr, idx) => {
      const col = idx + 2;
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      const value = cell?.v?.toString().trim() || '';

      // Locked if it contains actual shift codes or block codes
      const isShiftCode = ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W', 'FT W12', 'C', 'A10'].includes(value);
      const isBlockCode = ['X', 'L', 'HL'].includes(value);
      const locked = isShiftCode || isBlockCode;

      days.push({
        date: dateStr,
        value: value,
        locked: locked
      });
    });

    providers.push({
      name,
      weekend_quota,
      target_shifts,
      days
    });
  }

  return {
    month,
    year,
    coverage_pattern,
    providers
  };
}

// ====================================================================
// ========================== MERGE RULES =============================
// ====================================================================

function mergeRules(profiles: any[], constraints: any[]) {
  return profiles.map(profile => {
    const c = constraints.find(x => x.provider_id === profile.id);

    return {
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      allowed_shifts: c?.allowed_shifts ?? profile.allowed_shifts ?? [],
      preferred_shifts: c?.preferred_shifts ?? profile.preferred_shifts ?? [],
      rest_hours: c?.rest_hours ?? profile.rest_hours ?? 12,
      n_recovery_days: c?.n_recovery_days ?? profile.n_recovery_days ?? 2,
      rules: {
        disallowed_shifts: c?.disallowed_shifts ?? [],
        saturday_restrictions: c?.saturday_restrictions ?? profile.saturday_restrictions ?? null,
        sunday_restrictions: c?.sunday_restrictions ?? profile.sunday_restrictions ?? null,
        max_consecutive_n: c?.max_consecutive_n ?? null,
        block_pattern: c?.block_pattern ?? profile.block_pattern ?? null,
        weekend_rules: c?.weekend_rules ?? []
      }
    };
  });
}

// ====================================================================
// =================== HARD SCHEDULER ENGINE ==========================
// ====================================================================

class HardScheduler {
  coverage_pattern: Record<string, number>;
  providers: any[];
  rules: any[];
  days: string[];
  assignments: Map<string, Map<string, string>>;

  constructor(input: any, providerRules: any[]) {
    this.coverage_pattern = input.coverage_pattern;
    this.providers = input.providers;
    this.rules = providerRules;
    this.days = Object.keys(this.coverage_pattern).sort();

    this.assignments = new Map();
    this.providers.forEach(p => this.assignments.set(p.name, new Map()));
  }

  getRule(name: string) {
    return this.rules.find(r => r.name === name) || {};
  }

  isWeekend(date: string) {
    const dow = new Date(date).getDay();
    return dow === 0 || dow === 6;
  }

  violatesRest(provider: string, dateStr: string, shift: string): boolean {
    const assigned = this.assignments.get(provider);
    if (!assigned) return false;

    for (const [oldDate, oldShift] of assigned.entries()) {
      const diffHours = Math.abs(new Date(dateStr).getTime() - new Date(oldDate).getTime()) / 36e5;

      if (diffHours < 48) {
        const endHr = SHIFT_END[oldShift] > 24 ? SHIFT_END[oldShift] - 24 : SHIFT_END[oldShift];
        const startHr = SHIFT_START[shift];
        if (endHr + diffHours < startHr + 12) return true;
      }

      const rule = this.getRule(provider);
      const recovery = rule.n_recovery_days ?? 2;

      if (oldShift === "N" && shift !== "N") {
        if (diffHours < recovery * 24) return true;
      }
    }
    return false;
  }

  eligible(provider: string, dateStr: string, shift: string): boolean {
    const profile = this.getRule(provider);
    const prov = this.providers.find(p => p.name === provider);
    if (!prov) return false;

    const dayObj = prov.days.find((d: any) => d.date === dateStr);
    if (!dayObj) return false;

    // If locked and not this shift, ineligible
    if (dayObj.locked && dayObj.value !== shift && dayObj.value !== '') {
      // Block codes mean day off - can't assign any shift
      if (['X', 'L', 'HL'].includes(dayObj.value)) return false;
      // Different shift assignment locked
      return false;
    }

    // Allowed/disallowed
    if (profile.allowed_shifts?.length && !profile.allowed_shifts.includes(shift)) return false;
    if (profile.rules?.disallowed_shifts?.includes(shift)) return false;

    // Sat/Sun rules
    const dow = new Date(dateStr).getDay();

    if (dow === 6 && profile.rules?.saturday_restrictions) {
      const allowed = profile.rules.saturday_restrictions.split(",").map((s: string) => s.trim());
      if (!allowed.includes(shift)) return false;
    }

    if (dow === 0 && profile.rules?.sunday_restrictions) {
      const allowed = profile.rules.sunday_restrictions.split(",").map((s: string) => s.trim());
      if (!allowed.includes(shift)) return false;
    }

    // Rest logic
    if (this.violatesRest(provider, dateStr, shift)) return false;

    return true;
  }

  requiredShifts(dateStr: string): string[] {
    const pattern = this.coverage_pattern[dateStr];
    const base = pattern === 7 ? [...PATTERN7] : [...PATTERN8];
    
    // Add FT W12 for Sundays in Pattern 7
    if (pattern === 7 && new Date(dateStr).getDay() === 0) {
      base.push("FT W12");
    }
    
    return base;
  }

  solve() {
    console.log("Starting HardScheduler.solve()");
    
    // First, apply all locked assignments
    this.applyLockedAssignments();
    
    if (!this.backtrack(0)) {
      throw new Error("Cannot satisfy hard scheduling constraints.");
    }

    this.assignCallShifts();
    this.validateTotals();

    return {
      schedule: this.toOutput(),
      providerTotals: this.computeTotals(),
      warnings: []
    };
  }

  applyLockedAssignments() {
    this.providers.forEach(p => {
      p.days.forEach((day: any) => {
        if (day.locked && day.value && !['X', 'L', 'HL'].includes(day.value)) {
          this.assignments.get(p.name)?.set(day.date, day.value);
          console.log(`Locked: ${p.name} → ${day.date} → ${day.value}`);
        }
      });
    });
  }

  backtrack(idx: number): boolean {
    if (idx >= this.days.length) return true;

    const dateStr = this.days[idx];
    const shifts = this.requiredShifts(dateStr);

    const already = new Set<string>();
    this.providers.forEach(p => {
      const a = this.assignments.get(p.name)?.get(dateStr);
      if (a) already.add(a);
    });

    const needed = shifts.filter(s => !already.has(s));
    return this.assignShiftsForDay(dateStr, needed, 0, idx);
  }

  assignShiftsForDay(dateStr: string, needed: string[], i: number, dayIndex: number): boolean {
    if (i >= needed.length) return this.backtrack(dayIndex + 1);

    const shift = needed[i];

    const order = shift === "D1" ? this.D1Priority() : [...this.providers];

    for (const p of order) {
      if (this.assignments.get(p.name)?.has(dateStr)) continue;
      if (!this.eligible(p.name, dateStr, shift)) continue;

      this.assignments.get(p.name)?.set(dateStr, shift);

      if (this.assignShiftsForDay(dateStr, needed, i + 1, dayIndex)) {
        return true;
      }

      this.assignments.get(p.name)?.delete(dateStr);
    }

    return false;
  }

  D1Priority() {
    const pri = ["Lopez", "Arnett"];
    const first: any[] = [];
    const rest: any[] = [];

    for (const p of this.providers) {
      if (pri.includes(p.name)) first.push(p);
      else rest.push(p);
    }
    return [...first, ...rest];
  }

  assignCallShifts() {
    this.days.forEach(dateStr => {
      // Skip weekends for Call shifts
      if (this.isWeekend(dateStr)) return;

      const eligible = this.providers.filter(p => {
        if (p.name === "Akers") return false;
        return this.eligible(p.name, dateStr, "C");
      });

      if (!eligible.length) {
        console.warn(`No eligible provider for CALL on ${dateStr}`);
        return;
      }

      eligible.sort((a, b) => {
        const aCount = [...(this.assignments.get(a.name)?.values() || [])].filter(s => s === "C").length;
        const bCount = [...(this.assignments.get(b.name)?.values() || [])].filter(s => s === "C").length;
        return aCount - bCount;
      });

      this.assignments.get(eligible[0].name)?.set(dateStr, "C");
    });
  }

  validateTotals() {
    this.providers.forEach(p => {
      const assigned = [...(this.assignments.get(p.name)?.values() || [])].filter(s => !!s);

      if (assigned.length !== p.target_shifts) {
        throw new Error(
          `Shift mismatch for ${p.name}: expected ${p.target_shifts}, got ${assigned.length}`
        );
      }

      const weekends = [...(this.assignments.get(p.name)?.entries() || [])]
        .filter(([d]) => this.isWeekend(d));

      if (weekends.length !== p.weekend_quota) {
        throw new Error(`Weekend quota mismatch for ${p.name}: expected ${p.weekend_quota}, got ${weekends.length}`);
      }
    });
  }

  computeTotals() {
    const totals: Record<string, any> = {};
    this.providers.forEach(p => {
      const allShifts = [...(this.assignments.get(p.name)?.values() || [])].filter(Boolean);
      const weekendShifts = [...(this.assignments.get(p.name)?.entries() || [])]
        .filter(([d]) => this.isWeekend(d)).length;

      totals[p.name] = {
        worked: allShifts.length,
        weekends: weekendShifts,
        call: allShifts.filter(s => s === "C").length,
        admin: allShifts.filter(s => s === "A10").length,
        target: p.target_shifts,
        weekend_quota: p.weekend_quota
      };
    });
    return totals;
  }

  toOutput() {
    const out: any[] = [];
    
    this.days.forEach(dateStr => {
      const pattern = this.coverage_pattern[dateStr];
      const assignments: any[] = [];

      this.providers.forEach(p => {
        const shift = this.assignments.get(p.name)?.get(dateStr);
        if (shift) {
          assignments.push({ shift, provider: p.name });
        }
      });

      out.push({
        date: dateStr,
        pattern,
        pay_period: 1,
        assignments
      });
    });

    return out;
  }
}

// ====================================================================
// ========================== MAIN EDGE FUNCTION =======================
// ====================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("=== Schedule Generation Request Received ===");

    const body = await req.json();
    const base64 = body.file;
    if (!base64) throw new Error("Missing Excel base64 file.");

    // Decode Excel
    const workbook = XLSX.read(base64, { type: "base64" });

    // Server-side parsing
    const input = parseScheduleFromExcel(workbook);
    console.log(`Parsed: ${input.month} ${input.year}, ${input.providers.length} providers`);

    // Extract user from JWT
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token || "");
    const created_by = user?.id ?? null;

    // Fetch DB rules
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("provider_profiles")
      .select("*");

    if (profilesError) throw new Error(`Profile fetch failed: ${profilesError.message}`);

    const { data: constraints, error: constraintsError } = await supabaseAdmin
      .from("provider_constraints")
      .select("*");

    if (constraintsError) throw new Error(`Constraints fetch failed: ${constraintsError.message}`);

    const mergedRules = mergeRules(profiles || [], constraints || []);
    console.log(`Merged rules for ${mergedRules.length} providers`);

    // Run deterministic hard scheduler
    const engine = new HardScheduler(input, mergedRules);
    const result = engine.solve();

    console.log("✓ Schedule generation complete");

    // Save schedule (Option C)
    const { data: saved, error: saveError } = await supabaseAdmin
      .from("schedules")
      .insert({
        month: input.month,
        year: input.year,
        schedule_data: result.schedule,
        provider_totals: result.providerTotals,
        created_by
      })
      .select()
      .single();

    if (saveError) {
      console.error("Save error:", saveError);
    } else {
      console.log(`✓ Saved schedule ID: ${saved.id}`);
    }

    return new Response(
      JSON.stringify({
        schedule: result.schedule,
        provider_totals: result.providerTotals,
        pay_period_totals: {},
        warnings: result.warnings,
        saved_id: saved?.id
      }),
      { 
        headers: { 
          ...corsHeaders,
          "Content-Type": "application/json" 
        } 
      }
    );

  } catch (err: any) {
    console.error("=== Schedule Generation Failed ===");
    console.error(err);
    return new Response(
      JSON.stringify({ 
        error: err.message,
        details: err.stack
      }), 
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
});
