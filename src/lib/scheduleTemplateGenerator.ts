import * as XLSX from 'xlsx';

export const generateScheduleTemplate = (month: string = 'January 2026', daysInMonth: number = 31) => {
  const data: any[][] = [];
  
  // Row 1: Month and Pay Period labels
  const row1 = [month];
  for (let i = 0; i < daysInMonth; i++) {
    const ppNum = Math.floor(i / 14) + 1; // 14 days per PP
    row1.push(`PP${ppNum}`);
  }
  row1.push('Target Total Shifts');
  data.push(row1);
  
  // Row 2: Pattern (7 or 8) - default to 7
  const row2 = ['Pattern', ...Array(daysInMonth).fill(7), ''];
  data.push(row2);
  
  // Row 3: Day of Week
  const row3 = ['Day', ...Array(daysInMonth).fill(''), ''];
  data.push(row3);
  
  // Row 4: Date numbers (1, 2, 3, ... 31)
  const row4 = ['Date', ...Array.from({ length: daysInMonth }, (_, i) => i + 1), ''];
  data.push(row4);
  
  // Rows 5+: Provider template rows
  const exampleProviders = [
    'Provider 1',
    'Provider 2', 
    'Provider 3',
    'Provider 4',
    'Provider 5',
    'Provider 6',
    'Provider 7',
    'Provider 8',
    'Provider 9',
    'Provider 10'
  ];
  
  exampleProviders.forEach(providerName => {
    const providerRow = [
      providerName,  // Column A: Provider Name
      4,             // Column B: Weekend Quota (example: 4)
      ...Array(daysInMonth).fill(''), // Columns C-AG: Daily assignments
      14             // Column AI: Target Total Shifts (example: 14)
    ];
    data.push(providerRow);
  });
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Set column widths
  const colWidths = [
    { wch: 15 }, // Provider Name
    { wch: 12 }, // Weekend Quota
    ...Array(daysInMonth).fill({ wch: 6 }), // Daily columns
    { wch: 15 }  // Target Total Shifts
  ];
  ws['!cols'] = colWidths;
  
  // Create workbook and add worksheet
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Schedule');
  
  // Generate filename
  const filename = `ShiftPro_Schedule_Template_${month.replace(' ', '_')}.xlsx`;
  
  // Download file
  XLSX.writeFile(wb, filename);
};
