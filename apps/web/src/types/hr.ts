export type TimeClockItem = {
  id?: string | number;
  clock_id?: string | number;
  user_id: string;
  status?: 'in' | 'out';
  started_at?: string;
  ended_at?: string | null;
  clock_in_ts?: string;
  clock_out_ts?: string | null;
  duration_sec?: number;
};

export type Timesheet = {
  id?: string | number;
  entry_id?: string | number;
  user_id: string;
  period: { start: string; end: string };
  lines: Array<{ date: string; code: string; hours: number }>;
  status: 'draft' | 'submitted' | 'approved' | string;
};

export type Payroll = {
  period: { start: string; end: string };
  totals: Array<{ user_id: string; regular: number; overtime: number; paid: number }>;
};

