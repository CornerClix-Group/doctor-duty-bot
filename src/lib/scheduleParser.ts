import * as XLSX from 'xlsx';

export interface Provider {
  name: string;
  weekendQuota: number;
  targetShifts: number;
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
  isWeekend: boolean;
  isHoliday: boolean;
  shifts: { [shiftType: string]: string }; // shiftType -> provider name or "X"/"L"/"HL"
}

export interface ScheduleData {
  month: string;
  year: number;
  days: DayData[];
  providers: { [name: string]: Provider };
  providerBlocked: { [providerName: string]: Set<string> }; // provider -> set of blocked dates
}

const SHIFT_NAMES = ['D1', 'D2', 'MIDA', 'MIDB', 'E', 'N', 'FT AM', 'FT PM', 'FT W'];

// Normalize shift names for matching
function normalizeShiftName(text: string): string | null {
  const upper = text.toUpperCase().replace(/\s+/g, '');
  
  const shiftMap: { [key: string]: string } = {
    'D1': 'D1',
    'D2': 'D2',
    'MIDA': 'MIDA',
    'MIDB': 'MIDB',
    'E': 'E',
    'N': 'N',
    'FTAM': 'FT AM',
    'FTPM': 'FT PM',
    'FTW': 'FT W'
  };
  
  return shiftMap[upper] || null;
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
  
  // Parse dates from row 4 (index 3), starting at column D (index 3) since columns A-C are provider info
  const dateColumns: { col: number; date: string; dayOfWeek: string; pattern: number; isWeekend: boolean }[] = [];
  
  for (let col = 3; col <= range.e.c; col++) {
    const dateCell = worksheet[XLSX.utils.encode_cell({ r: 3, c: col })];
    const dayCell = worksheet[XLSX.utils.encode_cell({ r: 2, c: col })];
    const patternCell = worksheet[XLSX.utils.encode_cell({ r: 1, c: col })];
    
    if (!dateCell?.v || dateCell.v === '') break; // Stop when no more dates
    
    const dateNum = parseInt(String(dateCell.v));
    if (isNaN(dateNum)) continue;
    
    const dayOfWeek = dayCell?.v ? String(dayCell.v) : '';
    const pattern = patternCell?.v ? parseInt(String(patternCell.v)) : 7;
    const isWeekend = dayOfWeek === 'Sa' || dayOfWeek === 'Su';
    
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
      isWeekend
    });
  }
  
  console.log(`Found ${dateColumns.length} date columns`);
  
  // Parse providers from column A, starting at row 5 (index 4)
  const providers: { [name: string]: Provider } = {};
  
  for (let row = 4; row <= range.e.r; row++) {
    const nameCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
    const weekendQuotaCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
    const targetShiftsCell = worksheet[XLSX.utils.encode_cell({ r: row, c: 2 })];
    
    if (!nameCell?.v || nameCell.v === '') break;
    
    const name = String(nameCell.v).trim();
    if (name === '') continue;
    
    // Parse weekend quota (default to 4 if not provided)
    const weekendQuota = weekendQuotaCell?.v ? parseInt(String(weekendQuotaCell.v)) : 4;
    
    // Parse target shifts (default to 0 if not provided)
    const targetShifts = targetShiftsCell?.v ? parseInt(String(targetShiftsCell.v)) : 0;
    
    providers[name] = {
      name,
      weekendQuota,
      targetShifts,
      constraints: PROVIDER_RULES[name] || {}
    };
  }
  
  console.log('Parsed providers:', Object.keys(providers));
  
  // Track blocked days for each provider
  const providerBlocked: { [providerName: string]: Set<string> } = {};
  Object.keys(providers).forEach(name => {
    providerBlocked[name] = new Set();
  });
  
  // Build days with shift assignments AND track blocked days
  const days: DayData[] = dateColumns.map(dateCol => {
    const shifts: { [shiftType: string]: string } = {};
    
    // For each provider, check what they have on this day
    Object.keys(providers).forEach((providerName, providerIndex) => {
      const row = 4 + providerIndex; // Provider rows start at index 4
      const cell = worksheet[XLSX.utils.encode_cell({ r: row, c: dateCol.col })];
      
      if (cell?.v) {
        const value = String(cell.v).trim();
        const upperValue = value.toUpperCase();
        
        // Check if blocked (X, L, LH, A10, or contains /X or X/)
        if (upperValue === 'X' || 
            upperValue.startsWith('L') || 
            upperValue.startsWith('A') ||
            value.includes('/x') || 
            value.includes('x/') ||
            value.includes('/X') ||
            value.includes('X/')) {
          providerBlocked[providerName].add(dateCol.date);
          return; // Provider blocked this day
        }
        
        // Check if it's an actual shift assignment
        const normalized = normalizeShiftName(value);
        if (normalized) {
          shifts[normalized] = providerName;
        }
      }
    });
    
    return {
      date: dateCol.date,
      dayOfWeek: dateCol.dayOfWeek,
      pattern: dateCol.pattern,
      isWeekend: dateCol.isWeekend,
      isHoliday: false,
      shifts
    };
  });

  console.log(`Parsed ${days.length} days`);
  return { month, year, days, providers, providerBlocked };
}
