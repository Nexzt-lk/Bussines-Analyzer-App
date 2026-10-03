import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { branchesApi } from './branchApi';
import { useBranch } from './BranchContext';
import { colors } from '@/constants/colors';
import type { Branch } from '@/lib/types';

export default function BranchSelectorScreen() {
  const router = useRouter();
  const { currentBranch, selectBranch } = useBranch();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    branchesApi
      .getActive()
      .then(setBranches)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (branch: Branch) => {
    await selectBranch(branch);
    router.replace('/');
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading available branches...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* Header Introduction matching uploaded design */}
        <View style={styles.header}>
          <Text style={styles.tagLabel}>YOUR LOCATIONS</Text>
          <Text style={styles.title}>Select Branch</Text>
          <Text style={styles.subtitle}>
            Choose which branch to operate this terminal under
          </Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.dangerText} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <FlatList
          data={branches}
          keyExtractor={(b) => b.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const isCurrent = currentBranch?.id === item.id;
            return (
              <TouchableOpacity
                style={[styles.branchCard, isCurrent && styles.branchCardCurrent]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.75}
              >
                {/* Left storefront icon squircle */}
                <View style={[styles.iconContainer, isCurrent && styles.iconContainerCurrent]}>
                  <Ionicons name="storefront-outline" size={22} color={colors.primary} />
                </View>

                {/* Center: Branch name, code only, and active pill badge */}
                <View style={styles.branchInfo}>
                  <Text style={styles.branchName}>{item.name}</Text>
                  <Text style={styles.branchCode}>#{item.branch_code}</Text>
                  <View style={styles.activeBadgeRow}>
                    <View style={styles.activeDot} />
                    <Text style={styles.activeBadgeText}>
                      {isCurrent ? 'Current Active' : 'Active'}
                    </Text>
                  </View>
                </View>

                {/* Right chevron */}
                <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="storefront-outline" size={36} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>No branches found</Text>
              <Text style={styles.emptySubtitle}>
                No active branch was found. Please contact an administrator.
              </Text>
            </View>
          }
        />
      </View>
    </SafeAreaView>
  );
}

const serifFont = Platform.select({
  ios: 'Georgia',
  android: 'serif',
  default: 'serif',
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FBF9',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 14 : 10,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FBF9',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  header: {
    marginBottom: 24,
    marginTop: 8,
  },
  tagLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.primary,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  listContent: {
    paddingBottom: 32,
    gap: 14,
  },
  branchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingVertical: 18,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8ECE8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    gap: 14,
  },
  branchCardCurrent: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#F1F5F2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainerCurrent: {
    backgroundColor: colors.primarySurface,
  },
  branchInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  branchName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#18181B',
    letterSpacing: -0.2,
  },
  branchCode: {
    fontSize: 13,
    color: '#71717A',
    marginTop: 2,
    marginBottom: 8,
    fontWeight: '500',
  },
  activeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 12,
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0D7F41',
  },
  activeBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0D7F41',
  },
  emptyContainer: {
    paddingTop: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
});