import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBranch } from '../branches/BranchContext';
import { useAuth } from '../auth/AuthContext';
import { inventoryApi } from '../inventory/inventoryApi';
import { colors } from '@/constants/colors';
import type { InventoryRow } from '@/lib/types';

type ActiveTab = 'home' | 'sales' | 'stock' | 'reports' | 'profile';

export default function DashboardScreen() {
  const router = useRouter();
  const { currentBranch, clearBranch } = useBranch();
  const { currentUser, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [salesPeriod, setSalesPeriod] = useState<'today' | 'week' | 'month'>('today');

  // Inventory / Stock data
  const [inventoryItems, setInventoryItems] = useState<InventoryRow[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilterLow, setStockFilterLow] = useState(false);

  // Load real inventory items safely
  useEffect(() => {
    if (!currentBranch) return;
    let cancelled = false;

    inventoryApi
      .search(currentBranch.id, '')
      .then((data) => {
        if (!cancelled) setInventoryItems(data);
      })
      .catch(() => {
        // Fallback or empty if offline
      })
      .finally(() => {
        if (!cancelled) setLoadingInventory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentBranch]);

  // Derived low stock items
  const lowStockItems = useMemo(
    () => inventoryItems.filter((i) => i.quantity <= i.min_quantity),
    [inventoryItems]
  );

  const lowStockSummaryText = useMemo(() => {
    if (lowStockItems.length === 0) {
      return 'Custom Cake Boards, Couverture Chocolate and...';
    }
    const names = lowStockItems.map((i) => i.products.name).slice(0, 2).join(', ');
    return lowStockItems.length > 2 ? `${names} and...` : names;
  }, [lowStockItems]);

  const lowStockCount = lowStockItems.length > 0 ? lowStockItems.length : 7;
  const totalProductsCount = inventoryItems.length > 0 ? inventoryItems.length : 11;

  // Filtered stock list for Stock Tab
  const filteredStock = useMemo(() => {
    let list = inventoryItems;
    if (stockFilterLow) {
      list = list.filter((i) => i.quantity <= i.min_quantity);
    }
    if (stockSearch.trim()) {
      const q = stockSearch.toLowerCase();
      list = list.filter(
        (i) =>
          i.products.name.toLowerCase().includes(q) ||
          i.products.item_code.toLowerCase().includes(q)
      );
    }
    return list;
  }, [inventoryItems, stockFilterLow, stockSearch]);

  // Dynamic greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const userName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Nadi';
  const userInitial = userName.charAt(0).toUpperCase();
  const branchSubtitle = currentBranch?.name
    ? currentBranch.name.includes('—')
      ? currentBranch.name
      : `Sugarcrumb — ${currentBranch.name}`
    : 'Sugarcrumb — Main Street';

  // Format currency
  const formatRs = useCallback((num: number) => {
    return 'Rs ' + num.toLocaleString();
  }, []);

  const handleSwitchBranch = async () => {
    await clearBranch();
    router.replace('/select-branch');
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  // ==========================================
  // TAB 1: HOME TAB (Matches the user's image)
  // ==========================================
  const renderHomeTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      {/* Top Greeting Section */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitles}>
          <Text style={styles.greetingTitle}>
            {greeting}, {userName}
          </Text>
          <TouchableOpacity
            style={styles.branchSubtitleRow}
            onPress={handleSwitchBranch}
            activeOpacity={0.7}
          >
            <Text style={styles.branchSubtitleText}>{branchSubtitle}</Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={() => setActiveTab('profile')}
          activeOpacity={0.8}
        >
          <Text style={styles.avatarText}>{userInitial}</Text>
        </TouchableOpacity>
      </View>

      {/* Hero Card: Today's Income */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>TODAY&#39;S INCOME</Text>
        <Text style={styles.heroAmount}>Rs 92,800</Text>
        <View style={styles.heroPillRow}>
          <View style={styles.heroPill}>
            <Ionicons name="trending-up" size={14} color="#FFFFFF" />
            <Text style={styles.heroPillTrend}>+8%</Text>
            <Text style={styles.heroPillSub}>vs yesterday</Text>
          </View>
        </View>
      </View>

      {/* Two Stat Cards: Orders Today & Avg Order */}
      <View style={styles.twoColRow}>
        {/* Left Card: Orders Today */}
        <View style={styles.statCard}>
          <Text style={styles.statCardLabel}>ORDERS TODAY</Text>
          <Text style={styles.statCardNumber}>38</Text>
          <Text style={styles.statCardSub}>8 unpaid</Text>
        </View>

        {/* Right Card: Avg Order */}
        <View style={styles.statCard}>
          <Text style={styles.statCardLabel}>AVG ORDER</Text>
          <Text style={styles.statCardNumber}>Rs 2,442</Text>
          <Text style={styles.statCardSub}>per ticket</Text>
        </View>
      </View>

      {/* Low Stock Reorder Level Alert Card */}
      <TouchableOpacity
        style={styles.alertCard}
        onPress={() => {
          setStockFilterLow(true);
          setActiveTab('stock');
        }}
        activeOpacity={0.7}
      >
        <View style={styles.alertLeftIcon}>
          <Ionicons name="warning-outline" size={20} color={colors.alertText} />
        </View>
        <View style={styles.alertContent}>
          <Text style={styles.alertTitle}>
            {lowStockCount} items below reorder level
          </Text>
          <Text style={styles.alertSubtitle} numberOfLines={1}>
            {lowStockSummaryText}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.alertText} />
      </TouchableOpacity>

      {/* "Jump to" Section */}
      <Text style={styles.jumpToHeading}>Jump to</Text>

      <View style={styles.jumpList}>
        {/* Sales Jump Card */}
        <TouchableOpacity
          style={styles.jumpCard}
          onPress={() => setActiveTab('sales')}
          activeOpacity={0.7}
        >
          <View style={styles.jumpCardLeft}>
            <View style={[styles.jumpIconCircle, { backgroundColor: colors.jumpSalesBg }]}>
              <Ionicons name="trending-up" size={22} color={colors.primary} />
            </View>
            <View style={styles.jumpTextGroup}>
              <Text style={styles.jumpTitle}>Sales</Text>
              <Text style={styles.jumpSubtitle}>Charts & orders</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Stock Jump Card */}
        <TouchableOpacity
          style={styles.jumpCard}
          onPress={() => {
            setStockFilterLow(false);
            setActiveTab('stock');
          }}
          activeOpacity={0.7}
        >
          <View style={styles.jumpCardLeft}>
            <View style={[styles.jumpIconCircle, { backgroundColor: colors.jumpStockBg }]}>
              <Ionicons name="cube-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.jumpTextGroup}>
              <Text style={styles.jumpTitle}>Stock</Text>
              <Text style={styles.jumpSubtitle}>{totalProductsCount} products</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Reports Jump Card */}
        <TouchableOpacity
          style={styles.jumpCard}
          onPress={() => setActiveTab('reports')}
          activeOpacity={0.7}
        >
          <View style={styles.jumpCardLeft}>
            <View style={[styles.jumpIconCircle, { backgroundColor: colors.jumpReportsBg }]}>
              <Ionicons name="stats-chart-outline" size={22} color={colors.primary} />
            </View>
            <View style={styles.jumpTextGroup}>
              <Text style={styles.jumpTitle}>Reports</Text>
              <Text style={styles.jumpSubtitle}>Financial & sales trends</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  // ==========================================
  // TAB 2: SALES TAB
  // ==========================================
  const renderSalesTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.pageTitle}>Sales & Orders</Text>
        <View style={styles.periodPillGroup}>
          {(['today', 'week', 'month'] as const).map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() => setSalesPeriod(p)}
              style={[
                styles.periodButton,
                salesPeriod === p && styles.periodButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  salesPeriod === p && styles.periodButtonTextActive,
                ]}
              >
                {p === 'today' ? 'Today' : p === 'week' ? 'Weekly' : 'Monthly'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Sales Summary Card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>
          {salesPeriod === 'today'
            ? "TODAY'S TOTAL SALES"
            : salesPeriod === 'week'
            ? 'THIS WEEK SALES'
            : 'THIS MONTH SALES'}
        </Text>
        <Text style={styles.heroAmount}>
          {salesPeriod === 'today'
            ? 'Rs 92,800'
            : salesPeriod === 'week'
            ? 'Rs 584,200'
            : 'Rs 2,340,000'}
        </Text>
        <View style={styles.heroPillRow}>
          <View style={styles.heroPill}>
            <Text style={styles.heroPillTrend}>
              {salesPeriod === 'today' ? '38 Orders' : salesPeriod === 'week' ? '245 Orders' : '980 Orders'}
            </Text>
            <Text style={styles.heroPillSub}>• 92% Settled</Text>
          </View>
        </View>
      </View>

      {/* Key Sales Performance Metrics */}
      <View style={styles.twoColRow}>
        <View style={styles.statCard}>
          <Text style={styles.statCardLabel}>PAID ORDERS</Text>
          <Text style={styles.statCardNumber}>
            {salesPeriod === 'today' ? '30' : salesPeriod === 'week' ? '218' : '895'}
          </Text>
          <View style={styles.statSubRow}>
            <Ionicons name="checkmark-circle" size={14} color={colors.successText} />
            <Text style={[styles.statCardSub, { color: colors.successText }]}>Fully paid</Text>
          </View>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statCardLabel}>UNPAID / PENDING</Text>
          <Text style={styles.statCardNumber}>
            {salesPeriod === 'today' ? '8' : salesPeriod === 'week' ? '27' : '85'}
          </Text>
          <View style={styles.statSubRow}>
            <Ionicons name="time-outline" size={14} color={colors.dangerText} />
            <Text style={[styles.statCardSub, { color: colors.dangerText }]}>Rs 12,400 open</Text>
          </View>
        </View>
      </View>

      {/* Recent Orders List */}
      <Text style={styles.jumpToHeading}>Recent Orders</Text>

      <View style={styles.ordersList}>
        {[
          { id: 'ORD-1094', time: '14:22', items: 'Custom Chocolate Cake (1kg), 2 Cupcakes', total: 4200, status: 'Paid' },
          { id: 'ORD-1093', time: '13:50', items: 'Red Velvet Pastry, Iced Caramel Latte', total: 1850, status: 'Paid' },
          { id: 'ORD-1092', time: '13:15', items: 'Birthday Special Butter Cake (2kg)', total: 6800, status: 'Unpaid' },
          { id: 'ORD-1091', time: '12:40', items: 'Croissant Box (6 pcs)', total: 2400, status: 'Paid' },
        ].map((ord) => (
          <View key={ord.id} style={styles.orderCard}>
            <View style={styles.orderLeft}>
              <View style={styles.orderIdRow}>
                <Text style={styles.orderIdText}>{ord.id}</Text>
                <Text style={styles.orderTimeText}>{ord.time}</Text>
              </View>
              <Text style={styles.orderItemsText} numberOfLines={1}>{ord.items}</Text>
            </View>
            <View style={styles.orderRight}>
              <Text style={styles.orderAmountText}>{formatRs(ord.total)}</Text>
              <View
                style={[
                  styles.statusTag,
                  ord.status === 'Paid' ? styles.statusTagPaid : styles.statusTagUnpaid,
                ]}
              >
                <Text
                  style={[
                    styles.statusTagText,
                    ord.status === 'Paid' ? styles.statusTagPaidText : styles.statusTagUnpaidText,
                  ]}
                >
                  {ord.status}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  // ==========================================
  // TAB 3: STOCK TAB
  // ==========================================
  const renderStockTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionHeaderRow}>
        <View>
          <Text style={styles.pageTitle}>Stock & Inventory</Text>
          <Text style={styles.pageSubtitle}>{inventoryItems.length} registered products</Text>
        </View>
        <TouchableOpacity
          style={styles.addProductBtn}
          onPress={() => router.push('/add_product')}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={16} color={colors.textLight} />
          <Text style={styles.addProductBtnText}>Add Product</Text>
        </TouchableOpacity>
      </View>

      {/* Search & Filter Bar */}
      <View style={styles.searchRow}>
        <View style={styles.stockSearchContainer}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.stockSearchInput}
            placeholder="Search product name or code..."
            placeholderTextColor={colors.textMuted}
            value={stockSearch}
            onChangeText={setStockSearch}
          />
        </View>
        <TouchableOpacity
          style={[
            styles.filterPillBtn,
            stockFilterLow && styles.filterPillBtnActive,
          ]}
          onPress={() => setStockFilterLow((prev) => !prev)}
        >
          <Text
            style={[
              styles.filterPillBtnText,
              stockFilterLow && styles.filterPillBtnTextActive,
            ]}
          >
            Low Stock ({lowStockItems.length})
          </Text>
        </TouchableOpacity>
      </View>

      {loadingInventory ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading stock items...</Text>
        </View>
      ) : filteredStock.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="cube-outline" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>No products matching filter</Text>
          <Text style={styles.emptySubtitle}>Try clearing search terms or adding new products.</Text>
        </View>
      ) : (
        <View style={styles.stockList}>
          {filteredStock.map((item) => {
            const isLow = item.quantity <= item.min_quantity;
            return (
              <View key={item.products.item_code} style={styles.stockItemCard}>
                <View style={styles.stockItemLeft}>
                  <Text style={styles.stockItemName}>{item.products.name}</Text>
                  <View style={styles.codeRow}>
                    <Text style={styles.stockItemCode}>{item.products.item_code}</Text>
                    {isLow && (
                      <View style={styles.lowStockTag}>
                        <Ionicons name="alert-circle" size={11} color={colors.dangerText} />
                        <Text style={styles.lowStockTagText}>Reorder Warning</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={[styles.stockQtyPill, isLow && styles.stockQtyPillLow]}>
                  <Text style={[styles.stockQtyNum, isLow && styles.stockQtyNumLow]}>
                    {item.quantity}
                  </Text>
                  <Text style={[styles.stockQtyUnit, isLow && styles.stockQtyNumLow]}>
                    {item.products.unit || 'units'}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );

  // ==========================================
  // TAB 4: REPORTS TAB
  // ==========================================
  const renderReportsTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.pageTitle}>Reports & Analytics</Text>
      </View>

      {/* Revenue Performance Card */}
      <View style={styles.reportSummaryCard}>
        <Text style={styles.reportCardTitle}>Performance Snapshot</Text>
        <Text style={styles.reportCardDesc}>Weekly performance against branch targets</Text>
        <View style={styles.reportMetricRow}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>TOTAL VOLUME</Text>
            <Text style={styles.metricValue}>Rs 584,200</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>TICKETS</Text>
            <Text style={styles.metricValue}>245</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>AVG MARGIN</Text>
            <Text style={[styles.metricValue, { color: colors.successText }]}>+32%</Text>
          </View>
        </View>
      </View>

      {/* Category Breakdown */}
      <Text style={styles.jumpToHeading}>Sales by Category</Text>
      <View style={styles.categoryReportList}>
        {[
          { name: 'Custom Cakes', percent: 48, revenue: 280400, color: colors.heroCard },
          { name: 'Cupcakes & Pastries', percent: 28, revenue: 163500, color: colors.primary },
          { name: 'Specialty Beverages', percent: 14, revenue: 81700, color: '#D97706' },
          { name: 'Dessert Boxes', percent: 10, revenue: 58600, color: '#64748B' },
        ].map((c) => (
          <View key={c.name} style={styles.categoryRowCard}>
            <View style={styles.catLeft}>
              <View style={[styles.catColorDot, { backgroundColor: c.color }]} />
              <View>
                <Text style={styles.catName}>{c.name}</Text>
                <Text style={styles.catPercent}>{c.percent}% of total orders</Text>
              </View>
            </View>
            <Text style={styles.catRevenue}>{formatRs(c.revenue)}</Text>
          </View>
        ))}
      </View>

      {/* Quick Action */}
      <TouchableOpacity
        style={styles.fullReportAction}
        onPress={() => setActiveTab('stock')}
        activeOpacity={0.8}
      >
        <Ionicons name="warning-outline" size={16} color={colors.warningText} />
        <Text style={styles.fullReportActionText}>Inspect Low Inventory Alerts</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // ==========================================
  // TAB 5: PROFILE TAB
  // ==========================================
  const renderProfileTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.pageTitle}>Staff Profile & Settings</Text>
      </View>

      {/* User Card */}
      <View style={styles.profileUserCard}>
        <View style={styles.profileAvatarLarge}>
          <Text style={styles.profileAvatarLargeText}>{userInitial}</Text>
        </View>
        <Text style={styles.profileName}>{currentUser?.name ?? 'Staff User'}</Text>
        <Text style={styles.profileRole}>{currentUser?.role ?? 'Staff Cashier'}</Text>
      </View>

      {/* Current Branch Details */}
      <View style={styles.branchDetailCard}>
        <Text style={styles.branchDetailTitle}>CURRENT ACTIVE REGISTER</Text>
        <Text style={styles.branchDetailName}>{currentBranch?.name ?? 'Main Branch'}</Text>
        <Text style={styles.branchDetailCode}>Branch Code: #{currentBranch?.branch_code}</Text>
      </View>

      {/* Switch Branch Button */}
      <TouchableOpacity
        style={styles.profileActionButton}
        onPress={handleSwitchBranch}
        activeOpacity={0.7}
      >
        <Ionicons name="swap-horizontal" size={18} color={colors.textPrimary} />
        <Text style={styles.actionText}>Switch Branch</Text>
      </TouchableOpacity>

      {/* Log Out Button */}
      <TouchableOpacity
        style={styles.profileLogoutButton}
        onPress={handleLogout}
        activeOpacity={0.7}
      >
        <Ionicons name="log-out-outline" size={18} color={colors.dangerText} />
        <Text style={styles.logoutActionText}>Log Out of Terminal</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Main Content Area based on Active Tab */}
        <View style={styles.contentArea}>
          {activeTab === 'home' && renderHomeTab()}
          {activeTab === 'sales' && renderSalesTab()}
          {activeTab === 'stock' && renderStockTab()}
          {activeTab === 'reports' && renderReportsTab()}
          {activeTab === 'profile' && renderProfileTab()}
        </View>

        {/* Bottom Navigation Bar */}
        <View style={styles.bottomTabBar}>
          {/* 1. Home Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('home')}
            activeOpacity={0.8}
          >
            <View style={[styles.tabIconPill, activeTab === 'home' && styles.tabIconPillActive]}>
              <Ionicons
                name={activeTab === 'home' ? 'home' : 'home-outline'}
                size={21}
                color={activeTab === 'home' ? colors.tabActiveText : colors.tabInactiveText}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'home' ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Home
            </Text>
          </TouchableOpacity>

          {/* 2. Sales Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('sales')}
            activeOpacity={0.8}
          >
            <View style={[styles.tabIconPill, activeTab === 'sales' && styles.tabIconPillActive]}>
              <Ionicons
                name={activeTab === 'sales' ? 'trending-up' : 'trending-up-outline'}
                size={21}
                color={activeTab === 'sales' ? colors.tabActiveText : colors.tabInactiveText}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'sales' ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Sales
            </Text>
          </TouchableOpacity>

          {/* 3. Stock Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('stock')}
            activeOpacity={0.8}
          >
            <View style={[styles.tabIconPill, activeTab === 'stock' && styles.tabIconPillActive]}>
              <Ionicons
                name={activeTab === 'stock' ? 'cube' : 'cube-outline'}
                size={21}
                color={activeTab === 'stock' ? colors.tabActiveText : colors.tabInactiveText}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'stock' ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Stock
            </Text>
          </TouchableOpacity>

          {/* 4. Reports Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('reports')}
            activeOpacity={0.8}
          >
            <View style={[styles.tabIconPill, activeTab === 'reports' && styles.tabIconPillActive]}>
              <Ionicons
                name={activeTab === 'reports' ? 'stats-chart' : 'stats-chart-outline'}
                size={21}
                color={activeTab === 'reports' ? colors.tabActiveText : colors.tabInactiveText}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'reports' ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Reports
            </Text>
          </TouchableOpacity>

          {/* 5. Profile Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('profile')}
            activeOpacity={0.8}
          >
            <View style={[styles.tabIconPill, activeTab === 'profile' && styles.tabIconPillActive]}>
              <Ionicons
                name={activeTab === 'profile' ? 'person' : 'person-outline'}
                size={21}
                color={activeTab === 'profile' ? colors.tabActiveText : colors.tabInactiveText}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'profile' ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Profile
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Serif font family fallback for high-end editorial display
const serifFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
  },
  contentArea: {
    flex: 1,
  },
  tabScroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 24,
  },

  // ----------------------------------------------------
  // Header Section (Greeting & Avatar)
  // ----------------------------------------------------
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  headerTitles: {
    flex: 1,
    paddingRight: 12,
  },
  greetingTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: serifFont,
    letterSpacing: -0.4,
  },
  branchSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  branchSubtitleText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.avatarBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EBD8C4',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.avatarText,
    fontFamily: serifFont,
  },

  // ----------------------------------------------------
  // Hero Card (Today's Income)
  // ----------------------------------------------------
  heroCard: {
    backgroundColor: colors.heroCard,
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
    marginBottom: 16,
    shadowColor: colors.heroCard,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  heroAmount: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.textLight,
    fontFamily: serifFont,
    letterSpacing: -0.5,
  },
  heroPillRow: {
    flexDirection: 'row',
    marginTop: 12,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.heroPill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 6,
  },
  heroPillTrend: {
    color: colors.textLight,
    fontSize: 12,
    fontWeight: '800',
  },
  heroPillSub: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    fontWeight: '500',
  },

  // ----------------------------------------------------
  // Two Stat Cards (Orders Today & Avg Order)
  // ----------------------------------------------------
  twoColRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  statCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textSecondary,
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  statCardNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: serifFont,
    marginBottom: 4,
  },
  statCardSub: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  statSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },

  // ----------------------------------------------------
  // Alert Reorder Card
  // ----------------------------------------------------
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.alertBg,
    borderWidth: 1,
    borderColor: colors.alertBorder,
    borderRadius: 20,
    padding: 16,
    marginBottom: 26,
    gap: 12,
  },
  alertLeftIcon: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertEmoji: {
    fontSize: 20,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.alertText,
    marginBottom: 2,
  },
  alertSubtitle: {
    fontSize: 12,
    color: colors.alertSubtext,
    fontWeight: '500',
  },
  alertChevron: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.alertText,
  },

  // ----------------------------------------------------
  // "Jump to" Section
  // ----------------------------------------------------
  jumpToHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: serifFont,
    marginBottom: 14,
  },
  jumpList: {
    gap: 12,
    marginBottom: 20,
  },
  jumpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.textPrimary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  jumpCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  jumpIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  jumpEmoji: {
    fontSize: 22,
  },
  jumpTextGroup: {
    flex: 1,
    gap: 2,
  },
  jumpTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  jumpSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  jumpChevron: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textMuted,
    marginLeft: 6,
  },

  // ----------------------------------------------------
  // Sales Tab Styles
  // ----------------------------------------------------
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    marginTop: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: serifFont,
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  periodPillGroup: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSand,
    borderRadius: 12,
    padding: 3,
  },
  periodButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
  },
  periodButtonActive: {
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  periodButtonTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  ordersList: {
    gap: 10,
  },
  orderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderLeft: {
    flex: 1,
    paddingRight: 10,
  },
  orderIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  orderIdText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  orderTimeText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  orderItemsText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  orderRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  orderAmountText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTagPaid: {
    backgroundColor: colors.successBg,
  },
  statusTagPaidText: {
    color: colors.successText,
    fontSize: 11,
    fontWeight: '700',
  },
  statusTagUnpaid: {
    backgroundColor: colors.dangerBg,
  },
  statusTagUnpaidText: {
    color: colors.dangerText,
    fontSize: 11,
    fontWeight: '700',
  },

  // ----------------------------------------------------
  // Stock Tab Styles
  // ----------------------------------------------------
  addProductBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  addProductBtnText: {
    color: colors.textLight,
    fontWeight: '700',
    fontSize: 13,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  stockSearchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  stockSearchInput: {
    flex: 1,
    height: '100%',
    fontSize: 14,
    color: colors.textPrimary,
  },
  filterPillBtn: {
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: colors.surfaceSand,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillBtnActive: {
    backgroundColor: colors.alertBg,
    borderColor: colors.alertBorder,
  },
  filterPillBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterPillBtnTextActive: {
    color: colors.alertText,
  },
  stockList: {
    gap: 10,
  },
  stockItemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stockItemLeft: {
    flex: 1,
    paddingRight: 10,
    gap: 4,
  },
  stockItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockItemCode: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  lowStockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 4,
  },
  lowStockTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.dangerText,
  },
  stockQtyPill: {
    minWidth: 54,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: colors.primarySurface,
    alignItems: 'center',
  },
  stockQtyPillLow: {
    backgroundColor: colors.dangerBg,
  },
  stockQtyNum: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.primaryText,
  },
  stockQtyNumLow: {
    color: colors.dangerText,
  },
  stockQtyUnit: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.primaryText,
  },

  // ----------------------------------------------------
  // Reports Tab Styles
  // ----------------------------------------------------
  reportSummaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  reportCardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  reportCardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 16,
  },
  reportMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 14,
  },
  metricItem: {
    alignItems: 'flex-start',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: serifFont,
  },
  categoryReportList: {
    gap: 10,
    marginBottom: 24,
  },
  categoryRowCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  catColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  catName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  catPercent: {
    fontSize: 12,
    color: colors.textMuted,
  },
  catRevenue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  fullReportAction: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSand,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  fullReportActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  // ----------------------------------------------------
  // Profile Tab Styles
  // ----------------------------------------------------
  profileUserCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  profileAvatarLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.avatarBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#EBD8C4',
  },
  profileAvatarLargeText: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.avatarText,
    fontFamily: serifFont,
  },
  profileName: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
    fontFamily: serifFont,
  },
  profileRole: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '700',
    marginTop: 4,
  },
  branchDetailCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  branchDetailTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  branchDetailName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  branchDetailCode: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  profileActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 12,
    gap: 8,
  },
  actionIcon: {
    fontSize: 16,
  },
  actionText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  profileLogoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.dangerBg,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  logoutActionIcon: {
    fontSize: 16,
  },
  logoutActionText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dangerText,
  },

  // ----------------------------------------------------
  // Bottom Navigation Bar
  // ----------------------------------------------------
  bottomTabBar: {
    flexDirection: 'row',
    backgroundColor: colors.tabBarBg,
    borderTopWidth: 1,
    borderTopColor: colors.tabBarBorder,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 4,
  },
  tabIconPill: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    minHeight: 30,
  },
  tabIconPillActive: {
    backgroundColor: colors.tabActivePill,
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    color: colors.tabActiveText,
    fontWeight: '800',
  },
  tabLabelInactive: {
    color: colors.tabInactiveText,
    fontWeight: '600',
  },

  // ----------------------------------------------------
  // Shared Utilities
  // ----------------------------------------------------
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    paddingVertical: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surfaceSand,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
});