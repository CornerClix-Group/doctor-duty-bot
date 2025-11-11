import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Calendar, Download } from 'lucide-react';
import { ScheduleUpload } from '@/components/ScheduleUpload';
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { ProviderStats } from '@/components/ProviderStats';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function GenerateSchedule() {
  const { toast } = useToast();
  const [month, setMonth] = useState('January');
  const [year, setYear] = useState(new Date().getFullYear());
  const [generating, setGenerating] = useState(false);
  const [uploadedData, setUploadedData] = useState<any>(null);
  const [generatedSchedule, setGeneratedSchedule] = useState<any>(null);

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      
      // Fetch all provider profiles with constraints
      const { data: providers, error: providersError } = await supabase
        .from('providers')
        .select(`
          *,
          provider_constraints (*)
        `)
        .eq('active', true);

      if (providersError) throw providersError;

      // Format provider profiles for AI
      const providerProfiles = providers.map(p => ({
        id: p.id,
        name: p.name,
        email: p.email,
        targetShifts: p.target_shifts,
        weekendQuota: p.weekend_quota,
        constraints: p.provider_constraints?.[0] || {}
      }));

      console.log('Calling generate-schedule edge function...');

      // Build schedule data in the format expected by the edge function
      const scheduleData = {
        month: `${month} ${year}`,
        providers: providerProfiles.map(p => ({
          name: p.name,
          target_shifts: p.targetShifts,
          weekend_quota: p.weekendQuota
        })),
        days: uploadedData?.days || []
      };

      const { data, error } = await supabase.functions.invoke('generate-schedule', {
        body: {
          providerProfiles,
          scheduleData
        }
      });

      if (error) {
        if (error.message?.includes('429')) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (error.message?.includes('402')) {
          throw new Error('AI credits exhausted. Please add credits to your workspace.');
        }
        throw error;
      }

      console.log('Schedule generated:', data);
      setGeneratedSchedule(data);

      toast({
        title: 'Schedule Generated!',
        description: `Successfully created schedule for ${month} ${year}`,
      });
    } catch (error: any) {
      console.error('Error generating schedule:', error);
      toast({
        title: 'Generation Failed',
        description: error.message || 'Failed to generate schedule',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSchedule = async () => {
    if (!generatedSchedule) return;

    try {
      const { error } = await supabase
        .from('schedules')
        .insert({
          month,
          year,
          schedule_data: generatedSchedule.schedule,
          provider_totals: generatedSchedule.providerTotals,
        });

      if (error) throw error;

      toast({
        title: 'Schedule Saved',
        description: 'Schedule has been saved to the database',
      });
    } catch (error: any) {
      console.error('Error saving schedule:', error);
      toast({
        title: 'Save Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-3 rounded-xl">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-foreground">AI Schedule Generator</h1>
            <p className="text-muted-foreground">Generate optimal schedules using AI</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Schedule Parameters</CardTitle>
            <CardDescription>Select the month and year for schedule generation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Month</label>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Year</label>
                <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2025, 2026, 2027].map(y => (
                      <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Optional: Upload Existing Schedule</CardTitle>
            <CardDescription>Upload an Excel template with existing assignments</CardDescription>
          </CardHeader>
          <CardContent>
            <ScheduleUpload onScheduleLoad={setUploadedData} />
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            onClick={handleGenerate}
            disabled={generating}
            size="lg"
            className="flex-1"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Generating Schedule...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-5 w-5" />
                Generate Schedule with AI
              </>
            )}
          </Button>

          {generatedSchedule && (
            <Button
              onClick={handleSaveSchedule}
              variant="secondary"
              size="lg"
            >
              <Download className="mr-2 h-5 w-5" />
              Save Schedule
            </Button>
          )}
        </div>

        {generatedSchedule && (
          <div className="space-y-6">
            {generatedSchedule.warnings && generatedSchedule.warnings.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-600 mb-2">Warnings:</h4>
                    <ul className="list-disc list-inside space-y-1">
                      {generatedSchedule.warnings.map((w: string, i: number) => (
                        <li key={i} className="text-sm text-yellow-700">{w}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            <ScheduleCalendar
              schedule={(() => {
                if (!generatedSchedule.schedule) return [];
                
                // Transform AI response format to calendar format
                return generatedSchedule.schedule.map((day: any) => {
                  const assignments = [];
                  
                  // Convert shifts object to assignments array
                  if (day.shifts && typeof day.shifts === 'object') {
                    for (const [shiftType, providerName] of Object.entries(day.shifts)) {
                      if (shiftType && providerName && shiftType !== 'HL') {
                        assignments.push({
                          shift: shiftType,
                          provider: providerName as string
                        });
                      }
                    }
                  }
                  
                  return {
                    date: day.date,
                    pattern: day.pattern || 7,
                    assignments
                  };
                });
              })()}
              month={`${month} ${year}`}
            />

            {generatedSchedule.provider_totals && (
              <ProviderStats providerTotals={generatedSchedule.provider_totals} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}