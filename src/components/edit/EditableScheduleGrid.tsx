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
  type DayMode,
  type DayOutput,
  type ProviderRule,
} from "./cellRules";
import { requiredShiftsForDay } from "../../../supabase/functions/_shared/shifts.ts";

interface EditableScheduleGridProps {
  schedule: DayOutput[];
  /** From solver: when true, mode-8 Mondays include FT 7a layer */
  mondayFtRuleActive?: boolean;
  onChange: (next: DayOutput[]) => void;
  onSaveDraft?: (next: DayOutput[]) => Promise<void>;
  onReset?: () => void;
}

const UNFILLED = "—";

export function EditableScheduleGrid({
  schedule,
  mondayFtRuleActive = false,
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

  const handleModeChange = (date: string, mode: DayMode) => {
    const next = schedule.map((day) => {
      if (day.date !== date) return day;
      const req = requiredShiftsForDay(mode, day.dayOfWeek, mondayFtRuleActive);
      const byShift = new Map(day.assignments.map((a) => [a.shift, { ...a }]));
      const assignments = req.map((shift) => {
        const prev = byShift.get(shift);
        const provider = prev?.provider ?? "";
        return {
          shift,
          provider,
          locked: prev?.locked,
          unfilled: !provider,
        };
      });
      for (const a of day.assignments) {
        if ((a.shift === "C" || a.shift === "A10") && a.provider) {
          if (!assignments.some((x) => x.shift === a.shift && x.provider === a.provider)) {
            assignments.push({ shift: a.shift, provider: a.provider, locked: true, unfilled: false });
          }
        }
      }
      return {
        ...day,
        mode,
        coverage: mode,
        required: req as string[],
        assignments,
      };
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

  const isToday = (s: string) => {
    const today = new Date();
    const [y, m, d] = s.split("-").map(Number);
    return today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === d;
  };

  const shiftAccent = (shift: string): string => {
    const map: Record<string, string> = {
      D1: "var(--shift-d1)",
      D2: "var(--shift-d2)",
      MIDA: "var(--shift-mida)",
      MIDB: "var(--shift-midb)",
      E: "var(--shift-e)",
      N: "var(--shift-n)",
      FT: "var(--shift-ft)",
      "FT W": "var(--shift-ft)",
      "FT W12": "var(--shift-ft)",
      "FT AM": "var(--shift-ft)",
      "FT PM": "var(--shift-ft)",
    };
    return map[shift] || "var(--muted-foreground)";
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
    <Card className="border-border/60 shadow-[var(--shadow-card)]">
      <CardHeader className="border-b border-border/60">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="tracking-tight">Editable Calendar</CardTitle>
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
      <CardContent className="p-0">
        <TooltipProvider delayDuration={150}>
          <ScrollArea className="h-[600px] w-full">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="sticky top-0 z-20">
                <tr>
                  <th className="glass sticky left-0 z-30 border-b border-r border-border/60 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Date
                  </th>
                  <th className="glass sticky left-[1px] z-30 border-b border-r border-border/60 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[72px]">
                    Mode
                  </th>
                  {shiftColumns.map((s) => (
                    <th
                      key={s}
                      className="glass border-b border-r border-border/60 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[132px]"
                    >
                      <div className="inline-flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ background: `hsl(${shiftAccent(s)})` }}
                        />
                        {s}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map((day) => {
                  const today = isToday(day.date);
                  const weekend = isWeekend(day.date);
                  const rowBg = today
                    ? "bg-[hsl(var(--today-tint))]"
                    : weekend
                    ? "bg-[hsl(var(--weekend-tint))]"
                    : "bg-card";
                  return (
                  <tr key={day.date} className={`${rowBg} group/row transition-colors hover:bg-[hsl(var(--primary-soft))]`}>
                    <td className={`sticky left-0 z-10 ${rowBg} border-b border-r border-border/60 px-4 py-2.5 font-medium tabular whitespace-nowrap`}>
                      <div className="flex items-center gap-2">
                        {today && <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[var(--shadow-glow)]" />}
                        <span className={today ? "text-primary" : weekend ? "text-foreground/80" : ""}>
                          {formatDate(day.date)}
                        </span>
                      </div>
                    </td>
                    <td className={`sticky left-[1px] z-10 ${rowBg} border-b border-r border-border/60 px-1 py-1 align-middle`}>
                      <Select
                        value={String(day.mode ?? day.coverage ?? 8)}
                        onValueChange={(v) => handleModeChange(day.date, Number(v) as DayMode)}
                      >
                        <SelectTrigger className="h-8 w-[64px] rounded-md border-border/60 bg-background/80 text-xs font-medium tabular px-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="8">8</SelectItem>
                          <SelectItem value="7">7</SelectItem>
                          <SelectItem value="6">6</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    {shiftColumns.map((shift) => {
                      const a = day.assignments.find((x) => x.shift === shift);
                      if (!a) {
                        return (
                          <td key={shift} className="border-b border-r border-border/60 px-2 py-1.5 text-center text-muted-foreground/30">
                            ·
                          </td>
                        );
                      }
                      const cellIssues = issuesByCell.get(`${day.date}|${shift}`) || [];
                      const hasError = cellIssues.some((i) => i.severity === "error");
                      const hasWarn = cellIssues.some((i) => i.severity === "warning");
                      const cellTone = hasError
                        ? "ring-1 ring-destructive/70 bg-destructive/5"
                        : hasWarn
                        ? "ring-1 ring-amber-500/50 bg-amber-500/5"
                        : "border-border/60";
                      const select = (
                        <Select
                          value={a.provider || UNFILLED}
                          onValueChange={(v) => handleEdit(day.date, shift, v)}
                        >
                          <SelectTrigger className={`h-8 w-full rounded-md border-transparent bg-transparent text-xs font-medium tabular hover:bg-background focus:bg-background ${cellTone}`}>
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
                        <td key={shift} className="border-b border-r border-border/60 px-1.5 py-1 align-middle">
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
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}