import * as XLSX from "xlsx";

/**
 * Export a completed schedule into a true Excel grid.
 *
 * @param schedule    The final schedule JSON { providerName: { date: shift } }
 * @param templateWb  The workbook created using generateScheduleTemplate()
 * @param providers   Provider rows from parser (to preserve weekend_quota + target_shifts)
 */
export function exportFinalScheduleToExcel(
  schedule: Record<string, Record<string, string>>,
  templateWb: XLSX.WorkBook,
  providers: Array<{ name: string }>
): XLSX.WorkBook {
  const ws = templateWb.Sheets["Schedule"];
  if (!ws) throw new Error("Template 'Schedule' sheet missing.");

  // Determine providers row start — template rows:
  // Row 1 = Month
  // Row 2 = Pattern
  // Row 3 = Day
  // Row 4 = Date
  const PROVIDER_START_ROW = 5; // 1-indexed in Excel, 0-indexed as r=4

  // Assemble date → column mapping from template Row 4
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  const dateColumnMap: Record<string, number> = {};
  const dateRowIndex = 3; // Row 4 (0-based index)

  for (let col = 1; col <= range.e.c; col++) {
    const cell = ws[XLSX.utils.encode_cell({ r: dateRowIndex, c: col })];
    if (!cell?.v) continue;

    const day = cell.v;
    const monthCell = ws["A1"];
    if (!monthCell?.v) continue;
    
    const parts = String(monthCell.v).split(" ");
    const monthName = parts[0];
    const year = parseInt(parts[1]);

    const monthIndex = new Date(`${monthName} 1, ${year}`).getMonth();
    const iso = new Date(year, monthIndex, day).toISOString().slice(0, 10);

    dateColumnMap[iso] = col;
  }

  // Build provider name → row number map
  const providerRowMap: Record<string, number> = {};

  providers.forEach((prov, idx) => {
    providerRowMap[prov.name] = PROVIDER_START_ROW + idx; 
    // PROVIDER_START_ROW is already 1-indexed (row 5)
  });

  // Now write schedule shifts into the Excel sheet
  Object.keys(schedule).forEach((providerName) => {
    const rowNum = providerRowMap[providerName];
    if (!rowNum) return; // provider not in template

    const assignments = schedule[providerName];

    Object.entries(assignments).forEach(([date, shift]) => {
      const col = dateColumnMap[date];
      if (col === undefined) return; // out of template month range

      const cellRef = XLSX.utils.encode_cell({ r: rowNum - 1, c: col });
      ws[cellRef] = { t: "s", v: shift };
    });
  });

  // Recompute sheet range
  ws["!ref"] = XLSX.utils.encode_range(range);

  return templateWb;
}
