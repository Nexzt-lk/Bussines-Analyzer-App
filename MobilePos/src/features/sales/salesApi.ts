import { supabase } from '@/lib/supabaseClient';

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
  customerName?: string;
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
}

export interface DashboardSummary {
  todayIncome: number;
  trendPercentage: string;
  trendPositive: boolean;
  ordersToday: number;
  unpaidCount: number;
  avgOrder: number;
}

const isValidUUID = (id?: string | null): boolean => {
  if (!id) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
};

const formatTime = (isoString: string): string => {
  try {
    const d = new Date(isoString);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  } catch {
    return '00:00';
  }
};

const formatDateLabel = (isoString: string, now: Date): string => {
  try {
    const d = new Date(isoString);
    const isToday =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (isToday) return 'Today';

    const yest = new Date(now);
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

interface RawOrderItem {
  id: string;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  subtotal: number | null;
}

interface RawPayment {
  id: string;
  method: string | null;
  amount: number | null;
}

interface RawOrderRow {
  id: string;
  shop_id: string;
  order_no: string | null;
  terminal_id: string | null;
  cashier_id: string | null;
  cashier_name: string | null;
  subtotal: number | null;
  discount_amount: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  status: string | null;
  note: string | null;
  created_at: string;
  order_items?: RawOrderItem[];
  payments?: RawPayment[];
}

export const salesApi = {
  /**
   * Fetches real sales data, stats, chart points, and order records directly from Supabase.
   */
  getSalesData: async (
    branchId: string,
    filter: SalesFilterType,
    customRange?: CustomDateRange
  ): Promise<SalesReportResponse> => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date;
    let prevStartDate: Date;
    let prevEndDate: Date;

    if (filter === 'today') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 1);
      prevEndDate = new Date(endDate);
      prevEndDate.setDate(prevEndDate.getDate() - 1);
    } else if (filter === 'week') {
      const dayOfWeek = now.getDay();
      const diffToMonday = (dayOfWeek + 6) % 7;
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday, 0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);

      prevStartDate = new Date(startDate);
      prevStartDate.setDate(prevStartDate.getDate() - 7);
      prevEndDate = new Date(endDate);
      prevEndDate.setDate(prevEndDate.getDate() - 7);
    } else if (filter === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else {
      // Custom date range
      const s = customRange?.startDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const e = customRange?.endDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      startDate = new Date(`${s}T00:00:00`);
      endDate = new Date(`${e}T23:59:59.999`);
      const duration = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - duration);
      prevEndDate = new Date(startDate.getTime() - 1);
    }

    try {
      // 1. Query current period orders with joined items and payments
      let currentQuery = supabase
        .from('orders')
        .select(`
          id,
          shop_id,
          order_no,
          terminal_id,
          cashier_id,
          cashier_name,
          subtotal,
          discount_amount,
          tax_amount,
          total_amount,
          status,
          note,
          created_at,
          order_items (
            id,
            product_name,
            quantity,
            unit_price,
            subtotal
          ),
          payments (
            id,
            method,
            amount
          )
        `)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (isValidUUID(branchId)) {
        currentQuery = currentQuery.eq('shop_id', branchId);
      }

      const { data: rawOrders, error: currentError } = await currentQuery;

      if (currentError) {
        console.error('Error fetching Supabase orders:', currentError);
        throw currentError;
      }

      const orders = (rawOrders as RawOrderRow[]) || [];

      // 2. Query previous period orders to calculate genuine trend percentage
      let prevQuery = supabase
        .from('orders')
        .select('id, total_amount, status')
        .gte('created_at', prevStartDate.toISOString())
        .lte('created_at', prevEndDate.toISOString());

      if (isValidUUID(branchId)) {
        prevQuery = prevQuery.eq('shop_id', branchId);
      }

      const { data: rawPrevOrders } = await prevQuery;
      const prevOrders = (rawPrevOrders as { id: string; total_amount: number | null; status: string | null }[]) || [];

      // 3. Compute Stats
      const completedOrders = orders.filter((o) => o.status === 'completed');
      const totalIncome = Math.round(
        completedOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
      );
      const orderCount = orders.length;
      const paidCount = completedOrders.length;
      const unpaidCount = orderCount - paidCount;
      const avgOrderValue = paidCount > 0 ? Math.round(totalIncome / paidCount) : 0;

      // 4. Calculate Trend Percentage
      const prevCompleted = prevOrders.filter((o) => o.status === 'completed');
      const prevIncome = Math.round(
        prevCompleted.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
      );

      let trendPercentage = '+0%';
      let trendPositive = true;

      if (prevIncome > 0) {
        const diff = totalIncome - prevIncome;
        const pct = Math.round((diff / prevIncome) * 100);
        trendPercentage = `${pct >= 0 ? '+' : ''}${pct}%`;
        trendPositive = pct >= 0;
      } else if (totalIncome > 0) {
        trendPercentage = '+100%';
        trendPositive = true;
      } else {
        trendPercentage = '0%';
        trendPositive = true;
      }

      // 5. Construct Chart Data Points according to active filter
      let chartData: ChartPoint[] = [];

      if (filter === 'today') {
        // Daily curved line chart intervals: 10a, 12p, 2p, 4p, 6p, 8p
        const buckets = [
          { label: '10a', startH: 0, endH: 10 },
          { label: '12p', startH: 10, endH: 12 },
          { label: '2p', startH: 12, endH: 14 },
          { label: '4p', startH: 14, endH: 16 },
          { label: '6p', startH: 16, endH: 18 },
          { label: '8p', startH: 18, endH: 24 },
        ];

        chartData = buckets.map((b) => {
          const sum = completedOrders
            .filter((o) => {
              const h = new Date(o.created_at).getHours();
              return h >= b.startH && h < b.endH;
            })
            .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
          return { label: b.label, value: Math.round(sum) };
        });
      } else if (filter === 'week') {
        // Weekly bar chart: Mon, Tue, Wed, Thu, Fri, Sat, Sun
        const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        chartData = dayLabels.map((label, idx) => {
          const dStart = new Date(startDate.getTime() + idx * 86400000);
          const dEnd = new Date(startDate.getTime() + (idx + 1) * 86400000 - 1);
          const sum = completedOrders
            .filter((o) => {
              const t = new Date(o.created_at).getTime();
              return t >= dStart.getTime() && t <= dEnd.getTime();
            })
            .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
          return { label, value: Math.round(sum) };
        });
      } else if (filter === 'month') {
        // Monthly bar chart: W1, W2, W3, W4
        const daysInMonth = endDate.getDate();
        const buckets = [
          { label: 'W1', startD: 1, endD: 7 },
          { label: 'W2', startD: 8, endD: 14 },
          { label: 'W3', startD: 15, endD: 21 },
          { label: 'W4', startD: 22, endD: daysInMonth },
        ];

        chartData = buckets.map((b) => {
          const sum = completedOrders
            .filter((o) => {
              const day = new Date(o.created_at).getDate();
              return day >= b.startD && day <= b.endD;
            })
            .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
          return { label: b.label, value: Math.round(sum) };
        });
      } else {
        // Custom: 6 intervals spanning the selected range
        const totalDays = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000));
        const step = Math.max(1, Math.floor(totalDays / 6));
        const points: ChartPoint[] = [];

        for (let i = 0; i < 6; i++) {
          const sliceStart = new Date(startDate.getTime() + i * step * 86400000);
          const sliceEnd =
            i === 5 ? endDate : new Date(startDate.getTime() + (i + 1) * step * 86400000 - 1);
          const label = `${sliceEnd.getDate()} ${sliceEnd.toLocaleDateString('en-GB', { month: 'short' })}`;
          const sum = completedOrders
            .filter((o) => {
              const t = new Date(o.created_at).getTime();
              return t >= sliceStart.getTime() && t <= sliceEnd.getTime();
            })
            .reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0);
          points.push({ label, value: Math.round(sum) });
        }
        chartData = points;
      }

      // 6. Map live database orders into OrderRecord format
      const mappedOrders: OrderRecord[] = orders.slice(0, 100).map((o) => {
        const rawMethod = o.payments?.[0]?.method?.toUpperCase() || 'CASH';
        const paymentMethod: 'Card' | 'Cash' | 'Online' = rawMethod.includes('CARD')
          ? 'Card'
          : rawMethod.includes('ONLINE')
            ? 'Online'
            : 'Cash';

        const orderNo = o.order_no || '';
        const shortNo = orderNo.includes('-')
          ? `#${orderNo.split('-').pop()}`
          : orderNo
            ? `#${orderNo}`
            : `#${o.id.slice(0, 6)}`;

        const items: OrderItemDetail[] =
          o.order_items && o.order_items.length > 0
            ? o.order_items.map((it) => ({
              id: it.id,
              name: it.product_name || 'Bakery Item',
              quantity: Number(it.quantity) || 1,
              unitPrice: Math.round(Number(it.unit_price) || 0),
              total: Math.round(
                Number(it.subtotal) ||
                (Number(it.quantity) || 1) * (Number(it.unit_price) || 0)
              ),
            }))
            : [
              {
                id: `${o.id}-gen`,
                name: 'Sales Item',
                quantity: 1,
                unitPrice: Math.round(Number(o.total_amount) || 0),
                total: Math.round(Number(o.total_amount) || 0),
              },
            ];

        const statusMapped: 'Paid' | 'Pending' | 'Refunded' =
          o.status === 'completed' ? 'Paid' : o.status === 'refunded' ? 'Refunded' : 'Pending';

        return {
          id: o.id,
          orderNumber: shortNo,
          time: formatTime(o.created_at),
          date: formatDateLabel(o.created_at, now),
          paymentMethod,
          itemCount: items.length,
          total: Math.round(Number(o.total_amount) || 0),
          status: statusMapped,
          customerName: o.cashier_name || o.note || 'Walk-in Guest',
          items,
        };
      });

      return {
        filter,
        stats: {
          totalIncome,
          trendPercentage,
          trendPositive,
          orderCount,
          avgOrderValue,
          paidCount,
          unpaidCount,
        },
        chartData,
        orders: mappedOrders,
      };
    } catch (err) {
      console.error('Failed to query Supabase sales data:', err);
      // Return dynamic zero-state structure (NEVER fake dummy data)
      return {
        filter,
        stats: {
          totalIncome: 0,
          trendPercentage: '0%',
          trendPositive: true,
          orderCount: 0,
          avgOrderValue: 0,
          paidCount: 0,
          unpaidCount: 0,
        },
        chartData:
          filter === 'today'
            ? [
              { label: '10a', value: 0 },
              { label: '12p', value: 0 },
              { label: '2p', value: 0 },
              { label: '4p', value: 0 },
              { label: '6p', value: 0 },
              { label: '8p', value: 0 },
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
              : filter === 'month'
                ? [
                  { label: 'W1', value: 0 },
                  { label: 'W2', value: 0 },
                  { label: 'W3', value: 0 },
                  { label: 'W4', value: 0 },
                ]
                : [
                  { label: 'P1', value: 0 },
                  { label: 'P2', value: 0 },
                  { label: 'P3', value: 0 },
                  { label: 'P4', value: 0 },
                  { label: 'P5', value: 0 },
                  { label: 'P6', value: 0 },
                ],
        orders: [],
      };
    }
  },

  /**
   * Helper for Dashboard home screen to display real today stats from Supabase
   */
  getDashboardSummary: async (branchId: string): Promise<DashboardSummary> => {
    try {
      const now = new Date();
      const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const endToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      const startYesterday = new Date(startToday);
      startYesterday.setDate(startYesterday.getDate() - 1);
      const endYesterday = new Date(endToday);
      endYesterday.setDate(endYesterday.getDate() - 1);

      let qToday = supabase
        .from('orders')
        .select('id, total_amount, status')
        .gte('created_at', startToday.toISOString())
        .lte('created_at', endToday.toISOString());

      if (isValidUUID(branchId)) {
        qToday = qToday.eq('shop_id', branchId);
      }

      const { data: todayOrders } = await qToday;

      let qYesterday = supabase
        .from('orders')
        .select('id, total_amount, status')
        .gte('created_at', startYesterday.toISOString())
        .lte('created_at', endYesterday.toISOString());

      if (isValidUUID(branchId)) {
        qYesterday = qYesterday.eq('shop_id', branchId);
      }

      const { data: yestOrders } = await qYesterday;

      const tOrders = todayOrders || [];
      const yOrders = yestOrders || [];

      const todayCompleted = tOrders.filter((o) => o.status === 'completed');
      const todayIncome = Math.round(
        todayCompleted.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
      );

      const yestCompleted = yOrders.filter((o) => o.status === 'completed');
      const yestIncome = Math.round(
        yestCompleted.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0)
      );

      let trendPercentage = '+0%';
      let trendPositive = true;

      if (yestIncome > 0) {
        const diff = todayIncome - yestIncome;
        const pct = Math.round((diff / yestIncome) * 100);
        trendPercentage = `${pct >= 0 ? '+' : ''}${pct}%`;
        trendPositive = pct >= 0;
      } else if (todayIncome > 0) {
        trendPercentage = '+100%';
        trendPositive = true;
      }

      const ordersToday = tOrders.length;
      const unpaidCount = tOrders.filter((o) => o.status !== 'completed').length;
      const avgOrder = todayCompleted.length > 0 ? Math.round(todayIncome / todayCompleted.length) : 0;

      return {
        todayIncome,
        trendPercentage,
        trendPositive,
        ordersToday,
        unpaidCount,
        avgOrder,
      };
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
      return {
        todayIncome: 0,
        trendPercentage: '0%',
        trendPositive: true,
        ordersToday: 0,
        unpaidCount: 0,
        avgOrder: 0,
      };
    }
  },
};
