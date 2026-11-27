import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { BranchProvider, useBranch } from '@/features/branches/BranchContext';
import { NotificationProvider } from '@/features/notifications/NotificationContext';
import { NotificationBanner } from '@/features/notifications/NotificationBanner';
import { NotificationModal } from '@/features/notifications/NotificationModal';
import { colors } from '@/constants/colors';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import DeviceUnlockScreen from '@/features/auth/DeviceUnlockScreen';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BranchProvider>
          <NotificationProvider>
            <RootNavigation />
            <NotificationBanner />
            <NotificationModal />
          </NotificationProvider>
        </BranchProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

// Expo Router's standard auth-guard pattern: watch the current route
// segment and the auth/branch state, redirect as needed. This replaces
// the manual "swap which Stack.Screens exist" approach used in the
// earlier React Navigation version — idiomatic for file-based routing.
function RootNavigation() {
  const [fontsLoaded, fontError] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  const {
    currentUser,
    loading: authLoading,
    requiresDeviceUnlock,
    unlockDevice,
    logout,
  } = useAuth();
  const { currentBranch, loading: branchLoading } = useBranch();
  const segments = useSegments();
  const router = useRouter();

  // Show the branded loading screen briefly on app launch
  const [splashFinished, setSplashFinished] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSplashFinished(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, []);

  // Safety fallback: ensure loading screen never hangs forever (max 2.5s)
  const [forceReady, setForceReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      setForceReady(true);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const fontsReady = fontsLoaded || Boolean(fontError) || forceReady;
  const isAuthReady = !authLoading || forceReady;
  const isBranchReady = !branchLoading || forceReady;

  const loading = (!fontsReady || !splashFinished || !isAuthReady || !isBranchReady) && !forceReady;

  useEffect(() => {
    if (loading || (currentUser && requiresDeviceUnlock)) return;

    const currentRoute = segments[0] as string | undefined;
    const isAuthRoute = currentRoute === 'login';
    const isBranchRoute = currentRoute === 'select-branch';

    if (!currentUser && !isAuthRoute) {
      router.replace('/login');
    } else if (currentUser && !currentBranch && !isBranchRoute) {
      router.replace('/select-branch');
    } else if (currentUser && currentBranch && (isAuthRoute || isBranchRoute)) {
      router.replace('/');
    }
  }, [currentUser, currentBranch, loading, requiresDeviceUnlock, segments, router]);

  if (loading) {
    return <AppLoadingScreen />;
  }

  if (currentUser && requiresDeviceUnlock) {
    return <DeviceUnlockScreen onUnlocked={unlockDevice} onUsePassword={logout} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Poppins_700Bold', color: colors.textPrimary, fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="select-branch" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="supplier-purchases" options={{ headerShown: false }} />
      <Stack.Screen name="expenses" options={{ headerShown: false }} />
      <Stack.Screen name="sales" options={{ title: 'Sales', headerShown: false }} />
    </Stack>
  );
}
