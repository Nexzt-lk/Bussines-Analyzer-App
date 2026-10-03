import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';

export interface BarPoint {
  label?: string;
  value: number;
}

/** Compact axis label: 0, 950, 1.2K, 150K, 2.5M. */
export const formatCompactNumber = (raw: string | number): string => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  const abs = Math.abs(n);
  const trim = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, ''));
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}M`;
  if (abs >= 1_000) return `${trim(n / 1_000)}K`;
  return String(Math.round(n));
};

// Round step sizes (× a power of ten) that read well on an axis:
// e.g. 10K, 15K, 20K, 25K, 30K, 40K, 50K, 60K, 80K, 100K.
const NICE_STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
const MIN_AXIS_MAX = 1000; // an empty or tiny chart still reads 0 / 250 / 500 / 750 / 1K

/**
 * Picks a y-axis top and step from the data: the tallest bar gets ~10%
 * headroom and every label is a round number. Works the same for a Rs 5K
 * off-season day and a Rs 150K festival day, for any filter.
 */
export const getNiceAxis = (values: number[], sections = 4): { maxValue: number; stepValue: number } => {
  const peak = Math.max(0, ...values.filter((v) => Number.isFinite(v)));
  const target = Math.max(peak * 1.1, MIN_AXIS_MAX) / sections;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const nice = NICE_STEPS.find((s) => s * magnitude >= target) ?? 10;
  const stepValue = nice * magnitude;
  return { maxValue: stepValue * sections, stepValue };
};

const formatRs = (n: number) =>`Rs ${Math.round(n).toLocaleString()}`;

interface BarDetailPanelProps {
  points: BarPoint[];
  selectedIndex: number | null;
  /** e.g. 'Income' or 'Cost'. */
  valueLabel: string;
  /** For expenses a drop is good news. */
  lowerIsBetter?: boolean;
  accentColor?: string;
}

/**
 * Details for the tapped bar, shown in a fixed panel below the chart so it
 * can never be clipped by the card or cover other content.
 */
export default function BarDetailPanel({
  points,
  selectedIndex,
  valueLabel,
  lowerIsBetter = false,
  accentColor = colors.primary,
}: BarDetailPanelProps) {
  const point = selectedIndex !== null ? points[selectedIndex] : undefined;

  if (!point) {
    return (
      <View style={styles.panel}>
        <Ionicons name="hand-left-outline" size={14} color={colors.textMuted} />
        <Text style={styles.hint}>Tap a bar to see details</Text>
      </View>
    );
  }

  const total = points.reduce((s, p) => s + (p.value || 0), 0);
  const share = total > 0 ? Math.round((point.value / total) * 100) : 0;
  const previous = selectedIndex! > 0 ? points[selectedIndex! - 1] : undefined;

  let comparison: { text: string; good: boolean | null } | null = null;
  if (previous) {
    if (previous.value > 0) {
      const pct = Math.round(((point.value - previous.value) / previous.value) * 100);
      comparison = {
        text: `${pct >= 0 ? '+' : ''}${pct}% vs ${previous.label ?? 'previous'}`,
        good: pct === 0 ? null : lowerIsBetter ? pct < 0 : pct > 0,
      };
    } else {
      comparison = { text: `${previous.label ?? 'Previous'}: Rs 0`, good: null };
    }
  }

  const compColor =
    comparison?.good === true ? colors.successText : comparison?.good === false ? colors.dangerText : colors.textMuted;

  return (
    <View style={styles.panel} accessibilityLiveRegion="polite">
      <View style={[styles.dot, { backgroundColor: accentColor }]} />
      <View style={styles.main}>
        <Text style={styles.label}>
          {point.label} · {valueLabel}
        </Text>
        <Text style={styles.value}>{formatRs(point.value)}</Text>
      </View>
      <View style={styles.side}>
        {comparison && <Text style={[styles.comparison, { color: compColor }]}>{comparison.text}</Text>}
        <Text style={styles.share}>{share}% of total</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAF9',
    borderWidth: 1,
    borderColor: '#EDF2F7',
    minHeight: 52,
  },
  hint: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '500',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  main: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  side: {
    alignItems: 'flex-end',
  },
  comparison: {
    fontSize: 12,
    fontWeight: '700',
  },
  share: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
});
