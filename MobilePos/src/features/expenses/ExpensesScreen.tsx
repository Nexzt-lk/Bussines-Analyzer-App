import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Dimensions,
  LayoutChangeEvent,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useBranch } from '../branches/BranchContext';
import { colors } from '@/constants/colors';
import { toLocalYmd } from '@/lib/reporting';
import LoadErrorBanner, { describeLoadError } from '@/components/LoadErrorBanner';
import BarDetailPanel, { formatCompactNumber, getNiceAxis } from '@/components/BarDetailPanel';
import {
  expensesApi,
  ExpenseFilterType,
  ExpenseRecord,
  ExpensesReportResponse,
  CustomDateRange,
} from './expensesApi';

interface FilterOption {
  id: ExpenseFilterType;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'today', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'custom', label: 'Custom' },
];

// Category Icons & Badges
const getCategoryIcon = (cat?: string): { name: any; bg: string; color: string } => {
  const normalized = (cat || '').toLowerCase();
  if (normalized.includes('invent') || normalized.includes('ingred') || normalized.includes('stock')) {
    return { name: 'cube-outline', bg: '#DCFCE7', color: '#16A34A' };
  }
  if (normalized.includes('util') || normalized.includes('power') || normalized.includes('elect')) {
    return { name: 'flash-outline', bg: '#FEF3C7', color: '#D97706' };
  }
  if (normalized.includes('suppl') || normalized.includes('pack') || normalized.includes('box')) {
    return { name: 'bag-handle-outline', bg: '#E0F2FE', color: '#0284C7' };
  }
  if (normalized.includes('wage') || normalized.includes('salar') || normalized.includes('staff')) {
    return { name: 'people-outline', bg: '#F3E8FF', color: '#9333EA' };
  }
  if (normalized.includes('rent') || normalized.includes('build') || normalized.includes('shop')) {
    return { name: 'business-outline', bg: '#FEE2E2', color: '#DC2626' };
  }
  if (normalized.includes('maint') || normalized.includes('repair') || normalized.includes('service')) {
    return { name: 'construct-outline', bg: '#FFEDD5', color: '#EA580C' };
  }
  return { name: 'receipt-outline', bg: '#F1F5F9', color: '#64748B' };
};

// Room for the value labels (0, 50K, 100K…) on the left of the bar chart.
const Y_AXIS_WIDTH = 36;

export default function ExpensesScreen() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id ?? '';

  const [activeFilter, setActiveFilter] = useState<ExpenseFilterType>('today');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ExpensesReportResponse | null>(null);

  // Card layout width for responsive chart spacing
  const [chartContainerWidth, setChartContainerWidth] = useState<number>(() => {
    return Dimensions.get('window').width - 48;
  });

  // Selected Expense for Detail Modal
  const [selectedExpense, setSelectedExpense] = useState<ExpenseRecord | null>(null);

  // Custom Date Range State & Modal
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

  // Load Expenses Data from live Supabase table
  const loadData = useCallback(
    async (filter: ExpenseFilterType, range?: CustomDateRange) => {
      try {
        const data = await expensesApi.getExpensesData(branchId, filter, range);
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

  // Reloads on branch, filter or custom-range change (applying a new custom
  // range while "Custom" is already selected must refresh the data too).
  useEffect(() => {
    let cancelled = false;
    expensesApi
      .getExpensesData(branchId, activeFilter, activeFilter === 'custom' ? customRange : undefined)
      .then((data) => {
        if (cancelled) return;
        setReportData(data);
        setLoadError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setReportData(null);
        setLoadError(describeLoadError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, activeFilter, customRange]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(activeFilter, activeFilter === 'custom' ? customRange : undefined);
  }, [activeFilter, customRange, loadData]);

  const formatRs = useCallback((num: number) => {
    return 'Rs ' + num.toLocaleString();
  }, []);

  const handleFilterPress = (filterId: ExpenseFilterType) => {
    if (filterId === 'custom') {
      setIsCustomModalOpen(true);
    } else if (filterId !== activeFilter) {
      setLoading(true);
      setActiveFilter(filterId);
    }
  };

  const handleApplyCustomRange = () => {
    // Parse as local calendar days (a bare 'YYYY-MM-DD' would be UTC midnight).
    const s = new Date(`${tempStartDate}T00:00:00`);
    const e = new Date(`${tempEndDate}T00:00:00`);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      Alert.alert('Invalid Date', 'Please provide valid YYYY-MM-DD dates');
      return;
    }
    if (s.getTime() > e.getTime()) {
      Alert.alert('Invalid Range', 'Start date must be on or before the end date.');
      return;
    }
    const label = `${s.getDate()} ${s.toLocaleDateString('en-GB', { month: 'short' })} – ${e.getDate()} ${e.toLocaleDateString('en-GB', { month: 'short' })}`;
    const newRange: CustomDateRange = {
      startDate: tempStartDate,
      endDate: tempEndDate,
      label,
    };
    setLoading(true);
    setCustomRange(newRange);
    setActiveFilter('custom');
    setIsCustomModalOpen(false);
  };

  const onCardLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setChartContainerWidth(width);
    }
  };

  // Distinct category list from Supabase data
  const expenses = reportData?.expenses;
  const categoryList = useMemo(() => {
    const set = new Set<string>();
    for (const e of expenses ?? []) {
      if (e.category) set.add(e.category);
    }
    return ['all', ...Array.from(set)];
  }, [expenses]);

  // Filtered expense records by Category Pill
  const displayedExpenses = useMemo(() => {
    if (!expenses) return [];
    if (selectedCategoryFilter === 'all') return expenses;
    return expenses.filter((e) => e.category === selectedCategoryFilter);
  }, [expenses, selectedCategoryFilter]);

  // Tapped bar. Stored with the data it belongs to, so a new period/filter
  // automatically clears the selection.
  const chartPoints = reportData?.chartData;
  const [barSelection, setBarSelection] = useState<{ data: typeof chartPoints; index: number } | null>(null);
  const selectedBarIndex = chartPoints && barSelection?.data === chartPoints ? barSelection.index : null;
  const onBarPress = (_item: unknown, index: number) =>
    setBarSelection(selectedBarIndex === index ? null : { data: chartPoints, index });

  // Dynamic Chart calculations
  const rawChartData = reportData?.chartData ?? [];
  // Round-number y-axis scaled to the tallest bar.
  const barAxis = getNiceAxis(rawChartData.map((p) => p.value));
  const chartLength = Math.max(rawChartData.length, 1);
  const chartSpacing = useMemo(() => {
    const available = chartContainerWidth - 36;
    return Math.max(28, Math.floor(available / chartLength));
  }, [chartContainerWidth, chartLength]);

  const barWidth = useMemo(() => {
    if (chartLength <= 5) return 32;
    if (chartLength <= 7) return 22;
    return 16;
  }, [chartLength]);

  const barSpacing = useMemo(() => {
    const totalBarsWidth = barWidth * chartLength;
    const remaining = chartContainerWidth - 44 - Y_AXIS_WIDTH - totalBarsWidth;
    return Math.max(14, Math.floor(remaining / (chartLength + 1)));
  }, [chartContainerWidth, chartLength, barWidth]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
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
          <Text style={styles.headerTitle}>Expenses</Text>
          <Text style={styles.headerSubtitle}>Operational costs & spending</Text>
        </View>
      </View>

      <LoadErrorBanner message={loadError} onRetry={onRefresh} />

      {/* 2. Filter Pills Container (Daily, Weekly, Monthly, Custom) */}
      <View style={styles.filterContainer}>
        {FILTER_OPTIONS.map((opt) => {
          const isActive = activeFilter === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.filterPill, isActive && styles.filterPillActive]}
              onPress={() => handleFilterPress(opt.id)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
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
              Range: {customRange.label}
            </Text>
          </View>
          <Text style={styles.customBadgeAction}>Change</Text>
        </TouchableOpacity>
      )}

      {/* 3. Expenses Over Time Card with Chart */}
      <View style={styles.chartCard} onLayout={onCardLayout}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Loading expenses...</Text>
          </View>
        ) : (
          <>
            {/* Card Header: TOTAL EXPENSES and Amount with bill count badge */}
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.expensesLabel}>TOTAL EXPENSES</Text>
                <Text style={styles.expensesAmount}>
                  {formatRs(reportData?.stats.totalExpenses ?? 0)}
                </Text>
              </View>

              <View style={styles.trendBadge}>
                <Ionicons name="receipt" size={13} color="#D97706" />
                <Text style={styles.trendText}>
                  {reportData?.stats.expenseCount ?? 0} {reportData?.stats.expenseCount === 1 ? 'bill' : 'bills'}
                </Text>
              </View>
            </View>

            {/* Chart: Curved Line for Today, BarChart for Weekly & Monthly */}
            <View style={styles.chartWrapper}>
              {activeFilter === 'today' ? (
                <LineChart
                  data={reportData?.chartData ?? []}
                  curved
                  areaChart
                  height={150}
                  spacing={chartSpacing}
                  initialSpacing={12}
                  endSpacing={12}
                  color="#D97706"
                  thickness={3}
                  startFillColor="#FDE68A"
                  endFillColor="#FEF3C7"
                  startOpacity={0.35}
                  endOpacity={0.03}
                  hideDataPoints={false}
                  dataPointsColor="#D97706"
                  dataPointsRadius={4}
                  hideYAxisText
                  yAxisThickness={0}
                  xAxisThickness={0}
                  rulesType="dashed"
                  dashWidth={4}
                  dashGap={4}
                  rulesColor="#F1F5F9"
                  xAxisLabelTextStyle={styles.xAxisLabel}
                  renderTooltip={(item: any) => (
                    <View style={styles.statTooltipCard}>
                      <Text style={styles.statTooltipTitle}>{item.label}</Text>
                      <Text style={styles.statTooltipIncome}>
                        Cost: {formatRs(item.value)}
                      </Text>
                    </View>
                  )}
                />
              ) : (
                <BarChart
                  data={reportData?.chartData ?? []}
                  height={150}
                  barWidth={barWidth}
                  spacing={barSpacing}
                  initialSpacing={14}
                  endSpacing={14}
                  barBorderTopLeftRadius={Math.round(barWidth / 2)}
                  barBorderTopRightRadius={Math.round(barWidth / 2)}
                  barBorderBottomLeftRadius={2}
                  barBorderBottomRightRadius={2}
                  frontColor="transparent"
                  barInnerComponent={(item: any) => {
                    if (!item?.value || item.value <= 0) return null;
                    const topRadius = Math.round(barWidth / 2);
                    return (
                      <LinearGradient
                        colors={['#F59E0B', '#D97706']}
                        start={{ x: 0.5, y: 0 }}
                        end={{ x: 0.5, y: 1 }}
                        style={{
                          width: '100%',
                          height: '100%',
                          borderTopLeftRadius: topRadius,
                          borderTopRightRadius: topRadius,
                          borderBottomLeftRadius: 2,
                          borderBottomRightRadius: 2,
                        }}
                      />
                    );
                  }}
                  maxValue={barAxis.maxValue}
                  stepValue={barAxis.stepValue}
                  yAxisLabelWidth={Y_AXIS_WIDTH}
                  yAxisTextStyle={styles.yAxisLabel}
                  formatYLabel={formatCompactNumber}
                  yAxisThickness={0}
                  xAxisThickness={0}
                  rulesType="dashed"
                  dashWidth={5}
                  dashGap={4}
                  rulesColor="#F1F5F9"
                  noOfSections={4}
                  xAxisLabelTextStyle={styles.xAxisLabel}
                  isAnimated
                  animationDuration={400}
                  onPress={onBarPress}
                  highlightEnabled={selectedBarIndex !== null}
                  highlightedBarIndex={selectedBarIndex ?? -1}
                  lowlightOpacity={0.35}
                />
              )}
            </View>

            {activeFilter !== 'today' && (
              <BarDetailPanel
                points={rawChartData}
                selectedIndex={selectedBarIndex}
                valueLabel="Cost"
                lowerIsBetter
                accentColor="#D97706"
              />
            )}
          </>
        )}
      </View>

      {/* 4. Category Filter Pills (if categories exist) */}
      {categoryList.length > 2 && (
        <View style={styles.categoryFilterRow}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryFilterScroll}
          >
            {categoryList.map((cat) => {
              const isSelected = selectedCategoryFilter === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryPill,
                    isSelected && styles.categoryPillActive,
                  ]}
                  onPress={() => setSelectedCategoryFilter(cat)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.categoryPillText,
                      isSelected && styles.categoryPillTextActive,
                    ]}
                  >
                    {cat === 'all' ? 'All' : cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* 5. Expense Records Section */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeading}>Expense records</Text>
        <Text style={styles.sectionCount}>
          {displayedExpenses.length} {displayedExpenses.length === 1 ? 'entry' : 'entries'}
        </Text>
      </View>

      <View style={styles.expensesList}>
        {displayedExpenses.length > 0 ? (
          displayedExpenses.map((exp) => {
            const catStyle = getCategoryIcon(exp.category);
            return (
              <TouchableOpacity
                key={exp.id}
                style={styles.expenseCard}
                onPress={() => setSelectedExpense(exp)}
                activeOpacity={0.7}
              >
                <View style={styles.expenseLeft}>
                  <View style={[styles.categoryIconCircle, { backgroundColor: catStyle.bg }]}>
                    <Ionicons name={catStyle.name} size={18} color={catStyle.color} />
                  </View>
                  <View style={styles.expenseMetaInfo}>
                    <Text style={styles.expenseTitle} numberOfLines={1}>
                      {exp.description}
                    </Text>
                    <Text style={styles.expenseSubtitle}>
                      {exp.displayDate} · {exp.category}
                    </Text>
                  </View>
                </View>

                <View style={styles.expenseRight}>
                  <Text style={styles.expenseAmount}>{formatRs(exp.amount)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            );
          })
        ) : (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={32} color={colors.textMuted} />
            <Text style={styles.emptyText}>No expenses found for this timeframe.</Text>
          </View>
        )}
      </View>

      {/* 6. Expense Detail Modal */}
      <Modal
        visible={Boolean(selectedExpense)}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedExpense(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalExpenseTitle}>Expense Details</Text>
                <Text style={styles.modalExpenseTime}>
                  {selectedExpense?.displayDate} · {selectedExpense?.time}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedExpense(null)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Category Badge */}
            <View style={styles.modalBadgeRow}>
              <View style={styles.categoryBadge}>
                <Ionicons
                  name={getCategoryIcon(selectedExpense?.category).name}
                  size={14}
                  color={getCategoryIcon(selectedExpense?.category).color}
                />
                <Text style={styles.categoryBadgeText}>
                  {selectedExpense?.category}
                </Text>
              </View>
            </View>

            {/* Item Title & Description */}
            <View style={styles.modalDetailCard}>
              <Text style={styles.modalDetailLabel}>DESCRIPTION</Text>
              <Text style={styles.modalDetailTitle}>{selectedExpense?.description}</Text>
            </View>

            {/* Total Amount */}
            <View style={styles.modalTotalCard}>
              <Text style={styles.modalTotalLabel}>AMOUNT</Text>
              <Text style={styles.modalTotalAmount}>
                {formatRs(selectedExpense?.amount ?? 0)}
              </Text>
            </View>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.closeDoneBtn}
              onPress={() => setSelectedExpense(null)}
            >
              <Text style={styles.closeDoneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 7. Custom Date Range Modal */}
      <Modal
        visible={isCustomModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsCustomModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalExpenseTitle}>Custom Date Range</Text>
              <TouchableOpacity
                onPress={() => setIsCustomModalOpen(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Start Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.textInput}
              value={tempStartDate}
              onChangeText={setTempStartDate}
              placeholder="YYYY-MM-DD"
            />

            <Text style={styles.inputLabel}>End Date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.textInput}
              value={tempEndDate}
              onChangeText={setTempEndDate}
              placeholder="YYYY-MM-DD"
            />

            <TouchableOpacity
              style={styles.submitFilterBtn}
              onPress={handleApplyCustomRange}
            >
              <Text style={styles.submitFilterBtnText}>Apply Filter</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6FAF7',
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 48,
  },
  header: {
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
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBEBE6',
    borderRadius: 24,
    padding: 4,
    marginBottom: 16,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterPillActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#71717A',
  },
  filterTextActive: {
    color: colors.textPrimary,
    fontWeight: '800',
  },
  customBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    marginBottom: 16,
  },
  customBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  customBadgeText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  customBadgeAction: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.primary,
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginBottom: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  expensesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
  },
  expensesAmount: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 2,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 5,
  },
  trendText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  chartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingTop: 8,
  },
  xAxisLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  yAxisLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '500',
  },
  statTooltipCard: {
    backgroundColor: '#0F172A',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statTooltipTitle: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
  },
  statTooltipIncome: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  categoryFilterRow: {
    marginBottom: 14,
  },
  categoryFilterScroll: {
    gap: 8,
    paddingRight: 16,
  },
  categoryPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.surfaceSand,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
  },
  categoryPillText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  expensesList: {
    gap: 8,
  },
  expenseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  expenseLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  categoryIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseMetaInfo: {
    flex: 1,
  },
  expenseTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  expenseSubtitle: {
    fontSize: 11.5,
    color: colors.textSecondary,
    marginTop: 2,
  },
  expenseRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expenseAmount: {
    fontSize: 14.5,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 36,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalExpenseTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalExpenseTime: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalBadgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSand,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 5,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryText,
  },
  modalDetailCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  modalDetailLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  modalDetailTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 2,
  },
  modalTotalCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  modalTotalLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primaryText,
  },
  modalTotalAmount: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.primaryText,
  },
  closeDoneBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 14,
  },
  closeDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    marginTop: 10,
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  submitFilterBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 14,
  },
  submitFilterBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
});
