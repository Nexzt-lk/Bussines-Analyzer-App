import { useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { productsApi } from './productsApi';
import { useBranch } from '../branches/BranchContext';
import { colors } from '@/constants/colors';
import type { Category } from '@/lib/types';

export default function AddProductScreen() {
  const router = useRouter();
  const { currentBranch } = useBranch();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [barcode, setBarcode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentBranch) return;
    productsApi.getCategories(currentBranch.id).then(setCategories);
  }, [currentBranch]);

  const handleSave = useCallback(async () => {
    if (!currentBranch) return;
    setError('');

    if (!categoryId || !name || !price) {
      setError('Category, name, and price are required.');
      return;
    }

    setSaving(true);
    try {
      const itemCode = await productsApi.generateItemCode(categoryId);
      await productsApi.create({
        shop_id: currentBranch.id,
        category_id: categoryId,
        item_code: itemCode,
        name,
        price: Number(price),
        barcode: barcode || null,
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  }, [currentBranch, categoryId, name, price, barcode, router]);

  return (
    <ScrollView className="flex-1 bg-white px-4 pt-4">
      <View className="flex-row items-center gap-1.5 mb-1 mt-2">
        <Ionicons name="pricetag-outline" size={14} color={colors.textSecondary} />
        <Text className="text-sm font-semibold text-neutral-600">Category</Text>
      </View>
      <View className="flex-row flex-wrap gap-2 mb-2">
        {categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            onPress={() => setCategoryId(c.id)}
            className={`px-3 py-2 rounded-lg ${categoryId === c.id ? 'bg-emerald-600' : 'bg-neutral-100'}`}
          >
            <Text className={categoryId === c.id ? 'text-white font-medium' : 'text-neutral-700'}>
              {c.name} ({c.code_prefix})
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text className="text-sm font-semibold text-neutral-600 mb-1 mt-3">Product Name</Text>
      <TextInput
        className="border border-neutral-300 rounded-lg px-3 py-2.5 text-neutral-900"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Chocolate Cupcake"
        placeholderTextColor={colors.textMuted}
      />

      <Text className="text-sm font-semibold text-neutral-600 mb-1 mt-3">Price (Rs.)</Text>
      <TextInput
        className="border border-neutral-300 rounded-lg px-3 py-2.5 text-neutral-900"
        value={price}
        onChangeText={setPrice}
        keyboardType="numeric"
        placeholder="e.g. 250"
        placeholderTextColor={colors.textMuted}
      />

      <View className="flex-row items-center gap-1.5 mb-1 mt-3">
        <Ionicons name="barcode-outline" size={14} color={colors.textSecondary} />
        <Text className="text-sm font-semibold text-neutral-600">Barcode (optional)</Text>
      </View>
      <TextInput
        className="border border-neutral-300 rounded-lg px-3 py-2.5 text-neutral-900"
        value={barcode}
        onChangeText={setBarcode}
        placeholder="Leave empty if none"
        placeholderTextColor={colors.textMuted}
      />

      {error ? (
        <View className="flex-row items-center gap-2 mt-3 bg-red-50 border border-red-200 p-2.5 rounded-lg">
          <Ionicons name="alert-circle-outline" size={16} color="#DC2626" />
          <Text className="text-red-600 text-sm font-medium">{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        className="bg-emerald-600 rounded-lg py-3 flex-row items-center justify-center gap-2 mt-6 mb-8"
        onPress={handleSave}
        disabled={saving}
      >
        {!saving && <Ionicons name="add" size={18} color="#FFFFFF" />}
        <Text className="text-white font-bold text-base">{saving ? 'Saving...' : 'Add Product'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}