import * as XLSX from "xlsx";

/**
 * Export a completed schedule into the Excel template.
 *
 * @param schedule    Final schedule JSON { providerName: { dateISO: shift } }
 * @param templateWb  Workbook created by generateScheduleTemplate()
 * @param providers   Providers from parser (Excel provider rows)
 */
export function exportFinalScheduleToExcel(
  schedule: Record<string, Record<string, string>>,
  templateWb: XLSX.WorkBook,
  providers: any[]
): XLSX.WorkBook {
  const ws = templateWb.Sheets["Schedule"];
  if (!ws) throw new Error("Template 'Schedule' sheet missing.");

  // Template layout:
  // A = provider name
  // B = weekend quota
  // C.. = daily columns (start index = 2)
  const FIRST_DAY_COLUMN = 2; // Column C (0-indexed: A=0, B=1, C=2)

  // Locate total range
  const range = XLSX.utils.decode_range(ws["!ref"]);

  // ========= 1. Build mapping: dateISO → column =========
  //
  // Dates are in Row 4 (0-based row index = 3)
  //
  const DATE_ROW = 3;
  const dateColumnMap: Record<string, number> = {};

  const monthCell = ws["A1"]?.v;
  const [monthName, yearString] = monthCell.split(" ");
  const year = parseInt(yearString);
  const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();

  for (let col = FIRST_DAY_COLUMN; col <= range.e.c; col++) {
    const cell = ws[XLSX.utils.encode_cell({ r: DATE_ROW, c: col })];
    if (!cell?.v) continue;

    const day = Number(cell.v);
    const iso = new Date(year, monthIndex, day)
      .toISOString()
      .slice(0, 10);

    dateColumnMap[iso] = col;
  }

  // ========= 2. Build provider name → row mapping =========
  //
  // Provider rows start at row 5 → Excel row index = 4
  //
  const PROVIDER_START_ROW = 4; // Row 5 (0-indexed r=4)
  const providerRowMap: Record<string, number> = {};

  providers.forEach((prov, idx) => {
    providerRowMap[prov.name] = PROVIDER_START_ROW + idx;
  });

  // ========= 3. Fill in assigned shifts =========
  Object.entries(schedule).forEach(([providerName, dayMap]) => {
    const row = providerRowMap[providerName];
    if (row === undefined) return;

    Object.entries(dayMap).forEach(([date, shift]) => {
      const col = dateColumnMap[date];
      if (!col) return; // date not in month

      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      ws[cellRef] = { t: "s", v: shift };
    });
  });

  return templateWb;
}
