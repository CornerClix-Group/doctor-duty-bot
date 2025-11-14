import ExcelJS from 'exceljs';

const PP_COLORS = [
  'FFF2A8', // Yellow
  'B7D4F8', // Blue
  'D9B4F7', // Purple
];

const SAT_COLOR = 'EEEEEE'; // light gray
const SUN_COLOR = 'DDDDDD'; // darker gray

function computePP(dayIndex: number, startingPP: number): number {
  return ((startingPP - 1 + dayIndex) % 14) + 1;
}

function toARGB(rgb: string): string {
  return rgb.length === 8 ? rgb : `FF${rgb}`;
}

interface DaySchedule {
  date: string;
  pattern: number;
  pay_period?: number;
  assignments: {
    shift: string;
    provider: string;
  }[];
}

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

export async function exportScheduleToExcel(
  schedule: DaySchedule[],
  month: string,
  year: number,
  providerTotals: { [key: string]: ProviderTotals },
  coveragePattern?: { [date: string]: number }
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');

  // Parse month name
  const monthIndex = new Date(`${month} 1, ${year}`).getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // Determine starting PP from first day if available
  const firstDay = schedule.find(d => d.pay_period !== undefined);
  const startingPP = firstDay?.pay_period || 1;

  // Build provider list from totals - handle null/undefined
  if (!providerTotals || Object.keys(providerTotals).length === 0) {
    throw new Error('No provider totals available for export');
  }
  
  const providerNames = Object.keys(providerTotals);

  // Build headers and rows
  const row1: any[] = [`${month} ${year}`, 'Weekend', 'Night'];
  const blockColors: string[] = [];
  let blockIdx = 0;
  
  for (let d = 1; d <= daysInMonth; d++) {
    const pp = computePP(d - 1, startingPP);
    if (pp === 1 && d !== 1) blockIdx = (blockIdx + 1) % PP_COLORS.length;
    row1.push(`PP${pp}`);
    blockColors.push(PP_COLORS[blockIdx]);
  }
  row1.push('Total');
  ws.addRow(row1);

  // Row 2: Coverage numbers
  const row2: any[] = ['Coverage #', '', ''];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = new Date(year, monthIndex, d).toISOString().split('T')[0];
    const coverage = (coveragePattern && coveragePattern[dateStr]) || 8;
    row2.push(coverage);
  }
  row2.push('');
  ws.addRow(row2);

  // Row 3: Day abbreviations
  const dayAbbr = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const row3: any[] = ['Day', '', ''];
  const weekendFlags: ('sun' | 'sat' | '')[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay();
    row3.push(dayAbbr[dow]);
    weekendFlags.push(dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');
  }
  row3.push('');
  ws.addRow(row3);

  // Row 4: Dates
  const row4: any[] = ['Date', '', ''];
  for (let d = 1; d <= daysInMonth; d++) row4.push(d);
  row4.push('');
  ws.addRow(row4);

  // Build schedule map: date -> provider -> shift
  const scheduleMap: { [date: string]: { [provider: string]: string } } = {};
  if (schedule && Array.isArray(schedule)) {
    schedule.forEach(day => {
      if (!day || !day.date) return;
      const dateKey = day.date.split('T')[0];
      scheduleMap[dateKey] = {};
      if (day.assignments && Array.isArray(day.assignments)) {
        day.assignments.forEach(assignment => {
          if (assignment && assignment.provider && assignment.shift) {
            scheduleMap[dateKey][assignment.provider] = assignment.shift;
          }
        });
      }
    });
  }

  // Provider rows
  providerNames.forEach((name) => {
    const stats = providerTotals[name];
    if (!stats) return; // Skip if no stats for this provider
    
    const weekendQuota = stats.weekend_quota ?? stats.weekendQuota ?? 0;
    const nightQuota = stats.night_quota ?? 0;
    
    const row: any[] = [name, weekendQuota, nightQuota];
    
    // Fill in daily assignments
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = new Date(year, monthIndex, d).toISOString().split('T')[0];
      const date = new Date(year, monthIndex, d);
      const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday
      let shift = (scheduleMap[dateStr] && scheduleMap[dateStr][name]) || '';
      
      // Convert FT AM/FT PM to FT W on weekends
      if ((dayOfWeek === 0 || dayOfWeek === 6) && (shift === 'FT AM' || shift === 'FT PM')) {
        shift = 'FT W';
      }
      
      row.push(shift);
    }
    
    // Total shifts worked
    row.push(stats.worked || 0);
    ws.addRow(row);
  });

  // Set column widths
  ws.getColumn(1).width = 20; // Provider name
  ws.getColumn(2).width = 10; // Weekend quota
  ws.getColumn(3).width = 10; // Night quota
  for (let c = 4; c <= 3 + daysInMonth; c++) {
    ws.getColumn(c).width = 6; // Day columns
  }
  ws.getColumn(4 + daysInMonth).width = 10; // Total column

  // Apply PP block colors (Row 1)
  for (let c = 0; c < daysInMonth; c++) {
    const color = toARGB(blockColors[c]);
    const cell = ws.getCell(1, c + 4);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Format header cells
  const headerCells = [
    ws.getCell(1, 1), // Month/Year
    ws.getCell(1, 2), // Weekend
    ws.getCell(1, 3), // Night
    ws.getCell(1, 4 + daysInMonth), // Total
  ];
  
  headerCells.forEach(cell => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Weekend shading
  const lastRow = 4 + providerNames.length;
  for (let d = 0; d < daysInMonth; d++) {
    const flag = weekendFlags[d];
    if (!flag) continue;
    const bg = toARGB(flag === 'sun' ? SUN_COLOR : SAT_COLOR);
    const col = d + 4;
    for (let r = 2; r <= lastRow; r++) {
      const cell = ws.getCell(r, col);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bg },
      };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}
