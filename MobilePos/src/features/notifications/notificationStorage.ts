import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  type AppNotification,
  type NotificationSettings,
  DEFAULT_NOTIFICATION_SETTINGS,
} from './notificationTypes';

const STORAGE_KEYS = {
  settings: 'mobilepos.notifications.settings',
  items: 'mobilepos.notifications.items',
  lastSummaryDate: 'mobilepos.notifications.lastSummaryDate',
} as const;

const MAX_STORED_NOTIFICATIONS = 100;

export const notificationStorage = {
  getSettings: async (): Promise<NotificationSettings> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.settings);
      if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_NOTIFICATION_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }
  },

  saveSettings: async (settings: NotificationSettings): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save notification settings:', e);
    }
  },

  getNotifications: async (): Promise<AppNotification[]> => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.items);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  saveNotifications: async (items: AppNotification[]): Promise<void> => {
    try {
      const trimmed = items.slice(0, MAX_STORED_NOTIFICATIONS);
      await AsyncStorage.setItem(STORAGE_KEYS.items, JSON.stringify(trimmed));
    } catch (e) {
      console.error('Failed to save notifications:', e);
    }
  },

  addNotification: async (item: AppNotification): Promise<AppNotification[]> => {
    try {
      const current = await notificationStorage.getNotifications();
      // Avoid duplicate IDs
      const filtered = current.filter((n) => n.id !== item.id);
      const updated = [item, ...filtered].slice(0, MAX_STORED_NOTIFICATIONS);
      await AsyncStorage.setItem(STORAGE_KEYS.items, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Failed to add notification:', e);
      return [];
    }
  },

  markAllAsRead: async (): Promise<AppNotification[]> => {
    try {
      const current = await notificationStorage.getNotifications();
      const updated = current.map((n) => ({ ...n, read: true }));
      await AsyncStorage.setItem(STORAGE_KEYS.items, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Failed to mark all as read:', e);
      return [];
    }
  },

  markAsRead: async (id: string): Promise<AppNotification[]> => {
    try {
      const current = await notificationStorage.getNotifications();
      const updated = current.map((n) => (n.id === id ? { ...n, read: true } : n));
      await AsyncStorage.setItem(STORAGE_KEYS.items, JSON.stringify(updated));
      return updated;
    } catch (e) {
      console.error('Failed to mark notification as read:', e);
      return [];
    }
  },

  clearAll: async (): Promise<void> => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.items);
    } catch (e) {
      console.error('Failed to clear notifications:', e);
    }
  },

  getLastSummaryDate: async (): Promise<string | null> => {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.lastSummaryDate);
    } catch {
      return null;
    }
  },

  setLastSummaryDate: async (dateStr: string): Promise<void> => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.lastSummaryDate, dateStr);
    } catch (e) {
      console.error('Failed to set last summary date:', e);
    }
  },
};
