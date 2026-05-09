import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Download, Trash2, ArrowLeft, FileSpreadsheet, Sparkles } from 'lucide-react';
import { ScheduleUpload } from '@/components/ScheduleUpload';
import { ScheduleWorkbench } from '@/components/ScheduleWorkbench';
import { EditTab } from '@/components/edit/EditTab';
import { PublishPanel } from '@/components/publish/PublishPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion } from 'framer-motion';
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
  const [uploadedData, setUploadedData] = useState<any>(null);
  const [uploadedFileBase64, setUploadedFileBase64] = useState<string | null>(null);
  const [generatedSchedule, setGeneratedSchedule] = useState<any>(null);

  // Convert month name to 1-12 number for ScheduleUpload
  const selectedMonthNumber = MONTHS.indexOf(month) + 1;

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

        <Tabs defaultValue="build">
          <TabsList className="grid grid-cols-2 w-full max-w-sm">
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="edit" disabled={!generatedSchedule}>
              Edit
            </TabsTrigger>
          </TabsList>
          <TabsContent value="build" className="pt-4">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            >
              <ScheduleWorkbench
                  month={month}
                  year={year}
                  uploadedFileBase64={uploadedFileBase64}
                  uploadedData={uploadedData}
                  onScheduleGenerated={setGeneratedSchedule}
                  generatedSchedule={generatedSchedule}
              />
            </motion.div>
          </TabsContent>
          <TabsContent value="edit" className="pt-4">
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            >
              <EditTab
                  month={month}
                  year={year}
                  generatedSchedule={generatedSchedule}
                  onScheduleChange={setGeneratedSchedule}
              />
            </motion.div>
          </TabsContent>
        </Tabs>

        {generatedSchedule && (
          <PublishPanel
            month={month}
            year={year}
            generatedSchedule={generatedSchedule}
          />
        )}

        {generatedSchedule && (
          <div className="flex flex-wrap gap-3">
            <>
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
          </div>
        )}
      </div>
    </div>
  );
}