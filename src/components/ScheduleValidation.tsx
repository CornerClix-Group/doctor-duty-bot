import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Calendar, Users, ArrowRight, FileCheck } from 'lucide-react';
import { ScheduleData } from '@/lib/scheduleParser';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ScheduleValidationProps {
  scheduleData: ScheduleData;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ScheduleValidation = ({ scheduleData, onConfirm, onCancel }: ScheduleValidationProps) => {
  const totalBlankShifts = scheduleData.days.reduce((total, day) => {
    const pattern = day.pattern === 8 ? 8 : 7;
    const filledShifts = Object.values(day.shifts).filter(v => v && !['X', 'L', 'HL', ''].includes(v)).length;
    return total + (pattern - filledShifts);
  }, 0);

  const totalFilledShifts = scheduleData.days.reduce((total, day) => {
    return total + Object.values(day.shifts).filter(v => v && !['X', 'L', 'HL', ''].includes(v)).length;
  }, 0);
  
  const totalBlockedDays = Object.values(scheduleData.providerBlocked || {}).reduce((sum, blockedSet) => sum + blockedSet.size, 0);

  const providerList = Object.values(scheduleData.providers);
  const hasIssues = providerList.length === 0 || scheduleData.days.length === 0;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <FileCheck className="h-6 w-6 text-primary" />
              Data Validation
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Review the detected schedule data before generating assignments
            </p>
          </div>

          {hasIssues && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Validation Issues Detected</AlertTitle>
              <AlertDescription>
                {providerList.length === 0 && <p>No providers detected in the Excel file.</p>}
                {scheduleData.days.length === 0 && <p>No schedule days detected.</p>}
              </AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Schedule Period</p>
              </div>
              <p className="text-xl font-bold text-foreground">{scheduleData.month} {scheduleData.year}</p>
            </Card>

            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Total Days</p>
              </div>
              <p className="text-xl font-bold text-foreground">{scheduleData.days.length}</p>
            </Card>

            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-primary" />
                <p className="text-xs text-muted-foreground">Providers</p>
              </div>
              <p className="text-xl font-bold text-foreground">{providerList.length}</p>
            </Card>

            <Card className="p-4 bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <p className="text-xs text-muted-foreground">Blank Shifts</p>
              </div>
              <p className="text-xl font-bold text-foreground">{totalBlankShifts}</p>
            </Card>
          </div>

          {/* Providers List */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Detected Providers ({providerList.length})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {providerList.map(provider => {
                const blockedCount = scheduleData.providerBlocked?.[provider.name]?.size || 0;
                return (
                  <Card key={provider.name} className="p-3 bg-card/50">
                    <p className="font-medium text-foreground text-sm">{provider.name}</p>
                    <div className="flex gap-2 mt-2">
                      <Badge variant="outline" className="text-xs">
                        Target: {provider.targetShifts}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        WE: {provider.weekendQuota}
                      </Badge>
                      {blockedCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          🚫 {blockedCount}
                        </Badge>
                      )}
                    </div>
                    {provider.constraints.allowedShifts && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Only: {provider.constraints.allowedShifts.join(', ')}
                      </p>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Schedule Preview */}
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Schedule Preview (First 7 Days)
            </h3>
            <div className="space-y-2">
              {scheduleData.days.slice(0, 7).map((day, idx) => {
                const filledCount = Object.values(day.shifts).filter(v => v && !['X', 'L', 'HL', ''].includes(v)).length;
                const totalShifts = day.pattern === 8 ? 8 : 7;
                const blankCount = totalShifts - filledCount;

                return (
                  <Card key={idx} className="p-3 bg-card/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">
                          {new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { 
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </p>
                        <p className="text-xs text-muted-foreground">Pattern {day.pattern}</p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="text-xs">
                          <CheckCircle2 className="h-3 w-3 mr-1 text-success" />
                          {filledCount} filled
                        </Badge>
                        {blankCount > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {blankCount} blank
                          </Badge>
                        )}
                        {day.isWeekend && (
                          <Badge variant="default" className="text-xs">
                            Weekend
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
              {scheduleData.days.length > 7 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  + {scheduleData.days.length - 7} more days
                </p>
              )}
            </div>
          </div>

          {/* Summary Stats */}
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-foreground">Validation Summary</p>
                <ul className="text-sm text-muted-foreground space-y-1 mt-2">
                  <li>✓ {totalFilledShifts} shifts already assigned</li>
                  <li>✓ {totalBlockedDays} provider days blocked (X, L, etc.)</li>
                  <li>✓ {totalBlankShifts} shifts need to be filled</li>
                  <li>✓ {providerList.length} providers with constraints loaded</li>
                  <li>✓ Ready to generate complete schedule</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              onClick={onCancel}
              variant="outline"
              className="flex-1"
            >
              Upload Different File
            </Button>
            <Button 
              onClick={onConfirm}
              disabled={hasIssues}
              className="flex-1"
            >
              Continue to Generation
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};
