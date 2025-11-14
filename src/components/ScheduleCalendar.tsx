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

const getShiftColor = (shift: string, pattern: number = 7): string => {
  if (pattern === 7) {
    const colors: { [key: string]: string } = {
      'D1': 'bg-sky-500 text-white',
      'D2': 'bg-blue-600 text-white',
      'MID1': 'bg-amber-500 text-white',
      'MIDA': 'bg-amber-500 text-white',
      'MID2': 'bg-orange-600 text-white',
      'MIDB': 'bg-orange-600 text-white',
      'E': 'bg-violet-600 text-white',
      'N': 'bg-slate-700 text-white',
      'FT W': 'bg-lime-600 text-white',
      'FT W12': 'bg-green-700 text-white',
    };
    return colors[shift] || 'bg-muted text-muted-foreground';
  } else {
    const colors: { [key: string]: string } = {
      'D1': 'bg-cyan-500 text-white',
      'D2': 'bg-indigo-600 text-white',
      'MID1': 'bg-yellow-500 text-white',
      'MIDA': 'bg-yellow-500 text-white',
      'MID2': 'bg-red-600 text-white',
      'MIDB': 'bg-red-600 text-white',
      'E': 'bg-purple-600 text-white',
      'N': 'bg-gray-700 text-white',
      'FT AM': 'bg-emerald-600 text-white',
      'FT PM': 'bg-teal-600 text-white',
    };
    return colors[shift] || 'bg-muted text-muted-foreground';
  }
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
      'FT W12': '12p-10p',
      'C': '6a-10p',
      'A10': 'Admin',
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
      'C': '6a-10p',
      'A10': 'Admin',
    };
    return times[shift] || '';
  }
};

const getShiftStartHour = (shift: string, pattern: number): number => {
  if (shift === 'A10') return 999; // A10 always at bottom
  if (shift === 'C') return 6;
  
  if (pattern === 7) {
    const starts: { [key: string]: number } = {
      'D1': 6,
      'D2': 8,
      'FT W': 10,
      'MIDA': 11,
      'MID1': 11,
      'FT W12': 12,
      'MIDB': 14,
      'MID2': 14,
      'E': 16,
      'N': 21,
    };
    return starts[shift] ?? 0;
  } else {
    const starts: { [key: string]: number } = {
      'D1': 6,
      'FT AM': 7,
      'D2': 8,
      'MIDA': 11,
      'MID1': 11,
      'FT PM': 14,
      'MIDB': 15,
      'MID2': 15,
      'E': 17,
      'N': 22,
    };
    return starts[shift] ?? 0;
  }
};

export const ScheduleCalendar = ({ schedule, month }: ScheduleCalendarProps) => {
  if (!schedule || schedule.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground text-center">No schedule data to display</p>
      </Card>
    );
  }

  // Create a map of date to schedule for quick lookup
  const scheduleMap = new Map(
    schedule.map(day => [day.date, day])
  );

  // Parse month and year from the month prop (e.g., "January 2026")
  const [monthName, yearStr] = month.split(' ');
  const year = parseInt(yearStr) || new Date().getFullYear();
  const monthNum = ['January', 'February', 'March', 'April', 'May', 'June', 
                    'July', 'August', 'September', 'October', 'November', 'December']
                    .indexOf(monthName);
  
  // Calculate the calendar grid for the specified month/year
  const startOfMonth = new Date(year, monthNum, 1);
  const endOfMonth = new Date(year, monthNum + 1, 0);
  
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
            const isCurrentMonth = date.getMonth() === monthNum;
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
                    {daySchedule.assignments
                      .sort((a, b) => {
                        // Define shift order: D1, D2, MIDA, MIDB, E, then N, then FT, then admin
                        const shiftOrder: { [key: string]: number } = {
                          'D1': 0,
                          'D2': 1,
                          'MIDA': 2,
                          'MID1': 2,
                          'MIDB': 3,
                          'MID2': 3,
                          'E': 4,
                          'N': 5,
                          'FT AM': 6,
                          'FT PM': 7,
                          'FT W': 8,
                          'FT W12': 9,
                          'C': 10,
                          'CALL': 11,
                          'ADMIN': 12,
                          'A10': 12
                        };
                        const orderA = shiftOrder[a.shift] ?? 99;
                        const orderB = shiftOrder[b.shift] ?? 99;
                        return orderA - orderB;
                      })
                      .map((assignment, aIdx) => (
                      <div
                        key={aIdx}
                        className="text-xs p-1 rounded"
                      >
                        <Badge className={`${getShiftColor(assignment.shift, daySchedule.pattern)} text-xs font-mono w-full justify-center mb-1`}>
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
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
              {[
                { code: 'D1', time: '6a-4p' },
                { code: 'D2', time: '8a-6p' },
                { code: 'MID1', time: '11a-9p' },
                { code: 'MID2', time: '2p-12a' },
                { code: 'E', time: '4p-2a' },
                { code: 'N', time: '9p-7a' },
                { code: 'FT W', time: '10a-8p' },
                { code: 'FT W12', time: '12p-10p', note: '(Sun)' },
              ].map(shift => (
                <div key={shift.code} className="text-center">
                  <Badge className={`${getShiftColor(shift.code, 7)} justify-center w-full mb-1`}>
                    {shift.code}
                  </Badge>
                  <div className="text-xs text-muted-foreground">
                    {shift.time} {shift.note && <span className="text-[10px]">{shift.note}</span>}
                  </div>
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
                  <Badge className={`${getShiftColor(shift.code, 8)} justify-center w-full mb-1`}>
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