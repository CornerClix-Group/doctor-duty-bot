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

/**
 * Extracts the PP Block color index of the LAST pay period block
 * from the uploaded Excel template.
 *
 * This inspects the color of the LAST PP cell in Row 1.
 * Returns 0,1,2 for block index, or 0 if unknown.
 *
 * Colors:
 * 0 = Yellow (FFF2A8)
 * 1 = Blue   (B7D4F8)
 * 2 = Purple (D9B4F7)
 */
export function extractLastPPBlockIndex(workbook: XLSX.WorkBook): number {
  try {
    const ws = workbook.Sheets["Schedule"];
    if (!ws) return 0;

    const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

    const HEADER_ROW = 0;
    const FIRST_DAY_COL = 2;

    let lastColor: string | null = null;

    // scan from last column backward
    for (let col = range.e.c - 1; col >= FIRST_DAY_COL; col--) {
      const cellRef = XLSX.utils.encode_cell({ r: HEADER_ROW, c: col });
      const cell = ws[cellRef];
      if (!cell || !cell.v) continue;

      const text = String(cell.v);
      if (!text.startsWith("PP")) continue;

      // check fill color
      if (cell.s && cell.s.fill && cell.s.fill.fgColor && cell.s.fill.fgColor.rgb) {
        lastColor = cell.s.fill.fgColor.rgb;
      }

      break;
    }

    if (!lastColor) return 0;

    const COLORS = ["FFF2A8", "B7D4F8", "D9B4F7"];
    const idx = COLORS.indexOf(lastColor.toUpperCase());
    return idx >= 0 ? idx : 0;
  } catch (error) {
    console.error("Error extracting PP block index from Excel:", error);
    return 0;
  }
}
