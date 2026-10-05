import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useBranch } from '../branches/BranchContext';
import { notificationService } from './notificationService';
import { notificationStorage } from './notificationStorage';
import type {
  AppNotification,
  NotificationCategoryType,
  NotificationSettings,
} from './notificationTypes';
import { DEFAULT_NOTIFICATION_SETTINGS } from './notificationTypes';

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  settings: NotificationSettings;
  activeToast: AppNotification | null;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  dismissToast: () => void;
  updateSettings: (newSettings: Partial<NotificationSettings>) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearAll: () => Promise<void>;
  sendTestNotification: (category: NotificationCategoryType) => Promise<void>;
  trigger6PMSummaryNow: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id ?? '';

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // References to keep event callbacks fresh
  const settingsRef = useRef<NotificationSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show in-app banner toast with auto-dismiss
  const showToast = useCallback((notif: AppNotification) => {
    setActiveToast(notif);
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setActiveToast(null);
    }, 4500);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setActiveToast(null);
  }, []);

  // Initialize service, storage, and notification channels
  useEffect(() => {
    notificationService.init();
    notificationService.scheduleDaily6PMSummaryTrigger();

    notificationStorage.getSettings().then((s) => {
      setSettings(s);
    });

    notificationStorage.getNotifications().then((list) => {
      setNotifications(list);
    });
  }, []);

  // Check 6:00 PM summary periodically
  useEffect(() => {
    if (!branchId) return;

    // Check right on branch load/change
    notificationService.checkAndTrigger6PMSummary(branchId, settingsRef.current).then((notif) => {
      if (notif) {
        setNotifications((prev) => [notif, ...prev]);
        showToast(notif);
      }
    });

    // Check every 30 seconds for passing 18:00
    const interval = setInterval(() => {
      notificationService.checkAndTrigger6PMSummary(branchId, settingsRef.current).then((notif) => {
        if (notif) {
          setNotifications((prev) => [notif, ...prev]);
          showToast(notif);
        }
      });
    }, 30000);

    return () => clearInterval(interval);
  }, [branchId, showToast]);

  // Real-time Supabase listeners for Orders and Inventory
  useEffect(() => {
    if (!branchId) return;

    // 1. Orders Realtime Channel
    const ordersChannel = supabase
      .channel(`rt-orders-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `shop_id=eq.${branchId}`,
        },
        async (payload) => {
          if (!settingsRef.current.orderAlerts) return;

          // Process new orders or newly completed orders
          const newOrder = payload.new as {
            id?: string;
            order_no?: string;
            total_amount?: number | string;
            cashier_name?: string;
            status?: string;
          };

          if (!newOrder || !newOrder.id) return;

          // For UPDATE event, only notify if newly transitioned or relevant
          if (payload.eventType === 'UPDATE' && newOrder.status !== 'completed') {
            return;
          }

          const orderNo = newOrder.order_no || 'POS Order';
          const amount = Math.round(Number(newOrder.total_amount ?? 0));
          const cashier = newOrder.cashier_name || 'Terminal';

          const notif = await notificationService.dispatchNotification({
            category: 'order',
            severity: 'success',
            title: `🛒 New Order #${orderNo}`,
            body: `Rs. ${amount.toLocaleString()} received • Cashier: ${cashier}`,
            branchId,
            channelId: 'orders',
            data: {
              orderId: newOrder.id,
              orderNo,
              amount,
            },
          });

          setNotifications((prev) => [notif, ...prev]);
          showToast(notif);
        }
      )
      .subscribe();

    // 2. Inventory Realtime Channel
    const inventoryChannel = supabase
      .channel(`rt-inventory-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inventory',
          filter: `shop_id=eq.${branchId}`,
        },
        async (payload) => {
          const newInv = payload.new as {
            id?: string;
            product_id?: string;
            quantity?: number;
            min_quantity?: number;
          };

          if (!newInv || !newInv.product_id) return;

          const qty = Number(newInv.quantity ?? 0);
          const minQty = Number(newInv.min_quantity ?? 5);

          const productInfo = await notificationService.getProductInfo(newInv.product_id);
          const productName = productInfo?.name || 'Item';
          const unit = productInfo?.unit || 'pcs';

          // Check for Low Stock / Out of Stock Warning
          if (qty <= minQty) {
            if (!settingsRef.current.lowStockAlerts) return;

            const isOut = qty <= 0;
            const notif = await notificationService.dispatchNotification({
              category: 'low_stock',
              severity: isOut ? 'critical' : 'warning',
              title: isOut ? `🚨 Out of Stock: ${productName}` : `⚠️ Low Stock Warning: ${productName}`,
              body: isOut
                ? `${productName} has 0 stock remaining! Please reorder now.`
                : `${productName} is at reorder level (${qty} ${unit} left, Min: ${minQty}).`,
              branchId,
              channelId: 'low_stock',
              data: {
                productId: newInv.product_id,
                productName,
                quantity: qty,
                minQuantity: minQty,
                unit,
              },
            });

            setNotifications((prev) => [notif, ...prev]);
            showToast(notif);
          } else {
            // Regular stock update
            if (!settingsRef.current.stockUpdateAlerts) return;

            const notif = await notificationService.dispatchNotification({
              category: 'stock_update',
              severity: 'info',
              title: `📦 Stock Updated: ${productName}`,
              body: `${productName} stock count is now ${qty} ${unit}.`,
              branchId,
              channelId: 'stock_updates',
              data: {
                productId: newInv.product_id,
                productName,
                quantity: qty,
                unit,
              },
            });

            setNotifications((prev) => [notif, ...prev]);
            showToast(notif);
          }
        }
      )
      .subscribe();

    return () => {
      ordersChannel.unsubscribe();
      inventoryChannel.unsubscribe();
    };
  }, [branchId, showToast]);

  const updateSettings = async (newSettings: Partial<NotificationSettings>) => {
    const merged = { ...settings, ...newSettings };
    setSettings(merged);
    await notificationStorage.saveSettings(merged);
  };

  const markAsRead = async (id: string) => {
    const updated = await notificationStorage.markAsRead(id);
    setNotifications(updated);
  };

  const markAllAsRead = async () => {
    const updated = await notificationStorage.markAllAsRead();
    setNotifications(updated);
  };

  const clearAll = async () => {
    await notificationStorage.clearAll();
    setNotifications([]);
  };

  // Allows testing all 4 notification types manually!
  const sendTestNotification = async (category: NotificationCategoryType) => {
    let notif: AppNotification;
    switch (category) {
      case 'order':
        notif = await notificationService.dispatchNotification({
          category: 'order',
          severity: 'success',
          title: '🛒 New Order #T1-TEST-0042',
          body: 'Rs. 2,450 received • Cashier: Cashier 01',
          branchId,
          channelId: 'orders',
          data: { orderNo: 'T1-TEST-0042', amount: 2450 },
        });
        break;
      case 'stock_update':
        notif = await notificationService.dispatchNotification({
          category: 'stock_update',
          severity: 'info',
          title: '📦 Stock Updated: Chocolate Cake 1kg',
          body: 'Stock count updated to 24 pcs.',
          branchId,
          channelId: 'stock_updates',
          data: { productName: 'Chocolate Cake 1kg', quantity: 24 },
        });
        break;
      case 'low_stock':
        notif = await notificationService.dispatchNotification({
          category: 'low_stock',
          severity: 'warning',
          title: '⚠️ Low Stock Warning: Ribbon Cake 500g',
          body: 'Ribbon Cake 500g has only 3 pcs remaining! (Reorder level: 10)',
          branchId,
          channelId: 'low_stock',
          data: { productName: 'Ribbon Cake 500g', quantity: 3, minQuantity: 10 },
        });
        break;
      case 'daily_summary': {
        const res = await notificationService.checkAndTrigger6PMSummary(
          branchId,
          settingsRef.current,
          true
        );
        if (res) notif = res;
        else {
          notif = await notificationService.dispatchNotification({
            category: 'daily_summary',
            severity: 'info',
            title: '📊 Daily Sales Summary (6:00 PM)',
            body: "Today's Total: Rs. 48,250 across 34 orders (Margin: 42%).",
            branchId,
            channelId: 'daily_summary',
            data: { totalSales: 48250, totalOrders: 34, profitMargin: 42 },
          });
        }
        break;
      }
    }

    setNotifications((prev) => [notif, ...prev]);
    showToast(notif);
  };

  const trigger6PMSummaryNow = async () => {
    await sendTestNotification('daily_summary');
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        settings,
        activeToast,
        isModalOpen,
        openModal: () => setIsModalOpen(true),
        closeModal: () => setIsModalOpen(false),
        dismissToast,
        updateSettings,
        markAsRead,
        markAllAsRead,
        clearAll,
        sendTestNotification,
        trigger6PMSummaryNow,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
