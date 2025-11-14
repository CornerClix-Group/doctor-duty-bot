import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Sparkles, Calendar, Download, Trash2, ArrowLeft, FileSpreadsheet, Eye } from 'lucide-react';
import { ScheduleUpload } from '@/components/ScheduleUpload';
import { ScheduleCalendar } from '@/components/ScheduleCalendar';
import { ProviderStats } from '@/components/ProviderStats';
import { exportScheduleToExcel } from '@/lib/scheduleExporterExcel';
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
  const navigate = useNavigate();
  const { toast } = useToast();
  const [month, setMonth] = useState('January');
  const [year, setYear] = useState(2026);
  const [generating, setGenerating] = useState(false);
  const [uploadedData, setUploadedData] = useState<any>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [generatedSchedule, setGeneratedSchedule] = useState<any>(null);

  // Convert month name to 1-12 number for ScheduleUpload
  const selectedMonthNumber = MONTHS.indexOf(month) + 1;

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

      if (!uploadedFileBase64) {
        throw new Error('Please upload an Excel schedule file first.');
      }

      const { data, error } = await supabase.functions.invoke('generate-schedule-v2', {
        body: {
          file: uploadedFileBase64
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
          provider_totals: generatedSchedule.provider_totals || generatedSchedule.providerTotals,
          created_by: (await supabase.auth.getUser()).data.user?.id,
          status: 'draft'
        });

      if (error) throw error;

      toast({
        title: 'Schedule Saved',
        description: 'Schedule has been saved as draft',
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

  const handleExportExcel = async () => {
    try {
      if (!generatedSchedule) return;

      // Normalize schedule format
      const scheduleArray = generatedSchedule.schedule || [];

      // Check if provider_totals exists, if not calculate from schedule
      let providerTotals = generatedSchedule.provider_totals;
      
      if (!providerTotals || Object.keys(providerTotals).length === 0) {
        // Calculate provider totals from schedule data
        providerTotals = {};
        scheduleArray.forEach((day: any) => {
          if (day.assignments && Array.isArray(day.assignments)) {
            day.assignments.forEach((assignment: any) => {
              const provider = assignment.provider;
              if (!providerTotals[provider]) {
                providerTotals[provider] = {
                  worked: 0,
                  weekends: 0,
                  call: 0,
                  admin: 0,
                  night: 0
                };
              }
              providerTotals[provider].worked += 1;
              
              // Check if weekend (day 0 = Sunday, 6 = Saturday)
              const date = new Date(day.date);
              if (date.getDay() === 0 || date.getDay() === 6) {
                providerTotals[provider].weekends += 1;
              }
              
              // Count night shifts
              if (assignment.shift === 'N') {
                providerTotals[provider].night += 1;
              }
            });
          }
        });
      }

      const buffer = await exportScheduleToExcel(
        scheduleArray,
        month,
        year,
        providerTotals,
        uploadedData?.coverage_pattern
      );

      // Download file
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Schedule_${month}_${year}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);

      toast({
        title: 'Export Successful',
        description: 'Schedule exported to Excel format',
      });
    } catch (error: any) {
      console.error('Error exporting schedule:', error);
      toast({
        title: 'Export Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handlePublishSchedule = async () => {
    try {
      if (!generatedSchedule) return;

      // First check if schedule already exists
      const { data: existing, error: fetchError } = await supabase
        .from('schedules')
        .select('id')
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (existing) {
        // Update existing schedule to published
        const { error } = await supabase
          .from('schedules')
          .update({ 
            schedule_data: generatedSchedule.schedule || [],
            provider_totals: generatedSchedule.provider_totals || {},
            status: 'published',
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Create new schedule as published
        const { error } = await supabase.from('schedules').insert({
          month,
          year,
          schedule_data: generatedSchedule.schedule || [],
          provider_totals: generatedSchedule.provider_totals || {},
          created_by: (await supabase.auth.getUser()).data.user?.id,
          status: 'published'
        });

        if (error) throw error;
      }

      toast({
        title: 'Schedule Published',
        description: 'Schedule is now visible to all providers',
      });
    } catch (error: any) {
      console.error('Error publishing schedule:', error);
      toast({
        title: 'Publish Failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-3 rounded-xl">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">AI Schedule Generator</h1>
              <p className="text-muted-foreground">Generate optimal schedules using AI</p>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            size="lg"
          >
            <ArrowLeft className="mr-2 h-5 w-5" />
            Back to Home
          </Button>
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
                    {[2026, 2027].map(y => (
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
            <ScheduleUpload 
              key={uploadedData ? 'uploaded' : 'empty'} 
              onScheduleLoad={(data, base64) => {
                setUploadedData(data);
                setUploadedFileBase64(base64 || null);
              }}
              selectedMonth={selectedMonthNumber}
              selectedYear={year}
            />
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
                onClick={handlePublishSchedule}
                variant="default"
                size="lg"
              >
                <Eye className="mr-2 h-5 w-5" />
                Publish Schedule
              </Button>

              <Button
                onClick={handleExportExcel}
                variant="secondary"
                size="lg"
              >
                <FileSpreadsheet className="mr-2 h-5 w-5" />
                Export to Excel
              </Button>

              <Button
                onClick={handleSaveSchedule}
                variant="outline"
                size="lg"
              >
                <Download className="mr-2 h-5 w-5" />
                Save Draft
              </Button>
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="destructive"
                    size="lg"
                  >
                    <Trash2 className="mr-2 h-5 w-5" />
                    Clear
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

                // Normalize to [{ date, pattern, assignments: [{shift, provider}] }]
                return generatedSchedule.schedule.map((day: any) => {
                  let assignments: { shift: string; provider: string }[] = [];

                  if (Array.isArray(day.assignments)) {
                    // New format from edge function
                    assignments = day.assignments
                      .filter((a: any) => a && a.shift && a.shift !== 'HL' && a.shift !== 'LH')
                      .map((a: any) => ({ shift: a.shift, provider: a.provider ?? '' }));
                  } else if (day.shifts && typeof day.shifts === 'object') {
                    // Legacy format support
                    for (const [shiftType, providerName] of Object.entries(day.shifts)) {
                      if (shiftType && shiftType !== 'HL' && shiftType !== 'LH') {
                        assignments.push({
                          shift: shiftType,
                          provider: (providerName as string) || ''
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