/**
 * Full Permit Screen — Digital QR Access Permit
 * 
 * Displays full screen active permit with validity countdown,
 * cryptographic signature check, and offline badge per PRD.md §7.4 & Design.md §5.2.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { PermitCard } from '@/components/ui/PermitCard';
import { NeuButton } from '@/components/ui/NeuButton';
import { useApp } from '@/context/AppContext';
import { VisitRequest, getVisitRequestById } from '@/services/visitRequest.service';
import { useAuth, homeRouteForRole } from '@/context/AuthContext';

/** "HH:MM:SS" until the permit expires, or "Expired". */
function validityLeft(expiresAt?: Date): string {
  if (!expiresAt) return '—';
  const ms = expiresAt.getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export default function PermitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, role } = useAuth();
  const [request, setRequest] = useState<VisitRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the request data
  useEffect(() => {
    const fetchRequest = async () => {
      if (!id) {
        setError('No permit ID provided');
        setLoading(false);
        return;
      }

      try {
        // `id` is the visit request's id. The API returns it only if it is the caller's own.
        const found = await getVisitRequestById(id);
        if (found) {
          setRequest(found);
        } else {
          setError('Permit not found');
        }
      } catch (err: any) {
        console.error('❌ Error fetching permit:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchRequest();
  }, [id]);

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Digital Gate Permit" showLogo={false} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.navy900} />
          <Text style={styles.loadingText}>Loading permit...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error || !request) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Digital Gate Permit" showLogo={false} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>❌ {error || 'Permit not found'}</Text>
          <NeuButton
            title="Go Back"
            variant="ghost"
            size="md"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  // Signed out by security: a permit admits once, so there is nothing left to show.
  if (request.exitedAt) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Digital Gate Permit" showLogo={false} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>✓ Permit used</Text>
          <Text style={styles.errorHint}>
            This visit was checked in and signed out at the gate. A new visit needs a new request.
          </Text>
          <NeuButton title="Go Back" variant="ghost" size="md" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  // Check if permit is valid (approved status)
  if (request.status !== 'approved' && request.status !== 'permit_active') {
    return (
      <View style={styles.container}>
        <NeuHeader title="Digital Gate Permit" showLogo={false} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>⚠️ Permit Not Active</Text>
          <Text style={styles.errorHint}>
            This request has not been approved yet or has been cancelled.
          </Text>
          <NeuButton
            title="Go Back"
            variant="ghost"
            size="md"
            onPress={() => router.back()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NeuHeader title="Digital Gate Permit" showLogo={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <PermitCard
          permitId={request.permitId || request.id}
          destination={request.destination}
          purpose={request.purpose}
          requesterName={request.visitorName || request.requesterName || user?.name || 'Visitor'}
          date={request.visitDate}
          validityTimeLeft={validityLeft(request.permitExpiresAt?.toDate?.())}
          qrPayload={request.status === 'permit_active' ? (request.permitQRPayload || undefined) : undefined}
          isOfflineAvailable={false}
          status={request.status as 'approved' | 'permit_active'}
          requestId={request.id}
        />

        <View style={styles.secNote}>
          <Text style={styles.secIcon}>🔒</Text>
          <Text style={styles.secText}>
            This permit is signed by the VISION server, so it cannot be altered or forged. Show
            it to the gate officer when you arrive. It stops working at the end of your visit window.
          </Text>
        </View>

        <NeuButton
          title="← Back to Home"
          variant="ghost"
          size="md"
          fullWidth
          onPress={() => router.push(homeRouteForRole(role) as never)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
    paddingBottom: Spacing['4xl'],
  },
  secNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.blue100,
    padding: Spacing.md,
    borderRadius: Spacing.md,
  },
  secIcon: {
    fontSize: 16,
  },
  secText: {
    ...Typography.caption,
    color: Colors.blue500,
    flex: 1,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
  },
  errorText: {
    ...Typography.headlineMd,
    color: Colors.red600,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorHint: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
});
