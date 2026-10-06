import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import { supabase } from '@/lib/supabaseClient';
import { reportsApi } from '../reports/reportsApi';
import { notificationStorage } from './notificationStorage';
import type {
  AppNotification,
  NotificationCategoryType,
  NotificationSeverity,
  NotificationSettings,
} from './notificationTypes';

/**
 * Safe lazy loader for expo-notifications.
 * In Expo Go on Android (SDK 53+), expo-notifications throws an uncaught error at import
 * time because remote push was removed from Expo Go.
 * This helper ensures that when running inside Expo Go or on Web, it safely bypasses
 * expo-notifications so the entire application, in-app notifications, and layout
 * render cleanly without crashing.
 * When running in a Development Build or Standalone APK, native OS notifications load normally.
 */
let _cachedNotifications: typeof import('expo-notifications') | null = null;
let _triedLoadingNotifications = false;

function getNotifications(): typeof import('expo-notifications') | null {
  if (_triedLoadingNotifications) return _cachedNotifications;
  _triedLoadingNotifications = true;

  // In Expo Go or Web, do not load expo-notifications to prevent runtime crashes
  if (Platform.OS === 'web' || isRunningInExpoGo()) {
    return null;
  }

  try {
    const mod = require('expo-notifications');
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        priority: mod.AndroidNotificationPriority?.MAX ?? 'max',
      }),
    });
    _cachedNotifications = mod;
    return _cachedNotifications;
  } catch (err) {
    console.warn('[notificationService] Native notifications not available:', err);
    return null;
  }
}

// In-memory cache for product information
const productCache = new Map<string, { name: string; itemCode: string; unit: string }>();

export const notificationService = {
  /**
   * Initializes notification channels (Android) and requests permissions
   */
  init: async (): Promise<boolean> => {
    try {
      const Notifications = getNotifications();
      if (!Notifications) {
        // Expo Go or unsupported platform: in-app toast & center still active
        return true;
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (Platform.OS === 'android') {
        // Channel for Orders (MAX importance -> Heads-up popup banner + sound + lockscreen)
        await Notifications.setNotificationChannelAsync('orders', {
          name: 'Orders & Sales',
          description: 'Instant popup alerts and sound for new or completed orders',
          importance: Notifications.AndroidImportance.MAX,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 250, 250, 250],
          enableLights: true,
          lightColor: '#0D7F41',
          showBadge: true,
          bypassDnd: true,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.NOTIFICATION,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          },
        });

        // Channel for Low Stock Warnings (High urgency pop-up + sound)
        await Notifications.setNotificationChannelAsync('low_stock', {
          name: 'Low Stock & Depletion Warnings',
          description: 'Urgent alerts when items reach reorder levels or go out of stock',
          importance: Notifications.AndroidImportance.MAX,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 400, 200, 400],
          enableLights: true,
          lightColor: '#DC2626',
          showBadge: true,
          bypassDnd: true,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.NOTIFICATION,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          },
        });

        // Channel for Stock Updates
        await Notifications.setNotificationChannelAsync('stock_updates', {
          name: 'Stock Movements & Updates',
          description: 'Notifications for general stock adjustments and restocks',
          importance: Notifications.AndroidImportance.HIGH,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 200, 200, 200],
          enableLights: true,
          lightColor: '#2563EB',
          showBadge: true,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.NOTIFICATION,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          },
        });

        // Channel for 6:00 PM Daily Sales Summary
        await Notifications.setNotificationChannelAsync('daily_summary', {
          name: 'Daily 6:00 PM Sales Summary',
          description: 'Daily evening business performance summary',
          importance: Notifications.AndroidImportance.MAX,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          enableVibrate: true,
          vibrationPattern: [0, 300, 200, 300],
          enableLights: true,
          lightColor: '#0D7F41',
          showBadge: true,
          bypassDnd: true,
          audioAttributes: {
            usage: Notifications.AndroidAudioUsage.NOTIFICATION,
            contentType: Notifications.AndroidAudioContentType.SONIFICATION,
          },
        });
      }

      return finalStatus === 'granted';
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
      const Notifications = getNotifications();
      if (!Notifications) return;

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
          priority: Notifications.AndroidNotificationPriority?.MAX ?? 'max',
          color: '#0D7F41',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: 18,
          minute: 0,
          channelId: 'daily_summary',
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
      const Notifications = getNotifications();
      if (Notifications) {
        const targetChannelId = params.channelId || 'orders';
        await Notifications.scheduleNotificationAsync({
          content: {
            title: params.title,
            body: params.body,
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority?.MAX ?? 'max',
            vibrate: [0, 250, 250, 250],
            color: '#0D7F41',
            autoDismiss: true,
            data: {
              id: notification.id,
              category: params.category,
              severity: params.severity,
              ...params.data,
            },
          },
          trigger: Platform.OS === 'android' ? { channelId: targetChannelId } : null,
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
  ): Promise<{ name: string; itemCode: string; unit: string; shopId?: string } | null> => {
    if (!productId) return null;
    if (productCache.has(productId)) {
      return productCache.get(productId)!;
    }

    try {
      const { data, error } = await supabase
        .from('products')
        .select('name, item_code, unit, shop_id')
        .eq('id', productId)
        .maybeSingle();

      if (error || !data) return null;

      const info = {
        name: data.name || 'Unknown Product',
        itemCode: data.item_code || '',
        unit: data.unit || 'pcs',
        shopId: data.shop_id || '',
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
