import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Calendar, Download, Trash2 } from 'lucide-react';
import { ScheduleUpload } from '@/components/ScheduleUpload';
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { ProviderStats } from '@/components/ProviderStats';
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
} from '@/components/ui/alert-dialog';

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
      if (!providers || providers.length === 0) {
        throw new Error('No active providers found. Please add providers first.');
      }

      // Transform provider profiles to expected payload
      const provider_profiles = providers.map((p: any) => {
        const c = Array.isArray(p.provider_constraints) ? p.provider_constraints[0] : p.provider_constraints;
        const [first_name, ...rest] = (p.name || '').split(' ');
        return {
          first_name: first_name || '',
          last_name: rest.join(' '),
          email: p.email || '',
          role: 'provider',
          allowed_shifts: c?.allowed_shifts || [],
          rules: {
            disallowed_shifts: c?.disallowed_shifts || [],
            preferred_shifts: c?.preferred_shifts || [],
            rest_hours: c?.rest_hours ?? 12,
            n_recovery_days: c?.n_recovery_days ?? 2,
            block_pattern: c?.block_pattern || null,
            max_consecutive_N: c?.max_consecutive_n || null,
            saturday_restrictions: c?.saturday_restrictions || null,
            sunday_restrictions: c?.sunday_restrictions || null,
          }
        };
      });

      console.log('Calling generate-schedule edge function...');

      // Use uploaded normalized data if available; otherwise build minimal skeleton
      const schedule_data = uploadedData?.month ? uploadedData : {
        month: `${month} ${year}`,
        coverage_pattern: {},
        providers: providers.map((p: any) => ({
          name: p.name,
          target_shifts: p.target_shifts,
          weekend_quota: p.weekend_quota,
          days: [] as any[]
        }))
      };

      const { data, error } = await supabase.functions.invoke('generate-schedule', {
        body: {
          provider_profiles,
          schedule_data
        }
      });

      if (error) {
        if (error.message?.includes('429')) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (error.message?.includes('402')) {
          throw new Error('AI credits exhausted. Please add credits to your workspace.');
        }
        if (error.message?.includes('Locked cell violation') || error.message?.includes('422')) {
          throw new Error('Locked cell violation: the AI attempted to overwrite protected cells from the uploaded sheet.');
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

  const handleClearSchedule = () => {
    setGeneratedSchedule(null);
    toast({
      title: 'Schedule Cleared',
      description: 'The generated schedule has been cleared',
    });
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
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Optional: Upload Existing Schedule</CardTitle>
                <CardDescription>Upload an Excel template with existing assignments</CardDescription>
              </div>
              {uploadedData && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Upload
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Uploaded Schedule?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will remove the uploaded schedule data. You can upload a new file anytime. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={() => {
                          setUploadedData(null);
                          toast({
                            title: 'Upload Deleted',
                            description: 'The uploaded schedule has been removed',
                          });
                        }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Delete Upload
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScheduleUpload onScheduleLoad={setUploadedData} />
            {uploadedData && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  ✓ Schedule uploaded: <span className="font-medium text-foreground">{uploadedData.month}</span>
                  {uploadedData.providers && (
                    <span className="ml-2">({uploadedData.providers.length} providers)</span>
                  )}
                </p>
              </div>
            )}
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
            <>
              <Button
                onClick={handleSaveSchedule}
                variant="secondary"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                Save Schedule
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="lg"
                  >
                    <Trash2 className="mr-2 h-5 w-5" />
                    Clear Schedule
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear Generated Schedule?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove the current generated schedule. You will need to generate a new schedule if you want to continue. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearSchedule} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Clear Schedule
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
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