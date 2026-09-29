import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { storage, type StoredBranch } from '@/lib/storage';

interface BranchContextValue {
  currentBranch: StoredBranch | null;
  loading: boolean;
  selectBranch: (branch: StoredBranch) => Promise<void>;
  clearBranch: () => Promise<void>;
}

const BranchContext = createContext<BranchContextValue | null>(null);

export function BranchProvider({ children }: { children: ReactNode }) {
  const [currentBranch, setCurrentBranch] = useState<StoredBranch | null>(null);
  const [loading, setLoading] = useState(true);

  // Remembers the last-selected branch across app restarts — avoids making
  // the owner re-pick their branch every single time they open the app.
  useEffect(() => {
    storage.getBranch().then((branch) => {
      setCurrentBranch(branch);
      setLoading(false);
    });
  }, []);

  const selectBranch = useCallback(async (branch: StoredBranch) => {
    await storage.setBranch(branch);
    setCurrentBranch(branch);
  }, []);

  const clearBranch = useCallback(async () => {
    await storage.clearBranch();
    setCurrentBranch(null);
  }, []);

  return (
    <BranchContext.Provider value={{ currentBranch, loading, selectBranch, clearBranch }}>
      {children}
    </BranchContext.Provider>
  );
}

export function useBranch() {
  const ctx = useContext(BranchContext);
  if (!ctx) throw new Error('useBranch must be used within BranchProvider');
  return ctx;
}