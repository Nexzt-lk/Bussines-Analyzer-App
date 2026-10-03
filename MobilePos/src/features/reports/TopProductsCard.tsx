import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import type { TopProductItem } from './reportsApi';

interface TopProductsCardProps {
  products: TopProductItem[];
  title?: string;
  limit?: number;
  actionLabel?: string;
  onActionPress?: () => void;
}

export default function TopProductsCard({
  products,
  title = 'Top Products',
  limit = 5,
  actionLabel,
  onActionPress,
}: TopProductsCardProps) {
  const maxProductUnits = useMemo(() => {
    if (!products || products.length === 0) return 100;
    return Math.max(...products.map((p) => p.units), 1);
  }, [products]);

  const visibleProducts = products.slice(0, limit);

  return (
    <View style={styles.sectionCard}>
      <View style={styles.titleRow}>
        <Text style={styles.sectionCardTitle}>{title}</Text>
        {actionLabel && onActionPress && (
          <TouchableOpacity style={styles.actionRow} onPress={onActionPress} activeOpacity={0.7}>
            <Text style={styles.actionText}>{actionLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.primary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.topProductsList}>
        {visibleProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="basket-outline" size={24} color={colors.textMuted} />
            <Text style={styles.emptyText}>No product sales in this period</Text>
          </View>
        ) : (
          visibleProducts.map((item, index) => {
            const rank = index + 1;
            // Small sellers keep a visible 12% stub; nothing sold means an empty bar.
            const progressPercent =
              item.units > 0
                ? Math.min(100, Math.max(12, Math.round((item.units / (maxProductUnits * 1.25)) * 100)))
                : 0;
            const isLast = index === visibleProducts.length - 1;

            return (
              <View
                key={`${item.name}-${index}`}
                style={[styles.productItemRow, isLast && styles.productItemRowLast]}
              >
                {/* Green Squircle Rank Badge */}
                <View style={styles.rankBadge}>
                  <Text style={styles.rankBadgeText}>{rank}</Text>
                </View>

                {/* Product Name, Units and Progress Bar */}
                <View style={styles.productDetailsCol}>
                  <View style={styles.productHeaderRow}>
                    <Text style={styles.productName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.productUnits}>{Math.round(item.units)} units</Text>
                  </View>

                  {/* Progress Bar Track & Fill */}
                  <View style={styles.productProgressTrack}>
                    <View
                      style={[styles.productProgressFill, { width: `${progressPercent}%` }]}
                    />
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748B',
  },
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
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionCardTitle: {
    fontSize: 18,
    fontWeight: '700',
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
    fontWeight: '700',
    color: colors.primary,
  },
  topProductsList: {
    gap: 18,
  },
  productItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  productItemRowLast: {
    marginBottom: 2,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E8F8EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rankBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#059669',
  },
  productDetailsCol: {
    flex: 1,
  },
  productHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    flex: 1,
    paddingRight: 8,
  },
  productUnits: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
  productProgressTrack: {
    height: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 999,
    overflow: 'hidden',
    width: '100%',
  },
  productProgressFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 999,
  },
});
