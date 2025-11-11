import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';

interface SchedulingEngineProps {
  scheduleData: any;
  onScheduleGenerated: (result: any) => void;
}

export const SchedulingEngine = ({ scheduleData, onScheduleGenerated }: SchedulingEngineProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [validationResults, setValidationResults] = useState<{
    status: 'success' | 'warning' | 'error';
    message: string;
    details?: string[];
  } | null>(null);

  const handleGenerate = async () => {
    setIsProcessing(true);
    setValidationResults(null);

    // Simulate AI processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Mock generated schedule
    const mockSchedule = {
      month: "January 2025",
      schedule: [
        {
          date: "2025-01-01",
          pattern: 7,
          assignments: [
            { shift: "D1", provider: "Lopez" },
            { shift: "D2", provider: "Beres" },
            { shift: "MIDA", provider: "Campo-Ford" },
            { shift: "MIDB", provider: "Arnett" },
            { shift: "E", provider: "Venugopal" },
            { shift: "N", provider: "Coffin" },
            { shift: "FT W", provider: "Ryals" }
          ]
        },
        {
          date: "2025-01-02",
          pattern: 8,
          assignments: [
            { shift: "D1", provider: "Arnett" },
            { shift: "D2", provider: "Illston" },
            { shift: "MIDA", provider: "Sellars-Pompey" },
            { shift: "MIDB", provider: "Beach" },
            { shift: "E", provider: "Cary" },
            { shift: "N", provider: "Coffin" },
            { shift: "FT AM", provider: "Lopez" },
            { shift: "FT PM", provider: "Campo-Ford" }
          ]
        }
      ],
      provider_totals: {
        "Lopez": { worked: 35, weekends: 4, target: 36, weekendQuota: 4 },
        "Coffin": { worked: 12, weekends: 2, target: 12, weekendQuota: 2 },
        "Beres": { worked: 30, weekends: 3, target: 32, weekendQuota: 3 },
        "Arnett": { worked: 28, weekends: 3, target: 30, weekendQuota: 3 },
        "Venugopal": { worked: 18, weekends: 2, target: 18, weekendQuota: 2 },
        "Cary": { worked: 25, weekends: 3, target: 26, weekendQuota: 3 }
      }
    };

    setValidationResults({
      status: 'success',
      message: 'Schedule generated successfully!',
      details: [
        'All shifts filled',
        'Rest requirements satisfied',
        'Weekend distribution balanced',
        'Provider constraints respected'
      ]
    });

    onScheduleGenerated(mockSchedule);
    setIsProcessing(false);
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
              <p className="text-2xl font-bold text-foreground">31</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Providers</p>
              <p className="text-2xl font-bold text-foreground">15</p>
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

          <Button 
            onClick={handleGenerate}
            disabled={isProcessing}
            className="w-full"
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
