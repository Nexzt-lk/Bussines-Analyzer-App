import { supabase } from '@/lib/supabaseClient';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  type DateRange,
  addDays,
  computeTrend,
  endOfDay,
  isPaidOrder,
  previousPeriod,
  requireBranchId,
  resolveCustomRange,
  splitIntoDaySlices,
  startOfDay,
  sumInRange,
  toNumber,
  toNumberOrNull,
} from '@/lib/reporting';
import { expenseAmount, expenseTime, fetchExpensesInWindow, type RawExpenseRow } from '../expenses/expensesApi';

export type ReportFilterType = 'today' | '7day' | 'month' | 'year' | 'custom';

export interface CustomDateRange {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  label?: string;
}

export interface ChartPoint {
  label: string;
  sales: number;
  expenses: number;
  value?: number;
}

export interface PaymentBreakdown {
  cash: number;
  card: number;
  online: number;
}

export interface ReportStats {
  totalSales: number;
  revenue: number;        // Net result: Total Sales − Total Expenses (negative = loss)
  totalExpense: number;
  totalOrders: number;
  avgOrderValue: number;
  profitMargin: number;   // Percentage of sales kept, e.g. 85 (negative = loss)
  salesTrend: string;     // e.g. '+12%'
  salesTrendPositive: boolean;
  expenseTrend: string;   // e.g. '-5%'
  expenseTrendPositive: boolean;
}

export interface TopProductItem {
  id?: string;
  name: string;
  units: number;
  revenue?: number;
}

export interface InventorySummaryStats {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
}

export interface ReportResponse {
  filter: ReportFilterType;
  dateLabel: string;
  stats: ReportStats;
  chartData: ChartPoint[];
  paymentBreakdown: PaymentBreakdown;
  recentTransactionsCount: number;
  topProducts: TopProductItem[];
  inventorySummary: InventorySummaryStats;
}

interface RawOrder {
  id: string;
  total_amount: number | string | null;
  status: string | null;
  created_at: string;
  order_items?: {
    product_name: string | null;
    quantity: number | string | null;
    unit_price: number | string | null;
    subtotal: number | string | null;
  }[];
  payments?: { method: string | null; amount: number | string | null }[];
}

interface RawInventoryRow {
  quantity: number | string | null;
  min_quantity: number | string | null;
}

const TOP_PRODUCTS_LIMIT = 5;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const getPeriods = (
  filter: ReportFilterType,
  now: Date,
  customRange?: CustomDateRange
): { current: DateRange; previous: DateRange; dateLabel: string } => {
  if (filter === 'today') {
    const current = { start: startOfDay(now), end: endOfDay(now) };
    return { current, previous: previousPeriod(current), dateLabel: 'Today' };
  }
  if (filter === '7day') {
    const current = { start: startOfDay(addDays(now, -6)), end: endOfDay(now) };
    return { current, previous: previousPeriod(current), dateLabel: 'Last 7 Days' };
  }
  if (filter === 'month') {
    return {
      current: {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      },
      previous: {
        start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        end: endOfDay(new Date(now.getFullYear(), now.getMonth(), 0)),
      },
      dateLabel: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    };
  }
  if (filter === 'year') {
    const y = now.getFullYear();
    return {
      current: { start: new Date(y, 0, 1), end: endOfDay(new Date(y, 11, 31)) },
      previous: { start: new Date(y - 1, 0, 1), end: endOfDay(new Date(y - 1, 11, 31)) },
      dateLabel: `Year ${y}`,
    };
  }
  const current = resolveCustomRange(customRange?.startDate, customRange?.endDate, {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: endOfDay(now),
  });
  return {
    current,
    previous: previousPeriod(current),
    dateLabel: customRange?.label || `${customRange?.startDate} to ${customRange?.endDate}`,
  };
};

const orderTime = (o: RawOrder) => {
  const t = new Date(o.created_at).getTime();
  return Number.isNaN(t) ? null : t;
};
const orderTotal = (o: RawOrder) => toNumber(o.total_amount);

/** Chart buckets for the filter; each is a [label, range] pair inside `range`. */
const chartBuckets = (filter: ReportFilterType, range: DateRange): [string, DateRange][] => {
  const { start } = range;
  const atHour = (h: number) => new Date(start.getFullYear(), start.getMonth(), start.getDate(), h);

  if (filter === 'today') {
    const slots: [string, number, number][] = [
      ['08:00', 0, 10],
      ['11:00', 10, 13],
      ['14:00', 13, 16],
      ['17:00', 16, 19],
      ['20:00', 19, 22],
      ['23:00', 22, 24],
    ];
    return slots.map(([label, from, to]) => [label, { start: atHour(from), end: new Date(atHour(to).getTime() - 1) }]);
  }
  if (filter === '7day') {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      return [WEEKDAYS[d.getDay()], { start: startOfDay(d), end: endOfDay(d) }];
    });
  }
  if (filter === 'month') {
    const y = start.getFullYear();
    const m = start.getMonth();
    const weeks: [string, number, number][] = [
      ['Week 1', 1, 7],
      ['Week 2', 8, 14],
      ['Week 3', 15, 21],
      ['Week 4', 22, range.end.getDate()],
    ];
    return weeks.map(([label, from, to]) => [label, { start: new Date(y, m, from), end: endOfDay(new Date(y, m, to)) }]);
  }
  if (filter === 'year') {
    const y = start.getFullYear();
    return MONTHS.map((label, i) => [label, { start: new Date(y, i, 1), end: endOfDay(new Date(y, i + 1, 0)) }]);
  }
  return splitIntoDaySlices(range, 5).map((slice) => [
    `${slice.start.getDate()}/${slice.start.getMonth() + 1}`,
    slice,
  ]);
};

const aggregateTopProducts = (paidOrders: RawOrder[]): TopProductItem[] => {
  const products = new Map<string, { name: string; units: number; revenue: number }>();
  for (const order of paidOrders) {
    for (const item of order.order_items ?? []) {
      const name = (item.product_name ?? '').trim();
      if (!name) continue;
      const qty = toNumberOrNull(item.quantity) ?? 1;
      const subtotal = toNumberOrNull(item.subtotal);
      const revenue = subtotal ?? qty * toNumber(item.unit_price);
      const entry = products.get(name) ?? { name, units: 0, revenue: 0 };
      entry.units += qty;
      entry.revenue += revenue;
      products.set(name, entry);
    }
  }
  return Array.from(products.values())
    .filter((p) => p.units > 0)
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, TOP_PRODUCTS_LIMIT)
    .map((p) => ({ ...p, revenue: Math.round(p.revenue) }));
};

const summariseInventory = (rows: RawInventoryRow[]): InventorySummaryStats => {
  let lowStock = 0;
  let outOfStock = 0;
  for (const r of rows) {
    const q = toNumber(r.quantity);
    if (q <= 0) outOfStock++;
    else if (q <= toNumber(r.min_quantity)) lowStock++;
  }
  return { totalProducts: rows.length, lowStock, outOfStock };
};

const paymentBreakdown = (paidOrders: RawOrder[]): PaymentBreakdown => {
  let cash = 0;
  let card = 0;
  let online = 0;
  for (const o of paidOrders) {
    if (!o.payments?.length) {
      cash += orderTotal(o);
      continue;
    }
    for (const p of o.payments) {
      const m = (p.method ?? '').toLowerCase();
      const amt = toNumber(p.amount);
      if (m.includes('cash')) cash += amt;
      else if (m.includes('card') || m.includes('visa') || m.includes('master')) card += amt;
      else online += amt;
    }
  }
  return { cash: Math.round(cash), card: Math.round(card), online: Math.round(online) };
};

const fetchOrders = (branchId: string, range: DateRange, columns: string) =>
  fetchAllRows<RawOrder>(() =>
    supabase
      .from('orders')
      .select(columns)
      .eq('shop_id', branchId)
      .gte('created_at', range.start.toISOString())
      .lte('created_at', range.end.toISOString())
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }) as never
  );

const fetchInventory = (branchId: string) =>
  fetchAllRows<RawInventoryRow>(() =>
    supabase
      .from('inventory')
      .select('quantity, min_quantity, products!inner(shop_id)')
      .eq('products.shop_id', branchId)
      // Only columns known to exist are used; a branch rarely has >1000 items.
      .order('quantity', { ascending: true }) as never
  );

export const reportsApi = {
  /**
   * Sales, expenses, top products and inventory summary for one branch.
   * Rejects when the branch is missing, the custom range is reversed, or any
   * query fails — the UI must show an error rather than made-up numbers.
   */
  getReportData: async (
    branchId: string,
    filter: ReportFilterType,
    customRange?: CustomDateRange
  ): Promise<ReportResponse> => {
    const shopId = requireBranchId(branchId);
    const now = new Date();
    const { current, previous, dateLabel } = getPeriods(filter, now, customRange);

    const [orders, prevOrders, expenses, inventory] = await Promise.all([
      fetchOrders(
        shopId,
        current,
        `id, total_amount, status, created_at,
         order_items ( product_name, quantity, unit_price, subtotal ),
         payments ( method, amount )`
      ),
      fetchOrders(shopId, previous, 'id, total_amount, status, created_at'),
      fetchExpensesInWindow(shopId, { start: previous.start, end: current.end }, 'id, amount, expense_date, created_at, category'),
      fetchInventory(shopId),
    ]);

    const inRange = (r: DateRange) => (row: RawExpenseRow) => {
      const t = expenseTime(row);
      return t !== null && t >= r.start.getTime() && t <= r.end.getTime();
    };
    const currentExpenses = expenses.filter(inRange(current));
    const prevExpenses = expenses.filter(inRange(previous));

    const paidOrders = orders.filter((o) => isPaidOrder(o.status));
    const totalSales = Math.round(paidOrders.reduce((s, o) => s + orderTotal(o), 0));
    const prevSales = Math.round(
      prevOrders.filter((o) => isPaidOrder(o.status)).reduce((s, o) => s + orderTotal(o), 0)
    );
    const totalExpense = Math.round(currentExpenses.reduce((s, e) => s + expenseAmount(e), 0));
    const prevExpense = Math.round(prevExpenses.reduce((s, e) => s + expenseAmount(e), 0));

    const revenue = totalSales - totalExpense;
    const salesTrend = computeTrend(totalSales, prevSales);
    const expenseTrend = computeTrend(totalExpense, prevExpense, { lowerIsBetter: true });

    const chartData: ChartPoint[] = chartBuckets(filter, current).map(([label, bucket]) => {
      const sales = Math.round(sumInRange(paidOrders, bucket, orderTime, orderTotal));
      return {
        label,
        sales,
        expenses: Math.round(sumInRange(currentExpenses, bucket, expenseTime, expenseAmount)),
        value: sales,
      };
    });

    return {
      filter,
      dateLabel,
      stats: {
        totalSales,
        revenue,
        totalExpense,
        totalOrders: orders.length,
        avgOrderValue: paidOrders.length > 0 ? Math.round(totalSales / paidOrders.length) : 0,
        profitMargin: totalSales > 0 ? Math.round((revenue / totalSales) * 100) : 0,
        salesTrend: salesTrend.text,
        salesTrendPositive: salesTrend.positive,
        expenseTrend: expenseTrend.text,
        expenseTrendPositive: expenseTrend.positive,
      },
      chartData,
      paymentBreakdown: paymentBreakdown(paidOrders),
      recentTransactionsCount: orders.length + currentExpenses.length,
      topProducts: aggregateTopProducts(paidOrders),
      inventorySummary: summariseInventory(inventory),
    };
  },
};
