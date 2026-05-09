import { useCallback, useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import { parseSchedule } from '@/lib/scheduleParser';
import { generateScheduleTemplate } from '@/lib/scheduleTemplateGenerator';
import { extractLastPPFromExcel, extractLastPPBlockIndex } from '@/lib/extractPPFromExcel';
import { generateScheduleTemplateBuffer } from '@/lib/scheduleTemplateGeneratorExcel';
import { supabase } from '@/integrations/supabase/client';
import { getNextMonthAndYear } from '@/lib/dateUtils';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface ScheduleUploadProps {
  onScheduleLoad: (data: any, base64File?: string) => void;
  selectedMonth?: number;
  selectedYear?: number;
}

function buildLoadSummary(scheduleData: {
  month: string;
  year: number;
  providers?: { days?: { assigned?: string | null; constraint?: unknown }[] }[];
}) {
  const nProviders = scheduleData.providers?.length ?? 0;
  const days = scheduleData.providers?.[0]?.days?.length ?? 0;
  let preAssigned = 0;
  let constraints = 0;
  for (const p of scheduleData.providers ?? []) {
    for (const d of p.days ?? []) {
      if (d.assigned != null) preAssigned++;
      if (d.constraint != null) constraints++;
    }
  }
  return {
    month: scheduleData.month,
    year: scheduleData.year,
    nProviders,
    days,
    preAssigned,
    constraints,
  };
}

export const ScheduleUpload = ({ onScheduleLoad, selectedMonth: propMonth, selectedYear: propYear }: ScheduleUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [loadSummary, setLoadSummary] = useState<ReturnType<typeof buildLoadSummary> | null>(null);
  const [uploadedWorkbook, setUploadedWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  
  // Use props if provided, otherwise default to next calendar month
  const next = getNextMonthAndYear();
  const defaultMonthIdx = MONTH_NAMES.indexOf(next.month);
  const defaultMonthNumber = defaultMonthIdx >= 0 ? defaultMonthIdx + 1 : 1;
  const selectedMonth = propMonth ?? defaultMonthNumber;
  const selectedYear = propYear ?? next.year;

  useEffect(() => {
    async function loadProviders() {
      setLoadingProviders(true);
      try {
        // Try provider_profiles first (only active providers with role='provider')
        const { data: profiles, error: profilesError } = await (supabase
          .from("provider_profiles") as any)
          .select("id, first_name, last_name")
          .eq("active", true)
          .eq("role", "provider")
          .order('last_name');

        if (profilesError) {
          console.error("Error loading provider_profiles:", profilesError);
        }

        let list: any[] = profiles || [];

        // Fallback to providers table if profiles are empty
        if (!list.length) {
          const { data: providersTable, error: providersError } = await supabase
            .from('providers')
            .select('id, name, active')
            .eq('active', true)
            .order('name');

          if (providersError) {
            console.error('Error loading providers:', providersError);
          }

          if (providersTable && providersTable.length) {
            list = providersTable.map((p: any) => {
              const [first, ...rest] = (p.name || '').split(' ');
              return { id: p.id, first_name: first || '', last_name: rest.join(' ') };
            });
          }
        }

        setProviders(list);
        if (!list.length) {
          setError('No providers found. Please add providers first.');
        } else {
          setError(null);
        }
      } catch (e) {
        console.error('Unexpected error loading providers:', e);
        setError('Failed to load providers. Please refresh the page.');
      } finally {
        setLoadingProviders(false);
      }
    }

    loadProviders();
  }, []);

  const handleFile = useCallback((file: File) => {
    setError(null);
    setUploadedFileName(null);
    setLoadSummary(null);
    
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result as ArrayBuffer;
        console.log('File read successfully, size:', bstr.byteLength);
        
        const workbook = XLSX.read(bstr, { type: 'array', cellStyles: true });
        console.log('Workbook created, sheets:', workbook.SheetNames);
        
        // Store workbook for PP extraction
        setUploadedWorkbook(workbook);
        
        // Parse the schedule data using new parser
        const scheduleData = parseSchedule(workbook);
        console.log('Schedule data parsed successfully');
        
        // Convert to base64 for edge function
        const base64 = btoa(
          new Uint8Array(bstr).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        onScheduleLoad(scheduleData, base64);
        setUploadedFileName(file.name);
        setLoadSummary(buildLoadSummary(scheduleData));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setError(`Failed to parse Excel file: ${errorMessage}`);
        console.error('Parse error:', err);
      }
    };
    
    reader.readAsArrayBuffer(file);
  }, [onScheduleLoad]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDownloadTemplate = async () => {
    try {
      const monthIndex = selectedMonth - 1; // Convert 1-12 to 0-11
      const year = selectedYear;

      // Determine starting PP from uploaded workbook (OPTION C)
      let startingPP = 1;
      let startingBlockIndex = 0;

      if (uploadedWorkbook) {
        // Continuation from previous schedule
        const lastPP = extractLastPPFromExcel(uploadedWorkbook);
        const lastBlockIndex = extractLastPPBlockIndex(uploadedWorkbook);

        if (lastPP !== null) {
          startingPP = lastPP === 14 ? 1 : lastPP + 1;
        } else {
          // default if unreadable
          startingPP = 1;
        }

        startingBlockIndex = (lastBlockIndex + (lastPP === 14 ? 1 : 0)) % 3;
      } else {
        // Special case: January 2026 MUST start with PP5
        if (year === 2026 && selectedMonth === 1) {
          startingPP = 5;
          startingBlockIndex = 0; // Yellow (matches example)
        }
      }

      // Sort providers by last_name, then first_name
      const sortedProviders = [...providers].sort((a, b) => {
        const last = a.last_name.localeCompare(b.last_name);
        if (last !== 0) return last;
        return a.first_name.localeCompare(b.first_name);
      });

      // Provide full name for the template (keeps scheduler compatibility)
      const providerNames = sortedProviders.map(
        (p) => `${p.first_name} ${p.last_name}`.trim()
      );

      if (!providerNames.length) {
        setError('No providers found. Please add providers first.');
        return;
      }

      // Use ExcelJS to generate styled template buffer
      const buffer = await generateScheduleTemplateBuffer(
        monthIndex,
        year,
        providerNames,
        startingPP,
        startingBlockIndex
      );

      const monthName = new Date(year, monthIndex, 1).toLocaleString('default', {
        month: 'long',
      });
      const filename = `ScheduleTemplate-${monthName}-${year}.xlsx`;

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to generate template:', err);
      setError('Failed to generate template. Please try again.');
    }
  };

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear + i);

  // Show month/year selector only when used standalone (not as a prop-controlled component)
  const showMonthYearSelector = propMonth === undefined && propYear === undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <Card className="flex flex-col justify-center p-8 min-h-[280px] border-2 border-border">
          <div className="flex flex-col items-center justify-center gap-4 text-center flex-1">
            {showMonthYearSelector && (
              <p className="text-sm font-medium text-muted-foreground">
                Template for: {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
              </p>
            )}
            {!showMonthYearSelector && (
              <p className="text-sm font-medium text-muted-foreground">
                Get a blank template for this period
              </p>
            )}
            <FileSpreadsheet className="h-12 w-12 text-primary" />
            <Button
              onClick={handleDownloadTemplate}
              variant="default"
              size="lg"
              disabled={loadingProviders || providers.length === 0}
              className="w-full sm:w-auto"
            >
              Download Template
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-2 min-h-[280px]">
          <p className="text-sm text-muted-foreground">
            First time? Download a template above first.
          </p>
          <Card
            className={`relative flex-1 p-12 border-2 border-dashed transition-all ${
              isDragging
                ? 'border-primary bg-primary/5 shadow-lg'
                : 'border-border hover:border-primary/50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className="flex flex-col items-center justify-center space-y-4 text-center h-full">
              <div className="rounded-full bg-primary/10 p-6">
                {isDragging ? (
                  <Upload className="h-12 w-12 text-primary animate-bounce" />
                ) : (
                  <FileSpreadsheet className="h-12 w-12 text-primary" />
                )}
              </div>

              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-foreground">
                  Drop your filled template here
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Drag and drop your Excel schedule file here, or click to browse
                </p>
              </div>

              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
              />
              <Button
                variant="default"
                size="lg"
                onClick={() => document.getElementById('file-upload')?.click()}
                type="button"
              >
                <Upload className="mr-2 h-5 w-5" />
                Choose File
              </Button>

              <p className="text-xs text-muted-foreground">
                Supports .xlsx and .xls formats
              </p>
            </div>
          </Card>
        </div>
      </div>

      {uploadedFileName && loadSummary && (
        <Alert className="bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-400">
          <FileSpreadsheet className="h-4 w-4" />
          <AlertDescription>
            Loaded {loadSummary.month} {loadSummary.year}: {loadSummary.nProviders} providers,{' '}
            {loadSummary.days} days, {loadSummary.preAssigned} pre-assigned shifts,{' '}
            {loadSummary.constraints} constraint cells. Ready to generate.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
