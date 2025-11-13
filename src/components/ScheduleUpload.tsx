import { useCallback, useState, useEffect } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import { parseScheduleData } from '@/lib/scheduleParser';
import { generateScheduleTemplate } from '@/lib/scheduleTemplateGenerator';
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
}

export const ScheduleUpload = ({ onScheduleLoad }: ScheduleUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [providers, setProviders] = useState<any[]>([]);
  
  const { month: nextMonth, year: nextYear } = getNextMonthAndYear();
  const [selectedMonth, setSelectedMonth] = useState(nextMonth);
  const [selectedYear, setSelectedYear] = useState(nextYear);

  useEffect(() => {
    const fetchProviders = async () => {
      const { data } = await supabase
        .from('provider_profiles')
        .select('first_name, last_name')
        .order('last_name');
      
      if (data) setProviders(data);
    };
    
    fetchProviders();
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

      const providerNames =
        providers?.map((p) => `${p.first_name} ${p.last_name}`.trim()) ?? [];

      if (!providerNames.length) {
        setError('No providers found. Please add providers first.');
        return;
      }

      const wb = generateScheduleTemplate(monthIndex, year, providerNames);

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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 mb-4">
        <div className="flex items-center gap-2">
          <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {months.map((month, idx) => (
                <SelectItem key={idx + 1} value={(idx + 1).toString()}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleDownloadTemplate} variant="default">
          Download Template
        </Button>
      </div>
      
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
