import { supabase } from '@/lib/supabaseClient';
import {
  requireBranchId,
  toLocalYmd,
  startOfDay,
  endOfDay,
  toNumber,
} from '@/lib/reporting';

export interface CashSessionRecord {
  id: string;
  shop_id: string;
  terminal_id?: string | null;
  cashier_id?: string | null;
  cashier_name?: string | null;
  session_date?: string | null;
  opening_float: number;
  notes?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface TodayCashSessionSummary {
  hasSession: boolean;
  openingFloat: number;
  cashierName?: string;
  terminalId?: string;
  sessionDate: string;
  sessionCount: number;
  sessions: CashSessionRecord[];
}

export const cashSessionApi = {
  /**
   * Fetches today's cash session(s) for the selected branch.
   * Extracts the morning opening float, cashier name, terminal ID, and notes.
   */
  getTodaySession: async (branchId: string): Promise<TodayCashSessionSummary> => {
    const shopId = requireBranchId(branchId);
    const now = new Date();
    const todayYmd = toLocalYmd(now);
    const dayStartIso = startOfDay(now).toISOString();
    const dayEndIso = endOfDay(now).toISOString();

    const { data, error } = await supabase
      .from('cash_sessions')
      .select('id, shop_id, terminal_id, cashier_id, cashier_name, session_date, opening_float, notes, created_at, updated_at')
      .eq('shop_id', shopId)
      .or(
        `session_date.eq.${todayYmd},and(session_date.is.null,created_at.gte.${dayStartIso},created_at.lte.${dayEndIso})`
      )
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('Error fetching cash_sessions for branch:', error.message);
    }

    let records: CashSessionRecord[] = (data ?? []).map((row) => ({
      id: row.id,
      shop_id: row.shop_id,
      terminal_id: row.terminal_id,
      cashier_id: row.cashier_id,
      cashier_name: row.cashier_name,
      session_date: row.session_date,
      opening_float: toNumber(row.opening_float),
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    // Fallback: check if the latest session in the database matches today's date
    if (records.length === 0) {
      const { data: latestRows } = await supabase
        .from('cash_sessions')
        .select('id, shop_id, terminal_id, cashier_id, cashier_name, session_date, opening_float, notes, created_at, updated_at')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (latestRows && latestRows.length > 0) {
        const latest = latestRows[0];
        const sDate = latest.session_date || (latest.created_at ? toLocalYmd(new Date(latest.created_at)) : '');
        if (sDate === todayYmd) {
          records = [
            {
              id: latest.id,
              shop_id: latest.shop_id,
              terminal_id: latest.terminal_id,
              cashier_id: latest.cashier_id,
              cashier_name: latest.cashier_name,
              session_date: latest.session_date,
              opening_float: toNumber(latest.opening_float),
              notes: latest.notes,
              created_at: latest.created_at,
              updated_at: latest.updated_at,
            },
          ];
        }
      }
    }

    const totalOpeningFloat = Math.round(
      records.reduce((sum, r) => sum + r.opening_float, 0)
    );

    return {
      hasSession: records.length > 0,
      openingFloat: totalOpeningFloat,
      cashierName: records[0]?.cashier_name?.trim() || undefined,
      terminalId: records[0]?.terminal_id?.trim() || undefined,
      sessionDate: records[0]?.session_date || todayYmd,
      sessionCount: records.length,
      sessions: records,
    };
  },
};
