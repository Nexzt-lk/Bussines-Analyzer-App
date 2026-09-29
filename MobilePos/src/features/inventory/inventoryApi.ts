import { supabase } from '@/lib/supabaseClient';
import type { InventoryRow } from '@/lib/types';

export const inventoryApi = {
  // One JOIN query (products!inner) — not N+1. Limited to 100 rows;
  // a searchable, paginated list would be the next step past that scale.
  search: async (branchId: string, searchTerm: string): Promise<InventoryRow[]> => {
    let query = supabase
      .from('inventory')
      .select('quantity, min_quantity, products!inner(name, item_code, unit, shop_id)')
      .eq('products.shop_id', branchId)
      .order('quantity', { ascending: true })
      .limit(100);

    if (searchTerm) {
      query = query.ilike('products.name', `%${searchTerm}%`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data as unknown as InventoryRow[]) ?? [];
  },
};