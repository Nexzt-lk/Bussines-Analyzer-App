import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useBranch } from '../branches/BranchContext';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import AppBackground from '@/components/AppBackground';
import LoadErrorBanner, { describeLoadError } from '@/components/LoadErrorBanner';
import {
  supplierPurchasesApi,
  SupplierPurchaseRecord,
  SupplierPurchasesResponse,
} from './supplierPurchasesApi';

export default function SupplierPurchasesScreen() {
  const router = useRouter();
  const { currentBranch } = useBranch();
  const branchId = currentBranch?.id ?? '';

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<SupplierPurchasesResponse | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSupplierFilter, setSelectedSupplierFilter] = useState<string>('all');
  const [selectedRecord, setSelectedRecord] = useState<SupplierPurchaseRecord | null>(null);

  const formatRs = useCallback((num: number) => {
    return 'Rs ' + num.toLocaleString();
  }, []);

  const loadPurchases = useCallback(async () => {
    try {
      const res = await supplierPurchasesApi.getPurchases(branchId);
      setData(res);
      setLoadError(null);
    } catch (err) {
      setData(null);
      setLoadError(describeLoadError(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [branchId]);

  useEffect(() => {
    setLoading(true);
    loadPurchases();
  }, [loadPurchases]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPurchases();
  }, [loadPurchases]);

  // Unique list of suppliers for filter pills
  const suppliersList = useMemo(() => {
    const set = new Set<string>();
    (data?.records || []).forEach((r) => {
      if (r.supplierName) set.add(r.supplierName);
    });
    return ['all', ...Array.from(set)];
  }, [data?.records]);

  // Filtered records by search and supplier pill
  const filteredRecords = useMemo(() => {
    if (!data?.records) return [];
    let list = data.records;

    if (selectedSupplierFilter !== 'all') {
      list = list.filter((r) => r.supplierName === selectedSupplierFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.productName.toLowerCase().includes(q) ||
          r.supplierName.toLowerCase().includes(q) ||
          (r.invoiceNo && r.invoiceNo.toLowerCase().includes(q)) ||
          (r.itemCode && r.itemCode.toLowerCase().includes(q))
      );
    }

    return list;
  }, [data?.records, selectedSupplierFilter, searchQuery]);

  // Filtered summary calculations
  const filteredTotalCost = useMemo(() => {
    return filteredRecords.reduce((s, r) => s + r.totalCost, 0);
  }, [filteredRecords]);

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
        {/* 1. Header Bar with Back Button */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Ionicons name="arrow-back" size={20} color="#0F172A" />
          </TouchableOpacity>

          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Supplier Purchases</Text>
            <Text style={styles.headerSubtitle}>
              {currentBranch?.name ? `${currentBranch.name} • ` : ''}Stock procurement costs
            </Text>
          </View>
        </View>

        <LoadErrorBanner message={loadError} onRetry={onRefresh} />

        {/* 2. Top Summary KPI Cards */}
        <View style={styles.statsRow}>
          {/* Card 1: Total Cost Spent */}
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="wallet-outline" size={16} color="#059669" />
            </View>
            <Text style={styles.statLabel}>Total Procurement Cost</Text>
            <Text style={[styles.statValue, { color: '#059669' }]}>
              {formatRs(filteredTotalCost)}
            </Text>
          </View>

          {/* Card 2: Purchases Count */}
          <View style={styles.statCardSmall}>
            <View style={[styles.statIconBox, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="receipt-outline" size={15} color="#2563EB" />
            </View>
            <Text style={styles.statLabel}>Purchases</Text>
            <Text style={[styles.statValueSmall, { color: '#2563EB' }]}>
              {filteredRecords.length} {filteredRecords.length === 1 ? 'batch' : 'batches'}
            </Text>
          </View>

          {/* Card 3: Suppliers Count */}
          <View style={styles.statCardSmall}>
            <View style={[styles.statIconBox, { backgroundColor: '#FAF5FF' }]}>
              <Ionicons name="business-outline" size={15} color="#7C3AED" />
            </View>
            <Text style={styles.statLabel}>Suppliers</Text>
            <Text style={[styles.statValueSmall, { color: '#7C3AED' }]}>
              {data?.summary.uniqueSuppliersCount ?? 0} active
            </Text>
          </View>
        </View>

        {/* 3. Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by supplier or product..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* 4. Supplier Filter Pills (if multiple suppliers exist) */}
        {suppliersList.length > 2 && (
          <View style={styles.supplierFilterRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.supplierFilterScroll}
            >
              {suppliersList.map((sup) => {
                const isSelected = selectedSupplierFilter === sup;
                const label = sup === 'all' ? 'All Suppliers' : sup;
                return (
                  <TouchableOpacity
                    key={sup}
                    style={[
                      styles.supplierPill,
                      isSelected && styles.supplierPillActive,
                    ]}
                    onPress={() => setSelectedSupplierFilter(sup)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.supplierPillText,
                        isSelected && styles.supplierPillTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* 5. Purchases List Section */}
        <View style={styles.listSectionHeader}>
          <Text style={styles.listSectionTitle}>Procurement Records</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{filteredRecords.length} records</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>Fetching supplier purchases from Supabase...</Text>
          </View>
        ) : filteredRecords.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cart-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No supplier purchases found</Text>
            <Text style={styles.emptySubtitle}>
              When stock is procured and received from suppliers, purchase costs will appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.recordsList}>
            {filteredRecords.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.recordCard}
                onPress={() => setSelectedRecord(item)}
                activeOpacity={0.75}
              >
                <View style={styles.cardTopRow}>
                  <View style={styles.productInfoLeft}>
                    <View style={styles.productTitleRow}>
                      <Ionicons name="cube" size={15} color="#059669" />
                      <Text style={styles.productName} numberOfLines={1}>
                        {item.productName}
                      </Text>
                    </View>

                    <View style={styles.supplierRow}>
                      <Ionicons name="business" size={12} color="#64748B" />
                      <Text style={styles.supplierName} numberOfLines={1}>
                        {item.supplierName}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardCostRight}>
                    <Text style={styles.totalCostText}>{formatRs(item.totalCost)}</Text>
                    <Text style={styles.unitCostText}>
                      {item.quantity} {item.unit} @ {formatRs(item.costPerUnit)}/{item.unit}
                    </Text>
                  </View>
                </View>

                {/* Card Footer: Date, Time & Payment Method */}
                <View style={styles.cardFooter}>
                  <View style={styles.dateTimeBadge}>
                    <Ionicons name="calendar-outline" size={11} color="#64748B" />
                    <Text style={styles.dateTimeText}>
                      {item.date} · {item.time}
                    </Text>
                  </View>

                  <View style={styles.badgeGroup}>
                    {item.invoiceNo && (
                      <View style={styles.invoiceBadge}>
                        <Text style={styles.invoiceBadgeText}>Inv: {item.invoiceNo}</Text>
                      </View>
                    )}
                    <View style={styles.paymentMethodPill}>
                      <Text style={styles.paymentMethodText}>{item.paymentMethod}</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 6. Detail Modal */}
      <Modal
        visible={Boolean(selectedRecord)}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedRecord(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Purchase Receipt</Text>
                <Text style={styles.modalSubtitle}>
                  {selectedRecord?.date} · {selectedRecord?.time}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedRecord(null)}
                style={styles.modalCloseButton}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Total Paid Hero */}
            <View style={styles.modalHeroBox}>
              <Text style={styles.modalHeroLabel}>TOTAL AMOUNT PAID</Text>
              <Text style={styles.modalHeroAmount}>
                {formatRs(selectedRecord?.totalCost ?? 0)}
              </Text>
              <View style={styles.modalPaidBadge}>
                <Ionicons name="checkmark-circle" size={13} color="#059669" />
                <Text style={styles.modalPaidText}>Payment Method: {selectedRecord?.paymentMethod}</Text>
              </View>
            </View>

            {/* Details Breakdown */}
            <View style={styles.modalDetailsList}>
              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailKey}>Product</Text>
                <Text style={styles.modalDetailVal}>{selectedRecord?.productName}</Text>
              </View>

              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailKey}>Supplier</Text>
                <Text style={styles.modalDetailVal}>{selectedRecord?.supplierName}</Text>
              </View>

              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailKey}>Stock Quantity</Text>
                <Text style={styles.modalDetailVal}>
                  {selectedRecord?.quantity} {selectedRecord?.unit}
                </Text>
              </View>

              <View style={styles.modalDetailRow}>
                <Text style={styles.modalDetailKey}>Unit Cost</Text>
                <Text style={styles.modalDetailVal}>
                  {formatRs(selectedRecord?.costPerUnit ?? 0)} per {selectedRecord?.unit}
                </Text>
              </View>

              {selectedRecord?.invoiceNo && (
                <View style={styles.modalDetailRow}>
                  <Text style={styles.modalDetailKey}>Invoice Number</Text>
                  <Text style={styles.modalDetailVal}>{selectedRecord.invoiceNo}</Text>
                </View>
              )}
            </View>

            {/* Close Button */}
            <TouchableOpacity
              style={styles.modalActionBtn}
              onPress={() => setSelectedRecord(null)}
              activeOpacity={0.8}
            >
              <Text style={styles.modalActionBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootWrapper: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#64748B',
    marginTop: 1,
  },

  // Stats KPI Row
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1.4,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  statCardSmall: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  statIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: '#64748B',
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 16,
    fontFamily: fonts.bold,
    marginTop: 4,
  },
  statValueSmall: {
    fontSize: 13,
    fontFamily: fonts.bold,
    marginTop: 4,
  },

  // Search Bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: '#0F172A',
    padding: 0,
  },

  // Supplier filter pills
  supplierFilterRow: {
    marginBottom: 14,
  },
  supplierFilterScroll: {
    gap: 8,
  },
  supplierPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  supplierPillActive: {
    backgroundColor: '#059669',
  },
  supplierPillText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: '#475569',
  },
  supplierPillTextActive: {
    color: '#FFFFFF',
  },

  // List section header
  listSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    marginTop: 4,
  },
  listSectionTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#64748B',
  },

  // Record Cards
  recordsList: {
    gap: 10,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  productInfoLeft: {
    flex: 1,
  },
  productTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productName: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: '#0F172A',
    flex: 1,
  },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  supplierName: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#64748B',
    flex: 1,
  },
  cardCostRight: {
    alignItems: 'flex-end',
  },
  totalCostText: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#059669',
  },
  unitCostText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#64748B',
    marginTop: 2,
  },

  // Card Footer
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  dateTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dateTimeText: {
    fontSize: 11,
    fontFamily: fonts.medium,
    color: '#64748B',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  invoiceBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  invoiceBadgeText: {
    fontSize: 10,
    fontFamily: fonts.semiBold,
    color: '#64748B',
  },
  paymentMethodPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  paymentMethodText: {
    fontSize: 10,
    fontFamily: fonts.bold,
    color: '#059669',
  },

  // Loading & Empty States
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: '#1E293B',
    marginTop: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#64748B',
    textAlign: 'center',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
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
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalHeroBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  modalHeroLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#059669',
    letterSpacing: 0.5,
  },
  modalHeroAmount: {
    fontSize: 26,
    fontFamily: fonts.extraBold,
    color: '#047857',
    marginVertical: 4,
  },
  modalPaidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalPaidText: {
    fontSize: 11.5,
    fontFamily: fonts.bold,
    color: '#059669',
  },
  modalDetailsList: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 16,
  },
  modalDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalDetailKey: {
    fontSize: 12,
    fontFamily: fonts.medium,
    color: '#64748B',
  },
  modalDetailVal: {
    fontSize: 12.5,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  modalActionBtn: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalActionBtnText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#FFFFFF',
  },
});
