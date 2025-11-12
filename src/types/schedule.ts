export interface ProviderProfile {
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  allowed_shifts: string[];
  rules: {
    disallowed_shifts?: string[];
    preferred_shifts?: string[];
    rest_hours?: number;
    n_recovery_days?: number;
    block_pattern?: string;
    max_consecutive_N?: number;
    saturday_restrictions?: string;
    sunday_restrictions?: string;
  };
}

export interface MonthlyInput {
  month: string;
  providers: {
    name: string;
    target_shifts: number;
    weekend_quota: number;
  }[];
}

export interface DailyAssignment {
  date: string;      // "2026-01-05"
  shift: string;     // "D1"
  provider: string;  // "Lopez"
}

export interface ProviderTotal {
  provider: string;
  total: number;
  weekend: number;
}

export interface GeneratedSchedule {
  month: string;
  year: number;
  schedule: {
    date: string;
    pattern: number;
    pay_period: number;
    assignments: {
      shift: string;
      provider: string;
    }[];
  }[];
  provider_totals: {
    [providerName: string]: {
      worked: number;
      weekends: number;
      call: number;
      admin: number;
      target?: number;
      weekend_quota?: number;
      weekendQuota?: number;
    };
  };
  pay_period_totals?: {
    [providerName: string]: {
      [ppKey: string]: number;
    };
  };
  warnings?: string[];
}
