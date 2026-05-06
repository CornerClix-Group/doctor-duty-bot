import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EditableScheduleGrid } from "./EditableScheduleGrid";
import { WorkloadDashboard } from "./WorkloadDashboard";
import { PayPeriodAudit } from "./PayPeriodAudit";
import type { DayOutput } from "./cellRules";

interface EditTabProps {
  month: string;
  year: number;
  generatedSchedule: any;
  onScheduleChange: (next: any) => void;
}

export function EditTab({ month, year, generatedSchedule, onScheduleChange }: EditTabProps) {
  const { toast } = useToast();
  const [schedule, setSchedule] = useState<DayOutput[]>([]);
  const [original, setOriginal] = useState<DayOutput[]>([]);

  // Normalize incoming generatedSchedule into DayOutput[]
  useEffect(() => {
    const sched: DayOutput[] = Array.isArray(generatedSchedule?.schedule)
      ? generatedSchedule.schedule
      : [];
    setSchedule(sched);
    setOriginal(JSON.parse(JSON.stringify(sched)));
  }, [generatedSchedule]);

  const handleChange = (next: DayOutput[]) => {
    setSchedule(next);
    onScheduleChange({ ...generatedSchedule, schedule: next });
  };

  const handleReset = () => {
    const fresh = JSON.parse(JSON.stringify(original));
    setSchedule(fresh);
    onScheduleChange({ ...generatedSchedule, schedule: fresh });
    toast({ title: "Reverted to last generated schedule" });
  };

  const handleSaveDraft = async (next: DayOutput[]) => {
    const { data: existing } = await supabase
      .from("schedules")
      .select("id")
      .eq("month", month)
      .eq("year", year)
      .maybeSingle();
    const payload = {
      schedule_data: next,
      assignments: next,
      status: "draft" as const,
      updated_at: new Date().toISOString(),
    };
    if (existing) {
      const { error } = await supabase.from("schedules").update(payload).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("schedules").insert({
        month,
        year,
        ...payload,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
    }
  };

  return (
    <Tabs defaultValue="calendar">
      <TabsList className="grid grid-cols-3 w-full max-w-lg">
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        <TabsTrigger value="workload">Workload</TabsTrigger>
        <TabsTrigger value="payperiods">Pay Periods</TabsTrigger>
      </TabsList>
      <TabsContent value="calendar" className="pt-4">
        <EditableScheduleGrid
          schedule={schedule}
          onChange={handleChange}
          onSaveDraft={handleSaveDraft}
          onReset={handleReset}
        />
      </TabsContent>
      <TabsContent value="workload" className="pt-4">
        <WorkloadDashboard schedule={schedule} />
      </TabsContent>
      <TabsContent value="payperiods" className="pt-4">
        <PayPeriodAudit schedule={schedule} month={month} year={year} />
      </TabsContent>
    </Tabs>
  );
}