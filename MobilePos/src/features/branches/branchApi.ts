import { supabase } from '@/lib/supabaseClient';
import type { Branch } from '@/lib/types';

export const branchesApi = {
  getActive: async (): Promise<Branch[]> => {
    const { data, error } = await supabase
      .from('shops')
      .select('id, name, branch_code')
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return data ?? [];
  },
};