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
    const systemPrompt = `You are the Shift Pro Scheduling Engine. Your job is to generate a complete, rule-compliant monthly physician schedule.

INPUTS:
1. provider_profiles — a JSON array of permanent rules for each provider. Example:
[
  {
    "first_name": "Nicole",
    "last_name": "Lopez",
    "email": "nlopez1693@gmail.com",
    "allowed_shifts": ["D1","FT AM"],
    "rules": { "max_consecutive_shifts": 2, "disallowed_shifts": ["N"], "rest_hours": 12 }
  }
]

2. schedule_data — a JSON object for the current month, parsed from the uploaded spreadsheet. Example:
{
  "month": "January 2026",
  "providers": [
    { "name": "Troy Akers", "target_shifts": 35, "weekend_quota": 4 },
    { "name": "David Coffin", "target_shifts": 12, "weekend_quota": 2 }
  ]
}

CONTEXT:
Each day in the schedule has a coverage pattern defined by Row 2 of the spreadsheet:

PATTERN 7 (7 shifts, 10 hours each):
Required shifts: D1, D2, MID1, MID2, E, N, FT W
On Sundays (Pattern 7): D1, D2, MID1, MID2, E, N, FT W12
Shift times:
- D1: 06:00–16:00 (6a to 4p)
- D2: 08:00–18:00 (8a to 6p)
- MID1: 11:00–21:00 (11a to 9p)
- MID2: 14:00–00:00 (2p to 12a)
- E: 16:00–02:00 (4p to 2a)
- N: 21:00–07:00 (9p to 7a)
- FT W: 10:00–20:00 (10a to 8p)
- FT W12: 12:00–22:00 (12p to 10p) - SUNDAYS ONLY

PATTERN 8 (8 shifts, 9 hours each):
Required shifts: D1, D2, MID1, MID2, E, N, FT AM, FT PM
Shift times:
- D1: 06:00–15:00 (6a to 3p)
- D2: 08:00–17:00 (8a to 5p)
- MID1: 11:00–20:00 (11a to 8p)
- MID2: 15:00–00:00 (3p to 12a)
- E: 17:00–02:00 (5p to 2a)
- N: 22:00–07:00 (10p to 7a)
- FT AM: 07:00–16:00 (7a to 4p)
- FT PM: 14:00–23:00 (2p to 11p)

Note: MIDA and MIDB in legacy data refer to MID1 and MID2 respectively.

RULES:
1. Each provider can only work one shift per day.
2. Maintain ≥12h rest between shifts.
3. After a Night (N) shift, provider must have at least two full days off before any non-N shift.
4. Providers restricted to specific shifts must only be assigned those shifts:
   - Coffin: N only, in blocks of 3–4 N shifts, then 2 days off minimum.
   - Cary: All except D1; prefers later shifts (MIDB→E→N); ≤4 consecutive N.
   - Venugopal: E only; ≤2 consecutive E shifts; ≥2 days off after.
   - Lopez: D1 or FT AM only; ≤2 consecutive total shifts; never N.
   - Orlando, Beckman: All except N.
   - Ryals, Campo-Ford, Sellars-Pompey: Only FT AM, FT PM, FT W, MIDA.
   - Arnett: Cannot work E/N on Saturday; on Sunday only MIDB/E/N (avoid Sundays if possible).
   - Beach: Avoid Sunday; if necessary, only MIDB/E/N.
   - Akers: Any except "C".
   - Others: All shifts allowed if compliant with rest rules.
5. Each provider's total shifts must exactly match their monthly target.
6. Each provider's weekend quota (Sat+Sun) must match the monthly target (within ±1 if absolutely necessary).
7. Every required shift per day must be filled.

ADDITIONAL RULES — EXISTING CELLS AND HOLIDAYS:

The schedule_data input may include pre-existing daily assignments from the spreadsheet.
Each cell can contain one of the following:

- A valid shift code (D1, D2, MIDA, MIDB, E, N, FT AM, FT PM, FT W)  
- An "X"  → locked day off, cannot be overwritten  
- An "L"  → approved leave, cannot be overwritten  
- "HL"   → official holiday, unscheduled; leave blank unless a provider was pre-assigned
- Blank  → open shift slot, can be filled

RULES FOR EXISTING CELLS:
1. Never overwrite any existing value that is a shift, X, L, or HL.
2. Retain the cell's locked status (represented as locked: true in the data if parsed).
3. If a day is marked HL (holiday), mark that slot as unavailable unless a provider was explicitly pre-assigned in the uploaded data.
4. Treat X and L days as true rest days for rest-hour and night-recovery calculations.
5. The generated schedule must include all coverage shifts while preserving these locked cells exactly as uploaded.
6. If preserving these cells creates a coverage gap, fill that gap with eligible providers who do not violate any rule.
7. Never reassign or remove any existing shift assignment that came from the uploaded schedule_data.

For clarity, the output schedule array should preserve these locked entries. If a provider is on leave or has a locked day off, include:
{
  "date": "2026-01-02",
  "shift": "X",
  "provider": "Lopez"
}

Or for holidays with no assignment:
{
  "date": "2026-01-02",
  "shift": "HL",
  "provider": ""
}

All validation (totals, weekends, etc.) must count only actual work shifts (exclude X, L, HL).

OUTPUT:
Return a JSON object that exactly matches this structure:

{
  "month": "January 2026",
  "schedule": [
    { "date": "2026-01-01", "shift": "D1", "provider": "Lopez" },
    { "date": "2026-01-01", "shift": "N", "provider": "Coffin" },
    { "date": "2026-01-02", "shift": "X", "provider": "Lopez", "locked": true },
    { "date": "2026-01-03", "shift": "HL", "provider": "" },
    ...
  ],
  "provider_totals": [
    { "provider": "Lopez", "total": 35, "weekend": 4 },
    { "provider": "Coffin", "total": 12, "weekend": 2 }
  ]
}

REQUIREMENTS:
- Do not exceed or miss any provider's total shifts.
- Ensure at least 12 hours rest and recovery rules are honored.
- Assign shifts evenly across the month for fairness.
- Avoid assigning disallowed shifts.
- Include every shift listed by the day's coverage pattern.
- Preserve all existing assignments and locked cells (X, L, HL) exactly as they appear in schedule_data.
- If a rule conflict occurs, select the least-impact alternative but explain it in a comment key 'notes' (optional).

If any provider has unused shift slots or cannot meet requirements, distribute the remaining shifts across other eligible providers who maintain rest spacing and quota compliance.

Return only valid JSON conforming to the provided schema.`;

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