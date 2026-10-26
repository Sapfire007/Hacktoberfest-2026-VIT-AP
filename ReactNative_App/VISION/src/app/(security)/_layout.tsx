import React from 'react';
import { Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';
import { RoleGuard } from '@/components/RoleGuard';
import { GateDraftProvider } from '@/context/GateDraftContext';

/**
 * Security gate app shell.
 *
 * The walk-in registration flow spans several screens — the form, the plate scanner, the
 * issued pass — and the officer moves between them mid-registration. `GateDraftProvider`
 * is mounted here, above the Stack, so the half-filled form survives that navigation;
 * inside a screen it would be destroyed the moment the officer left to use the camera.
 */
export default function SecurityLayout() {
  return (
    <RoleGuard allow={['security']}>
      <GateDraftProvider>
        <View style={styles.container}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="home" />
            <Stack.Screen name="register" />
            {/* Presented as a modal: the scanner is an excursion from the form, not a
                step forward in it, and a modal makes the "cancel and go back to what I
                was typing" gesture the obvious one. */}
            <Stack.Screen name="plate-scan" options={{ presentation: 'modal' }} />
            <Stack.Screen name="scan-exit" options={{ presentation: 'modal' }} />
            <Stack.Screen name="permit-checkin" />
            <Stack.Screen name="regular-pass/[id]" />
            <Stack.Screen name="pass/[id]" />
            <Stack.Screen name="on-campus" />
          </Stack>
        </View>
      </GateDraftProvider>
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
});
