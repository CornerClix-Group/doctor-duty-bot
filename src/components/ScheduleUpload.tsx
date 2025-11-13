import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import * as XLSX from 'xlsx';
import { parseScheduleData } from '@/lib/scheduleParser';
import { generateScheduleTemplate } from '@/lib/scheduleTemplateGenerator';
import { supabase } from '@/integrations/supabase/client';

interface ScheduleUploadProps {
  onScheduleLoad: (data: any) => void;
}

export const ScheduleUpload = ({ onScheduleLoad }: ScheduleUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

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
      // Fetch provider names from database
      const { data: providers } = await supabase
        .from('provider_profiles')
        .select('first_name, last_name')
        .order('last_name');

      const providerNames = providers?.map(p => 
        `${p.first_name} ${p.last_name}`.trim()
      ) || ['Provider 1', 'Provider 2', 'Provider 3'];

      // Generate template for next month
      const today = new Date();
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      const monthIndex = nextMonth.getMonth();
      const year = nextMonth.getFullYear();

      const wb = generateScheduleTemplate(monthIndex, year, providerNames);
      
      const monthName = nextMonth.toLocaleString('default', { month: 'long' });
      const filename = `ShiftPro_Schedule_${monthName}_${year}.xlsx`;
      
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error('Failed to generate template:', err);
      setError('Failed to generate template. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <Button 
          variant="outline" 
          onClick={handleDownloadTemplate}
          type="button"
        >
          <Download className="mr-2 h-4 w-4" />
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
