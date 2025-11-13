import * as XLSX from "xlsx";

//
// CONFIG:
// Anchor: Jan 1, 2026 = PP5
//
const ANCHOR_DATE = new Date(2026, 0, 1); // Jan 1, 2026
const ANCHOR_PP = 5; // PP5 on Jan 1, 2026

//
// Compute PP1–PP14 repeating windows
//
function computePP(date: Date): number {
  const MS_DAY = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor((date.getTime() - ANCHOR_DATE.getTime()) / MS_DAY);

  const raw = ((diffDays + (ANCHOR_PP - 1)) % 14);
  return raw >= 0 ? raw + 1 : ((raw + 14) % 14) + 1;
}

//
// PP Color map
//
function ppColor(pp: number): string {
  if (pp >= 1 && pp <= 4) return "blue";
  if (pp >= 5 && pp <= 9) return "yellow";
  if (pp >= 10 && pp <= 14) return "purple";
  return "";
}

//
// Generate Template with PP1..PP14 repeating, color coded
//
export function generateScheduleTemplate(
  monthIndex: number,
  year: number,
  providerNames: string[]
): XLSX.WorkBook {
  const monthName = new Date(year, monthIndex, 1).toLocaleString("default", {
    month: "long",
  });

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const data: any[][] = [];

  // Row 1
  const row1 = [`${monthName} ${year}`, ""];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, monthIndex, d);
    const pp = computePP(date);
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
  const row3 = ["Day", ""];
  const dayAbbr = ["Su","Mo","Tu","We","Th","Fr","Sa"];
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
    const row = [name, 0];
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
