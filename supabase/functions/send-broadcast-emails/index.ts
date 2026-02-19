import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emails, fromEmail, fromName } = await req.json();

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      throw new Error("No emails provided");
    }

    console.log(`Sending ${emails.length} broadcast emails...`);

    const results = [];
    const errors = [];

    // Send emails sequentially to avoid rate limits
    for (const email of emails) {
      try {
        const { data, error } = await resend.emails.send({
          from: `${fromName} <${fromEmail}>`,
          to: [email.to],
          subject: email.subject,
          html: email.html,
        });

        if (error) {
          console.error(`Failed to send to ${email.to}:`, error);
          errors.push({ to: email.to, error: error.message });
        } else {
          console.log(`Sent to ${email.to}`);
          results.push({ to: email.to, id: data?.id });
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err: any) {
        console.error(`Error sending to ${email.to}:`, err);
        errors.push({ to: email.to, error: err.message });
      }
    }

    console.log(`Broadcast complete: ${results.length} sent, ${errors.length} failed`);

    return new Response(
      JSON.stringify({
        success: results.length,
        failed: errors.length,
        results,
        errors,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-broadcast-emails function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send emails" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
