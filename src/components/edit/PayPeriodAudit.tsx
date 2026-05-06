import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { DayOutput } from "./cellRules";

interface PayPeriod {
  id: string;
  pp_number: number;
  pp_year: number;
  start_date: string;
  end_date: string;
}

interface PayPeriodAuditProps {
  schedule: DayOutput[];
  month: string; // e.g. "January"
  year: number;
}

const PP_LIMIT = 8; // shifts per pay period
const NON_WORK = new Set(["OFF", "L", "HL", "X", "SL", "TL", "DP", "TDY"]);

export function PayPeriodAudit({ schedule, month, year }: PayPeriodAuditProps) {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);

  useEffect(() => {
    (async () => {
      // Pull all pay periods that overlap this month
      const monthIdx = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December",
      ].indexOf(month);
      if (monthIdx < 0) return;
      const monthStart = new Date(year, monthIdx, 1).toISOString().slice(0, 10);
      const monthEnd = new Date(year, monthIdx + 1, 0).toISOString().slice(0, 10);
      const { data } = await supabase
        .from("pay_periods")
        .select("id, pp_number, pp_year, start_date, end_date")
        .lte("start_date", monthEnd)
        .gte("end_date", monthStart)
        .order("start_date");
      setPeriods(data || []);
    })();
  }, [month, year]);

  // Per-PP, per-provider shift count
  const audit = useMemo(() => {
    const out: Array<{
      pp: PayPeriod;
      perProvider: Map<string, number>;
    }> = [];
    periods.forEach((pp) => {
      const counts = new Map<string, number>();
      schedule.forEach((day) => {
        if (day.date < pp.start_date || day.date > pp.end_date) return;
        day.assignments.forEach((a) => {
          if (!a.provider || NON_WORK.has(a.shift)) return;
          if (a.shift === "C" || a.shift === "A10") return; // not regular shifts
          counts.set(a.provider, (counts.get(a.provider) || 0) + 1);
        });
      });
      out.push({ pp, perProvider: counts });
    });
    return out;
  }, [periods, schedule]);

  if (!schedule || schedule.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Generate a schedule to audit pay periods.
        </CardContent>
      </Card>
    );
  }
  if (periods.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No pay periods found for {month} {year}.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay Period Audit</CardTitle>
        <CardDescription>
          Limit is {PP_LIMIT} regular shifts per pay period. Call (C) and Admin (A10) excluded.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {audit.map(({ pp, perProvider }) => {
            const rows = [...perProvider.entries()].sort((a, b) => b[1] - a[1]);
            const overCount = rows.filter(([, c]) => c > PP_LIMIT).length;
            return (
              <div key={pp.id} className="rounded-md border">
                <div className="px-3 py-2 border-b bg-muted/40 flex items-center justify-between">
                  <div className="text-sm font-medium">
                    PP {pp.pp_number}/{pp.pp_year}
                    <span className="text-muted-foreground ml-2 font-normal">
                      {pp.start_date} → {pp.end_date}
                    </span>
                  </div>
                  <Badge variant={overCount > 0 ? "destructive" : "outline"}>
                    {overCount > 0 ? `${overCount} over limit` : "all within limit"}
                  </Badge>
                </div>
                <ScrollArea className="max-h-[200px]">
                  <table className="w-full text-sm">
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td className="p-3 text-muted-foreground text-center" colSpan={2}>
                            No assignments in this pay period.
                          </td>
                        </tr>
                      ) : (
                        rows.map(([name, count]) => (
                          <tr key={name} className="border-b last:border-b-0">
                            <td className="p-2">{name}</td>
                            <td className="p-2 text-right tabular-nums">
                              <span
                                className={
                                  count > PP_LIMIT
                                    ? "text-destructive font-semibold"
                                    : count === PP_LIMIT
                                    ? "text-amber-600 dark:text-amber-400"
                                    : ""
                                }
                              >
                                {count} / {PP_LIMIT}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}