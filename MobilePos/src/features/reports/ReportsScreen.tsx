import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useBranch } from '../branches/BranchContext';
import { colors } from '@/constants/colors';
import { toLocalYmd } from '@/lib/reporting';
import LoadErrorBanner, { describeLoadError } from '@/components/LoadErrorBanner';
import {
  reportsApi,
  ReportFilterType,
  ReportResponse,
  CustomDateRange,
} from './reportsApi';
import TopProductsCard from './TopProductsCard';

interface FilterOption {
  id: ReportFilterType;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'today', label: 'Today' },
  { id: '7day', label: '7 Days' },
  { id: 'month', label: 'This Month' },
  { id: 'year', label: 'This Year' },
  { id: 'custom', label: 'Custom' },
];

export default function ReportsScreen() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id ?? '';

  const [activeFilter, setActiveFilter] = useState<ReportFilterType>('today');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);

  // Custom Date Range Modal State
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [customRange, setCustomRange] = useState<CustomDateRange>(() => {
    const today = new Date();
    const end = toLocalYmd(today);
    const past = new Date(today);
    past.setDate(past.getDate() - 14);
    const start = toLocalYmd(past);
    return {
      startDate: start,
      endDate: end,
      label: `${past.getDate()} ${past.toLocaleDateString('en-GB', { month: 'short' })} – ${today.getDate()} ${today.toLocaleDateString('en-GB', { month: 'short' })}`,
    };
  });
  const [tempStartDate, setTempStartDate] = useState<string>(() => {
    const past = new Date();
    past.setDate(past.getDate() - 14);
    return toLocalYmd(past);
  });
  const [tempEndDate, setTempEndDate] = useState<string>(() => {
    return toLocalYmd(new Date());
  });

  // Load Report Data
  const loadData = useCallback(
    async (filter: ReportFilterType, range?: CustomDateRange) => {
      try {
        const data = await reportsApi.getReportData(branchId, filter, range);
        setReportData(data);
        setLoadError(null);
      } catch (err) {
        setReportData(null);
        setLoadError(describeLoadError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchId]
  );

  useEffect(() => {
    let isCancelled = false;
    reportsApi
      .getReportData(branchId, activeFilter, activeFilter === 'custom' ? customRange : undefined)
      .then((data) => {
        if (!isCancelled) {
          setReportData(data);
          setLoadError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setReportData(null);
          setLoadError(describeLoadError(err));
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [branchId, activeFilter, customRange]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(activeFilter, activeFilter === 'custom' ? customRange : undefined);
  }, [activeFilter, customRange, loadData]);

  // Handle Filter Pill Press
  const handleFilterPress = (filter: ReportFilterType) => {
    if (filter === 'custom') {
      setActiveFilter('custom');
      setIsCustomModalOpen(true);
    } else {
      setLoading(true);
      setActiveFilter(filter);
    }
  };

  // Apply Custom Date Range
  const handleApplyCustomRange = () => {
    const sDate = new Date(`${tempStartDate}T00:00:00`);
    const eDate = new Date(`${tempEndDate}T00:00:00`);
    const formattedLabel = `${sDate.getDate()} ${sDate.toLocaleDateString('en-GB', { month: 'short' })} – ${eDate.getDate()} ${eDate.toLocaleDateString('en-GB', { month: 'short' })}`;

    const newRange: CustomDateRange = {
      startDate: tempStartDate,
      endDate: tempEndDate,
      label: formattedLabel,
    };
    setLoading(true);
    setCustomRange(newRange);
    setIsCustomModalOpen(false);
    setActiveFilter('custom');
  };

  const setQuickRange = (days: number) => {
    const today = new Date();
    const end = toLocalYmd(today);
    const past = new Date(today);
    past.setDate(past.getDate() - days);
    const start = toLocalYmd(past);
    setTempStartDate(start);
    setTempEndDate(end);
  };

  const formatRs = (num: number) => {
    return 'Rs. ' + Math.round(num).toLocaleString();
  };


  const stats = reportData?.stats ?? {
    totalSales: 0,
    revenue: 0,
    totalExpense: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    profitMargin: 0,
    salesTrend: '0%',
    salesTrendPositive: true,
    expenseTrend: '0%',
    expenseTrendPositive: true,
  };

  const topProducts = reportData?.topProducts ?? [];
  const inventorySummary = reportData?.inventorySummary ?? { totalProducts: 0, lowStock: 0, outOfStock: 0 };

  // Net result after expenses: profit, loss or break-even.
  const health =
    stats.revenue > 0
      ? { label: 'Profitable', bg: '#DCFCE7', fg: '#15803D' }
      : stats.revenue < 0
        ? { label: 'Loss', bg: '#FEE2E2', fg: '#B91C1C' }
        : { label: 'Break-even', bg: '#FEF3C7', fg: '#B45309' };


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {/* 1. Header Section */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Financial Reports</Text>
          <Text style={styles.headerSubtitle}>
            {reportData?.dateLabel ? `${reportData.dateLabel} overview` : 'Business performance & metrics'}
          </Text>
        </View>
      </View>

      <LoadErrorBanner message={loadError} onRetry={onRefresh} />

      {/* 2. Top Filter Pills Row (today, 7day, month, year, custom) */}
      <View style={styles.filterScrollWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTER_OPTIONS.map((opt) => {
            const isActive = activeFilter === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[styles.filterPill, isActive && styles.filterPillActive]}
                onPress={() => handleFilterPress(opt.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Custom Range Info Pill (Only shown when Custom is active) */}
      {activeFilter === 'custom' && (
        <TouchableOpacity
          style={styles.customBadgeRow}
          onPress={() => setIsCustomModalOpen(true)}
          activeOpacity={0.7}
        >
          <View style={styles.customBadgeLeft}>
            <Ionicons name="calendar-outline" size={14} color={colors.primary} />
            <Text style={styles.customBadgeText}>
              Selected: {customRange.label || `${customRange.startDate} to ${customRange.endDate}`}
            </Text>
          </View>
          <Text style={styles.customBadgeAction}>Change</Text>
        </TouchableOpacity>
      )}

      {/* 3. The 4 Metric Cards Grid (Matching reference design) */}
      <View style={styles.cardsGrid}>
        {/* Row 1: Total Sales & Revenue */}
        <View style={styles.cardRow}>
          {/* Card 1: Total Sales */}
          <View style={styles.metricCard}>
            <View style={styles.iconCircleMint}>
              <Ionicons name="trending-up" size={20} color="#059669" />
            </View>
            <Text style={styles.cardLabel}>Total Sales</Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.cardLoader} />
            ) : (
              <Text style={styles.cardValue}>{formatRs(stats.totalSales)}</Text>
            )}
            <View style={styles.cardFooterRow}>
              <Ionicons
                name={stats.salesTrendPositive ? 'arrow-up-circle' : 'arrow-down-circle'}
                size={12}
                color={stats.salesTrendPositive ? '#16A34A' : '#DC2626'}
              />
              <Text
                style={[
                  styles.trendText,
                  { color: stats.salesTrendPositive ? '#16A34A' : '#DC2626' },
                ]}
              >
                {stats.salesTrend} vs prev
              </Text>
            </View>
          </View>

          {/* Card 2: Revenue */}
          <View style={styles.metricCard}>
            <View style={styles.iconCircleMint}>
              <Ionicons name="wallet-outline" size={20} color="#059669" />
            </View>
            <Text style={styles.cardLabel}>Revenue</Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.cardLoader} />
            ) : (
              <Text style={styles.cardValue}>{formatRs(stats.revenue)}</Text>
            )}
            <View style={styles.cardFooterRow}>
              <Ionicons name="shield-checkmark-outline" size={12} color="#059669" />
              <Text style={[styles.trendText, { color: '#059669' }]}>
                {stats.profitMargin}% margin
              </Text>
            </View>
          </View>
        </View>

        {/* Row 2: Total Expense & Total Orders */}
        <View style={styles.cardRow}>
          {/* Card 3: Total Expense */}
          <View style={styles.metricCard}>
            <View style={[styles.iconCircleMint, { backgroundColor: '#F0FDF4' }]}>
              <Ionicons name="receipt-outline" size={20} color="#059669" />
            </View>
            <Text style={styles.cardLabel}>Total Expense</Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.cardLoader} />
            ) : (
              <Text style={styles.cardValue}>{formatRs(stats.totalExpense)}</Text>
            )}
            <View style={styles.cardFooterRow}>
              <Ionicons
                name={stats.expenseTrendPositive ? 'arrow-down-circle' : 'arrow-up-circle'}
                size={12}
                color={stats.expenseTrendPositive ? '#16A34A' : '#D97706'}
              />
              <Text
                style={[
                  styles.trendText,
                  { color: stats.expenseTrendPositive ? '#16A34A' : '#D97706' },
                ]}
              >
                {stats.expenseTrend} expenses
              </Text>
            </View>
          </View>

          {/* Card 4: Total Orders */}
          <View style={styles.metricCard}>
            <View style={styles.iconCircleMint}>
              <Ionicons name="bag-handle-outline" size={20} color="#059669" />
            </View>
            <Text style={styles.cardLabel}>Total Orders</Text>
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} style={styles.cardLoader} />
            ) : (
              <Text style={styles.cardValue}>{stats.totalOrders.toLocaleString()}</Text>
            )}
            <View style={styles.cardFooterRow}>
              <Ionicons name="pricetag-outline" size={12} color={colors.textMuted} />
              <Text style={styles.trendText}>
                Avg {formatRs(stats.avgOrderValue)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* 4. Financial Health & Net Performance Summary Card */}
      <View style={styles.healthCard}>
        <View style={styles.healthHeaderRow}>
          <View>
            <Text style={styles.healthTitle}>Net Income Balance</Text>
            <Text style={styles.healthSub}>Sales vs Expenses overview</Text>
          </View>
          <View
            style={[
              styles.healthStatusPill,
              { backgroundColor: health.bg },
            ]}
          >
            <Text
              style={[
                styles.healthStatusText,
                { color: health.fg },
              ]}
            >
              {health.label}
            </Text>
          </View>
        </View>

        {/* Visual Progress Bar Ratio */}
        <View style={styles.progressBarWrapper}>
          <View
            style={[
              styles.progressSalesPortion,
              { flex: Math.max(stats.totalSales, 1) },
            ]}
          />
          <View
            style={[
              styles.progressExpensePortion,
              { flex: Math.max(stats.totalExpense, 1) },
            ]}
          />
        </View>

        {/* Summary Legend */}
        <View style={styles.legendRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
            <Text style={styles.legendLabel}>Sales: </Text>
            <Text style={styles.legendValue}>{formatRs(stats.totalSales)}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
            <Text style={styles.legendLabel}>Expenses: </Text>
            <Text style={styles.legendValue}>{formatRs(stats.totalExpense)}</Text>
          </View>
        </View>
      </View>

      {/* 5. Top Products Card */}
      <TopProductsCard products={topProducts} />

      {/* 6. Inventory Summary Card */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionCardTitle}>Inventory Summary</Text>

        <View style={styles.inventoryColumnsRow}>
          {/* Total Products */}
          <View style={styles.inventoryCol}>
            <View style={[styles.inventoryIconBox, styles.inventoryIconBoxGreen]}>
              <Feather name="box" size={22} color="#059669" />
            </View>
            <Text style={styles.inventoryCount}>
              {inventorySummary.totalProducts}
            </Text>
            <Text style={styles.inventoryLabel}>Total Products</Text>
          </View>

          {/* Divider */}
          <View style={styles.inventoryDivider} />

          {/* Low Stock */}
          <View style={styles.inventoryCol}>
            <View style={[styles.inventoryIconBox, styles.inventoryIconBoxOrange]}>
              <Feather name="box" size={22} color="#D97706" />
            </View>
            <Text style={styles.inventoryCount}>
              {inventorySummary.lowStock}
            </Text>
            <Text style={styles.inventoryLabel}>Low Stock</Text>
          </View>

          {/* Divider */}
          <View style={styles.inventoryDivider} />

          {/* Out of Stock */}
          <View style={styles.inventoryCol}>
            <View style={[styles.inventoryIconBox, styles.inventoryIconBoxRed]}>
              <Feather name="box" size={22} color="#DC2626" />
            </View>
            <Text style={styles.inventoryCount}>
              {inventorySummary.outOfStock}
            </Text>
            <Text style={styles.inventoryLabel}>Out of Stock</Text>
          </View>
        </View>
      </View>

      {/* 7. Custom Date Range Modal */}
      <Modal
        visible={isCustomModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsCustomModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setIsCustomModalOpen(false)}
        >
          <TouchableOpacity
            style={styles.modalContent}
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Custom Date Range</Text>
                <Text style={styles.modalSubtitle}>Select period for report analysis</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsCustomModalOpen(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <Text style={styles.modalSectionLabel}>QUICK PRESETS</Text>
            <View style={styles.presetRow}>
              {[
                { label: '7 Days', days: 7 },
                { label: '14 Days', days: 14 },
                { label: '30 Days', days: 30 },
                { label: '90 Days', days: 90 },
              ].map((p) => (
                <TouchableOpacity
                  key={p.days}
                  style={styles.presetBtn}
                  onPress={() => setQuickRange(p.days)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.presetBtnText}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Manual Date Inputs */}
            <View style={styles.dateInputsRow}>
              <View style={styles.dateInputCol}>
                <Text style={styles.inputLabel}>START DATE (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.dateInput}
                  value={tempStartDate}
                  onChangeText={setTempStartDate}
                  placeholder="2026-01-01"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <View style={styles.dateInputCol}>
                <Text style={styles.inputLabel}>END DATE (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.dateInput}
                  value={tempEndDate}
                  onChangeText={setTempEndDate}
                  placeholder="2026-01-31"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsCustomModalOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalApplyBtn}
                onPress={handleApplyCustomRange}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[colors.primary, colors.primaryDark]}
                  style={styles.modalApplyGradient}
                >
                  <Text style={styles.modalApplyText}>Apply Range</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAF9',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  branchBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
    maxWidth: 140,
  },
  branchBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
  },

  // Filter Pills Scroll
  filterScrollWrapper: {
    marginBottom: 16,
  },
  filterScrollContent: {
    gap: 8,
    paddingVertical: 4,
  },
  filterPill: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterPillActive: {
    backgroundColor: '#16A34A', // Vibrant Green matching reference design
    borderColor: '#16A34A',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  customBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  customBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#065F46',
  },
  customBadgeAction: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },

  // 4 Metric Cards Grid
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
  iconCircleMint: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#E8F8EE', // Matching light mint squircle in reference image
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
    marginBottom: 4,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  cardLoader: {
    marginVertical: 4,
    alignSelf: 'flex-start',
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  trendText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },

  // Health Card
  healthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  healthHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  healthTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  healthSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  healthStatusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  healthStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBarWrapper: {
    height: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    flexDirection: 'row',
    overflow: 'hidden',
    marginVertical: 8,
  },
  progressSalesPortion: {
    backgroundColor: '#10B981',
  },
  progressExpensePortion: {
    backgroundColor: '#F59E0B',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  legendLabel: {
    fontSize: 12,
    color: '#64748B',
  },
  legendValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },




  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  modalSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    alignItems: 'center',
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  dateInputsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  dateInputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  dateInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  modalActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  modalApplyBtn: {
    flex: 1.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  modalApplyGradient: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalApplyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Section Cards (Top Products & Inventory Summary matching reference design)
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  sectionCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 20,
    letterSpacing: -0.3,
  },

  // Inventory Summary
  inventoryColumnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  inventoryCol: {
    flex: 1,
    alignItems: 'center',
  },
  inventoryIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  inventoryIconBoxGreen: {
    backgroundColor: '#E8F8EE',
  },
  inventoryIconBoxOrange: {
    backgroundColor: '#FFF7ED',
  },
  inventoryIconBoxRed: {
    backgroundColor: '#FEF2F2',
  },
  inventoryCount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  inventoryLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
  },
  inventoryDivider: {
    width: 1,
    height: 56,
    backgroundColor: '#F1F5F9',
  },
});
