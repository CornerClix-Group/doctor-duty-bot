// ============================================================================
// generate-schedule-v2/index.ts — FINAL FIXED VERSION
// - Passes providerProfiles to parser
// - Loads provider_profiles + provider_constraints properly
// - Merges constraints correctly
// - Provides Hard Mode validation
// - Schedules + Saves + Returns JSON
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/v135/xlsx@0.18.5";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSchedule } from "./scheduleParser.ts";
import { HardScheduler } from "./HardScheduler.ts";
import { validateSchedule } from "./validateSchedule.ts";

// ---------------------------------------------------------------------------
// SUPABASE
// ---------------------------------------------------------------------------
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ---------------------------------------------------------------------------
// RESPONSE HELPERS
// ---------------------------------------------------------------------------
function errorResponse(status: number, message: string, details?: any) {
  return new Response(JSON.stringify({ error: message, details }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function successResponse(data: any) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

// ---------------------------------------------------------------------------
// SERVER ENTRY
// ---------------------------------------------------------------------------
serve(async (req) => {
  try {
    // -----------------------------------------------------------------------
    // AUTH
    // -----------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");

    const { data: authData, error: userError } = await supabaseAdmin.auth.getUser(
      token
    );

    if (userError || !authData?.user) {
      return errorResponse(401, "Invalid or missing JWT token", userError);
    }

    const userId = authData.user.id;

    // -----------------------------------------------------------------------
    // READ BASE64 FILE
    // -----------------------------------------------------------------------
    const body = await req.json();
    if (!body?.file) {
      return errorResponse(400, "Missing 'file' in body");
    }

    const workbook = XLSX.read(body.file, { type: "base64" });

    // -----------------------------------------------------------------------
    // LOAD PROVIDER PROFILES + CONSTRAINTS
    // -----------------------------------------------------------------------
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("provider_profiles")
      .select("*")
      .eq("active", true)
      .eq("role", "provider");

    if (profilesError) {
      return errorResponse(400, "Unable to load provider_profiles", profilesError);
    }

    const { data: constraints, error: constraintsError } =
      await supabaseAdmin.from("provider_constraints").select("*");

    if (constraintsError) {
      return errorResponse(400, "Unable to load provider_constraints", constraintsError);
    }

    // -----------------------------------------------------------------------
    // MERGE PROFILES WITH CONSTRAINTS
    // -----------------------------------------------------------------------
    const mergedProfiles = profiles.map((p) => {
      const c = constraints.find((cc) => cc.provider_id === p.id);

      return {
        name: `${p.first_name} ${p.last_name}`.trim(),
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        active: p.active,
        role: p.role,

        // Constraints override profiles
        allowed_shifts: c?.allowed_shifts ?? p.allowed_shifts ?? [],
        preferred_shifts: c?.preferred_shifts ?? p.preferred_shifts ?? [],
        rest_hours: c?.rest_hours ?? p.rest_hours ?? 12,
        n_recovery_days: c?.n_recovery_days ?? p.n_recovery_days ?? 2,

        // Nested rules object for scheduler
        rules: {
          disallowed_shifts: c?.disallowed_shifts ?? [],
          saturday_restrictions: c?.saturday_restrictions ?? p.saturday_restrictions,
          sunday_restrictions: c?.sunday_restrictions ?? p.sunday_restrictions,
          max_consecutive_n: c?.max_consecutive_n ?? null,
          block_pattern: c?.block_pattern ?? p.block_pattern,
          weekend_rules: c?.weekend_rules ?? []
        }
      };
    });

    // -----------------------------------------------------------------------
    // PARSE EXCEL TEMPLATE → NOW PASS providerProfiles
    // -----------------------------------------------------------------------
    const parsed = parseSchedule(workbook, mergedProfiles);

    if (!parsed?.providers?.length) {
      return errorResponse(400, "Parser returned zero providers.");
    }

    // -----------------------------------------------------------------------
    // VALIDATION MODE (Hard Mode)
    // -----------------------------------------------------------------------
    const validation = validateSchedule(parsed, mergedProfiles);

    if (!validation.valid) {
      return errorResponse(400, "Schedule validation failed", {
        validation_errors: validation.errors,
        validation_warnings: validation.warnings
      });
    }

    // -----------------------------------------------------------------------
    // RUN SCHEDULER
    // -----------------------------------------------------------------------
    const scheduler = new HardScheduler();
    
    scheduler.setCoveragePattern(parsed.coverage_pattern);
    scheduler.loadProviders(mergedProfiles);
    scheduler.setProviderDays(parsed.providers);
    
    const generatedSchedule = scheduler.solve();

    // -----------------------------------------------------------------------
    // SAVE TO DATABASE (Option C)
    // -----------------------------------------------------------------------
    const { error: saveError } = await supabaseAdmin.from("schedules").insert({
      month: parsed.month,
      year: parsed.year,
      schedule_data: generatedSchedule,
      provider_totals: generatedSchedule.providerTotals ?? {},
      created_by: userId
    });

    if (saveError) {
      console.error("Save error:", saveError);
      // still return successful result
    }

    // -----------------------------------------------------------------------
    // RETURN RESULT
    // -----------------------------------------------------------------------
    return successResponse({
      message: "Schedule generated successfully",
      schedule: generatedSchedule.schedule,
      provider_totals: generatedSchedule.providerTotals,
      pay_period_totals: generatedSchedule.payPeriodTotals,
      warnings: validation.warnings ?? []
    });
  } catch (err: any) {
    console.error("Unhandled error in generate-schedule-v2:", err);
    return errorResponse(500, "Internal Server Error", err?.message || String(err));
  }
});
