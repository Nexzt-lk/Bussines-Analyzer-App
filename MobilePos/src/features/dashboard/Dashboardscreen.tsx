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
  Image,
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
import { fonts } from '@/constants/fonts';
import { supabase } from '@/lib/supabaseClient';
import LoadErrorBanner, { describeLoadError } from '@/components/LoadErrorBanner';
import type { InventoryRow, Category, Branch } from '@/lib/types';
import SalesScreen from '../sales/SalesScreen';
import ExpensesScreen from '../expenses/ExpensesScreen';
import ReportsScreen from '../reports/ReportsScreen';
import { reportsApi, type ReportResponse } from '../reports/reportsApi';
import SalesOverviewCard from '../sales/SalesOverviewCard';
import AppBackground from '@/components/AppBackground';
import TopProductsCard from '../reports/TopProductsCard';
import CashDrawerCard from '../cash/CashDrawerCard';
import StockOverviewCard from '../inventory/StockOverviewCard';
import { cashSessionApi, type TodayCashSessionSummary } from '../cash/cashSessionApi';
import { DAILY_VIEW_FIRST_STEP } from '@/components/BarDetailPanel';
import { useNotifications } from '../notifications/NotificationContext';

type ActiveTab = 'home' | 'sales' | 'expenses' | 'stock' | 'reports' | 'profile';

export default function DashboardScreen() {
  const router = useRouter();
  const { currentBranch, selectBranch, clearBranch } = useBranch();
  const { currentUser, logout } = useAuth();
  const {
    settings: notificationSettings,
    updateSettings: updateNotificationSettings,
    unreadCount,
    openModal: openNotificationModal,
    sendTestNotification,
  } = useNotifications();

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');

  // Branches list & active register switching
  const [allBranches, setAllBranches] = useState<Branch[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(true);
  const [switchingBranchId, setSwitchingBranchId] = useState<string | null>(null);

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

  // Cash Session & Cashier Till data
  const [cashSession, setCashSession] = useState<TodayCashSessionSummary | null>(null);
  const [loadingCashSession, setLoadingCashSession] = useState(true);

  // Applies one round of home-screen results. Never shows Rs 0 / 0 low
  // stock as if it were real when a load failed.
  const applyDashboardResults = useCallback(
    (
      invRes: PromiseSettledResult<InventoryRow[]>,
      repRes: PromiseSettledResult<ReportResponse>,
      catRes: PromiseSettledResult<Category[]>,
      cashRes?: PromiseSettledResult<TodayCashSessionSummary>
    ) => {
      setInventoryItems(invRes.status === 'fulfilled' ? invRes.value : []);
      setReportData(repRes.status === 'fulfilled' ? repRes.value : null);
      if (catRes.status === 'fulfilled' && catRes.value.length > 0) setCategories(catRes.value);
      if (cashRes) {
        setCashSession(cashRes.status === 'fulfilled' ? cashRes.value : null);
      }
      const failed = [repRes, invRes].find((r) => r.status === 'rejected');
      setHomeLoadError(failed?.status === 'rejected' ? describeLoadError(failed.reason) : null);
      setLoadingInventory(false);
      setLoadingReport(false);
      setLoadingCashSession(false);
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
        cashSessionApi.getTodaySession(branchId),
      ]),
    [branchId]
  );

  // Initial load and branch changes; ignores responses for a stale branch.
  useEffect(() => {
    if (!branchId) return;
    let cancelled = false;
    fetchDashboard().then(([inv, rep, cat, cash]) => {
      if (!cancelled) applyDashboardResults(inv, rep, cat, cash);
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
    fetchDashboard().then(([inv, rep, cat, cash]) => applyDashboardResults(inv, rep, cat, cash));
  }, [branchId, fetchDashboard, applyDashboardResults]);

  // Real-time live listener for cash_sessions updates from desktop POS
  useEffect(() => {
    if (!branchId) return;
    const channel = supabase
      .channel(`rt-cash-sessions-${branchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_sessions',
          filter: `shop_id=eq.${branchId}`,
        },
        () => {
          cashSessionApi.getTodaySession(branchId).then((res) => {
            setCashSession(res);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [branchId]);

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
  // TAB 1: HOME TAB (Modern Executive Redesign)
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
          tintColor="#0D7F41"
          colors={['#0D7F41']}
        />
      }
    >
      {/* Ambient Top Glow for subtle luxury styling */}
      <View style={styles.ambientTopGlow} pointerEvents="none" />

      {/* Top White Brand & Status Header Card */}
      <View style={styles.whiteHeaderCard}>
        {/* Top Brand Bar & Live Status */}
        <View style={styles.headerTopRow}>
          <View style={styles.headerBrandCluster}>
            <View style={styles.headerLogoCard}>
              <Image
                source={require('@/assets/images/bizznet-logo.png')}
                style={styles.headerMiniLogo}
                resizeMode="contain"
              />
            </View>
            <View style={styles.headerBrandTextGroup}>
              <Text style={styles.headerBrandTitle}>BizzNet</Text>
              <View style={styles.liveStatusPill}>
                <View style={styles.liveStatusDot} />
                <Text style={styles.liveStatusText}>ONLINE TERMINAL</Text>
              </View>
            </View>
          </View>

          <View style={styles.headerTopRightRow}>
            {/* Real-time Notification Bell */}
            <TouchableOpacity
              style={styles.headerNotificationButton}
              onPress={openNotificationModal}
              activeOpacity={0.8}
            >
              <Ionicons name="notifications-outline" size={20} color="#334155" />
              {unreadCount > 0 && (
                <View style={styles.headerBadge}>
                  <Text style={styles.headerBadgeText}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Profile Avatar Button */}
            <TouchableOpacity
              style={styles.headerProfileSquircle}
              onPress={() => setActiveTab('profile')}
              activeOpacity={0.8}
            >
              <Text style={styles.headerProfileInitials}>{userInitials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Dynamic Date & Greeting */}
        <View style={styles.headerGreetingSection}>
          <View style={styles.headerDateBadgeRow}>
            <Ionicons name="calendar-outline" size={13} color="#0D7F41" />
            <Text style={styles.headerDateBadge}>{formattedDate}</Text>
          </View>
          <Text style={styles.headerGreetingText}>
            {greeting}
          </Text>
        </View>

        {/* Operating Branch Card */}
        <TouchableOpacity
          style={styles.headerBranchCard}
          onPress={handleSwitchBranch}
          activeOpacity={0.85}
        >
          <View style={styles.headerBranchLeft}>
            <View style={styles.headerBranchIconCircle}>
              <Ionicons name="storefront" size={16} color="#0D7F41" />
            </View>
            <View style={styles.headerBranchTextCol}>
              <Text style={styles.headerBranchOverline}>ACTIVE LOCATION</Text>
              <Text style={styles.headerBranchName} numberOfLines={1}>
                {branchDisplayName}
              </Text>
            </View>
          </View>

          <View style={styles.headerBranchSwitchPill}>
            <Text style={styles.headerBranchSwitchText}>Switch</Text>
            <Ionicons name="swap-horizontal" size={14} color="#FFFFFF" />
          </View>
        </TouchableOpacity>
      </View>

      {/* Main Home Content */}
      <View style={styles.homeBodyContent}>
        <LoadErrorBanner message={homeLoadError} onRetry={onRefresh} />

        {/* 1. Prominent Quick Actions Hub (Right at the top as large touch buttons) */}
        <View style={styles.largeQuickHubSection}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionOverlineTitle}>QUICK ACTIONS</Text>
            <Text style={styles.sectionSubtitle}>Instant shortcuts</Text>
          </View>

          <View style={styles.largeQuickGrid}>
            <View style={styles.largeQuickRow}>
              {/* Sales Action Card */}
              <TouchableOpacity
                style={styles.largeActionCard}
                onPress={() => setActiveTab('sales')}
                activeOpacity={0.8}
              >
                <View style={styles.largeActionTopRow}>
                  <View style={[styles.largeActionIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <Ionicons name="cart" size={22} color="#059669" />
                  </View>
                  <View style={styles.largeActionArrowPill}>
                    <Ionicons name="arrow-forward" size={13} color="#059669" />
                  </View>
                </View>
                <Text style={styles.largeActionTitle}>Sales</Text>
                <Text style={styles.largeActionSub}>POS & Orders</Text>
              </TouchableOpacity>

              {/* Inventory Action Card */}
              <TouchableOpacity
                style={styles.largeActionCard}
                onPress={() => setActiveTab('stock')}
                activeOpacity={0.8}
              >
                <View style={styles.largeActionTopRow}>
                  <View style={[styles.largeActionIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <Ionicons name="cube" size={22} color="#2563EB" />
                  </View>
                  {inventoryStats.low > 0 ? (
                    <View style={styles.inventoryAlertPill}>
                      <Text style={styles.inventoryAlertText}>{inventoryStats.low} Low</Text>
                    </View>
                  ) : (
                    <View style={styles.largeActionArrowPill}>
                      <Ionicons name="arrow-forward" size={13} color="#2563EB" />
                    </View>
                  )}
                </View>
                <Text style={styles.largeActionTitle}>Inventory</Text>
                <Text
                  style={[
                    styles.largeActionSub,
                    inventoryStats.low > 0 && { color: '#D97706', fontFamily: fonts.semiBold },
                  ]}
                >
                  {inventoryStats.low > 0 ? `${inventoryStats.low} items low` : 'Manage stock'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.largeQuickRow}>
              {/* Expenses Action Card */}
              <TouchableOpacity
                style={styles.largeActionCard}
                onPress={() => setActiveTab('expenses')}
                activeOpacity={0.8}
              >
                <View style={styles.largeActionTopRow}>
                  <View style={[styles.largeActionIconBox, { backgroundColor: '#FFFBEB' }]}>
                    <Ionicons name="wallet" size={22} color="#D97706" />
                  </View>
                  <View style={styles.largeActionArrowPill}>
                    <Ionicons name="arrow-forward" size={13} color="#D97706" />
                  </View>
                </View>
                <Text style={styles.largeActionTitle}>Expenses</Text>
                <Text style={styles.largeActionSub}>Track & add costs</Text>
              </TouchableOpacity>

              {/* Reports Action Card */}
              <TouchableOpacity
                style={styles.largeActionCard}
                onPress={() => setActiveTab('reports')}
                activeOpacity={0.8}
              >
                <View style={styles.largeActionTopRow}>
                  <View style={[styles.largeActionIconBox, { backgroundColor: '#FAF5FF' }]}>
                    <Ionicons name="bar-chart" size={22} color="#7C3AED" />
                  </View>
                  <View style={styles.largeActionArrowPill}>
                    <Ionicons name="arrow-forward" size={13} color="#7C3AED" />
                  </View>
                </View>
                <Text style={styles.largeActionTitle}>Reports</Text>
                <Text style={styles.largeActionSub}>Analytics & growth</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 1. Executive Net Sales Hero Card */}
        <LinearGradient
          colors={['#043F20', '#08582C', '#0E733B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.netSalesHeroCard}
        >
          {/* Top row: Label & Trend Pill */}
          <View style={styles.heroTopRow}>
            <View style={styles.heroLabelGroup}>
              <View style={styles.heroSparkleCircle}>
              </View>
              <Text style={styles.heroOverline}>TODAY'S NET SALES</Text>
            </View>

            <View
              style={[
                styles.heroTrendPill,
                reportStats?.salesTrendPositive === false && styles.heroTrendPillNegative,
              ]}
            >
              <Ionicons
                name={reportStats?.salesTrendPositive === false ? 'trending-down' : 'trending-up'}
                size={13}
                color={reportStats?.salesTrendPositive === false ? '#FCA5A5' : '#6EE7B7'}
              />
              <Text
                style={[
                  styles.heroTrendText,
                  reportStats?.salesTrendPositive === false && styles.heroTrendTextNegative,
                ]}
              >
                {reportStats?.salesTrend ?? '0%'}
              </Text>
            </View>
          </View>

          {/* Large Hero Amount */}
          <View style={styles.heroAmountRow}>
            {loadingReport ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={styles.heroLoader} />
            ) : (
              <Text style={styles.heroAmountText}>{formatRs(reportStats?.totalSales ?? 0)}</Text>
            )}
          </View>

          {/* Quick Metrics Glance Bar (Orders, Margin, Avg Ticket) */}
          <View style={styles.heroGlanceBar}>
            <View style={styles.heroGlanceItem}>
              <Text style={styles.heroGlanceLabel}>ORDERS</Text>
              <Text style={styles.heroGlanceValue}>
                {(reportStats?.totalOrders ?? 0).toLocaleString()}
              </Text>
            </View>
            <View style={styles.heroGlanceDivider} />
            <View style={styles.heroGlanceItem}>
              <Text style={styles.heroGlanceLabel}>MARGIN</Text>
              <Text style={styles.heroGlanceValue}>{reportStats?.profitMargin ?? 0}%</Text>
            </View>
            <View style={styles.heroGlanceDivider} />
            <View style={styles.heroGlanceItem}>
              <Text style={styles.heroGlanceLabel}>AVG TICKET</Text>
              <Text style={styles.heroGlanceValue}>
                {formatRs(reportStats?.avgOrderValue ?? 0)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* 1.5 Cashier Till / Cash in Drawer Live Card */}
        <CashDrawerCard
          cashSession={cashSession}
          cashSales={reportData?.paymentBreakdown.cash ?? 0}
          cashExpenses={reportData?.stats.totalExpense ?? 0}
          loading={loadingCashSession || loadingReport}
        />

        {/* 1.8 Stock & Inventory Health Special Card */}
        <StockOverviewCard
          totalProducts={inventoryStats.total}
          lowStockCount={inventoryStats.low}
          outOfStockCount={inventoryStats.out}
          loading={loadingInventory}
          onViewLowStock={() => {
            setStockFilterType('low');
            setActiveTab('stock');
          }}
          onViewAllStock={() => {
            setStockFilterType('all');
            setActiveTab('stock');
          }}
        />

        {/* 1.9 Vital Signs Pair: Net Profit & Store Expenses */}
        <View style={styles.vitalMetricsRow}>
          {/* Card 1: Net Profit */}
          <View style={styles.vitalCard}>
            <View style={styles.vitalCardTop}>
              <View style={[styles.vitalIconBadge, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="trending-up-outline" size={15} color="#059669" />
              </View>
              <Text style={styles.vitalLabel}>Net Profit</Text>
            </View>
            {loadingReport ? (
              <ActivityIndicator size="small" color="#059669" style={styles.vitalLoader} />
            ) : (
              <Text style={[styles.vitalValue, { color: '#047857' }]}>
                {formatRs(reportStats?.revenue ?? 0)}
              </Text>
            )}
            <View style={styles.vitalFooterRow}>
              <Ionicons name="shield-checkmark-outline" size={11} color="#059669" />
              <Text style={[styles.vitalFooterText, { color: '#059669' }]}>
                {reportStats?.profitMargin ?? 0}% margin
              </Text>
            </View>
          </View>

          {/* Card 2: Store Expenses */}
          <TouchableOpacity
            style={styles.vitalCard}
            onPress={() => setActiveTab('expenses')}
            activeOpacity={0.75}
          >
            <View style={styles.vitalCardTop}>
              <View style={[styles.vitalIconBadge, { backgroundColor: '#FEF2F2' }]}>
                <Ionicons name="receipt-outline" size={15} color="#DC2626" />
              </View>
              <Text style={styles.vitalLabel}>Store Expenses</Text>
            </View>
            {loadingReport ? (
              <ActivityIndicator size="small" color="#DC2626" style={styles.vitalLoader} />
            ) : (
              <Text style={[styles.vitalValue, { color: '#B91C1C' }]}>
                {formatRs(reportStats?.totalExpense ?? 0)}
              </Text>
            )}
            <View style={styles.vitalFooterRow}>
              <Text style={[styles.vitalFooterText, { color: '#DC2626' }]}>
                View costs →
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* 2. Today's Sales Overview Chart (Placed below special cards) */}
        <View style={styles.chartSectionWrapper}>
          <SalesOverviewCard
            title="Today's Sales Momentum"
            actionLabel="View all"
            onActionPress={() => setActiveTab('sales')}
            chartData={salesOverviewData}
            total={reportStats?.totalSales ?? 0}
            trendPercentage={reportStats?.salesTrend ?? '0%'}
            trendPositive={reportStats?.salesTrendPositive !== false}
            loading={loadingReport}
            variant="line"
            firstAxisStep={DAILY_VIEW_FIRST_STEP}
          />
        </View>

        {/* 3. Top Selling Products Leaderboard */}
        <View style={styles.topProductsSpacer}>
          <TopProductsCard
            title="Fast Moving Products"
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
      {/* Ambient Top Glow background style */}
      <View style={styles.ambientTopGlow} pointerEvents="none" />

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
    const userEmail = currentUser?.email || 'owner@bizznet.lk';

    return (
      <ScrollView
        style={styles.profileTabScroll}
        contentContainerStyle={styles.profileScrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Ambient Top Glow background style */}
        <View style={styles.ambientTopGlow} pointerEvents="none" />

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
          <TouchableOpacity
            style={styles.openHistoryButton}
            onPress={openNotificationModal}
            activeOpacity={0.7}
          >
            <Ionicons name="notifications" size={13} color={colors.primary} />
            <Text style={styles.openHistoryButtonText}>View History ({unreadCount})</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.profileCardGroup}>
          {/* New Order Alerts */}
          <View style={[styles.notificationRow, styles.shopRowDivider]}>
            <View style={styles.notificationInfo}>
              <Text style={styles.notificationTitle}>New Order Alerts</Text>
              <Text style={styles.notificationSubtitle}>Notification for every sale made</Text>
            </View>
            <Switch
              value={notificationSettings.orderAlerts}
              onValueChange={(val) => updateNotificationSettings({ orderAlerts: val })}
              trackColor={{ false: '#E2E8F0', true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E2E8F0"
            />
          </View>

          {/* Stock Update Alerts */}
          <View style={[styles.notificationRow, styles.shopRowDivider]}>
            <View style={styles.notificationInfo}>
              <Text style={styles.notificationTitle}>Stock Update Alerts</Text>
              <Text style={styles.notificationSubtitle}>Notification for inventory stock changes</Text>
            </View>
            <Switch
              value={notificationSettings.stockUpdateAlerts}
              onValueChange={(val) => updateNotificationSettings({ stockUpdateAlerts: val })}
              trackColor={{ false: '#E2E8F0', true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E2E8F0"
            />
          </View>

          {/* Low Stock Warnings */}
          <View style={[styles.notificationRow, styles.shopRowDivider]}>
            <View style={styles.notificationInfo}>
              <Text style={styles.notificationTitle}>Low Stock Warnings</Text>
              <Text style={styles.notificationSubtitle}>Warning alert when item hits reorder level or 0</Text>
            </View>
            <Switch
              value={notificationSettings.lowStockAlerts}
              onValueChange={(val) => updateNotificationSettings({ lowStockAlerts: val })}
              trackColor={{ false: '#E2E8F0', true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E2E8F0"
            />
          </View>

          {/* Daily Closing Summary */}
          <View style={styles.notificationRow}>
            <View style={styles.notificationInfo}>
              <Text style={styles.notificationTitle}>Daily Sales Summary</Text>
              <Text style={styles.notificationSubtitle}>Income recap sent every evening after 6:00 pm</Text>
            </View>
            <Switch
              value={notificationSettings.dailyClosingAlerts}
              onValueChange={(val) => updateNotificationSettings({ dailyClosingAlerts: val })}
              trackColor={{ false: '#E2E8F0', true: colors.primary }}
              thumbColor="#FFFFFF"
              ios_backgroundColor="#E2E8F0"
            />
          </View>
        </View>

        {/* Quick Test Actions Card */}
        <View style={styles.testActionsCard}>
          <Text style={styles.testActionsTitle}>Test Notification Alerts</Text>
          <Text style={styles.testActionsSubtitle}>
            Tap below to trigger instant preview notifications for testing:
          </Text>
          <View style={styles.testGrid}>
            <TouchableOpacity
              style={styles.testGridButton}
              onPress={() => sendTestNotification('order')}
              activeOpacity={0.7}
            >
              <Ionicons name="bag-check" size={15} color="#059669" />
              <Text style={styles.testGridButtonText}>Test Order</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.testGridButton}
              onPress={() => sendTestNotification('stock_update')}
              activeOpacity={0.7}
            >
              <Ionicons name="cube" size={15} color="#2563EB" />
              <Text style={styles.testGridButtonText}>Test Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.testGridButton}
              onPress={() => sendTestNotification('low_stock')}
              activeOpacity={0.7}
            >
              <Ionicons name="warning" size={15} color="#DC2626" />
              <Text style={styles.testGridButtonText}>Test Low Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.testGridButton}
              onPress={() => sendTestNotification('daily_summary')}
              activeOpacity={0.7}
            >
              <Ionicons name="stats-chart" size={15} color="#7C3AED" />
              <Text style={styles.testGridButtonText}>Test 6 PM Recap</Text>
            </TouchableOpacity>
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

        {/* 5. Brand Footer */}
        <View style={styles.profileBrandFooter}>
          <View style={styles.profileBrandLogoCard}>
            <Image
              source={require('@/assets/images/bizznet-logo.png')}
              style={styles.profileBrandLogo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.profileBrandName}>BizzNet</Text>
          <Text style={styles.profileBrandSubtitle}>Smart Business Analyzer & POS Terminal</Text>
          <Text style={styles.profileBrandVersion}>v1.0.0 • Powered by Nexzt Solution</Text>
        </View>
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      {/* Dynamic Ambient Background Style */}
      <AppBackground />
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
    fontFamily: fonts.medium,
    color: '#64748B',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontFamily: fonts.bold,
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
    fontFamily: fonts.medium,
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
    backgroundColor: 'transparent',
  },
  homeScrollContent: {
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'android' ? 12 : 8,
    paddingBottom: 32,
  },
  ambientTopGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
    backgroundColor: '#ECFDF5',
    opacity: 0.6,
  },
  whiteHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerBrandCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBrandTextGroup: {
    justifyContent: 'center',
  },
  headerBrandTitle: {
    fontSize: 18,
    fontFamily: fonts.extraBold,
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  liveStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    gap: 5,
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  liveStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  liveStatusText: {
    fontSize: 9,
    fontFamily: fonts.bold,
    color: '#047857',
    letterSpacing: 0.8,
  },
  headerLogoCard: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    padding: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  headerMiniLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  headerTopRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerNotificationButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  headerBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: fonts.bold,
  },
  headerProfileSquircle: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerProfileInitials: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#0D7F41',
    letterSpacing: 0.5,
  },
  headerGreetingSection: {
    marginBottom: 16,
  },
  headerDateBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  headerDateBadge: {
    fontSize: 11.5,
    fontFamily: fonts.semiBold,
    color: '#059669',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  headerGreetingText: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerBranchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  headerBranchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  headerBranchIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBranchTextCol: {
    flex: 1,
  },
  headerBranchOverline: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    color: '#64748B',
    letterSpacing: 0.8,
  },
  headerBranchName: {
    fontSize: 13.5,
    fontFamily: fonts.semiBold,
    color: '#0F172A',
    marginTop: 1,
  },
  headerBranchSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0D7F41',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
  },
  headerBranchSwitchText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: '#FFFFFF',
  },

  // 1. Executive Net Sales Hero Card
  netSalesHeroCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#043A1D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  heroLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroSparkleCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(52, 211, 153, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverline: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#A7F3D0',
    letterSpacing: 1,
  },
  heroTrendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5, 150, 105, 0.35)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
  },
  heroTrendPillNegative: {
    backgroundColor: 'rgba(220, 38, 38, 0.25)',
    borderColor: 'rgba(248, 113, 113, 0.3)',
  },
  heroTrendText: {
    fontSize: 11.5,
    fontFamily: fonts.bold,
    color: '#6EE7B7',
  },
  heroTrendTextNegative: {
    color: '#FCA5A5',
  },
  heroAmountRow: {
    marginVertical: 4,
  },
  heroLoader: {
    alignSelf: 'flex-start',
    marginVertical: 8,
  },
  heroAmountText: {
    fontSize: 30,
    fontFamily: fonts.extraBold,
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  heroGlanceBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  heroGlanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  heroGlanceLabel: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    color: '#A7F3D0',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  heroGlanceValue: {
    fontSize: 13.5,
    fontFamily: fonts.bold,
    color: '#FFFFFF',
  },
  heroGlanceDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },

  // 1. Prominent Top Quick Actions
  largeQuickHubSection: {
    marginBottom: 20,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionOverlineTitle: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#64748B',
    letterSpacing: 0.8,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#64748B',
  },
  largeQuickGrid: {
    gap: 10,
  },
  largeQuickRow: {
    flexDirection: 'row',
    gap: 10,
  },
  largeActionCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    justifyContent: 'space-between',
    minHeight: 96,
  },
  largeActionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  largeActionIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  largeActionArrowPill: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inventoryAlertPill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  inventoryAlertText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: '#D97706',
  },
  largeActionTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  largeActionSub: {
    fontSize: 11.5,
    fontFamily: fonts.regular,
    color: '#64748B',
    marginTop: 2,
  },

  // Vital Signs Pair Row
  vitalMetricsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  vitalCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  vitalCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 6,
  },
  vitalIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vitalLabel: {
    fontSize: 11.5,
    fontFamily: fonts.semiBold,
    color: '#64748B',
  },
  vitalValue: {
    fontSize: 18,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
    marginVertical: 2,
  },
  vitalLoader: {
    marginVertical: 4,
    alignSelf: 'flex-start',
  },
  vitalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  vitalFooterText: {
    fontSize: 10.5,
    fontFamily: fonts.medium,
  },
  chartSectionWrapper: {
    marginBottom: 6,
  },

  homeBodyContent: {
    marginTop: 0,
  },
  tabScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 24,
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  pageSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.bold,
    marginBottom: 4,
  },
  stockStatLabel: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
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
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontFamily: fonts.bold,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.semiBold,
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.semiBold,
    color: '#1E293B',
  },
  filterMenuLabelActive: {
    fontFamily: fonts.bold,
  },
  filterMenuSub: {
    fontSize: 11,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.semiBold,
    color: colors.textPrimary,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stockItemCode: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: colors.textMuted,
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.bold,
    color: colors.primaryText,
  },
  stockQtyNumLow: {
    color: colors.dangerText,
  },
  stockQtyUnit: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: colors.primaryText,
  },

  // ----------------------------------------------------
  // Profile Tab Styles (Matching uploaded design & theme)
  // ----------------------------------------------------
  profileTabScroll: {
    flex: 1,
    backgroundColor: 'transparent',
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  profileSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
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
    fontFamily: fonts.bold,
    color: '#0D7F41',
  },
  profileUserInfo: {
    marginLeft: 16,
    flex: 1,
  },
  profileUserName: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#18181B',
  },
  profileUserEmail: {
    fontSize: 14,
    fontFamily: fonts.regular,
    color: '#71717A',
    marginTop: 3,
  },
  profileSectionHeader: {
    marginBottom: 12,
  },
  profileSectionTitle: {
    fontFamily: fonts.bold,
    fontSize: 20,
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
    fontFamily: fonts.regular,
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
    fontFamily: fonts.bold,
    color: '#18181B',
  },
  shopCode: {
    fontSize: 13,
    fontFamily: fonts.medium,
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.semiBold,
    color: '#18181B',
  },
  notificationSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#71717A',
    marginTop: 2,
  },
  openHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  openHistoryButtonText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  testActionsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  testActionsTitle: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#1E293B',
    marginBottom: 4,
  },
  testActionsSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#64748B',
    marginBottom: 12,
    lineHeight: 17,
  },
  testGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  testGridButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  testGridButtonText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: '#334155',
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
    fontFamily: fonts.bold,
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
    fontFamily: fonts.medium,
  },
  tabLabelActive: {
    color: colors.tabActiveText,
    fontFamily: fonts.bold,
  },
  tabLabelInactive: {
    color: colors.tabInactiveText,
    fontFamily: fonts.medium,
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
    fontFamily: fonts.medium,
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },

  // ----------------------------------------------------
  // Profile Brand Footer
  // ----------------------------------------------------
  profileBrandFooter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    marginTop: 10,
    marginBottom: 20,
  },
  profileBrandLogoCard: {
    width: 60,
    height: 60,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  profileBrandLogo: {
    width: 52,
    height: 52,
    borderRadius: 12,
  },
  profileBrandName: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  profileBrandSubtitle: {
    fontSize: 12.5,
    color: colors.textSecondary,
    marginTop: 2,
    fontFamily: fonts.medium,
  },
  profileBrandVersion: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 6,
    fontFamily: fonts.semiBold,
    letterSpacing: 0.2,
  },
});