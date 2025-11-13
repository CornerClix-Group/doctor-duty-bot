// ============================================================================
// generate-schedule-v2/index.ts
// Final Integrated Version (Parser + HardScheduler + Provider Rule Merge)
// Supports:
//   - Preassigned shifts
//   - OFF/X/L/LH
//   - Constraint codes (override all rules)
//   - Coverage pattern (7/8 or edited by user)
//   - Deterministic scheduling
//   - Option C: Save + Return JSON
//   - Supabase Admin + Auth ID extraction
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as XLSX from "https://esm.sh/v135/xlsx@0.18.5";

import { parseSchedule } from "./scheduleParser.ts";
import { HardScheduler } from "./HardScheduler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// INIT SUPABASE ADMIN CLIENT
// ---------------------------------------------------------------------------
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// ---------------------------------------------------------------------------
// GET USER ID FROM JWT TOKEN
// ---------------------------------------------------------------------------
async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return null;
  return user.id;
}

// ---------------------------------------------------------------------------
// MERGE provider_profiles + provider_constraints INTO ONE RULESET
// ---------------------------------------------------------------------------
async function loadMergedProviders() {
  const { data: profiles, error: pErr } = await supabaseAdmin
    .from("provider_profiles")
    .select("*");

  if (pErr) throw new Error("Failed to load provider_profiles");

  const { data: constraints, error: cErr } = await supabaseAdmin
    .from("provider_constraints")
    .select("*");

  if (cErr) throw new Error("Failed to load provider_constraints");

  const merged = profiles.map(profile => {
    const c = constraints.find(x => x.provider_id === profile.id);

    return {
      name: `${profile.first_name} ${profile.last_name}`.trim(),

      allowed_shifts:
        c?.allowed_shifts?.length
          ? c.allowed_shifts
          : profile.allowed_shifts || [],

      preferred_shifts:
        c?.preferred_shifts?.length
          ? c.preferred_shifts
          : profile.preferred_shifts || [],

      rest_hours: c?.rest_hours ?? profile.rest_hours ?? 12,
      n_recovery_days: c?.n_recovery_days ?? profile.n_recovery_days ?? 2,

      rules: {
        disallowed_shifts: c?.disallowed_shifts ?? [],
        saturday_restrictions:
          c?.saturday_restrictions ??
          profile.saturday_restrictions ??
          "all",
        sunday_restrictions:
          c?.sunday_restrictions ??
          profile.sunday_restrictions ??
          "all",
        weekend_rules: c?.weekend_rules ?? [],
        block_pattern: c?.block_pattern ?? profile.block_pattern ?? null,
        max_consecutive_n: c?.max_consecutive_n ?? null
      }
    };
  });

  return merged;
}

// ============================================================================
// MAIN EDGE FUNCTION HANDLER
// ============================================================================
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    // -----------------------------------------------------------------------
    // STEP 1 — IDENTIFY USER
    // -----------------------------------------------------------------------
    const userId = await getUserIdFromRequest(req);

    // -----------------------------------------------------------------------
    // STEP 2 — READ BODY (base64 Excel file)
    // -----------------------------------------------------------------------
    const body = await req.json();
    if (!body.file) {
      return new Response(JSON.stringify({ error: "Missing 'file' in request." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // -----------------------------------------------------------------------
    // STEP 3 — PARSE BASE64 EXCEL FILE
    // -----------------------------------------------------------------------
    const workbook = XLSX.read(body.file, { type: "base64", cellStyles: true });
    const parsed = parseSchedule(workbook);

    const {
      month,
      year,
      coverage_pattern,
      providers: providerDays
    } = parsed;

    console.log(`Parsed: ${month} ${year}, ${providerDays.length} providers`);

    // -----------------------------------------------------------------------
    // STEP 4 — LOAD MERGED PROVIDER RULES
    // -----------------------------------------------------------------------
    const mergedProviders = await loadMergedProviders();
    console.log(`Merged rules for ${mergedProviders.length} providers`);

    // -----------------------------------------------------------------------
    // STEP 5 — CREATE SCHEDULER
    // -----------------------------------------------------------------------
    const scheduler = new HardScheduler();

    scheduler.setCoveragePattern(coverage_pattern);
    scheduler.loadProviders(mergedProviders);
    scheduler.setProviderDays(providerDays);

    // -----------------------------------------------------------------------
    // STEP 6 — SOLVE SCHEDULE
    // -----------------------------------------------------------------------
    const result = scheduler.solve();

    console.log("✓ Schedule generation complete");

    // -----------------------------------------------------------------------
    // STEP 7 — SAVE TO SCHEDULES TABLE (Option C)
    // -----------------------------------------------------------------------
    const { schedule, providerTotals, payPeriodTotals, warnings } = result;

    const { data: saved, error: saveErr } = await supabaseAdmin
      .from("schedules")
      .insert({
        month,
        year,
        schedule_data: schedule,
        provider_totals: providerTotals,
        created_by: userId
      })
      .select()
      .single();

    if (saveErr) {
      console.error("Save error:", saveErr);
    } else {
      console.log(`✓ Saved schedule ID: ${saved.id}`);
    }

    // -----------------------------------------------------------------------
    // STEP 8 — RETURN JSON SCHEDULE
    // -----------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        schedule,
        providerTotals,
        payPeriodTotals,
        warnings,
        saved: !saveErr,
        saved_id: saved?.id
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );

  } catch (err: any) {
    console.error("Scheduler ERROR:", err);

    return new Response(
      JSON.stringify({
        error: String(err.message || err),
        details: String(err.stack || err)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      }
    );
  }
});
