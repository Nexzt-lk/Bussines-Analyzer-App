import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '@/lib/supabaseClient';
import { reportsApi } from '../reports/reportsApi';
import { notificationStorage } from './notificationStorage';
import type {
  AppNotification,
  NotificationCategoryType,
  NotificationSeverity,
  NotificationSettings,
} from './notificationTypes';

// Configure how notifications are displayed when the app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// In-memory cache for product information
const productCache = new Map<string, { name: string; itemCode: string; unit: string }>();

export const notificationService = {
  /**
   * Initializes notification channels (Android) and requests permissions
   */
  init: async (): Promise<boolean> => {
    try {
      if (Platform.OS !== 'web') {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        if (Platform.OS === 'android') {
          // Channel for Orders
          await Notifications.setNotificationChannelAsync('orders', {
            name: 'Orders',
            description: 'Notifications for every order placed or completed',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#0D7F41',
            sound: 'default',
          });

          // Channel for Low Stock Warnings
          await Notifications.setNotificationChannelAsync('low_stock', {
            name: 'Low Stock Warnings',
            description: 'Warnings when products hit low stock or go out of stock',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 500, 200, 500],
            lightColor: '#DC2626',
            sound: 'default',
          });

          // Channel for Stock Updates
          await Notifications.setNotificationChannelAsync('stock_updates', {
            name: 'Stock Updates',
            description: 'Notifications for general stock adjustments',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 200, 200, 200],
            lightColor: '#2563EB',
            sound: 'default',
          });

          // Channel for 6:00 PM Daily Sales Summary
          await Notifications.setNotificationChannelAsync('daily_summary', {
            name: 'Daily Sales Summary',
            description: 'Daily closing sales recap after 6:00 PM',
            importance: Notifications.AndroidImportance.HIGH,
            lightColor: '#10B981',
            sound: 'default',
          });
        }

        return finalStatus === 'granted';
      }
      return true;
    } catch (e) {
      console.warn('Failed to initialize notifications:', e);
      return false;
    }
  },

  /**
   * Schedules a daily 6:00 PM notification on the OS level
   */
  scheduleDaily6PMSummaryTrigger: async (): Promise<void> => {
    try {
      if (Platform.OS === 'web') return;

      // Cancel existing summary notifications to avoid duplicates
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const req of scheduled) {
        if (req.content.data?.type === 'daily_summary') {
          await Notifications.cancelScheduledNotificationAsync(req.identifier);
        }
      }

      // Schedule at 18:00 (6:00 PM) daily
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📊 Daily Sales Summary (6:00 PM)',
          body: "It's 6:00 PM! Check today's sales summary and performance metrics.",
          data: { type: 'daily_summary' },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 18,
          minute: 0,
        },
      });
    } catch (e) {
      console.warn('Could not schedule 6 PM daily summary trigger:', e);
    }
  },

  /**
   * Dispatches a local native notification immediately and records it
   */
  dispatchNotification: async (params: {
    category: NotificationCategoryType;
    severity: NotificationSeverity;
    title: string;
    body: string;
    branchId?: string;
    channelId?: 'orders' | 'low_stock' | 'stock_updates' | 'daily_summary';
    data?: Record<string, unknown>;
  }): Promise<AppNotification> => {
    const notification: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      category: params.category,
      severity: params.severity,
      title: params.title,
      body: params.body,
      createdAt: new Date().toISOString(),
      read: false,
      branchId: params.branchId,
      data: params.data,
    };

    // Save to persistent storage
    await notificationStorage.addNotification(notification);

    // Present OS-level native notification
    try {
      if (Platform.OS !== 'web') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: params.title,
            body: params.body,
            sound: 'default',
            data: {
              id: notification.id,
              category: params.category,
              severity: params.severity,
              ...params.data,
            },
          },
          trigger: null, // Send immediately
        });
      }
    } catch (e) {
      console.warn('Error displaying OS notification:', e);
    }

    return notification;
  },

  /**
   * Helper to look up product info by ID
   */
  getProductInfo: async (
    productId: string
  ): Promise<{ name: string; itemCode: string; unit: string } | null> => {
    if (!productId) return null;
    if (productCache.has(productId)) {
      return productCache.get(productId)!;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('name, item_code, unit')
        .eq('id', productId)
        .maybeSingle();

      if (error || !data) return null;

      const info = {
        name: data.name || 'Unknown Product',
        itemCode: data.item_code || '',
        unit: data.unit || 'pcs',
      };
      productCache.set(productId, info);
      return info;
    } catch {
      return null;
    }
  },

  /**
   * Evaluates and dispatches the 6:00 PM sales summary if conditions are met
   */
  checkAndTrigger6PMSummary: async (
    branchId: string,
    settings: NotificationSettings,
    force = false
  ): Promise<AppNotification | null> => {
    if (!branchId) return null;
    if (!settings.dailyClosingAlerts && !force) return null;

    const now = new Date();
    const currentHour = now.getHours();
    const todayKey = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // Must be after 6 PM (18:00) unless forced
    if (!force && currentHour < 18) {
      return null;
    }

    // Check if already sent today
    const lastDate = await notificationStorage.getLastSummaryDate();
    if (!force && lastDate === todayKey) {
      return null;
    }

    try {
      const report = await reportsApi.getReportData(branchId, 'today');
      const totalSales = Math.round(report?.stats?.totalSales ?? 0);
      const totalOrders = report?.stats?.totalOrders ?? 0;
      const profitMargin = report?.stats?.profitMargin ?? 0;

      const title = '📊 Daily Sales Summary (6:00 PM)';
      const body =
        totalOrders > 0
          ? `Today's Total: Rs. ${totalSales.toLocaleString()} across ${totalOrders} orders (Margin: ${profitMargin}%).`
          : "No orders recorded yet today before 6:00 PM.";

      const notif = await notificationService.dispatchNotification({
        category: 'daily_summary',
        severity: 'info',
        title,
        body,
        branchId,
        channelId: 'daily_summary',
        data: {
          totalSales,
          totalOrders,
          profitMargin,
        },
      });

      await notificationStorage.setLastSummaryDate(todayKey);
      return notif;
    } catch (e) {
      console.error('Failed to trigger daily sales summary:', e);
      return null;
    }
  },
};
