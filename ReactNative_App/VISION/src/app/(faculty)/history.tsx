/**
 * Faculty Approval History Screen
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import { useAuth } from '@/context/AuthContext';
import { subscribeToAllFacultyRequests, VisitRequest } from '@/services/visitRequest.service';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';

// Empty State Illustration Component
function EmptyHistoryIllustration() {
  return (
    <Svg width="200" height="200" viewBox="0 0 200 200" fill="none">
      <Defs>
        <LinearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.1" />
          <Stop offset="100%" stopColor="#3b82f6" stopOpacity="0.2" />
        </LinearGradient>
      </Defs>
      
      {/* Background Circle */}
      <Circle cx="100" cy="100" r="90" fill="url(#gradient1)" />
      
      {/* Clipboard */}
      <Rect x="60" y="50" width="80" height="100" rx="8" fill="#e2e8f0" />
      <Rect x="65" y="55" width="70" height="90" rx="4" fill="white" />
      
      {/* Clipboard Clip */}
      <Rect x="85" y="45" width="30" height="12" rx="6" fill="#94a3b8" />
      <Rect x="90" y="48" width="20" height="6" rx="3" fill="#cbd5e1" />
      
      {/* Checkmark Lines (Empty) */}
      <Rect x="75" y="75" width="50" height="4" rx="2" fill="#e2e8f0" />
      <Rect x="75" y="90" width="40" height="4" rx="2" fill="#e2e8f0" />
      <Rect x="75" y="105" width="45" height="4" rx="2" fill="#e2e8f0" />
      <Rect x="75" y="120" width="35" height="4" rx="2" fill="#e2e8f0" />
      
      {/* Floating Document Icons */}
      <G opacity="0.4">
        <Rect x="35" y="70" width="15" height="20" rx="2" fill="#3b82f6" opacity="0.3" />
        <Rect x="150" y="90" width="15" height="20" rx="2" fill="#3b82f6" opacity="0.3" />
        <Rect x="40" y="130" width="12" height="16" rx="2" fill="#3b82f6" opacity="0.2" />
      </G>
    </Svg>
  );
}

export default function FacultyHistoryScreen() {
  const { user } = useAuth();
  
  // Extract employeeId from user (same logic as inbox)
  const facultyId = user?.employeeId || user?.username || user?.uid?.replace('faculty_', '');
  
  console.log('📜 Faculty History Screen - User Info:', {
    employeeId: user?.employeeId,
    username: user?.username,
    uid: user?.uid,
    email: user?.email,
    role: user?.role,
    resolvedFacultyId: facultyId,
  });
  
  const [requests, setRequests] = useState<VisitRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Subscribe to ALL requests (not just pending)
  useEffect(() => {
    if (!facultyId) {
      setLoading(false);
      setRequests([]);
      return;
    }

    console.log('📜 Faculty History: Subscribing to all requests for:', facultyId);
    setLoading(true);

    const unsubscribe = subscribeToAllFacultyRequests(facultyId, (data) => {
      console.log('📬 History: Received', data.length, 'total requests');
      if (data.length > 0) {
        console.log('📬 History: First request:', {
          id: data[0].id,
          targetFacultyId: data[0].targetFacultyId,
          requesterName: data[0].requesterName,
          status: data[0].status,
        });
      }
      setRequests(data);
      setLoading(false);
    });

    return () => {
      console.log('🔕 History: Unsubscribing');
      unsubscribe();
    };
  }, [facultyId]);
  
  // Filter for decided requests (approved, rejected, cancelled, or permit_active)
  // History shows all requests that have been acted upon by faculty
  // OR truly pending requests with past dates (auto-expired)
  const decidedRequests = requests.filter((r) => {
    // Include approved (permit_active), rejected, and cancelled
    const isDecided = 
      r.status === 'approved' || 
      r.status === 'permit_active' ||
      r.status === 'rejected' || 
      r.status === 'cancelled';
    
    if (isDecided) return true;
    
    // Also include truly pending requests with past dates (they're auto-expired)
    // Note: permit_active is NOT pending - it's an approved permit
    const isTrulyPending = r.status === 'pending' || r.status === 'under_review' || r.status === 'submitted';
    if (isTrulyPending && r.visitDate) {
      // Check if expired using same logic as inbox
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let visitEndDate: Date;
      if (r.visitEndAt) {
        visitEndDate = new Date(r.visitEndAt);
      } else {
        visitEndDate = new Date(r.visitDate);
        visitEndDate.setHours(23, 59, 59, 999);
      }
      
      // If expired, show in history
      if (visitEndDate < today) {
        return true;
      }
    }
    
    return false;
  });
  
  console.log('📊 Showing', decidedRequests.length, 'decided requests out of', requests.length, 'total');

  return (
    <View style={styles.container}>
      <NeuHeader title="Approval History" showLogo={false} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.navy900} />
          <Text style={styles.loadingText}>Loading history...</Text>
        </View>
      ) : !loading && decidedRequests.length === 0 ? (
        <View style={styles.emptyState}>
          <EmptyHistoryIllustration />
          <Text style={styles.emptyTitle}>No Approval History Yet</Text>
          <Text style={styles.emptySubtitle}>
            Requests you approve or reject will appear here for future reference
          </Text>
        </View>
      ) : (
        <FlatList
          data={decidedRequests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={[styles.card, neuOutset(4, 8, Colors.neuSurface)]}>
              <View style={styles.topRow}>
                <Text style={styles.name}>{item.requesterName}</Text>
                <StatusChip 
                  status={item.status as any} 
                  visitDate={item.visitDate}
                  visitEndAt={item.visitEndAt}
                />
              </View>

              <Text style={styles.purpose}>{item.purpose}</Text>
              <Text style={styles.date}>{item.visitDate} • Destination: {item.destination}</Text>

              {item.facultyRemarks && (
                <View style={styles.remarksBox}>
                  <Text style={styles.remarksText}>Remark: "{item.facultyRemarks}"</Text>
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing['2xl'],
    paddingBottom: Spacing['4xl'],
  },
  emptyTitle: {
    ...Typography.headlineMd,
    color: Colors.navy900,
    fontWeight: '800',
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 280,
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
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing['4xl'],
  },
  card: {
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    ...Typography.headlineSm,
    fontSize: 16,
    color: Colors.navy900,
    fontWeight: '800',
  },
  purpose: {
    ...Typography.bodyMd,
    color: Colors.gray700,
  },
  date: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  remarksBox: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.gray100,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  remarksText: {
    ...Typography.caption,
    fontStyle: 'italic',
    color: Colors.gray700,
  },
});
