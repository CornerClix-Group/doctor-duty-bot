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
  // Create a new workbook
  const wb = XLSX.utils.book_new();
  
  // Calculate dimensions
  const numDays = originalData.days.length;
  const providerNames = Object.keys(originalData.providers);
  const numRows = 5 + (providerNames.length * SHIFT_ORDER.length);
  
  // Create empty sheet data
  const sheetData: any[][] = [];
  
  // Row 1: Title
  sheetData[0] = [`${originalData.month} ${originalData.year} Schedule`];
  
  // Row 2: Pattern numbers (starting from column C)
  sheetData[1] = ['', '', ...originalData.days.map(day => day.pattern)];
  
  // Row 3: Day of week (starting from column C)
  sheetData[2] = ['', '', ...originalData.days.map(day => day.dayOfWeek)];
  
  // Row 4: Dates (starting from column C)
  sheetData[3] = ['Provider', 'Shift', ...originalData.days.map(day => {
    const date = new Date(day.date);
    return date.getDate();
  })];
  
  // Build assignment map for quick lookup
  const assignmentMap = new Map<string, Map<string, string>>();
  generatedSchedule.schedule.forEach(daySchedule => {
    const dayMap = new Map<string, string>();
    daySchedule.assignments.forEach(assignment => {
      dayMap.set(assignment.shift, assignment.provider);
    });
    assignmentMap.set(daySchedule.date, dayMap);
  });
  
  // Rows 5+: Provider shifts
  let currentRow = 4;
  providerNames.forEach((providerName, providerIndex) => {
    SHIFT_ORDER.forEach((shiftType, shiftIndex) => {
      const row: any[] = [];
      
      // Column A: Provider name (only on first shift row)
      row[0] = shiftIndex === 0 ? providerName : '';
      
      // Column B: Shift name
      row[1] = shiftType;
      
      // Columns C+: Assignments for each day
      originalData.days.forEach(day => {
        const dayMap = assignmentMap.get(day.date);
        const assignedProvider = dayMap?.get(shiftType);
        
        // Check if this cell was blocked in original data
        const originalShift = day.shifts[shiftType];
        if (originalShift && ['X', 'L', 'HL'].includes(originalShift)) {
          row.push(originalShift);
        } else if (originalShift && originalShift !== '' && !['X', 'L', 'HL'].includes(originalShift)) {
          // Pre-assigned shift from original
          row.push(originalShift);
        } else if (assignedProvider === providerName) {
          // This provider was assigned this shift
          row.push(providerName);
        } else {
          row.push('');
        }
      });
      
      sheetData[currentRow] = row;
      currentRow++;
    });
  });
  
  // Add summary section
  currentRow += 2;
  sheetData[currentRow] = ['Provider', 'Worked', 'Target', 'Weekends', 'Weekend Quota'];
  currentRow++;
  
  Object.entries(generatedSchedule.provider_totals).forEach(([provider, totals]) => {
    sheetData[currentRow] = [
      provider,
      totals.worked,
      totals.target,
      totals.weekends,
      totals.weekendQuota
    ];
    currentRow++;
  });
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 15 }, // Provider
    { wch: 10 }, // Shift
    ...Array(numDays).fill({ wch: 8 }) // Days
  ];
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
  
  // Generate filename
  const filename = `${originalData.month}_${originalData.year}_Generated_Schedule.xlsx`;
  
  // Write file
  XLSX.writeFile(wb, filename);
}
