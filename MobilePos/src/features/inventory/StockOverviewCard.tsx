import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

interface StockOverviewCardProps {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  loading?: boolean;
  onViewLowStock: () => void;
  onViewAllStock: () => void;
}

export default function StockOverviewCard({
  totalProducts,
  lowStockCount,
  outOfStockCount,
  loading = false,
  onViewLowStock,
  onViewAllStock,
}: StockOverviewCardProps) {
  const hasWarnings = lowStockCount > 0 || outOfStockCount > 0;

  return (
    <View style={styles.cardContainer}>
      {/* Top Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <View style={styles.iconBadge}>
            <Ionicons name="cube-outline" size={18} color="#2563EB" />
          </View>
          <View>
            <Text style={styles.cardOverline}>INVENTORY & WAREHOUSE</Text>
            <Text style={styles.cardMainTitle}>Stock Status</Text>
          </View>
        </View>

        {/* Health Status Pill */}
        <View
          style={[
            styles.healthPill,
            outOfStockCount > 0
              ? styles.healthPillDanger
              : lowStockCount > 0
                ? styles.healthPillWarning
                : styles.healthPillGood,
          ]}
        >
          <View
            style={[
              styles.healthDot,
              outOfStockCount > 0
                ? styles.healthDotDanger
                : lowStockCount > 0
                  ? styles.healthDotWarning
                  : styles.healthDotGood,
            ]}
          />
          <Text
            style={[
              styles.healthPillText,
              outOfStockCount > 0
                ? styles.healthPillTextDanger
                : lowStockCount > 0
                  ? styles.healthPillTextWarning
                  : styles.healthPillTextGood,
            ]}
          >
            {outOfStockCount > 0
              ? `${outOfStockCount} Out`
              : lowStockCount > 0
                ? `${lowStockCount} Low`
                : 'All Good'}
          </Text>
        </View>
      </View>

      {/* 3 Metric Tiles Row */}
      <View style={styles.tilesRow}>
        {/* Tile 1: Total Products */}
        <TouchableOpacity
          style={styles.tile}
          onPress={onViewAllStock}
          activeOpacity={0.75}
        >
          <Text style={styles.tileLabel}>TOTAL PRODUCTS</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#2563EB" style={styles.loader} />
          ) : (
            <Text style={[styles.tileValue, { color: '#0F172A' }]}>
              {totalProducts.toLocaleString()}
            </Text>
          )}
          <Text style={styles.tileSub}>Registered</Text>
        </TouchableOpacity>

        {/* Tile 2: Low Stock Warning */}
        <TouchableOpacity
          style={[styles.tile, lowStockCount > 0 && styles.tileWarning]}
          onPress={onViewLowStock}
          activeOpacity={0.75}
        >
          <View style={styles.tileLabelRow}>
            <Text style={[styles.tileLabel, lowStockCount > 0 && { color: '#B45309' }]}>
              LOW STOCK
            </Text>
            {lowStockCount > 0 && (
              <Ionicons name="alert-circle" size={12} color="#D97706" />
            )}
          </View>
          {loading ? (
            <ActivityIndicator size="small" color="#D97706" style={styles.loader} />
          ) : (
            <Text
              style={[
                styles.tileValue,
                { color: lowStockCount > 0 ? '#D97706' : '#64748B' },
              ]}
            >
              {lowStockCount}
            </Text>
          )}
          <Text style={[styles.tileSub, lowStockCount > 0 && { color: '#B45309' }]}>
            Needs reorder
          </Text>
        </TouchableOpacity>

        {/* Tile 3: Out of Stock */}
        <TouchableOpacity
          style={[styles.tile, outOfStockCount > 0 && styles.tileDanger]}
          onPress={onViewLowStock}
          activeOpacity={0.75}
        >
          <View style={styles.tileLabelRow}>
            <Text style={[styles.tileLabel, outOfStockCount > 0 && { color: '#B91C1C' }]}>
              OUT OF STOCK
            </Text>
            {outOfStockCount > 0 && (
              <Ionicons name="close-circle" size={12} color="#DC2626" />
            )}
          </View>
          {loading ? (
            <ActivityIndicator size="small" color="#DC2626" style={styles.loader} />
          ) : (
            <Text
              style={[
                styles.tileValue,
                { color: outOfStockCount > 0 ? '#DC2626' : '#64748B' },
              ]}
            >
              {outOfStockCount}
            </Text>
          )}
          <Text style={[styles.tileSub, outOfStockCount > 0 && { color: '#B91C1C' }]}>
            Unavailable
          </Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Action Footer */}
      <TouchableOpacity
        style={[
          styles.actionFooter,
          hasWarnings ? styles.actionFooterWarning : styles.actionFooterNormal,
        ]}
        onPress={hasWarnings ? onViewLowStock : onViewAllStock}
        activeOpacity={0.8}
      >
        <View style={styles.actionFooterLeft}>
          <Ionicons
            name={hasWarnings ? 'warning-outline' : 'list-outline'}
            size={14}
            color={hasWarnings ? '#D97706' : '#2563EB'}
          />
          <Text
            style={[
              styles.actionFooterText,
              hasWarnings ? styles.actionFooterTextWarning : styles.actionFooterTextNormal,
            ]}
          >
            {hasWarnings
              ? `Review ${lowStockCount + outOfStockCount} items requiring stock attention`
              : 'View complete product inventory list'}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={hasWarnings ? '#D97706' : '#2563EB'}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  cardOverline: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: '#2563EB',
    letterSpacing: 0.6,
  },
  cardMainTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  healthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  healthPillGood: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  healthPillWarning: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  healthPillDanger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  healthDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  healthDotGood: {
    backgroundColor: '#10B981',
  },
  healthDotWarning: {
    backgroundColor: '#F59E0B',
  },
  healthDotDanger: {
    backgroundColor: '#EF4444',
  },
  healthPillText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
  },
  healthPillTextGood: {
    color: '#065F46',
  },
  healthPillTextWarning: {
    color: '#B45309',
  },
  healthPillTextDanger: {
    color: '#B91C1C',
  },
  tilesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  tile: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  tileWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  tileDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  tileLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  tileLabel: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    color: '#64748B',
    letterSpacing: 0.3,
    marginBottom: 4,
    textAlign: 'center',
  },
  tileValue: {
    fontSize: 20,
    fontFamily: fonts.bold,
    letterSpacing: -0.3,
    marginVertical: 2,
  },
  tileSub: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: '#94A3B8',
    marginTop: 2,
  },
  loader: {
    marginVertical: 4,
  },
  actionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  actionFooterNormal: {
    backgroundColor: '#F0F9FF',
    borderColor: '#E0F2FE',
  },
  actionFooterWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FEF3C7',
  },
  actionFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    paddingRight: 6,
  },
  actionFooterText: {
    fontSize: 11.5,
    fontFamily: fonts.medium,
  },
  actionFooterTextNormal: {
    color: '#0369A1',
  },
  actionFooterTextWarning: {
    color: '#B45309',
  },
});
