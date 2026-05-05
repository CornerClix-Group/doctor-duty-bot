// ED Schedule Manager — generate-schedule-v2 entry point (best-effort, never throws)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as XLSX from "https://esm.sh/xlsx@0.18.5";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseSchedule } from "./scheduleParser.ts";
import { validateInputs } from "./validateSchedule.ts";
import { solve, type ProviderRules, type MonthlyRequest } from "./solver.ts";
import type { ShiftCode } from "./shifts.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function asArr<T = any>(v: any): T[] { return Array.isArray(v) ? v : []; }

async function buildRulesByName(): Promise<Map<string, ProviderRules>> {
  const { data: providers } = await supabaseAdmin
    .from("providers")
    .select("id, name, target_shifts, weekend_quota, active");
  const { data: constraints } = await supabaseAdmin
    .from("provider_constraints")
    .select("*");

  const cByPid = new Map<string, any>();
  for (const c of asArr(constraints)) cByPid.set(c.provider_id, c);

  const map = new Map<string, ProviderRules>();
  for (const p of asArr(providers)) {
    const c = cByPid.get(p.id) || {};
    const allowed = asArr<string>(c.allowed_shifts);
    const disallowed = asArr<string>(c.disallowed_shifts);
    const sunAllowed = asArr<string>(c.sun_allowed_shifts);
    const rules: ProviderRules = {
      name: p.name,
      active: p.active !== false,
      target: p.target_shifts ?? 0,
      weekend_quota: p.weekend_quota ?? 0,
      allowed_shifts: allowed.length ? (allowed as ShiftCode[]) : null,
      disallowed_shifts: disallowed as ShiftCode[],
      sat_disallowed_shifts: asArr<string>(c.sat_disallowed_shifts) as ShiftCode[],
      sun_allowed_shifts: sunAllowed.length ? (sunAllowed as ShiftCode[]) : null,
      avoid_sunday: !!c.avoid_sunday,
      recovery_days: c.recovery_days ?? c.n_recovery_days ?? 2,
      block_min: c.block_min ?? null,
      block_max: c.block_max ?? null,
      max_consec: c.max_consec ?? null,
      max_consec_n: c.max_consec_n ?? null,
      max_consec_e: c.max_consec_e ?? null,
      recovery_after_e: c.recovery_after_e ?? null,
      rest_hours: c.rest_hours ?? 12,
      is_specialist_n: allowed.length === 1 && allowed[0] === "N",
      is_specialist_e: allowed.length === 1 && allowed[0] === "E",
      is_specialist_ft: allowed.length > 0 && allowed.every(s =>
        s === "MIDA" || s === "FT" || s === "FT W" || s === "FT W12" || s === "FT AM" || s === "FT PM"),
    };
    map.set(p.name.toLowerCase(), rules);
  }
  return map;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "schedule";
    const scheduleId: string | undefined = body.scheduleId;
    const requests: MonthlyRequest[] = asArr(body.requests);

    // 1) Parse input
    let parsed;
    try {
      if (body.scheduleData) {
        parsed = body.scheduleData;
      } else if (body.file) {
        const wb = XLSX.read(body.file, { type: "base64" });
        parsed = parseSchedule(wb);
      } else {
        return json(400, { error: "Provide either `file` (base64 xlsx) or `scheduleData`." });
      }
    } catch (e: any) {
      return json(400, { error: "Parse failed", details: e?.message || String(e) });
    }

    // 2) Build rules
    const rules = await buildRulesByName();

    // 3) Validate (non-blocking)
    const inputIssues = validateInputs(parsed, rules);

    if (mode === "validateOnly") {
      return json(200, {
        parsedSchedule: parsed,
        errors: inputIssues.errors,
        warnings: inputIssues.warnings,
        info: inputIssues.info,
      });
    }

    // 4) Solve (best-effort, never throws)
    let result;
    try {
      result = solve(parsed, rules, requests);
    } catch (e: any) {
      return json(200, {
        month: parsed.month,
        year: parsed.year,
        schedule: [],
        provider_totals: {},
        pp_hours: {},
        errors: [{ rule: 0, severity: "error", message: `Solver crash: ${e?.message || e}` }],
        warnings: [],
        info: [],
      });
    }

    // Merge pre-validation issues
    result.errors = [...inputIssues.errors, ...result.errors];
    result.warnings = [...inputIssues.warnings, ...result.warnings];
    result.info = [...inputIssues.info, ...result.info];

    // 5) Persist (best-effort)
    try {
      const authHeader = req.headers.get("Authorization");
      let createdBy: string | null = null;
      if (authHeader?.startsWith("Bearer ")) {
        const { data } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
        createdBy = data?.user?.id ?? null;
      }
      const row = {
        month: result.month,
        year: result.year,
        status: "validated",
        schedule_data: result.schedule,
        provider_totals: result.provider_totals,
        assignments: result.schedule,
        coverage_pattern: result.coverage_pattern,
        base_coverage_value: result.base_coverage_value,
        monday_ft_rule_active: result.monday_ft_rule_active,
        pp_hours: result.pp_hours,
        validation_results: {
          errors: result.errors,
          warnings: result.warnings,
          info: result.info,
        },
        created_by: createdBy,
      };
      if (scheduleId) {
        await supabaseAdmin.from("schedules").update(row).eq("id", scheduleId);
      } else {
        await supabaseAdmin.from("schedules").insert(row);
      }
    } catch (e) {
      console.error("Persist failed:", e);
    }

    return json(200, result);
  } catch (err: any) {
    console.error("generate-schedule-v2 error:", err);
    return json(500, { error: "Internal error", details: err?.message || String(err) });
  }
});