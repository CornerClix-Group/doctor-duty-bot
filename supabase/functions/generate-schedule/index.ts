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

SHIFT DEFINITIONS (PATTERN-DEPENDENT):

Pattern 7 (10-hour shifts):
- D1: 06:00-16:00
- D2: 08:00-18:00
- MIDA (MID1): 11:00-21:00
- MIDB (MID2): 14:00-00:00
- E: 16:00-02:00
- N: 21:00-07:00
- FT W: weekend coverage
- FT W12: 12:00-22:00 (Sundays only)

Pattern 8 (9-hour shifts):
- D1: 06:00-15:00
- D2: 08:00-17:00
- MIDA (MID1): 11:00-20:00
- MIDB (MID2): 15:00-00:00
- E: 17:00-02:00
- N: 22:00-07:00
- FT AM: morning coverage
- FT PM: evening coverage

SPECIAL SHIFT TYPES:

C (Call Shift):
- Hours: 06:00-22:00 (must be available)
- Counts toward Pay Period total of 8
- Does NOT count toward weekend quota
- Does NOT count toward target total shifts
- NEVER scheduled on weekends (Saturday/Sunday)
- Follows 12-hour rest rule (must have 12 hours before/after)

A10 (Admin Shift):
- Counts toward Pay Period total of 8
- Does NOT count toward weekend quota
- Does NOT count toward target total shifts
- NEVER scheduled on weekends (Saturday/Sunday)

COVERAGE BY PATTERN
If 7 → {D1, D2, MIDA, MIDB, E, N, FT W} (and FT W12 on Sundays)
If 8 → {D1, D2, MIDA, MIDB, E, N, FT AM, FT PM}
Each required shift appears exactly once per day. Max 1 shift per provider per day.

HARD CONSTRAINTS (MUST BE SATISFIED):

1. Target Total Shifts (from Column AI):
   - Each provider MUST work exactly their target_shifts number
   - Count ONLY regular work shifts (D1, D2, MIDA, MIDB, E, N, FT types)
   - EXCLUDE: C, A10, X, L, LH from this count

2. Weekend Quota (from Column B):
   - Each provider MUST work exactly their weekend_quota number on weekends
   - Count ONLY regular work shifts on Saturday/Sunday
   - EXCLUDE: C, A10, X, L, LH from this count
   - Weekend grouping preferences:
     * Quota 2: Both on same weekend (Saturday + Sunday together)
     * Quota 3: Group as 2+1 (one full weekend + one separate day)
     * Quota 4: Group as 2+2 (two full weekends)

3. Pay Period Constraint:
   - Each provider MUST have exactly 8 total assignments per pay period
   - Count INCLUDES: regular shifts + C + A10
   - Each PP spans exactly 14 days
   - Federal government 26 two-week pay period system

4. Rest Requirements:
   - Minimum 12 hours between shifts
   - After N (Night) shift: provider requires at least 2 full days off before any non-N shift
   - C and A10 follow 12-hour rest rule

5. Locked Cells:
   - NEVER overwrite cells marked: X, L, LH, or pre-assigned shifts
   - X and L count as true rest days for recovery calculations
   - LH (Holiday) is protected
   - Preserve all locked entries in output

6. Daily Constraint Codes:
   - If a date has constraint code (e.g., "1/x"), provider can ONLY be assigned shifts listed
   - "1/x" = only D1 or off
   - "5/10/x" = only E or N or off
   - "1/2/Amx" = only D1, D2, FT AM, or off
   - If blank/X is the only option per constraint, leave provider off that day

7. Weekend Restrictions for C and A10:
   - C shifts: NEVER on Saturday or Sunday
   - A10 shifts: NEVER on Saturday or Sunday

8. Respect allowed/disallowed constraints from provider_profiles

PROVIDER-SPECIFIC RULES (from provider_profiles)
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

IMPOSSIBLE CONSTRAINTS HANDLING:

If constraints cannot all be satisfied:
- Get as close as possible to all targets
- Prioritize in this order:
  1. Locked cells (never violate)
  2. Daily constraint codes (never violate)
  3. Rest requirements (12 hours, N recovery)
  4. Target total shifts (try to match exactly)
  5. Weekend quota (try to match exactly)
  6. Pay Period totals (try to match 8)
- Can reduce days off (change X to a shift) if needed to meet targets
- Return detailed error/warning explaining what couldn't be met

OUTPUT (JSON only, no prose)
{
  "month": "Month YYYY",
  "schedule": [
    {
      "date": "YYYY-MM-DD",
      "pattern": 7|8,
      "pay_period": 1-14,
      "assignments": [
        { "shift": "D1|D2|MIDA|MIDB|E|N|FT AM|FT PM|FT W|FT W12|C|A10|LH|X|L", "provider": "First Last or '' for LH/X/L" }
      ]
    }
  ],
  "provider_totals": {
    "First Last": {
      "worked": <number>,           // Regular shifts only
      "weekends": <number>,         // Weekend regular shifts only
      "call": <number>,             // C shifts
      "admin": <number>,            // A10 shifts
      "target": <number>,           // From Column AI
      "weekend_quota": <number>     // From Column B
    }
  },
  "pay_period_totals": {
    "First Last": {
      "PP1": 8,  // Must equal 8 (regular + C + A10)
      "PP2": 8,
      ...
    }
  },
  "warnings": ["...optional reasons for any unfilled shift or constraint violation..."]
}

ENFORCEMENT
All constraints are hard. If a shift cannot be assigned without violating a rule, leave it unfilled and explain once in "warnings".
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
            pattern: { type: "number" },
            pay_period: { type: "number" },
            assignments: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  shift: { type: "string" },
                  provider: { type: "string" }
                },
                required: ["shift", "provider"],
                additionalProperties: false
              }
            }
          },
          required: ["date", "pattern", "pay_period", "assignments"],
          additionalProperties: false
        }
      },
      provider_totals: {
        type: "object",
        additionalProperties: {
          type: "object",
          properties: {
            worked: { type: "number" },
            weekends: { type: "number" },
            call: { type: "number" },
            admin: { type: "number" },
            target: { type: "number" },
            weekend_quota: { type: "number" }
          },
          required: ["worked", "weekends", "call", "admin", "target", "weekend_quota"],
          additionalProperties: false
        }
      },
      pay_period_totals: {
        type: "object",
        additionalProperties: {
          type: "object",
          additionalProperties: { type: "number" }
        }
      },
      warnings: { type: "array", items: { type: "string" } }
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
      if (!p.name) continue;
      for (const d of p.days ?? []) {
        if (d.locked && d.value) {
          lockedMap.set(`${d.date}|${p.name}`, d.value);
        }
      }
    }
    
    // Validate each day's assignments
    for (const daySchedule of data.schedule ?? []) {
      for (const assignment of daySchedule.assignments ?? []) {
        const key = `${daySchedule.date}|${assignment.provider}`;
        const locked = lockedMap.get(key);
        if (locked && locked !== assignment.shift) {
          lockedViolations.push(`${daySchedule.date} ${assignment.provider}: expected ${locked}, got ${assignment.shift}`);
        }
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