import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import '../global.css';

import { AuthProvider, useAuth } from '@/features/auth/AuthContext';
import { BranchProvider, useBranch } from '@/features/branches/BranchContext';
import { NotificationProvider } from '@/features/notifications/NotificationContext';
import { NotificationBanner } from '@/features/notifications/NotificationBanner';
import { NotificationModal } from '@/features/notifications/NotificationModal';
import { colors } from '@/constants/colors';

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
  const { currentUser, loading: authLoading } = useAuth();
  const { currentBranch, loading: branchLoading } = useBranch();
  const segments = useSegments();
  const router = useRouter();

  const loading = authLoading || branchLoading;

  useEffect(() => {
    if (loading) return;

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
  }, [currentUser, currentBranch, loading, segments, router]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontWeight: '700', color: colors.textPrimary, fontSize: 18 },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="select-branch" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="inventory" options={{ title: 'Inventory' }} />
      <Stack.Screen name="sales" options={{ title: 'Sales', headerShown: false }} />
    </Stack>
  );
}