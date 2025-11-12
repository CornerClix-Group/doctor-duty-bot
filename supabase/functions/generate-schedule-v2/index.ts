import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `
You are the Shift Pro Scheduling Engine (v2). Generate a COMPLETE monthly schedule that RESPECTS ALL PROVIDER CONSTRAINTS.

CRITICAL INSTRUCTIONS - FOLLOW IN THIS EXACT ORDER:
1. NEVER violate locked cells:
   - If a provider has locked=true with value="X", "L", or "LH" for a date, that provider MUST be off that day (no shift assignment)
   - If a provider has locked=true with value=<shift>, preserve that exact shift assignment
   - Any assignment violating locked cells will cause immediate rejection
2. NEVER assign providers to shifts they cannot work (check allowed_shifts and disallowed_shifts)
3. FILL EVERY required shift with a qualified provider (from providers who do NOT have X/L/LH on that date)
4. RESPECT rest requirements (12-hour gaps, N-shift recovery)
5. BALANCE workload to match target_shifts and weekend_quota

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

ASSIGNMENT STRATEGY:
1. First pass: Preserve all locked cells exactly as provided
   - If provider has locked=true with value="X"/"L"/"LH" on date D, SKIP that provider for date D entirely
   - If provider has locked=true with value=<shift> on date D, preserve that exact assignment
2. Second pass: For each blank shift on date D, identify ALL eligible providers who:
   - Do NOT have locked=true with value="X"/"L"/"LH" on date D (they must be available)
   - Have that shift in allowed_shifts (or have empty allowed_shifts meaning all shifts allowed)
   - Do NOT have that shift in disallowed_shifts
   - Would not violate rest requirements if assigned
3. Third pass: Assign eligible providers to fill remaining shifts
4. Final pass: Balance totals by swapping assignments where possible

PROVIDER CONSTRAINT EXAMPLES (MUST BE ENFORCED):
- Coffin: allowed_shifts=["N"] means ONLY Night shifts in blocks of 3-4 consecutive N shifts, then MINIMUM 4 days off before next N block
- Cary: disallowed_shifts=["D1"] means can work D2/MIDA/MIDB/E/N/FT but NEVER D1; prefers MIDB→E→N; max 4 consecutive N shifts
- Lopez: allowed_shifts=["D1","FT AM"] means ONLY D1 or FT AM, max 2 consecutive shifts total, NEVER N
- Venugopal: allowed_shifts=["E"] means ONLY E shifts, max 2 consecutive E, then minimum 2 days off
- Orlando/Beckman: disallowed_shifts=["N"] means ANY shift EXCEPT N
- Ryals/Campo-Ford/Sellars-Pompey: allowed_shifts=["FT AM","FT PM","FT W","MIDA"] means ONLY those 4, nothing else
- Arnett: No E/N on Saturday; on Sunday only MIDB/E/N allowed; avoid Sunday if possible
- Beach: Avoid Sunday if possible; if must work Sunday then only MIDB/E/N

CONSTRAINT INTERPRETATION:
- allowed_shifts = [] (empty) → Provider CAN work ALL shifts (no restrictions)
- allowed_shifts = ["D1","D2"] → Provider can ONLY work D1 or D2, NEVER any other shift
- disallowed_shifts = ["N"] → Provider CANNOT work N but CAN work all other shifts
- If both exist, allowed_shifts takes priority (provider can only work allowed shifts, and disallowed must not be in allowed)

PAY PERIOD ACCOUNTING (CRITICAL):
- Each month has 14 pay periods (PP1-PP14), each exactly 14 days
- Each provider MUST have exactly 8 total assignments per pay period
- Count for PP total: Regular shifts + C + A10 = 8
- Count for target_shifts: Only regular work shifts (D1,D2,MIDA,MIDB,E,N,FT types)
- Count for weekend_quota: Only regular shifts on Saturday/Sunday
- X, L, LH do NOT count toward any totals

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
          "worked": <number>,           // ONLY regular work shifts (D1,D2,MIDA,MIDB,E,N,FT types)
          "weekends": <number>,         // ONLY weekend regular shifts (Saturday/Sunday)
          "call": <number>,             // C shifts
          "admin": <number>,            // A10 shifts
          "target": <number>,           // From schedule_data providers[].target_shifts
          "weekend_quota": <number>     // From schedule_data providers[].weekend_quota
        }
      },
  "pay_period_totals": {
    "First Last": {
      "PP1": 8,  // Must equal 8 (regular + C + A10)
      "PP2": 8
    }
  },
  "warnings": ["...optional reasons for any unfilled shift or constraint violation..."]
}

ENFORCEMENT
Your goal is to generate a COMPLETE and CORRECT schedule:
- Priority 1: NEVER violate locked cells (value and locked=true must be preserved)
- Priority 2: NEVER assign providers to shifts they cannot work (check allowed_shifts/disallowed_shifts)
- Priority 3: Fill every required shift with an eligible provider
- Priority 4: Respect rest requirements (12 hours between shifts, 2 days after N)
- Priority 5: Match target_shifts and weekend_quota as closely as possible
- Priority 6: Achieve exactly 8 assignments per pay period per provider

If a shift truly cannot be filled (no eligible providers available), explain in "warnings".
Return ONLY valid JSON conforming to the provided schema. Empty provider fields ("") indicate unfilled shifts.

VALIDATION CHECKLIST BEFORE RETURNING:
1. Did I preserve all locked cells exactly?
   - CRITICAL: If provider has locked X/L/LH on date D, I must NOT assign them ANY shift on date D
   - If provider has locked shift on date D, I preserved that exact shift
2. Did I only assign providers to shifts in their allowed_shifts (or all shifts if allowed_shifts is empty)?
3. Did I avoid assigning providers to shifts in their disallowed_shifts?
4. Did I assign a provider to every required shift (using only providers without X/L/LH on that date)?
5. Do provider totals match their target_shifts (regular work only)?
6. Do weekend totals match weekend_quota (regular work on Sat/Sun only)?
7. Does each provider have 8 total assignments (regular+C+A10) per pay period?
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
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

    console.log("[v2] Calling Lovable AI for schedule generation...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: JSON.stringify({ provider_profiles, schedule_data })
          }
        ],
        response_format: { type: "json_schema", json_schema: OUTPUT_SCHEMA }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[v2] Lovable AI error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`Lovable AI API error: ${response.status} ${errorText}`);
    }

    const responseData = await response.json();
    const raw = responseData.choices[0]?.message?.content ?? "{}";
    
    console.log("[v2] Raw AI response length:", raw.length);
    console.log("[v2] Raw AI response first 500 chars:", raw.substring(0, 500));
    console.log("[v2] Raw AI response last 500 chars:", raw.substring(raw.length - 500));
    
    // Try to extract JSON if AI included extra text
    let jsonStr = raw.trim();
    
    // Look for JSON object boundaries
    const firstBrace = jsonStr.indexOf('{');
    const lastBrace = jsonStr.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
      console.error("[v2] No valid JSON object boundaries found");
      return new Response(
        JSON.stringify({ error: "AI response does not contain valid JSON" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Extract just the JSON part
    if (firstBrace > 0 || lastBrace < jsonStr.length - 1) {
      console.log("[v2] Extracting JSON from position", firstBrace, "to", lastBrace + 1);
      jsonStr = jsonStr.substring(firstBrace, lastBrace + 1);
    }
    
    let data;
    try {
      data = JSON.parse(jsonStr);
    } catch (parseError: any) {
      console.error("[v2] JSON parse error:", parseError.message);
      console.error("[v2] Attempted to parse:", jsonStr.substring(0, 1000));
      return new Response(
        JSON.stringify({ 
          error: "Failed to parse AI response as JSON",
          details: parseError.message 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Server-side validation and corrections for locked cells
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

    console.log("[v2] Locked cells map:", Array.from(lockedMap.entries()).slice(0, 20));

    // Apply locked cells by correcting AI output BEFORE validation
    for (const daySchedule of data.schedule ?? []) {
      // Build quick lookups for this day
      const assignments = daySchedule.assignments ?? [];

      // Helper to get all locked entries for this specific date
      const lockedForDate: Array<[string, string]> = [];
      lockedMap.forEach((val, key) => {
        const [date, provider] = key.split("|");
        if (date === daySchedule.date) lockedForDate.push([provider, val]);
      });

      if (lockedForDate.length === 0) continue;

      // Enforce X/L/LH (must be off) and exact shift locks
      for (const [provider, lockedVal] of lockedForDate) {
        if (!provider) continue;
        if (lockedVal === 'X' || lockedVal === 'L' || lockedVal === 'LH') {
          // Remove any assignment for this provider on this day
          daySchedule.assignments = (daySchedule.assignments ?? []).filter((a: any) => a.provider !== provider);
          continue;
        }
        // Exact shift enforcement: ensure provider is assigned to lockedVal
        // 1) Remove any other shift assignments for this provider on this day
        daySchedule.assignments = (daySchedule.assignments ?? []).filter((a: any) => !(a.provider === provider && a.shift !== lockedVal));
        // 2) If the locked shift exists, set its provider to the locked provider
        const idx = daySchedule.assignments.findIndex((a: any) => a.shift === lockedVal);
        if (idx >= 0) {
          daySchedule.assignments[idx].provider = provider;
        } else {
          // 3) Otherwise, add it explicitly
          daySchedule.assignments.push({ shift: lockedVal, provider });
        }
      }
    }

    // Fill gaps: assign missing shifts to eligible providers
    for (const daySchedule of data.schedule ?? []) {
      const date = daySchedule.date;
      const pattern = daySchedule.pattern;
      const assignments = daySchedule.assignments ?? [];
      
      // Determine required shifts for this pattern
      const requiredShifts = pattern === 7 
        ? ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT W']
        : ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM'];
      
      // Add FT W12 on Sundays for pattern 7
      if (pattern === 7 && new Date(date).getDay() === 0) {
        requiredShifts.push('FT W12');
      }
      
      // Find unfilled shifts
      const assignedShifts = new Set(assignments.map((a: any) => a.shift));
      const unfilledShifts = requiredShifts.filter(s => !assignedShifts.has(s));
      
      if (unfilledShifts.length === 0) continue;
      
      // Build list of eligible providers for each unfilled shift
      for (const shift of unfilledShifts) {
        // Find providers who can work this shift on this date
        const eligible: string[] = [];
        
        for (const p of schedule_data.providers) {
          if (!p.name) continue;
          
          // Check if provider is locked on this date
          const locked = lockedMap.get(`${date}|${p.name}`);
          if (locked === 'X' || locked === 'L' || locked === 'LH') continue;
          if (locked && locked !== shift) continue; // already assigned to another shift
          
          // Check if already assigned on this day
          const alreadyAssigned = assignments.some((a: any) => a.provider === p.name);
          if (alreadyAssigned) continue;
          
          // Check provider constraints from provider_profiles
          const profile = provider_profiles.find((pp: any) => 
            `${pp.first_name} ${pp.last_name}` === p.name
          );
          
          if (profile) {
            const allowed = profile.allowed_shifts || [];
            const disallowed = profile.rules?.disallowed_shifts || [];
            
            if (allowed.length > 0 && !allowed.includes(shift)) continue;
            if (disallowed.includes(shift)) continue;
          }
          
          eligible.push(p.name);
        }
        
        // Assign to first eligible provider
        if (eligible.length > 0) {
          assignments.push({ shift, provider: eligible[0] });
        } else {
          // Still unfilled - add warning if not already present
          if (!data.warnings) data.warnings = [];
          const warningMsg = `${date} ${shift} could not be filled (no eligible providers)`;
          if (!data.warnings.includes(warningMsg)) {
            data.warnings.push(warningMsg);
          }
        }
      }
      
      daySchedule.assignments = assignments;
    }

    // Recompute provider_totals and pay_period_totals from corrected schedule
    const regularShifts = new Set(['D1','D2','MIDA','MIDB','E','N','FT AM','FT PM','FT W','FT W12']);
    const targetMap = new Map<string, number>();
    const quotaMap = new Map<string, number>();
    for (const p of schedule_data.providers) {
      targetMap.set(p.name, p.target_shifts ?? 0);
      quotaMap.set(p.name, p.weekend_quota ?? 0);
    }

    const providerTotals: Record<string, { worked: number; weekends: number; call: number; admin: number; target: number; weekend_quota: number; }> = {};
    const payPeriodTotals: Record<string, Record<string, number>> = {};

    for (const daySchedule of data.schedule ?? []) {
      const dow = new Date(daySchedule.date).getDay(); // 0=Sun,6=Sat
      const isWeekend = dow === 0 || dow === 6;
      for (const a of daySchedule.assignments ?? []) {
        const name = a.provider;
        if (!name) continue;
        if (!providerTotals[name]) {
          providerTotals[name] = {
            worked: 0,
            weekends: 0,
            call: 0,
            admin: 0,
            target: targetMap.get(name) ?? 0,
            weekend_quota: quotaMap.get(name) ?? 0,
          };
        }
        if (!payPeriodTotals[name]) payPeriodTotals[name] = {};
        const ppKey = `PP${daySchedule.pay_period}`;
        payPeriodTotals[name][ppKey] = (payPeriodTotals[name][ppKey] ?? 0) + 1; // regular + C + A10

        if (a.shift === 'C') providerTotals[name].call++;
        else if (a.shift === 'A10') providerTotals[name].admin++;
        if (regularShifts.has(a.shift)) {
          providerTotals[name].worked++;
          if (isWeekend) providerTotals[name].weekends++;
        }
      }
    }

    data.provider_totals = providerTotals;
    data.pay_period_totals = payPeriodTotals;

    // Strict post-correction validation with detailed reporting
    const validationReport = {
      lockedCellsPreserved: 0,
      lockedCellViolations: [] as string[],
      constraintViolations: [] as string[],
      unfilledShifts: [] as string[],
      providerMismatches: [] as string[]
    };

    // Track all locked cells and verify preservation
    lockedMap.forEach((lockedValue, key) => {
      const [date, providerName] = key.split("|");
      const daySchedule = data.schedule?.find((d: any) => d.date === date);
      if (!daySchedule) return;

      const providerAssignments = daySchedule.assignments?.filter((a: any) => a.provider === providerName) || [];

      if (lockedValue === 'X' || lockedValue === 'L' || lockedValue === 'LH') {
        // Provider MUST be off (no assignments)
        if (providerAssignments.length > 0) {
          validationReport.lockedCellViolations.push(
            `${date} ${providerName}: locked as ${lockedValue} but assigned to ${providerAssignments.map((a: any) => a.shift).join(', ')}`
          );
        } else {
          validationReport.lockedCellsPreserved++;
        }
      } else {
        // Provider MUST be assigned to exact shift
        const hasCorrectShift = providerAssignments.some((a: any) => a.shift === lockedValue);
        const otherShifts = providerAssignments.filter((a: any) => a.shift !== lockedValue);
        
        if (!hasCorrectShift) {
          validationReport.lockedCellViolations.push(
            `${date} ${providerName}: expected ${lockedValue}, but assigned to ${providerAssignments.map((a: any) => a.shift).join(', ') || 'nothing'}`
          );
        } else if (otherShifts.length > 0) {
          validationReport.lockedCellViolations.push(
            `${date} ${providerName}: locked to ${lockedValue} but also assigned to ${otherShifts.map((a: any) => a.shift).join(', ')}`
          );
        } else {
          validationReport.lockedCellsPreserved++;
        }
      }
    });

    // Check for constraint violations and unfilled shifts
    for (const daySchedule of data.schedule ?? []) {
      const requiredShifts = daySchedule.pattern === 7 
        ? ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT W']
        : ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM'];
      
      if (daySchedule.pattern === 7 && new Date(daySchedule.date).getDay() === 0) {
        requiredShifts.push('FT W12');
      }

      for (const shift of requiredShifts) {
        const assignment = daySchedule.assignments?.find((a: any) => a.shift === shift);
        if (!assignment || !assignment.provider) {
          validationReport.unfilledShifts.push(`${daySchedule.date} ${shift}`);
        } else {
          // Check if provider is allowed to work this shift
          const profile = provider_profiles.find((pp: any) => 
            `${pp.first_name} ${pp.last_name}` === assignment.provider
          );
          if (profile) {
            const allowed = profile.allowed_shifts || [];
            const disallowed = profile.rules?.disallowed_shifts || [];
            
            if (allowed.length > 0 && !allowed.includes(shift)) {
              validationReport.constraintViolations.push(
                `${daySchedule.date} ${assignment.provider} assigned to ${shift}, but only allowed: ${allowed.join(', ')}`
              );
            }
            if (disallowed.includes(shift)) {
              validationReport.constraintViolations.push(
                `${daySchedule.date} ${assignment.provider} assigned to ${shift}, but it's disallowed`
              );
            }
          }
        }
      }
    }

    // Block schedule if critical violations exist
    if (validationReport.lockedCellViolations.length > 0) {
      console.error("[v2] CRITICAL: Locked cell violations detected:", validationReport.lockedCellViolations);
      return new Response(
        JSON.stringify({
          error: "Locked cell violations detected",
          validation: validationReport
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Attach validation report to response (even if successful)
    data.validation = validationReport;

    console.log("[v2] Schedule generated successfully");
    console.log("[v2] Validation report:", {
      preserved: validationReport.lockedCellsPreserved,
      violations: validationReport.lockedCellViolations.length,
      constraintIssues: validationReport.constraintViolations.length,
      unfilled: validationReport.unfilledShifts.length
    });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[v2] Error in generate-schedule-v2 function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate schedule" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
