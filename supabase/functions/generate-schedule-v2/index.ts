// ============================================================================
// generate-schedule-v2/index.ts — FINAL VERSION
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/v135/xlsx@0.18.5";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSchedule } from "./scheduleParser.ts";
import { validateSchedule } from "./validateSchedule.ts";
import { HardScheduler } from "./HardScheduler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

function response(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

serve(async (req) => {
  try {
    const body = await req.json();

    // Load providers
    const { data: profiles } = await supabaseAdmin
      .from("provider_profiles")
      .select("*")
      .eq("active", true)
      .eq("role", "provider");

    const { data: constraints } = await supabaseAdmin
      .from("provider_constraints")
      .select("*");

    // Merge
    const mergedProfiles = (profiles || []).map((p) => {
      const c = (constraints || []).find((cc) => cc.provider_id === p.id);
      return {
        first_name: p.first_name,
        last_name: p.last_name,
        email: p.email,
        active: p.active,
        role: p.role,
        allowed_shifts: c?.allowed_shifts ?? p.allowed_shifts ?? [],
        preferred_shifts: c?.preferred_shifts ?? p.preferred_shifts ?? [],
        rest_hours: c?.rest_hours ?? p.rest_hours ?? 12,
        n_recovery_days: c?.n_recovery_days ?? p.n_recovery_days ?? 2,
        rules: {
          disallowed_shifts: c?.disallowed_shifts ?? [],
          saturday_restrictions:
            c?.saturday_restrictions ?? p.saturday_restrictions,
          sunday_restrictions:
            c?.sunday_restrictions ?? p.sunday_restrictions,
          weekend_rules: c?.weekend_rules ?? [],
          block_pattern: c?.block_pattern ?? p.block_pattern,
          max_consecutive_n: c?.max_consecutive_n ?? null
        }
      };
    });

    let parsed;

    // Use provided parsed data
    if (body.mode === "schedule" && body.scheduleData) {
      parsed = body.scheduleData;
    } else {
      // Parse Excel file if doing validation-only
      const workbook = XLSX.read(body.file, { type: "base64" });
      parsed = parseSchedule(workbook, mergedProfiles);
    }

    // VALIDATION PASS
    const validation = validateSchedule(parsed, mergedProfiles);

    if (body.mode === "validateOnly") {
      if (!validation.valid) {
        return response(400, {
          validation_errors: validation.errors,
          validation_warnings: validation.warnings
        });
      }

      return response(200, {
        parsedSchedule: parsed,
        validation_warnings: validation.warnings
      });
    }

    // GENERATION PASS
    const scheduler = new HardScheduler();
    scheduler.loadProviders(mergedProfiles);
    scheduler.setProviderDays(parsed.providers);
    scheduler.setCoveragePattern(parsed.coverage_pattern);
    const generated = scheduler.solve();

    return response(200, generated);
  } catch (err: any) {
    console.error(err);
    return response(500, {
      error: "Internal Server Error",
      details: err?.message || String(err)
    });
  }
});
