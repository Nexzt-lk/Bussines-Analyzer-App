

export interface MobileUser {
  id: string;
  name: string;
  email?: string;
  role?: string;
}

export interface Branch {
  id: string;
  name: string;
  branch_code: string;
}

export interface Category {
  id: string;
  name: string;
  code_prefix: string;
}

export interface SalesReportRow {
  period_start: string; // ISO date
  order_count: number;
  total_income: number;
}

export type SalesPeriod = 'day' | 'week' | 'month';

export interface InventoryRow {
  quantity: number;
  min_quantity: number;
  products: {
    name: string;
    item_code: string;
    unit: string;
    shop_id: string;
    category_id?: string;
  };
}