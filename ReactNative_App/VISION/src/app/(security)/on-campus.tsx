/**
 * Who is on campus, and the fallback lookup.
 *
 * Two jobs on one screen because they are the same question asked two ways. The list
 * answers "who is inside right now"; the search answers "this specific person is standing
 * here and their QR will not scan".
 *
 * The search is the important half. A gate with no fallback when a screen is cracked or a
 * phone is dead is a gate that falls back to a phone call to the supervisor, and a system
 * people route around at the first obstacle does not get used.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuInput } from '@/components/ui/NeuInput';
import { EmptyState } from '@/components/ui/EmptyState';
import { useAuth } from '@/context/AuthContext';
import { gateAPI, GateEntry } from '@/services/gate.api';
import { Icon } from '@/components/ui/Icon';
import { formatDuration } from '@/utils/istDate';

const SOURCE_LABEL: Record<string, string> = { permit: 'pre-approved', recurring: 'regular pass' };

export default function OnCampusScreen() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  // The home screen's overstay banner opens this screen already filtered.
  const params = useLocalSearchParams<{ filter?: string }>();
  const [overstayOnly, setOverstayOnly] = useState(params.filter === 'overstay');

  const [entries, setEntries] = useState<GateEntry[]>([]);
  const [peopleCount, setPeopleCount] = useState(0);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [isSearchResult, setIsSearchResult] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOnCampus = useCallback(async () => {
    setError(null);
    setLoading(true);
    setIsSearchResult(false);

    try {
      const token = await getIdToken();
      const result = await gateAPI.listOnCampus(token);

      if (result.success && result.data) {
        setEntries(result.data.entries);
        setPeopleCount(result.data.peopleOnCampus);
      } else {
        setError(result.message || 'Could not load the list');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the server');
    } finally {
      setLoading(false);
    }
  }, [getIdToken]);

  useFocusEffect(
    useCallback(() => {
      void loadOnCampus();
    }, [loadOnCampus])
  );

  /**
   * Search runs on submit, not on every keystroke.
   *
   * Each query is up to three Firestore lookups — pass code, then plate, then phone —
   * and firing that per character would burn reads and produce a list that changes under
   * the officer's thumb while they are still typing a plate.
   */
  const handleSearch = async () => {
    const trimmed = query.trim();

    if (trimmed.length < 3) {
      setError('Enter at least 3 characters of a pass code, plate or phone number');
      return;
    }

    setError(null);
    setSearching(true);

    try {
      const token = await getIdToken();
      const result = await gateAPI.search(token, trimmed);

      if (result.success && result.data) {
        setEntries(result.data.entries);
        setIsSearchResult(true);
      } else {
        setError(result.message || 'Search failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const overstayCount = entries.filter((entry) => entry.overstay).length;
  const shown = useMemo(
    () => (overstayOnly && !isSearchResult ? entries.filter((entry) => entry.overstay) : entries),
    [entries, overstayOnly, isSearchResult]
  );

  const clearSearch = () => {
    setQuery('');
    setError(null);
    void loadOnCampus();
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {isSearchResult ? 'Search results' : 'On campus now'}
        </Text>
        {!isSearchResult && (
          <Text style={styles.subtitle}>
            {peopleCount} {peopleCount === 1 ? 'person' : 'people'} across {entries.length}{' '}
            {entries.length === 1 ? 'visit' : 'visits'}
          </Text>
        )}

        <NeuInput
          value={query}
          onChangeText={setQuery}
          placeholder="Pass code, number plate or phone"
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleSearch}
          containerStyle={styles.searchInput}
          rightIcon={
            searching ? (
              <ActivityIndicator size="small" color={Colors.navy900} />
            ) : query ? (
              <Pressable onPress={clearSearch} hitSlop={8}>
                <Text style={styles.clearIcon}>✕</Text>
              </Pressable>
            ) : null
          }
        />

        {error && <Text style={styles.error}>{error}</Text>}

        {!isSearchResult && (
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setOverstayOnly(false)}
              style={[styles.filterChip, !overstayOnly ? styles.filterOn : neuOutset(2, 4, Colors.neuSurface)]}
            >
              <Text style={[styles.filterText, !overstayOnly && styles.filterTextOn]}>Everyone</Text>
            </Pressable>
            <Pressable
              onPress={() => setOverstayOnly(true)}
              style={[
                styles.filterChip,
                overstayOnly ? styles.filterOverstayOn : neuOutset(2, 4, Colors.neuSurface),
              ]}
            >
              <Text style={[styles.filterText, overstayOnly && styles.filterTextOn, !overstayOnly && overstayCount > 0 && { color: Colors.red600 }]}>
                Overstayed ({overstayCount})
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      <FlatList
        data={shown}
        keyExtractor={(entry) => entry.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadOnCampus} />
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={isSearchResult ? <Icon name="search" size={48} color={Colors.gray400} /> : <Icon name="university" size={48} color={Colors.gray400} />}
              title={isSearchResult ? 'Nothing found' : overstayOnly ? 'No overstays' : 'Nobody on campus'}
              subtitle={
                isSearchResult
                  ? 'No visit matches that pass code, plate or phone number. Check the digits and try again.'
                  : overstayOnly
                    ? 'Everyone inside is within the time on their pass.'
                    : 'No open visits right now. Registered visitors appear here until they are signed out.'
              }
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              router.push(
                (item.recurringPassId
                  ? `/(security)/regular-pass/${item.recurringPassId}`
                  : `/(security)/pass/${item.id}`) as never
              )
            }
            style={[styles.card, neuOutset(3, 6, Colors.neuSurface), item.overstay && styles.cardOverstay]}
          >
            <View style={styles.cardMain}>
              <Text style={styles.cardName}>{item.visitorName}</Text>
              <Text style={styles.cardMeta}>
                {item.passCode}
                {item.source && SOURCE_LABEL[item.source] ? `  ·  ${SOURCE_LABEL[item.source]}` : ''}
                {item.partySize > 1 ? `  ·  party of ${item.partySize}` : ''}
              </Text>
              <Text style={styles.cardPurpose} numberOfLines={1}>
                {item.purpose}
              </Text>
              {item.vehicle && <Text style={styles.cardPlate}>{item.vehicle.plate}</Text>}
              {item.overstay && (
                <Text style={styles.overstayBadge}>
                  OVERSTAYED {formatDuration(item.overstayMinutes ?? 0)} · call {item.phone}
                </Text>
              )}
            </View>

            <View style={styles.cardSide}>
              <View
                style={[
                  styles.statusPill,
                  item.status === 'on_campus' ? styles.statusIn : styles.statusOut,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    item.status === 'on_campus'
                      ? { color: Colors.green600 }
                      : { color: Colors.gray600 },
                  ]}
                >
                  {item.status === 'on_campus' ? 'INSIDE' : 'LEFT'}
                </Text>
              </View>
              <Text style={styles.cardTime}>
                {item.entryAt
                  ? new Date(item.entryAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : ''}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Pressable onPress={() => router.back()} style={styles.backLink}>
        <Text style={styles.backText}>← Back to the gate</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
  },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  subtitle: { ...Typography.bodySm, color: Colors.gray600 },
  searchInput: { marginTop: Spacing.sm },
  clearIcon: { ...Typography.bodyMd, color: Colors.gray500 },
  error: { ...Typography.caption, color: Colors.red600 },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg, gap: Spacing.sm },
  filterRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.xs },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full },
  filterOn: { backgroundColor: Colors.navy900 },
  filterOverstayOn: { backgroundColor: Colors.red600 },
  filterText: { ...Typography.caption, color: Colors.gray700, fontWeight: '700' },
  filterTextOn: { color: Colors.white },
  cardOverstay: { borderWidth: 2, borderColor: Colors.red600 },
  overstayBadge: { ...Typography.tiny, color: Colors.red600, fontWeight: '800', marginTop: 2 },
  card: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderRadius: Radius.lg,
    gap: Spacing.md,
  },
  cardMain: { flex: 1, gap: 2 },
  cardName: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  cardMeta: { ...Typography.tiny, color: Colors.gray500 },
  cardPurpose: { ...Typography.caption, color: Colors.gray700 },
  cardPlate: {
    ...Typography.tiny,
    color: Colors.navy900,
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginTop: 2,
  },
  cardSide: { alignItems: 'flex-end', gap: 4 },
  statusPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusIn: { backgroundColor: '#E6F6EC' },
  statusOut: { backgroundColor: Colors.gray100 },
  statusText: { ...Typography.tiny, fontWeight: '800', letterSpacing: 0.5 },
  cardTime: { ...Typography.tiny, color: Colors.gray500 },

  backLink: { alignItems: 'center', paddingVertical: Spacing.md },
  backText: { ...Typography.bodySm, color: Colors.gray600 },
  emptyIcon: { fontSize: 34 },
});
