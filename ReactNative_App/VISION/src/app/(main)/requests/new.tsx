/**
 * New Visit Request Screen — Request Creation Form
 * 
 * Implements visit request submission with host selection, date/time pickers,
 * and optional vehicle pre-registration per PRD.md §7.3 & Design.md §5.2.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuButton } from '@/components/ui/NeuButton';
import { NativeDateTimePicker } from '@/components/ui/NativeDateTimePicker';
import { FacultyMember } from '@/services/faculty.service';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { searchFaculty } from '@/utils/fuzzySearch';
import { usePaginatedFaculty } from '@/hooks/useFaculty';
import { ActivityIndicator } from 'react-native';

const VISIT_TYPES = ['Meeting', 'Event / Guest Lecture', 'Parent Visit', 'Delivery', 'Maintenance'];
const BUILDING_OPTIONS = [
  'Academic Block-1',
  'Academic Block-2',
  'Central Block',
  'Student Activity Centre (SAC)',
];

export default function NewVisitRequestScreen() {
  const router = useRouter();
  const { user, role } = useAuth();
  const { addVisitRequest } = useApp();
  
  // Paginated faculty data from Firestore
  const { 
    faculty: facultyList, 
    loading: facultyLoading, 
    loadingMore: facultyLoadingMore,
    searchLoading: facultySearchLoading,
    error: facultyError, 
    hasMore: hasMoreFaculty,
    loadInitial: loadInitialFaculty,
    loadMore: loadMoreFaculty,
    search: searchFacultyDB,
    refresh: refreshFaculty 
  } = usePaginatedFaculty();

  const [destination, setDestination] = useState('Academic Block-1');
  const [showDestinationDropdown, setShowDestinationDropdown] = useState(false);
  const [purpose, setPurpose] = useState('Meeting regarding project review');
  const [visitType, setVisitType] = useState('Meeting');
  const [selectedFaculty, setSelectedFaculty] = useState<FacultyMember | null>(null);

  // Students are not gate-tracked (VISION.md §3.4): they request on behalf of a parent or
  // guardian, and the permit is issued in that person's name.
  const isStudent = role === 'student';
  const [visitorName, setVisitorName] = useState('');
  const [visitorPhone, setVisitorPhone] = useState('');
  const [visitorRelation, setVisitorRelation] = useState('');
  const [facultySearch, setFacultySearch] = useState('');
  const [showFacultyList, setShowFacultyList] = useState(false);
  
  // Date/Time states
  const [visitDate, setVisitDate] = useState(new Date());
  const [startTime, setStartTime] = useState(() => {
    const date = new Date();
    date.setHours(10, 0, 0, 0); // Default 10:00 AM
    return date;
  });
  const [endTime, setEndTime] = useState(() => {
    const date = new Date();
    date.setHours(13, 0, 0, 0); // Default 1:00 PM
    return date;
  });

  // Calculate minimum end time (must be at least 30 minutes after start time)
  const getMinimumEndTime = () => {
    const minEndTime = new Date(startTime);
    minEndTime.setMinutes(minEndTime.getMinutes() + 30); // Add 30 minutes buffer
    return minEndTime;
  };

  // Validate and update end time when start time changes
  React.useEffect(() => {
    const minEndTime = getMinimumEndTime();
    
    // If current end time is before the new minimum, automatically adjust it
    if (endTime <= startTime) {
      console.log('⚠️ End time is before/equal to start time, adjusting...');
      setEndTime(minEndTime);
    }
  }, [startTime]);

  // Handle start time change
  const handleStartTimeChange = (newStartTime: Date) => {
    setStartTime(newStartTime);
    
    // Auto-adjust end time if it's now invalid
    const minEndTime = new Date(newStartTime);
    minEndTime.setMinutes(minEndTime.getMinutes() + 30);
    
    if (endTime <= newStartTime) {
      setEndTime(minEndTime);
    }
  };

  // Handle end time change with strict validation
  const handleEndTimeChange = (newEndTime: Date) => {
    const minEndTime = getMinimumEndTime();
    
    // Enforce minimum time constraint
    if (newEndTime <= startTime) {
      console.log('❌ Invalid end time selected. Must be after start time.');
      // Force it to minimum valid time
      setEndTime(minEndTime);
      // Show alert to user
      alert(`End time must be after ${startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}. Setting to ${minEndTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`);
      return;
    }
    
    // Valid selection
    setEndTime(newEndTime);
  };
  
  const [selectedVehiclePlate, setSelectedVehiclePlate] = useState('');

  // Load initial faculty when dropdown opens
  React.useEffect(() => {
    if (showFacultyList && facultyList.length === 0 && !facultyLoading) {
      loadInitialFaculty();
    }
  }, [showFacultyList, facultyList.length, facultyLoading, loadInitialFaculty]);

  // Debounced search from DB (searches entire database)
  React.useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (facultySearch.trim().length >= 2) {
        console.log('🔍 Searching entire DB for:', facultySearch);
        searchFacultyDB(facultySearch);
      } else if (facultySearch.trim().length === 0) {
        // Reset to paginated data when search cleared
        console.log('🔄 Search cleared, loading initial faculty...');
        if (facultyList.length === 0) {
          loadInitialFaculty();
        } else {
          searchFacultyDB(''); // Reset to show cached paginated data
        }
      }
    }, 500); // 500ms debounce

    return () => clearTimeout(timeoutId);
  }, [facultySearch, searchFacultyDB, loadInitialFaculty, facultyList.length]);

  // Use fuzzy search for local filtering when results are already loaded
  // When user types, it searches ENTIRE DB via searchFacultyDB
  // Pin selected faculty to top of list
  const filteredFaculty = React.useMemo(() => {
    if (!selectedFaculty) {
      return facultyList;
    }

    // Move selected faculty to top
    const selected = facultyList.find(f => f.id === selectedFaculty.id);
    const others = facultyList.filter(f => f.id !== selectedFaculty.id);

    return selected ? [selected, ...others] : facultyList;
  }, [facultyList, selectedFaculty]);

  // Check if current time range is valid
  const isTimeRangeValid = React.useMemo(() => {
    if (endTime <= startTime) return false;
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    return durationMinutes >= 30;
  }, [startTime, endTime]);

  const handleSubmit = async () => {
    // Debug: Check user object
    console.log('👤 Current user object:', {
      user,
      userId: user?.id,
      userName: user?.name,
      userEmail: user?.email,
      role,
    });

    if (!user || !user.id) {
      alert('❌ Authentication Error!\n\nUser is not properly authenticated. Please sign in again.');
      console.error('❌ User object invalid:', user);
      return;
    }

    if (!selectedFaculty) {
      alert('Please select a faculty member');
      return;
    }

    if (isStudent) {
      if (visitorName.trim().length < 2) {
        alert('Enter the name of the parent or guardian who will visit');
        return;
      }
      if (visitorPhone.replace(/\D/g, '').length < 10) {
        alert('Enter a valid 10-digit mobile number for the visitor');
        return;
      }
    }

    // CRITICAL: Final validation - prevent invalid time ranges
    if (endTime <= startTime) {
      alert('❌ Invalid Time Range!\n\nEnd time must be after start time.\n\nPlease adjust your time selection.');
      console.error('❌ Submission blocked: Invalid time range', {
        startTime: startTime.toLocaleTimeString(),
        endTime: endTime.toLocaleTimeString(),
      });
      return;
    }

    // Ensure at least 30 minutes duration
    const durationMinutes = (endTime.getTime() - startTime.getTime()) / 60000;
    if (durationMinutes < 30) {
      alert('❌ Visit Duration Too Short!\n\nVisit must be at least 30 minutes long.\n\nPlease extend your end time.');
      console.error('❌ Submission blocked: Duration too short', { durationMinutes });
      return;
    }

    try {
      // Format date and time for submission
      const dateStr = visitDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      const timeWindowStr = `${startTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })} - ${endTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })}`;

      // Machine-readable window: the chosen date with the chosen start/end times. The
      // server uses it to validate the visit and to set when the permit expires.
      const atTime = (day: Date, time: Date) => {
        const d = new Date(day);
        d.setHours(time.getHours(), time.getMinutes(), 0, 0);
        return d;
      };
      const visitStartAt = atTime(visitDate, startTime).toISOString();
      const visitEndAt = atTime(visitDate, endTime).toISOString();

      const newReq = await addVisitRequest({
        destination,
        purpose,
        visitType,
        requesterId: user.id,
        requesterName: user.name || user.email?.split('@')[0] || 'Unknown',
        requesterCategory: user.visitorSubtype || (role === 'parent' ? 'parent' : role === 'student' ? 'student' : 'general'),
        requesterPhotoUri: user.profilePhotoUri || user.photoUri || '',
        targetFacultyId: selectedFaculty.id,
        targetFacultyName: selectedFaculty.name,
        targetFacultyPhotoURL: selectedFaculty.photoURL || selectedFaculty.photoUri, // Store faculty photo
        date: dateStr,
        timeWindow: timeWindowStr,
        visitStartAt,
        visitEndAt,
        sponsoredVisitor: isStudent
          ? {
              name: visitorName.trim(),
              phone: visitorPhone,
              relation: visitorRelation.trim() || undefined,
            }
          : undefined,
      });

      console.log('✅ Request submitted successfully:', newReq.id);
      
      // Back to the list the request now appears in. Students use this same form from their
      // own shell, which has its own list of sponsored visits.
      router.replace(isStudent ? '/(student)/sponsored-visits' : '/(main)/requests');
    } catch (error) {
      console.error('Failed to submit visit request:', error);
      // The server's message says what to fix (e.g. "Verify your email", "That visit time
      // has already passed"), so show it rather than a generic failure.
      alert(error instanceof Error ? error.message : 'Failed to submit request. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <NeuHeader title="New Visit Request" showLogo={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isStudent && (
          <View style={styles.section}>
            <Text style={styles.label}>VISITOR (PARENT / GUARDIAN)</Text>
            <Text style={styles.sponsorHint}>
              The permit is issued in their name. Once it is approved, send them a screenshot of
              the permit QR — they show it at the gate.
            </Text>
            <NeuInput
              label="FULL NAME *"
              value={visitorName}
              onChangeText={setVisitorName}
              placeholder="As printed on their ID"
              autoCapitalize="words"
            />
            <NeuInput
              label="MOBILE NUMBER *"
              value={visitorPhone}
              onChangeText={(text) => setVisitorPhone(text.replace(/[^\d+ ]/g, ''))}
              placeholder="10-digit number"
              keyboardType="phone-pad"
              maxLength={14}
            />
            <NeuInput
              label="RELATION"
              value={visitorRelation}
              onChangeText={setVisitorRelation}
              placeholder="e.g. Father, Mother, Guardian"
              autoCapitalize="words"
            />
          </View>
        )}

        {/* Destination & Purpose */}
        <View style={styles.section}>
          <Text style={styles.label}>DESTINATION / BUILDING</Text>
          
          <Pressable
            onPress={() => setShowDestinationDropdown(!showDestinationDropdown)}
            style={[styles.facultySelectBox, neuOutset(4, 8, Colors.neuSurface)]}
          >
            <Text style={styles.facultyName}>{destination}</Text>
            <Text style={styles.arrowIcon}>{showDestinationDropdown ? '▲' : '▼'}</Text>
          </Pressable>

          {showDestinationDropdown && (
            <View style={[styles.facultyDropdown, neuInset(4, 8, Colors.neuSurface), { maxHeight: 250 }]}>
              <ScrollView nestedScrollEnabled>
                {BUILDING_OPTIONS.map((building) => (
                  <Pressable
                    key={building}
                    onPress={() => {
                      setDestination(building);
                      setShowDestinationDropdown(false);
                    }}
                    style={[
                      styles.facultyItem,
                      destination === building && styles.facultyItemSelected,
                    ]}
                  >
                    <Text style={styles.fItemName}>{building}</Text>
                    {destination === building && (
                      <View style={styles.selectedBadge}>
                        <Text style={styles.selectedBadgeText}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        <NeuInput
          label="PURPOSE OF VISIT"
          value={purpose}
          onChangeText={setPurpose}
          placeholder="e.g. Meeting with Dean / Parent Visit"
          multiline
        />

        {/* Visit Type Selector */}
        <View style={styles.section}>
          <Text style={styles.label}>VISIT CATEGORY / TYPE:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
            {VISIT_TYPES.map((type) => {
              const isSelected = visitType === type;
              return (
                <Pressable
                  key={type}
                  onPress={() => setVisitType(type)}
                  style={[
                    styles.typeChip,
                    isSelected
                      ? { backgroundColor: Colors.navy900 }
                      : neuOutset(3, 6, Colors.neuSurface),
                  ]}
                >
                  <Text style={[Typography.caption, { color: isSelected ? Colors.white : Colors.gray800, fontWeight: '700' }]}>
                    {type}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Concerned Faculty Lookup */}
        <View style={styles.section}>
          <Text style={styles.label}>CONCERNED FACULTY / HOST:</Text>
          
          <Pressable
            onPress={() => setShowFacultyList(!showFacultyList)}
            style={[styles.facultySelectBox, neuOutset(4, 8, Colors.neuSurface)]}
          >
            {selectedFaculty ? (
              <View style={styles.selectedFacultyContent}>
                {/* Profile Photo */}
                <View style={styles.selectedAvatarContainer}>
                  {selectedFaculty.photoURL || selectedFaculty.photoUri ? (
                    <Image
                      source={{ uri: selectedFaculty.photoURL || selectedFaculty.photoUri }}
                      style={styles.selectedAvatar}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={styles.selectedAvatarPlaceholder}>
                      <Text style={styles.selectedAvatarInitial}>
                        {selectedFaculty.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.selectedFacultyInfo}>
                  <Text style={styles.facultyName}>{selectedFaculty.name}</Text>
                  <Text style={styles.facultyDept}>{selectedFaculty.department}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.placeholder}>Choose faculty...</Text>
            )}

            <Text style={styles.arrowIcon}>{showFacultyList ? '▲' : '▼'}</Text>
          </Pressable>

          {showFacultyList && (
            <View style={[styles.facultyDropdown, neuInset(4, 8, Colors.neuSurface)]}>
              {facultyLoading ? (
                <View style={styles.dropdownLoading}>
                  <ActivityIndicator size="large" color={Colors.navy900} />
                  <Text style={styles.loadingText}>Loading faculty...</Text>
                </View>
              ) : facultyError ? (
                <View style={styles.dropdownError}>
                  <Text style={styles.errorText}>Failed to load faculty</Text>
                  <Pressable onPress={loadInitialFaculty}>
                    <Text style={styles.retryText}>Tap to retry</Text>
                  </Pressable>
                </View>
              ) : (
                <>
                  {/* Search Input */}
                  <NeuInput
                    value={facultySearch}
                    onChangeText={setFacultySearch}
                    placeholder="Search by name, department..."
                    style={styles.searchInput}
                  />
                  
                  {facultySearchLoading ? (
                    <View style={styles.searchingIndicator}>
                      <ActivityIndicator size="small" color={Colors.navy900} />
                      <Text style={styles.searchingText}>Searching entire database...</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.resultCount}>
                        {filteredFaculty.length} result{filteredFaculty.length !== 1 ? 's' : ''}
                        {facultySearch.trim() ? (
                          <Text style={styles.searchHint}> (searched all faculty)</Text>
                        ) : hasMoreFaculty && (
                          <Text style={styles.searchHint}> (scroll for more)</Text>
                        )}
                      </Text>
                      
                      {/* Results with Prefetch Pagination */}
                      <ScrollView 
                        style={styles.facultyScrollView} 
                        nestedScrollEnabled
                        onScroll={({ nativeEvent }) => {
                          // Only trigger pagination when NOT searching (search gets all results)
                          if (facultySearch.trim()) {
                            return; // Skip pagination during search
                          }

                          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                          const scrollPosition = layoutMeasurement.height + contentOffset.y;
                          const totalHeight = contentSize.height;
                          
                          // Prefetch when 70% through current list (not at bottom)
                          const prefetchThreshold = totalHeight * 0.7;
                          
                          if (scrollPosition >= prefetchThreshold && hasMoreFaculty && !facultyLoadingMore) {
                            console.log('📜 70% scrolled, prefetching next batch...');
                            loadMoreFaculty();
                          }
                        }}
                        scrollEventThrottle={200}
                      >
                        {filteredFaculty.length > 0 ? (
                          <>
                            {filteredFaculty.map((f) => (
                              <Pressable
                                key={f.id}
                                onPress={() => {
                                  setSelectedFaculty(f);
                                  // Dropdown stays open - user can keep browsing
                                  // setShowFacultyList(false); // REMOVED - dropdown stays open
                                  // setFacultySearch('');      // Keep search too
                                }}
                                style={[
                                  styles.facultyItem,
                                  selectedFaculty?.id === f.id && styles.facultyItemSelected,
                                ]}
                              >
                                {/* Profile Photo */}
                                <View style={styles.avatarContainer}>
                                  {f.photoURL || f.photoUri ? (
                                    <Image
                                      source={{ uri: f.photoURL || f.photoUri }}
                                      style={styles.avatar}
                                      resizeMode="cover"
                                    />
                                  ) : (
                                    <View style={styles.avatarPlaceholder}>
                                      <Text style={styles.avatarInitial}>
                                        {f.name.charAt(0).toUpperCase()}
                                      </Text>
                                    </View>
                                  )}
                                </View>
                                
                                <View style={styles.facultyItemContent}>
                                  <Text style={styles.fItemName}>{f.name}</Text>
                                  <Text style={styles.fItemDept}>{f.department}</Text>
                                  {f.designation && (
                                    <Text style={styles.fItemDesignation}>{f.designation}</Text>
                                  )}
                                </View>
                                {selectedFaculty?.id === f.id && (
                                  <View style={styles.selectedBadge}>
                                    <Text style={styles.selectedBadgeText}>✓</Text>
                                  </View>
                                )}
                              </Pressable>
                            ))}
                            
                            {/* Loading More Indicator (only when not searching) */}
                            {!facultySearch.trim() && facultyLoadingMore && (
                              <View style={styles.loadMoreIndicator}>
                                <ActivityIndicator size="small" color={Colors.navy900} />
                                <Text style={styles.loadMoreText}>Loading more...</Text>
                              </View>
                            )}
                            
                            {/* End of List (only when not searching) */}
                            {!facultySearch.trim() && !hasMoreFaculty && facultyList.length > 50 && (
                              <View style={styles.endOfList}>
                                <Text style={styles.endOfListText}>
                                  All {facultyList.length} faculty loaded
                                </Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <View style={styles.noResults}>
                            <Text style={styles.noResultsText}>
                              No faculty found matching "{facultySearch}"
                            </Text>
                            <Text style={styles.noResultsHint}>
                              Try checking spelling or searching by department
                            </Text>
                          </View>
                        )}
                      </ScrollView>
                    </>
                  )}
                </>
              )}
            </View>
          )}
        </View>

        {/* Date & Time Window */}
        <NativeDateTimePicker
          label="VISIT DATE"
          mode="date"
          value={visitDate}
          onChange={setVisitDate}
          minimumDate={new Date()}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <NativeDateTimePicker
              label="START TIME"
              mode="time"
              value={startTime}
              onChange={handleStartTimeChange}
            />
          </View>
          <View style={{ flex: 1 }}>
            <NativeDateTimePicker
              label="END TIME"
              mode="time"
              value={endTime}
              onChange={handleEndTimeChange}
            />
          </View>
        </View>

        {/* Time validation helper text */}
        {!isTimeRangeValid && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>Invalid Time Range</Text>
              <Text style={styles.errorMessage}>
                End time must be after {startTime.toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true,
                })} with at least 30 minutes duration
              </Text>
            </View>
          </View>
        )}
        
        {isTimeRangeValid && (
          <Text style={styles.successText}>
            ✓ Valid time range: {Math.round((endTime.getTime() - startTime.getTime()) / 60000)} minutes
          </Text>
        )}

        <View style={styles.footer}>
          <NeuButton
            title={isTimeRangeValid ? "Submit Request for Approval →" : "⚠️ Fix Time Range to Submit"}
            variant={isTimeRangeValid ? "accent" : "ghost"}
            size="lg"
            fullWidth
            disabled={!isTimeRangeValid}
            onPress={handleSubmit}
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sponsorHint: {
    ...Typography.caption,
    color: Colors.gray500,
    marginBottom: Spacing.xs,
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
  section: {
    gap: Spacing.xs,
  },
  label: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  typeRow: {
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  facultySelectBox: {
    padding: Spacing.md,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  facultyName: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.navy900,
  },
  facultyDept: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  placeholder: {
    ...Typography.bodyMd,
    color: Colors.gray400,
    fontStyle: 'italic',
  },
  arrowIcon: {
    fontSize: 12,
    color: Colors.gray600,
  },
  facultyDropdown: {
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    marginTop: Spacing.xs,
    gap: Spacing.xs,
    maxHeight: 400,
  },
  searchInput: {
    marginBottom: Spacing.sm,
  },
  resultCount: {
    ...Typography.tiny,
    color: Colors.gray500,
    marginBottom: Spacing.xs,
    marginLeft: 4,
  },
  searchHint: {
    ...Typography.tiny,
    color: Colors.gray400,
    fontStyle: 'italic',
  },
  searchingIndicator: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  searchingText: {
    ...Typography.caption,
    color: Colors.gray600,
  },
  facultyScrollView: {
    maxHeight: 300,
  },
  facultyItem: {
    padding: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray200,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  // Avatar styles for dropdown list
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    flexShrink: 0,
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
    ...Typography.bodyLg,
    color: Colors.navy900,
    fontWeight: '700',
    fontSize: 16,
  },
  // Selected faculty box avatar (larger)
  selectedFacultyContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  selectedAvatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    flexShrink: 0,
  },
  selectedAvatar: {
    width: '100%',
    height: '100%',
  },
  selectedAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.navy100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedAvatarInitial: {
    ...Typography.headlineSm,
    color: Colors.navy900,
    fontWeight: '800',
    fontSize: 20,
  },
  selectedFacultyInfo: {
    flex: 1,
  },
  facultyItemContent: {
    flex: 1,
  },
  facultyItemSelected: {
    backgroundColor: Colors.navy50,
    borderRadius: Radius.md,
    borderBottomWidth: 0,
    marginBottom: 4,
  },
  fItemName: {
    ...Typography.bodyMd,
    fontWeight: '600',
    color: Colors.gray900,
  },
  fItemDept: {
    ...Typography.caption,
    color: Colors.gray500,
    marginTop: 2,
  },
  fItemDesignation: {
    ...Typography.tiny,
    color: Colors.gray400,
    marginTop: 1,
  },
  selectedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.navy900,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectedBadgeText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  dropdownLoading: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  dropdownError: {
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  loadMoreIndicator: {
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  loadMoreText: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  endOfList: {
    padding: Spacing.md,
    alignItems: 'center',
  },
  endOfListText: {
    ...Typography.tiny,
    color: Colors.gray400,
  },
  loadingBox: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
  },
  errorBox: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  errorText: {
    ...Typography.bodyMd,
    color: Colors.red600,
    fontWeight: '600',
    textAlign: 'center',
  },
  errorHint: {
    ...Typography.caption,
    color: Colors.gray500,
    textAlign: 'center',
  },
  retryText: {
    ...Typography.bodyMd,
    color: Colors.navy900,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  noResults: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  noResultsText: {
    ...Typography.bodyMd,
    color: Colors.gray600,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  noResultsHint: {
    ...Typography.caption,
    color: Colors.gray400,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  footer: {
    marginTop: Spacing.md,
  },
  helperText: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.gray600,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.red50,
    borderLeftWidth: 4,
    borderLeftColor: Colors.red600,
    padding: Spacing.md,
    borderRadius: Radius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  errorIcon: {
    fontSize: 20,
    marginTop: 2,
  },
  errorTitle: {
    ...Typography.bodyMd,
    fontWeight: '700',
    color: Colors.red700,
    marginBottom: 2,
  },
  errorMessage: {
    ...Typography.caption,
    color: Colors.red600,
    lineHeight: 16,
  },
  successText: {
    ...Typography.caption,
    fontSize: 12,
    color: Colors.green600,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.sm,
    fontWeight: '600',
  },
});
