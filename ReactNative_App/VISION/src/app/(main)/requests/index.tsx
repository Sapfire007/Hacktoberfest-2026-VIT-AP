/**
 * Requests List Screen — All Visit Requests
 * 
 * Fetches user's visit requests from Firestore with real-time updates
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { SearchBar } from '@/components/ui/SearchBar';
import { FilterChips, FilterOption } from '@/components/ui/FilterChips';
import { RequestCard } from '@/components/ui/RequestCard';
import { NeuButton } from '@/components/ui/NeuButton';
import { useAuth } from '@/context/AuthContext';
import { useVisitRequests } from '@/hooks/useVisitRequests';
import { fuzzyMatchScore } from '@/utils/fuzzySearch';
import Svg, { Path, Circle, Rect, G, Defs, LinearGradient, Stop } from 'react-native-svg';

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all', label: 'All Requests' },
  { id: 'approved', label: 'Approved' },
  { id: 'pending', label: 'Pending' },
  { id: 'rejected', label: 'Rejected' },
];

// Empty State Illustration
function EmptyRequestsIllustration() {
  return (
    <Svg width="200" height="200" viewBox="0 0 200 200" fill="none">
      <Defs>
        <LinearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#e0e7ff" stopOpacity="0.5" />
          <Stop offset="100%" stopColor="#c7d2fe" stopOpacity="0.3" />
        </LinearGradient>
      </Defs>
      
      {/* Background Circle */}
      <Circle cx="100" cy="100" r="85" fill="url(#bgGradient)" />
      
      {/* Document/Request Icon */}
      <Rect x="65" y="50" width="70" height="90" rx="8" fill="white" stroke="#cbd5e1" strokeWidth="2" />
      
      {/* Lines representing text */}
      <Rect x="75" y="70" width="50" height="4" rx="2" fill="#e2e8f0" />
      <Rect x="75" y="82" width="40" height="4" rx="2" fill="#e2e8f0" />
      <Rect x="75" y="94" width="45" height="4" rx="2" fill="#e2e8f0" />
      
      {/* Checkmark circle */}
      <Circle cx="100" cy="115" r="15" fill="#dbeafe" />
      <Path 
        d="M 93 115 L 98 120 L 107 111" 
        stroke="#3b82f6" 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        fill="none"
      />
      
      {/* Floating elements */}
      <G opacity="0.4">
        <Circle cx="40" cy="80" r="6" fill="#3b82f6" />
        <Circle cx="160" cy="100" r="8" fill="#6366f1" />
        <Circle cx="50" cy="140" r="5" fill="#3b82f6" />
        <Circle cx="150" cy="65" r="7" fill="#6366f1" />
      </G>
    </Svg>
  );
}

export default function RequestsListScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { requests, loading, error } = useVisitRequests(user?.id);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  console.log('📋 Requests Screen:', {
    userId: user?.id,
    requestCount: requests.length,
    loading,
    error: error?.message,
  });

  const filteredRequests = requests.filter((req) => {
    const matchesFilter =
      selectedFilter === 'all' ||
      (selectedFilter === 'approved' && (req.status === 'approved' || req.status === 'permit_active')) ||
      (selectedFilter === 'pending' && (req.status === 'pending' || req.status === 'under_review' || req.status === 'submitted')) ||
      (selectedFilter === 'rejected' && req.status === 'rejected');

    // Use fuzzy matching for search with typo tolerance
    const matchesSearch = !searchQuery.trim() || (
      fuzzyMatchScore(req.destination, searchQuery) > 0.3 ||
      fuzzyMatchScore(req.purpose, searchQuery) > 0.3 ||
      fuzzyMatchScore(req.targetFacultyName, searchQuery) > 0.3
    );

    return matchesFilter && matchesSearch;
  });

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Visit Requests" showLogo={false} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.navy900} />
          <Text style={styles.loadingText}>Loading your requests...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <NeuHeader title="Visit Requests" showLogo={false} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Failed to load requests</Text>
          <Text style={styles.errorHint}>{error.message}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <NeuHeader title="Visit Requests" showLogo={false} />

      <View style={styles.searchSection}>
        <SearchBar
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by destination or faculty..."
        />
        <FilterChips
          options={FILTER_OPTIONS}
          selectedId={selectedFilter}
          onSelect={setSelectedFilter}
        />
      </View>

      <FlatList
        data={filteredRequests}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <RequestCard
            id={item.id}
            destination={item.destination}
            purpose={item.purpose}
            hostName={item.targetFacultyName}
            hostPhotoURL={item.targetFacultyPhotoURL ?? undefined}
            dateTime={`${item.visitDate} • ${item.timeWindow}`}
            visitDate={item.visitDate}
            visitEndAt={item.visitEndAt}
            status={item.status as any}
            onPress={() => {
              console.log('📸 Request faculty photo URL:', item.targetFacultyPhotoURL);
              router.push(`/(main)/requests/${item.id}`);
            }}
            onActionPress={() => router.push(`/(main)/requests/${item.id}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <EmptyRequestsIllustration />
            <Text style={styles.emptyTitle}>
              {searchQuery || selectedFilter !== 'all' 
                ? 'No Requests Match Your Filters'
                : 'No Visit Requests Yet'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {searchQuery || selectedFilter !== 'all'
                ? 'Try adjusting your search or filter settings'
                : 'Start by creating your first visit request to meet faculty or access campus facilities'}
            </Text>
            {(!searchQuery && selectedFilter === 'all') && (
              <View style={styles.emptyAction}>
                <NeuButton
                  title="Create Your First Request"
                  variant="accent"
                  size="md"
                  onPress={() => router.push('/(main)/requests/new')}
                />
              </View>
            )}
          </View>
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
  searchSection: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
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
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4xl'],
    paddingHorizontal: Spacing['2xl'],
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
    maxWidth: 300,
  },
  emptyAction: {
    marginTop: Spacing.xl,
    width: '100%',
    maxWidth: 280,
  },
});
