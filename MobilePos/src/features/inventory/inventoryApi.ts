import { supabase } from '@/lib/supabaseClient';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { escapeLike, requireBranchId, toNumber } from '@/lib/reporting';
import type { InventoryRow } from '@/lib/types';

export interface InventoryStats {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
}

export type InventoryStockFilter = 'all' | 'low' | 'out';

/** Out of stock: nothing left (or oversold). */
export const isOutOfStock = (row: Pick<InventoryRow, 'quantity'>) => toNumber(row.quantity) <= 0;

/** Low stock: some left, at or below the reorder level. */
export const isLowStock = (row: Pick<InventoryRow, 'quantity' | 'min_quantity'>) => {
  const q = toNumber(row.quantity);
  return q > 0 && q <= toNumber(row.min_quantity);
};

export const inventoryApi = {
  /** Counts for total products, low stock and out of stock. Rejects on error. */
  getStats: async (branchId: string): Promise<InventoryStats> => {
    const shopId = requireBranchId(branchId);
    const rows = await fetchAllRows<Pick<InventoryRow, 'quantity' | 'min_quantity'>>(() =>
      supabase
        .from('inventory')
        .select('quantity, min_quantity, products!inner(shop_id)')
        .eq('products.shop_id', shopId)
        .order('quantity', { ascending: true }) as never
    );

    return {
      totalProducts: rows.length,
      lowStock: rows.filter(isLowStock).length,
      outOfStock: rows.filter(isOutOfStock).length,
    };
  },

  /**
   * Every inventory row for the branch matching the search/category/stock
   * filters, lowest quantity first. The search term is matched literally.
   */
  search: async (
    branchId: string,
    searchTerm: string,
    stockFilter: InventoryStockFilter = 'all',
    categoryId?: string
  ): Promise<InventoryRow[]> => {
    const shopId = requireBranchId(branchId);
    const term = searchTerm.trim();

    const rows = await fetchAllRows<InventoryRow>(() => {
      let query = supabase
        .from('inventory')
        .select('quantity, min_quantity, products!inner(name, item_code, unit, shop_id, category_id)')
        .eq('products.shop_id', shopId);

      if (term) {
        query = query.ilike('products.name', `%${escapeLike(term)}%`);
      }
      if (categoryId && categoryId !== 'all') {
        query = query.eq('products.category_id', categoryId);
      }
      if (stockFilter === 'out') {
        query = query.lte('quantity', 0);
      } else if (stockFilter === 'low') {
        // "≤ min_quantity" compares two columns, which PostgREST cannot do;
        // narrow to in-stock rows here and finish the check below.
        query = query.gt('quantity', 0);
      }
      return query.order('quantity', { ascending: true }) as never;
    });

    return stockFilter === 'low' ? rows.filter(isLowStock) : rows;
  },
};
