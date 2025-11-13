import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, Download } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import * as XLSX from 'xlsx';
import { parseScheduleData } from '@/lib/scheduleParser';
import { generateScheduleTemplate } from '@/lib/scheduleTemplateGenerator';
import { supabase } from '@/integrations/supabase/client';

function getNextMonthAndYear() {
  const now = new Date();
  let monthIndex = now.getMonth() + 1; // next month
  let year = now.getFullYear();

  if (monthIndex > 11) {
    monthIndex = 0;
    year += 1;
  }

  return { monthIndex, year };
}

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
        .from('providers')
        .select('name')
        .eq('active', true)
        .order('name');

      const providerNames = providers?.map(p => p.name) ?? [];

      if (!providerNames.length) {
        setError('No providers found. Please add providers first.');
        return;
      }

      // Get next month and year
      const { monthIndex, year } = getNextMonthAndYear();

      // Generate workbook
      const wb = generateScheduleTemplate(monthIndex, year, providerNames);
      
      // Convert to array buffer
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      
      // Create Blob
      const blob = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      
      // Trigger browser download
      const monthName = new Date(year, monthIndex, 1).toLocaleString('default', {
        month: 'long',
      });
      const filename = `ScheduleTemplate-${monthName}-${year}.xlsx`;
      
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

  return (
    <div className="space-y-4">
      <div className="flex justify-end mb-4">
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Download Monthly Excel Template
        </button>
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
