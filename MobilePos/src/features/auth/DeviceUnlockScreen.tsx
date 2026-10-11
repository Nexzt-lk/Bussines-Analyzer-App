import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '@/constants/colors';
import { fonts } from '@/constants/fonts';

interface DeviceUnlockScreenProps {
  onUnlocked: () => void;
  onUsePassword: () => Promise<void>;
}

export default function DeviceUnlockScreen({
  onUnlocked,
  onUsePassword,
}: DeviceUnlockScreenProps) {
  const [authenticating, setAuthenticating] = useState(false);
  const authenticatingRef = useRef(false);
  const [hasBiometrics, setHasBiometrics] = useState(true);

  // Check hardware & enrolled status to show appropriate icon and copy
  useEffect(() => {
    async function checkSecurityCapabilities() {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        setHasBiometrics(hasHardware && isEnrolled);
      } catch {
        setHasBiometrics(false);
      }
    }
    void checkSecurityCapabilities();
  }, []);

  const unlock = useCallback(async () => {
    if (authenticatingRef.current) return;
    authenticatingRef.current = true;
    setAuthenticating(true);

    try {
      const enrolledLevel = await LocalAuthentication.getEnrolledLevelAsync();

      // If the device has no screen lock at all (no fingerprint, no pattern, no PIN)
      if (enrolledLevel === LocalAuthentication.SecurityLevel.NONE) {
        Alert.alert(
          'Phone Lock Not Found',
          'Your phone does not have a fingerprint, pattern, or PIN lock set up. Please set a screen lock in your phone settings, or sign in with your password.',
          [
            { text: 'Sign In With Password', onPress: () => void onUsePassword() },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      const biometricsAvailable = hasHardware && isEnrolled;
      setHasBiometrics(biometricsAvailable);

      // Prompt Fingerprint or Phone PIN / Pattern
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock BizzNet POS',
        promptSubtitle: biometricsAvailable
          ? 'Use your fingerprint or phone screen lock'
          : 'Enter your phone PIN or pattern',
        promptDescription: 'Verify your identity to open BizzNet',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false, // Crucial: allows Phone PIN / Pattern fallback
        biometricsSecurityLevel: 'weak',
      });

      if (result.success) {
        onUnlocked();
      }
    } catch (e) {
      console.warn('Authentication error:', e);
      Alert.alert(
        'Could not authenticate',
        'Please try again with fingerprint, PIN, pattern, or sign in with your password.'
      );
    } finally {
      authenticatingRef.current = false;
      setAuthenticating(false);
    }
  }, [onUnlocked, onUsePassword]);

  // Prompt automatically shortly after screen renders
  useEffect(() => {
    const timer = setTimeout(() => {
      void unlock();
    }, 350);
    return () => clearTimeout(timer);
  }, [unlock]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="dark" />
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons
            name={hasBiometrics ? 'finger-print-outline' : 'keypad-outline'}
            size={52}
            color={colors.primary}
          />
        </View>

        <Text style={styles.title}>Unlock BizzNet</Text>
        <Text style={styles.subtitle}>
          {hasBiometrics
            ? 'Use your fingerprint, phone PIN, or pattern to continue.'
            : 'Enter your phone PIN or pattern to continue.'}
        </Text>

        <TouchableOpacity
          style={styles.unlockButton}
          onPress={() => void unlock()}
          disabled={authenticating}
          activeOpacity={0.85}
        >
          {authenticating ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name={hasBiometrics ? 'finger-print' : 'lock-open-outline'}
                size={22}
                color="#FFFFFF"
              />
              <Text style={styles.unlockButtonText}>
                {hasBiometrics ? 'Unlock with Fingerprint / PIN' : 'Unlock with PIN / Pattern'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.passwordButton}
          onPress={() => void onUsePassword()}
          disabled={authenticating}
          activeOpacity={0.7}
        >
          <Text style={styles.passwordButtonText}>Sign in with password</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 25,
    fontFamily: fonts.bold,
    color: '#17201A',
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.regular,
    color: '#64748B',
    textAlign: 'center',
  },
  unlockButton: {
    marginTop: 32,
    minHeight: 52,
    width: '100%',
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  unlockButtonText: {
    color: '#FFFFFF',
    fontFamily: fonts.semiBold,
    fontSize: 16,
  },
  passwordButton: {
    marginTop: 18,
    padding: 10,
  },
  passwordButtonText: {
    color: colors.primary,
    fontFamily: fonts.semiBold,
    fontSize: 14,
  },
});
