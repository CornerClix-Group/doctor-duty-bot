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
  // Ensure 8-char ARGB with full alpha
  return rgb.length === 8 ? rgb : `FF${rgb}`;
}

export async function generateScheduleTemplateBuffer(
  monthIndex: number,
  year: number,
  providerNames: string[],
  startingPP: number,
  startingBlockIndex: number
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');

  const monthName = new Date(year, monthIndex, 1).toLocaleString('default', {
    month: 'long',
  });

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  // Build headers and rows
  const row1: any[] = [`${monthName} ${year}`, 'Weekend', 'Night'];
  const blockColors: string[] = [];
  let blockIdx = startingBlockIndex;
  for (let d = 1; d <= daysInMonth; d++) {
    const pp = computePP(d - 1, startingPP);
    if (pp === 1 && d !== 1) blockIdx = (blockIdx + 1) % PP_COLORS.length;
    row1.push(`PP${pp}`);
    blockColors.push(PP_COLORS[blockIdx]);
  }
  row1.push('Total');
  ws.addRow(row1);

  // Row 2: Coverage # (DEFAULT values - fully editable by user)
  const row2: any[] = ['Coverage #', '', ''];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay(); // 0=Sun, 6=Sat
    // DEFAULT values: Sundays & Saturdays → 7, Weekdays → 8
    const defaultCoverage = (dow === 0 || dow === 6) ? 7 : 8;
    row2.push(defaultCoverage);
  }
  row2.push('');
  ws.addRow(row2);

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

  const row4: any[] = ['Date', '', ''];
  for (let d = 1; d <= daysInMonth; d++) row4.push(d);
  row4.push('');
  ws.addRow(row4);

  providerNames.forEach((name) => {
    const row: any[] = [name, 0, 0]; // name, weekend_quota, night_quota
    for (let d = 1; d <= daysInMonth; d++) row.push('');
    row.push(0); // total
    ws.addRow(row);
  });

  // Set column widths
  ws.getColumn(1).width = 20; // Provider name column
  ws.getColumn(2).width = 10; // Weekend quota column
  ws.getColumn(3).width = 10; // Night quota column
  for (let c = 4; c <= 3 + daysInMonth; c++) {
    ws.getColumn(c).width = 6; // Day columns
  }
  ws.getColumn(4 + daysInMonth).width = 10; // Total column

  // Apply PP block colors (Row 1, columns D onwards)
  for (let c = 0; c < daysInMonth; c++) {
    const color = toARGB(blockColors[c]);
    const cell = ws.getCell(1, c + 4); // Column D is index 4
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Format header cells for columns A, B, C, and Total
  const headerCells = [
    ws.getCell(1, 1), // Column A - Month/Year
    ws.getCell(1, 2), // Column B - Weekend
    ws.getCell(1, 3), // Column C - Night
    ws.getCell(1, 4 + daysInMonth), // Last column - Total
  ];
  
  headerCells.forEach(cell => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Weekend shading (Rows 2 onwards, all columns including weekend days)
  const lastRow = 4 + providerNames.length;
  for (let d = 0; d < daysInMonth; d++) {
    const flag = weekendFlags[d];
    if (!flag) continue;
    const bg = toARGB(flag === 'sun' ? SUN_COLOR : SAT_COLOR);
    const col = d + 4; // Column D is index 4
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
