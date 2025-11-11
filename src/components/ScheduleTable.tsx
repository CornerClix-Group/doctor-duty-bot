import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Users } from 'lucide-react';

interface ShiftAssignment {
  shift: string;
  provider: string;
}

interface DaySchedule {
  date: string;
  pattern: number;
  assignments: ShiftAssignment[];
}

interface ScheduleTableProps {
  schedule: DaySchedule[];
  month: string;
}

const getShiftColor = (shift: string): string => {
  const colors: { [key: string]: string } = {
    'D1': 'bg-shift-d1 text-white',
    'D2': 'bg-shift-d2 text-white',
    'MIDA': 'bg-shift-mida text-white',
    'MIDB': 'bg-shift-midb text-white',
    'E': 'bg-shift-e text-white',
    'N': 'bg-shift-n text-white',
    'FT AM': 'bg-shift-ft text-white',
    'FT PM': 'bg-shift-ft text-white',
    'FT W': 'bg-shift-ft text-white',
  };
  return colors[shift] || 'bg-muted text-muted-foreground';
};

const getShiftTime = (shift: string): string => {
  const times: { [key: string]: string } = {
    'D1': '6a-4p',
    'D2': '8a-6p',
    'MIDA': '11a-9p',
    'MIDB': '3p-1a',
    'E': '5p-3a',
    'N': '10p-8a',
    'FT AM': '7a-5p',
    'FT PM': '2p-12a',
    'FT W': '10a-8p',
  };
  return times[shift] || '';
};

export const ScheduleTable = ({ schedule, month }: ScheduleTableProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-8 w-8 text-primary" />
            {month} Schedule
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {schedule.length} days scheduled
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-sm">
            <Clock className="h-3 w-3 mr-1" />
            10-hour shifts
          </Badge>
          <Badge variant="outline" className="text-sm">
            <Users className="h-3 w-3 mr-1" />
            {new Set(schedule.flatMap(d => d.assignments.map(a => a.provider))).size} providers
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {schedule.map((day, idx) => (
          <Card key={idx} className="p-4 hover:shadow-lg transition-shadow">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">
                    {new Date(day.date).toLocaleDateString('en-US', { 
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Pattern {day.pattern}
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {day.assignments.length} shifts
                </Badge>
              </div>

              <div className="space-y-2">
                {day.assignments.map((assignment, aIdx) => (
                  <div 
                    key={aIdx}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <Badge className={`${getShiftColor(assignment.shift)} font-mono text-xs`}>
                        {assignment.shift}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">
                        {getShiftTime(assignment.shift)}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {assignment.provider}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
