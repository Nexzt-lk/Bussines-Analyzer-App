export type NotificationCategoryType = 'order' | 'stock_update' | 'low_stock' | 'daily_summary';

export type NotificationSeverity = 'info' | 'warning' | 'critical' | 'success';

export interface AppNotification {
  id: string;
  category: NotificationCategoryType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  createdAt: string; // ISO string
  read: boolean;
  branchId?: string;
  data?: {
    orderId?: string;
    orderNo?: string;
    amount?: number;
    productId?: string;
    productName?: string;
    quantity?: number;
    minQuantity?: number;
    unit?: string;
    totalSales?: number;
    orderCount?: number;
    [key: string]: unknown;
  };
}

export interface NotificationSettings {
  orderAlerts: boolean;        // Send notification for every new order
  stockUpdateAlerts: boolean;  // Send notification for every stock adjustment
  lowStockAlerts: boolean;      // Send warning notification for low stock & out of stock
  dailyClosingAlerts: boolean;  // Send sales summary notification after 6:00 PM
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  orderAlerts: true,
  stockUpdateAlerts: true,
  lowStockAlerts: true,
  dailyClosingAlerts: true,
};
