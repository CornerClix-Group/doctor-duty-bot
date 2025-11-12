import * as XLSX from 'xlsx';

export const generateScheduleTemplate = (month: string = 'January 2025', daysInMonth: number = 31) => {
  const data: any[][] = [];
  
  // Row 1: Month
  data.push([month, ...Array(daysInMonth).fill('')]);
  
  // Row 2: Pattern (7 or 8) - default to 7, user will fill in 8 where needed
  data.push(['Pattern', ...Array(daysInMonth).fill(7)]);
  
  // Row 3: Day of Week - calculated from first day of month
  const dayOfWeekRow = ['Day'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Start with blank placeholders - user needs to adjust based on actual month
  for (let i = 0; i < daysInMonth; i++) {
    dayOfWeekRow.push(''); // User will fill this in based on their calendar
  }
  data.push(dayOfWeekRow);
  
  // Row 4: Date numbers (1, 2, 3, ... 31)
  data.push(['Date', ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]);
  
  // Rows 5+: Provider template rows
  // Add 10 example provider rows
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
      14,            // Column C: Target Shifts (example: 14)
      ...Array(daysInMonth).fill('') // Daily columns - leave blank for scheduling
    ];
    data.push(providerRow);
  });
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Set column widths
  const colWidths = [
    { wch: 15 }, // Provider Name
    { wch: 12 }, // Weekend Quota
    { wch: 12 }, // Target Shifts
    ...Array(daysInMonth).fill({ wch: 6 }) // Daily columns
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
