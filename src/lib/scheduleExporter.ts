import * as XLSX from 'xlsx';
import { ScheduleData } from './scheduleParser';

interface ExportSchedule {
  month: string;
  schedule: Array<{
    date: string;
    pattern: number;
    assignments: Array<{ shift: string; provider: string }>;
  }>;
  provider_totals: {
    [provider: string]: {
      worked: number;
      weekends: number;
      target: number;
      weekendQuota: number;
    };
  };
}

const SHIFT_ORDER = ['D1', 'FT AM', 'D2', 'MIDA', 'FT PM', 'MIDB', 'E', 'N', 'FT W'];

export function exportScheduleToExcel(
  originalData: ScheduleData,
  generatedSchedule: ExportSchedule
) {
  const wb = XLSX.utils.book_new();
  const sheetData: any[][] = [];
  
  // Row 1: Month and Pay Period labels
  const row1 = [originalData.month];
  originalData.days.forEach(day => {
    row1.push(`PP${day.payPeriod}`);
  });
  row1.push('Target Total Shifts');
  sheetData[0] = row1;
  
  // Row 2: Pattern numbers
  const row2 = ['Pattern'];
  originalData.days.forEach(day => row2.push(String(day.pattern)));
  row2.push('');
  sheetData[1] = row2;
  
  // Row 3: Day of week
  const row3 = ['Day'];
  originalData.days.forEach(day => row3.push(day.dayOfWeek));
  row3.push('');
  sheetData[2] = row3;
  
  // Row 4: Dates
  const row4 = ['Date'];
  originalData.days.forEach(day => {
    const date = new Date(day.date + 'T00:00:00');
    row4.push(String(date.getDate()));
  });
  row4.push('');
  sheetData[3] = row4;
  
  // Build assignment map: date -> provider -> shift
  const assignmentMap = new Map<string, Map<string, string>>();
  generatedSchedule.schedule.forEach(daySchedule => {
    const dayMap = new Map<string, string>();
    daySchedule.assignments.forEach(assignment => {
      dayMap.set(assignment.provider, assignment.shift);
    });
    assignmentMap.set(daySchedule.date, dayMap);
  });
  
  // Row 5+: Provider rows (ONE ROW PER PROVIDER)
  const providerNames = Object.keys(originalData.providers);
  providerNames.forEach(providerName => {
    const provider = originalData.providers[providerName];
    const row = [
      providerName,
      provider.weekendQuota
    ];
    
    // Add daily assignments
    originalData.days.forEach(day => {
      // Check for locked cells first (highest priority)
      if (provider.lockedCells && provider.lockedCells[day.date]) {
        row.push(provider.lockedCells[day.date]);
        return;
      }
      
      // Check if provider was assigned a shift on this day
      const dayMap = assignmentMap.get(day.date);
      const assignedShift = dayMap?.get(providerName);
      
      if (assignedShift) {
        row.push(assignedShift);
      } else {
        row.push('');
      }
    });
    
    // Add target total shifts
    row.push(provider.targetShifts);
    
    sheetData.push(row);
  });
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Provider
    { wch: 12 }, // Weekend Quota
    ...Array(originalData.days.length).fill({ wch: 6 }), // Days
    { wch: 15 }  // Target Total Shifts
  ];
  
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
  const filename = `${originalData.month}_${originalData.year}_Generated.xlsx`;
  XLSX.writeFile(wb, filename);
}
