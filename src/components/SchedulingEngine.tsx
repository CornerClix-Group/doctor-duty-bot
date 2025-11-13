import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const handleGenerate = async () => {
    setIsProcessing(true);
    setValidationResults(null);

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
        throw error;
      }

      const result = data;
      console.log('Schedule generation result:', result);

      if (result.warnings && result.warnings.length > 0) {
        setValidationResults({
          status: 'warning',
          message: 'Schedule generated with warnings',
          details: result.warnings
        });
      } else {
        setValidationResults({
          status: 'success',
          message: 'Schedule generated successfully!'
        });
      }

      onScheduleGenerated(result);

      toast({
        title: "Success",
        description: "Schedule generated successfully!",
      });

    } catch (error: any) {
      console.error('Schedule generation error:', error);
      
      setValidationResults({
        status: 'error',
        message: error.message || 'Failed to generate schedule',
        details: error.details ? [error.details] : undefined
      });

      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate schedule",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">AI Schedule Generator</h3>
            <p className="text-sm text-muted-foreground">
              Generate optimized schedule using deterministic scheduling engine
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isProcessing || !scheduleData}
            size="lg"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate Schedule
              </>
            )}
          </Button>
        </div>

        {validationResults && (
          <Alert variant={validationResults.status === 'error' ? 'destructive' : 'default'}>
            {validationResults.status === 'success' && (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {validationResults.status === 'warning' && (
              <AlertTriangle className="h-4 w-4" />
            )}
            {validationResults.status === 'error' && (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertTitle>{validationResults.message}</AlertTitle>
            {validationResults.details && validationResults.details.length > 0 && (
              <AlertDescription>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  {validationResults.details.map((detail, idx) => (
                    <li key={idx} className="text-sm">{detail}</li>
                  ))}
                </ul>
              </AlertDescription>
            )}
          </Alert>
        )}
      </div>
    </Card>
  );
};
