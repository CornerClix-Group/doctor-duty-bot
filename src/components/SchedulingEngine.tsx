import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Calendar, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ParsedSchedule {
  month: string;
  year: number;
  coverage_pattern: { [date: string]: number };
  providers: {
    name: string;
    weekend_quota: number;
    night_quota: number;
    total_shifts: number;
    days: {
      date: string;
      locked: boolean;
      value: string;
    }[];
  }[];
}

interface SchedulingEngineProps {
  scheduleData: ParsedSchedule;
  onScheduleGenerated: (schedule: any) => void;
}

export const SchedulingEngine = ({ scheduleData, onScheduleGenerated }: SchedulingEngineProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleGenerateSchedule = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      console.log("Invoking generate-schedule-v2 edge function...");
      console.log("Schedule data:", scheduleData);

      const { data, error: functionError } = await supabase.functions.invoke(
        "generate-schedule-v2",
        {
          body: {
            mode: "schedule",
            scheduleData
          }
        }
      );

      if (functionError) {
        console.error("Edge function error:", functionError);
        throw new Error(functionError.message || "Failed to generate schedule");
      }

      console.log("Schedule generated successfully:", data);

      if (data.warnings && data.warnings.length > 0) {
        toast({
          title: "Schedule Generated with Warnings",
          description: `${data.warnings.length} warnings found. Check the validation panel.`,
          variant: "default"
        });
      } else {
        toast({
          title: "Schedule Generated Successfully",
          description: "Your schedule has been generated without issues.",
          variant: "default"
        });
      }

      onScheduleGenerated(data);

    } catch (err: any) {
      console.error("Error generating schedule:", err);
      const errorMessage = err.message || "An unexpected error occurred while generating the schedule";
      setError(errorMessage);
      
      toast({
        title: "Generation Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Generate Final Schedule</h3>
          <p className="text-sm text-muted-foreground">
            Month: {scheduleData.month}/{scheduleData.year} • {scheduleData.providers.length} providers
          </p>
        </div>

        <Button
          onClick={handleGenerateSchedule}
          disabled={isGenerating}
          size="lg"
          className="gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4" />
              Generate Final Schedule
            </>
          )}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {isGenerating && (
        <div className="rounded-lg border bg-muted/50 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="font-medium">Generating schedule...</p>
              <p className="text-sm text-muted-foreground">
                This may take a few moments. The scheduler is assigning shifts while respecting all constraints.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
