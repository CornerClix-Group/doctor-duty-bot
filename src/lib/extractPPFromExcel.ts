import * as XLSX from "xlsx";

/**
 * Extract the last PP number from Row 1 of an uploaded Excel workbook.
 * Returns null if no PP headers found or workbook is invalid.
 */
export function extractLastPPFromExcel(workbook: XLSX.WorkBook): number | null {
  try {
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return null;

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return null;

    // Row 1 contains PP headers starting from column C (index 2)
    // Read across the row to find the last PP value
    let lastPP: number | null = null;
    let col = 2; // Start at column C (0-indexed: A=0, B=1, C=2)

    while (true) {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = sheet[cellRef];

      if (!cell || !cell.v) break; // Stop when we hit an empty cell

      const cellValue = String(cell.v);
      const match = cellValue.match(/PP(\d+)/i);

      if (match) {
        lastPP = parseInt(match[1], 10);
      }

      col++;
    }

    return lastPP;
  } catch (error) {
    console.error("Error extracting PP from Excel:", error);
    return null;
  }
}
