import { supabase } from '@/lib/supabaseClient';
import type { Category } from '@/lib/types';

export interface NewProductInput {
  shop_id: string;
  category_id: string;
  name: string;
  price: number;
  barcode: string | null;
}

export const productsApi = {
  getCategories: async (branchId: string): Promise<Category[]> => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name, code_prefix')
      .eq('shop_id', branchId);
    if (error) throw error;
    return data ?? [];
  },

  // Calls the shared Postgres function — never reimplemented in JS/TS.
  // See supabase/002_item_code_and_sales_report.sql.
  generateItemCode: async (categoryId: string): Promise<string> => {
    const { data, error } = await supabase.rpc('generate_item_code', { p_category_id: categoryId });
    if (error) throw error;
    return data as string;
  },

  create: async (product: NewProductInput & { item_code: string }) => {
    const { error } = await supabase.from('products').insert({ ...product, is_active: true });
    if (error) throw error;
  },
};