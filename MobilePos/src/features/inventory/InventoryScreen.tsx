import { useEffect, useState, memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  ScrollView,
  TextInput,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inventoryApi, InventoryStats, InventoryStockFilter } from './inventoryApi';
import { productsApi } from '../products/productsApi';
import { useBranch } from '../branches/BranchContext';
import { useDebouncedValue } from '@/hooks/Usedebouncedvalue ';
import { colors } from '@/constants/colors';
import LoadErrorBanner, { describeLoadError } from '@/components/LoadErrorBanner';
import type { InventoryRow, Category } from '@/lib/types';

const InventoryItem = memo(function InventoryItem({ item }: { item: InventoryRow }) {
  const isOut = item.quantity <= 0;
  const isLow = !isOut && item.quantity <= item.min_quantity;

  return (
    <View className="flex-row justify-between items-center py-3 border-b border-neutral-100">
      <View className="flex-1 pr-2">
        <Text className="font-semibold text-neutral-900">{item.products.name}</Text>
        <Text className="text-xs text-neutral-400 mt-0.5">{item.products.item_code}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {isOut ? (
          <Ionicons name="close-circle-outline" size={14} color="#DC2626" />
        ) : isLow ? (
          <Ionicons name="warning-outline" size={14} color="#D97706" />
        ) : null}
        <Text
          className={`font-semibold ${
            isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-neutral-900'
          }`}
        >
          {item.quantity} {item.products.unit}
        </Text>
      </View>
    </View>
  );
});

export default function InventoryScreen() {
  const { currentBranch } = useBranch();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [stockFilter, setStockFilter] = useState<InventoryStockFilter>('all');
  const [stockFilterModalVisible, setStockFilterModalVisible] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [stats, setStats] = useState<InventoryStats>({ totalProducts: 0, lowStock: 0, outOfStock: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch summary stats & categories on branch change
  useEffect(() => {
    if (!currentBranch) return;
    inventoryApi
      .getStats(currentBranch.id)
      .then(setStats)
      .catch((e) => setError(describeLoadError(e)));

    productsApi
      .getCategories(currentBranch.id)
      .then((cats) => {
        if (cats.length > 0) setCategories(cats);
      })
      .catch((e) => console.warn('Failed to load categories:', e));
  }, [currentBranch]);

  // Fetch inventory list whenever branch, search, stock filter, or category changes
  useEffect(() => {
    if (!currentBranch) return;
    inventoryApi
      .search(currentBranch.id, debouncedSearch, stockFilter, selectedCategory)
      .then((rows) => {
        setItems(rows);
        setError('');
      })
      .catch((e) => {
        setItems([]);
        setError(describeLoadError(e));
      })
      .finally(() => setLoading(false));
  }, [currentBranch, debouncedSearch, stockFilter, selectedCategory]);

  // Branch-wide counts always come from getStats, never from the filtered list.
  const effectiveStats = stats;

  const categoryList = useMemo(() => {
    return [{ id: 'all', name: 'All', code_prefix: 'ALL' }, ...categories];
  }, [categories]);

  const renderItem = useCallback(({ item }: { item: InventoryRow }) => <InventoryItem item={item} />, []);
  const keyExtractor = useCallback((item: InventoryRow) => item.products.item_code, []);

  return (
    <View style={styles.container}>
      {/* 1. Summary Cards Top of Search Bar (Total Products, Low Stock, Out of Stock) */}
      <View style={styles.statsRow}>
        {/* Total Products Card */}
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#059669' }]}>
            {effectiveStats.totalProducts}
          </Text>
          <Text style={styles.statLabel}>Total Products</Text>
        </View>

        {/* Low Stock Card */}
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#D97706' }]}>
            {effectiveStats.lowStock}
          </Text>
          <Text style={styles.statLabel}>Low Stock</Text>
        </View>

        {/* Out of Stock Card */}
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#DC2626' }]}>
            {effectiveStats.outOfStock}
          </Text>
          <Text style={styles.statLabel}>Out of Stock</Text>
        </View>
      </View>

      {/* 2. Search Input Bar & Stock Status Filter Dropdown */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search product..."
            placeholderTextColor={colors.textMuted}
            value={searchInput}
            onChangeText={setSearchInput}
          />
          {searchInput.length > 0 && (
            <TouchableOpacity onPress={() => setSearchInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Stock Status Dropdown Button */}
        <TouchableOpacity
          style={[
            styles.stockFilterBtn,
            stockFilter === 'low' && styles.stockFilterBtnLow,
            stockFilter === 'out' && styles.stockFilterBtnOut,
          ]}
          onPress={() => setStockFilterModalVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={
              stockFilter === 'out'
                ? 'close-circle'
                : stockFilter === 'low'
                ? 'warning'
                : 'layers-outline'
            }
            size={14}
            color={
              stockFilter === 'out'
                ? '#DC2626'
                : stockFilter === 'low'
                ? '#D97706'
                : colors.primary
            }
          />
          <Text
            style={[
              styles.stockFilterBtnText,
              stockFilter === 'low' && styles.stockFilterBtnTextLow,
              stockFilter === 'out' && styles.stockFilterBtnTextOut,
            ]}
            numberOfLines={1}
          >
            {stockFilter === 'out'
              ? 'Out Stock'
              : stockFilter === 'low'
              ? 'Low Stock'
              : 'All Stock'}
          </Text>
          <Ionicons
            name="chevron-down"
            size={12}
            color={
              stockFilter === 'out'
                ? '#DC2626'
                : stockFilter === 'low'
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
                stockFilter === 'all' && styles.filterMenuItemActive,
              ]}
              onPress={() => {
                setStockFilter('all');
                setStockFilterModalVisible(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.filterMenuLeft}>
                <View style={[styles.filterIconBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="layers-outline" size={16} color={colors.primary} />
                </View>
                <View>
                  <Text style={[styles.filterMenuLabel, stockFilter === 'all' && styles.filterMenuLabelActive]}>
                    All Stock
                  </Text>
                  <Text style={styles.filterMenuSub}>Show all products</Text>
                </View>
              </View>
              <View style={styles.filterMenuRight}>
                <View style={[styles.filterCountBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Text style={[styles.filterCountText, { color: colors.primary }]}>{effectiveStats.totalProducts}</Text>
                </View>
                {stockFilter === 'all' && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.primary} />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 2: Low Stock */}
            <TouchableOpacity
              style={[
                styles.filterMenuItem,
                stockFilter === 'low' && styles.filterMenuItemActive,
              ]}
              onPress={() => {
                setStockFilter('low');
                setStockFilterModalVisible(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.filterMenuLeft}>
                <View style={[styles.filterIconBadge, { backgroundColor: '#FFFBEB' }]}>
                  <Ionicons name="warning-outline" size={16} color="#D97706" />
                </View>
                <View>
                  <Text style={[styles.filterMenuLabel, stockFilter === 'low' && styles.filterMenuLabelActive]}>
                    Low Stock
                  </Text>
                  <Text style={styles.filterMenuSub}>Quantity ≤ min threshold</Text>
                </View>
              </View>
              <View style={styles.filterMenuRight}>
                <View style={[styles.filterCountBadge, { backgroundColor: '#FFFBEB' }]}>
                  <Text style={[styles.filterCountText, { color: '#D97706' }]}>{effectiveStats.lowStock}</Text>
                </View>
                {stockFilter === 'low' && (
                  <Ionicons name="checkmark-circle" size={18} color="#D97706" />
                )}
              </View>
            </TouchableOpacity>

            {/* Option 3: Out of Stock */}
            <TouchableOpacity
              style={[
                styles.filterMenuItem,
                stockFilter === 'out' && styles.filterMenuItemActive,
              ]}
              onPress={() => {
                setStockFilter('out');
                setStockFilterModalVisible(false);
              }}
              activeOpacity={0.7}
            >
              <View style={styles.filterMenuLeft}>
                <View style={[styles.filterIconBadge, { backgroundColor: '#FEF2F2' }]}>
                  <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
                </View>
                <View>
                  <Text style={[styles.filterMenuLabel, stockFilter === 'out' && styles.filterMenuLabelActive]}>
                    Out of Stock
                  </Text>
                  <Text style={styles.filterMenuSub}>Depleted items (0 qty)</Text>
                </View>
              </View>
              <View style={styles.filterMenuRight}>
                <View style={[styles.filterCountBadge, { backgroundColor: '#FEF2F2' }]}>
                  <Text style={[styles.filterCountText, { color: '#DC2626' }]}>{effectiveStats.outOfStock}</Text>
                </View>
                {stockFilter === 'out' && (
                  <Ionicons name="checkmark-circle" size={18} color="#DC2626" />
                )}
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* 3. Category Filter Pills (Under Search Bar) */}
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

      <LoadErrorBanner message={error || null} />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 20 }} color={colors.primary} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          removeClippedSubviews
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={7}
          ListEmptyComponent={
            <View className="items-center justify-center py-12">
              <Ionicons name="cube-outline" size={40} color={colors.textMuted} />
              <Text className="text-center text-neutral-500 mt-3 font-medium">No items found.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
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
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: '#FFFFFF',
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    color: '#0F172A',
    fontSize: 14,
  },
  stockFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
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
    color: '#0F172A',
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
  categoryFilterContainer: {
    marginBottom: 14,
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
});