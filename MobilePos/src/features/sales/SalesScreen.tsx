import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Platform,
  Modal,
  TextInput,
  Animated,
  PanResponder,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useBranch } from '../branches/BranchContext';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { toLocalYmd, addDays } from '@/lib/reporting';
import LoadErrorBanner, { describeLoadError } from '@/components/LoadErrorBanner';
import {
  salesApi,
  SalesFilterType,
  SalesReportResponse,
  OrderRecord,
  CustomDateRange,
} from './salesApi';
import SalesOverviewCard from './SalesOverviewCard';
import { DAILY_VIEW_FIRST_STEP } from '@/components/BarDetailPanel';
import AppBackground from '@/components/AppBackground';

interface FilterOption {
  id: SalesFilterType;
  label: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'today', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
  { id: 'custom', label: 'Custom' },
];

export default function SalesScreen() {
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id ?? '';

  const [activeFilter, setActiveFilter] = useState<SalesFilterType>('today');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [salesData, setSalesData] = useState<SalesReportResponse | null>(null);

  // Selected Order for Detail Modal
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

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

  // Selected date for Daily / Weekly / Monthly navigation
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  // Check if currently viewing the live/current day
  const isViewingToday = useMemo(() => {
    const now = new Date();
    if (activeFilter === 'today') {
      return (
        selectedDate.getDate() === now.getDate() &&
        selectedDate.getMonth() === now.getMonth() &&
        selectedDate.getFullYear() === now.getFullYear()
      );
    }
    if (activeFilter === 'week') {
      return selectedDate >= addDays(now, -6);
    }
    if (activeFilter === 'month') {
      return (
        selectedDate.getMonth() === now.getMonth() &&
        selectedDate.getFullYear() === now.getFullYear()
      );
    }
    return true;
  }, [activeFilter, selectedDate]);

  // Handle previous day / period
  const handlePrevious = useCallback(() => {
    if (activeFilter === 'today') {
      setSelectedDate((d) => addDays(d, -1));
    } else if (activeFilter === 'week') {
      setSelectedDate((d) => addDays(d, -7));
    } else if (activeFilter === 'month') {
      setSelectedDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    }
  }, [activeFilter]);

  // Handle next day / period (cannot exceed today)
  const handleNext = useCallback(() => {
    if (isViewingToday) return;
    const now = new Date();
    if (activeFilter === 'today') {
      setSelectedDate((d) => {
        const next = addDays(d, 1);
        return next > now ? now : next;
      });
    } else if (activeFilter === 'week') {
      setSelectedDate((d) => {
        const next = addDays(d, 7);
        return next > now ? now : next;
      });
    } else if (activeFilter === 'month') {
      setSelectedDate((d) => {
        const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        return next > now ? now : next;
      });
    }
  }, [activeFilter, isViewingToday]);

  // Smooth animated transition for date swiping
  const translateX = useRef(new Animated.Value(0)).current;
  const swipeOpacity = useRef(new Animated.Value(1)).current;

  const handlePreviousRef = useRef(handlePrevious);
  handlePreviousRef.current = handlePrevious;

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  const isViewingTodayRef = useRef(isViewingToday);
  isViewingTodayRef.current = isViewingToday;

  const activeFilterRef = useRef(activeFilter);
  activeFilterRef.current = activeFilter;

  // PanResponder to intercept horizontal screen swipes without breaking vertical scroll
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          if (activeFilterRef.current === 'custom') return false;
          return (
            Math.abs(gestureState.dx) > 14 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.3
          );
        },
        onMoveShouldSetPanResponderCapture: (_evt, gestureState) => {
          if (activeFilterRef.current === 'custom') return false;
          return (
            Math.abs(gestureState.dx) > 14 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.3
          );
        },
        onPanResponderMove: (_evt, gestureState) => {
          translateX.setValue(gestureState.dx * 0.35);
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const dx = gestureState.dx;
          const vx = gestureState.vx;
          const isSwipeRight = dx > 35 || (dx > 15 && vx > 0.25);
          const isSwipeLeft = dx < -35 || (dx < -15 && vx < -0.25);

          if (isSwipeRight) {
            // Swiped right -> go backward in time to previous day / period
            Animated.parallel([
              Animated.timing(translateX, {
                toValue: 180,
                duration: 110,
                useNativeDriver: true,
              }),
              Animated.timing(swipeOpacity, {
                toValue: 0.2,
                duration: 110,
                useNativeDriver: true,
              }),
            ]).start(() => {
              handlePreviousRef.current();
              translateX.setValue(-180);
              Animated.parallel([
                Animated.spring(translateX, {
                  toValue: 0,
                  friction: 8,
                  tension: 50,
                  useNativeDriver: true,
                }),
                Animated.timing(swipeOpacity, {
                  toValue: 1,
                  duration: 140,
                  useNativeDriver: true,
                }),
              ]).start();
            });
          } else if (isSwipeLeft) {
            // Swiped left -> go forward in time to next day / period
            if (!isViewingTodayRef.current) {
              Animated.parallel([
                Animated.timing(translateX, {
                  toValue: -180,
                  duration: 110,
                  useNativeDriver: true,
                }),
                Animated.timing(swipeOpacity, {
                  toValue: 0.2,
                  duration: 110,
                  useNativeDriver: true,
                }),
              ]).start(() => {
                handleNextRef.current();
                translateX.setValue(180);
                Animated.parallel([
                  Animated.spring(translateX, {
                    toValue: 0,
                    friction: 8,
                    tension: 50,
                    useNativeDriver: true,
                  }),
                  Animated.timing(swipeOpacity, {
                    toValue: 1,
                    duration: 140,
                    useNativeDriver: true,
                  }),
                ]).start();
              });
            } else {
              // Already at today: elastic spring bounce back
              Animated.spring(translateX, {
                toValue: 0,
                friction: 7,
                tension: 60,
                useNativeDriver: true,
              }).start();
            }
          } else {
            // Insufficient movement, snap back smoothly
            Animated.spring(translateX, {
              toValue: 0,
              friction: 8,
              tension: 50,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(translateX, {
            toValue: 0,
            friction: 8,
            tension: 50,
            useNativeDriver: true,
          }).start();
        },
      }),
    [translateX, swipeOpacity]
  );

  // Load Sales Data
  const loadData = useCallback(
    async (filter: SalesFilterType, range?: CustomDateRange, date?: Date) => {
      try {
        const data = await salesApi.getSalesData(branchId, filter, range, date);
        setSalesData(data);
        setLoadError(null);
      } catch (err) {
        setSalesData(null);
        setLoadError(describeLoadError(err));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [branchId]
  );

  useEffect(() => {
    setLoading(true);
    let isCancelled = false;
    salesApi
      .getSalesData(
        branchId,
        activeFilter,
        activeFilter === 'custom' ? customRange : undefined,
        selectedDate
      )
      .then((data) => {
        if (!isCancelled) {
          setSalesData(data);
          setLoadError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          setSalesData(null);
          setLoadError(describeLoadError(err));
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [branchId, activeFilter, customRange, selectedDate]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(
      activeFilter,
      activeFilter === 'custom' ? customRange : undefined,
      selectedDate
    );
  }, [activeFilter, customRange, selectedDate, loadData]);

  // Handle Tab / Filter Switch
  const handleFilterPress = (filter: SalesFilterType) => {
    setSelectedDate(new Date());
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

  // Quick preset ranges for Custom Filter
  const setQuickRange = (days: number, _label: string) => {
    const today = new Date();
    const end = toLocalYmd(today);
    const past = new Date(today);
    past.setDate(past.getDate() - days);
    const start = toLocalYmd(past);
    setTempStartDate(start);
    setTempEndDate(end);
  };

  // Format currency helper
  const formatRs = useCallback((num: number) => {
    return 'Rs ' + num.toLocaleString();
  }, []);

  // Days each bar covers, for the doubling sales scale (0 / 25K / 50K / 100K / 200K per day):
  // Weekly = 1 day, Monthly = 1 week (W4 can be up to 10 days), Custom = range ÷ bars.
  // Daily uses its own fixed start instead: 0 / 10K / 20K / 40K / 80K.
  const daysPerBar = (() => {
    if (activeFilter === 'week') return 1;
    if (activeFilter === 'month') return 8;
    if (activeFilter === 'custom') {
      const start = new Date(`${customRange.startDate}T00:00:00`).getTime();
      const end = new Date(`${customRange.endDate}T00:00:00`).getTime();
      const days = Math.round((end - start) / 86_400_000) + 1;
      if (!Number.isFinite(days) || days < 1) return 1;
      return Math.ceil(days / Math.min(6, days));
    }
    return 1;
  })();

  return (
    <View style={styles.rootWrapper}>
      <AppBackground />
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
          <Text style={styles.headerTitle}>Sales</Text>
          <Text style={styles.headerSubtitle}>Income over time</Text>
        </View>

      <LoadErrorBanner message={loadError} onRetry={onRefresh} />

      {/* 2. Filter Pills Container (Today, Week, Month, Custom) */}
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
              Selected: {customRange.label || `${customRange.startDate} to ${customRange.endDate}`}
            </Text>
          </View>
          <Text style={styles.customBadgeAction}>Change</Text>
        </TouchableOpacity>
      )}

      {/* 2.5. Interactive Period / Date Indicator (Swipe Screen to change dates) */}
      {activeFilter !== 'custom' && (
        <View style={styles.dateHeaderCard}>
          <View style={styles.dateHeaderLeft}>
            <View style={styles.dateCalendarIconBox}>
              <Ionicons name="calendar" size={16} color="#059669" />
            </View>
            <View style={styles.dateHeaderTexts}>
              <Text style={styles.dateHeaderTitle}>
                {salesData?.periodDateLabel || 'Loading date...'}
              </Text>
              <Text style={styles.dateHeaderSubtitle}>
                {isViewingToday ? 'Live Real-Time Data' : 'Historical Record'}
              </Text>
            </View>
          </View>

          <View style={styles.swipeIndicatorPill}>
            <Ionicons name="swap-horizontal" size={14} color="#059669" />
            <Text style={styles.swipeIndicatorText}>Swipe screen</Text>
          </View>
        </View>
      )}

      {/* Quick Jump back to Today if viewing a past date */}
      {!isViewingToday && activeFilter !== 'custom' && (
        <TouchableOpacity
          style={styles.jumpTodayBadge}
          onPress={() => setSelectedDate(new Date())}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-undo" size={13} color="#059669" />
          <Text style={styles.jumpTodayText}>Return to Today's Live Sales</Text>
        </TouchableOpacity>
      )}

      {/* Swipeable Animated Container covering the Graph and Orders Table */}
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.swipeArea,
          {
            transform: [{ translateX }],
            opacity: swipeOpacity,
          },
        ]}
      >
        {/* 3. Income Over Time Card with Chart */}
        <SalesOverviewCard
          daysPerBar={daysPerBar}
          firstAxisStep={activeFilter === 'today' ? DAILY_VIEW_FIRST_STEP : undefined}
          chartData={salesData?.chartData ?? []}
          total={salesData?.stats.totalIncome ?? 0}
          trendPercentage={salesData?.stats.trendPercentage ?? '0%'}
          trendPositive={salesData?.stats.trendPositive !== false}
          loading={loading}
          variant={activeFilter === 'today' ? 'line' : 'bar'}
          barWidth={activeFilter === 'month' ? 32 : 24}
          amountLabel={isViewingToday ? "TODAY'S INCOME" : 'TOTAL INCOME'}
        />

        {/* 4. Orders Section Header */}
        <View style={styles.recentOrdersHeaderRow}>
          <Text style={styles.recentOrdersHeading}>
            {isViewingToday
              ? 'Recent orders'
              : `Orders on ${salesData?.periodDateLabel || 'selected date'}`}
          </Text>
          {salesData?.orders && salesData.orders.length > 0 && (
            <View style={styles.orderCountPill}>
              <Text style={styles.orderCountPillText}>
                {salesData.orders.length}{' '}
                {salesData.orders.length === 1 ? 'order' : 'orders'}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.ordersList}>
          {salesData?.orders && salesData.orders.length > 0 ? (
            salesData.orders.map((ord) => (
              <TouchableOpacity
                key={ord.id}
                style={styles.orderCard}
                onPress={() => setSelectedOrder(ord)}
                activeOpacity={0.7}
              >
                <View style={styles.orderLeft}>
                  <Text style={styles.orderNumber}>{ord.orderNumber}</Text>
                  <Text style={styles.orderMeta}>
                    {ord.time} · {ord.paymentMethod} · {ord.itemCount}{' '}
                    {ord.itemCount === 1 ? 'item' : 'items'}
                  </Text>
                </View>

                <View style={styles.orderRight}>
                  <Text style={styles.orderAmount}>{formatRs(ord.total)}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={28} color={colors.textMuted} />
              <Text style={styles.emptyText}>
                {isViewingToday
                  ? 'No orders found for this timeframe.'
                  : `No orders recorded for ${salesData?.periodDateLabel || 'this date'}.`}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>

      {/* 5. Order Detail Modal */}
      <Modal
        visible={Boolean(selectedOrder)}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedOrder(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalOrderNumber}>{selectedOrder?.orderNumber}</Text>
                <Text style={styles.modalOrderTime}>
                  {selectedOrder?.date}, {selectedOrder?.time} · {selectedOrder?.paymentMethod}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedOrder(null)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Status Pill */}
            <View style={styles.modalStatusRow}>
              <View
                style={[
                  styles.modalStatusBadge,
                  selectedOrder?.status !== 'Paid' && { backgroundColor: colors.dangerBg },
                ]}
              >
                <Ionicons
                  name={selectedOrder?.status === 'Paid' ? 'checkmark-circle' : 'time-outline'}
                  size={14}
                  color={selectedOrder?.status === 'Paid' ? colors.successText : colors.dangerText}
                />
                <Text
                  style={[
                    styles.modalStatusText,
                    selectedOrder?.status !== 'Paid' && { color: colors.dangerText },
                  ]}
                >
                  {selectedOrder?.status}
                </Text>
              </View>
              {selectedOrder?.cashierName && (
                <Text style={styles.modalCustomerText}>Cashier: {selectedOrder.cashierName}</Text>
              )}
            </View>

            {/* Itemized List */}
            <Text style={styles.modalSectionLabel}>ORDER ITEMS</Text>
            <View style={styles.modalItemsList}>
              {selectedOrder?.items.length === 0 && (
                <Text style={styles.modalItemSub}>No item details were synced for this order.</Text>
              )}
              {selectedOrder?.items.map((item) => (
                <View key={item.id} style={styles.modalItemRow}>
                  <View style={styles.modalItemInfo}>
                    <Text style={styles.modalItemName}>{item.name}</Text>
                    <Text style={styles.modalItemSub}>
                      {item.quantity} × {formatRs(item.unitPrice)}
                    </Text>
                  </View>
                  <Text style={styles.modalItemPrice}>{formatRs(item.total)}</Text>
                </View>
              ))}
            </View>

            {/* Total Row */}
            <View style={styles.modalTotalRow}>
              <Text style={styles.modalTotalLabel}>
                {selectedOrder?.status === 'Paid' ? 'Total Paid' : 'Total'}
              </Text>
              <Text style={styles.modalTotalAmount}>
                {formatRs(selectedOrder?.total ?? 0)}
              </Text>
            </View>

            {/* Action Button */}
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={() => setSelectedOrder(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalActionButtonText}>Close Receipt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 6. Custom Date Range Picker Modal */}
      <Modal
        visible={isCustomModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsCustomModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Title */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalOrderNumber}>Select Custom Range</Text>
                <Text style={styles.modalOrderTime}>Choose start & end dates</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsCustomModalOpen(false)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Quick Presets */}
            <Text style={styles.modalSectionLabel}>QUICK PRESETS</Text>
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => setQuickRange(7, 'Last 7 Days')}
              >
                <Text style={styles.presetButtonText}>Last 7 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => setQuickRange(14, 'Last 14 Days')}
              >
                <Text style={styles.presetButtonText}>Last 14 Days</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.presetButton}
                onPress={() => setQuickRange(30, 'Last 30 Days')}
              >
                <Text style={styles.presetButtonText}>Last 30 Days</Text>
              </TouchableOpacity>
            </View>

            {/* Date Inputs */}
            <Text style={styles.modalSectionLabel}>CUSTOM DATE RANGE</Text>
            <View style={styles.inputRangeRow}>
              <View style={styles.dateInputCol}>
                <Text style={styles.inputLabel}>Start Date</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.textInput}
                    value={tempStartDate}
                    onChangeText={setTempStartDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>

              <View style={styles.dateInputCol}>
                <Text style={styles.inputLabel}>End Date</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
                  <TextInput
                    style={styles.textInput}
                    value={tempEndDate}
                    onChangeText={setTempEndDate}
                    placeholder="YYYY-MM-DD"
                  />
                </View>
              </View>
            </View>

            {/* Apply Button */}
            <TouchableOpacity
              style={styles.modalActionButton}
              onPress={handleApplyCustomRange}
              activeOpacity={0.8}
            >
              <Text style={styles.modalActionButtonText}>Apply Custom Range</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  </View>
);
}

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 48,
  },

  // Header
  header: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: fonts.extraBold,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Segmented Pill Filter Container
  filterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBEBE6',
    borderRadius: 24,
    padding: 4,
    marginBottom: 20,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 10,
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
    fontSize: 14,
    fontFamily: fonts.medium,
    color: '#71717A',
  },
  filterTextActive: {
    fontFamily: fonts.bold,
    color: '#18181B',
  },

  // Custom Range Info Row
  customBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primarySurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 16,
  },
  customBadgeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  customBadgeText: {
    fontSize: 13,
    color: colors.primaryText,
    fontFamily: fonts.semiBold,
  },
  customBadgeAction: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.primary,
    marginLeft: 8,
  },

  // Recent Orders Section
  recentOrdersHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 26,
    marginBottom: 14,
  },
  recentOrdersHeading: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: '#18181B',
  },
  orderCountPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  orderCountPillText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#64748B',
  },
  swipeArea: {
    // Captures swipe gestures across the chart & orders
  },
  dateHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  dateHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  dateCalendarIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateHeaderTexts: {
    flex: 1,
  },
  dateHeaderTitle: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  dateHeaderSubtitle: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#64748B',
    marginTop: 1,
  },
  swipeIndicatorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  swipeIndicatorText: {
    fontSize: 11.5,
    fontFamily: fonts.semiBold,
    color: '#059669',
  },
  jumpTodayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 14,
  },
  jumpTodayText: {
    fontSize: 11.5,
    fontFamily: fonts.bold,
    color: '#059669',
  },
  ordersList: {
    gap: 10,
  },
  orderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8ECE8',
    paddingVertical: 16,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 3,
    elevation: 1,
  },
  orderLeft: {
    flex: 1,
  },
  orderNumber: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: '#18181B',
  },
  orderMeta: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#71717A',
    marginTop: 4,
  },
  orderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderAmount: {
    fontFamily: fonts.bold,
    fontSize: 18,
    color: '#18181B',
  },

  emptyCard: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E8ECE8',
  },
  emptyText: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },

  // Modal Overlays
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  modalOrderNumber: {
    fontFamily: fonts.bold,
    fontSize: 20,
    color: '#18181B',
  },
  modalOrderTime: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#71717A',
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 4,
  },

  modalStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F2',
  },
  modalStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  modalStatusText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.successText,
  },
  modalCustomerText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fonts.medium,
  },

  modalSectionLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 1,
    color: '#94A3B8',
    marginBottom: 10,
  },
  modalItemsList: {
    gap: 12,
    marginBottom: 18,
  },
  modalItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalItemInfo: {
    flex: 1,
    paddingRight: 12,
  },
  modalItemName: {
    fontSize: 14,
    fontFamily: fonts.semiBold,
    color: '#18181B',
  },
  modalItemSub: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#71717A',
    marginTop: 2,
  },
  modalItemPrice: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#18181B',
  },

  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingTop: 14,
    marginBottom: 20,
  },
  modalTotalLabel: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: '#18181B',
  },
  modalTotalAmount: {
    fontFamily: fonts.extraBold,
    fontSize: 22,
    color: colors.primary,
  },
  modalActionButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: fonts.bold,
  },

  // Presets in Custom Modal
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetButtonText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
  },

  // Date Range inputs
  inputRangeRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  dateInputCol: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 44,
    gap: 6,
  },
  textInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: '#18181B',
  },
});
