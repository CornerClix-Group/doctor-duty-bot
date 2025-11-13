// ====================================================================
// ========== HARD-CONSTRAINT MEDICAL SCHEDULING ENGINE ===============
// ====================================================================
//
// Architecture:
//  - Frontend uploads raw Excel base64 file
//  - Edge function parses Excel using scheduleParser
//  - Provider rules merged from provider_profiles + provider_constraints
//  - Hard-constraint deterministic scheduler (HardScheduler class)
//  - Save schedule to DB (Option C)
//  - Return schedule JSON to frontend
//
// ====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/v135/xlsx@0.18.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSchedule } from "../../../src/lib/scheduleParser.ts";
import { HardScheduler } from "../../../src/lib/HardScheduler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// -------- Supabase Admin Client (service role) --------
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ====================================================================
// ====================== PROVIDER RULE MERGING =======================
// ====================================================================

function mergeRules(profiles: any[], constraints: any[]) {
  return profiles.map(profile => {
    const constraint = constraints.find(c => c.provider_id === profile.id);

    return {
      name: `${profile.first_name} ${profile.last_name}`.trim(),
      
      // Prioritize constraint arrays if they have values, otherwise use profile arrays
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

    // Decode Excel
    const workbook = XLSX.read(base64, { type: "base64", cellStyles: true });

    // Server-side parsing using scheduleParser
    const input = parseSchedule(workbook);
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

    // Run deterministic hard scheduler with new architecture
    const scheduler = new HardScheduler();
    scheduler.loadProviders(mergedRules);
    scheduler.setProviderDays(input.providers);
    scheduler.setCoveragePattern(input.coverage_pattern);
    
    const result = scheduler.solve();

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
