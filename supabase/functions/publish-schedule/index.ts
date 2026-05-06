// Lock or publish a schedule. On publish, also creates in-app notifications
// and sends Resend emails to all active providers.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const resendKey = Deno.env.get("RESEND_API_KEY");
const resend = resendKey ? new Resend(resendKey) : null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { scheduleId, action, sendEmails = true } = body as {
      scheduleId?: string;
      action?: "lock" | "publish" | "unpublish";
      sendEmails?: boolean;
    };

    if (!scheduleId || !action) {
      return json(400, { error: "scheduleId and action are required" });
    }
    if (!["lock", "publish", "unpublish"].includes(action)) {
      return json(400, { error: "invalid action" });
    }

    // Identify acting user
    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | null = null;
    if (authHeader.startsWith("Bearer ")) {
      const { data } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
      userId = data?.user?.id ?? null;
    }

    // Verify admin
    if (userId) {
      const { data: roles } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const isAdmin = (roles || []).some((r: any) => r.role === "admin");
      if (!isAdmin) return json(403, { error: "admin role required" });
    } else {
      return json(401, { error: "auth required" });
    }

    const now = new Date().toISOString();
    let update: Record<string, any> = { updated_at: now };
    if (action === "lock") {
      update.status = "locked";
      update.locked_at = now;
      update.locked_by = userId;
    } else if (action === "publish") {
      update.status = "published";
      update.published_at = now;
      update.published_by = userId;
    } else if (action === "unpublish") {
      update.status = "draft";
      update.published_at = null;
      update.published_by = null;
    }

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("schedules")
      .update(update)
      .eq("id", scheduleId)
      .select()
      .maybeSingle();
    if (upErr) throw upErr;
    if (!updated) return json(404, { error: "schedule not found" });

    let notified = 0;
    let emailed = 0;
    let emailErrors: any[] = [];

    if (action === "publish") {
      // 1) In-app notifications for every provider with a linked user_id
      const { data: profiles } = await supabaseAdmin
        .from("provider_profiles")
        .select("user_id, first_name, last_name, email, active")
        .eq("active", true);
      const rows = (profiles || [])
        .filter((p: any) => p.user_id)
        .map((p: any) => ({
          user_id: p.user_id,
          type: "schedule_published",
          title: `${updated.month} ${updated.year} schedule published`,
          message: `The ${updated.month} ${updated.year} schedule is now available.`,
          data: { schedule_id: updated.id, month: updated.month, year: updated.year },
        }));
      if (rows.length) {
        const { error: nErr } = await supabaseAdmin.from("notifications").insert(rows);
        if (!nErr) notified = rows.length;
        else console.error("notification insert failed:", nErr);
      }

      // 2) Email blast via Resend (best-effort)
      if (sendEmails && resend) {
        const recipients = (profiles || []).filter((p: any) => p.email);
        for (const p of recipients) {
          try {
            const html = `
              <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
                <h2 style="color: #111;">${updated.month} ${updated.year} Schedule Published</h2>
                <p>Hi ${p.first_name || "there"},</p>
                <p>The ${updated.month} ${updated.year} schedule has been published and is ready to view.</p>
                <p>Sign in to Shiftly to see your shifts.</p>
                <p style="color: #666; font-size: 12px; margin-top: 32px;">— Shiftly Scheduling</p>
              </div>`;
            const { error } = await resend.emails.send({
              from: "Shiftly <onboarding@resend.dev>",
              to: [p.email],
              subject: `${updated.month} ${updated.year} schedule published`,
              html,
            });
            if (error) emailErrors.push({ to: p.email, error: error.message });
            else emailed++;
            await new Promise((r) => setTimeout(r, 100));
          } catch (e: any) {
            emailErrors.push({ to: p.email, error: e.message });
          }
        }
      }
    }

    return json(200, {
      ok: true,
      schedule: updated,
      notified,
      emailed,
      emailErrors,
    });
  } catch (err: any) {
    console.error("publish-schedule error:", err);
    return json(500, { error: "Internal error", details: err?.message || String(err) });
  }
});