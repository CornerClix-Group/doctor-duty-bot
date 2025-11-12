import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { providerProfiles, scheduleData } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build the system prompt for the AI
    const systemPrompt = `You are the Shift Pro Scheduling Engine. Generate a complete, rule-compliant monthly schedule.

INPUTS:
- provider_profiles: static rules per provider (allowed_shifts, disallowed_shifts, rest_hours, n_recovery_days, etc.).
- schedule_data: parsed monthly inputs from upload:
  {
    "month": "...",
    "coverage_pattern": { "<YYYY-MM-DD>": 7|8, ... },
    "providers": [
      {
        "name": "First Last",
        "target_shifts": <number>,
        "weekend_quota": <number>,
        "days": [ { "date":"YYYY-MM-DD","value":"", "locked": false } ... ]
      }
    ]
  }

SHIFT DEFINITIONS (10h):
D1 06:00–16:00, FT AM 07:00–17:00, D2 08:00–18:00, MIDA 11:00–21:00,
FT PM 14:00–00:00, MIDB 15:00–01:00, E 17:00–03:00, N 22:00–08:00, FT W 10:00–20:00

DAILY COVERAGE:
If pattern=7 → {D1, D2, MIDA, MIDB, E, N, FT W}
If pattern=8 → {D1, D2, MIDA, MIDB, E, N, FT AM, FT PM}
Each required shift appears exactly once per day. One shift max per provider per day.

GLOBAL RULES:
- ≥12h rest between any two shifts.
- After N: 2 full days off before any non-N shift.
- Match each provider's target_shifts exactly.
- Satisfy each provider's weekend_quota exactly if possible; otherwise ±1 only if unavoidable.
- Respect all allowed/disallowed constraints.

PROVIDER-SPECIFIC RULES:
- Coffin → N only; work in 3–4 N blocks; then ≥2 days off; no other shifts.
- Cary → All except D1; prefers MIDB→E→N; ≤4 N in a row.
- Venugopal → E only; ≤2 E in a row; ≥2 days off after an E run.
- Lopez → D1 or FT AM only; ≤2 consecutive total shifts; never N.
- Orlando, Beckman → Any except N.
- Ryals, Campo-Ford, Sellars-Pompey → only FT AM, FT PM, FT W, MIDA.
- Arnett → No E/N on Sat; on Sun only MIDB/E/N; avoid Sun if possible.
- Beach → Avoid Sun; if must work Sun → only MIDB/E/N.
- Akers → All except "C".
- D1 eligibility priority: Lopez > Arnett > Beres/Illston/Freeman/Ferguson/Jones (then others).

ADDITIONAL RULES — EXISTING CELLS & HOLIDAYS:
- Never overwrite any pre-existing shift, X, L, or HL from schedule_data.providers[].days[].
- Treat X/L/HL as locked=true rest/leave/holiday and count them for rest spacing; do NOT count them toward worked totals.
- If a day is HL, leave it unscheduled unless a shift is already pre-assigned.
- Preserve locked entries in output (use the same date with value "HL", "X", or "L" if present).
- If preserving locks creates gaps, fill with eligible providers without violating any rule.

OUTPUT (JSON only):
{
  "month": "<Month Year>",
  "schedule": [
    { "date": "YYYY-MM-DD", "shift": "D1", "provider": "Last or First Last" }
  ],
  "provider_totals": [
    { "provider": "First Last", "total": <number>, "weekend": <number> }
  ]
}

ENFORCEMENT:
These are hard constraints, not preferences. If a constraint prevents filling a shift, leave that shift unfilled and add a single object at the end of the output:
"notes": ["<YYYY-MM-DD> <shift> could not be assigned because <reason>"].
Return only valid JSON conforming to the schema. No narrative text.`;

    const userPrompt = `Generate a complete monthly schedule.

PROVIDER PROFILES:
${JSON.stringify(providerProfiles, null, 2)}

SCHEDULE DATA:
${JSON.stringify(scheduleData, null, 2)}

Generate the complete monthly schedule following all constraints and rules.`;

    console.log("Calling Lovable AI for schedule generation...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the content and remove markdown code fences if present
    let content = data.choices[0].message.content;
    console.log("Raw AI response:", content.substring(0, 200)); // Log first 200 chars for debugging
    
    // Remove markdown code fences if present
    if (content.startsWith('```')) {
      // Remove opening fence (```json or ```)
      content = content.replace(/^```(?:json)?\n/, '');
      // Remove closing fence
      content = content.replace(/\n```$/, '');
    }
    
    const generatedSchedule = JSON.parse(content);
    console.log("Schedule generated successfully");

    return new Response(JSON.stringify(generatedSchedule), {
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