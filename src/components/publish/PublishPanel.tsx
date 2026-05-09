import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Lock, Unlock, Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface PublishPanelProps {
  month: string;
  year: number;
  generatedSchedule: any;
  onStatusChange?: (status: string) => void;
}

interface ScheduleRow {
  id: string;
  status: string;
  locked_at: string | null;
  published_at: string | null;
  validation_results: any;
}

export function PublishPanel({ month, year, generatedSchedule, onStatusChange }: PublishPanelProps) {
  const { toast } = useToast();
  const [scheduleRow, setScheduleRow] = useState<ScheduleRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"lock" | "publish" | "unpublish" | null>(null);
  const [sendEmails, setSendEmails] = useState(true);
  const [manualOverrides, setManualOverrides] = useState<
    {
      id: string;
      rule_violated: string;
      date: string;
      shift_assigned: string | null;
      rationale: string | null;
      created_at: string | null;
      created_by: string | null;
      provider_profiles: { first_name: string; last_name: string } | null;
    }[]
  >([]);
  const [overridesAcknowledged, setOverridesAcknowledged] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("schedules")
        .select("id, status, locked_at, published_at, validation_results")
        .eq("month", month)
        .eq("year", year)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setScheduleRow(data as ScheduleRow | null);
      onStatusChange?.(data?.status || "none");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [month, year]);

  useEffect(() => {
    (async () => {
      if (!scheduleRow?.id) {
        setManualOverrides([]);
        return;
      }
      const { data } = await supabase
        .from("schedule_overrides")
        .select(
          "id, rule_violated, date, shift_assigned, rationale, created_at, created_by, provider_profiles(first_name, last_name)",
        )
        .eq("schedule_id", scheduleRow.id)
        .order("date", { ascending: true });
      setManualOverrides((data as any) || []);
      setOverridesAcknowledged(false);
    })();
  }, [scheduleRow?.id]);

  const ensureSaved = async (): Promise<string | null> => {
    if (!generatedSchedule) {
      toast({
        title: "Nothing to save",
        description: "Generate a schedule first.",
        variant: "destructive",
      });
      return null;
    }
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const payload = {
      month,
      year,
      schedule_data: (generatedSchedule.schedule || []) as any,
      assignments: (generatedSchedule.schedule || []) as any,
      provider_totals: (generatedSchedule.provider_totals || {}) as any,
      validation_results: {
        errors: generatedSchedule.errors || [],
        warnings: generatedSchedule.warnings || [],
        info: generatedSchedule.info || [],
      } as any,
      pp_hours: (generatedSchedule.pp_hours || {}) as any,
      coverage_pattern: (generatedSchedule.coverage_pattern || null) as any,
      base_coverage_value: generatedSchedule.base_coverage_value ?? 6,
      status: "draft" as const,
      created_by: userId,
    };

    const existingId = scheduleRow?.id ?? (
      await supabase
        .from("schedules")
        .select("id")
        .eq("month", month)
        .eq("year", year)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ).data?.id;

    const { data, error } = existingId
      ? await supabase
          .from("schedules")
          .update(payload)
          .eq("id", existingId)
          .select("id, status, locked_at, published_at, validation_results")
          .maybeSingle()
      : await supabase
          .from("schedules")
          .insert(payload)
          .select("id, status, locked_at, published_at, validation_results")
          .maybeSingle();
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return null;
    }
    setScheduleRow(data as ScheduleRow);
    return data?.id ?? null;
  };

  const callAction = async (action: "lock" | "publish" | "unpublish") => {
    setBusy(action);
    try {
      const id = await ensureSaved();
      if (!id) return;
      const { data, error } = await supabase.functions.invoke("publish-schedule", {
        body: { scheduleId: id, action, sendEmails: action === "publish" ? sendEmails : false },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.details || data.error);
      if (action === "publish") {
        toast({
          title: "Published",
          description: `Notified ${data.notified || 0} provider(s)${data.emailed ? `, emailed ${data.emailed}` : ""}.`,
        });
      } else if (action === "lock") {
        toast({ title: "Schedule locked", description: "No further edits until unlocked." });
      } else {
        toast({ title: "Unpublished", description: "Schedule reverted to draft." });
      }
      await refresh();
    } catch (e: any) {
      toast({ title: "Action failed", description: e.message, variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const status = scheduleRow?.status || (generatedSchedule ? "draft" : "none");
  const errorCount = scheduleRow?.validation_results?.errors?.length
    ?? generatedSchedule?.errors?.length
    ?? 0;
  const warnCount = scheduleRow?.validation_results?.warnings?.length
    ?? generatedSchedule?.warnings?.length
    ?? 0;

  const statusBadge = () => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-600 hover:bg-green-600">Published</Badge>;
      case "locked":
        return <Badge variant="secondary">Locked</Badge>;
      case "draft":
      case "validated":
        return <Badge variant="outline">{status}</Badge>;
      default:
        return <Badge variant="outline">Not saved</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Publish</CardTitle>
            <CardDescription>
              Lock to freeze edits, then publish to notify all active providers.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {statusBadge()}
            {scheduleRow?.published_at && (
              <span className="text-xs text-muted-foreground">
                {new Date(scheduleRow.published_at).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <>
            {errorCount > 0 && status !== "published" && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <div>
                  <div className="font-medium text-destructive">
                    {errorCount} validation error(s)
                  </div>
                  <div className="text-muted-foreground">
                    Resolve errors on the Validation tab before publishing. Warnings ({warnCount}) won't block publish.
                  </div>
                </div>
              </div>
            )}

            {manualOverrides.length > 0 && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-3">
                <div className="font-medium text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Manual overrides ({manualOverrides.length})
                </div>
                <ul className="text-xs space-y-2 text-muted-foreground max-h-48 overflow-y-auto">
                  {manualOverrides.map((o) => {
                    const pname = o.provider_profiles
                      ? `${o.provider_profiles.last_name}, ${o.provider_profiles.first_name}`
                      : "(unknown provider)";
                    return (
                      <li key={o.id} className="border-b border-border/40 pb-2 last:border-0">
                        <div className="font-medium text-foreground">
                          {pname} · {o.date}
                          {o.shift_assigned ? ` · ${o.shift_assigned}` : ""}
                        </div>
                        <div>Rule: {o.rule_violated}</div>
                        <div>{o.rationale ? o.rationale : "(no rationale)"}</div>
                        <div className="text-[10px] opacity-80">
                          {o.created_at ? new Date(o.created_at).toLocaleString() : ""}
                          {o.created_by ? ` · ${o.created_by.slice(0, 8)}…` : ""}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ack-overrides"
                    checked={overridesAcknowledged}
                    onCheckedChange={(v) => setOverridesAcknowledged(!!v)}
                  />
                  <Label htmlFor="ack-overrides" className="text-sm cursor-pointer leading-snug">
                    I have reviewed all manual overrides and they are intentional.
                  </Label>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 rounded-md border p-3">
              <Switch
                id="send-emails"
                checked={sendEmails}
                onCheckedChange={setSendEmails}
                disabled={status === "published"}
              />
              <Label htmlFor="send-emails" className="text-sm cursor-pointer">
                Email all active providers when publishing
              </Label>
            </div>

            <div className="flex flex-wrap gap-2">
              {status !== "locked" && status !== "published" && (
                <Button
                  onClick={() => callAction("lock")}
                  disabled={busy !== null || !generatedSchedule}
                  variant="outline"
                >
                  {busy === "lock" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4 mr-2" />
                  )}
                  Lock
                </Button>
              )}

              {status === "locked" && (
                <Button
                  onClick={() => callAction("unpublish")}
                  disabled={busy !== null}
                  variant="outline"
                >
                  {busy === "unpublish" ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Unlock className="h-4 w-4 mr-2" />
                  )}
                  Unlock
                </Button>
              )}

              {status !== "published" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button disabled={busy !== null || !generatedSchedule}>
                      {busy === "publish" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Publish Schedule
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Publish {month} {year}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This makes the schedule visible to all providers
                        {sendEmails ? " and sends an email notification to every active provider" : ""}.
                        {errorCount > 0 && (
                          <span className="block mt-2 text-destructive font-medium">
                            ⚠ {errorCount} validation error(s) will be published as-is.
                          </span>
                        )}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        disabled={manualOverrides.length > 0 && !overridesAcknowledged}
                        onClick={() => callAction("publish")}
                      >
                        Publish
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {status === "published" && (
                <>
                  <div className="flex items-center text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Live and visible to providers
                  </div>
                  <Button
                    onClick={() => callAction("unpublish")}
                    disabled={busy !== null}
                    variant="outline"
                    size="sm"
                  >
                    {busy === "unpublish" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Unlock className="h-4 w-4 mr-2" />
                    )}
                    Unpublish
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}