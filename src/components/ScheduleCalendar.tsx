import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Users } from 'lucide-react';

interface ShiftAssignment {
  shift: string;
  provider: string;
}

interface DaySchedule {
  date: string;
  pattern: number;
  assignments: ShiftAssignment[];
}

interface ScheduleCalendarProps {
  schedule: DaySchedule[];
  month: string;
}

const getShiftColor = (shift: string): string => {
  const colors: { [key: string]: string } = {
    'D1': 'bg-blue-500 text-white',
    'D2': 'bg-cyan-500 text-white',
    'MID1': 'bg-amber-500 text-white',
    'MIDA': 'bg-amber-500 text-white',
    'MID2': 'bg-orange-500 text-white',
    'MIDB': 'bg-orange-500 text-white',
    'E': 'bg-purple-500 text-white',
    'N': 'bg-indigo-600 text-white',
    'FT AM': 'bg-emerald-500 text-white',
    'FT PM': 'bg-teal-500 text-white',
    'FT W': 'bg-green-500 text-white',
  };
  return colors[shift] || 'bg-muted text-muted-foreground';
};

const getShiftTime = (shift: string, pattern: number): string => {
  if (pattern === 7) {
    const times: { [key: string]: string } = {
      'D1': '6a-4p',
      'D2': '8a-6p',
      'MID1': '11a-9p',
      'MIDA': '11a-9p',
      'MID2': '2p-12a',
      'MIDB': '2p-12a',
      'E': '4p-2a',
      'N': '9p-7a',
      'FT W': '10a-8p',
    };
    return times[shift] || '';
  } else {
    const times: { [key: string]: string } = {
      'D1': '6a-3p',
      'D2': '8a-5p',
      'MID1': '11a-8p',
      'MIDA': '11a-8p',
      'MID2': '3p-12a',
      'MIDB': '3p-12a',
      'E': '5p-2a',
      'N': '10p-7a',
      'FT AM': '7a-4p',
      'FT PM': '2p-11p',
    };
    return times[shift] || '';
  }
};

export const ScheduleCalendar = ({ schedule, month }: ScheduleCalendarProps) => {
  // Create a map of date to schedule for quick lookup
  const scheduleMap = new Map(
    schedule.map(day => [day.date, day])
  );

  // Get the first and last dates
  const firstDate = new Date(schedule[0].date);
  const lastDate = new Date(schedule[schedule.length - 1].date);
  
  // Calculate the calendar grid
  const startOfMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
  const endOfMonth = new Date(lastDate.getFullYear(), lastDate.getMonth() + 1, 0);
  
  // Find the first Sunday before or on the start of month
  const calendarStart = new Date(startOfMonth);
  calendarStart.setDate(calendarStart.getDate() - calendarStart.getDay());
  
  // Find the last Saturday after or on the end of month
  const calendarEnd = new Date(endOfMonth);
  calendarEnd.setDate(calendarEnd.getDate() + (6 - calendarEnd.getDay()));
  
  // Generate all dates in the calendar grid
  const calendarDates: Date[] = [];
  const currentDate = new Date(calendarStart);
  while (currentDate <= calendarEnd) {
    calendarDates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-8 w-8 text-primary" />
            {month} Schedule
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Calendar view with {schedule.length} days scheduled
          </p>
        </div>
        <Badge variant="outline" className="text-sm">
          <Users className="h-3 w-3 mr-1" />
          {new Set(schedule.flatMap(d => d.assignments.map(a => a.provider))).size} providers
        </Badge>
      </div>

      <Card className="p-6 shadow-lg">
        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Week day headers */}
          {weekDays.map(day => (
            <div key={day} className="text-center font-semibold text-sm text-muted-foreground py-2">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {calendarDates.map((date, idx) => {
            const dateStr = date.toISOString().split('T')[0];
            const daySchedule = scheduleMap.get(dateStr);
            const isCurrentMonth = date.getMonth() === firstDate.getMonth();
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            
            return (
              <div
                key={idx}
                className={`min-h-32 border rounded-lg p-2 ${
                  isCurrentMonth ? 'bg-card' : 'bg-muted/30'
                } ${isWeekend ? 'border-primary/20' : 'border-border'} hover:shadow-md transition-shadow`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${
                    isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'
                  } ${isWeekend ? 'text-primary' : ''}`}>
                    {date.getDate()}
                  </span>
                  {daySchedule && (
                    <span className="text-xs text-muted-foreground">
                      P{daySchedule.pattern}
                    </span>
                  )}
                </div>
                
                {daySchedule && (
                  <div className="space-y-1">
                    {daySchedule.assignments.map((assignment, aIdx) => (
                      <div
                        key={aIdx}
                        className="text-xs p-1 rounded"
                      >
                        <Badge className={`${getShiftColor(assignment.shift)} text-xs font-mono w-full justify-center mb-1`}>
                          {assignment.shift}
                        </Badge>
                        <div className="text-[10px] text-muted-foreground text-center">
                          {getShiftTime(assignment.shift, daySchedule.pattern)}
                        </div>
                        <div className="text-xs text-foreground font-medium truncate text-center">
                          {assignment.provider}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Legend */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Shift Legend</h3>
        <div className="space-y-4">
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Pattern 7 (10-hour shifts)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {[
                { code: 'D1', time: '6a-4p' },
                { code: 'D2', time: '8a-6p' },
                { code: 'MID1', time: '11a-9p' },
                { code: 'MID2', time: '2p-12a' },
                { code: 'E', time: '4p-2a' },
                { code: 'N', time: '9p-7a' },
                { code: 'FT W', time: '10a-8p' },
              ].map(shift => (
                <div key={shift.code} className="text-center">
                  <Badge className={`${getShiftColor(shift.code)} justify-center w-full mb-1`}>
                    {shift.code}
                  </Badge>
                  <div className="text-xs text-muted-foreground">{shift.time}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-medium text-muted-foreground mb-2">Pattern 8 (9-hour shifts)</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
              {[
                { code: 'D1', time: '6a-3p' },
                { code: 'D2', time: '8a-5p' },
                { code: 'MID1', time: '11a-8p' },
                { code: 'MID2', time: '3p-12a' },
                { code: 'E', time: '5p-2a' },
                { code: 'N', time: '10p-7a' },
                { code: 'FT AM', time: '7a-4p' },
                { code: 'FT PM', time: '2p-11p' },
              ].map(shift => (
                <div key={shift.code} className="text-center">
                  <Badge className={`${getShiftColor(shift.code)} justify-center w-full mb-1`}>
                    {shift.code}
                  </Badge>
                  <div className="text-xs text-muted-foreground">{shift.time}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};