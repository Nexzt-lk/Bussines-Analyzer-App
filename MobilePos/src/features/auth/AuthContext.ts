import { storage, type StoredUser } from "@/lib/storage";
import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";
import { authApi } from "./authApi";

interface AuthContextValue {
  currentUser: StoredUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Restores the session on app launch — since there's no Supabase Auth
  // token to refresh, "logged in" simply means "a user is saved locally."
  useEffect(() => {
    storage.getUser().then((user) => {
      setCurrentUser(user);
      setLoading(false);
    });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const user = await authApi.loginWithEmail(email, password);
    if (!user) return false;

    await storage.clearBranch(); // Force branch selection on each login
    await storage.setUser(user);
    setCurrentUser(user);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await storage.clearUser();
    await storage.clearBranch(); // force branch re-selection on next login too
    setCurrentUser(null);
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { currentUser, loading, login, logout } },
    children,
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
