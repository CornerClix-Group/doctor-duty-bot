import { useState } from 'react';
import { Activity } from 'lucide-react';
import { ScheduleUpload } from '@/components/ScheduleUpload';
import { SchedulingEngine } from '@/components/SchedulingEngine';
import { ScheduleTable } from '@/components/ScheduleTable';
import { ProviderStats } from '@/components/ProviderStats';

const Index = () => {
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [generatedSchedule, setGeneratedSchedule] = useState<any>(null);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-primary to-secondary p-3 shadow-lg">
              <Activity className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                MedScheduler AI
              </h1>
              <p className="text-sm text-muted-foreground">
                Intelligent Physician Scheduling Engine
              </p>
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

          {/* Processing Section */}
          {scheduleData && !generatedSchedule && (
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

export default Index;
