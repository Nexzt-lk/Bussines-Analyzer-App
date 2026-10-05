import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';
import { InvalidDateRangeError, MissingBranchError } from '@/lib/reporting';

/** User-facing text for a failed data load. */
export const describeLoadError = (err: unknown): string => {
  if (err instanceof MissingBranchError) return 'Select a branch to see its data.';
  if (err instanceof InvalidDateRangeError) return err.message;
  return "Couldn't load the latest data. Check your connection and try again.";
};

interface LoadErrorBannerProps {
  message: string | null;
  onRetry?: () => void;
}

/** Shown instead of silently displaying Rs 0 when a load fails. */
export default function LoadErrorBanner({ message, onRetry }: LoadErrorBannerProps) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={18} color={colors.dangerText} />
      <Text style={styles.text}>{message}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.retry}>Retry</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.dangerText,
  },
  retry: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.dangerText,
  },
});
