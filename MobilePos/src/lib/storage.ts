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

// Reads a JSON value; a corrupted entry is removed and treated as missing so
// a bad write can never leave the app stuck on the launch spinner.
const readJson = async <T>(key: string): Promise<T | null> => {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    await AsyncStorage.removeItem(key);
    return null;
  }
};

export const storage = {
  getUser: () => readJson<StoredUser>(KEYS.currentUser),
  setUser: (user: StoredUser) => AsyncStorage.setItem(KEYS.currentUser, JSON.stringify(user)),
  clearUser: () => AsyncStorage.removeItem(KEYS.currentUser),

  getBranch: () => readJson<StoredBranch>(KEYS.currentBranch),
  setBranch: (branch: StoredBranch) => AsyncStorage.setItem(KEYS.currentBranch, JSON.stringify(branch)),
  clearBranch: () => AsyncStorage.removeItem(KEYS.currentBranch),
};