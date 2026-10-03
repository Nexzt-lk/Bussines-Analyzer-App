import { supabase } from '@/lib/supabaseClient';
import type { InventoryRow } from '@/lib/types';

export interface InventoryStats {
  totalProducts: number;
  lowStock: number;
  outOfStock: number;
}

export type InventoryStockFilter = 'all' | 'low' | 'out';

export const inventoryApi = {
  // Aggregate counts for total products, low stock, and out of stock
  getStats: async (branchId: string): Promise<InventoryStats> => {
    const { data, error } = await supabase
      .from('inventory')
      .select('quantity, min_quantity, products!inner(shop_id)')
      .eq('products.shop_id', branchId);

    if (error) {
      console.warn('Error fetching inventory stats:', error);
      return { totalProducts: 0, lowStock: 0, outOfStock: 0 };
    }

    const rows = data ?? [];
    let outOfStock = 0;
    let lowStock = 0;

    for (const r of rows) {
      const q = Number(r.quantity) || 0;
      const m = Number(r.min_quantity) || 0;
      if (q <= 0) {
        outOfStock++;
      } else if (q <= m) {
        lowStock++;
      }
    }

    return {
      totalProducts: rows.length,
      lowStock,
      outOfStock,
    };
  },

  // One JOIN query (products!inner) with search and stock status filtering
  search: async (
    branchId: string,
    searchTerm: string,
    stockFilter?: InventoryStockFilter,
    categoryId?: string
  ): Promise<InventoryRow[]> => {
    let query = supabase
      .from('inventory')
      .select('quantity, min_quantity, products!inner(name, item_code, unit, shop_id, category_id)')
      .eq('products.shop_id', branchId)
      .order('quantity', { ascending: true })
      .limit(100);

    if (searchTerm) {
      query = query.ilike('products.name', `%${searchTerm}%`);
    }

    if (categoryId && categoryId !== 'all') {
      query = query.eq('products.category_id', categoryId);
    }

    if (stockFilter === 'out') {
      query = query.lte('quantity', 0);
    }

    const { data, error } = await query;
    if (error) throw error;
    let results = (data as unknown as InventoryRow[]) ?? [];

    if (stockFilter === 'low') {
      results = results.filter((i) => (Number(i.quantity) || 0) > 0 && (Number(i.quantity) || 0) <= (Number(i.min_quantity) || 0));
    }

    return results;
  },
};