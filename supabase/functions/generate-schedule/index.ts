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
- If pattern = 7 → required shifts: D1, D2, MIDA, MIDB, E, N, FT W
- If pattern = 8 → required shifts: D1, D2, MIDA, MIDB, E, N, FT AM, FT PM

All shifts are 10 hours long:
D1 06:00–16:00
FT AM 07:00–17:00
D2 08:00–18:00
MIDA 11:00–21:00
FT PM 14:00–00:00
MIDB 15:00–01:00
E   17:00–03:00
N   22:00–08:00
FT W 10:00–20:00

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

OUTPUT:
Return a JSON object that exactly matches this structure:

{
  "month": "January 2026",
  "schedule": [
    { "date": "2026-01-01", "shift": "D1", "provider": "Lopez" },
    { "date": "2026-01-01", "shift": "N", "provider": "Coffin" },
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