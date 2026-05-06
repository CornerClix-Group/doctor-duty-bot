import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DayOutput } from "./cellRules";

interface WorkloadDashboardProps {
  schedule: DayOutput[];
}

interface ProviderRow {
  name: string;
  worked: number;
  weekends: number;
  nights: number;
  call: number;
  admin: number;
  target: number;
  weekend_quota: number;
}

const NON_WORK = new Set(["OFF", "L", "HL", "X", "SL", "TL", "DP", "TDY"]);

export function WorkloadDashboard({ schedule }: WorkloadDashboardProps) {
  const [providerMeta, setProviderMeta] = useState<
    Map<string, { target: number; weekend_quota: number }>
  >(new Map());

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("providers")
        .select("name, target_shifts, weekend_quota, active")
        .eq("active", true);
      const m = new Map<string, { target: number; weekend_quota: number }>();
      (data || []).forEach((p: any) =>
        m.set(p.name.toLowerCase(), {
          target: p.target_shifts ?? 0,
          weekend_quota: p.weekend_quota ?? 0,
        }),
      );
      setProviderMeta(m);
    })();
  }, []);

  const rows = useMemo<ProviderRow[]>(() => {
    const map = new Map<string, ProviderRow>();
    schedule.forEach((day) => {
      const [y, m, d] = day.date.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const isWk = dow === 0 || dow === 6;
      day.assignments.forEach((a) => {
        if (!a.provider || NON_WORK.has(a.shift)) return;
        const key = a.provider;
        const meta = providerMeta.get(key.toLowerCase()) || { target: 0, weekend_quota: 0 };
        let row = map.get(key);
        if (!row) {
          row = {
            name: key,
            worked: 0,
            weekends: 0,
            nights: 0,
            call: 0,
            admin: 0,
            target: meta.target,
            weekend_quota: meta.weekend_quota,
          };
          map.set(key, row);
        }
        if (a.shift === "C") row.call++;
        else if (a.shift === "A10") row.admin++;
        else {
          row.worked++;
          if (isWk) row.weekends++;
          if (a.shift === "N") row.nights++;
        }
      });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [schedule, providerMeta]);

  if (!schedule || schedule.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Generate a schedule to see workload.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workload Dashboard</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[480px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th className="text-left p-2 font-medium">Provider</th>
                <th className="text-left p-2 font-medium w-[200px]">Target Progress</th>
                <th className="text-center p-2 font-medium">Worked</th>
                <th className="text-center p-2 font-medium">Wknds</th>
                <th className="text-center p-2 font-medium">Nights</th>
                <th className="text-center p-2 font-medium">Call</th>
                <th className="text-center p-2 font-medium">Admin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pct = r.target > 0 ? Math.min(100, (r.worked / r.target) * 100) : 0;
                const delta = r.worked - r.target;
                const wkDelta = r.weekends - r.weekend_quota;
                return (
                  <tr key={r.name} className="border-b last:border-b-0">
                    <td className="p-2 font-medium">{r.name}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
                          {r.worked}/{r.target || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      <span
                        className={
                          delta === 0
                            ? ""
                            : delta > 0
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-destructive"
                        }
                      >
                        {r.worked}
                        {r.target ? (delta === 0 ? "" : delta > 0 ? ` (+${delta})` : ` (${delta})`) : ""}
                      </span>
                    </td>
                    <td className="p-2 text-center">
                      <Badge variant={wkDelta > 0 ? "default" : wkDelta < 0 ? "destructive" : "outline"}>
                        {r.weekends}/{r.weekend_quota || "—"}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">{r.nights}</td>
                    <td className="p-2 text-center">{r.call}</td>
                    <td className="p-2 text-center">{r.admin}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}