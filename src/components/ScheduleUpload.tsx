import { useCallback, useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import { parseScheduleData } from '@/lib/scheduleParser';
import { generateScheduleTemplate } from '@/lib/scheduleTemplateGenerator';
import { extractLastPPFromExcel } from '@/lib/extractPPFromExcel';
import { supabase } from '@/integrations/supabase/client';

function getNextMonthAndYear() {
  const now = new Date();
  let month = now.getMonth() + 1; // 1-12 for UI
  let year = now.getFullYear();

  if (month > 12) {
    month = 1;
    year += 1;
  }

  return { month, year };
}

interface ScheduleUploadProps {
  onScheduleLoad: (data: any) => void;
  selectedMonth?: number;
  selectedYear?: number;
}

export const ScheduleUpload = ({ onScheduleLoad, selectedMonth: propMonth, selectedYear: propYear }: ScheduleUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedWorkbook, setUploadedWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  
  // Use props if provided, otherwise default to next month
  const { month: nextMonth, year: nextYear } = getNextMonthAndYear();
  const selectedMonth = propMonth ?? nextMonth;
  const selectedYear = propYear ?? nextYear;

  useEffect(() => {
    async function loadProviders() {
      setLoadingProviders(true);
      try {
        // Try provider_profiles first
        const { data: profiles, error: profilesError } = await supabase
          .from("provider_profiles")
          .select("id, first_name, last_name")
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
    
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      setError('Please upload an Excel file (.xlsx or .xls)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result as ArrayBuffer;
        const wb = XLSX.read(bstr, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        
        // Store workbook for PP extraction
        setUploadedWorkbook(wb);
        
        // Parse the schedule data
        const parsedData = parseScheduleData(ws);
        onScheduleLoad(parsedData);
        setUploadedFileName(file.name);
      } catch (err) {
        setError('Failed to parse Excel file. Please check the format.');
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

      if (uploadedWorkbook) {
        const lastPP = extractLastPPFromExcel(uploadedWorkbook);
        if (lastPP !== null) {
          startingPP = lastPP === 14 ? 1 : lastPP + 1;
        }
      } else {
        // SPECIAL CASE: January 2026 must start at PP5
        if (selectedMonth === 1 && selectedYear === 2026) {
          startingPP = 5;
        }
      }

      const providerNames = providers.map((p) =>
        (p as any).name ? (p as any).name : `${p.first_name} ${p.last_name}`.trim()
      );

      if (!providerNames.length) {
        setError('No providers found. Please add providers first.');
        return;
      }

      const wb = generateScheduleTemplate(monthIndex, year, providerNames, startingPP);

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      const monthName = new Date(year, monthIndex, 1).toLocaleString('default', {
        month: 'long',
      });
      const filename = `ScheduleTemplate-${monthName}-${year}.xlsx`;

      const blob = new Blob([wbout], {
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

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear + i);

  // Show month/year selector only when used standalone (not as a prop-controlled component)
  const showMonthYearSelector = propMonth === undefined && propYear === undefined;

  return (
    <div className="space-y-4">
      {showMonthYearSelector && (
        <div className="flex items-center gap-4 mb-4">
          <div className="text-sm font-medium text-muted-foreground">
            Template for: {months[selectedMonth - 1]} {selectedYear}
          </div>
        <Button onClick={handleDownloadTemplate} variant="default" disabled={loadingProviders || providers.length === 0}>
          Download Template
        </Button>
        </div>
      )}

      {!showMonthYearSelector && (
        <div className="flex justify-end mb-4">
          <Button onClick={handleDownloadTemplate} variant="default">
            Download Template
          </Button>
        </div>
      )}
      
      <Card
        className={`relative p-12 border-2 border-dashed transition-all ${
          isDragging 
            ? 'border-primary bg-primary/5 shadow-lg' 
            : 'border-border hover:border-primary/50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="rounded-full bg-primary/10 p-6">
            {isDragging ? (
              <Upload className="h-12 w-12 text-primary animate-bounce" />
            ) : (
              <FileSpreadsheet className="h-12 w-12 text-primary" />
            )}
          </div>
          
          <div className="space-y-2">
            <h3 className="text-xl font-semibold text-foreground">
              Upload Schedule Template
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

      {uploadedFileName && (
        <Alert className="bg-green-500/10 border-green-500/20 text-green-700">
          <FileSpreadsheet className="h-4 w-4" />
          <AlertDescription>
            Successfully uploaded: <strong>{uploadedFileName}</strong>
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
