import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Calendar, Users, ArrowRight, FileCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ScheduleValidationProps {
  scheduleData: any; // New parser structure: { month, year, coverage_pattern, providers }
  onConfirm: () => void;
  onCancel: () => void;
}

export const ScheduleValidation = ({ scheduleData, onConfirm, onCancel }: ScheduleValidationProps) => {
  // New parser structure: { month, year, coverage_pattern, providers }
  const providerList = scheduleData.providers || [];
  const totalDays = Object.keys(scheduleData.coverage_pattern || {}).length;
  
  // Count locked shifts and providers
  const totalLockedShifts = providerList.reduce((sum: number, provider: any) => {
    return sum + (provider.days || []).filter((d: any) => d.locked).length;
  }, 0);
  
  const totalBlankShifts = totalDays * 7 - totalLockedShifts; // Rough estimate
  
  const hasIssues = providerList.length === 0 || totalDays === 0;

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
                {totalDays === 0 && <p>No schedule days detected.</p>}
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
              <p className="text-xl font-bold text-foreground">{totalDays}</p>
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
            <h3 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Schedule Preview
            </h3>
            <div className="space-y-2">
              {scheduleData.providers.slice(0, 5).map((provider: any, idx: number) => {
                const lockedCount = (provider.days || []).filter((d: any) => d.locked).length;
                return (
                  <Card key={idx} className="p-3 bg-card/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-foreground">{provider.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Target: {provider.target_shifts} shifts | Weekend: {provider.weekend_quota}
                        </p>
                      </div>
                      <div className="flex gap-2 items-center">
                        <Badge variant="outline" className="text-xs">
                          {lockedCount} locked
                        </Badge>
                      </div>
                    </div>
                  </Card>
                );
              })}
              {scheduleData.providers.length > 5 && (
                <p className="text-xs text-muted-foreground text-center pt-2">
                  + {scheduleData.providers.length - 5} more providers
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
                  <li>✓ {totalLockedShifts} shifts already assigned/locked</li>
                  <li>✓ {totalBlankShifts} shifts need to be filled (approximate)</li>
                  <li>✓ {providerList.length} providers loaded</li>
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
