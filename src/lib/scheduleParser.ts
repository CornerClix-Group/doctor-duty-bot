import * as XLSX from 'xlsx';

/**
 * Safely extract the text value from a cell.
 * Handles styled-but-empty cells, which SheetJS creates as objects with .s but no .v.
 */
function safeCellValue(cell: any): string {
  if (!cell) return "";
  if (cell.v === undefined || cell.v === null) return "";
  return String(cell.v).trim();
}

/**
 * Detects whether a given text value is a true shift assignment.
 */
const SHIFT_CODES = new Set([
  "D1", "D2", "MIDA", "MIDB", "E", "N", "FT AM", "FT PM", "FT W", "FT W12", "C", "A10"
]);

/**
 * True lock codes used in provider templates.
 */
const HARD_LOCKS = new Set(["X", "L", "LH", "HL"]);

export interface Provider {
  name: string;
  weekendQuota: number;
  targetShifts: number;
  dailyConstraints: { [date: string]: string[] }; // Date -> allowed shifts
  lockedCells: { [date: string]: string }; // Date -> locked value (X, L, LH, etc.)
  constraints: {
    allowedShifts?: string[];
    disallowedShifts?: string[];
    maxConsecutive?: { [shift: string]: number };
    weekendRules?: string[];
    preferredShifts?: string[];
  };
}

export interface DayData {
  date: string;
  dayOfWeek: string;
  pattern: number;
  payPeriod: number;
  isWeekend: boolean;
  isHoliday: boolean;
  shifts: { [shiftType: string]: string }; // shiftType -> provider name or "X"/"L"/"LH"
}

export interface ScheduleData {
  month: string;
  year: number;
  days: DayData[];
  providers: { [name: string]: Provider };
  providerBlocked: { [providerName: string]: Set<string> }; // provider -> set of blocked dates
  lockedCells: { [providerName: string]: { [date: string]: string } }; // provider -> date -> value
}

const SHIFT_NAMES = ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W', 'FT W12', 'C', 'A10'];

// Normalize shift names for matching
function normalizeShiftName(text: string): string | null {
  const upper = text.toUpperCase().replace(/\s+/g, '');
  
  const shiftMap: { [key: string]: string } = {
    'D1': 'D1',
    'D2': 'D2',
    'MIDA': 'MIDA',
    'MID1': 'MIDA',
    'MIDB': 'MIDB',
    'MID2': 'MIDB',
    'E': 'E',
    'N': 'N',
    'FTAM': 'FT AM',
    'FTPM': 'FT PM',
    'FTW': 'FT W',
    'FTW12': 'FT W12',
    'C': 'C',
    'A10': 'A10',
    'X': 'X',
    'L': 'L',
    'LH': 'LH',
    'HL': 'LH' // Normalize HL to LH
  };
  
  return shiftMap[upper] || null;
}

// Parse constraint codes like "1/x", "5/10/x", "1/2/Amx"
function parseConstraintCode(value: string): string[] | null {
  if (!value) return null;
  
  const lower = value.toLowerCase();
  if (!lower.includes('/x')) {
    return null; // Not a constraint code
  }
  
  const parts = lower.split('/');
  const allowedShifts: string[] = [];
  
  parts.forEach(part => {
    const p = part.replace(/x$/i, ''); // remove trailing x if present (e.g. "amx")
    if (p === '' || p === 'x') return; // Skip 'x' (means "or be off")
    if (p === '1') allowedShifts.push('D1');
    else if (p === '2') allowedShifts.push('D2');
    else if (p === '5') allowedShifts.push('E');
    else if (p === '10' || p === '10p') allowedShifts.push('N');
    else if (p === 'am') allowedShifts.push('FT AM');
    else if (p === 'pm') allowedShifts.push('FT PM');
  });
  
  return allowedShifts.length > 0 ? allowedShifts : null;
}

const PROVIDER_RULES: { [name: string]: Provider['constraints'] } = {
  'Coffin': {
    allowedShifts: ['N'],
    maxConsecutive: { 'N': 4 }
  },
  'Cary': {
    disallowedShifts: ['D1'],
    preferredShifts: ['MIDB', 'E', 'N'],
    maxConsecutive: { 'N': 4 }
  },
  'Venugopal': {
    allowedShifts: ['E'],
    maxConsecutive: { 'E': 2 }
  },
  'Lopez': {
    allowedShifts: ['D1', 'FT AM'],
    maxConsecutive: { 'D1': 2, 'FT AM': 2 }
  },
  'Orlando': {
    disallowedShifts: ['N']
  },
  'Beckman': {
    disallowedShifts: ['N']
  },
  'Ryals': {
    allowedShifts: ['FT AM', 'FT PM', 'FT W', 'MIDA']
  },
  'Campo-Ford': {
    allowedShifts: ['FT AM', 'FT PM', 'FT W', 'MIDA']
  },
  'Sellars-Pompey': {
    allowedShifts: ['FT AM', 'FT PM', 'FT W', 'MIDA']
  },
  'Arnett': {
    weekendRules: ['no-e-n-sat', 'only-midb-e-n-sun', 'avoid-sun']
  },
  'Beach': {
    weekendRules: ['avoid-sun', 'only-midb-e-n-sun']
  }
};

const D1_PROVIDERS = ['Lopez', 'Arnett', 'Beres', 'Illston', 'Freeman', 'Ferguson', 'Jones'];
const D1_PRIORITY = ['Lopez', 'Arnett', 'Beres', 'Illston', 'Freeman', 'Ferguson', 'Jones'];

export function parseScheduleData(worksheet: XLSX.WorkSheet): ScheduleData {
  console.log('Starting schedule parsing...');
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  console.log('Sheet range:', range);
  
  // Get month/year from first cell (e.g., "Jan-26")
  const monthCell = worksheet['A1'];
  let month = 'January';
  let year = 2026;
  if (monthCell?.v) {
    const monthStr = String(monthCell.v);
    console.log('Month cell value:', monthStr);
    if (monthStr.includes('-')) {
      const parts = monthStr.split('-');
      month = parts[0];
      year = 2000 + parseInt(parts[1]);
    }
  }
  
  // Parse dates from row 4 (index 3), starting at column C (index 2)
  // Column A = Provider Name, Column B = Weekend Quota, Columns C-AG = Daily (31 days), Column AI = Target Total
  const dateColumns: { col: number; date: string; dayOfWeek: string; pattern: number; payPeriod: number; isWeekend: boolean }[] = [];
  
  for (let col = 2; col <= 32; col++) { // Columns C-AG (indices 2-32)
    const dateCell = worksheet[XLSX.utils.encode_cell({ r: 3, c: col })];
    const dayCell = worksheet[XLSX.utils.encode_cell({ r: 2, c: col })];
    const patternCell = worksheet[XLSX.utils.encode_cell({ r: 1, c: col })];
    const ppCell = worksheet[XLSX.utils.encode_cell({ r: 0, c: col })];
    
    if (!dateCell?.v || dateCell.v === '') break; // Stop when no more dates
    
    const dateNum = parseInt(String(dateCell.v));
    if (isNaN(dateNum)) continue;
    
    const dayOfWeek = dayCell?.v ? String(dayCell.v) : '';
    const pattern = patternCell?.v ? parseInt(String(patternCell.v)) : 7;
    const isWeekend = dayOfWeek === 'Sa' || dayOfWeek === 'Su';
    
    // Parse Pay Period from Row 1
    let payPeriod = 1;
    if (ppCell?.v) {
      const ppStr = String(ppCell.v).replace('PP', '');
      payPeriod = parseInt(ppStr) || 1;
    }
    
    // Construct full date
    const monthNum = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December']
                      .indexOf(month);
    const date = new Date(year, monthNum, dateNum);
    
    dateColumns.push({
      col,
      date: date.toISOString().split('T')[0],
      dayOfWeek,
      pattern,
      payPeriod,
      isWeekend
    });
  }
  
  console.log(`Found ${dateColumns.length} date columns`);
  
  // Parse providers from column A, starting at row 5 (index 4)
  const providers: { [name: string]: Provider } = {};
  
  for (let row = 4; row <= range.e.r; row++) {
    const nameCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    const weekendQuotaCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    const targetShiftsCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 34 })]  // Column AI (index 34)
    
    if (!nameCell?.v || nameCell.v === '') break;
    
    const name = String(nameCell.v).trim();
    if (name === '' || name.toLowerCase().includes('total') || name.toLowerCase().includes('summary')) continue;
    
    // Parse weekend quota (default to 4 if not provided)
    const weekendQuota = weekendQuotaCell?.v ? parseInt(String(weekendQuotaCell.v)) : 4;
    
    // Parse target shifts from Column AI (default to 0 if not provided)
    const targetShifts = targetShiftsCell?.v ? parseInt(String(targetShiftsCell.v)) : 0;
    
    providers[name] = {
      name,
      weekendQuota,
      targetShifts,
      dailyConstraints: {},
      lockedCells: {},
      constraints: PROVIDER_RULES[name] || {}
    };
  }
  
  console.log('Parsed providers:', Object.keys(providers));
  
  // Track blocked days and locked cells for each provider
  const providerBlocked: { [providerName: string]: Set<string> } = {};
  const lockedCells: { [providerName: string]: { [date: string]: string } } = {};
  
  Object.keys(providers).forEach(name => {
    providerBlocked[name] = new Set();
    lockedCells[name] = {};
  });
  
  // Build days with shift assignments AND track blocked days and constraints
  const days: DayData[] = dateColumns.map(dateCol => {
    const shifts: { [shiftType: string]: string } = {};
    
    // For each provider, check what they have on this day
    Object.keys(providers).forEach((providerName, providerIndex) => {
      const row = 4 + providerIndex; // Provider rows start at index 4
      const cellRef = XLSX.utils.encode_cell({ r: row, c: dateCol.col });
      const cell = worksheet[cellRef];
      
      // Safely extract value
      const rawValue = safeCellValue(cell);
      const trimmed = rawValue.trim();
      
      if (!trimmed) return; // Empty cell - skip
      
      // Determine meaning
      const isConstraint = parseConstraintCode(trimmed) !== null;
      const isShift = SHIFT_CODES.has(trimmed);
      const isHardLocked = HARD_LOCKS.has(trimmed.toUpperCase());
      
      // Handle constraint codes (1/x, 5/10/x, etc.)
      if (isConstraint) {
        const constraintShifts = parseConstraintCode(trimmed);
        if (constraintShifts) {
          providers[providerName].dailyConstraints[dateCol.date] = constraintShifts;
          providerBlocked[providerName].add(dateCol.date);
          lockedCells[providerName][dateCol.date] = trimmed;
        }
        return;
      }
      
      // Handle hard lock codes (X, L, LH, HL)
      if (isHardLocked) {
        const normalizedValue = trimmed.toUpperCase() === 'HL' ? 'LH' : trimmed.toUpperCase();
        providerBlocked[providerName].add(dateCol.date);
        lockedCells[providerName][dateCol.date] = normalizedValue;
        return;
      }
      
      // Handle actual shift assignments
      if (isShift) {
        const normalized = normalizeShiftName(trimmed);
        if (normalized) {
          shifts[normalized] = providerName;
          lockedCells[providerName][dateCol.date] = normalized; // Pre-assigned shifts are locked
        }
      }
    });
    
    return {
      date: dateCol.date,
      dayOfWeek: dateCol.dayOfWeek,
      pattern: dateCol.pattern,
      payPeriod: dateCol.payPeriod,
      isWeekend: dateCol.isWeekend,
      isHoliday: false,
      shifts
    };
  });

  // Store locked cells in provider objects
  Object.keys(providers).forEach(name => {
    providers[name].lockedCells = lockedCells[name];
  });

  console.log(`Parsed ${days.length} days`);
  return { month, year, days, providers, providerBlocked, lockedCells };
}
