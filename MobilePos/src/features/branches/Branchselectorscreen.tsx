import { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
import { fonts } from '@/constants/fonts';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import AppBackground from '@/components/AppBackground';
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
    return <AppLoadingScreen message="Loading available branches..." />;
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="dark" />
      {/* Dynamic Ambient Background Style */}
      <AppBackground />

      <View style={styles.container}>
        {/* Header Introduction */}
        <View style={styles.header}>
          <View style={styles.tagLabelBadge}>
            <View style={styles.tagDot} />
            <Text style={styles.tagLabel}>SELECT ACTIVE OUTLET</Text>
          </View>
          <Text style={styles.title}>Branch Terminal</Text>
          <Text style={styles.subtitle}>
            Choose which branch location you want this POS terminal to operate under
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
          renderItem={({ item, index }) => {
            const isCurrent = currentBranch?.id === item.id;
            // Distinct visual themes for 1st and 2nd branch
            const isFirst = index === 0;
            const iconBg = isCurrent ? '#ECFDF5' : isFirst ? '#ECFDF5' : '#EFF6FF';
            const iconColor = isCurrent ? '#059669' : isFirst ? '#059669' : '#2563EB';

            return (
              <TouchableOpacity
                style={[styles.branchCard, isCurrent && styles.branchCardCurrent]}
                onPress={() => handleSelect(item)}
                activeOpacity={0.82}
              >
                {/* Top Row: Store Icon & Status Badge */}
                <View style={styles.cardTopRow}>
                  <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
                    <Ionicons
                      name={isFirst ? 'storefront' : 'business'}
                      size={24}
                      color={iconColor}
                    />
                  </View>

                  {isCurrent ? (
                    <View style={styles.connectedBadge}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.connectedBadgeText}>CURRENT ACTIVE</Text>
                    </View>
                  ) : (
                    <View style={styles.availableBadge}>
                      <Text style={styles.availableBadgeText}>AVAILABLE OUTLET</Text>
                    </View>
                  )}
                </View>

                {/* Hero Branch Name Section - Bold, large, crystal clear */}
                <View style={styles.branchNameGroup}>
                  <Text style={styles.branchNameHero}>{item.name}</Text>
                  <View style={styles.metaChipsRow}>
                    <View style={styles.metaChip}>
                      <Ionicons name="location-sharp" size={13} color="#059669" />
                      <Text style={styles.metaChipText}>Outlet #{item.branch_code}</Text>
                    </View>
                    <View style={styles.metaChipDivider} />
                    <View style={styles.metaChip}>
                      <Ionicons name="shield-checkmark" size={13} color="#2563EB" />
                      <Text style={styles.metaChipText}>Cloud POS Live</Text>
                    </View>
                  </View>
                </View>

                {/* Bottom Action Footer */}
                {isCurrent ? (
                  <View style={styles.currentConnectedBar}>
                    <Ionicons name="checkmark-circle" size={18} color="#059669" />
                    <Text style={styles.currentConnectedBarText}>
                      Currently operating under this branch
                    </Text>
                  </View>
                ) : (
                  <View style={styles.switchBranchBtn}>
                    <Text style={styles.switchBranchBtnText}>
                      Switch to {item.name}
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </View>
                )}
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 14 : 10,
  },
  header: {
    marginBottom: 20,
    marginTop: 6,
  },
  tagLabelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  tagLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
    color: '#059669',
  },
  title: {
    fontSize: 26,
    fontFamily: fonts.extraBold,
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13.5,
    color: '#64748B',
    fontFamily: fonts.regular,
    lineHeight: 20,
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
    fontFamily: fonts.semiBold,
    flex: 1,
  },
  listContent: {
    paddingBottom: 36,
    gap: 16,
  },

  // Big, Prominent Branch Selection Card
  branchCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  branchCardCurrent: {
    borderColor: '#059669',
    borderWidth: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  livePulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  connectedBadgeText: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: '#059669',
    letterSpacing: 0.6,
  },
  availableBadge: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  availableBadgeText: {
    fontSize: 10.5,
    fontFamily: fonts.semiBold,
    color: '#64748B',
    letterSpacing: 0.6,
  },

  // Branch Name Hero Heading
  branchNameGroup: {
    marginBottom: 18,
  },
  branchNameHero: {
    fontSize: 24,
    fontFamily: fonts.extraBold,
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  metaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metaChipText: {
    fontSize: 12.5,
    fontFamily: fonts.medium,
    color: '#64748B',
  },
  metaChipDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },

  // Footer Options
  currentConnectedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  currentConnectedBarText: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: '#059669',
  },
  switchBranchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D7F41',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    gap: 8,
    shadowColor: '#0D7F41',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  switchBranchBtnText: {
    fontSize: 13.5,
    fontFamily: fonts.bold,
    color: '#FFFFFF',
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
    fontFamily: fonts.bold,
    color: colors.textPrimary,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    fontFamily: fonts.regular,
  },
});