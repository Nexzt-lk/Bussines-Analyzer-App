import { supabase } from '@/lib/supabaseClient';

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

const isValidUUID = (id?: string | null): boolean => {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

const formatTime = (isoString?: string): string => {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch {
    return '--:--';
  }
};

const formatDateLabel = (isoString?: string, now?: Date): string => {
  if (!isoString) return 'Recent';
  try {
    const d = new Date(isoString);
    const current = now || new Date();
    const isToday =
      d.getFullYear() === current.getFullYear() &&
      d.getMonth() === current.getMonth() &&
      d.getDate() === current.getDate();
    if (isToday) return 'Today';

    const yest = new Date(current);
    yest.setDate(yest.getDate() - 1);
    const isYest =
      d.getFullYear() === yest.getFullYear() &&
      d.getMonth() === yest.getMonth() &&
      d.getDate() === yest.getDate();
    if (isYest) return 'Yesterday';

    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return 'Recent';
  }
};

export const expensesApi = {
  /**
   * Fetch real expenses and aggregated metrics directly from Supabase (Zero dummy data)
   */
  getExpensesData: async (
    branchId: string,
    filter: ExpenseFilterType = 'today',
    customRange?: CustomDateRange
  ): Promise<ExpensesReportResponse> => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let prevStartDate: Date;
    let prevEndDate: Date;

    if (filter === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 1);
      prevEndDate = new Date(endDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
    } else if (filter === 'week') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (filter === 'month') {
      startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 30);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (filter === 'custom' && customRange) {
      const s = new Date(`${customRange.startDate}T00:00:00`);
      const e = new Date(`${customRange.endDate}T23:59:59.999`);
      startDate = isNaN(s.getTime()) ? new Date(now.getTime() - 7 * 86400000) : s;
      endDate = isNaN(e.getTime()) ? now : e;
      const duration = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - duration);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 1);
      prevEndDate = new Date(endDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
    }

    try {
      // 1. Query Supabase expenses table directly
      let query = supabase
        .from('expenses')
        .select('id, description, amount, category, shop_id, expense_date, created_at')
        .order('created_at', { ascending: false });

      if (isValidUUID(branchId)) {
        query = query.eq('shop_id', branchId);
      }

      const { data: rawData, error } = await query;

      if (error) {
        console.error('Error fetching Supabase expenses:', error);
        throw error;
      }

      const allRows = rawData || [];

      // 2. Filter rows for current selected period
      const currentExpenses = allRows.filter((row: any) => {
        const rawDate = row.expense_date || row.created_at;
        if (!rawDate) return false;
        const t = new Date(rawDate).getTime();
        return t >= startDate.getTime() && t <= endDate.getTime();
      });

      // 3. Filter rows for previous period to calculate real trend
      const prevExpenses = allRows.filter((row: any) => {
        const rawDate = row.expense_date || row.created_at;
        if (!rawDate) return false;
        const t = new Date(rawDate).getTime();
        return t >= prevStartDate.getTime() && t <= prevEndDate.getTime();
      });

      const totalExpenses = currentExpenses.reduce(
        (sum: number, r: any) => sum + (Number(r.amount) || 0),
        0
      );
      const prevTotal = prevExpenses.reduce(
        (sum: number, r: any) => sum + (Number(r.amount) || 0),
        0
      );

      let trendPercentage = '0%';
      let trendPositive = true;

      if (prevTotal > 0) {
        const diff = totalExpenses - prevTotal;
        const pct = Math.round((diff / prevTotal) * 100);
        trendPercentage = `${pct >= 0 ? '+' : ''}${pct}%`;
        trendPositive = diff <= 0; // Less expenses is positive
      } else if (totalExpenses > 0) {
        trendPercentage = '+100%';
        trendPositive = false;
      }

      // 4. Generate Chart Points based on actual data
      let chartData: ChartPoint[] = [];

      if (filter === 'today') {
        const slots = [
          { label: '08:00', startH: 6, endH: 10 },
          { label: '11:00', startH: 10, endH: 13 },
          { label: '14:00', startH: 13, endH: 16 },
          { label: '17:00', startH: 16, endH: 19 },
          { label: '20:00', startH: 19, endH: 23 },
        ];
        chartData = slots.map((s) => {
          const sum = currentExpenses
            .filter((e: any) => {
              const d = new Date(e.expense_date || e.created_at);
              const h = d.getHours();
              return h >= s.startH && h < s.endH;
            })
            .reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);
          return { label: s.label, value: Math.round(sum) };
        });
      } else if (filter === 'week') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const points: ChartPoint[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
          const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
          const sum = currentExpenses
            .filter((e: any) => {
              const t = new Date(e.expense_date || e.created_at).getTime();
              return t >= dayStart.getTime() && t <= dayEnd.getTime();
            })
            .reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);
          points.push({ label: days[d.getDay()], value: Math.round(sum) });
        }
        chartData = points;
      } else if (filter === 'month') {
        chartData = [
          { label: 'W1', value: 0 },
          { label: 'W2', value: 0 },
          { label: 'W3', value: 0 },
          { label: 'W4', value: 0 },
        ];
        for (let w = 0; w < 4; w++) {
          const wStart = new Date(now.getTime() - (28 - w * 7) * 86400000);
          const wEnd = new Date(now.getTime() - (21 - w * 7) * 86400000);
          const sum = currentExpenses
            .filter((e: any) => {
              const t = new Date(e.expense_date || e.created_at).getTime();
              return t >= wStart.getTime() && t <= wEnd.getTime();
            })
            .reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);
          chartData[w].value = Math.round(sum);
        }
      } else {
        const points: ChartPoint[] = [];
        const step = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (6 * 86400000)));
        for (let i = 0; i < 6; i++) {
          const sliceStart = new Date(startDate.getTime() + i * step * 86400000);
          const sliceEnd =
            i === 5 ? endDate : new Date(startDate.getTime() + (i + 1) * step * 86400000 - 1);
          const label = `${sliceEnd.getDate()} ${sliceEnd.toLocaleDateString('en-GB', { month: 'short' })}`;
          const sum = currentExpenses
            .filter((e: any) => {
              const t = new Date(e.expense_date || e.created_at).getTime();
              return t >= sliceStart.getTime() && t <= sliceEnd.getTime();
            })
            .reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);
          points.push({ label, value: Math.round(sum) });
        }
        chartData = points;
      }

      // 5. Map records into ExpenseRecord format
      const mappedExpenses: ExpenseRecord[] = currentExpenses.map((row: any) => ({
        id: row.id,
        description: row.description || 'Expense',
        category: row.category || 'General',
        amount: Math.round(Number(row.amount) || 0),
        shop_id: row.shop_id,
        expense_date: row.expense_date,
        created_at: row.created_at,
        displayDate: formatDateLabel(row.expense_date || row.created_at, now),
        time: formatTime(row.created_at),
      }));

      return {
        filter,
        stats: {
          totalExpenses: Math.round(totalExpenses),
          trendPercentage,
          trendPositive,
          expenseCount: currentExpenses.length,
        },
        chartData,
        expenses: mappedExpenses,
      };
    } catch (err) {
      console.error('Failed to query Supabase expenses table:', err);
      // Pure zero state (never fake data)
      return {
        filter,
        stats: {
          totalExpenses: 0,
          trendPercentage: '0%',
          trendPositive: true,
          expenseCount: 0,
        },
        chartData:
          filter === 'today'
            ? [
                { label: '08:00', value: 0 },
                { label: '11:00', value: 0 },
                { label: '14:00', value: 0 },
                { label: '17:00', value: 0 },
                { label: '20:00', value: 0 },
              ]
            : filter === 'week'
            ? [
                { label: 'Mon', value: 0 },
                { label: 'Tue', value: 0 },
                { label: 'Wed', value: 0 },
                { label: 'Thu', value: 0 },
                { label: 'Fri', value: 0 },
                { label: 'Sat', value: 0 },
                { label: 'Sun', value: 0 },
              ]
            : [
                { label: 'W1', value: 0 },
                { label: 'W2', value: 0 },
                { label: 'W3', value: 0 },
                { label: 'W4', value: 0 },
              ],
        expenses: [],
      };
    }
  },
};
