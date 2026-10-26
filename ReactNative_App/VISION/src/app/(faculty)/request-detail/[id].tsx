/**
 * Faculty Request Review Detail Screen
 * 
 * Provides faculty with full requester context to approve or reject visit requests
 * per PRD.md §7.3 & Design.md §5.5.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { StatusChip } from '@/components/ui/StatusChip';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import {
  approveVisitRequest,
  rejectVisitRequest,
  getVisitRequestDetail,
  VisitRequest,
} from '@/services/visitRequest.service';

interface RequesterProfile {
  profilePhotoUri?: string | null;
  photoUri?: string | null;
  govtIdType?: string | null;
  identityProof?: {
    idType: string;
    documentName: string;
    verified?: boolean;
  } | null;
}

export default function FacultyRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  
  // Extract employeeId from user (could be user.employeeId or user.username)
  const facultyId = user?.employeeId || user?.username || user?.uid?.replace('faculty_', '');
  
  const [req, setReq] = useState<VisitRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [requesterProfile, setRequesterProfile] = useState<RequesterProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Loaded directly by id, so decided requests (opened from history) work as well as
  // pending ones. The API returns it only if it is addressed to this faculty member, along
  // with a summary of the requester — not their whole profile.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setLoadingProfile(true);
        const detail = await getVisitRequestDetail(id);
        if (cancelled) return;

        if (!detail) {
          setNotFound(true);
          return;
        }
        setReq(detail.request);
        setRequesterProfile(detail.requester);
      } catch (err) {
        console.error('Failed to load request:', err);
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setLoadingProfile(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleApprove = async () => {
    if (!req || !facultyId) return;

    try {
      setProcessing(true);
      await approveVisitRequest(
        req.id,
        facultyId,
        remarks || 'Approved by faculty host.'
      );
      Alert.alert('Success', 'Visit request approved successfully');
      router.push('/(faculty)/inbox');
    } catch (err) {
      console.error('Failed to approve request:', err);
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to approve request. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!remarks.trim() || remarks.trim().length < 5) {
      setError('Rejection reason is required (minimum 5 characters).');
      return;
    }

    if (!req || !facultyId) return;

    try {
      setProcessing(true);
      setError(''); // Clear any previous errors
      await rejectVisitRequest(req.id, facultyId, remarks.trim());
      Alert.alert('Request Rejected', 'The visitor has been notified');
      router.push('/(faculty)/inbox');
    } catch (err) {
      console.error('Failed to reject request:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to reject request. Please try again.';
      Alert.alert('Error', errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  // Get display photo (priority: Firestore profile > request data)
  const displayPhoto = requesterProfile?.profilePhotoUri || requesterProfile?.photoUri || req?.requesterPhotoUri || '';
  
  // Get identity document type
  const getIdentityDocumentDisplay = () => {
    const idType = requesterProfile?.identityProof?.idType || requesterProfile?.govtIdType;
    const docName = requesterProfile?.identityProof?.documentName;

    if (!idType && !docName) return null;

    const typeDisplay = idType ? idType.toUpperCase() : 'Government ID';
    return `${typeDisplay} Document Uploaded`;
  };

  if (notFound) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Review Request" showLogo={false} />
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>
            This request could not be found, or it is not addressed to you.
          </Text>
        </View>
      </View>
    );
  }

  if (loading || !req) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Review Request" showLogo={false} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.navy900} />
          <Text style={styles.loadingText}>Loading request details...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NeuHeader title="Review Request" showLogo={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Requester Identity Card */}
        <View style={[styles.profileCard, neuOutset(6, 12, Colors.neuSurface)]}>
          <View style={styles.profileHeader}>
            {loadingProfile ? (
              <View style={styles.avatarLoading}>
                <ActivityIndicator size="small" color={Colors.navy900} />
              </View>
            ) : (
              <ProfileAvatar
                uri={displayPhoto}
                name={req.requesterName}
                size={64}
                verified
              />
            )}
            <View style={styles.profileMeta}>
              <Text style={styles.name}>{req.requesterName}</Text>
              {req.sponsoredBy && req.visitorName ? (
                // A student asking on a parent's behalf: the parent is who arrives.
                <Text style={styles.sponsoredVisitor}>
                  Visitor: {req.visitorName}
                  {req.visitorRelation ? ` (${req.visitorRelation})` : ''}
                  {req.visitorPhone ? ` · ${req.visitorPhone}` : ''}
                </Text>
              ) : null}
              <CategoryBadge category={req.requesterCategory as any} />
              <StatusChip status={req.status as any} />
            </View>
          </View>

          <View style={styles.divider} />

          {/* Visit Context */}
          <View style={styles.contextGrid}>
            <View>
              <Text style={styles.ctxLabel}>PURPOSE OF VISIT</Text>
              <Text style={styles.ctxValue}>{req.purpose}</Text>
            </View>

            <View>
              <Text style={styles.ctxLabel}>REQUESTED DESTINATION & TIME</Text>
              <Text style={styles.ctxValue}>{req.destination} • {req.visitDate} ({req.timeWindow})</Text>
            </View>

            {req.linkedStudentName && (
              <View style={styles.wardBox}>
                <Text style={styles.wardIcon}>🎓</Text>
                <View>
                  <Text style={styles.wardLabel}>LINKED STUDENT WARD</Text>
                  <Text style={styles.wardName}>{req.linkedStudentName} (Advisee)</Text>
                </View>
              </View>
            )}

            {getIdentityDocumentDisplay() && (
              <View style={styles.idProofBox}>
                <Text style={styles.idIcon}>🪪</Text>
                <Text style={styles.idText}>{getIdentityDocumentDisplay()}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Remarks Input */}
        <View style={styles.remarksSection}>
          <NeuInput
            label="FACULTY REMARKS / DECISION NOTE"
            value={remarks}
            onChangeText={(text) => {
              setRemarks(text);
              if (text) setError('');
            }}
            placeholder="Add optional approval note or mandatory rejection reason..."
            error={error}
            multiline
          />
        </View>

        {/* Decision CTAs */}
        {req.status === 'pending' || req.status === 'under_review' || req.status === 'submitted' ? (
          <View style={styles.ctaRow}>
            <View style={{ flex: 1 }}>
              <NeuButton
                title="✓ Approve Visit"
                variant="success"
                size="lg"
                fullWidth
                onPress={handleApprove}
                disabled={processing}
              />
            </View>
            <View style={{ flex: 1 }}>
              <NeuButton
                title="✕ Reject Visit"
                variant="danger"
                size="lg"
                fullWidth
                onPress={handleReject}
                disabled={processing}
              />
            </View>
          </View>
        ) : (
          <NeuButton
            title="← Back to Inbox"
            variant="ghost"
            size="md"
            fullWidth
            onPress={() => router.push('/(faculty)/inbox')}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sponsoredVisitor: {
    ...Typography.bodySm,
    color: Colors.navy900,
    fontWeight: '700',
  },
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
  profileCard: {
    padding: Spacing.xl,
    borderRadius: Radius['2xl'],
    gap: Spacing.md,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  profileMeta: {
    flex: 1,
    gap: 4,
    alignItems: 'flex-start',
  },
  avatarLoading: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: Colors.gray200,
  },
  contextGrid: {
    gap: Spacing.md,
  },
  ctxLabel: {
    ...Typography.tiny,
    color: Colors.gray500,
    letterSpacing: 0.5,
  },
  ctxValue: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.gray900,
  },
  wardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.purple100,
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  wardIcon: {
    fontSize: 24,
  },
  wardLabel: {
    ...Typography.tiny,
    color: Colors.purple500,
    fontWeight: '800',
  },
  wardName: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.navy900,
  },
  idProofBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.green100,
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  idIcon: {
    fontSize: 16,
  },
  idText: {
    ...Typography.caption,
    color: Colors.green600,
    fontWeight: '700',
  },
  remarksSection: {
    marginTop: Spacing.xs,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
  },
});
