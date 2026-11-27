import { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Dimensions,
  LayoutChangeEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import BarDetailPanel, { formatCompactNumber, getNiceAxis, getSalesAxis } from '@/components/BarDetailPanel';
import type { ChartPoint } from './salesApi';

// Emerald gradient colors matching user design reference
const BAR_GRADIENT_START = colors.chartGradientStart; // #32C468 (Vibrant emerald green top)
const BAR_GRADIENT_END = colors.chartGradientEnd;     // #178440 (Deep forest green bottom)
// Room for the value labels (0, 50K, 100K…) on the left of the bar chart.
const Y_AXIS_WIDTH = 36;

interface SalesOverviewCardProps {
  chartData: ChartPoint[];
  total: number;
  trendPercentage: string;
  trendPositive: boolean;
  loading?: boolean;
  variant?: 'line' | 'bar';
  barWidth?: number;
  /**
   * Days covered by each bar (1 = one day). When set, the bar chart uses the
   * doubling sales scale (0 / 25K / 50K / 100K / 200K per day); otherwise the
   * axis is fitted to the data.
   */
  daysPerBar?: number;
  /** Overrides the first axis line, e.g. DAILY_VIEW_FIRST_STEP for 0 / 10K / 20K / 40K / 80K. */
  firstAxisStep?: number;
  amountLabel?: string;
  title?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}

export default function SalesOverviewCard({
  chartData,
  total,
  trendPercentage,
  trendPositive,
  loading = false,
  variant = 'line',
  barWidth = 24,
  daysPerBar,
  firstAxisStep,
  amountLabel,
  title,
  actionLabel,
  onActionPress,
}: SalesOverviewCardProps) {
  // Card layout width for responsive chart spacing
  const [chartContainerWidth, setChartContainerWidth] = useState<number>(() => {
    return Dimensions.get('window').width - 48; // padding 24 * 2
  });

  // Format currency helper
  const formatRs = useCallback((num: number) => {
    return 'Rs ' + num.toLocaleString();
  }, []);

  // Measure card layout to scale chart cleanly across devices
  const onCardLayout = (event: LayoutChangeEvent) => {
    const { width } = event.nativeEvent.layout;
    if (width > 0) {
      setChartContainerWidth(width);
    }
  };

  // Calculate chart spacing to ensure it spans edge-to-edge inside the card
  const chartSpacing = useMemo(() => {
    const dataLength = chartData.length || 6;
    if (dataLength <= 1) return 40;
    const availableWidth = Math.max(chartContainerWidth - 40 - Y_AXIS_WIDTH, 200); // padding + y-axis labels
    return Math.floor(availableWidth / (dataLength - 1));
  }, [chartContainerWidth, chartData.length]);

  // Tapped bar. Stored with the data it belongs to, so a new period/filter
  // automatically clears the selection.
  const [selection, setSelection] = useState<{ data: ChartPoint[]; index: number } | null>(null);
  const selectedIndex = selection?.data === chartData ? selection.index : null;
  const onBarPress = (_item: unknown, index: number) =>
    setSelection(selectedIndex === index ? null : { data: chartData, index });

  // Bar spacing calculation (leaves room for the y-axis labels)
  const { barSpacing, barInitialSpacing } = useMemo(() => {
    const dataCount = chartData.length || 7;
    const availableWidth = Math.max(chartContainerWidth - 40 - Y_AXIS_WIDTH, 200);
    const totalBarsWidth = dataCount * barWidth;
    const remainingWidth = Math.max(availableWidth - totalBarsWidth, 20);

    const bSpacing = Math.floor(remainingWidth / Math.max(dataCount, 1));
    const initSpacing = Math.floor(bSpacing / 2);

    return {
      barSpacing: bSpacing,
      barInitialSpacing: initSpacing,
    };
  }, [chartContainerWidth, barWidth, chartData.length]);

  // Y-axis for both chart types: the doubling sales scale (0 / 25K / 50K /
  // 100K / 200K per day) when daysPerBar is known, otherwise round numbers
  // fitted to the data. Values are drawn in axis units via toPlot; real
  // amounts stay in chartData for the detail panel and pointer label.
  const valueAxis = useMemo(() => {
    const values = chartData.map((p) => p.value);
    if (daysPerBar || firstAxisStep) {
      const sales = getSalesAxis(values, daysPerBar ?? 1, firstAxisStep);
      const sections = sales.breakpoints.length - 1;
      return { maxValue: sections, stepValue: 1, noOfSections: sections, labels: sales.labels, toPlot: sales.toPlot };
    }
    const nice = getNiceAxis(values);
    return { ...nice, noOfSections: 4, labels: undefined, toPlot: (v: number) => v };
  }, [chartData, daysPerBar, firstAxisStep]);

  // Bar chart data with rounded top pill cap matching user design
  const barData = useMemo(() => {
    const topRadius = Math.round(barWidth / 2);
    return chartData.map((item) => ({
      value: valueAxis.toPlot(item.value),
      label: item.label,
      frontColor: 'transparent',
      barBorderTopLeftRadius: topRadius,
      barBorderTopRightRadius: topRadius,
      barBorderBottomLeftRadius: 2,
      barBorderBottomRightRadius: 2,
    }));
  }, [chartData, barWidth, valueAxis]);

  // Line points drawn on the same axis; `amount` keeps the real value.
  const lineData = useMemo(
    () => chartData.map((item) => ({ ...item, value: valueAxis.toPlot(item.value), amount: item.value })),
    [chartData, valueAxis]
  );

  return (
    <View style={styles.chartCard} onLayout={onCardLayout}>
      {title && (
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {actionLabel && onActionPress && (
            <TouchableOpacity style={styles.actionRow} onPress={onActionPress} activeOpacity={0.7}>
              <Text style={styles.actionText}>{actionLabel}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Loading performance data...</Text>
        </View>
      ) : (
        <>
          {/* Card Header: Amount with Trend Badge */}
          <View style={styles.cardHeaderRow}>
            <View>
              {amountLabel && <Text style={styles.incomeLabel}>{amountLabel}</Text>}
              <Text style={styles.incomeAmount}>{formatRs(total)}</Text>
            </View>

            <View style={[styles.trendBadge, !trendPositive && styles.trendBadgeNegative]}>
              <Ionicons
                name={trendPositive ? 'trending-up' : 'trending-down'}
                size={13}
                color={trendPositive ? colors.successText : colors.dangerText}
              />
              <Text style={[styles.trendText, !trendPositive && styles.trendTextNegative]}>
                {trendPercentage}
              </Text>
            </View>
          </View>

          {/* Chart: Curved Line or gradient Bar chart */}
          <View style={styles.chartWrapper}>
            {variant === 'line' ? (
              <LineChart
                data={lineData}
                curved
                areaChart
                height={160}
                spacing={chartSpacing}
                initialSpacing={10}
                endSpacing={10}
                color={colors.primary}
                thickness={3}
                startFillColor={colors.primaryLight}
                endFillColor={colors.primarySurface}
                startOpacity={0.28}
                endOpacity={0.02}
                hideDataPoints
                maxValue={valueAxis.maxValue}
                stepValue={valueAxis.stepValue}
                noOfSections={valueAxis.noOfSections}
                yAxisLabelTexts={valueAxis.labels}
                yAxisLabelWidth={Y_AXIS_WIDTH}
                yAxisTextStyle={styles.yAxisLabel}
                formatYLabel={formatCompactNumber}
                yAxisThickness={0}
                xAxisThickness={0}
                rulesType="dashed"
                dashWidth={5}
                dashGap={4}
                rulesColor="#E2EAE4"
                xAxisLabelTextStyle={styles.xAxisLabel}
                isAnimated
                animationDuration={600}
                pointerConfig={{
                  pointerColor: colors.primary,
                  pointerStripColor: colors.primaryBorder,
                  pointerStripWidth: 1.5,
                  strokeDashArray: [4, 4],
                  radius: 5,
                  pointerLabelComponent: (items: any) => {
                    const item = items?.[0];
                    if (!item) return null;
                    return (
                      <View style={styles.statTooltipCard}>
                        <Text style={styles.statTooltipTitle}>{item.label}</Text>
                        <Text style={styles.statTooltipIncome}>
                          Income : {formatRs(item.amount ?? item.value)}
                        </Text>
                      </View>
                    );
                  },
                }}
              />
            ) : (
              <BarChart
                data={barData}
                height={160}
                barWidth={barWidth}
                spacing={barSpacing}
                initialSpacing={barInitialSpacing}
                endSpacing={barInitialSpacing}
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
                      colors={[BAR_GRADIENT_START, BAR_GRADIENT_END]}
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
                maxValue={valueAxis.maxValue}
                stepValue={valueAxis.stepValue}
                noOfSections={valueAxis.noOfSections}
                yAxisLabelTexts={valueAxis.labels}
                yAxisLabelWidth={Y_AXIS_WIDTH}
                yAxisTextStyle={styles.yAxisLabel}
                formatYLabel={formatCompactNumber}
                yAxisThickness={0}
                xAxisThickness={0}
                rulesType="dashed"
                dashWidth={5}
                dashGap={4}
                rulesColor="#E2EAE4"
                xAxisLabelTextStyle={styles.xAxisLabel}
                isAnimated
                animationDuration={500}
                onPress={onBarPress}
                highlightEnabled={selectedIndex !== null}
                highlightedBarIndex={selectedIndex ?? -1}
                lowlightOpacity={0.35}
              />
            )}
          </View>

          {variant === 'bar' && (
            <BarDetailPanel points={chartData} selectedIndex={selectedIndex} valueLabel="Income" />
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Chart Card Container
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E8EFEA',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  actionText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  loadingContainer: {
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.textMuted,
  },

  // Card Header: Income amount & Trend pill
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  incomeLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    letterSpacing: 1.2,
    color: '#71717A',
  },
  incomeAmount: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    color: '#18181B',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.successBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    gap: 3,
    marginTop: 4,
  },
  trendBadgeNegative: {
    backgroundColor: '#FEE2E2',
  },
  trendText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.successText,
  },
  trendTextNegative: {
    color: colors.dangerText,
  },

  // Chart Wrapper
  chartWrapper: {
    marginLeft: -16,
    marginRight: -10,
    marginTop: 8,
    overflow: 'visible',
  },
  xAxisLabel: {
    color: '#64748B',
    fontSize: 12,
    fontFamily: fonts.semiBold,
    textAlign: 'center',
  },
  yAxisLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontFamily: fonts.medium,
  },
  statTooltipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E8EFEA',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    marginBottom: 8,
    minWidth: 140,
  },
  statTooltipTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#18181B',
    marginBottom: 3,
  },
  statTooltipIncome: {
    fontSize: 13,
    fontFamily: fonts.semiBold,
    color: colors.primary,
  },
});
