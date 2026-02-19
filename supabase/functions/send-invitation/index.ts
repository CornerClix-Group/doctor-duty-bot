import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { providerId, email, name } = await req.json();

    if (!email || !providerId) {
      throw new Error("Email and provider ID are required");
    }

    console.log(`Sending invitation to ${email} for provider ${providerId}`);

    // Generate unique invitation token
    const token = crypto.randomUUID();
    const redirectUrl = `${req.headers.get("origin")}/auth?invite=${token}`;

    // Send invitation using Supabase Auth
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: redirectUrl,
        data: {
          provider_id: providerId,
          name: name,
        }
      }
    );

    if (inviteError) {
      console.error("Error sending invitation:", inviteError);
      throw inviteError;
    }

    // Update provider with invitation details
    const { error: updateError } = await supabaseAdmin
      .from("providers")
      .update({
        invitation_sent_at: new Date().toISOString(),
        invitation_token: token,
      })
      .eq("id", providerId);

    if (updateError) {
      console.error("Error updating provider:", updateError);
      throw updateError;
    }

    console.log(`Invitation sent successfully to ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Invitation sent to ${email}` 
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in send-invitation function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to send invitation" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
