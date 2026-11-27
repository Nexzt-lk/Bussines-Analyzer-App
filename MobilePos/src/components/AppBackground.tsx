import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface AppBackgroundProps {
  children?: React.ReactNode;
}

export default function AppBackground({ children }: AppBackgroundProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* 1. Subtle Base Ambient Gradient Canvas */}
      <LinearGradient
        colors={['#ECFDF5', '#F8FAFC', '#F8FAFC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.7 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* 2. Top-Right Soft Emerald Ambient Glowing Orb */}
      <View style={styles.topRightGlow} pointerEvents="none" />

      {/* 3. Top-Left Soft Sky Ambient Glowing Orb */}
      <View style={styles.topLeftGlow} pointerEvents="none" />

      {/* 4. Subtle Ambient Accent Bottom Glow */}
      <View style={styles.bottomGlow} pointerEvents="none" />

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  topRightGlow: {
    position: 'absolute',
    top: -80,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: '#D1FAE5',
    opacity: 0.55,
  },
  topLeftGlow: {
    position: 'absolute',
    top: 50,
    left: -80,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: '#E0F2FE',
    opacity: 0.4,
  },
  bottomGlow: {
    position: 'absolute',
    bottom: -90,
    right: -50,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: '#DCFCE7',
    opacity: 0.35,
  },
});
