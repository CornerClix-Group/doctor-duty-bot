import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { subject, message, audience } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an email-orchestration assistant for the Shift Pro admin. 
You will produce a ready-to-send email payload list for a broadcast.

TASK:
1) For each person in audience, build a personalized email object.
2) Use a brief greeting with the recipient's first name.
3) Render message_markdown unchanged as the main body.
4) Include a standard footer:
   - "Reply to this email if you have questions."
   - "You can view and export your schedule in Shift Pro → My Schedule."
5) Return ONLY JSON: { "emails": [ { "to": "...", "subject": "...", "html": "..." } ] }

FORMAT RULES:
- Convert message_markdown to simple HTML (paragraphs, links, line breaks).
- Keep inline styles minimal and email-safe.
- Subject = subject as-is.

OUTPUT EXAMPLE:
{
  "emails": [
    { "to": "name@example.com", "subject": "Subject", "html": "<p>Hi Name, ...</p>" }
  ]
}`;

    const userPrompt = `INPUTS:
subject = ${subject}
message_markdown = ${message}
audience = ${JSON.stringify(audience)}

Generate personalized emails for all recipients.`;

    console.log("Calling Lovable AI for email generation...");

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
    
    let content = data.choices[0].message.content;
    
    // Remove markdown code fences if present
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\n/, '');
      content = content.replace(/\n```$/, '');
    }
    
    const emailsData = JSON.parse(content);

    console.log(`Generated ${emailsData.emails.length} personalized emails`);

    return new Response(JSON.stringify(emailsData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error in prepare-broadcast-emails function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to prepare emails" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
