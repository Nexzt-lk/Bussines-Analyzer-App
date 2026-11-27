import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import type { TodayCashSessionSummary } from './cashSessionApi';

interface CashDrawerCardProps {
  cashSession: TodayCashSessionSummary | null;
  cashSales: number;
  cashExpenses: number;
  loading?: boolean;
}

const formatCurrency = (amount: number): string => {
  const rounded = Math.round(amount);
  return `LKR ${rounded.toLocaleString()}`;
};

export default function CashDrawerCard({
  cashSession,
  cashSales,
  cashExpenses,
  loading = false,
}: CashDrawerCardProps) {
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const openingFloat = cashSession?.openingFloat ?? 0;
  const cashInDrawer = openingFloat + cashSales - cashExpenses;
  const hasActiveSession = cashSession?.hasSession ?? false;
  const cashierName = cashSession?.cashierName;
  const terminalId = cashSession?.terminalId;
  const notes = cashSession?.sessions?.[0]?.notes;

  return (
    <>
      <TouchableOpacity
        style={styles.cardContainer}
        activeOpacity={0.85}
        onPress={() => setDetailModalVisible(true)}
      >
        {/* Top Header Row */}
        <View style={styles.headerRow}>
          <View style={styles.headerTitleWrap}>
            <View style={styles.iconBadge}>
              <Ionicons name="wallet-outline" size={17} color="#059669" />
            </View>
            <View>
              <Text style={styles.cardOverline}>CASHIER REGISTER</Text>
              <Text style={styles.cardMainTitle}>Cash in Drawer</Text>
            </View>
          </View>

          {/* Session Status Pill */}
          <View
            style={[
              styles.statusPill,
              hasActiveSession ? styles.statusPillActive : styles.statusPillPending,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                hasActiveSession ? styles.statusDotActive : styles.statusDotPending,
              ]}
            />
            <Text
              style={[
                styles.statusPillText,
                hasActiveSession ? styles.statusPillTextActive : styles.statusPillTextPending,
              ]}
              numberOfLines={1}
            >
              {hasActiveSession
                ? cashierName
                  ? `${cashierName}`
                  : 'Active Session'
                : 'Float: Rs 0'}
            </Text>
          </View>
        </View>

        {/* Primary Cash Balance Display */}
        <View style={styles.balanceSection}>
          <Text style={styles.balanceAmount}>{formatCurrency(cashInDrawer)}</Text>
          <Text style={styles.balanceSubtext}>
            Net physical cash in cashier till right now
          </Text>
        </View>

        {/* 3-Step Movement Breakdown (Float + Sales - Expenses) */}
        <View style={styles.flowRow}>
          {/* 1. Morning Opening Float */}
          <View style={[styles.flowTile, styles.flowTileOpening]}>
            <View style={styles.flowTileTop}>
              <Ionicons name="sunny-outline" size={13} color="#D97706" />
              <Text style={styles.flowTileLabel}>Morning Float</Text>
            </View>
            <Text style={[styles.flowTileValue, { color: '#B45309' }]}>
              +{formatCurrency(openingFloat).replace('LKR ', '')}
            </Text>
          </View>

          {/* 2. Today Cash Sales In */}
          <View style={[styles.flowTile, styles.flowTileSales]}>
            <View style={styles.flowTileTop}>
              <Ionicons name="arrow-down-circle-outline" size={13} color="#059669" />
              <Text style={styles.flowTileLabel}>Cash In (Sales)</Text>
            </View>
            <Text style={[styles.flowTileValue, { color: '#047857' }]}>
              +{formatCurrency(cashSales).replace('LKR ', '')}
            </Text>
          </View>

          {/* 3. Today Cash Expenses Out */}
          <View style={[styles.flowTile, styles.flowTileExpenses]}>
            <View style={styles.flowTileTop}>
              <Ionicons name="arrow-up-circle-outline" size={13} color="#DC2626" />
              <Text style={styles.flowTileLabel}>Cash Out (Exp)</Text>
            </View>
            <Text style={[styles.flowTileValue, { color: '#B91C1C' }]}>
              -{formatCurrency(cashExpenses).replace('LKR ', '')}
            </Text>
          </View>
        </View>

        {/* Bottom Micro Formula Bar & Info */}
        <View style={styles.formulaBar}>
          <View style={styles.formulaEquationRow}>
            <Ionicons name="calculator-outline" size={13} color="#64748B" />
            <Text style={styles.formulaEquationText}>
              Float ({Math.round(openingFloat).toLocaleString()}) + Sales ({Math.round(cashSales).toLocaleString()}) − Expenses ({Math.round(cashExpenses).toLocaleString()})
            </Text>
          </View>
          <View style={styles.tapDetailsHint}>
            <Text style={styles.tapDetailsText}>Details</Text>
            <Ionicons name="chevron-forward" size={12} color="#059669" />
          </View>
        </View>
      </TouchableOpacity>

      {/* Modal with Full Cashier Session Breakdown */}
      <Modal
        visible={detailModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleGroup}>
                <View style={styles.modalIconWrap}>
                  <Ionicons name="file-tray-full-outline" size={20} color="#059669" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Cashier Drawer Audit</Text>
                  <Text style={styles.modalSubtitle}>Live register reconciliation</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setDetailModalVisible(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Cash in Drawer Big Banner */}
            <View style={styles.modalBalanceBanner}>
              <Text style={styles.modalBalanceLabel}>CURRENT EXPECTED CASH</Text>
              <Text style={styles.modalBalanceValue}>{formatCurrency(cashInDrawer)}</Text>
              <Text style={styles.modalBalanceHint}>
                Physical cash that should be in the register now
              </Text>
            </View>

            {/* Detailed Row List */}
            <View style={styles.breakdownList}>
              {/* Row 1: Opening Morning Float */}
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#F59E0B' }]} />
                  <View>
                    <Text style={styles.breakdownRowTitle}>Morning Opening Float</Text>
                    <Text style={styles.breakdownRowSub}>
                      {hasActiveSession
                        ? 'Set from Supabase cash_sessions'
                        : 'No active session opened (Rs. 0)'}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.breakdownRowAmount, { color: '#B45309' }]}>
                  +{formatCurrency(openingFloat)}
                </Text>
              </View>

              {/* Row 2: Cash Sales In */}
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#10B981' }]} />
                  <View>
                    <Text style={styles.breakdownRowTitle}>Today Cash Sales</Text>
                    <Text style={styles.breakdownRowSub}>Received from paid cash orders</Text>
                  </View>
                </View>
                <Text style={[styles.breakdownRowAmount, { color: '#047857' }]}>
                  +{formatCurrency(cashSales)}
                </Text>
              </View>

              {/* Row 3: Cash Expenses Out */}
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownLeft}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#EF4444' }]} />
                  <View>
                    <Text style={styles.breakdownRowTitle}>Today Cash Expenses</Text>
                    <Text style={styles.breakdownRowSub}>Petty cash paid for store expenses</Text>
                  </View>
                </View>
                <Text style={[styles.breakdownRowAmount, { color: '#DC2626' }]}>
                  -{formatCurrency(cashExpenses)}
                </Text>
              </View>
            </View>

            {/* Session Metadata Info */}
            <View style={styles.metaBox}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>CASHIER</Text>
                <Text style={styles.metaValue}>{cashierName || 'Not assigned'}</Text>
              </View>
              {terminalId ? (
                <View style={styles.metaItem}>
                  <Text style={styles.metaLabel}>TERMINAL</Text>
                  <Text style={styles.metaValue}>{terminalId}</Text>
                </View>
              ) : null}
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>DATE</Text>
                <Text style={styles.metaValue}>
                  {cashSession?.sessionDate || new Date().toISOString().slice(0, 10)}
                </Text>
              </View>
            </View>

            {notes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesTitle}>Session Notes:</Text>
                <Text style={styles.notesText}>{notes}</Text>
              </View>
            ) : null}

            {/* Close Button */}
            <TouchableOpacity
              style={styles.modalDoneBtn}
              onPress={() => setDetailModalVisible(false)}
            >
              <Text style={styles.modalDoneBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
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
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  cardOverline: {
    fontSize: 10.5,
    fontFamily: fonts.bold,
    color: '#059669',
    letterSpacing: 0.6,
  },
  cardMainTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
    maxWidth: 130,
  },
  statusPillActive: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statusPillPending: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusDotActive: {
    backgroundColor: '#10B981',
  },
  statusDotPending: {
    backgroundColor: '#94A3B8',
  },
  statusPillText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
  },
  statusPillTextActive: {
    color: '#065F46',
  },
  statusPillTextPending: {
    color: '#64748B',
  },
  balanceSection: {
    marginBottom: 14,
  },
  balanceAmount: {
    fontSize: 27,
    fontFamily: fonts.bold,
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  balanceSubtext: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#64748B',
    marginTop: 2,
  },
  flowRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  flowTile: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
  },
  flowTileOpening: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  flowTileSales: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  flowTileExpenses: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  flowTileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  flowTileLabel: {
    fontSize: 10,
    fontFamily: fonts.medium,
    color: '#475569',
  },
  flowTileValue: {
    fontSize: 13.5,
    fontFamily: fonts.bold,
    letterSpacing: -0.2,
  },
  formulaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  formulaEquationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    paddingRight: 6,
  },
  formulaEquationText: {
    fontSize: 10.5,
    fontFamily: fonts.regular,
    color: '#64748B',
  },
  tapDetailsHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tapDetailsText: {
    fontSize: 11,
    fontFamily: fonts.semiBold,
    color: '#059669',
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: fonts.bold,
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#64748B',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBalanceBanner: {
    backgroundColor: '#064E3B',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginBottom: 18,
  },
  modalBalanceLabel: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#6EE7B7',
    letterSpacing: 0.8,
  },
  modalBalanceValue: {
    fontSize: 28,
    fontFamily: fonts.bold,
    color: '#FFFFFF',
    marginVertical: 4,
  },
  modalBalanceHint: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#D1FAE5',
    textAlign: 'center',
  },
  breakdownList: {
    gap: 12,
    marginBottom: 18,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  breakdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  breakdownRowTitle: {
    fontSize: 13.5,
    fontFamily: fonts.semiBold,
    color: '#1E293B',
  },
  breakdownRowSub: {
    fontSize: 11,
    fontFamily: fonts.regular,
    color: '#64748B',
    marginTop: 1,
  },
  breakdownRowAmount: {
    fontSize: 14,
    fontFamily: fonts.bold,
  },
  metaBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  metaItem: {
    flex: 1,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 9.5,
    fontFamily: fonts.bold,
    color: '#94A3B8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12.5,
    fontFamily: fonts.semiBold,
    color: '#1E293B',
  },
  notesBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 16,
  },
  notesTitle: {
    fontSize: 11,
    fontFamily: fonts.bold,
    color: '#92400E',
    marginBottom: 2,
  },
  notesText: {
    fontSize: 12,
    fontFamily: fonts.regular,
    color: '#78350F',
  },
  modalDoneBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: fonts.bold,
  },
});
