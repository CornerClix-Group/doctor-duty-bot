import * as XLSX from "xlsx";

/**
 * Compute PP number for a given day offset inside the month.
 * PP cycles 1→14 then wraps.
 *
 * Example:
 *   startingPP = 8
 *   first day = PP8
 *   second day = PP9
 *   ...
 *   PP14 -> PP1 -> PP2 -> ...
 */
function computePPForDay(startingPP: number, dayIndex: number): number {
  return ((startingPP - 1 + dayIndex) % 14) + 1;
}

/**
 * PP Color map
 */
function ppColor(pp: number): string {
  if (pp >= 1 && pp <= 4) return "blue";
  if (pp >= 5 && pp <= 9) return "yellow";
  if (pp >= 10 && pp <= 14) return "purple";
  return "";
}

/**
 * Generate the schedule template with PP1–PP14 repeating.
 * startingPP is the PP number of the FIRST day of the month.
 */
export function generateScheduleTemplate(
  monthIndex: number,
  year: number,
  providerNames: string[],
  startingPP: number = 1
): XLSX.WorkBook {
  const monthName = new Date(year, monthIndex, 1).toLocaleString("default", {
    month: "long",
  });

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const data: any[][] = [];

  // Row 1: Month + PP headers
  const row1: any[] = [`${monthName} ${year}`, ""];
  for (let d = 0; d < daysInMonth; d++) {
    const pp = computePPForDay(startingPP, d);
    row1.push(`PP${pp}`);
  }
  row1.push("");
  data.push(row1);

  // Row 2 (Pattern)
  const row2: any[] = ["Pattern", ""];
  for (let d = 1; d <= daysInMonth; d++) row2.push(7);
  row2.push("");
  data.push(row2);

  // Row 3 (Day)
  const row3: any[] = ["Day", ""];
  const dayAbbr = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, monthIndex, d).getDay();
    row3.push(dayAbbr[dow]);
  }
  row3.push("");
  data.push(row3);

  // Row 4 (Date)
  const row4: any[] = ["Date", ""];
  for (let d = 1; d <= daysInMonth; d++) row4.push(d);
  row4.push("");
  data.push(row4);

  // Provider rows
  providerNames.forEach((name) => {
    const row: any[] = [name, 0];
    for (let d = 1; d <= daysInMonth; d++) row.push("");
    row.push(0);
    data.push(row);
  });

  // Create sheet
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Color-code PP cells in Row 1
  for (let col = 2; col < 2 + daysInMonth; col++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: col });
    const cell = ws[cellRef];
    if (!cell) continue;

    const ppText = String(cell.v); // "PP5"
    const ppNum = Number(ppText.replace("PP", ""));
    const color = ppColor(ppNum);

    if (!ws["!cols"]) ws["!cols"] = [];

    if (!cell.s) cell.s = {};
    if (!cell.s.fill) cell.s.fill = {};

    if (color === "blue") {
      cell.s.fill = { fgColor: { rgb: "B7D4F8" } };
    }
    if (color === "yellow") {
      cell.s.fill = { fgColor: { rgb: "FFF4A3" } };
    }
    if (color === "purple") {
      cell.s.fill = { fgColor: { rgb: "D9B4F7" } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Schedule");

  return wb;
}
