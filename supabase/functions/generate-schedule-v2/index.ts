// ====================================================================
// ========== HARD-CONSTRAINT MEDICAL SCHEDULING ENGINE ===============
// ====================================================================
//
// Architecture:
//  - Frontend uploads raw Excel base64 file
//  - Edge function parses Excel inline
//  - Provider rules merged from provider_profiles + provider_constraints
//  - Hard-constraint deterministic scheduler (HardScheduler class)
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

// ====================================================================
// ========================== SHIFT DEFINITIONS =======================
// ====================================================================

const SHIFT_CODES = new Set([
  "D1", "D2",
  "MIDA", "MIDB",
  "E", "N",
  "FT AM", "FT PM", "FT W",
  "C", "A10"
]);

const OFF_CODES = new Set(["X", "L", "LH"]);

// ====================================================================
// ========================== EXCEL PARSER ============================
// ====================================================================

function safeCellValue(cell: any): string {
  if (!cell) return "";
  if (cell.v === undefined || cell.v === null) return "";
  return String(cell.v).trim();
}

function parseConstraintCode(value: string): string[] | null {
  if (!value) return null;

  const lower = value.toLowerCase().trim();

  if (!lower.includes("/") && !["1","2","5","10","10p","am","pm","w","wk","ftw"].includes(lower)) {
    return null;
  }

  const parts = lower.split("/");
  const out: string[] = [];

  for (let part of parts) {
    part = part.replace(/x$/i, "").trim();

    if (part === "1") out.push("D1");
    else if (part === "2") out.push("D2");
    else if (part === "5") out.push("E");
    else if (part === "10" || part === "10p") out.push("N");
    else if (part === "am") out.push("FT AM");
    else if (part === "pm") out.push("FT PM");
    else if (["w","wk","ftw"].includes(part)) out.push("FT W");
  }

  // Option 2: OFF is ALWAYS allowed
  out.push("OFF");

  return out.length > 0 ? out : null;
}

function parseSchedule(workbook: XLSX.WorkBook) {
  console.log('parseSchedule called with workbook:', workbook);
  console.log('Available sheet names:', workbook.SheetNames);
  
  let sheet = workbook.Sheets["Schedule"];
  if (!sheet) {
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      console.error('Workbook has no sheets!');
      throw new Error("Workbook has no sheets.");
    }
    sheet = workbook.Sheets[firstSheetName];
    console.log(`Using sheet: ${firstSheetName}`);
  } else {
    console.log('Using "Schedule" sheet');
  }
  
  if (!sheet) {
    console.error('Sheet is null or undefined');
    throw new Error("Could not access sheet.");
  }
  
  if (!sheet["!ref"]) {
    console.error('Sheet has no cell range reference');
    throw new Error("Sheet is empty.");
  }
  
  const range = XLSX.utils.decode_range(sheet["!ref"]);
  console.log('Sheet range:', range);

  const monthCell = safeCellValue(sheet["A1"]);
  const match = monthCell.match(/([A-Za-z]+)\s+(\d{4})/);
  if (!match) {
    throw new Error("Invalid Month/Year format in A1.");
  }

  const monthName = match[1];
  const year = Number(match[2]);

  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const coverage_pattern: Record<string, number> = {};
  const days: Array<{ date: string, pattern: number }> = [];

  for (let col = 2; col < 2 + daysInMonth; col++) {
    const dateCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: 3, c: col })]);
    if (!dateCell) continue;

    const dayNumber = Number(dateCell);
    const fullDate = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;

    const patternCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: 1, c: col })]);
    const pattern = Number(patternCell) || 7;

    coverage_pattern[fullDate] = pattern;

    days.push({
      date: fullDate,
      pattern
    });
  }

  const providers: any[] = [];

  for (let row = 4; row <= range.e.r; row++) {
    const nameCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]);
    if (!nameCell) continue;

    const weekendQuotaCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: row, c: 1 })]);
    const weekend_quota = Number(weekendQuotaCell) || 0;

    const targetShiftsCell = safeCellValue(sheet[XLSX.utils.encode_cell({ r: row, c: range.e.c })]);
    const target_shifts = Number(targetShiftsCell) || 0;

    const providerDays: any[] = [];

    for (let i = 0; i < days.length; i++) {
      const col = 2 + i;
      const date = days[i].date;

      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const raw = safeCellValue(sheet[cellRef]);

      let locked = false;
      let assigned: string | null = null;
      let constraint: string[] | null = null;

      if (OFF_CODES.has(raw)) {
        locked = true;
        assigned = "OFF";
      }
      else if (SHIFT_CODES.has(raw)) {
        locked = true;
        assigned = raw;
      }
      else {
        const parsed = parseConstraintCode(raw);
        if (parsed) {
          locked = false;
          constraint = parsed;
        }
      }

      providerDays.push({
        date,
        locked,
        assigned,
        constraint,
        value: raw
      });
    }

    providers.push({
      name: nameCell,
      weekend_quota,
      target_shifts,
      days: providerDays
    });
  }

  return {
    month: monthName,
    year,
    coverage_pattern,
    providers
  };
}

// ====================================================================
// ====================== HARD SCHEDULER ENGINE =======================
// ====================================================================

class HardScheduler {
  providers: any[] = [];
  providerDays: any[] = [];
  coveragePattern: Record<string, number> = {};

  schedule: Record<string, Record<string, string | null>> = {}; 
  providerTotals: Record<string, number> = {};
  payPeriodTotals: Record<number, number> = {};
  warnings: string[] = [];

  constructor() {}

  loadProviders(providers: any[]) {
    this.providers = providers;
  }

  setProviderDays(providerDays: any[]) {
    this.providerDays = providerDays;
  }

  setCoveragePattern(pattern: Record<string, number>) {
    this.coveragePattern = pattern;

    Object.keys(pattern).forEach(date => {
      this.schedule[date] = {};
    });
  }

  preloadAssignments() {
    for (let provider of this.providerDays) {
      const name = provider.name;

      for (let day of provider.days) {
        const date = day.date;

        if (day.assigned === "OFF") {
          this.schedule[date][name] = "OFF";
          continue;
        }

        if (day.assigned && SHIFT_CODES.has(day.assigned)) {
          this.schedule[date][name] = day.assigned;

          if (this.coveragePattern[date] > 0) {
            this.coveragePattern[date] -= 1;
          }

          continue;
        }
      }
    }
  }

  isShiftAllowed(provider: any, providerDay: any, shift: string, date: string): boolean {
    const constraint = providerDay.constraint;

    if (constraint) {
      if (shift === "OFF") return true;
      return constraint.includes(shift);
    }

    if (shift === "OFF") return true;

    const allowed = provider.allowed_shifts || [];
    const disallowed = provider.rules?.disallowed_shifts || [];

    if (allowed.length > 0 && !allowed.includes(shift)) return false;
    if (disallowed.includes(shift)) return false;

    const dayOfWeek = new Date(date).getDay();
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

  violatesRest(providerName: string, date: string, shift: string, provider: any): boolean {
    const prevDate = this.getPreviousDate(date);
    if (!prevDate) return false;

    const prevShift = this.schedule[prevDate]?.[providerName];
    if (!prevShift || prevShift === "OFF") return false;

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

  solve() {
    this.preloadAssignments();

    const dates = Object.keys(this.schedule).sort();

    for (let date of dates) {
      let coverageNeeded = this.coveragePattern[date] || 0;

      if (coverageNeeded <= 0) continue;

      for (let provider of this.providers) {
        if (coverageNeeded <= 0) break;

        const providerDay = this.getProviderDay(provider.name, date);

        if (this.schedule[date][provider.name]) continue;

        if (providerDay.assigned === "OFF") continue;

        for (let shift of SHIFT_CODES) {
          if (this.violatesRest(provider.name, date, shift, provider))
            continue;

          if (!this.isShiftAllowed(provider, providerDay, shift, date))
            continue;

          this.schedule[date][provider.name] = shift;
          coverageNeeded -= 1;
          break;
        }
      }

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

  getProviderDay(providerName: string, date: string) {
    const provider = this.providerDays.find((p: any) => p.name === providerName);
    if (!provider) throw new Error(`Provider ${providerName} missing in parser output.`);

    const day = provider.days.find((d: any) => d.date === date);
    if (!day) throw new Error(`Missing day record for ${providerName} on ${date}`);

    return day;
  }

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

      if (ppCounter < 14) ppCounter++;
      else ppCounter = 1;
    }
  }
}

// ====================================================================
// ====================== PROVIDER RULE MERGING =======================
// ====================================================================

function mergeRules(profiles: any[], constraints: any[]) {
  return profiles.map(profile => {
    const constraint = constraints.find(c => c.provider_id === profile.id);

    return {
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      
      allowed_shifts: constraint?.allowed_shifts?.length
        ? constraint.allowed_shifts
        : (profile.allowed_shifts || []),

      preferred_shifts: constraint?.preferred_shifts?.length
        ? constraint.preferred_shifts
        : (profile.preferred_shifts || []),

      rest_hours: constraint?.rest_hours ?? profile.rest_hours ?? 12,
      n_recovery_days: constraint?.n_recovery_days ?? profile.n_recovery_days ?? 2,

      rules: {
        disallowed_shifts: constraint?.disallowed_shifts ?? [],
        saturday_restrictions: constraint?.saturday_restrictions ?? profile.saturday_restrictions ?? "all",
        sunday_restrictions: constraint?.sunday_restrictions ?? profile.sunday_restrictions ?? "all",
        weekend_rules: constraint?.weekend_rules ?? [],
        block_pattern: constraint?.block_pattern ?? profile.block_pattern ?? null,
        max_consecutive_n: constraint?.max_consecutive_n ?? null,
      },
    };
  });
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

    const workbook = XLSX.read(base64, { type: "base64", cellStyles: true });

    const input = parseSchedule(workbook);
    console.log(`Parsed: ${input.month} ${input.year}, ${input.providers.length} providers`);

    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token || "");
    const created_by = user?.id ?? null;

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

    const scheduler = new HardScheduler();
    scheduler.loadProviders(mergedRules);
    scheduler.setProviderDays(input.providers);
    scheduler.setCoveragePattern(input.coverage_pattern);
    
    const result = scheduler.solve();

    console.log("✓ Schedule generation complete");

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
        pay_period_totals: result.payPeriodTotals,
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
