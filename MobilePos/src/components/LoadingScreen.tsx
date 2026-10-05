import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';

interface LoadingScreenProps {
  message?: string;
}

export default function LoadingScreen({ message = 'Initializing BizzNet...' }: LoadingScreenProps) {
  const pulseAnim = useRef(new Animated.Value(0.92)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    // Subtle breathing pulse animation for the logo
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0.94,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();

    return () => pulseLoop.stop();
  }, [fadeAnim, pulseAnim]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Main Center Content */}
      <Animated.View style={[styles.centerBox, { opacity: fadeAnim }]}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <Image
            source={require('@/assets/images/loading-logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Loading Indicator & Status */}
        <View style={styles.indicatorContainer}>
          <ActivityIndicator size="small" color="#0D7F41" />
          <Text style={styles.messageText}>{message}</Text>
        </View>
      </Animated.View>

      {/* Footer Branding */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>powered by nexzt solution</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 220,
    height: 220,
  },
  indicatorContainer: {
    marginTop: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  messageText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: 0.2,
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    textTransform: 'lowercase',
  },
});
