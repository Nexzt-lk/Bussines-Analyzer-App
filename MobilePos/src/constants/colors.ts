/**
 * Application Color System
 * Single source of truth for all colors used across MobilePOS.
 * Theme: Emerald & Forest Green
 */

export const colors = {
  // Brand Theme Colors (Green)
  primary: '#059669',          // Emerald 600 - Primary brand action
  primaryDark: '#047857',      // Emerald 700 - Active / dark green
  primaryLight: '#10B981',     // Emerald 500 - Bright emerald accent
  primarySurface: '#ECFDF5',   // Mint surface
  primaryBorder: '#A7F3D0',    // Mint border
  primaryText: '#065F46',      // Deep forest green for text on mint

  // Chart Bar Gradient (Emerald gradient matching user reference image)
  chartGradientStart: '#32C468', // Vibrant emerald green (top)
  chartGradientEnd: '#178440',   // Deep forest green (bottom)

  // Hero Card Palette (Deep Luxurious Emerald Green)
  heroCard: '#065F46',         // Forest green hero card
  heroCardDark: '#064E3B',     // Deep emerald
  heroCardLight: '#059669',    // Bright emerald
  heroPill: 'rgba(255, 255, 255, 0.20)',
  heroPillText: '#FFFFFF',

  // Canvas & Surfaces (Crisp light mint & white)
  background: '#F6FAF7',       // Very soft light mint canvas
  surface: '#FFFFFF',          // Pure white card
  surfaceSand: '#E8F5EE',      // Soft mint secondary surface
  surfaceSandDark: '#D1E7DD',
  border: '#E1EFE6',           // Crisp mint border
  borderSubtle: '#EDF7F0',
  borderFocus: '#059669',

  // Profile Avatar & Badges
  avatarBg: '#DCFCE7',         // Light mint avatar background
  avatarText: '#065F46',       // Deep forest green avatar letter

  // Alert Card (Reorder Warning)
  alertBg: '#FEF9C3',          // Soft warm amber warning
  alertBorder: '#FEF08A',
  alertText: '#713F12',
  alertSubtext: '#854D0E',

  // Jump-to Icon Circles (Green/Mint tints)
  jumpSalesBg: '#DCFCE7',      // Light mint circle
  jumpStockBg: '#D1FAE5',      // Mint emerald circle
  jumpReportsBg: '#ECFDF5',    // Soft mint circle
  jumpExpensesBg: '#FEF3C7',   // Soft amber circle for expenses

  // Bottom Navigation Tabs
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E5EFE8',
  tabActivePill: '#DCFCE7',     // Mint capsule highlight for active tab
  tabActiveText: '#059669',     // Vibrant emerald green active text
  tabInactiveText: '#64748B',   // Slate grey inactive text

  // Typography
  textPrimary: '#0F172A',      // High-contrast slate charcoal
  textSecondary: '#475569',    // Slate 600
  textMuted: '#94A3B8',        // Slate 400
  textLight: '#FFFFFF',        // White text

  // Status & Feedback
  success: '#16A34A',
  successBg: '#DCFCE7',
  successText: '#15803D',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  dangerBorder: '#FECACA',
  dangerText: '#B91C1C',
  warning: '#D97706',
  warningBg: '#FEF3C7',
  warningText: '#B45309',
} as const;

export type ColorName = keyof typeof colors;
