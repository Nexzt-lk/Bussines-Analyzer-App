import { storage, type StoredUser } from "@/lib/storage";
import { AppState } from 'react-native';
import {
    createContext,
    createElement,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { authApi } from "./authApi";

interface AuthContextValue {
  currentUser: StoredUser | null;
  loading: boolean;
  requiresDeviceUnlock: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  unlockDevice: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [requiresDeviceUnlock, setRequiresDeviceUnlock] = useState(false);
  const appState = useRef(AppState.currentState);

  // A successful password login is remembered on this device.  On a later
  // launch, it is restored but remains behind the device's own lock screen.
  useEffect(() => {
    let mounted = true;

    storage.getUser()
      .then((user) => {
        if (!mounted || !user) return;
        setCurrentUser(user);
        setRequiresDeviceUnlock(true);
      })
      .catch((err) => {
        console.warn('Could not read user from storage:', err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Also protect an already-open app after it returns from the background.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const wasBackground = appState.current === 'background';
      if (wasBackground && nextState === 'active' && currentUser) {
        setRequiresDeviceUnlock(true);
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [currentUser]);

  const login = useCallback(async (email: string, password: string) => {
    const user = await authApi.loginWithEmail(email, password);
    if (!user) return false;

    await storage.clearBranch(); // Force branch selection on each login
    await storage.setUser(user);
    setCurrentUser(user);
    setRequiresDeviceUnlock(false);
    return true;
  }, []);

  const unlockDevice = useCallback(() => {
    setRequiresDeviceUnlock(false);
  }, []);

  const logout = useCallback(async () => {
    await storage.clearUser();
    await storage.clearBranch(); // force branch re-selection on next login too
    setCurrentUser(null);
    setRequiresDeviceUnlock(false);
  }, []);

  return createElement(
    AuthContext.Provider,
    { value: { currentUser, loading, requiresDeviceUnlock, login, unlockDevice, logout } },
    children,
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
