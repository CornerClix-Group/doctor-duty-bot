import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Home, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScheduleUpload } from '@/components/ScheduleUpload';
import { ScheduleValidation } from '@/components/ScheduleValidation';
import { SchedulingEngine } from '@/components/SchedulingEngine';
import { ScheduleTable } from '@/components/ScheduleTable';
import { ProviderStats } from '@/components/ProviderStats';
import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { generateScheduleTemplate } from '@/lib/scheduleTemplateGenerator';
import { exportFinalScheduleToExcel } from '@/lib/scheduleExporter';

const Schedule = () => {
  const navigate = useNavigate();
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [validationConfirmed, setValidationConfirmed] = useState(false);
  const [generatedSchedule, setGeneratedSchedule] = useState<any>(null);
  const [providers, setProviders] = useState<any[]>([]);

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

  const handleBack = () => {
    if (generatedSchedule) {
      setGeneratedSchedule(null);
    } else if (validationConfirmed) {
      setValidationConfirmed(false);
    } else if (scheduleData) {
      setScheduleData(null);
    } else {
      navigate('/');
    }
  };

  const handleStartOver = () => {
    setScheduleData(null);
    setValidationConfirmed(false);
    setGeneratedSchedule(null);
  };

  const handleDownloadFinalSchedule = async () => {
    if (!generatedSchedule || !providers.length) {
      alert("No schedule generated yet or providers not loaded.");
      return;
    }

    try {
      // Parse month and year from schedule data
      const monthYearMatch = generatedSchedule.month?.match(/(\w+)\s+(\d{4})/);
      if (!monthYearMatch) {
        alert("Invalid schedule month format");
        return;
      }

      const monthName = monthYearMatch[1];
      const year = parseInt(monthYearMatch[2]);
      const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();

      const providerNames = providers.map(
        p => `${p.first_name} ${p.last_name}`.trim()
      );

      // 1. Create clean template
      const templateWb = generateScheduleTemplate(monthIndex, year, providerNames, 1, 0);

      // 2. Export filled schedule
      const filledWb = exportFinalScheduleToExcel(
        generatedSchedule.schedule,
        templateWb,
        providers.map(p => ({
          name: `${p.first_name} ${p.last_name}`.trim()
        }))
      );

      // 3. Convert + download
      const wbout = XLSX.write(filledWb, { bookType: "xlsx", type: "array" });

      const blob = new Blob([wbout], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `FinalSchedule-${monthName}-${year}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to download schedule:", error);
      alert("Failed to download schedule. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleBack}
                className="mr-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="rounded-xl bg-gradient-to-br from-primary to-secondary p-3 shadow-lg">
                <Activity className="h-8 w-8 text-white" />
              </div>
              <div>
              <h1 className="text-3xl font-bold text-foreground">
                EMSchedule Schedule
              </h1>
                <p className="text-sm text-muted-foreground">
                  {!scheduleData && 'Upload your schedule template'}
                  {scheduleData && !validationConfirmed && 'Review and validate data'}
                  {validationConfirmed && !generatedSchedule && 'Generate optimized schedule'}
                  {generatedSchedule && 'View and export results'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {scheduleData && (
                <Button variant="outline" onClick={handleStartOver}>
                  Start Over
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
                <Home className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <div className="space-y-8">
          {/* Upload Section */}
          {!scheduleData && (
            <div className="max-w-3xl mx-auto">
              <ScheduleUpload onScheduleLoad={setScheduleData} />
            </div>
          )}

          {/* Validation Section */}
          {scheduleData && !validationConfirmed && (
            <div className="max-w-4xl mx-auto">
              <ScheduleValidation 
                scheduleData={scheduleData}
                onConfirm={() => setValidationConfirmed(true)}
                onCancel={() => {
                  setScheduleData(null);
                  setValidationConfirmed(false);
                }}
              />
            </div>
          )}

          {/* Processing Section */}
          {scheduleData && validationConfirmed && !generatedSchedule && (
            <div className="max-w-3xl mx-auto">
              <SchedulingEngine 
                scheduleData={scheduleData}
                onScheduleGenerated={setGeneratedSchedule}
              />
            </div>
          )}

          {/* Results Section */}
          {generatedSchedule && (
            <div className="space-y-8">
              <div className="flex justify-end mb-4">
                <Button onClick={handleDownloadFinalSchedule} size="lg">
                  <Download className="mr-2 h-5 w-5" />
                  Download Final Schedule
                </Button>
              </div>

              <ScheduleTable 
                schedule={generatedSchedule.schedule}
                month={generatedSchedule.month}
              />
              
              <ProviderStats 
                providerTotals={generatedSchedule.provider_totals}
              />
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-border/40 bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Powered by advanced AI scheduling algorithms
            </p>
            <p className="text-xs text-muted-foreground">
              Ensuring optimal staff distribution while respecting all provider constraints
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Schedule;
