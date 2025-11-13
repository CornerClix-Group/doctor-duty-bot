import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { exportFinalScheduleToExcel } from '@/lib/scheduleExporter';
import { generateScheduleTemplate } from '@/lib/scheduleTemplateGenerator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SchedulingEngineProps {
  scheduleData: any;
  onScheduleGenerated: (result: any) => void;
}

export const SchedulingEngine = ({ scheduleData, onScheduleGenerated }: SchedulingEngineProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<any>(null);
  const [validationResults, setValidationResults] = useState<{
    status: 'success' | 'warning' | 'error';
    message: string;
    details?: string[];
    validation?: {
      lockedCellsPreserved?: number;
      lockedCellViolations?: string[];
      constraintViolations?: string[];
      unfilledShifts?: string[];
      providerMismatches?: string[];
    };
  } | null>(null);
  const { toast } = useToast();

  const handleGenerate = async () => {
    setIsProcessing(true);
    setValidationResults(null);
    setGeneratedResult(null);

    try {
      // Validate scheduleData has been uploaded
      if (!scheduleData || !scheduleData.providers || scheduleData.providers.length === 0) {
        throw new Error("Please upload a schedule file first before generating.");
      }

      // Get the raw Excel file from the file input
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!fileInput?.files?.[0]) {
        throw new Error("No Excel file found. Please upload a schedule file.");
      }

      const file = fileInput.files[0];
      
      // Convert to base64
      const base64File = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      console.log('Calling generate-schedule-v2 with base64 Excel file');

      // Call the edge function with base64 Excel file
      const { data, error } = await supabase.functions.invoke('generate-schedule-v2', {
        body: {
          file: base64File
        }
      });

      if (error) {
        if (error.message.includes('Rate limit') || error.message.includes('429')) {
          toast({
            title: "Rate Limit Exceeded",
            description: "Please wait a moment and try again.",
            variant: "destructive"
          });
          throw new Error("Rate limit exceeded");
        }
        if (error.message.includes('credits') || error.message.includes('Payment required') || error.message.includes('402')) {
          toast({
            title: "AI Credits Exhausted",
            description: "Please add credits to continue generating schedules.",
            variant: "destructive"
          });
          throw new Error("AI credits exhausted");
        }
        if (error.message.includes('Locked cell violation') || error.message.includes('422')) {
          const details = data?.details ? ` Details: ${data.details.join(', ')}` : '';
          toast({
            title: "Locked Cell Violation",
            description: `The AI attempted to overwrite protected cells.${details}`,
            variant: "destructive"
          });
          throw new Error("Locked cell violation detected");
        }
        throw error;
      }

      const result = data;
      console.log('Schedule generation result:', result);

      const validation = result.validation || {};
      const hasViolations = (validation.lockedCellViolations?.length || 0) > 0 || 
                           (validation.constraintViolations?.length || 0) > 0;
      const hasWarnings = (result.warnings?.length || 0) > 0 || 
                         (validation.unfilledShifts?.length || 0) > 0;

      const details: string[] = [
        `${result.schedule?.length || 0} days scheduled`,
        `${validation.lockedCellsPreserved || 0} locked cells preserved`,
      ];

      if (validation.unfilledShifts?.length) {
        details.push(`${validation.unfilledShifts.length} shifts unfilled (no eligible providers)`);
      }
      if (validation.constraintViolations?.length) {
        details.push(`${validation.constraintViolations.length} constraint violations detected`);
      }

      if (hasViolations) {
        setValidationResults({
          status: 'error',
          message: 'Schedule has critical violations',
          details,
          validation
        });
      } else if (hasWarnings) {
        setValidationResults({
          status: 'warning',
          message: `Schedule generated with warnings`,
          details,
          validation
        });
      } else {
        setValidationResults({
          status: 'success',
          message: 'Schedule generated successfully!',
          details,
          validation
        });
      }

      setGeneratedResult(result);
      onScheduleGenerated(result);
      
      toast({
        title: "Schedule Generated",
        description: `Successfully generated schedule with ${result.schedule?.length || 0} assignments.`
      });
    } catch (error) {
      console.error('Scheduling error:', error);
      setValidationResults({
        status: 'error',
        message: 'Failed to generate schedule',
        details: [error instanceof Error ? error.message : 'Unknown error']
      });
      
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!generatedResult || !scheduleData) {
      toast({
        title: "Export Error",
        description: "Schedule not generated yet.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Extract month and year from scheduleData
      const monthName = scheduleData.month || 'January';
      const year = scheduleData.year || new Date().getFullYear();
      const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
      
      // Get provider data
      const providers = scheduleData.providers || [];
      const providerNames = providers.map((p: any) => p.name);

      if (!providerNames.length) {
        throw new Error("No providers found in schedule data");
      }

      // 1. Generate a fresh blank template workbook for SAME month/year
      const wb = generateScheduleTemplate(
        monthIndex,
        year,
        providerNames,
        1, // startingPP
        0  // startingBlockIndex
      );

      // 2. Export filled schedule into that workbook
      const filledWb = exportFinalScheduleToExcel(
        generatedResult.schedule,  // JSON schedule returned by edge function
        wb,
        providers
      );

      // 3. Convert workbook to downloadable file
      const wbout = XLSX.write(filledWb, { bookType: "xlsx", type: "array" });

      const filename = `FinalSchedule-${monthName}-${year}.xlsx`;

      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Schedule exported as ${filename}`,
      });
    } catch (err) {
      console.error('Export failed:', err);
      toast({
        title: "Export Failed",
        description: err instanceof Error ? err.message : "Failed to export schedule. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-accent" />
            AI Scheduling Engine
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Automatically fill blank shifts following all provider rules and constraints
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/30">
            <div>
              <p className="text-xs text-muted-foreground">Total Days</p>
              <p className="text-2xl font-bold text-foreground">{scheduleData?.days?.length || 31}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Providers</p>
              <p className="text-2xl font-bold text-foreground">
                {scheduleData?.providers ? Object.keys(scheduleData.providers).length : 15}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Shift Types</p>
              <p className="text-2xl font-bold text-foreground">9</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Constraints</p>
              <p className="text-2xl font-bold text-foreground">24+</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button 
              onClick={handleGenerate}
              disabled={isProcessing}
              className="flex-1"
              size="lg"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Generating Schedule...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-5 w-5" />
                  Generate Complete Schedule
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={handleExport}
              disabled={!generatedResult || isProcessing}
              className="px-4 py-2 rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download Final Schedule (Excel)
            </button>
          </div>

          {validationResults && (
            <div className="space-y-3">
              <Alert variant={validationResults.status === 'error' ? 'destructive' : 'default'}>
                {validationResults.status === 'success' && (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
                {validationResults.status === 'warning' && (
                  <AlertTriangle className="h-4 w-4 text-warning" />
                )}
                <AlertTitle>{validationResults.message}</AlertTitle>
                {validationResults.details && (
                  <AlertDescription>
                    <ul className="mt-2 space-y-1">
                      {validationResults.details.map((detail, idx) => (
                        <li key={idx} className="text-xs flex items-center gap-1">
                          {validationResults.status === 'success' ? (
                            <CheckCircle2 className="h-3 w-3 text-success" />
                          ) : (
                            <AlertTriangle className="h-3 w-3" />
                          )}
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                )}
              </Alert>

              {/* Detailed Validation Report */}
              {validationResults.validation && (
                <div className="border rounded-lg p-4 bg-muted/20 space-y-3">
                  <h3 className="font-semibold text-sm">Validation Details</h3>
                  
                  {validationResults.validation.lockedCellViolations && 
                   validationResults.validation.lockedCellViolations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-destructive">
                        🚫 Locked Cell Violations ({validationResults.validation.lockedCellViolations.length})
                      </p>
                      <div className="pl-3 space-y-0.5 max-h-32 overflow-y-auto">
                        {validationResults.validation.lockedCellViolations.slice(0, 10).map((v, i) => (
                          <p key={i} className="text-xs text-muted-foreground font-mono">{v}</p>
                        ))}
                        {validationResults.validation.lockedCellViolations.length > 10 && (
                          <p className="text-xs text-muted-foreground italic">
                            ...and {validationResults.validation.lockedCellViolations.length - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {validationResults.validation.constraintViolations && 
                   validationResults.validation.constraintViolations.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-warning">
                        ⚠️ Constraint Violations ({validationResults.validation.constraintViolations.length})
                      </p>
                      <div className="pl-3 space-y-0.5 max-h-32 overflow-y-auto">
                        {validationResults.validation.constraintViolations.slice(0, 10).map((v, i) => (
                          <p key={i} className="text-xs text-muted-foreground font-mono">{v}</p>
                        ))}
                        {validationResults.validation.constraintViolations.length > 10 && (
                          <p className="text-xs text-muted-foreground italic">
                            ...and {validationResults.validation.constraintViolations.length - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {validationResults.validation.unfilledShifts && 
                   validationResults.validation.unfilledShifts.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        ℹ️ Unfilled Shifts ({validationResults.validation.unfilledShifts.length})
                      </p>
                      <div className="pl-3 space-y-0.5 max-h-32 overflow-y-auto">
                        {validationResults.validation.unfilledShifts.slice(0, 10).map((v, i) => (
                          <p key={i} className="text-xs text-muted-foreground font-mono">{v}</p>
                        ))}
                        {validationResults.validation.unfilledShifts.length > 10 && (
                          <p className="text-xs text-muted-foreground italic">
                            ...and {validationResults.validation.unfilledShifts.length - 10} more
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {validationResults.validation.lockedCellsPreserved !== undefined && (
                    <p className="text-xs text-success font-medium">
                      ✓ {validationResults.validation.lockedCellsPreserved} locked cells preserved correctly
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
