/**
 * Faculty Search Picker Component
 * 
 * Reusable faculty selector with fuzzy search and typo tolerance.
 * 
 * Features:
 * - Fuzzy name matching (handles typos and misspellings)
 * - Real-time search results
 * - Department filtering
 * - Responsive dropdown UI
 * - Neumorphic design
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuInput } from './NeuInput';
import { searchFaculty, SearchResult } from '@/utils/fuzzySearch';
import { useLazyFaculty } from '@/hooks/useFaculty';

export interface FacultyMember {
  id: string;
  name: string;
  department: string;
  designation?: string;
  photoURL?: string;
  photoUri?: string; // Legacy support
  isMentor?: boolean;
  [key: string]: any;
}

interface FacultySearchPickerProps {
  /**
   * Available faculty list
   * If not provided, will fetch from Firestore
   */
  faculty?: FacultyMember[];
  
  /**
   * Fetch faculty from Firestore instead of using prop
   */
  fetchFromFirestore?: boolean;
  
  /**
   * Currently selected faculty
   */
  selectedFaculty: FacultyMember | null;
  
  /**
   * Callback when faculty is selected
   */
  onSelect: (faculty: FacultyMember) => void;
  
  /**
   * Placeholder text for search input
   */
  placeholder?: string;
  
  /**
   * Label text above the picker
   */
  label?: string;
  
  /**
   * Maximum height for dropdown
   */
  maxHeight?: number;
  
  /**
   * Show loading indicator
   */
  loading?: boolean;
  
  /**
   * Minimum search score threshold (0-1)
   */
  threshold?: number;
}

export function FacultySearchPicker({
  faculty: facultyProp,
  fetchFromFirestore = false,
  selectedFaculty,
  onSelect,
  placeholder = 'Search faculty by name or department...',
  label = 'CONCERNED FACULTY / HOST:',
  maxHeight = 400,
  loading: externalLoading = false,
  threshold = 0.25,
}: FacultySearchPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Lazy fetch from Firestore (only when dropdown opens)
  const { faculty: firestoreFaculty, loading: firestoreLoading, loadFaculty } = useLazyFaculty();
  
  // Use Firestore data if fetch enabled, otherwise use prop
  const faculty = fetchFromFirestore ? firestoreFaculty : (facultyProp || []);
  const loading = fetchFromFirestore ? firestoreLoading : externalLoading;

  // Fetch faculty data when dropdown opens (lazy loading)
  useEffect(() => {
    if (fetchFromFirestore && isOpen && firestoreFaculty.length === 0) {
      console.log('🔄 Lazy loading faculty data on dropdown open...');
      loadFaculty();
    }
  }, [isOpen, fetchFromFirestore, firestoreFaculty.length, loadFaculty]);

  // Perform fuzzy search with memoization for performance
  const searchResults = useMemo<SearchResult<FacultyMember>[]>(() => {
    if (!searchQuery.trim()) {
      return faculty.map(item => ({
        item,
        score: 1,
        matchedField: 'name',
      }));
    }
    
    return searchFaculty(faculty, searchQuery, { threshold });
  }, [faculty, searchQuery, threshold]);

  const handleSelect = (facultyMember: FacultyMember) => {
    onSelect(facultyMember);
    setIsOpen(false);
    setSearchQuery('');
  };

  return (
    <View style={styles.container}>
      {/* Label */}
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Selected Faculty Display */}
      <Pressable
        onPress={() => setIsOpen(!isOpen)}
        style={[styles.selectedBox, neuOutset(4, 8, Colors.neuSurface)]}
        disabled={loading}
      >
        {selectedFaculty ? (
          <View style={styles.selectedContent}>
            {/* Profile Photo */}
            <View style={styles.avatarContainer}>
              {selectedFaculty.photoURL || selectedFaculty.photoUri ? (
                <Image
                  source={{ uri: selectedFaculty.photoURL || selectedFaculty.photoUri }}
                  style={styles.avatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {selectedFaculty.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            
            <View style={styles.selectedInfo}>
              <Text style={styles.selectedName}>{selectedFaculty.name}</Text>
              <Text style={styles.selectedDept}>{selectedFaculty.department}</Text>
              {selectedFaculty.designation && (
                <Text style={styles.selectedDesignation}>
                  {selectedFaculty.designation}
                </Text>
              )}
            </View>
            {selectedFaculty.isMentor && (
              <View style={styles.mentorBadge}>
                <Text style={styles.mentorText}>MENTOR</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.placeholder}>Choose faculty...</Text>
        )}
        
        <Text style={styles.arrowIcon}>{isOpen ? '▲' : '▼'}</Text>
      </Pressable>

      {/* Dropdown with Search */}
      {isOpen && (
        <View style={[styles.dropdown, neuInset(4, 8, Colors.neuSurface), { maxHeight }]}>
          {/* Search Input */}
          <View style={styles.searchContainer}>
            <NeuInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={placeholder}
              autoFocus
            />
            <Text style={styles.resultCount}>
              {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Results List - Virtualized with FlatList for performance */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.navy900} />
              <Text style={styles.loadingText}>Loading faculty...</Text>
            </View>
          ) : searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              keyExtractor={(result) => result.item.id}
              renderItem={({ item: { item, score } }) => (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={[
                    styles.resultItem,
                    selectedFaculty?.id === item.id && styles.resultItemSelected,
                  ]}
                >
                  <View style={styles.resultContent}>
                    {/* Profile Photo */}
                    <View style={styles.avatarSmallContainer}>
                      {item.photoURL || item.photoUri ? (
                        <Image
                          source={{ uri: item.photoURL || item.photoUri }}
                          style={styles.avatarSmall}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.avatarSmallPlaceholder}>
                          <Text style={styles.avatarSmallInitial}>
                            {item.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{item.name}</Text>
                      <Text style={styles.resultDept}>{item.department}</Text>
                      {item.designation && (
                        <Text style={styles.resultDesignation}>{item.designation}</Text>
                      )}
                    </View>
                    
                    {/* Show relevance score if searching */}
                    {searchQuery.trim() && score < 0.9 && (
                      <Text style={styles.scoreText}>
                        {Math.round(score * 100)}%
                      </Text>
                    )}
                    
                    {item.isMentor && (
                      <View style={styles.mentorBadgeSmall}>
                        <Text style={styles.mentorTextSmall}>M</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              )}
              initialNumToRender={15}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
              showsVerticalScrollIndicator={true}
              nestedScrollEnabled
              style={styles.resultsList}
              contentContainerStyle={styles.resultsContent}
              ListFooterComponent={
                searchResults.length > 20 ? (
                  <View style={styles.footerInfo}>
                    <Text style={styles.footerText}>
                      Showing {searchResults.length} results
                    </Text>
                  </View>
                ) : null
              }
            />
          ) : (
            <View style={styles.noResults}>
              <Text style={styles.noResultsText}>
                No faculty found matching "{searchQuery}"
              </Text>
              <Text style={styles.noResultsHint}>
                Try checking spelling or searching by department
              </Text>
              <Pressable
                onPress={() => setSearchQuery('')}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>Clear search</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  selectedBox: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 60,
  },
  selectedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.navy100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontWeight: '800',
  },
  selectedInfo: {
    flex: 1,
  },
  selectedName: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.navy900,
  },
  selectedDept: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 2,
  },
  selectedDesignation: {
    ...Typography.tiny,
    color: Colors.gray400,
    marginTop: 1,
  },
  placeholder: {
    ...Typography.bodyMd,
    color: Colors.gray400,
    fontStyle: 'italic',
  },
  mentorBadge: {
    backgroundColor: Colors.orange100,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 3,
    borderRadius: Radius.sm,
  },
  mentorText: {
    ...Typography.tiny,
    color: Colors.orange700,
    fontWeight: '800',
    fontSize: 9,
  },
  arrowIcon: {
    fontSize: 12,
    color: Colors.gray600,
    marginLeft: Spacing.sm,
  },
  dropdown: {
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
  },
  searchContainer: {
    marginBottom: Spacing.sm,
  },
  resultCount: {
    ...Typography.tiny,
    color: Colors.gray500,
    marginTop: Spacing.xs,
    marginLeft: 4,
  },
  resultsList: {
    flex: 1,
  },
  resultsContent: {
    paddingBottom: Spacing.sm,
  },
  footerInfo: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  footerText: {
    ...Typography.tiny,
    color: Colors.gray400,
  },
  resultItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
  },
  resultItemSelected: {
    backgroundColor: Colors.navy50,
    borderRadius: Radius.md,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  resultContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarSmallContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatarSmall: {
    width: '100%',
    height: '100%',
  },
  avatarSmallPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.navy100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmallInitial: {
    ...Typography.bodyLg,
    color: Colors.navy900,
    fontWeight: '700',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    ...Typography.bodyMd,
    fontWeight: '600',
    color: Colors.gray900,
  },
  resultDept: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 2,
  },
  resultDesignation: {
    ...Typography.tiny,
    color: Colors.gray400,
    marginTop: 1,
  },
  scoreText: {
    ...Typography.tiny,
    color: Colors.gray400,
    fontWeight: '600',
  },
  mentorBadgeSmall: {
    backgroundColor: Colors.orange100,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentorTextSmall: {
    ...Typography.tiny,
    color: Colors.orange700,
    fontWeight: '800',
    fontSize: 10,
  },
  loadingContainer: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.gray500,
  },
  noResults: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  noResultsText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
  },
  noResultsHint: {
    ...Typography.caption,
    color: Colors.gray400,
    textAlign: 'center',
  },
  clearButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
  },
  clearButtonText: {
    ...Typography.caption,
    color: Colors.gray700,
    fontWeight: '600',
  },
});
