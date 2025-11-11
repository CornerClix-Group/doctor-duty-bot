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
    const { month, year, providerProfiles, existingAssignments } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build the system prompt for the AI
    const systemPrompt = `You are an advanced scheduling engine for ShiftPro, a healthcare provider scheduling application.

Your task is to generate an optimal monthly shift schedule that:
1. Respects all provider constraints (allowed/disallowed shifts, weekend quotas, target shift counts)
2. Balances workload fairly across all providers
3. Ensures adequate coverage for all shifts
4. Minimizes consecutive night shifts and provides adequate rest periods
5. Honors blocked days and time-off requests
6. Respects weekend rotation rules

SHIFT TYPES:
- D1, D2: Day shifts (12-hour)
- MIDA, MIDB: Mid shifts
- E: Evening shift
- N: Night shift (requires recovery time)
- FT AM, FT PM, FT W: Full-time shifts

CONSTRAINTS TO ENFORCE:
- allowed_shifts: Provider can ONLY work these shifts
- disallowed_shifts: Provider must NEVER work these shifts
- weekend_quota: Max weekend days per month
- target_shifts: Target number of shifts for the month
- max_consecutive_n: Max consecutive night shifts
- rest_hours: Minimum hours between shifts (default 12)
- n_recovery_days: Recovery days needed after night shifts (default 2)
- saturday_restrictions/sunday_restrictions: Special weekend rules

Return the schedule as a JSON object with this structure:
{
  "schedule": [
    {
      "date": "2026-01-01",
      "dayOfWeek": "Thu",
      "shifts": {
        "D1": "Lopez",
        "D2": "Arnett",
        "MIDA": "Campo-Ford",
        "MIDB": "Cary",
        "E": "Venugopal",
        "N": "Coffin"
      }
    }
  ],
  "providerTotals": {
    "Lopez": { "totalShifts": 15, "weekendDays": 4 },
    "Arnett": { "totalShifts": 14, "weekendDays": 3 }
  },
  "warnings": ["Provider X exceeded weekend quota by 1 day"]
}`;

    const userPrompt = `Generate a schedule for ${month} ${year}.

PROVIDER PROFILES:
${JSON.stringify(providerProfiles, null, 2)}

${existingAssignments ? `EXISTING ASSIGNMENTS:\n${JSON.stringify(existingAssignments, null, 2)}` : ''}

Generate the complete monthly schedule following all constraints.`;

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
    
    const scheduleData = JSON.parse(content);
    console.log("Schedule generated successfully");

    return new Response(JSON.stringify(scheduleData), {
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