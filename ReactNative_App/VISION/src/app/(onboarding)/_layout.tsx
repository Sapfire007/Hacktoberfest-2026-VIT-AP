import { Stack } from 'expo-router';

export default function OnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="splash" />
      <Stack.Screen name="role-select" />
      <Stack.Screen name="sign-up" />
      <Stack.Screen name="sign-in" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="staff-login" />
      <Stack.Screen name="faculty-login" />
      <Stack.Screen name="change-password" options={{ gestureEnabled: false }} />
      <Stack.Screen name="identity-details" />
      <Stack.Screen name="biometric-capture" />
      <Stack.Screen name="govt-id-upload" />
      <Stack.Screen name="profile-form" />
      <Stack.Screen name="consent" />
      <Stack.Screen name="done" />
    </Stack>
  );
}
