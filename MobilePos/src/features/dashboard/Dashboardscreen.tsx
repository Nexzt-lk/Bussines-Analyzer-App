import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  RefreshControl,
  StatusBar as RNStatusBar,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useBranch } from '../branches/BranchContext';
import { useAuth } from '../auth/AuthContext';
import { inventoryApi } from '../inventory/inventoryApi';
import { productsApi } from '../products/productsApi';
import { branchesApi } from '../branches/branchApi';
import { colors } from '@/constants/colors';
import LoadErrorBanner, { describeLoadError } from '@/components/LoadErrorBanner';
import type { InventoryRow, Category, Branch } from '@/lib/types';
import SalesScreen from '../sales/SalesScreen';
import ExpensesScreen from '../expenses/ExpensesScreen';
import ReportsScreen from '../reports/ReportsScreen';
import { reportsApi, type ReportResponse } from '../reports/reportsApi';
import SalesOverviewCard from '../sales/SalesOverviewCard';
import TopProductsCard from '../reports/TopProductsCard';

type ActiveTab = 'home' | 'sales' | 'expenses' | 'stock' | 'reports' | 'profile';

export default function DashboardScreen() {
  const router = useRouter();
  const { currentBranch, selectBranch, clearBranch } = useBranch();
  const { currentUser, logout } = useAuth();

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');

  // Branches list & active register switching
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [switchingBranchId, setSwitchingBranchId] = useState<string | null>(null);

  // Notification settings for Profile tab
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [dailyClosingAlerts, setDailyClosingAlerts] = useState(true);

  // Inventory / Stock data
  const [inventoryItems, setInventoryItems] = useState<InventoryRow[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [stockSearch, setStockSearch] = useState('');
  type StockCardFilter = 'all' | 'low' | 'out';
  const [stockFilterType, setStockFilterType] = useState<StockCardFilter>('all');
  const [stockFilterModalVisible, setStockFilterModalVisible] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Today's report data (metric cards, sales overview, top products)
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [homeLoadError, setHomeLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Applies one round of home-screen results. Never shows Rs 0 / 0 low
  // stock as if it were real when a load failed.
  const applyDashboardResults = useCallback(
    (
      invRes: PromiseSettledResult<InventoryRow[]>,
      repRes: PromiseSettledResult<ReportResponse>,
      catRes: PromiseSettledResult<Category[]>
    ) => {
      setInventoryItems(invRes.status === 'fulfilled' ? invRes.value : []);
      setReportData(repRes.status === 'fulfilled' ? repRes.value : null);
      if (catRes.status === 'fulfilled' && catRes.value.length > 0) setCategories(catRes.value);
      const failed = [repRes, invRes].find((r) => r.status === 'rejected');
      setHomeLoadError(failed?.status === 'rejected' ? describeLoadError(failed.reason) : null);
      setLoadingInventory(false);
      setLoadingReport(false);
      setRefreshing(false);
    },
    []
  );

  const branchId = currentBranch?.id ?? '';
  const fetchDashboard = useCallback(
    () =>
      Promise.allSettled([
        inventoryApi.search(branchId, ''),
        reportsApi.getReportData(branchId, 'today'),
        productsApi.getCategories(branchId),
      ]),
    [branchId]
  );

  // Initial load and branch changes; ignores responses for a stale branch.
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    fetchDashboard().then(([inv, rep, cat]) => {
      if (!cancelled) applyDashboardResults(inv, rep, cat);
    });
    return () => {
      cancelled = true;
    };
  }, [branchId, fetchDashboard, applyDashboardResults]);

  useEffect(() => {
    if (Platform.OS === 'android') {
      RNStatusBar.setBarStyle('dark-content');
      RNStatusBar.setBackgroundColor(colors.background);
      RNStatusBar.setTranslucent(false);
    }
  }, []);

  const onRefresh = useCallback(() => {
    if (!branchId) return;
    setRefreshing(true);
    fetchDashboard().then(([inv, rep, cat]) => applyDashboardResults(inv, rep, cat));
  }, [branchId, fetchDashboard, applyDashboardResults]);

  // Derived low stock and out of stock items
  const lowStockItems = useMemo(
    () =>
      inventoryItems.filter(
        (i) =>
          (Number(i.quantity) || 0) > 0 &&
          (Number(i.quantity) || 0) <= (Number(i.min_quantity) || 0)
      ),
    [inventoryItems]
  );

  const outOfStockItems = useMemo(
    () => inventoryItems.filter((i) => (Number(i.quantity) || 0) <= 0),
    [inventoryItems]
  );

  const inventoryStats = useMemo(() => {
    return {
      total: inventoryItems.length,
      low: lowStockItems.length,
      out: outOfStockItems.length,
    };
  }, [inventoryItems.length, lowStockItems.length, outOfStockItems.length]);

  const reportStats = reportData?.stats;

  const salesOverviewData = useMemo(
    () =>
      (reportData?.chartData ?? []).map((p) => ({
        label: p.label,
        value: p.value ?? p.sales,
      })),
    [reportData?.chartData]
  );

  const categoryList = useMemo(() => {
    return [{ id: 'all', name: 'All', code_prefix: 'ALL' }, ...categories];
  }, [categories]);

  // Filtered stock list for Stock Tab
  const filteredStock = useMemo(() => {
    let list = inventoryItems;
    if (selectedCategory && selectedCategory !== 'all') {
      list = list.filter((i) => i.products.category_id === selectedCategory);
    }
    if (stockFilterType === 'low') {
      list = list.filter(
        (i) =>
          (Number(i.quantity) || 0) > 0 &&
          (Number(i.quantity) || 0) <= (Number(i.min_quantity) || 0)
      );
    } else if (stockFilterType === 'out') {
      list = list.filter((i) => (Number(i.quantity) || 0) <= 0);
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
  }, [inventoryItems, selectedCategory, stockFilterType, stockSearch]);

  // Dynamic greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const userName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Owner';
  const currentUserName = currentUser?.name;
  const userInitials = useMemo(() => {
    if (!currentUserName) return 'OD';
    const parts = currentUserName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }, [currentUserName]);


  const formattedDate = useMemo(() => {
    const now = new Date();
    const day = now.getDate();
    const month = now.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
    const year = now.getFullYear();
    return `${day} ${month} ${year}`;
  }, []);
  // Real branch name only — never a placeholder shop.
  const branchDisplayName = currentBranch?.name
    ? currentBranch.name.includes('—')
      ? currentBranch.name.split('—')[1].trim()
      : currentBranch.name
    : 'No branch selected';

  // Format currency
  const formatRs = useCallback((num: number) => {
    return 'Rs ' + num.toLocaleString();
  }, []);

  // Load all active branches for Profile tab
  useEffect(() => {
    branchesApi
      .getActive()
      .then((data) => {
        setAllBranches(data);
      })
      .catch((err) => {
        console.error('Failed to load branches for profile:', err);
      })
      .finally(() => {
        setLoadingBranches(false);
      });
  }, []);

  const handleSelectBranch = async (branch: Branch) => {
    if (branch.id === currentBranch?.id) return;
    try {
      setSwitchingBranchId(branch.id);
      await selectBranch(branch);
    } catch (err) {
      console.error('Failed to switch branch:', err);
    } finally {
      setSwitchingBranchId(null);
    }
  };

  const handleSwitchBranch = async () => {
    await clearBranch();
    router.replace('/select-branch');
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  // ==========================================
  // TAB 1: HOME TAB (Matches the user's design)
  // ==========================================
  const renderHomeTab = () => (
    <ScrollView
      style={styles.homeTabScroll}
      contentContainerStyle={styles.homeScrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#FFFFFF"
          colors={['#0D7F41']}
        />
      }
    >
      {/* Top Green Gradient Banner Header Card */}
      <LinearGradient
        colors={['#06572A', '#0D7F41', '#14964F']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.greenHeaderGradient}
      >
        <View style={styles.headerTopRow}>
          <View style={styles.headerDateAndGreeting}>
            <Text style={styles.headerDateBadge}>{formattedDate}</Text>
            <Text style={styles.headerGreetingText}>
              {greeting}, {userName}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerProfileSquircle}
            onPress={() => setActiveTab('profile')}
            activeOpacity={0.8}
          >
            <Text style={styles.headerProfileInitials}>{userInitials}</Text>
          </TouchableOpacity>
        </View>

        {/* Branch Pill (matching reference image) */}
        <TouchableOpacity
          style={styles.headerBranchPill}
          onPress={handleSwitchBranch}
          activeOpacity={0.75}
        >
          <Ionicons name="business-outline" size={15} color="#FFFFFF" />
          <Text style={styles.headerBranchText}>{branchDisplayName}</Text>
          <Ionicons name="chevron-down" size={13} color="rgba(255, 255, 255, 0.85)" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Main Home Content */}
      <View style={styles.homeBodyContent}>
        <LoadErrorBanner message={homeLoadError} onRetry={onRefresh} />

        {/* Four Metric Cards: Today Sales, Order Revenue, Today Orders, Low Stock */}
        <View style={styles.cardsGrid}>
          <View style={styles.cardRow}>
            {/* Card 1: Today Sales */}
            <View style={styles.metricCard}>
              <View style={styles.metricIconCircle}>
                <Ionicons name="trending-up" size={20} color="#059669" />
              </View>
              <Text style={styles.metricLabel}>Today Sales</Text>
              {loadingReport ? (
                <ActivityIndicator size="small" color={colors.primary} style={styles.metricLoader} />
              ) : (
                <Text style={styles.metricValue}>{formatRs(reportStats?.totalSales ?? 0)}</Text>
              )}
              <View style={styles.metricFooterRow}>
                <Ionicons
                  name={reportStats?.salesTrendPositive === false ? 'arrow-down-circle' : 'arrow-up-circle'}
                  size={12}
                  color={reportStats?.salesTrendPositive === false ? '#DC2626' : '#16A34A'}
                />
                <Text
                  style={[
                    styles.metricFooterText,
                    { color: reportStats?.salesTrendPositive === false ? '#DC2626' : '#16A34A' },
                  ]}
                >
                  {reportStats?.salesTrend ?? '0%'} vs yesterday
                </Text>
              </View>
            </View>

            {/* Card 2: Order Revenue */}
            <View style={styles.metricCard}>
              <View style={styles.metricIconCircle}>
                <Ionicons name="wallet-outline" size={20} color="#059669" />
              </View>
              <Text style={styles.metricLabel}>Order Revenue</Text>
              {loadingReport ? (
                <ActivityIndicator size="small" color={colors.primary} style={styles.metricLoader} />
              ) : (
                <Text style={styles.metricValue}>{formatRs(reportStats?.revenue ?? 0)}</Text>
              )}
              <View style={styles.metricFooterRow}>
                <Ionicons name="shield-checkmark-outline" size={12} color="#059669" />
                <Text style={[styles.metricFooterText, { color: '#059669' }]}>
                  {reportStats?.profitMargin ?? 0}% margin
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.cardRow}>
            {/* Card 3: Today Orders */}
            <View style={styles.metricCard}>
              <View style={styles.metricIconCircle}>
                <Ionicons name="bag-handle-outline" size={20} color="#059669" />
              </View>
              <Text style={styles.metricLabel}>Today Orders</Text>
              {loadingReport ? (
                <ActivityIndicator size="small" color={colors.primary} style={styles.metricLoader} />
              ) : (
                <Text style={styles.metricValue}>
                  {(reportStats?.totalOrders ?? 0).toLocaleString()}
                </Text>
              )}
              <View style={styles.metricFooterRow}>
                <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
                <Text style={styles.metricFooterText}>
                  Avg {formatRs(reportStats?.avgOrderValue ?? 0)}
                </Text>
              </View>
            </View>

            {/* Card 4: Low Stock */}
            <TouchableOpacity
              style={styles.metricCard}
              onPress={() => {
                setStockFilterType('low');
                setActiveTab('stock');
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.metricIconCircle, { backgroundColor: '#FEF3C7' }]}>
                <Ionicons name="warning-outline" size={20} color="#D97706" />
              </View>
              <Text style={styles.metricLabel}>Low Stock</Text>
              {loadingInventory ? (
                <ActivityIndicator size="small" color={colors.primary} style={styles.metricLoader} />
              ) : (
                <Text style={styles.metricValue}>{inventoryStats.low}</Text>
              )}
              <View style={styles.metricFooterRow}>
                <Ionicons name="cube-outline" size={12} color="#D97706" />
                <Text style={[styles.metricFooterText, { color: '#D97706' }]}>
                  {inventoryStats.out} out of stock
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Today's Sales Overview */}
        <SalesOverviewCard
          title="Today's Sales Overview"
          actionLabel="View all"
          onActionPress={() => setActiveTab('sales')}
          chartData={salesOverviewData}
          total={reportStats?.totalSales ?? 0}
          trendPercentage={reportStats?.salesTrend ?? '0%'}
          trendPositive={reportStats?.salesTrendPositive !== false}
          loading={loadingReport}
          variant="line"
          amountLabel="TODAY'S SALES"
        />

        {/* Top Selling Products */}
        <View style={styles.topProductsSpacer}>
          <TopProductsCard
            title="Top Selling Products"
            products={reportData?.topProducts ?? []}
            actionLabel="View report"
            onActionPress={() => setActiveTab('reports')}
          />
        </View>
      </View>
    </ScrollView>
  );

  // ==========================================
  // TAB 2: SALES TAB (Remade to match design)
  // ==========================================
  const renderSalesTab = () => (
    <SalesScreen />
  );

  // ==========================================
  // TAB 3: EXPENSES TAB
  // ==========================================
  const renderExpensesTab = () => (
    <ExpensesScreen />
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
      </View>

      {/* 3 Summary Cards Top of Searchbar: Total Products, Low Stock, Out of Stock */}
      <View style={styles.stockStatsRow}>
        {/* Card 1: Total Products */}
        <View style={styles.stockStatCard}>
          <Text style={[styles.stockStatValue, { color: '#059669' }]}>
            {inventoryStats.total}
          </Text>
          <Text style={styles.stockStatLabel}>Total Products</Text>
        </View>

        {/* Card 2: Low Stock */}
        <View style={styles.stockStatCard}>
          <Text style={[styles.stockStatValue, { color: '#D97706' }]}>
            {inventoryStats.low}
          </Text>
          <Text style={styles.stockStatLabel}>Low Stock</Text>
        </View>

        {/* Card 3: Out of Stock */}
        <View style={styles.stockStatCard}>
          <Text style={[styles.stockStatValue, { color: '#DC2626' }]}>
            {inventoryStats.out}
          </Text>
          <Text style={styles.stockStatLabel}>Out of Stock</Text>
        </View>
      </View>

      {/* Search Bar & Stock Status Dropdown Filter */}
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
          {stockSearch.length > 0 && (
            <TouchableOpacity onPress={() => setStockSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Stock Status Dropdown Button */}
        <TouchableOpacity
          style={[
            styles.stockFilterBtn,
            stockFilterType === 'low' && styles.stockFilterBtnLow,
            stockFilterType === 'out' && styles.stockFilterBtnOut,
          ]}
          onPress={() => setStockFilterModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={
              stockFilterType === 'out'
                ? 'close-circle'
                : stockFilterType === 'low'
                ? 'warning'
                : 'layers-outline'
            }
            size={14}
            color={
              stockFilterType === 'out'
                ? '#DC2626'
                : stockFilterType === 'low'
                ? '#D97706'
                : colors.primary
            }
          />
          <Text
            style={[
              styles.stockFilterBtnText,
              stockFilterType === 'low' && styles.stockFilterBtnTextLow,
              stockFilterType === 'out' && styles.stockFilterBtnTextOut,
            ]}
            numberOfLines={1}
          >
            {stockFilterType === 'out'
              ? 'Out Stock'
              : stockFilterType === 'low'
              ? 'Low Stock'
              : 'All Stock'}
          </Text>
          <Ionicons
            name="chevron-down"
            size={12}
            color={
              stockFilterType === 'out'
                ? '#DC2626'
                : stockFilterType === 'low'
                ? '#D97706'
                : colors.textSecondary
            }
          />
        </TouchableOpacity>
      </View>

      {/* Stock Status Filter Selection Modal */}
      <Modal
        visible={stockFilterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStockFilterModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setStockFilterModalVisible(false)}
        >
          <View style={styles.filterMenuContainer}>
            <View style={styles.filterMenuHeader}>
              <Text style={styles.filterMenuTitle}>Filter by Stock Status</Text>
              <TouchableOpacity
                onPress={() => setStockFilterModalVisible(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Option 1: All Stock */}
            <TouchableOpacity
              style={[
                styles.filterMenuItem,
                stockFilterType === 'all' && styles.filterMenuItemActive,
              ]}
              onPress={() => {
                setStockFilterType('all');
                setStockFilterModalVisible(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.filterMenuLeft}>
                <View style={[styles.filterIconBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="layers-outline" size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.filterMenuLabel, stockFilterType === 'all' && styles.filterMenuLabelActive]}>
                    All Stock
                  </Text>
                  <Text style={styles.filterMenuSub}>Show all products</Text>
                </View>
              </View>
              <View style={styles.filterMenuRight}>
                <View style={[styles.filterCountBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.filterCountText, { color: colors.primary }]}>{inventoryStats.total}</Text>
                </View>
                {stockFilterType === 'all' && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 2: Low Stock */}
            <TouchableOpacity
              style={[
                styles.filterMenuItem,
                stockFilterType === 'low' && styles.filterMenuItemActive,
              ]}
              onPress={() => {
                setStockFilterType('low');
                setStockFilterModalVisible(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.filterMenuLeft}>
                <View style={[styles.filterIconBadge, { backgroundColor: '#FFFBEB' }]}>
                  <Ionicons name="warning-outline" size={16} color="#D97706" />
                </View>
                <View>
                  <Text style={[styles.filterMenuLabel, stockFilterType === 'low' && styles.filterMenuLabelActive]}>
                    Low Stock
                  </Text>
                  <Text style={styles.filterMenuSub}>Quantity ≤ min threshold</Text>
                </View>
              </View>
              <View style={styles.filterMenuRight}>
                <View style={[styles.filterCountBadge, { backgroundColor: '#FFFBEB' }]}>
                  <Text style={[styles.filterCountText, { color: '#D97706' }]}>{inventoryStats.low}</Text>
                </View>
                {stockFilterType === 'low' && (
                  <Ionicons name="checkmark-circle" size={18} color="#D97706" />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 3: Out of Stock */}
            <TouchableOpacity
              style={[
                styles.filterMenuItem,
                stockFilterType === 'out' && styles.filterMenuItemActive,
              ]}
              onPress={() => {
                setStockFilterType('out');
                setStockFilterModalVisible(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.filterMenuLeft}>
                <View style={[styles.filterIconBadge, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                </View>
                <View>
                  <Text style={[styles.filterMenuLabel, stockFilterType === 'out' && styles.filterMenuLabelActive]}>
                    Out of Stock
                  </Text>
                  <Text style={styles.filterMenuSub}>Depleted items (0 qty)</Text>
                </View>
              </View>
              <View style={styles.filterMenuRight}>
                <View style={[styles.filterCountBadge, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.filterCountText, { color: '#DC2626' }]}>{inventoryStats.out}</Text>
                </View>
                {stockFilterType === 'out' && (
                  <Ionicons name="checkmark-circle" size={18} color="#DC2626" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Category Filter Pills (Under Search Bar) */}
      <View style={styles.categoryFilterContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryFilterScroll}
        >
          {categoryList.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryPill,
                  isSelected && styles.categoryPillActive,
                ]}
                onPress={() => setSelectedCategory(cat.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.categoryPillText,
                    isSelected && styles.categoryPillTextActive,
                  ]}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
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
          <Text style={styles.emptySubtitle}>Try clearing search terms or selecting another card filter.</Text>
        </View>
      ) : (
        <View style={styles.stockList}>
          {filteredStock.map((item) => {
            const isOut = (Number(item.quantity) || 0) <= 0;
            const isLow = !isOut && (Number(item.quantity) || 0) <= (Number(item.min_quantity) || 0);
            return (
              <View key={item.products.item_code} style={styles.stockItemCard}>
                <View style={styles.stockItemLeft}>
                  <Text style={styles.stockItemName}>{item.products.name}</Text>
                  <View style={styles.codeRow}>
                    <Text style={styles.stockItemCode}>{item.products.item_code}</Text>
                    {isOut ? (
                      <View style={[styles.lowStockTag, { backgroundColor: '#FEE2E2' }]}>
                        <Ionicons name="close-circle" size={11} color={colors.danger} />
                        <Text style={[styles.lowStockTagText, { color: colors.danger }]}>Out of Stock</Text>
                      </View>
                    ) : isLow ? (
                      <View style={[styles.lowStockTag, { backgroundColor: '#FEF3C7' }]}>
                        <Ionicons name="alert-circle" size={11} color="#D97706" />
                        <Text style={[styles.lowStockTagText, { color: '#B45309' }]}>Low Stock</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <View
                  style={[
                    styles.stockQtyPill,
                    isOut ? styles.stockQtyPillOut : isLow ? styles.stockQtyPillLow : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.stockQtyNum,
                      isOut ? styles.stockQtyNumOut : isLow ? styles.stockQtyNumLow : null,
                    ]}
                  >
                    {item.quantity}
                  </Text>
                  <Text
                    style={[
                      styles.stockQtyUnit,
                      isOut ? styles.stockQtyNumOut : isLow ? styles.stockQtyNumLow : null,
                    ]}
                  >
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
  // TAB 4: REPORTS TAB (Remade to match design)
  // ==========================================
  const renderReportsTab = () => (
    <ReportsScreen />
  );

  // ==========================================
  // TAB 5: PROFILE TAB (Matches uploaded design)
  // ==========================================
  const renderProfileTab = () => {
    const singleInitial = currentUser?.name ? currentUser.name.trim()[0].toUpperCase() : 'N';
    const userEmail = currentUser?.email || 'owner@sugarcrumb.lk';

    return (
      <ScrollView
        style={styles.profileTabScroll}
        contentContainerStyle={styles.profileScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header: Title & Subtitle */}
        <View style={styles.profileHeader}>
          <Text style={styles.profileMainTitle}>Profile</Text>
          <Text style={styles.profileSubtitle}>Owner & shop settings</Text>
        </View>

        {/* 1. User Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatarCircle}>
            <Text style={styles.profileAvatarLetter}>{singleInitial}</Text>
          </View>
          <View style={styles.profileUserInfo}>
            <Text style={styles.profileUserName}>{currentUser?.name ?? 'Nadi Perera'}</Text>
            <Text style={styles.profileUserEmail}>{userEmail}</Text>
          </View>
        </View>

        {/* 2. Shops Section */}
        <View style={styles.profileSectionHeader}>
          <Text style={styles.profileSectionTitle}>Shops</Text>
        </View>

        <View style={styles.profileCardGroup}>
          {loadingBranches && allBranches.length === 0 ? (
            <View style={styles.profileLoadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.profileLoadingText}>Loading branches...</Text>
            </View>
          ) : allBranches.length > 0 ? (
            allBranches.map((branch, index) => {
              const isActive = currentBranch?.id === branch.id;
              const isSwitching = switchingBranchId === branch.id;
              const isLast = index === allBranches.length - 1;

              return (
                <TouchableOpacity
                  key={branch.id}
                  style={[
                    styles.shopRow,
                    !isLast && styles.shopRowDivider,
                  ]}
                  onPress={() => handleSelectBranch(branch)}
                  activeOpacity={0.7}
                  disabled={isActive || isSwitching}
                >
                  <View style={styles.shopInfo}>
                    <Text style={styles.shopName}>{branch.name}</Text>
                    <Text style={styles.shopCode}>#{branch.branch_code}</Text>
                  </View>

                  {isSwitching ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : isActive ? (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>Active</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.shopRow}>
              <View style={styles.shopInfo}>
                <Text style={styles.shopName}>{currentBranch?.name ?? 'Main Branch'}</Text>
                <Text style={styles.shopCode}>#{currentBranch?.branch_code ?? '001'}</Text>
              </View>
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            </View>
          )}

          {/* Switch Branch Button */}
          <TouchableOpacity
            style={styles.switchBranchButton}
            onPress={handleSwitchBranch}
            activeOpacity={0.7}
          >
            <Ionicons name="swap-horizontal" size={15} color={colors.primary} />
            <Text style={styles.switchBranchButtonText}>Switch Branch</Text>
          </TouchableOpacity>
        </View>

        {/* 3. Notifications Section */}
        <View style={styles.profileSectionHeader}>
          <Text style={styles.profileSectionTitle}>Notifications</Text>
        </View>

        <View style={styles.profileCardGroup}>
          {/* Low Stock Alerts */}
          <View style={[styles.notificationRow, styles.shopRowDivider]}>
            <View style={styles.notificationInfo}>
              <Text style={styles.notificationTitle}>Low stock alerts</Text>
              <Text style={styles.notificationSubtitle}>Push when an item hits reorder level</Text>
            </View>
            <Switch
              value={lowStockAlerts}
              onValueChange={setLowStockAlerts}
              trackColor={{ false: '#E2E8F0', true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E2E8F0"
            />
          </View>

          {/* Daily Closing Summary */}
          <View style={styles.notificationRow}>
            <View style={styles.notificationInfo}>
              <Text style={styles.notificationTitle}>Daily closing summary</Text>
              <Text style={styles.notificationSubtitle}>Income recap at 9:00 pm</Text>
            </View>
            <Switch
              value={dailyClosingAlerts}
              onValueChange={setDailyClosingAlerts}
              trackColor={{ false: '#E2E8F0', true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E2E8F0"
            />
          </View>
        </View>

        {/* 4. Log Out Button */}
        <TouchableOpacity
          style={styles.profileLogoutButtonModern}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          <Text style={styles.profileLogoutButtonText}>Log Out of Terminal</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* Main Content Area based on Active Tab */}
        <View style={styles.contentArea}>
          {activeTab === 'home' && renderHomeTab()}
          {activeTab === 'sales' && renderSalesTab()}
          {activeTab === 'expenses' && renderExpensesTab()}
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
            <View style={styles.tabIconPill}>
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
            <View style={styles.tabIconPill}>
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

          {/* 3. Expenses Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('expenses')}
            activeOpacity={0.8}
          >
            <View style={styles.tabIconPill}>
              <Ionicons
                name={activeTab === 'expenses' ? 'receipt' : 'receipt-outline'}
                size={20}
                color={activeTab === 'expenses' ? colors.tabActiveText : colors.tabInactiveText}
              />
            </View>
            <Text
              style={[
                styles.tabLabel,
                activeTab === 'expenses' ? styles.tabLabelActive : styles.tabLabelInactive,
              ]}
            >
              Expenses
            </Text>
          </TouchableOpacity>

          {/* 3. Stock Tab */}
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => setActiveTab('stock')}
            activeOpacity={0.8}
          >
            <View style={styles.tabIconPill}>
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
            <View style={styles.tabIconPill}>
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
        </View>
      </View>
    </SafeAreaView>
  );
}

// Serif font family fallback for high-end editorial display
const serifFont = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });

const styles = StyleSheet.create({
  // Home Metric Cards
  cardsGrid: {
    gap: 12,
    marginBottom: 16,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  metricIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E8F8EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  metricLoader: {
    marginVertical: 4,
    alignSelf: 'flex-start',
  },
  metricFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  metricFooterText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  topProductsSpacer: {
    marginTop: 16,
  },

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
  homeTabScroll: {
    flex: 1,
    backgroundColor: colors.background,
  },
  homeScrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 14 : 10,
    paddingBottom: 28,
  },
  greenHeaderGradient: {
    borderRadius: 22,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#06572A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerDateAndGreeting: {
    flex: 1,
    paddingRight: 16,
  },
  headerDateBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A7F3D0',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerGreetingText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.4,
  },
  headerProfileSquircle: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  headerProfileInitials: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerBranchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 7,
    marginTop: 14,
  },
  headerBranchText: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  homeBodyContent: {
    marginTop: 0,
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

  // ----------------------------------------------------
  // Two Stat Cards (Orders Today & Avg Order)
  // ----------------------------------------------------

  // ----------------------------------------------------
  // Alert Reorder Card
  // ----------------------------------------------------

  // ----------------------------------------------------
  // "Jump to" Section
  // ----------------------------------------------------

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
  },
  pageSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // ----------------------------------------------------
  // Stock Tab Styles
  // ----------------------------------------------------
  stockStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  stockStatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stockStatValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  stockStatLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
  },
  categoryFilterContainer: {
    marginBottom: 16,
  },
  categoryFilterScroll: {
    gap: 8,
    paddingRight: 16,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surfaceSand,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
  },
  categoryPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
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
  stockFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    gap: 6,
  },
  stockFilterBtnLow: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
  },
  stockFilterBtnOut: {
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  stockFilterBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stockFilterBtnTextLow: {
    color: '#D97706',
  },
  stockFilterBtnTextOut: {
    color: '#DC2626',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  filterMenuContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  filterMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterMenuTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  filterMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  filterMenuItemActive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  filterMenuLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  filterIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterMenuLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  filterMenuLabelActive: {
    fontWeight: '700',
  },
  filterMenuSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  filterMenuRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterCountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  filterCountText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  stockQtyPillOut: {
    backgroundColor: '#FEE2E2',
  },
  stockQtyNumOut: {
    color: '#DC2626',
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
  // Profile Tab Styles (Matching uploaded design & theme)
  // ----------------------------------------------------
  profileTabScroll: {
    flex: 1,
    backgroundColor: '#F9FBF9',
  },
  profileScrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 14 : 10,
    paddingBottom: 48,
  },
  profileHeader: {
    marginBottom: 20,
  },
  profileMainTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  profileSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 24,
  },
  profileAvatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileAvatarLetter: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0D7F41',
    fontFamily: serifFont,
  },
  profileUserInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileUserName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#18181B',
  },
  profileUserEmail: {
    fontSize: 14,
    color: '#71717A',
    marginTop: 3,
  },
  profileSectionHeader: {
    marginBottom: 12,
  },
  profileSectionTitle: {
    fontFamily: serifFont,
    fontSize: 22,
    fontWeight: '700',
    color: '#18181B',
    letterSpacing: -0.3,
  },
  profileCardGroup: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 26,
  },
  profileLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  profileLoadingText: {
    fontSize: 13,
    color: '#71717A',
  },
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  shopRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F2',
  },
  shopInfo: {
    flex: 1,
    paddingRight: 12,
  },
  shopName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#18181B',
  },
  shopCode: {
    fontSize: 13,
    color: '#71717A',
    marginTop: 3,
  },
  activeBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D7F41',
  },
  switchBranchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F2',
    marginTop: 2,
  },
  switchBranchButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
  },
  notificationInfo: {
    flex: 1,
    paddingRight: 14,
  },
  notificationTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#18181B',
  },
  notificationSubtitle: {
    fontSize: 13,
    color: '#71717A',
    marginTop: 2,
  },
  profileLogoutButtonModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FEE2E2',
    paddingVertical: 15,
    borderRadius: 18,
    gap: 8,
    marginTop: 4,
    marginBottom: 24,
  },
  profileLogoutButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 42,
    minHeight: 28,
  },
  tabLabel: {
    fontSize: 10.5,
    letterSpacing: -0.3,
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