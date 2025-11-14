import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, TrendingUp, Calendar, Moon } from 'lucide-react';

interface ProviderTotals {
  worked: number;
  weekends: number;
  nights?: number;
  call?: number;
  admin?: number;
  target?: number;
  weekend_quota?: number;
  weekendQuota?: number;
  night_quota?: number;
}

interface ProviderStatsProps {
  providerTotals: { [key: string]: ProviderTotals };
}

export const ProviderStats = ({ providerTotals }: ProviderStatsProps) => {
  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Provider Summary
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Complete breakdown of assignments for each provider
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Object.entries(providerTotals).map(([provider, stats]) => {
            const targetProgress = stats.target 
              ? (stats.worked / stats.target) * 100 
              : 100;
            const quota = stats.weekend_quota ?? stats.weekendQuota ?? 0;
            const weekendProgress = quota
              ? (stats.weekends / quota) * 100
              : 100;
            const nightQuota = stats.night_quota ?? 0;
            const nightProgress = nightQuota
              ? ((stats.nights ?? 0) / nightQuota) * 100
              : 100;

            return (
              <Card key={provider} className="p-4 bg-muted/30">
                <div className="space-y-3">
                  <h3 className="font-semibold text-foreground text-lg">{provider}</h3>
                  
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 rounded-lg bg-background">
                      <div className="text-2xl font-bold text-primary">{stats.worked}</div>
                      <div className="text-xs text-muted-foreground">Shifts</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <div className="text-2xl font-bold text-primary">{stats.nights ?? 0}</div>
                      <div className="text-xs text-muted-foreground">Nights</div>
                    </div>
                    <div className="text-center p-2 rounded-lg bg-background">
                      <div className="text-2xl font-bold text-primary">{stats.weekends}</div>
                      <div className="text-xs text-muted-foreground">Weekends</div>
                    </div>
                  </div>

                  {stats.target && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Shift target</span>
                        <span className="font-medium">
                          {stats.worked} / {stats.target}
                        </span>
                      </div>
                      <Progress value={targetProgress} className="h-2" />
                    </div>
                  )}

                  {quota > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Weekend quota</span>
                        <span className="font-medium">
                          {stats.weekends} / {quota}
                        </span>
                      </div>
                      <Progress value={weekendProgress} className="h-2" />
                    </div>
                  )}

                  {nightQuota > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Night quota</span>
                        <span className="font-medium">
                          {stats.nights ?? 0} / {nightQuota}
                        </span>
                      </div>
                      <Progress value={nightProgress} className="h-2" />
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
