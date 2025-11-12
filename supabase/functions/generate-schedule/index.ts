import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.77.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `
You are the Shift Pro Scheduling Engine. Generate a complete, rule-compliant monthly schedule.

INPUT OBJECTS
- provider_profiles: permanent rules per provider (allowed_shifts, disallowed_shifts, rest_hours, n_recovery_days, preferred_shifts, block_pattern, etc.).
- schedule_data: parsed monthly inputs from the uploaded sheet:
  {
    "month": "Month YYYY",
    "coverage_pattern": { "YYYY-MM-DD": 7|8, ... },
    "providers": [
      {
        "name": "First Last",
        "target_shifts": <number>,
        "weekend_quota": <number>,
        "days": [ { "date":"YYYY-MM-DD", "value":"", "locked": false }, ... ]
      }
    ]
  }

SHIFT DEFINITIONS (10 h)
D1 06:00–16:00; FT AM 07:00–17:00; D2 08:00–18:00; MIDA 11:00–21:00;
FT PM 14:00–00:00; MIDB 15:00–01:00; E 17:00–03:00; N 22:00–08:00; FT W 10:00–20:00

COVERAGE BY PATTERN
If 7 → {D1, D2, MIDA, MIDB, E, N, FT W}
If 8 → {D1, D2, MIDA, MIDB, E, N, FT AM, FT PM}
Each required shift appears exactly once per day. Max 1 shift per provider per day.

GLOBAL RULES
- ≥12h rest between any two shifts.
- After N: 2 full days off before any non-N shift.
- Match each provider's target_shifts exactly.
- Match weekend_quota (Sat+Sun) exactly if possible; otherwise ±1 only if unavoidable.
- Respect allowed/disallowed constraints.

PROVIDER-SPECIFIC RULES
- Coffin → N only; blocks of 3–4 N; then ≥2 days off; no other shifts.
- Cary → All except D1; prefers MIDB→E→N; ≤4 N in a row.
- Venugopal → E only; ≤2 E in a row; ≥2 days off after E run.
- Lopez → D1 or FT AM only; ≤2 consecutive total shifts; never N.
- Orlando, Beckman → Any except N.
- Ryals, Campo-Ford, Sellars-Pompey → only FT AM, FT PM, FT W, MIDA.
- Arnett → No E/N on Sat; on Sun only MIDB/E/N; avoid Sun if possible.
- Beach → Avoid Sun; if must work Sun → only MIDB/E/N.
- Akers → All except "C".
- D1 eligibility priority: Lopez > Arnett > Beres/Illston/Freeman/Ferguson/Jones > others.

LOCKED CELLS & HOLIDAYS
- Never overwrite any pre-existing shift, X, L, or HL from schedule_data.providers[].days[].
- Treat X/L/HL as locked rest/leave/holiday; count them for spacing; do NOT count them as worked shifts.
- If a day is HL, leave unscheduled unless a shift is pre-assigned.
- Preserve locked entries in output (use "shift":"HL" or "X"/"L" with the same date if present).
- If locks create gaps, fill with eligible providers without violating rules.

OUTPUT (JSON only, no prose)
{
  "month": "Month YYYY",
  "schedule": [
    { "date": "YYYY-MM-DD", "shift": "D1|D2|MIDA|MIDB|E|N|FT AM|FT PM|FT W|HL|X|L", "provider": "First Last or '' for HL" }
  ],
  "provider_totals": [
    { "provider": "First Last", "total": <number>, "weekend": <number> }
  ],
  "notes": [ "...optional reasons for any unfilled shift..." ]
}

ENFORCEMENT
All constraints are hard. If a shift cannot be assigned without violating a rule, leave it unfilled and explain once in "notes".
Return ONLY valid JSON conforming to the provided schema.
`;

const OUTPUT_SCHEMA = {
  name: "GeneratedSchedule",
  schema: {
    type: "object",
    properties: {
      month: { type: "string" },
      schedule: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            shift: { type: "string" },
            provider: { type: "string" }
          },
          required: ["date", "shift", "provider"],
          additionalProperties: false
        }
      },
      provider_totals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            provider: { type: "string" },
            total: { type: "number" },
            weekend: { type: "number" }
          },
          required: ["provider", "total", "weekend"],
          additionalProperties: false
        }
      },
      notes: { type: "array", items: { type: "string" } }
    },
    required: ["month", "schedule", "provider_totals"],
    additionalProperties: false
  },
  strict: true
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { provider_profiles, schedule_data } = await req.json();
    
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

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

    console.log("Calling OpenAI for schedule generation...");

    const client = new OpenAI({ apiKey: OPENAI_API_KEY });

    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: JSON.stringify({ provider_profiles, schedule_data })
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: OUTPUT_SCHEMA }
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const data = JSON.parse(raw);

    // Server-side validation: check locked cells
    const lockedViolations: string[] = [];
    const lockedMap = new Map<string, string>();
    
    for (const p of schedule_data.providers) {
      for (const d of p.days ?? []) {
        if (d.locked && d.value) {
          lockedMap.set(`${d.date}|${p.name}`, d.value);
        }
      }
    }
    
    for (const row of data.schedule ?? []) {
      const key = `${row.date}|${row.provider}`;
      const locked = lockedMap.get(key);
      if (locked && locked !== row.shift) {
        lockedViolations.push(`${row.date} ${row.provider}: expected ${locked}, got ${row.shift}`);
      }
    }
    
    if (lockedViolations.length) {
      console.error("Locked cell violations:", lockedViolations);
      return new Response(
        JSON.stringify({ 
          error: "Locked cell violation", 
          details: lockedViolations.slice(0, 10) 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Schedule generated successfully");

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in generate-schedule function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate schedule" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});