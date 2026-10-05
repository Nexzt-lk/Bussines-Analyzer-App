import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNotifications } from './NotificationContext';
import { colors } from '@/constants/colors';
import type { AppNotification } from './notificationTypes';

export const NotificationBanner: React.FC = () => {
  const { activeToast, dismissToast, openModal } = useNotifications();
  const [translateY] = useState(() => new Animated.Value(-120));
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (activeToast) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 6,
          speed: 14,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -120,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [activeToast, translateY, opacity]);

  if (!activeToast) return null;

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

  const iconInfo = getIconProps(activeToast);

  const handlePress = () => {
    dismissToast();
    openModal();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={handlePress}
      >
        <View style={[styles.iconCircle, { backgroundColor: iconInfo.bg }]}>
          <Ionicons name={iconInfo.name} size={22} color={iconInfo.color} />
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {activeToast.title}
            </Text>
            <Text style={styles.timeText}>Just now</Text>
          </View>
          <Text style={styles.body} numberOfLines={2}>
            {activeToast.body}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.closeButton}
          onPress={dismissToast}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={18} color="#64748B" />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 36,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 10,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
    marginRight: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  body: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  closeButton: {
    padding: 4,
  },
});
