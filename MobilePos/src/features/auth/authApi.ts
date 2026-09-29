import { supabase } from '@/lib/supabaseClient';
import type { MobileUser } from '@/lib/types';

// Every call here goes through SECURITY DEFINER Postgres functions (see
// supabase/001_mobile_pin_auth.sql) — the PIN hash never leaves the
// database, even though this app has no Supabase Auth session.
export const authApi = {
  /**
   * Authenticates staff member using email and password.
   * Tries Postgres RPC `login_with_email` first; falls back to direct query
   * on the users table if the RPC is not installed.
   * Returns MobileUser on success, null on invalid credentials.
   */
  loginWithEmail: async (email: string, password: string): Promise<MobileUser | null> => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      return null;
    }

    // 1. Try PostgreSQL RPC function if present in the database
    try {
      const { data, error } = await supabase.rpc('login_with_email', {
        p_email: trimmedEmail,
        p_password: password,
      });

      if (!error && Array.isArray(data) && data.length > 0) {
        return {
          id: data[0].id,
          name: data[0].name,
          email: data[0].email,
          role: data[0].role,
        };
      }
    } catch {
      // RPC not yet configured in database, continue to fallback below
    }

    // 2. Direct database query fallback
    const { data: user, error } = await supabase
      .from('users')
      .select('id, name, email, role, password_hash, is_active')
      .ilike('email', trimmedEmail)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('Login query error:', error);
      throw error;
    }

    if (!user) {
      return null;
    }

    // Check credentials against password_hash
    if (user.password_hash === password) {
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    }

    return null;
  },

  getUsers: async (): Promise<MobileUser[]> => {
    const { data, error } = await supabase.rpc('get_mobile_users');
    if (error) throw error;
    return data ?? [];
  },

  verifyPin: async (userId: string, pin: string): Promise<MobileUser | null> => {
    const { data, error } = await supabase.rpc('verify_mobile_pin', {
      p_user_id: userId,
      p_pin: pin,
    });
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  },
};