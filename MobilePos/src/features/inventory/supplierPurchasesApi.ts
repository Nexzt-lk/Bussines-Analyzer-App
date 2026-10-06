import { supabase } from '@/lib/supabaseClient';
import { requireBranchId, toNumber } from '@/lib/reporting';

export interface SupplierPurchaseRecord {
  id: string;
  productName: string;
  itemCode?: string;
  supplierName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
  paymentMethod: string;
  invoiceNo?: string;
  date: string;
  time: string;
  createdAt: string;
  rawNote?: string;
}

export interface SupplierPurchasesSummary {
  totalCost: number;
  purchaseCount: number;
  totalQuantity: number;
  uniqueSuppliersCount: number;
}

export interface SupplierPurchasesResponse {
  records: SupplierPurchaseRecord[];
  summary: SupplierPurchasesSummary;
}

const shortMonth = (d: Date) => d.toLocaleDateString('en-GB', { month: 'short' });

const formatTime = (iso?: string | null): string => {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const formatDate = (iso?: string | null): string => {
  if (!iso) return 'Recent';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recent';
  return `${d.getDate()} ${shortMonth(d)} ${d.getFullYear()}`;
};

export const supplierPurchasesApi = {
  /**
   * Fetches all supplier stock purchases for the selected branch from Supabase.
   * Pulls from both `expenses` (category = 'Stock Purchase') and `sync_queue` (table = 'stock_movements').
   */
  getPurchases: async (branchId: string): Promise<SupplierPurchasesResponse> => {
    const shopId = requireBranchId(branchId);

    // 1. Fetch expenses for stock purchases
    const { data: expensesData, error: expError } = await supabase
      .from('expenses')
      .select('*')
      .eq('shop_id', shopId)
      .or('category.eq.Stock Purchase,description.ilike.%Stock Purchase%')
      .order('created_at', { ascending: false });

    if (expError) {
      console.warn('[SupplierPurchasesApi] Expenses fetch error:', expError.message);
    }

    // 2. Fetch sync_queue records for stock movements (has rich payload from POS)
    const { data: syncQueueData, error: syncError } = await supabase
      .from('sync_queue')
      .select('*')
      .eq('table_name', 'stock_movements')
      .order('created_at', { ascending: false });

    if (syncError) {
      console.warn('[SupplierPurchasesApi] SyncQueue fetch error:', syncError.message);
    }

    // 3. Fetch products mapping for product_ids in sync_queue
    const productIds = new Set<string>();
    (syncQueueData || []).forEach((row) => {
      const p = row.payload;
      if (p?.product_id) productIds.add(p.product_id);
    });

    const productsMap = new Map<string, { name: string; item_code: string; unit: string }>();
    if (productIds.size > 0) {
      const { data: prodsData } = await supabase
        .from('products')
        .select('id, name, item_code, unit')
        .in('id', Array.from(productIds));

      (prodsData || []).forEach((prod) => {
        productsMap.set(prod.id, {
          name: prod.name,
          item_code: prod.item_code,
          unit: prod.unit || 'pcs',
        });
      });
    }

    const records: SupplierPurchaseRecord[] = [];
    const processedKeys = new Set<string>();

    // Process expenses rows
    const regex = /Stock Purchase:\s*(.*?)\s*\(([\d.]+)\s*([a-zA-Z]+)?\)\s*from\s*(.*?)(?:\s*\|\s*Paid:\s*([a-zA-Z]+))?$/i;

    (expensesData || []).forEach((exp) => {
      const desc = exp.description || '';
      const match = desc.match(regex);

      let productName = 'Stock Item';
      let quantity = 1;
      let unit = 'pcs';
      let supplierName = exp.supplier_name || 'General Supplier';
      let paymentMethod = exp.payment_method || 'CASH';

      if (match) {
        productName = match[1]?.trim() || productName;
        quantity = parseFloat(match[2]) || 1;
        unit = match[3]?.trim() || unit;
        supplierName = match[4]?.trim() || supplierName;
        if (match[5]) {
          paymentMethod = match[5].trim().toUpperCase();
        }
      } else {
        // Fallback description parsing
        if (exp.category) productName = exp.description?.trim() || exp.category;
      }

      const totalCost = Math.round(toNumber(exp.amount));
      const costPerUnit = quantity > 0 ? Math.round((totalCost / quantity) * 100) / 100 : totalCost;

      const dedupeKey = `${totalCost}-${quantity}-${exp.created_at?.slice(0, 16)}`;
      processedKeys.add(dedupeKey);

      records.push({
        id: exp.id,
        productName,
        supplierName,
        quantity,
        unit,
        costPerUnit,
        totalCost,
        paymentMethod,
        invoiceNo: exp.invoice_no || undefined,
        date: formatDate(exp.created_at || exp.expense_date),
        time: formatTime(exp.created_at),
        createdAt: exp.created_at || new Date().toISOString(),
        rawNote: desc,
      });
    });

    // Process sync_queue rows (if not already captured by expense)
    (syncQueueData || []).forEach((sq) => {
      const p = sq.payload;
      if (!p || (p.type !== 'IN' && !p.total_cost && !p.supplier_name)) return;
      if (!p.total_cost || Number(p.total_cost) <= 0) return;

      const totalCost = Math.round(toNumber(p.total_cost));
      const quantity = Math.round(toNumber(p.quantity)) || 1;
      const dedupeKey = `${totalCost}-${quantity}-${(p.created_at || sq.created_at)?.slice(0, 16)}`;

      if (processedKeys.has(dedupeKey)) return; // Already present from expenses table
      processedKeys.add(dedupeKey);

      const prodInfo = p.product_id ? productsMap.get(p.product_id) : undefined;
      const productName = prodInfo?.name || 'Stock Item';
      const itemCode = prodInfo?.item_code;
      const unit = prodInfo?.unit || 'pcs';
      const supplierName = p.supplier_name || 'General Supplier';
      const paymentMethod = (p.payment_method || 'CASH').toUpperCase();
      const costPerUnit = quantity > 0 ? Math.round((totalCost / quantity) * 100) / 100 : totalCost;

      records.push({
        id: p.id || String(sq.id),
        productName,
        itemCode,
        supplierName,
        quantity,
        unit,
        costPerUnit,
        totalCost,
        paymentMethod,
        invoiceNo: p.invoice_no || undefined,
        date: formatDate(p.created_at || sq.created_at),
        time: formatTime(p.created_at || sq.created_at),
        createdAt: p.created_at || sq.created_at || new Date().toISOString(),
        rawNote: p.note || undefined,
      });
    });

    // Sort newest first
    records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Compute summary metrics
    const totalCost = records.reduce((s, r) => s + r.totalCost, 0);
    const totalQuantity = records.reduce((s, r) => s + r.quantity, 0);
    const uniqueSuppliers = new Set(records.map((r) => r.supplierName));

    return {
      records,
      summary: {
        totalCost,
        purchaseCount: records.length,
        totalQuantity,
        uniqueSuppliersCount: uniqueSuppliers.size,
      },
    };
  },
};
