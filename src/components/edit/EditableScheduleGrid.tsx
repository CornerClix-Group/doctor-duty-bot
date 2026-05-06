import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, AlertTriangle, RotateCcw, Save } from "lucide-react";
import {
  checkCellEdit,
  type CellIssue,
  type DayOutput,
  type ProviderRule,
} from "./cellRules";

interface EditableScheduleGridProps {
  schedule: DayOutput[];
  onChange: (next: DayOutput[]) => void;
  onSaveDraft?: (next: DayOutput[]) => Promise<void>;
  onReset?: () => void;
}

const UNFILLED = "—";

export function EditableScheduleGrid({
  schedule,
  onChange,
  onSaveDraft,
  onReset,
}: EditableScheduleGridProps) {
  const { toast } = useToast();
  const [rules, setRules] = useState<Map<string, ProviderRule>>(new Map());
  const [providers, setProviders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: provs } = await supabase
        .from("providers")
        .select("id, name, target_shifts, weekend_quota, active")
        .eq("active", true);
      const { data: cons } = await supabase
        .from("provider_constraints")
        .select("*");
      const cByPid = new Map<string, any>();
      (cons || []).forEach((c: any) => cByPid.set(c.provider_id, c));
      const map = new Map<string, ProviderRule>();
      const names: string[] = [];
      (provs || []).forEach((p: any) => {
        const c = cByPid.get(p.id) || {};
        const rule: ProviderRule = {
          name: p.name,
          active: p.active !== false,
          target: p.target_shifts ?? 0,
          weekend_quota: p.weekend_quota ?? 0,
          allowed_shifts: c.allowed_shifts && c.allowed_shifts.length ? c.allowed_shifts : null,
          disallowed_shifts: c.disallowed_shifts || [],
          sat_disallowed_shifts: c.sat_disallowed_shifts || [],
          sun_allowed_shifts:
            c.sun_allowed_shifts && c.sun_allowed_shifts.length ? c.sun_allowed_shifts : null,
          avoid_sunday: !!c.avoid_sunday,
          max_consec: c.max_consec ?? null,
          max_consec_n: c.max_consec_n ?? null,
          recovery_days: c.recovery_days ?? c.n_recovery_days ?? 2,
        };
        map.set(p.name.toLowerCase(), rule);
        names.push(p.name);
      });
      setRules(map);
      setProviders(names.sort());
    })();
  }, []);

  // For every day, list the unique shift slots in chronological order.
  // We treat each (date, shift) as an editable cell.
  const shiftColumns = useMemo(() => {
    const set = new Set<string>();
    schedule.forEach((d) => d.assignments.forEach((a) => set.add(a.shift)));
    const order = ["D1", "D2", "MIDA", "MIDB", "E", "N", "FT", "FT W", "FT W12", "FT AM", "FT PM", "C", "A10"];
    return [...set].sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [schedule]);

  // Compute issues per cell
  const issuesByCell = useMemo(() => {
    const out = new Map<string, CellIssue[]>();
    schedule.forEach((day) => {
      day.assignments.forEach((a) => {
        if (!a.provider || a.provider === UNFILLED) return;
        const rule = rules.get(a.provider.toLowerCase());
        const list = checkCellEdit(schedule, day.date, a.shift, a.provider, rule);
        if (list.length) out.set(`${day.date}|${a.shift}`, list);
      });
    });
    return out;
  }, [schedule, rules]);

  const errorCount = useMemo(() => {
    let n = 0;
    issuesByCell.forEach((arr) => arr.forEach((i) => i.severity === "error" && n++));
    return n;
  }, [issuesByCell]);

  const warnCount = useMemo(() => {
    let n = 0;
    issuesByCell.forEach((arr) => arr.forEach((i) => i.severity === "warning" && n++));
    return n;
  }, [issuesByCell]);

  const handleEdit = (date: string, shift: string, newProvider: string) => {
    const next = schedule.map((day) => {
      if (day.date !== date) return day;
      const assignments = day.assignments.map((a) => {
        if (a.shift !== shift) return a;
        return { ...a, provider: newProvider === UNFILLED ? "" : newProvider };
      });
      return { ...day, assignments };
    });
    onChange(next);
  };

  const formatDate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
  };

  const isWeekend = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d).getDay();
    return dt === 0 || dt === 6;
  };

  if (!schedule || schedule.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No schedule to edit. Generate one first on the Build tab.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Editable Calendar</CardTitle>
            <CardDescription>
              Click any cell to reassign. Rule violations highlight in real time.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={errorCount ? "destructive" : "outline"}>
              {errorCount} errors
            </Badge>
            <Badge variant={warnCount ? "default" : "outline"}>
              {warnCount} warnings
            </Badge>
            {onReset && (
              <Button variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>
            )}
            {onSaveDraft && (
              <Button
                size="sm"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onSaveDraft(schedule);
                    toast({ title: "Draft saved" });
                  } catch (e: any) {
                    toast({ title: "Save failed", description: e.message, variant: "destructive" });
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <Save className="h-3.5 w-3.5 mr-1" />
                Save Draft
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <TooltipProvider delayDuration={150}>
          <ScrollArea className="h-[560px] w-full rounded-md border">
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <th className="border bg-muted p-2 text-left font-semibold sticky left-0">
                    Date
                  </th>
                  {shiftColumns.map((s) => (
                    <th key={s} className="border bg-muted p-2 text-center font-semibold min-w-[140px]">
                      {s}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map((day, idx) => (
                  <tr
                    key={day.date}
                    className={`${idx % 2 ? "bg-muted/20" : "bg-background"} ${
                      isWeekend(day.date) ? "bg-accent/10" : ""
                    }`}
                  >
                    <td className="border p-2 font-medium whitespace-nowrap sticky left-0 bg-inherit">
                      {formatDate(day.date)}
                    </td>
                    {shiftColumns.map((shift) => {
                      const a = day.assignments.find((x) => x.shift === shift);
                      if (!a) {
                        return (
                          <td key={shift} className="border p-1 text-center text-muted-foreground/40">
                            ·
                          </td>
                        );
                      }
                      const cellIssues = issuesByCell.get(`${day.date}|${shift}`) || [];
                      const hasError = cellIssues.some((i) => i.severity === "error");
                      const hasWarn = cellIssues.some((i) => i.severity === "warning");
                      const cellTone = hasError
                        ? "ring-1 ring-destructive bg-destructive/10"
                        : hasWarn
                        ? "ring-1 ring-amber-500/60 bg-amber-500/10"
                        : "";
                      const select = (
                        <Select
                          value={a.provider || UNFILLED}
                          onValueChange={(v) => handleEdit(day.date, shift, v)}
                        >
                          <SelectTrigger className={`h-8 w-full ${cellTone}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={UNFILLED}>{UNFILLED}</SelectItem>
                            {providers.map((p) => (
                              <SelectItem key={p} value={p}>{p}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                      return (
                        <td key={shift} className="border p-1 align-middle">
                          {cellIssues.length === 0 ? (
                            select
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="relative">
                                  {select}
                                  <div className="absolute -top-1 -right-1">
                                    {hasError ? (
                                      <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                                    ) : (
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    )}
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <ul className="text-xs space-y-1">
                                  {cellIssues.map((i, idx2) => (
                                    <li key={idx2}>
                                      <span className={i.severity === "error" ? "text-destructive font-medium" : ""}>
                                        {i.severity.toUpperCase()}:
                                      </span>{" "}
                                      {i.message}
                                    </li>
                                  ))}
                                </ul>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}