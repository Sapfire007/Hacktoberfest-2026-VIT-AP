/**
 * Faculty Request Inbox Screen — Host Approval Dashboard
 * 
 * Faithfully recreates Stitch Faculty: Request Management (Refined) screen.
 * Displays "Request Inbox" with "4 Pending" pill badge, search bar,
 * filter chips (All, Parents, Vendors, Urgent), and pending request cards.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterChips, FilterOption } from '@/components/ui/FilterChips';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { CategoryBadge } from '@/components/ui/CategoryBadge';
import { useAuth } from '@/context/AuthContext';
import { useFacultyRequests } from '@/hooks/useVisitRequests';
import { isVisitExpired } from '@/utils/visitStatus';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

// Empty State Component
function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={emptyStyles.container}>
      <Svg width="120" height="120" viewBox="0 0 120 120">
        <Circle cx="60" cy="60" r="50" fill={Colors.gray100} />
        <Path
          d="M40 55 L50 65 L80 35"
          stroke={Colors.gray400}
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
      <Text style={emptyStyles.title}>{title}</Text>
      <Text style={emptyStyles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const emptyStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  title: {
    ...Typography.headlineMd,
    color: Colors.navy900,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    maxWidth: 280,
  },
});

const FACULTY_FILTERS: FilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'parent', label: 'Parents' },
  { id: 'vendor', label: 'Vendors' },
  { id: 'urgent', label: 'Urgent' },
];

export default function FacultyInboxScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  // Faculty uses username (employeeId) as their identifier, not Firebase UID
  const facultyId = user?.employeeId || user?.username || user?.id || user?.uid;

  const { requests, loading } = useFacultyRequests(facultyId);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  // Filter for pending requests (pending, submitted, under_review)
  // Exclude requests with past visit dates (those are automatically expired)
  // Note: permit_active means approved/activated, not pending
  const pendingRequests = requests.filter((r) => {
    const isPending = r.status === 'pending' || r.status === 'under_review' || r.status === 'submitted';
    
    // If it's pending and the visit date has passed, don't show in inbox
    if (isPending && r.visitDate && isVisitExpired(r.visitDate, r.visitEndAt)) {
      return false;
    }
    
    return isPending;
  });

  const filteredRequests = pendingRequests.filter((req) => {
    const matchesFilter =
      selectedFilter === 'all' ||
      (selectedFilter === 'parent' && req.requesterCategory === 'parent') ||
      (selectedFilter === 'vendor' && req.requesterCategory === 'vendor') ||
      (selectedFilter === 'urgent' && req.purpose.toLowerCase().includes('emergency'));

    const matchesSearch =
      req.requesterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.purpose.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.destination.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  // Helper to format timestamp
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'N/A';
    
    try {
      let date: Date;
      
      // Handle Firestore Timestamp
      if (timestamp.toDate && typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      } else if (timestamp.seconds) {
        // Plain Firestore timestamp object
        date = new Date(timestamp.seconds * 1000);
      } else if (timestamp instanceof Date) {
        date = timestamp;
      } else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } else {
        return 'N/A';
      }

      const now = new Date();
      const diff = now.getTime() - date.getTime();
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (minutes < 1) return 'Just now';
      if (minutes < 60) return `${minutes}m ago`;
      if (hours < 24) return `${hours}h ago`;
      return `${days}d ago`;
    } catch (error) {
      console.warn('Error formatting timestamp:', error);
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <NeuHeader title="VISION" showLogo />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.navy900} />
          <Text style={styles.loadingText}>Loading requests...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NeuHeader title="VISION" showLogo />

      {/* Inbox Header Row */}
      <View style={styles.inboxTitleRow}>
        <Text style={styles.inboxTitle}>Request Inbox</Text>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>{pendingRequests.length} Pending</Text>
        </View>
      </View>

      {/* Search & Filters */}
      <View style={styles.filterSection}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search requests..."
        />
        <FilterChips
          options={FACULTY_FILTERS}
          selectedId={selectedFilter}
          onSelect={setSelectedFilter}
        />
      </View>

      {/* Pending Requests List */}
      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/(faculty)/request-detail/${item.id}`)}
            style={[styles.inboxCard, neuOutset(4, 8, Colors.neuSurface)]}
          >
            <ProfileAvatar
              uri={item.requesterPhotoUri || ''}
              name={item.requesterName}
              size={52}
              verified
            />

            <View style={styles.cardMain}>
              <View style={styles.nameRow}>
                <Text style={styles.requesterName}>{item.requesterName}</Text>
                <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
              </View>

              <View style={styles.categoryRow}>
                <CategoryBadge category={item.requesterCategory as any} />
                {item.linkedStudentName && (
                  <Text style={styles.wardSubText}>
                    Visiting Student: <Text style={styles.boldWard}>{item.linkedStudentName}</Text>
                  </Text>
                )}
              </View>

              <Text style={styles.purposeText} numberOfLines={2}>
                Purpose: {item.purpose}
              </Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={
          <EmptyState
            title="Inbox Empty"
            subtitle="No pending visit requests require your review right now."
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  inboxTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  inboxTitle: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
  },
  pendingBadge: {
    backgroundColor: Colors.navy900,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  pendingBadgeText: {
    ...Typography.buttonSm,
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  filterSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    gap: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    paddingBottom: Spacing['4xl'],
  },
  inboxCard: {
    flexDirection: 'row',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  cardMain: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  requesterName: {
    ...Typography.headlineSm,
    fontSize: 17,
    color: Colors.navy900,
    fontWeight: '800',
  },
  timestamp: {
    ...Typography.tiny,
    color: Colors.gray500,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  wardSubText: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.gray600,
  },
  boldWard: {
    color: Colors.navy900,
    fontWeight: '700',
  },
  purposeText: {
    ...Typography.bodyMd,
    fontSize: 14,
    color: Colors.gray700,
    marginTop: 2,
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
