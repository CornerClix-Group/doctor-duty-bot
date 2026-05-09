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
import { OverrideConfirmDialog } from "./OverrideConfirmDialog";
import {
  ALL_SHIFTS,
  OFF_CODES,
  TIGHTNESS_ORDER,
  requiredShiftsForDay,
  type ShiftCode,
} from "../../../supabase/functions/_shared/shifts.ts";
import {
  checkPlacement,
  type ScheduleViolation,
  type SchedulerProviderProfile,
} from "../../../supabase/functions/_shared/schedulerHardRules.ts";

const UNFILLED = "—";

interface EditableScheduleGridProps {
  schedule: DayOutput[];
  mondayFtRuleActive?: boolean;
  /** Saved draft row id — required to persist schedule_overrides */
  scheduleId?: string | null;
  onChange: (next: DayOutput[]) => void;
  onSaveDraft?: (next: DayOutput[]) => Promise<void>;
  onReset?: () => void;
}

type DbProvider = {
  id: string;
  name: string;
  email: string | null;
};

type DbProfile = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  provider_group: string | null;
  requires_80hr_pp: boolean | null;
  night_only: boolean | null;
  evening_only: boolean | null;
  ft_or_mida_only: boolean | null;
  monthly_max_nights: number | null;
  night_block_min_length: number | null;
  night_block_max_length: number | null;
  nights_clean_days_after_block: number | null;
  counts_in_quotas: boolean | null;
};

type RowModel =
  | { kind: "section"; label: string; key: string; tint: string }
  | { kind: "provider"; name: string; profileId: string | null; key: string };

function scheduleToRecord(schedule: DayOutput[]): Record<string, Record<string, string | null>> {
  const out: Record<string, Record<string, string | null>> = {};
  for (const day of schedule) {
    out[day.date] = {};
    for (const a of day.assignments) {
      if (!a.provider) continue;
      out[day.date][a.provider] = a.shift;
    }
  }
  return out;
}

function applyProviderShiftChange(
  schedule: DayOutput[],
  date: string,
  providerName: string,
  newShift: string,
): DayOutput[] {
  return schedule.map((day) => {
    if (day.date !== date) return day;
    let nextAssign = day.assignments.map((a) => ({ ...a }));
    for (const a of nextAssign) {
      if (a.provider === providerName) {
        a.provider = "";
        a.unfilled = true;
      }
    }
    if (!newShift || newShift === UNFILLED || newShift === "") {
      return { ...day, assignments: nextAssign };
    }
    const idx = nextAssign.findIndex((a) => a.shift === newShift);
    if (idx >= 0) {
      nextAssign[idx] = {
        ...nextAssign[idx],
        provider: providerName,
        unfilled: false,
      };
    }
    return { ...day, assignments: nextAssign };
  });
}

function handleModeChangeForDay(
  schedule: DayOutput[],
  date: string,
  mode: DayMode,
  mondayFtRuleActive: boolean,
): DayOutput[] {
  return schedule.map((day) => {
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
}

function cellCreditForPP(shift: string | null | undefined): number {
  if (!shift || shift === UNFILLED) return 0;
  if (shift === "OFF" || shift === "X") return 0;
  if (shift === "L" || shift === "HL") return 10;
  return 10;
}

function computePPDisplayTotal(
  datesPP: string[],
  getShift: (d: string) => string | null | undefined,
): number {
  const leaveDays: string[] = [];
  let nonLeave = 0;
  for (const d of datesPP) {
    const s = getShift(d);
    if (!s || s === UNFILLED || s === "OFF" || s === "X") continue;
    if (s === "L" || s === "HL") {
      leaveDays.push(d);
      continue;
    }
    nonLeave += cellCreditForPP(s);
  }
  let room = Math.max(0, 80 - nonLeave);
  let leaveCred = 0;
  const sortedLeave = [...leaveDays].sort((a, b) => b.localeCompare(a));
  for (const _d of sortedLeave) {
    if (room >= 10) {
      leaveCred += 10;
      room -= 10;
    }
  }
  return nonLeave + leaveCred;
}

function weekendShiftCountForProvider(
  schedule: DayOutput[],
  providerName: string,
): number {
  let n = 0;
  for (const day of schedule) {
    const dow = day.dayOfWeek;
    if (dow !== 0 && dow !== 6) continue;
    const a = day.assignments.find((x) => x.provider === providerName);
    if (a?.provider && a.shift && a.shift !== "OFF" && a.shift !== "X" && a.shift !== UNFILLED) {
      if (a.shift === "L" || a.shift === "HL") continue;
      n++;
    }
  }
  return n;
}

function profileToRule(p: DbProfile | undefined): SchedulerProviderProfile | undefined {
  if (!p) return undefined;
  return {
    night_only: p.night_only,
    evening_only: p.evening_only,
    ft_or_mida_only: p.ft_or_mida_only,
    monthly_max_nights: p.monthly_max_nights,
    night_block_min_length: p.night_block_min_length,
    night_block_max_length: p.night_block_max_length,
    nights_clean_days_after_block: p.nights_clean_days_after_block,
    requires_80hr_pp: p.requires_80hr_pp,
    provider_group: p.provider_group,
    counts_in_quotas: p.counts_in_quotas,
  };
}

function linkProfileToProvider(p: DbProvider, profiles: DbProfile[]): DbProfile | undefined {
  if (p.email) {
    const hit = profiles.find((x) => x.email.toLowerCase() === p.email!.toLowerCase());
    if (hit) return hit;
  }
  const target = p.name.trim().toLowerCase();
  return profiles.find((x) => `${x.last_name}, ${x.first_name}`.toLowerCase() === target);
}

export function EditableScheduleGrid({
  schedule,
  mondayFtRuleActive = false,
  scheduleId = null,
  onChange,
  onSaveDraft,
  onReset,
}: EditableScheduleGridProps) {
  const { toast } = useToast();
  const [rules, setRules] = useState<Map<string, ProviderRule>>(new Map());
  const [dbProviders, setDbProviders] = useState<DbProvider[]>([]);
  const [dbProfiles, setDbProfiles] = useState<DbProfile[]>([]);
  const [saving, setSaving] = useState(false);

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideCtx, setOverrideCtx] = useState<{
    providerName: string;
    profileId: string | null;
    date: string;
    proposedShift: string;
    violation: ScheduleViolation;
    nextSchedule: DayOutput[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: provs } = await supabase
        .from("providers")
        .select("id, name, email, target_shifts, weekend_quota, active")
        .eq("active", true);
      const { data: cons } = await supabase.from("provider_constraints").select("*");
      const { data: pprof } = await supabase
        .from("provider_profiles")
        .select(
          "id, email, first_name, last_name, provider_group, requires_80hr_pp, night_only, evening_only, ft_or_mida_only, monthly_max_nights, night_block_min_length, night_block_max_length, nights_clean_days_after_block, counts_in_quotas, active",
        )
        .eq("active", true);

      const cByPid = new Map<string, any>();
      (cons || []).forEach((c: any) => cByPid.set(c.provider_id, c));
      const map = new Map<string, ProviderRule>();
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
      });
      setRules(map);
      setDbProviders((provs || []) as DbProvider[]);
      setDbProfiles((pprof || []) as DbProfile[]);
    })();
  }, []);

  const sortedDates = useMemo(
    () => [...schedule].map((d) => d.date).sort(),
    [schedule],
  );

  const profileByProviderName = useMemo(() => {
    const m = new Map<string, DbProfile>();
    for (const p of dbProviders) {
      const prof = linkProfileToProvider(p, dbProfiles);
      if (prof) m.set(p.name, prof);
    }
    return m;
  }, [dbProviders, dbProfiles]);

  const ruleProfileByName = useMemo(() => {
    const o: Record<string, SchedulerProviderProfile> = {};
    for (const p of dbProviders) {
      const prof = profileByProviderName.get(p.name);
      const r = profileToRule(prof);
      if (r) o[p.name.trim().toLowerCase()] = r;
    }
    return o;
  }, [dbProviders, profileByProviderName]);

  const rowModels = useMemo((): RowModel[] => {
    const names = dbProviders.map((p) => p.name).sort((a, b) => a.localeCompare(b));
    const military = names.filter((n) => profileByProviderName.get(n)?.provider_group === "military");
    const gs = names.filter((n) => profileByProviderName.get(n)?.provider_group === "gs");
    const res = names.filter((n) => profileByProviderName.get(n)?.provider_group === "resident");
    const other = names.filter(
      (n) => !military.includes(n) && !gs.includes(n) && !res.includes(n),
    );

    const out: RowModel[] = [];
    if (military.length) {
      out.push({
        kind: "section",
        key: "sec-mil",
        label: "Military Providers",
        tint: "rgba(16, 185, 129, 0.1)",
      });
      for (const name of military.sort()) {
        const prof = profileByProviderName.get(name);
        out.push({
          kind: "provider",
          key: `p-${name}`,
          name,
          profileId: prof?.id ?? null,
        });
      }
    }
    out.push({
      kind: "section",
      key: "sec-gs",
      label: "GS Providers",
      tint: "rgba(239, 68, 68, 0.1)",
    });
    const gsSorted = [...gs, ...other].sort((a, b) => a.localeCompare(b));
    for (const name of gsSorted) {
      const prof = profileByProviderName.get(name);
      out.push({ kind: "provider", key: `p-${name}`, name, profileId: prof?.id ?? null });
    }
    if (res.length) {
      out.push({
        kind: "section",
        key: "sec-res",
        label: "Residents",
        tint: "rgba(249, 115, 22, 0.1)",
      });
      for (const name of res.sort()) {
        const prof = profileByProviderName.get(name);
        out.push({
          kind: "provider",
          key: `p-${name}`,
          name,
          profileId: prof?.id ?? null,
        });
      }
    }
    return out;
  }, [dbProviders, profileByProviderName]);

  const watchSlots = useMemo(() => {
    const set = new Set<string>();
    for (const day of schedule) {
      const mode = (day.mode ?? day.coverage ?? 8) as DayMode;
      requiredShiftsForDay(mode, day.dayOfWeek, mondayFtRuleActive).forEach((s) => set.add(s));
    }
    return [...set].sort(
      (a, b) => TIGHTNESS_ORDER.indexOf(a as ShiftCode) - TIGHTNESS_ORDER.indexOf(b as ShiftCode),
    );
  }, [schedule, mondayFtRuleActive]);

  const shiftOptions = useMemo(() => {
    const s = new Set<string>([UNFILLED, "OFF", "X", ...Array.from(OFF_CODES)]);
    ALL_SHIFTS.forEach((x) => s.add(x));
    schedule.forEach((d) => d.assignments.forEach((a) => s.add(a.shift)));
    return [...s].sort((a, b) => {
      const ai = TIGHTNESS_ORDER.indexOf(a as ShiftCode);
      const bi = TIGHTNESS_ORDER.indexOf(b as ShiftCode);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
  }, [schedule]);

  const scheduleRecord = useMemo(() => scheduleToRecord(schedule), [schedule]);

  const issuesByCell = useMemo(() => {
    const out = new Map<string, CellIssue[]>();
    schedule.forEach((day) => {
      day.assignments.forEach((a) => {
        if (!a.provider || a.provider === UNFILLED) return;
        const rule = rules.get(a.provider.toLowerCase());
        const list = checkCellEdit(schedule, day.date, a.shift, a.provider, rule);
        if (list.length) out.set(`${day.date}|${a.shift}|${a.provider}`, list);
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

  const wkndStats = useMemo(() => {
    const counts: number[] = [];
    for (const row of rowModels) {
      if (row.kind !== "provider") continue;
      counts.push(weekendShiftCountForProvider(schedule, row.name));
    }
    if (counts.length === 0) return { mean: 0, min: 0, max: 0 };
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    return { mean, min, max };
  }, [rowModels, schedule]);

  const tryApplyShift = (providerName: string, date: string, newShift: string) => {
    const skipValidate =
      !newShift ||
      newShift === UNFILLED ||
      newShift === "OFF" ||
      newShift === "X" ||
      newShift === "L" ||
      newShift === "HL" ||
      newShift === "LH" ||
      newShift === "SL" ||
      newShift === "TL" ||
      newShift === "DP" ||
      newShift === "TDY";

    const next = applyProviderShiftChange(schedule, date, providerName, newShift);
    if (skipValidate) {
      onChange(next);
      return;
    }

    const pre = scheduleToRecord(schedule);
    const prof = ruleProfileByName[providerName.trim().toLowerCase()];
    const v = checkPlacement(
      pre,
      providerName,
      prof,
      date,
      newShift as ShiftCode,
      sortedDates,
      {
        dayMode: (d) => {
          const dd = schedule.find((x) => x.date === d);
          return (dd?.mode ?? dd?.coverage ?? 8) as DayMode;
        },
        mondayFtRuleActive,
      },
    );

    if (v === null) {
      onChange(next);
      return;
    }

    const pRow = dbProviders.find((p) => p.name === providerName);
    const linked = pRow ? linkProfileToProvider(pRow, dbProfiles) : undefined;
    setOverrideCtx({
      providerName,
      profileId: linked?.id ?? null,
      date,
      proposedShift: newShift,
      violation: v,
      nextSchedule: next,
    });
    setOverrideOpen(true);
  };

  const onOverrideConfirm = async (rationale: string) => {
    if (!overrideCtx) return;
    if (!scheduleId) {
      toast({
        title: "Save draft first",
        description: "A saved schedule row is required to record overrides.",
        variant: "destructive",
      });
      setOverrideOpen(false);
      setOverrideCtx(null);
      return;
    }
    if (!overrideCtx.profileId) {
      toast({
        title: "Cannot save override",
        description: "No provider_profiles row linked to this provider.",
        variant: "destructive",
      });
      setOverrideOpen(false);
      setOverrideCtx(null);
      return;
    }
    const userId = (await supabase.auth.getUser()).data.user?.id;
    const { error } = await supabase.from("schedule_overrides").insert({
      schedule_id: scheduleId,
      provider_id: overrideCtx.profileId,
      date: overrideCtx.date,
      shift_assigned: overrideCtx.proposedShift,
      rule_violated: overrideCtx.violation.type,
      rationale: rationale || null,
      created_by: userId ?? null,
    });
    if (error) {
      toast({ title: "Override save failed", description: error.message, variant: "destructive" });
      return;
    }
    onChange(overrideCtx.nextSchedule);
    toast({
      title: "Override applied",
      description: "The publish review will surface this.",
    });
    setOverrideOpen(false);
    setOverrideCtx(null);
  };

  const formatDate = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return `${dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`;
  };

  const isToday = (s: string) => {
    const today = new Date();
    const [y, m, d] = s.split("-").map(Number);
    return today.getFullYear() === y && today.getMonth() + 1 === m && today.getDate() === d;
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
              Provider rows, live hours, weekend counts, and coverage watch. Overrides require a saved
              draft.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={errorCount ? "destructive" : "outline"}>{errorCount} errors</Badge>
            <Badge variant={warnCount ? "default" : "outline"}>{warnCount} warnings</Badge>
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
                  <th className="glass sticky left-0 z-30 border-b border-r border-border/60 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[140px]">
                    Provider
                  </th>
                  <th className="glass sticky left-[140px] z-30 border-b border-r border-border/60 px-2 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[88px]">
                    Tot Hrs
                  </th>
                  <th className="glass sticky left-[228px] z-30 border-b border-r border-border/60 px-2 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground w-[64px]">
                    Wknd
                  </th>
                  {sortedDates.map((date) => (
                    <th
                      key={date}
                      className="glass border-b border-r border-border/60 px-2 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground min-w-[100px]"
                    >
                      {formatDate(date)}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th
                    colSpan={3}
                    className="sticky left-0 z-20 bg-card border-b border-r border-border/60 px-2 py-1 text-left text-[10px] uppercase text-muted-foreground"
                  >
                    Mode
                  </th>
                  {sortedDates.map((date) => {
                    const day = schedule.find((d) => d.date === date)!;
                    return (
                      <th
                        key={`m-${date}`}
                        className="border-b border-r border-border/60 px-0.5 py-0.5 align-middle bg-card"
                      >
                        <Select
                          value={String(day.mode ?? day.coverage ?? 8)}
                          onValueChange={(v) =>
                            onChange(handleModeChangeForDay(schedule, date, Number(v) as DayMode, mondayFtRuleActive))
                          }
                        >
                          <SelectTrigger className="h-7 w-full rounded border-border/60 bg-background/80 text-[10px] font-medium tabular px-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="8">8</SelectItem>
                            <SelectItem value="7">7</SelectItem>
                            <SelectItem value="6">6</SelectItem>
                          </SelectContent>
                        </Select>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rowModels.map((row) => {
                  if (row.kind === "section") {
                    return (
                      <tr key={row.key}>
                        <td
                          colSpan={3 + sortedDates.length}
                          className="border-b border-border/60 px-3 py-2 font-bold text-left"
                          style={{ backgroundColor: row.tint }}
                        >
                          {row.label}
                        </td>
                      </tr>
                    );
                  }
                  const prof = profileByProviderName.get(row.name);
                  const req80 = prof?.requires_80hr_pp === true;
                  const pp1 = sortedDates.filter((_, i) => i < 14);
                  const pp2 = sortedDates.slice(14);
                  const t1 = computePPDisplayTotal(pp1, (d) => scheduleRecord[d]?.[row.name]);
                  const t2 = computePPDisplayTotal(pp2, (d) => scheduleRecord[d]?.[row.name]);
                  const totLabel = `${t1} / ${t2}`;
                  const bad80 = req80 && (t1 !== 80 || t2 !== 80);
                  const softLow = prof?.requires_80hr_pp === false && (t1 < 60 || t2 < 60);
                  const totClass = bad80
                    ? "text-destructive"
                    : softLow
                    ? "text-amber-600"
                    : "text-emerald-600";

                  const wk = weekendShiftCountForProvider(schedule, row.name);
                  const wkDiff = wk - wkndStats.mean;
                  let wkBadge = "";
                  if (wkDiff > 2) wkBadge = "bg-amber-500/15 text-amber-800 dark:text-amber-200";
                  else if (wkDiff < -2) wkBadge = "bg-sky-500/15 text-sky-800 dark:text-sky-200";

                  return (
                    <tr key={row.key} className="group/row transition-colors hover:bg-[hsl(var(--primary-soft))]">
                      <td className="sticky left-0 z-10 bg-card border-b border-r border-border/60 px-3 py-1.5 font-medium whitespace-nowrap">
                        {row.name}
                      </td>
                      <td
                        className={`sticky left-[140px] z-10 bg-card border-b border-r border-border/60 px-2 py-1.5 text-right text-xs font-medium tabular-nums ${totClass}`}
                      >
                        {totLabel}
                      </td>
                      <td
                        className={`sticky left-[228px] z-10 bg-card border-b border-r border-border/60 px-2 py-1.5 text-right text-xs font-medium tabular-nums ${wkBadge}`}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help">{wk}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            Team mean: {wkndStats.mean.toFixed(1)} | Min: {wkndStats.min} | Max:{" "}
                            {wkndStats.max}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      {sortedDates.map((date) => {
                        const day = schedule.find((d) => d.date === date)!;
                        const a = day.assignments.find((x) => x.provider === row.name);
                        const val = a?.shift ?? UNFILLED;
                        const cellIssues =
                          issuesByCell.get(`${date}|${a?.shift}|${row.name}`) ||
                          ([] as CellIssue[]);
                        const hasError = cellIssues.some((i) => i.severity === "error");
                        const hasWarn = cellIssues.some((i) => i.severity === "warning");
                        const cellTone = hasError
                          ? "ring-1 ring-destructive/70 bg-destructive/5"
                          : hasWarn
                          ? "ring-1 ring-amber-500/50 bg-amber-500/5"
                          : "border-border/60";
                        const today = isToday(date);
                        const select = (
                          <Select
                            value={val}
                            onValueChange={(v) => tryApplyShift(row.name, date, v)}
                          >
                            <SelectTrigger
                              className={`h-8 w-full rounded-md border-transparent bg-transparent text-xs font-medium tabular-nums hover:bg-background focus:bg-background ${cellTone}`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {shiftOptions.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        );
                        return (
                          <td
                            key={`${row.key}-${date}`}
                            className={`border-b border-r border-border/60 px-1 py-0.5 align-middle ${
                              today ? "bg-[hsl(var(--today-tint))]/40" : ""
                            }`}
                          >
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
                                        <span
                                          className={
                                            i.severity === "error" ? "text-destructive font-medium" : ""
                                          }
                                        >
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

                <tr>
                  <td
                    colSpan={3 + sortedDates.length}
                    className="border-t-2 border-border/80 bg-muted/20 px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground"
                  >
                    Coverage Watch
                  </td>
                </tr>
                {watchSlots.map((slot) => (
                  <tr key={`cw-${slot}`} className="bg-muted/10">
                    <td
                      colSpan={3}
                      className="sticky left-0 z-10 bg-muted/10 border-b border-r border-border/60 px-3 py-1 text-xs font-semibold tabular-nums"
                    >
                      {slot}
                    </td>
                    {sortedDates.map((date) => {
                      const day = schedule.find((d) => d.date === date)!;
                      const mode = (day.mode ?? day.coverage ?? 8) as DayMode;
                      const req = requiredShiftsForDay(mode, day.dayOfWeek, mondayFtRuleActive);
                      const need = req.filter((s) => s === slot).length;
                      const actual = day.assignments.filter(
                        (a) => a.shift === slot && a.provider && a.provider !== UNFILLED,
                      ).length;
                      let bg = "bg-muted/10";
                      if (need === 0) bg = "bg-muted/30 text-muted-foreground";
                      else if (actual < need) bg = "bg-destructive/10 text-destructive";
                      else if (actual > need) bg = "bg-amber-500/10 text-amber-800 dark:text-amber-200";
                      else bg = "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
                      return (
                        <td
                          key={`cw-${slot}-${date}`}
                          className={`border-b border-r border-border/60 px-1 py-1 text-center text-xs font-medium tabular-nums ${bg}`}
                        >
                          {actual} / {need}
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

      {overrideCtx && (
        <OverrideConfirmDialog
          open={overrideOpen}
          onCancel={() => {
            setOverrideOpen(false);
            setOverrideCtx(null);
          }}
          onConfirm={onOverrideConfirm}
          providerName={overrideCtx.providerName}
          date={overrideCtx.date}
          proposedShift={overrideCtx.proposedShift}
          violation={overrideCtx.violation}
        />
      )}
    </Card>
  );
}
