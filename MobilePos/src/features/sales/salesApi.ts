import { supabase } from '@/lib/supabaseClient';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  type DateRange,
  addDays,
  computeTrend,
  endOfDay,
  isPaidOrder,
  isUnpaidOrder,
  previousPeriod,
  requireBranchId,
  resolveCustomRange,
  splitIntoDaySlices,
  startOfDay,
  sumInRange,
  toNumber,
  toNumberOrNull,
} from '@/lib/reporting';

export type SalesFilterType = 'today' | 'week' | 'month' | 'custom';

export interface ChartPoint {
  value: number;
  label?: string;
  dataPointText?: string;
}

export interface OrderItemDetail {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface OrderRecord {
  id: string;
  orderNumber: string; // e.g. '#0079'
  time: string;        // e.g. '13:20'
  date: string;        // 'Today', 'Yesterday', '28 Sep', etc.
  paymentMethod: 'Card' | 'Cash' | 'Online';
  itemCount: number;
  total: number;       // e.g. 8600
  status: 'Paid' | 'Pending' | 'Refunded';
  cashierName?: string;
  items: OrderItemDetail[];
}

export interface SalesStats {
  totalIncome: number;
  trendPercentage: string; // e.g. '+8%'
  trendPositive: boolean;
  orderCount: number;
  avgOrderValue: number;
  paidCount: number;
  unpaidCount: number;
}

export interface CustomDateRange {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string;   // 'YYYY-MM-DD'
  label: string;      // e.g. '15 Sep - 30 Sep'
}

export interface SalesReportResponse {
  filter: SalesFilterType;
  stats: SalesStats;
  chartData: ChartPoint[];
  orders: OrderRecord[];
  periodDateLabel?: string;
  isToday?: boolean;
}

export interface DashboardSummary {
  todayIncome: number;
  trendPercentage: string;
  trendPositive: boolean;
  ordersToday: number;
  unpaidCount: number;
  avgOrder: number;
}

interface RawOrderItem {
  id: string;
  product_name: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  subtotal: number | string | null;
}

interface RawPayment {
  id: string;
  method: string | null;
  amount: number | string | null;
}

interface RawOrderRow {
  id: string;
  shop_id: string;
  order_no: string | null;
  cashier_name: string | null;
  total_amount: number | string | null;
  status: string | null;
  created_at: string;
  order_items?: RawOrderItem[];
  payments?: RawPayment[];
}

interface RawOrderSummary {
  id: string;
  total_amount: number | string | null;
  status: string | null;
  created_at: string;
}

const ORDER_COLUMNS = `
  id, shop_id, order_no, cashier_name, total_amount, status, created_at,
  order_items ( id, product_name, quantity, unit_price, subtotal ),
  payments ( id, method, amount )
`;

const MAX_LISTED_ORDERS = 100;

const shortMonth = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });

const formatTime = (isoString: string): string => {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDateLabel = (isoString: string, now: Date): string => {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return 'Recent';
  const day = startOfDay(d).getTime();
  if (day === startOfDay(now).getTime()) return 'Today';
  if (day === startOfDay(addDays(now, -1)).getTime()) return 'Yesterday';
  return `${d.getDate()} ${shortMonth(d)}`;
};

/** Current and comparison periods for a filter, in local time. */
const getPeriods = (
  filter: SalesFilterType,
  now: Date,
  customRange?: CustomDateRange,
  targetDate?: Date
): { current: DateRange; previous: DateRange } => {
  const base = targetDate ?? now;
  if (filter === 'today') {
    const current = { start: startOfDay(base), end: endOfDay(base) };
    return { current, previous: previousPeriod(current) };
  }
  if (filter === 'week') {
    const monday = startOfDay(addDays(base, -((base.getDay() + 6) % 7)));
    const current = { start: monday, end: endOfDay(addDays(monday, 6)) };
    return { current, previous: { start: addDays(monday, -7), end: endOfDay(addDays(monday, -1)) } };
  }
  if (filter === 'month') {
    return {
      current: {
        start: new Date(base.getFullYear(), base.getMonth(), 1),
        end: endOfDay(new Date(base.getFullYear(), base.getMonth() + 1, 0)),
      },
      previous: {
        start: new Date(base.getFullYear(), base.getMonth() - 1, 1),
        end: endOfDay(new Date(base.getFullYear(), base.getMonth(), 0)),
      },
    };
  }
  // Custom: defaults to month-to-date when no/invalid dates are given.
  const current = resolveCustomRange(customRange?.startDate, customRange?.endDate, {
    start: new Date(base.getFullYear(), base.getMonth(), 1),
    end: endOfDay(base),
  });
  return { current, previous: previousPeriod(current) };
};

const orderTime = (o: { created_at: string }) => {
  const t = new Date(o.created_at).getTime();
  return Number.isNaN(t) ? null : t;
};
const orderTotal = (o: { total_amount: unknown }) => toNumber(o.total_amount);

const buildChart = (
  filter: SalesFilterType,
  range: DateRange,
  paidOrders: RawOrderRow[]
): ChartPoint[] => {
  const sum = (r: DateRange) => Math.round(sumInRange(paidOrders, r, orderTime, orderTotal));
  const day = range.start;

  if (filter === 'today') {
    // Label = end of the bucket; first/last buckets absorb early and late hours.
    const hours: [string, number, number][] = [
      ['10a', 0, 10],
      ['12p', 10, 12],
      ['2p', 12, 14],
      ['4p', 14, 16],
      ['6p', 16, 18],
      ['8p', 18, 24],
    ];
    return hours.map(([label, from, to]) => ({
      label,
      value: sum({
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), from),
        end: new Date(new Date(day.getFullYear(), day.getMonth(), day.getDate(), to).getTime() - 1),
      }),
    }));
  }

  if (filter === 'week') {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => {
      const d = addDays(range.start, i);
      return { label, value: sum({ start: startOfDay(d), end: endOfDay(d) }) };
    });
  }

  if (filter === 'month') {
    const y = range.start.getFullYear();
    const m = range.start.getMonth();
    const lastDay = range.end.getDate();
    const weeks: [string, number, number][] = [
      ['W1', 1, 7],
      ['W2', 8, 14],
      ['W3', 15, 21],
      ['W4', 22, lastDay],
    ];
    return weeks.map(([label, from, to]) => ({
      label,
      value: sum({ start: new Date(y, m, from), end: endOfDay(new Date(y, m, to)) }),
    }));
  }

  return splitIntoDaySlices(range, 6).map((slice) => ({
    label: `${slice.end.getDate()} ${shortMonth(slice.end)}`,
    value: sum(slice),
  }));
};

const mapPaymentMethod = (method: string | null | undefined): OrderRecord['paymentMethod'] => {
  const m = (method ?? '').toUpperCase();
  if (m.includes('CARD') || m.includes('VISA') || m.includes('MASTER')) return 'Card';
  if (m.includes('ONLINE') || m.includes('TRANSFER') || m.includes('BANK')) return 'Online';
  return 'Cash';
};

const mapStatus = (status: string | null): OrderRecord['status'] => {
  if (isPaidOrder(status)) return 'Paid';
  if ((status ?? '').toLowerCase() === 'refunded') return 'Refunded';
  return 'Pending';
};

const mapOrder = (o: RawOrderRow, now: Date): OrderRecord => {
  const orderNo = o.order_no || '';
  const orderNumber = orderNo.includes('-')
    ? `#${orderNo.split('-').pop()}`
    : orderNo
      ? `#${orderNo}`
      : `#${o.id.slice(0, 6)}`;

  // Only real line items are shown; nothing is invented when the POS did not sync them.
  const items: OrderItemDetail[] = (o.order_items ?? []).map((it) => {
    const quantity = toNumberOrNull(it.quantity) ?? 1;
    const unitPrice = toNumber(it.unit_price);
    const subtotal = toNumberOrNull(it.subtotal);
    return {
      id: it.id,
      name: it.product_name?.trim() || 'Unnamed item',
      quantity,
      unitPrice: Math.round(unitPrice),
      total: Math.round(subtotal ?? quantity * unitPrice),
    };
  });

  return {
    id: o.id,
    orderNumber,
    time: formatTime(o.created_at),
    date: formatDateLabel(o.created_at, now),
    paymentMethod: mapPaymentMethod(o.payments?.[0]?.method),
    itemCount: items.length,
    total: Math.round(orderTotal(o)),
    status: mapStatus(o.status),
    cashierName: o.cashier_name?.trim() || undefined,
    items,
  };
};

const fetchOrders = <T>(branchId: string, range: DateRange, columns: string) =>
  fetchAllRows<T>(() =>
    supabase
      .from('orders')
      .select(columns)
      .eq('shop_id', branchId)
      .gte('created_at', range.start.toISOString())
      .lte('created_at', range.end.toISOString())
      .order('created_at', { ascending: false })
      .order('id', { ascending: true }) as never
  );

export const salesApi = {
  /**
   * Sales stats, chart points and order list for one branch.
   * Rejects when the branch is missing, the custom range is reversed, or a
   * query fails — the UI must show an error rather than Rs 0.
   */
  getSalesData: async (
    branchId: string,
    filter: SalesFilterType,
    customRange?: CustomDateRange,
    targetDate?: Date
  ): Promise<SalesReportResponse> => {
    const shopId = requireBranchId(branchId);
    const now = new Date();
    const { current, previous } = getPeriods(filter, now, customRange, targetDate);

    const [orders, prevOrders] = await Promise.all([
      fetchOrders<RawOrderRow>(shopId, current, ORDER_COLUMNS),
      fetchOrders<RawOrderSummary>(shopId, previous, 'id, total_amount, status, created_at'),
    ]);

    const paidOrders = orders.filter((o) => isPaidOrder(o.status));
    const totalIncome = Math.round(paidOrders.reduce((s, o) => s + orderTotal(o), 0));
    const prevIncome = Math.round(
      prevOrders.filter((o) => isPaidOrder(o.status)).reduce((s, o) => s + orderTotal(o), 0)
    );
    const trend = computeTrend(totalIncome, prevIncome);

    const isToday =
      filter === 'today' &&
      (!targetDate || startOfDay(targetDate).getTime() === startOfDay(now).getTime());

    let periodDateLabel = '';
    if (filter === 'today') {
      const d = targetDate ?? now;
      if (isToday) {
        periodDateLabel = `Today, ${d.getDate()} ${shortMonth(d)}`;
      } else if (startOfDay(d).getTime() === startOfDay(addDays(now, -1)).getTime()) {
        periodDateLabel = `Yesterday, ${d.getDate()} ${shortMonth(d)}`;
      } else {
        periodDateLabel = d.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        });
      }
    } else if (filter === 'week') {
      periodDateLabel = `${current.start.getDate()} ${shortMonth(current.start)} – ${current.end.getDate()} ${shortMonth(current.end)}`;
    } else if (filter === 'month') {
      periodDateLabel = current.start.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      });
    }

    return {
      filter,
      stats: {
        totalIncome,
        trendPercentage: trend.text,
        trendPositive: trend.positive,
        orderCount: orders.length,
        avgOrderValue: paidOrders.length > 0 ? Math.round(totalIncome / paidOrders.length) : 0,
        paidCount: paidOrders.length,
        unpaidCount: orders.filter((o) => isUnpaidOrder(o.status)).length,
      },
      chartData: buildChart(filter, current, paidOrders),
      orders: orders.slice(0, MAX_LISTED_ORDERS).map((o) => mapOrder(o, now)),
      periodDateLabel,
      isToday,
    };
  },

  /** Today's headline numbers for one branch. */
  getDashboardSummary: async (branchId: string): Promise<DashboardSummary> => {
    const shopId = requireBranchId(branchId);
    const now = new Date();
    const today = { start: startOfDay(now), end: endOfDay(now) };
    const columns = 'id, total_amount, status, created_at';

    const [todayOrders, yesterdayOrders] = await Promise.all([
      fetchOrders<RawOrderSummary>(shopId, today, columns),
      fetchOrders<RawOrderSummary>(shopId, previousPeriod(today), columns),
    ]);

    const paidToday = todayOrders.filter((o) => isPaidOrder(o.status));
    const todayIncome = Math.round(paidToday.reduce((s, o) => s + orderTotal(o), 0));
    const yesterdayIncome = Math.round(
      yesterdayOrders.filter((o) => isPaidOrder(o.status)).reduce((s, o) => s + orderTotal(o), 0)
    );
    const trend = computeTrend(todayIncome, yesterdayIncome);

    return {
      todayIncome,
      trendPercentage: trend.text,
      trendPositive: trend.positive,
      ordersToday: todayOrders.length,
      unpaidCount: todayOrders.filter((o) => isUnpaidOrder(o.status)).length,
      avgOrder: paidToday.length > 0 ? Math.round(todayIncome / paidToday.length) : 0,
    };
  },
};
