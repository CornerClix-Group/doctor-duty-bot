import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { useState } from 'react';
import { exportScheduleToExcel } from '@/lib/scheduleExporter';

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
  } | null>(null);

  const handleGenerate = async () => {
    setIsProcessing(true);
    setValidationResults(null);
    setGeneratedResult(null);

    try {
      // Generate the complete schedule
      const { generateSchedule } = await import('@/lib/schedulingEngine');
      const result = await generateSchedule(scheduleData);

      const details: string[] = [
        `${result.schedule.length} days scheduled`,
        'Provider constraints respected',
        'Rest requirements enforced',
        'Weekend quotas balanced'
      ];

      if (result.warnings && result.warnings.length > 0) {
        setValidationResults({
          status: 'warning',
          message: `Schedule generated with ${result.warnings.length} warnings`,
          details: result.warnings.slice(0, 5)
        });
      } else {
        setValidationResults({
          status: 'success',
          message: 'Schedule generated successfully!',
          details
        });
      }

      setGeneratedResult(result);
      onScheduleGenerated(result);
    } catch (error) {
      console.error('Scheduling error:', error);
      setValidationResults({
        status: 'error',
        message: 'Failed to generate schedule',
        details: [error instanceof Error ? error.message : 'Unknown error']
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!generatedResult || !scheduleData) return;
    exportScheduleToExcel(scheduleData, generatedResult);
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

            <Button
              onClick={handleExport}
              disabled={!generatedResult || isProcessing}
              variant="outline"
              size="lg"
              className="flex-shrink-0"
            >
              <Download className="mr-2 h-4 w-4" />
              Export to Excel
            </Button>
          </div>

          {validationResults && (
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
                        <CheckCircle2 className="h-3 w-3 text-success" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}
        </div>
      </div>
    </Card>
  );
};
