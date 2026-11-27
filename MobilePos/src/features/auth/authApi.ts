import { supabase } from '@/lib/supabaseClient';
import type { MobileUser } from '@/lib/types';

/** Thrown while the database has locked a login after repeated failures. */
export class LoginLockedError extends Error {
  constructor() {
    super('Too many failed sign-in attempts. Try again in 15 minutes.');
    this.name = 'LoginLockedError';
  }
}

// Every call here goes through SECURITY DEFINER Postgres functions (see
// superbase/002_secure_mobile_login.sql). Passwords are verified inside the
// database; the app never reads the users table or any password hash.
export const authApi = {
  /**
   * Signs a staff member in with their email or name and password.
   * Resolves to the user on success, null on wrong credentials.
   * Rejects with LoginLockedError when locked out, or with the Supabase
   * error on network/server problems.
   */
  loginWithEmail: async (login: string, password: string): Promise<MobileUser | null> => {
    const trimmedLogin = login.trim();
    if (!trimmedLogin || !password.trim()) {
      return null;
    }

    const { data, error } = await supabase.rpc('login_with_email', {
      p_email: trimmedLogin,
      p_password: password,
    });

    if (error) {
      if (String(error.message).includes('TOO_MANY_ATTEMPTS')) {
        throw new LoginLockedError();
      }
      throw error;
    }

    if (!Array.isArray(data) || data.length !== 1) {
      return null;
    }

    const [row] = data;
    return { id: row.id, name: row.name, email: row.email, role: row.role };
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
