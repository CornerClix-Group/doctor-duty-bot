// ED Schedule Manager — parse-monthly-requests
// Converts free-text emails / notes into structured monthly_requests rows
// using Lovable AI Gateway (tool calling for structured output).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

const SYSTEM_PROMPT = `You are an Emergency Department schedule assistant.
You receive free-text messages (often from emails) where physicians request time off,
ask to work specific shifts, or note preferences for a given month.

Extract every distinct request into structured form. Be conservative: when a date or
shift is ambiguous, set the field to null and put the original phrase into "note".

Date rules:
- Output ISO format YYYY-MM-DD.
- If only a day-of-month is given, use the supplied month/year context.
- If the writer says a range like "Jul 5-7", emit one entry per date.
- If the writer says "weekend of the 12th", emit Sat + Sun of that weekend.

Request types (pick the closest fit):
- "off"        : cannot work that day (vacation, leave, conference, family, sick).
- "must_work"  : must be working that day or that specific shift.
- "prefer"     : would prefer that shift / day if possible.
- "avoid"      : would prefer not to work that shift / day, but not blocking.
- "must_avoid" : hard constraint to not work that shift (similar to off but shift-specific).

Shift codes (use exactly): D1, D2, MIDA, MIDB, E, N, FT, FT W, FT W12, FT AM, FT PM, C, A10.
If no shift is named, leave shift_code null.`;

const TOOL = {
  type: "function",
  function: {
    name: "emit_requests",
    description: "Emit one entry per distinct schedule request in the message.",
    parameters: {
      type: "object",
      properties: {
        requests: {
          type: "array",
          items: {
            type: "object",
            properties: {
              provider_name: { type: "string", description: "Best-guess provider name; copy what's in the text." },
              date: { type: "string", description: "YYYY-MM-DD or null" },
              type: {
                type: "string",
                enum: ["off", "must_work", "prefer", "avoid", "must_avoid"],
              },
              shift_code: {
                type: "string",
                description: "One of D1,D2,MIDA,MIDB,E,N,FT,FT W,FT W12,FT AM,FT PM,C,A10 — or null",
              },
              note: { type: "string", description: "Original phrase / context" },
              confidence: { type: "number", description: "0-1 confidence in the parse" },
            },
            required: ["provider_name", "type", "note", "confidence"],
          },
        },
      },
      required: ["requests"],
    },
  },
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, month, year, defaultProviderName, scheduleId, persist } =
      await req.json().catch(() => ({} as any));

    if (!text || typeof text !== "string" || text.trim().length < 3) {
      return json(400, { error: "Provide `text` (the message body) at minimum." });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json(500, { error: "LOVABLE_API_KEY not configured" });

    const userPrompt = `Month/year context: ${month ?? "unknown"} ${year ?? ""}
${defaultProviderName ? `Sender / default provider: ${defaultProviderName}` : ""}

--- MESSAGE ---
${text}
--- END MESSAGE ---

Return all requests via the emit_requests tool.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "emit_requests" } },
      }),
    });

    if (resp.status === 429) return json(429, { error: "Rate limited. Try again shortly." });
    if (resp.status === 402) return json(402, { error: "AI credits exhausted. Add credits in Workspace settings." });
    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      return json(500, { error: "AI gateway error", details: t.slice(0, 500) });
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return json(200, { requests: [], raw: data });
    }
    let parsed: any = {};
    try {
      parsed = JSON.parse(toolCall.function.arguments || "{}");
    } catch (e) {
      return json(500, { error: "AI returned malformed arguments" });
    }
    const requests = Array.isArray(parsed.requests) ? parsed.requests : [];

    // Optional persist
    let inserted: any[] = [];
    if (persist && requests.length) {
      const rows = requests.map((r: any) => ({
        schedule_id: scheduleId ?? null,
        provider_name: r.provider_name ?? defaultProviderName ?? null,
        request_date: r.date ?? null,
        request_type: r.type ?? null,
        shift_code: r.shift_code ?? null,
        note: r.note ?? null,
        source: "parsed_email",
        source_text: text,
      }));
      const { data: ins, error } = await supabaseAdmin
        .from("monthly_requests")
        .insert(rows)
        .select();
      if (error) console.error("insert failed", error);
      else inserted = ins ?? [];
    }

    return json(200, { requests, inserted });
  } catch (err: any) {
    console.error("parse-monthly-requests error:", err);
    return json(500, { error: "Internal error", details: err?.message || String(err) });
  }
});