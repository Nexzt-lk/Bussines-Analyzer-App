import React, { useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from './NotificationContext';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import type { AppNotification, NotificationCategoryType } from './notificationTypes';

type FilterType = 'all' | 'order' | 'inventory' | 'summary';

export const NotificationModal: React.FC = () => {
  const {
    notifications,
    unreadCount,
    isModalOpen,
    closeModal,
    markAsRead,
    markAllAsRead,
    clearAll,
    sendTestNotification,
  } = useNotifications();

  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [testingCategory, setTestingCategory] = useState<string | null>(null);

  const filteredList = notifications.filter((item) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'order') return item.category === 'order';
    if (activeFilter === 'inventory') {
      return item.category === 'stock_update' || item.category === 'low_stock';
    }
    if (activeFilter === 'summary') return item.category === 'daily_summary';
    return true;
  });

  const handleTest = async (category: NotificationCategoryType) => {
    setTestingCategory(category);
    try {
      await sendTestNotification(category);
    } finally {
      setTimeout(() => setTestingCategory(null), 500);
    }
  };

  const formatTimestamp = (isoString: string) => {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${mins}`;

    if (isToday) return `Today, ${timeStr}`;
    return `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}, ${timeStr}`;
  };

  const getIconProps = (notif: AppNotification) => {
    switch (notif.category) {
      case 'order':
        return {
          name: 'bag-check' as const,
          color: '#059669',
          bg: '#D1FAE5',
        };
      case 'low_stock':
        return {
          name: notif.severity === 'critical' ? ('alert-circle' as const) : ('warning' as const),
          color: notif.severity === 'critical' ? '#DC2626' : '#D97706',
          bg: notif.severity === 'critical' ? '#FEE2E2' : '#FEF3C7',
        };
      case 'stock_update':
        return {
          name: 'cube' as const,
          color: '#2563EB',
          bg: '#DBEAFE',
        };
      case 'daily_summary':
      default:
        return {
          name: 'stats-chart' as const,
          color: '#7C3AED',
          bg: '#EDE9FE',
        };
    }
  };

  const renderItem = ({ item }: { item: AppNotification }) => {
    const iconInfo = getIconProps(item);

    return (
      <TouchableOpacity
        style={[styles.itemCard, !item.read && styles.itemCardUnread]}
        activeOpacity={0.75}
        onPress={() => markAsRead(item.id)}
      >
        <View style={[styles.itemIconCircle, { backgroundColor: iconInfo.bg }]}>
          <Ionicons name={iconInfo.name} size={20} color={iconInfo.color} />
        </View>

        <View style={styles.itemContent}>
          <View style={styles.itemHeaderRow}>
            <Text style={[styles.itemTitle, !item.read && styles.itemTitleBold]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={styles.itemTime}>{formatTimestamp(item.createdAt)}</Text>
          </View>

          <Text style={styles.itemBody}>{item.body}</Text>
        </View>

        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={isModalOpen}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={closeModal}
    >
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount} new</Text>
              </View>
            )}
          </View>

          <View style={styles.headerRight}>
            {unreadCount > 0 && (
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={markAllAsRead}
                activeOpacity={0.7}
              >
                <Text style={styles.markAllText}>Mark all read</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.closeHeaderButton}
              onPress={closeModal}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={24} color="#334155" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Test Bar (Allows immediate testing of all required notifications) */}
        <View style={styles.testBarContainer}>
          <Text style={styles.testBarLabel}>⚡ Instant Test Triggers:</Text>
          <View style={styles.testButtonsRow}>
            <TouchableOpacity
              style={[styles.testButton, testingCategory === 'order' && styles.testButtonActive]}
              onPress={() => handleTest('order')}
              activeOpacity={0.7}
            >
              <Text style={styles.testButtonText}>🛒 Order</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testButton, testingCategory === 'stock_update' && styles.testButtonActive]}
              onPress={() => handleTest('stock_update')}
              activeOpacity={0.7}
            >
              <Text style={styles.testButtonText}>📦 Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testButton, testingCategory === 'low_stock' && styles.testButtonActive]}
              onPress={() => handleTest('low_stock')}
              activeOpacity={0.7}
            >
              <Text style={styles.testButtonText}>⚠️ Low Stock</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.testButton, testingCategory === 'daily_summary' && styles.testButtonActive]}
              onPress={() => handleTest('daily_summary')}
              activeOpacity={0.7}
            >
              <Text style={styles.testButtonText}>📊 6 PM Summary</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterPillsRow}>
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
            onPress={() => setActiveFilter('all')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
              All ({notifications.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'order' && styles.filterPillActive]}
            onPress={() => setActiveFilter('order')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'order' && styles.filterPillTextActive]}>
              Orders
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'inventory' && styles.filterPillActive]}
            onPress={() => setActiveFilter('inventory')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'inventory' && styles.filterPillTextActive]}>
              Stock & Warnings
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'summary' && styles.filterPillActive]}
            onPress={() => setActiveFilter('summary')}
          >
            <Text style={[styles.filterPillText, activeFilter === 'summary' && styles.filterPillTextActive]}>
              6 PM Summary
            </Text>
          </TouchableOpacity>
        </View>

        {/* Notifications List */}
        <FlatList
          data={filteredList}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="notifications-off-outline" size={36} color="#94A3B8" />
              </View>
              <Text style={styles.emptyTitle}>No Notifications Yet</Text>
              <Text style={styles.emptySubtitle}>
                Live notifications for Orders, Stock changes, Low Stock warnings, and 6 PM Sales Summaries will appear here.
              </Text>
            </View>
          }
        />

        {/* Bottom Actions */}
        {notifications.length > 0 && (
          <View style={styles.bottomBar}>
            <TouchableOpacity style={styles.clearAllButton} onPress={clearAll} activeOpacity={0.7}>
              <Ionicons name="trash-outline" size={16} color="#DC2626" />
              <Text style={styles.clearAllText}>Clear Notification History</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 16 : 8,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  unreadBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: fonts.bold,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  markAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  markAllText: {
    fontSize: 13,
    color: colors.primary,
    fontFamily: fonts.semiBold,
  },
  closeHeaderButton: {
    padding: 4,
  },
  testBarContainer: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  testBarLabel: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: '#475569',
    marginBottom: 6,
  },
  testButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  testButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  testButtonActive: {
    borderColor: colors.primary,
    backgroundColor: '#ECFDF5',
  },
  testButtonText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: '#334155',
  },
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterPill: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterPillActive: {
    backgroundColor: '#06572A',
  },
  filterPillText: {
    fontSize: 12,
    fontFamily: fonts.semiBold,
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  itemCardUnread: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  itemIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  itemContent: {
    flex: 1,
    marginRight: 6,
  },
  itemHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemTitle: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: '#1E293B',
    flex: 1,
    marginRight: 8,
  },
  itemTitleBold: {
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  itemTime: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: fonts.medium,
  },
  itemBody: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#475569',
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#0D7F41',
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: '#334155',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
  },
  bottomBar: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  clearAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  clearAllText: {
    fontSize: 13,
    color: '#DC2626',
    fontFamily: fonts.semiBold,
  },
});
