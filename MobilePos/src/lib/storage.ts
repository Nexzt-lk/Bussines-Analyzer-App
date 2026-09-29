import AsyncStorage from '@react-native-async-storage/async-storage';

// Centralizes every AsyncStorage key in one place, typed, instead of
// scattering string literals across features — a single typo here would
// otherwise silently break session/branch persistence in one feature only.
const KEYS = {
  currentUser: 'mobilepos.currentUser',
  currentBranch: 'mobilepos.currentBranch',
} as const;

export interface StoredUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface StoredBranch {
  id: string;
  name: string;
  branch_code: string;
}

export const storage = {
  getUser: async (): Promise<StoredUser | null> => {
    const raw = await AsyncStorage.getItem(KEYS.currentUser);
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user: StoredUser) => AsyncStorage.setItem(KEYS.currentUser, JSON.stringify(user)),
  clearUser: () => AsyncStorage.removeItem(KEYS.currentUser),

  getBranch: async (): Promise<StoredBranch | null> => {
    const raw = await AsyncStorage.getItem(KEYS.currentBranch);
    return raw ? JSON.parse(raw) : null;
  },
  setBranch: (branch: StoredBranch) => AsyncStorage.setItem(KEYS.currentBranch, JSON.stringify(branch)),
  clearBranch: () => AsyncStorage.removeItem(KEYS.currentBranch),
};