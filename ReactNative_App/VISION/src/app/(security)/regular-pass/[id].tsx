/**
 * A regular (multi-day) pass, as security sees it — straight after issuing it at the gate,
 * or when opening a regular visitor from the on-campus list.
 *
 * Like the walk-in pass screen, the QR token is fetched rather than passed through route
 * params, so a credential never sits in serialised navigation state.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { RegularPassView } from '@/components/gate/RegularPassView';
import { useAuth } from '@/context/AuthContext';
import { gateAPI, RecurringPass } from '@/services/gate.api';

export default function RegularPassScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getIdToken } = useAuth();

  const [pass, setPass] = useState<RecurringPass | null>(null);
  const [passToken, setPassToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    setLoading(true);
    try {
      const result = await gateAPI.getRecurring(await getIdToken(), id);
      if (!result.success || !result.data) {
        setError(result.message || result.error || 'Could not load this pass');
        return;
      }
      setPass(result.data.pass);
      setPassToken(result.data.passToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this pass');
    } finally {
      setLoading(false);
    }
  }, [id, getIdToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Colors.navy900} />
      </View>
    );
  }

  if (error || !pass) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error || 'This pass could not be loaded'}</Text>
        <NeuButton title="Try again" variant="primary" size="md" onPress={load} />
        <Pressable onPress={() => router.replace('/(security)/home')} style={styles.link}>
          <Text style={styles.linkText}>Back to the gate</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>
          Show this to the holder, or let them photograph it. The same QR works every day on the
          pass — scan it at the gate to check in and again to sign out.
        </Text>

        <RegularPassView
          pass={pass}
          passToken={passToken}
          onConfirmLink={async () => {
            const result = await gateAPI.linkRecurring(await getIdToken(), pass.id);
            if (!result.success) throw new Error(result.message || result.error || 'Could not send the pass');
            const label = result.data?.linkedAccountLabel ?? null;
            setPass({ ...pass, linkedAccountLabel: label, suggestedAccountLabel: null });
            return label;
          }}
        />

        <NeuButton
          title="Register another visitor"
          variant="accent"
          size="lg"
          fullWidth
          onPress={() => router.replace('/(security)/register')}
        />
        <Pressable onPress={() => router.replace('/(security)/home')} style={styles.link}>
          <Text style={styles.linkText}>Back to the gate</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  centered: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  scroll: { padding: Spacing.lg, paddingTop: Spacing['3xl'], paddingBottom: Spacing['2xl'], gap: Spacing.md },
  subtitle: { ...Typography.bodySm, color: Colors.gray600 },
  errorText: { ...Typography.bodySm, color: Colors.red600, textAlign: 'center' },
  link: { alignItems: 'center', paddingVertical: Spacing.md },
  linkText: { ...Typography.bodySm, color: Colors.gray600 },
});
