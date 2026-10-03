import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Animated,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Rect } from 'react-native-svg';
import { useAuth } from './AuthContext';
import { useBranch } from '../branches/BranchContext';

// Color Palette defined in Design System
const BRAND = {
  primary: '#16A34A',
  primaryDark: '#15803D',
  lightGreen: '#DCFCE7',
  background: '#F8FAF9',
  white: '#FFFFFF',
  mainText: '#17201A',
  secondaryText: '#6B7280',
  border: '#E5E7EB',
  inputBorderFocused: '#16A34A',
  iconMuted: '#9CA3AF',
  dangerBg: '#FEE2E2',
  dangerBorder: '#FECACA',
  dangerText: '#EF4444',
};

// Custom SVG Cake Logo matching the reference design
function CakeLogoIcon({ size = 30, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Candle flame */}
      <Path
        d="M12 2.2C12 2.2 12.8 3.2 12.8 3.9C12.8 4.3 12.4 4.7 12 4.7C11.6 4.7 11.2 4.3 11.2 3.9C11.2 3.2 12 2.2 12 2.2Z"
        fill={color}
      />
      {/* Candle stick */}
      <Path
        d="M12 4.7V6.8"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* Top Tier Body */}
      <Rect
        x="6.5"
        y="6.8"
        width="11"
        height="5.2"
        rx="1.5"
        stroke={color}
        strokeWidth="1.8"
      />
      {/* Top tier icing drip line */}
      <Path
        d="M6.5 9.4C7.3 10.2 8.3 10.2 9.1 9.4C9.9 10.2 10.9 10.2 11.7 9.4C12.5 10.2 13.5 10.2 14.3 9.4C15.1 10.2 16.1 10.2 16.9 9.4"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Bottom Tier Body */}
      <Rect
        x="4"
        y="12"
        width="16"
        height="6.2"
        rx="2"
        stroke={color}
        strokeWidth="1.8"
      />
      {/* Bottom tier icing drip line */}
      <Path
        d="M4 15C5 16 6.3 16 7.3 15C8.3 16 9.6 16 10.6 15C11.6 16 12.9 16 13.9 15C14.9 16 16.2 16 17.2 15C18.2 16 19.3 15.6 20 15"
        stroke={color}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Bottom plate / stand */}
      <Path
        d="M2.5 20.8H21.5"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const { clearBranch } = useBranch();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [identifierFocused, setIdentifierFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // References
  const passwordInputRef = useRef<TextInput>(null);

  // Shake animation for error validation feedback
  const [shakeAnim] = useState(() => new Animated.Value(0));

  const triggerShake = useCallback(() => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 3, duration: 35, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 35, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleSubmit = async () => {
    const trimmed = identifier.trim();
    if (!trimmed || !password || loading) {
      if (!trimmed) {
        setError('Please enter your email or username.');
        triggerShake();
        return;
      }
      if (!password) {
        setError('Please enter your password.');
        triggerShake();
        return;
      }
      return;
    }

    setLoading(true);
    setError('');

    try {
      const success = await login(trimmed, password);
      if (success) {
        await clearBranch();
        router.replace('/select-branch');
        return;
      } else {
        setError('Invalid credentials. Please verify and try again.');
        triggerShake();
      }
    } catch {
      setError('Could not connect to server. Check your network.');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = identifier.trim().length > 0 && password.length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* Subtle organic green background shapes matching reference */}
      <View style={styles.bgBlobTopRight} pointerEvents="none" />
      <View style={styles.bgBlobBottomLeft} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.contentCard}>
            {/* Top Brand Cake Logo in Squircle Card */}
            <View style={styles.logoSquircle}>
              <CakeLogoIcon size={32} color="#FFFFFF" />
            </View>

            {/* Overline Brand Tag */}
            <Text style={styles.brandOverline}>SWEET DELIGHT</Text>

            {/* Main Title Heading */}
            <Text style={styles.titleHeading}>
              {'Welcome \nBusiness Analyzer'}
            </Text>

            {/* Subtitle */}
            <Text style={styles.subtitle}>
              Manage your business at a glance
            </Text>

            {/* Error Message with Animated Shake */}
            {error ? (
              <Animated.View
                style={[
                  styles.errorBox,
                  { transform: [{ translateX: shakeAnim }] },
                ]}
              >
                <Ionicons name="alert-circle-outline" size={18} color={BRAND.dangerText} />
                <Text style={styles.errorText}>{error}</Text>
              </Animated.View>
            ) : null}

            {/* Form Section */}
            <View style={styles.form}>
              {/* Field 1: Email or username */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email or username</Text>
                <View
                  style={[
                    styles.inputContainer,
                    identifierFocused && styles.inputContainerFocused,
                  ]}
                >
                  <Ionicons
                    name="mail-outline"
                    size={19}
                    color={identifierFocused ? BRAND.primary : BRAND.iconMuted}
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    style={styles.textInput}
                    placeholder="owner@sweetdelight.lk"
                    placeholderTextColor={BRAND.iconMuted}
                    value={identifier}
                    onChangeText={(val) => {
                      setIdentifier(val);
                      if (error) setError('');
                    }}
                    onFocus={() => setIdentifierFocused(true)}
                    onBlur={() => setIdentifierFocused(false)}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInputRef.current?.focus()}
                    editable={!loading}
                  />
                  {identifier.length > 0 && !loading && (
                    <TouchableOpacity
                      onPress={() => {
                        setIdentifier('');
                        if (error) setError('');
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.clearBtn}
                    >
                      <Ionicons name="close" size={16} color={BRAND.iconMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Field 2: Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <View
                  style={[
                    styles.inputContainer,
                    passwordFocused && styles.inputContainerFocused,
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={19}
                    color={passwordFocused ? BRAND.primary : BRAND.iconMuted}
                    style={styles.inputLeftIcon}
                  />
                  <TextInput
                    ref={passwordInputRef}
                    style={styles.textInput}
                    placeholder="•••••••••"
                    placeholderTextColor={BRAND.iconMuted}
                    value={password}
                    onChangeText={(val) => {
                      setPassword(val);
                      if (error) setError('');
                    }}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    returnKeyType="go"
                    onSubmitEditing={handleSubmit}
                    editable={!loading}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword((prev) => !prev)}
                    style={styles.eyeBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={BRAND.iconMuted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign In Button */}
              <TouchableOpacity
                style={[
                  styles.signInButton,
                  (!isFormValid || loading) && styles.signInButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={!isFormValid || loading}
                activeOpacity={0.85}
              >
                {loading ? (
                  <View style={styles.btnContentRow}>
                    <ActivityIndicator color={BRAND.white} size="small" />
                    <Text style={styles.signInButtonText}>Signing in...</Text>
                  </View>
                ) : (
                  <View style={styles.btnContentRow}>
                    <Text style={styles.signInButtonText}>Sign In</Text>
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={BRAND.white}
                      style={styles.btnArrowIcon}
                    />
                  </View>
                )}
              </TouchableOpacity>

              {/* Secure Owner Access Text */}
              <View style={styles.secureAccessRow}>
                <Ionicons name="lock-closed-outline" size={13} color={BRAND.iconMuted} />
                <Text style={styles.secureAccessText}>Secure owner access</Text>
              </View>
            </View>
          </View>

          {/* Bottom Footer: "Powered by Nexzt Solution" */}
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>powered by nexzt solution</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: BRAND.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'android' ? 24 : 16,
    paddingBottom: 20,
  },

  // Subtle background decorative circles
  bgBlobTopRight: {
    position: 'absolute',
    top: -85,
    right: -75,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: BRAND.lightGreen,
    opacity: 0.55,
  },
  bgBlobBottomLeft: {
    position: 'absolute',
    bottom: -65,
    left: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: BRAND.lightGreen,
    opacity: 0.45,
  },

  contentCard: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    paddingTop: 24,
  },

  // Cake Logo Squircle
  logoSquircle: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: BRAND.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },

  // Typography
  brandOverline: {
    fontSize: 12,
    fontWeight: '800',
    color: BRAND.primary,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  titleHeading: {
    fontSize: 32,
    fontWeight: '800',
    color: BRAND.mainText,
    letterSpacing: -0.6,
    lineHeight: 38,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: BRAND.secondaryText,
    fontWeight: '400',
    marginBottom: 32,
  },

  // Error Banner
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.dangerBg,
    borderWidth: 1,
    borderColor: BRAND.dangerBorder,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 20,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: BRAND.dangerText,
    fontSize: 13,
    fontWeight: '600',
  },

  // Form
  form: {
    gap: 20,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: BRAND.mainText,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND.white,
    borderWidth: 1.2,
    borderColor: BRAND.border,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  inputContainerFocused: {
    borderColor: BRAND.inputBorderFocused,
    shadowColor: BRAND.primary,
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  inputLeftIcon: {
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: BRAND.mainText,
    fontWeight: '500',
  },
  clearBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Primary Sign In Button
  signInButton: {
    backgroundColor: BRAND.primary,
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: BRAND.primary,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  signInButtonDisabled: {
    backgroundColor: '#16A34A',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInButtonText: {
    color: BRAND.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  btnArrowIcon: {
    marginLeft: 6,
    marginTop: 1,
  },

  // Secure Access Row
  secureAccessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
  },
  secureAccessText: {
    fontSize: 12,
    color: BRAND.iconMuted,
    fontWeight: '500',
  },

  // Footer Branding
  footerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 32,
  },
  footerText: {
    fontSize: 12,
    fontWeight: '500',
    color: BRAND.iconMuted,
    letterSpacing: 0.4,
    textTransform: 'lowercase',
  },
});