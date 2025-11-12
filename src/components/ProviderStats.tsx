import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, TrendingUp, Calendar } from 'lucide-react';

interface ProviderTotals {
  worked: number;
  weekends: number;
  call?: number;
  admin?: number;
  target?: number;
  weekend_quota?: number;
  weekendQuota?: number;
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
            <Users className="h-6 w-6 text-secondary" />
            Provider Statistics
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Shift counts and weekend distribution
          </p>
        </div>

        <div className="space-y-4">
          {Object.entries(providerTotals).map(([provider, stats]) => {
            const targetProgress = stats.target 
              ? (stats.worked / stats.target) * 100 
              : 100;
            const quota = stats.weekend_quota ?? stats.weekendQuota ?? 0;
            const weekendProgress = quota
              ? (stats.weekends / quota) * 100
              : 100;

            return (
              <div key={provider} className="space-y-3 p-4 rounded-lg bg-muted/30">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{provider}</h3>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      {stats.worked} shifts
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      <Calendar className="h-3 w-3 mr-1" />
                      {stats.weekends} weekends
                    </Badge>
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
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};
