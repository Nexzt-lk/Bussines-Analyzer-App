import { supabase } from '@/lib/supabaseClient';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  type DateRange,
  addDays,
  computeTrend,
  endOfDay,
  parseRecordDate,
  previousPeriod,
  requireBranchId,
  resolveCustomRange,
  splitIntoDaySlices,
  startOfDay,
  sumInRange,
  toLocalYmd,
  toNumber,
} from '@/lib/reporting';

export type ExpenseFilterType = 'today' | 'week' | 'month' | 'custom';

export interface ChartPoint {
  value: number;
  label?: string;
  dataPointText?: string;
}

export interface ExpenseRecord {
  id: string;
  description: string;
  category: string;
  amount: number;
  shop_id?: string;
  expense_date?: string;
  created_at?: string;
  displayDate: string;
  time: string;
}

export interface ExpenseStats {
  totalExpenses: number;
  trendPercentage: string;
  trendPositive: boolean;
  expenseCount: number;
}

export interface CustomDateRange {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  label: string;
}

export interface ExpensesReportResponse {
  filter: ExpenseFilterType;
  stats: ExpenseStats;
  chartData: ChartPoint[];
  expenses: ExpenseRecord[];
}

export interface RawExpenseRow {
  id: string;
  description?: string | null;
  amount: number | string | null;
  category?: string | null;
  shop_id?: string;
  expense_date?: string | null;
  created_at?: string | null;
}

/** When an expense happened: its expense_date, else when it was recorded. */
export const expenseTime = (row: Pick<RawExpenseRow, 'expense_date' | 'created_at'>) =>
  parseRecordDate(row.expense_date || row.created_at);

export const expenseAmount = (row: Pick<RawExpenseRow, 'amount'>) => toNumber(row.amount);

/**
 * Loads a branch's expenses that can fall inside `window`. The DB filter is
 * padded by a day either side (date-only vs timestamp columns, timezones);
 * callers then filter precisely with expenseTime().
 */
export const fetchExpensesInWindow = (branchId: string, window: DateRange, columns: string) => {
  const fromYmd = toLocalYmd(addDays(window.start, -1));
  const toYmd = toLocalYmd(addDays(window.end, 1));
  const fromIso = addDays(window.start, -1).toISOString();
  const toIso = addDays(window.end, 1).toISOString();
  return fetchAllRows<RawExpenseRow>(() =>
    supabase
      .from('expenses')
      .select(columns)
      .eq('shop_id', branchId)
      .or(
        `and(expense_date.gte.${fromYmd},expense_date.lte.${toYmd}),` +
          `and(expense_date.is.null,created_at.gte.${fromIso},created_at.lte.${toIso})`
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }) as never
  );
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const shortMonth = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });

const formatTime = (iso?: string | null): string => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateLabel = (t: number | null, now: Date): string => {
  if (t === null) return 'Recent';
  const day = startOfDay(new Date(t)).getTime();
  if (day === startOfDay(now).getTime()) return 'Today';
  if (day === startOfDay(addDays(now, -1)).getTime()) return 'Yesterday';
  const d = new Date(t);
  return `${d.getDate()} ${shortMonth(d)}`;
};

/** Rolling periods ending today, in local time. */
const getPeriod = (filter: ExpenseFilterType, now: Date, customRange?: CustomDateRange): DateRange => {
  const end = endOfDay(now);
  if (filter === 'week') return { start: startOfDay(addDays(now, -6)), end };
  if (filter === 'month') return { start: startOfDay(addDays(now, -29)), end };
  if (filter === 'custom') {
    return resolveCustomRange(customRange?.startDate, customRange?.endDate, {
      start: startOfDay(addDays(now, -6)),
      end,
    });
  }
  return { start: startOfDay(now), end };
};

const buildChart = (filter: ExpenseFilterType, range: DateRange, rows: RawExpenseRow[]): ChartPoint[] => {
  const sum = (r: DateRange) => Math.round(sumInRange(rows, r, expenseTime, expenseAmount));

  if (filter === 'today') {
    // Label = representative time; first/last slots absorb early and late hours.
    const day = range.start;
    const slots: [string, number, number][] = [
      ['08:00', 0, 10],
      ['11:00', 10, 13],
      ['14:00', 13, 16],
      ['17:00', 16, 19],
      ['20:00', 19, 24],
    ];
    return slots.map(([label, from, to]) => ({
      label,
      value: sum({
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), from),
        end: new Date(new Date(day.getFullYear(), day.getMonth(), day.getDate(), to).getTime() - 1),
      }),
    }));
  }

  if (filter === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(range.start, i);
      return { label: WEEKDAYS[d.getDay()], value: sum({ start: startOfDay(d), end: endOfDay(d) }) };
    });
  }

  if (filter === 'month') {
    return splitIntoDaySlices(range, 4).map((slice, i) => ({ label: `W${i + 1}`, value: sum(slice) }));
  }

  return splitIntoDaySlices(range, 6).map((slice) => ({
    label: `${slice.end.getDate()} ${shortMonth(slice.end)}`,
    value: sum(slice),
  }));
};

export const expensesApi = {
  /**
   * Expenses, totals and chart for one branch.
   * Rejects when the branch is missing, the custom range is reversed, or the
   * query fails — the UI must show an error rather than Rs 0.
   */
  getExpensesData: async (
    branchId: string,
    filter: ExpenseFilterType = 'today',
    customRange?: CustomDateRange
  ): Promise<ExpensesReportResponse> => {
    const shopId = requireBranchId(branchId);
    const now = new Date();
    const current = getPeriod(filter, now, customRange);
    const previous = previousPeriod(current);

    const rows = await fetchExpensesInWindow(
      shopId,
      { start: previous.start, end: current.end },
      'id, description, amount, category, shop_id, expense_date, created_at'
    );

    const inRange = (r: DateRange) => (row: RawExpenseRow) => {
      const t = expenseTime(row);
      return t !== null && t >= r.start.getTime() && t <= r.end.getTime();
    };
    const currentRows = rows
      .filter(inRange(current))
      .sort((a, b) => (expenseTime(b) ?? 0) - (expenseTime(a) ?? 0));
    const totalExpenses = currentRows.reduce((s, r) => s + expenseAmount(r), 0);
    const prevTotal = rows.filter(inRange(previous)).reduce((s, r) => s + expenseAmount(r), 0);
    const trend = computeTrend(totalExpenses, prevTotal, { lowerIsBetter: true });

    return {
      filter,
      stats: {
        totalExpenses: Math.round(totalExpenses),
        trendPercentage: trend.text,
        trendPositive: trend.positive,
        expenseCount: currentRows.length,
      },
      chartData: buildChart(filter, current, currentRows),
      expenses: currentRows.map((row) => ({
        id: row.id,
        description: row.description?.trim() || 'Expense',
        category: row.category?.trim() || 'General',
        amount: Math.round(expenseAmount(row)),
        shop_id: row.shop_id,
        expense_date: row.expense_date ?? undefined,
        created_at: row.created_at ?? undefined,
        displayDate: formatDateLabel(expenseTime(row), now),
        time: formatTime(row.created_at),
      })),
    };
  },
};
