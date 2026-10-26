/**
 * RoleGuard — route-group access control
 *
 * Wraps a route group's layout and redirects anyone whose role does not belong there.
 *
 * This is a **usability** control, not a security boundary. It stops someone landing on a
 * screen that will only show them errors, and it keeps deep links honest. The real
 * enforcement is server-side: every endpoint checks the role claim in the verified token
 * (Node_Backend/src/middleware/rbac.middleware.ts), so bypassing this guard gains nothing
 * but an empty screen.
 *
 * Both statements matter. A client-side check that is mistaken for the security boundary
 * is exactly how the previous version ended up with no server-side checks at all.
 */

import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { useAuth, UserRoleType, homeRouteForRole } from '@/context/AuthContext';

interface RoleGuardProps {
  allow: UserRoleType[];
  children: React.ReactNode;
}

export function RoleGuard({ allow, children }: RoleGuardProps) {
  const router = useRouter();
  const { role, isAuthenticated, isLoading, mustChangePassword } = useAuth();

  const permitted = Boolean(role && allow.includes(role));

  useEffect(() => {
    // Wait for the session to resolve. Redirecting during the initial load would bounce
    // a legitimately signed-in user out to onboarding on every cold start.
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/(onboarding)/splash');
      return;
    }

    if (!permitted) {
      // Sent to their own home rather than to an error screen: they are signed in and
      // entitled to be somewhere, just not here.
      router.replace(homeRouteForRole(role) as never);
      return;
    }

    if (mustChangePassword) {
      // A password someone else chose - a new account, an admin reset - is replaced before
      // the account is used. This is the screen the console's "must change at first
      // sign-in" refers to.
      router.replace('/(onboarding)/change-password' as never);
    }
  }, [isLoading, isAuthenticated, permitted, mustChangePassword, role, router]);

  if (isLoading || !isAuthenticated || !permitted || mustChangePassword) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Colors.navy900} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.neuBackground,
  },
});
