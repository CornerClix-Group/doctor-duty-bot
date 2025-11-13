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
  const row1: any[] = [`${monthName} ${year}`, ''];
  const blockColors: string[] = [];
  let blockIdx = startingBlockIndex;
  for (let d = 1; d <= daysInMonth; d++) {
    const pp = computePP(d - 1, startingPP);
    if (pp === 1 && d !== 1) blockIdx = (blockIdx + 1) % PP_COLORS.length;
    row1.push(`PP${pp}`);
    blockColors.push(PP_COLORS[blockIdx]);
  }
  row1.push('');
  ws.addRow(row1);

  const row2: any[] = ['Pattern', ''];
  for (let d = 1; d <= daysInMonth; d++) row2.push(7);
  row2.push('');
  ws.addRow(row2);

  const dayAbbr = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const row3: any[] = ['Day', ''];
  const weekendFlags: ('sun' | 'sat' | '')[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay();
    row3.push(dayAbbr[dow]);
    weekendFlags.push(dow === 0 ? 'sun' : dow === 6 ? 'sat' : '');
  }
  row3.push('');
  ws.addRow(row3);

  const row4: any[] = ['Date', ''];
  for (let d = 1; d <= daysInMonth; d++) row4.push(d);
  row4.push('');
  ws.addRow(row4);

  providerNames.forEach((name) => {
    const row: any[] = [name, 0];
    for (let d = 1; d <= daysInMonth; d++) row.push('');
    row.push(0);
    ws.addRow(row);
  });

  // Apply PP block colors (Row 1, columns C .. C+days-1)
  for (let c = 3; c < 3 + daysInMonth; c++) {
    const color = toARGB(blockColors[c - 3]);
    const cell = ws.getCell(1, c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: color },
    };
  }

  // Weekend shading (Rows 2..last, columns C ..)
  const firstDataRow = 2;
  const lastRow = 4 + providerNames.length;
  for (let c = 3; c < 3 + daysInMonth; c++) {
    const flag = weekendFlags[c - 3];
    if (!flag) continue;
    const bg = toARGB(flag === 'sun' ? SUN_COLOR : SAT_COLOR);
    for (let r = firstDataRow; r <= lastRow; r++) {
      const cell = ws.getCell(r, c);
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
