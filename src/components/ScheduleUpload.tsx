import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import * as XLSX from 'xlsx';
import { parseScheduleData } from '@/lib/scheduleParser';

interface ScheduleUploadProps {
  onScheduleLoad: (data: any) => void;
}

export const ScheduleUpload = ({ onScheduleLoad }: ScheduleUploadProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    setError(null);
    
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

  return (
    <div className="space-y-4">
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
          <label htmlFor="file-upload">
            <Button variant="default" size="lg" asChild>
              <span className="cursor-pointer">
                <Upload className="mr-2 h-5 w-5" />
                Choose File
              </span>
            </Button>
          </label>

          <p className="text-xs text-muted-foreground">
            Supports .xlsx and .xls formats
          </p>
        </div>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
