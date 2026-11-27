import { supabase } from '@/lib/supabaseClient';
import type { Category } from '@/lib/types';

// Read-only: the mobile app monitors the shop; products are managed in the POS.
export const productsApi = {
  getCategories: async (branchId: string): Promise<Category[]> => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, code_prefix')
      .eq('shop_id', branchId);
    if (error) throw error;
    return data ?? [];
  },
};