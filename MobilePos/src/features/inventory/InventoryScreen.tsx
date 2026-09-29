import { useEffect, useState, memo, useCallback } from 'react';
import { View, Text, FlatList, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { inventoryApi } from './inventoryApi';
import { useBranch } from '../branches/BranchContext';
import { useDebouncedValue } from '@/hooks/Usedebouncedvalue ';
import { colors } from '@/constants/colors';
import type { InventoryRow } from '@/lib/types';

const InventoryItem = memo(function InventoryItem({ item }: { item: InventoryRow }) {
  const isLow = item.quantity <= item.min_quantity;
  return (
    <View className="flex-row justify-between items-center py-3 border-b border-neutral-100">
      <View>
        <Text className="font-semibold text-neutral-900">{item.products.name}</Text>
        <Text className="text-xs text-neutral-400 mt-0.5">{item.products.item_code}</Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {isLow && <Ionicons name="warning-outline" size={14} color="#DC2626" />}
        <Text className={`font-semibold ${isLow ? 'text-red-600' : 'text-neutral-900'}`}>
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
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentBranch) return;
    inventoryApi
      .search(currentBranch.id, debouncedSearch)
      .then(setItems)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [currentBranch, debouncedSearch]);

  const renderItem = useCallback(({ item }: { item: InventoryRow }) => <InventoryItem item={item} />, []);
  const keyExtractor = useCallback((item: InventoryRow) => item.products.item_code, []);

  return (
    <View className="flex-1 bg-white px-4 pt-4">
      <View className="flex-row items-center border border-neutral-300 rounded-lg px-3 py-2 mb-3">
        <Ionicons name="search-outline" size={16} color={colors.textMuted} />
        <TextInput
          className="flex-1 ml-2 text-neutral-900"
          placeholder="Search product..."
          placeholderTextColor={colors.textMuted}
          value={searchInput}
          onChangeText={setSearchInput}
        />
      </View>

      {error ? <Text className="text-red-600 mb-2">{error}</Text> : null}

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