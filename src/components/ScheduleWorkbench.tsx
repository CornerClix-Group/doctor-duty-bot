import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Play, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ValidationPanel } from '@/components/ValidationPanel';

interface ScheduleWorkbenchProps {
  month: string;
  year: number;
  uploadedFileBase64: string | null;
  uploadedData: any;
  onScheduleGenerated: (s: any) => void;
  generatedSchedule: any;
}

const asMessageList = (arr: any): string[] =>
  Array.isArray(arr)
    ? arr.map((x) => (typeof x === 'string' ? x : x?.message ?? JSON.stringify(x)))
    : [];

export const ScheduleWorkbench = ({
  month,
  year,
  uploadedFileBase64,
  uploadedData,
  onScheduleGenerated,
  generatedSchedule,
}: ScheduleWorkbenchProps) => {
  const { toast } = useToast();
  const [validating, setValidating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [info, setInfo] = useState<string[]>([]);

  const invoke = async (mode: 'validateOnly' | 'schedule') => {
    const body: any = { mode };
    if (uploadedFileBase64) body.file = uploadedFileBase64;
    else if (uploadedData) body.scheduleData = uploadedData;
    else throw new Error('Upload a schedule file first.');
    const { data, error } = await supabase.functions.invoke('generate-schedule-v2', { body });
    if (error) throw error;
    return data;
  };

  const handleValidate = async () => {
    try {
      setValidating(true);
      const data = await invoke('validateOnly');
      setErrors(asMessageList(data?.errors));
      setWarnings(asMessageList(data?.warnings));
      setInfo(asMessageList(data?.info));
      toast({ title: 'Validation complete' });
    } catch (e: any) {
      toast({ title: 'Validation failed', description: e.message, variant: 'destructive' });
    } finally {
      setValidating(false);
    }
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const data = await invoke('schedule');
      setErrors(asMessageList(data?.errors));
      setWarnings(asMessageList(data?.warnings));
      setInfo(asMessageList(data?.info));
      onScheduleGenerated(data?.schedule ?? data);
      toast({ title: 'Schedule generated' });
    } catch (e: any) {
      toast({ title: 'Generation failed', description: e.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <h3 className="text-lg font-semibold">{month} {year}</h3>
          <p className="text-sm text-muted-foreground">
            {uploadedFileBase64 || uploadedData ? 'Input ready.' : 'Upload an input file first.'}
          </p>
        </div>
        <Button onClick={handleValidate} disabled={validating || (!uploadedFileBase64 && !uploadedData)} variant="outline">
          {validating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          Validate
        </Button>
        <Button onClick={handleGenerate} disabled={generating || (!uploadedFileBase64 && !uploadedData)}>
          {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
          Generate
        </Button>
      </Card>
      {(errors.length > 0 || warnings.length > 0) && (
        <ValidationPanel errors={errors} warnings={warnings} />
      )}
      {generatedSchedule && (
        <Card className="p-4 text-sm text-muted-foreground">
          Schedule generated. Switch to the Edit tab to review.
        </Card>
      )}
    </div>
  );
};