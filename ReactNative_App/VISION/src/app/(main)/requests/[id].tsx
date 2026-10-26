/**
 * Request Detail & Timeline Screen
 * 
 * Fetches and displays visit request details with real-time updates from Firestore
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { TimelineStep } from '@/components/ui/TimelineStep';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import {
  VisitRequest,
  cancelVisitRequest,
  subscribeToVisitRequest,
} from '@/services/visitRequest.service';
import { Image } from 'expo-image';

export default function RequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user, role } = useAuth();
  const [request, setRequest] = useState<VisitRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Real-time subscription to the specific request
  useEffect(() => {
    if (!id) {
      setError('No request ID provided');
      setLoading(false);
      return;
    }

    // Refreshes periodically, so an approval shows up while the screen is open. The
    // server includes the host's photo, so no separate faculty lookup is needed.
    const unsubscribe = subscribeToVisitRequest(id, (found) => {
      if (found) {
        setRequest(found);
        setError(null);
      } else {
        setError('Request not found');
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [id]);

  const handleCancel = async () => {
    if (!request || !user) return;

    Alert.alert(
      'Cancel Request',
      'Are you sure you want to cancel this visit request?',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelVisitRequest(
                request.id,
                user.id,
                user.name || user.email || 'Unknown User'
              );
              Alert.alert('Success', 'Request cancelled successfully');
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to cancel request');
            }
          },
        },
      ]
    );
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Loading..." showLogo={false} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.navy900} />
          <Text style={styles.loadingText}>Loading request details...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error || !request) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Error" showLogo={false} />
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>❌ {error || 'Request not found'}</Text>
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
      <NeuHeader title={`Request #${request.id.slice(0, 8)}`} showLogo={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Main Request Detail Header Card */}
        <View style={[styles.detailCard, neuOutset(6, 12, Colors.neuSurface)]}>
          <View style={styles.topRow}>
            <CategoryBadge category={request.requesterCategory as any} />
            <StatusChip status={request.status as any} />
          </View>

          <Text style={styles.destination}>{request.destination}</Text>
          <Text style={styles.purpose}>{request.purpose}</Text>

          <View style={styles.metaDivider} />

          <View style={styles.metaGrid}>
            <View style={styles.facultyRow}>
              <Text style={styles.metaLabel}>CONCERNED FACULTY</Text>
              <View style={styles.facultyInfo}>
                {request.targetFacultyPhotoURL ? (
                  <Image
                    source={{ uri: request.targetFacultyPhotoURL }}
                    style={styles.facultyPhoto}
                    cachePolicy="memory-disk"
                    contentFit="cover"
                  />
                ) : (
                  <View style={styles.facultyPhotoPlaceholder}>
                    <Text style={styles.facultyInitial}>
                      {request.targetFacultyName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.metaValue}>{request.targetFacultyName}</Text>
              </View>
            </View>
            {request.visitorName && request.visitorName !== request.requesterName && (
              <View>
                <Text style={styles.metaLabel}>VISITOR (NAME ON THE PERMIT)</Text>
                <Text style={styles.metaValue}>
                  {request.visitorName}
                  {request.visitorRelation ? ` · ${request.visitorRelation}` : ''}
                </Text>
              </View>
            )}
            <View>
              <Text style={styles.metaLabel}>DATE & TIME</Text>
              <Text style={styles.metaValue}>{request.visitDate} ({request.timeWindow})</Text>
            </View>
            {request.vehicleNumber && (
              <View>
                <Text style={styles.metaLabel}>ATTACHED VEHICLE</Text>
                <Text style={styles.metaValue}>{request.vehicleNumber}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Vertical Lifecycle Status Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Request Lifecycle Timeline</Text>

          <View style={[styles.timelineCard, neuOutset(4, 8, Colors.neuSurface)]}>
            <TimelineStep
              title="1. Visit Request Submitted"
              timestamp={request.createdAt ? new Date(request.createdAt.toDate()).toLocaleString() : 'Just now'}
              description="Request created and sent to host faculty for review"
              state="completed"
            />

            <TimelineStep
              title="2. Under Faculty Review"
              timestamp="In Progress"
              description={`Routed to ${request.targetFacultyName}`}
              state={
                request.status === 'cancelled' 
                  ? 'completed' 
                  : request.status === 'pending' || request.status === 'under_review' 
                  ? 'active' 
                  : 'completed'
              }
            />

            {request.status === 'cancelled' ? (
              <TimelineStep
                title="3. Request Cancelled"
                timestamp={request.cancelledAt ? new Date(request.cancelledAt.toDate()).toLocaleString() : 'Recently'}
                description={`Cancelled by ${request.cancelledByName || 'Requester'}`}
                state="rejected"
                remarks={`This request was cancelled by ${request.cancelledByName || 'the requester'}.`}
                remarksType="cancelled"
                isLast
              />
            ) : (
              <>
                <TimelineStep
                  title={
                    request.status === 'approved' || request.status === 'permit_active'
                      ? '3. Faculty Approved Request'
                      : request.status === 'rejected'
                      ? '3. Request Declined'
                      : '3. Final Decision'
                  }
                  timestamp={request.status === 'approved' || request.status === 'permit_active' ? 'Approved' : request.updatedAt ? new Date(request.updatedAt.toDate()).toLocaleString() : undefined}
                  description={
                    request.status === 'approved' || request.status === 'permit_active'
                      ? `${request.targetFacultyName} approved your request.`
                      : request.status === 'rejected'
                      ? 'Faculty declined this request.'
                      : 'Awaiting faculty decision'
                  }
                  state={
                    request.status === 'approved' || request.status === 'permit_active'
                      ? 'completed'
                      : request.status === 'rejected'
                      ? 'rejected'
                      : 'pending'
                  }
                  remarks={request.facultyRemarks ?? undefined}
                  remarksType={
                    request.status === 'approved' || request.status === 'permit_active'
                      ? 'approved'
                      : request.status === 'rejected'
                      ? 'rejected'
                      : undefined
                  }
                  isLast={request.status === 'rejected'}
                />
                
                {/* Step 4: Gate Verification - Only show if approved */}
                {(request.status === 'approved' || request.status === 'permit_active') && (
                  <TimelineStep
                    title="4. Gate Verification & QR Activation"
                    timestamp={request.status === 'permit_active' ? 'Active' : 'Pending'}
                    description={
                      request.status === 'permit_active'
                        ? 'Verified at gate. Digital permit QR code is now active.'
                        : 'Visit the university gate for biometric verification to activate your QR code.'
                    }
                    state={request.status === 'permit_active' ? 'completed' : 'active'}
                    isLast
                  />
                )}
              </>
            )}

            {request.status === 'approved' && (
              <TimelineStep
                title="4. At the Gate"
                timestamp={
                  request.exitedAt
                    ? `Left ${new Date(request.exitedAt).toLocaleString()}`
                    : request.checkedInAt
                    ? `Arrived ${new Date(request.checkedInAt).toLocaleString()}`
                    : 'Not yet'
                }
                description={
                  request.exitedAt
                    ? 'Checked in and signed out by security. This permit has been used.'
                    : request.checkedInAt
                    ? 'Checked in by security. Show the same permit when leaving.'
                    : 'Show the permit QR to the gate officer on arrival.'
                }
                state={request.exitedAt ? 'completed' : request.checkedInAt ? 'active' : 'pending'}
                isLast
              />
            )}
          </View>
        </View>

        {/* Action CTAs */}
        <View style={styles.actionsSection}>
          {(request.status === 'approved' || request.status === 'permit_active') && !request.exitedAt && (
            <NeuButton
              title="View Digital QR Permit →"
              variant="accent"
              size="lg"
              fullWidth
              onPress={() =>
                router.push(
                  (role === 'student'
                    ? `/(student)/permit/${request.id}`
                    : `/(main)/permit/${request.id}`) as never
                )
              }
            />
          )}

          {(request.status === 'pending' || request.status === 'submitted' || request.status === 'under_review') && (
            <NeuButton
              title="Cancel Request"
              variant="danger"
              size="md"
              fullWidth
              onPress={handleCancel}
            />
          )}

          <NeuButton
            title="← Back to Requests"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => router.back()}
          />
        </View>
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
  detailCard: {
    padding: Spacing.xl,
    borderRadius: Radius['2xl'],
    gap: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  destination: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
  },
  purpose: {
    ...Typography.bodyMd,
    color: Colors.gray600,
  },
  metaDivider: {
    height: 1,
    backgroundColor: Colors.gray200,
    marginVertical: Spacing.sm,
  },
  metaGrid: {
    gap: Spacing.md,
  },
  facultyRow: {
    gap: Spacing.xs,
  },
  facultyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  facultyPhoto: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  facultyPhotoPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.navy800,
    alignItems: 'center',
    justifyContent: 'center',
  },
  facultyInitial: {
    ...Typography.caption,
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  metaLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    letterSpacing: 0.5,
  },
  metaValue: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.gray900,
  },
  section: {
    gap: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontWeight: '800',
  },
  timelineCard: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
  },
  actionsSection: {
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
  },
  errorText: {
    ...Typography.bodyMd,
    color: Colors.red600,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
});
