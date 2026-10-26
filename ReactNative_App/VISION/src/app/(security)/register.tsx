/**
 * Register a walk-in visitor.
 *
 * The officer has a person standing in front of them and a queue behind. Everything about
 * this screen follows from that:
 *
 * - Required fields come first, in the order the officer will ask for them.
 * - The government ID photo is required, not optional. It is the whole accountability
 *   claim; without it this is a handwritten register with extra steps.
 * - The number plate is **always** an editable text field. The camera fills it in; it
 *   never owns it. A recogniser that cannot be overridden is worse than no recogniser,
 *   because a wrong plate that cannot be corrected stops the vehicle leaving.
 * - Companions are a repeating sub-form rather than a free-text box, so "who was in the
 *   car" is answerable later without reading prose.
 * - A **regular pass** (vendors, contractors, drivers, mess staff) is the same form with a
 *   schedule instead of companions: dates, weekdays, daily hours. One QR, reused daily.
 * - An optional **email** sends the pass to the visitor's VISION account, if they have a
 *   verified one. A phone-number match is only offered on the pass screen, never assumed.
 * - A **watchlist match** stops the submission with a red alert; the officer denies entry
 *   or admits with a written reason. Both are recorded.
 *
 * Form state lives in `GateDraftContext`, one level up, because the plate scanner is a
 * separate screen and this one is unmounted while the officer is using it.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuDropdown } from '@/components/ui/NeuDropdown';
import { useAuth } from '@/context/AuthContext';
import { useGateDraft, RegularDraft } from '@/context/GateDraftContext';
import { Icon } from '@/components/ui/Icon';
import {
  gateAPI,
  RECURRING_CATEGORY_LABELS,
  RecurringCategory,
  WatchlistMatch,
} from '@/services/gate.api';
import { ID_TYPES, GATES } from '@/constants/gate';
import { WatchlistAlert } from '@/components/gate/WatchlistAlert';
import { NativeDateTimePicker } from '@/components/ui/NativeDateTimePicker';
import {
  WEEKDAY_SHORT,
  addDaysKey,
  daysBetweenInclusive,
  istToday,
  toHHMM,
} from '@/utils/istDate';

/** Security may issue a regular pass for at most this many days; admin for longer. */
const SECURITY_MAX_DAYS = 30;

/** A date key as a local Date for the picker, and back. */
function keyToDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function dateToKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function timeToDate(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

const VALIDITY_OPTIONS = [
  { label: '4 hours', hours: 4 },
  { label: '12 hours', hours: 12 },
  { label: '24 hours', hours: 24 },
];

export default function RegisterVisitorScreen() {
  const router = useRouter();
  const { getIdToken } = useAuth();
  const {
    draft,
    update,
    setTypedPlate,
    addCompanion,
    updateCompanion,
    removeCompanion,
    reset,
  } = useGateDraft();

  const [submitting, setSubmitting] = useState(false);
  const [capturingId, setCapturingId] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the server reports a watchlist match; the form waits for the officer's decision.
  const [watchlistMatches, setWatchlistMatches] = useState<WatchlistMatch[] | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);

  const isRegular = draft.passType === 'regular';
  const updateRegular = (patch: Partial<RegularDraft>) =>
    update({ regular: { ...draft.regular, ...patch } });

  /**
   * Photograph the government ID.
   *
   * Camera only — no gallery. A photo picked from the gallery is not evidence that the
   * officer held the document, which is the one thing this field is supposed to record.
   *
   * The image is downscaled and re-encoded before it becomes base64. A modern phone camera
   * produces a 4-8MB JPEG; base64 inflates that by a third, and the backend's JSON body
   * limit is 10MB. An ID card is legible at 1280px wide, so the full-resolution capture is
   * bytes the officer waits for and nobody ever looks at.
   */
  const handleCaptureId = async () => {
    setError(null);

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera access is needed to photograph the ID document');
      return;
    }

    try {
      setCapturingId(true);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.6,
        base64: true,
        allowsEditing: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];

      if (!asset.base64) {
        setError('The photo could not be read. Try again.');
        return;
      }

      update({
        idProof: {
          ...draft.idProof,
          imageDataUri: `data:image/jpeg;base64,${asset.base64}`,
          previewUri: asset.uri,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the camera');
    } finally {
      setCapturingId(false);
    }
  };

  /**
   * Submit the registration. `overrideReason` is set when the officer has seen a watchlist
   * alert and chosen to admit anyway.
   */
  const submit = async (overrideReason?: string) => {
    setError(null);
    setWatchlistError(null);

    // Validated here as well as on the server. The server's check is the one that counts;
    // this one exists so the officer is told what is missing without a round trip while
    // someone waits at the barrier.
    if (!draft.visitorName.trim()) return setError('Enter the visitor’s name');
    if (draft.phone.replace(/\D/g, '').length < 10)
      return setError('Enter a valid 10-digit mobile number');
    if (draft.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()))
      return setError('That email address does not look right');
    if (!draft.purpose.trim()) return setError('Enter the purpose of the visit');
    if (!draft.idProof.idType) return setError('Select which ID document you checked');
    if (!draft.idProof.imageDataUri) return setError('Photograph the government ID');
    if (draft.hasVehicle && !draft.plate.value.trim())
      return setError('Enter the number plate, or turn off "arrived by vehicle"');

    if (isRegular) {
      const { validFrom, validUntil, weekdays } = draft.regular;
      if (validUntil < validFrom) return setError('The last day must be on or after the first day');
      if (daysBetweenInclusive(validFrom, validUntil) > SECURITY_MAX_DAYS)
        return setError(`A gate-issued pass can run for at most ${SECURITY_MAX_DAYS} days — ask admin for longer`);
      if (weekdays.length === 0) return setError('Choose at least one day of the week');
    }

    const watchlistOverride = overrideReason ? { reason: overrideReason } : undefined;
    const vehicle = draft.hasVehicle
      ? {
          plate: draft.plate.value,
          // The pre-correction string is kept alongside the stored plate, so a wrong
          // OCR read can always be traced rather than just blamed.
          plateRaw: draft.plate.ocrRaw ?? draft.plate.value,
          source: draft.plate.source,
          confidence: draft.plate.confidence ?? undefined,
          make: draft.vehicleMake.trim() || undefined,
          color: draft.vehicleColor.trim() || undefined,
        }
      : null;

    try {
      setSubmitting(true);
      const token = await getIdToken();

      if (isRegular) {
        const result = await gateAPI.issueRecurring(token, {
          holderName: draft.visitorName.trim(),
          phone: draft.phone,
          email: draft.email.trim() || undefined,
          category: draft.regular.category,
          organisation: draft.regular.organisation.trim() || undefined,
          purpose: draft.purpose.trim(),
          hostName: draft.hostName.trim() || undefined,
          vehiclePlate: vehicle?.plate,
          idType: draft.idProof.idType,
          idLastFour: draft.idProof.lastFour.trim() || undefined,
          idImageDataUri: draft.idProof.imageDataUri ?? undefined,
          validFrom: draft.regular.validFrom,
          validUntil: draft.regular.validUntil,
          weekdays: draft.regular.weekdays,
          dailyStart: draft.regular.dailyStart,
          dailyEnd: draft.regular.dailyEnd,
          notes: draft.notes.trim() || undefined,
          gate: draft.gate,
          // They are standing at the gate: admit them for today as well.
          checkInNow: true,
          watchlistOverride,
        });

        if (result.error === 'watchlist_hit') {
          setWatchlistMatches(result.data?.matches ?? []);
          if (overrideReason) setWatchlistError(result.message || null);
          return;
        }
        if (!result.success || !result.data) {
          setError(result.message || result.error || 'Could not issue the pass');
          return;
        }

        if (result.data.checkInNote) Alert.alert('Pass issued', result.data.checkInNote);
        const passId = result.data.pass.id;
        reset();
        router.replace(`/(security)/regular-pass/${passId}` as never);
        return;
      }

      const result = await gateAPI.registerEntry(token, {
        visitorName: draft.visitorName.trim(),
        phone: draft.phone,
        email: draft.email.trim() || undefined,
        purpose: draft.purpose.trim(),
        hostName: draft.hostName.trim() || undefined,
        companions: draft.companions
          .filter((companion) => companion.name.trim())
          .map((companion) => ({
            name: companion.name.trim(),
            relation: companion.relation.trim() || null,
            age: companion.age ? Number(companion.age) : null,
          })),
        vehicle,
        idProof: {
          idType: draft.idProof.idType,
          idLastFour: draft.idProof.lastFour.trim() || undefined,
          imageDataUri: draft.idProof.imageDataUri,
        },
        gate: draft.gate,
        notes: draft.notes.trim() || undefined,
        validForHours: draft.validForHours,
        watchlistOverride,
      });

      if (result.error === 'watchlist_hit') {
        setWatchlistMatches(result.data?.matches ?? []);
        if (overrideReason) setWatchlistError(result.message || null);
        return;
      }
      if (!result.success || !result.data) {
        setError(result.message || result.error || 'Could not register the entry');
        return;
      }

      // Straight to the pass. The officer's next action is showing the QR to the visitor,
      // so anything between here and that screen is a step in the way.
      const entryId = result.data.entry.id;
      reset();
      router.replace(`/(security)/pass/${entryId}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not register the entry');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = () => submit();

  /** The officer turned them away after the watchlist alert. Recorded, then the form clears. */
  const handleDeny = async () => {
    try {
      setSubmitting(true);
      const token = await getIdToken();
      const result = await gateAPI.recordDenial(token, {
        visitorName: draft.visitorName.trim(),
        phone: draft.phone,
        plate: draft.hasVehicle ? draft.plate.value : undefined,
        gate: draft.gate,
        reason: 'Denied entry after a watchlist alert',
        source: isRegular ? 'recurring' : 'walkin',
      });
      if (!result.success) {
        setWatchlistError(result.message || 'Could not record the denial — try again');
        return;
      }
      setWatchlistMatches(null);
      reset();
      Alert.alert('Entry denied', 'The refusal has been recorded and admin has been alerted.');
      router.back();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (!draft.visitorName && !draft.phone && !draft.idProof.imageDataUri) {
      router.back();
      return;
    }

    Alert.alert('Discard this registration?', 'What you have entered will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  };

  const plateWarning =
    draft.hasVehicle && draft.plate.value.length >= 6 && !draft.plate.formatValid
      ? 'That is not a standard Indian plate format — check it before saving.'
      : null;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.badge}>GATE ENTRY</Text>
          <Text style={styles.title}>Register a visitor</Text>
          <Text style={styles.subtitle}>
            {isRegular
              ? 'A regular pass is reused every day it covers: scan in, scan out.'
              : 'A QR pass is issued when you submit. The visitor shows it to leave.'}
          </Text>
        </View>

        <View style={styles.chipRow}>
          {(
            [
              { key: 'single', label: 'Single visit' },
              { key: 'regular', label: 'Regular (multi-day)' },
            ] as const
          ).map((option) => {
            const isSelected = draft.passType === option.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => update({ passType: option.key })}
                style={[
                  styles.chip,
                  isSelected ? { backgroundColor: Colors.navy900 } : neuOutset(3, 6, Colors.neuSurface),
                ]}
              >
                <Text
                  style={[
                    Typography.caption,
                    { color: isSelected ? Colors.white : Colors.gray700, fontWeight: '700' },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ---- The person ---- */}
        <Text style={styles.sectionTitle}>VISITOR</Text>

        <NeuInput
          label="FULL NAME *"
          value={draft.visitorName}
          onChangeText={(text) => update({ visitorName: text })}
          placeholder="As printed on the ID"
          autoCapitalize="words"
        />

        <NeuInput
          label="MOBILE NUMBER *"
          value={draft.phone}
          onChangeText={(text) => update({ phone: text.replace(/[^\d+ ]/g, '') })}
          placeholder="10-digit number"
          keyboardType="phone-pad"
          maxLength={14}
        />

        <NeuInput
          label="EMAIL"
          value={draft.email}
          onChangeText={(text) => update({ email: text.trim() })}
          placeholder="Optional — sends the pass to their VISION account"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <NeuInput
          label="PURPOSE OF VISIT *"
          value={draft.purpose}
          onChangeText={(text) => update({ purpose: text })}
          placeholder="e.g. Meeting Dr Rao, parcel delivery, admission enquiry"
          autoCapitalize="sentences"
        />

        <NeuInput
          label="WHO ARE THEY HERE TO SEE"
          value={draft.hostName}
          onChangeText={(text) => update({ hostName: text })}
          placeholder="Name or department (optional)"
          autoCapitalize="words"
        />

        {/* ---- The party (a regular pass is for one person) ---- */}
        {!isRegular && (
        <>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>
            ACCOMPANYING PEOPLE ({draft.companions.length})
          </Text>
          <Pressable onPress={addCompanion} hitSlop={8}>
            <Text style={styles.addLink}>+ Add person</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionHint}>
          Everyone arriving together goes on one pass. The head count on the gate screen
          depends on this being right.
        </Text>

        {draft.companions.map((companion, index) => (
          <View
            key={companion.key}
            style={[styles.companionCard, neuOutset(3, 6, Colors.neuSurface)]}
          >
            <View style={styles.companionHeader}>
              <Text style={styles.companionIndex}>PERSON {index + 2}</Text>
              <Pressable onPress={() => removeCompanion(companion.key)} hitSlop={8}>
                <Text style={styles.removeLink}>Remove</Text>
              </Pressable>
            </View>

            <NeuInput
              label="NAME"
              value={companion.name}
              onChangeText={(text) => updateCompanion(companion.key, { name: text })}
              placeholder="Full name"
              autoCapitalize="words"
            />

            <View style={styles.row}>
              <NeuInput
                label="RELATION"
                value={companion.relation}
                onChangeText={(text) => updateCompanion(companion.key, { relation: text })}
                placeholder="e.g. spouse, son"
                containerStyle={styles.rowItem}
              />
              <NeuInput
                label="AGE"
                value={companion.age}
                onChangeText={(text) =>
                  updateCompanion(companion.key, { age: text.replace(/\D/g, '') })
                }
                placeholder="—"
                keyboardType="number-pad"
                maxLength={3}
                containerStyle={styles.rowItemNarrow}
              />
            </View>
          </View>
        ))}
        </>
        )}

        {/* ---- The vehicle ---- */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>VEHICLE</Text>
          <Switch
            value={draft.hasVehicle}
            onValueChange={(value) => update({ hasVehicle: value })}
            trackColor={{ false: Colors.gray300, true: Colors.orange600 }}
            thumbColor={Colors.white}
          />
        </View>

        {draft.hasVehicle && (
          <>
            <Pressable
              onPress={() => router.push('/(security)/plate-scan')}
              style={[styles.scanButton, neuOutset(4, 8, Colors.neuSurface)]}
            >
              <Icon name="camera" size={24} color={Colors.navy900} />
              <View style={styles.scanTextBlock}>
                <Text style={styles.scanTitle}>Scan the number plate</Text>
                <Text style={styles.scanSubtitle}>
                  Point the camera at the plate. You can still edit it afterwards.
                </Text>
              </View>
            </Pressable>

            <NeuInput
              label="NUMBER PLATE *"
              value={draft.plate.value}
              onChangeText={setTypedPlate}
              placeholder="AP 31 AB 1234"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={16}
              style={styles.plateInput}
            />

            {/*
              Everything the officer needs to judge the scan, and nothing more: where the
              value came from, how sure the model was, and what it originally read if it
              has since been corrected.
            */}
            {draft.plate.source !== 'manual' && (
              <View style={[styles.plateMetaCard, neuInset(2, 4, '#F3F6FA')]}>
                <Text style={styles.plateMetaLine}>
                  {draft.plate.source === 'ocr' ? 'Read by camera' : 'Read by camera, edited by you'}
                  {draft.plate.confidence !== null
                    ? `  ·  ${Math.round(draft.plate.confidence * 100)}% confident`
                    : ''}
                </Text>
                {draft.plate.ocrRaw && draft.plate.ocrRaw !== draft.plate.value && (
                  <Text style={styles.plateMetaRaw}>
                    Camera read: {draft.plate.ocrRaw}
                  </Text>
                )}
              </View>
            )}

            {plateWarning && <Text style={styles.warning}>{plateWarning}</Text>}

            <View style={styles.row}>
              <NeuInput
                label="MAKE / MODEL"
                value={draft.vehicleMake}
                onChangeText={(text) => update({ vehicleMake: text })}
                placeholder="e.g. Swift"
                containerStyle={styles.rowItem}
              />
              <NeuInput
                label="COLOUR"
                value={draft.vehicleColor}
                onChangeText={(text) => update({ vehicleColor: text })}
                placeholder="e.g. white"
                containerStyle={styles.rowItem}
              />
            </View>
          </>
        )}

        {/* ---- The ID ---- */}
        <Text style={styles.sectionTitle}>GOVERNMENT ID *</Text>

        <NeuDropdown
          label="DOCUMENT CHECKED"
          options={ID_TYPES}
          selectedValue={draft.idProof.idType || null}
          onSelect={(value) => update({ idProof: { ...draft.idProof, idType: value } })}
          placeholder="Which document did you inspect?"
        />

        <NeuInput
          label="LAST 4 CHARACTERS OF THE ID NUMBER"
          value={draft.idProof.lastFour}
          onChangeText={(text) =>
            update({
              idProof: { ...draft.idProof, lastFour: text.toUpperCase().slice(0, 4) },
            })
          }
          placeholder="Optional"
          autoCapitalize="characters"
          maxLength={4}
        />

        {/*
          Only the last four characters, never the full number. The officer has already
          verified the document in person, so storing the whole number adds identity-theft
          exposure without adding any verification value.
        */}
        <Text style={styles.sectionHint}>
          Only the last four characters are stored, never the full number.
        </Text>

        {draft.idProof.previewUri ? (
          <View style={[styles.idPreviewCard, neuOutset(3, 6, Colors.neuSurface)]}>
            <Image source={{ uri: draft.idProof.previewUri }} style={styles.idPreview} />
            <Pressable onPress={handleCaptureId} hitSlop={8}>
              <Text style={styles.retakeLink}>Retake photo</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={handleCaptureId}
            disabled={capturingId}
            style={[styles.captureButton, neuOutset(4, 8, Colors.neuSurface)]}
          >
            {capturingId ? (
              <ActivityIndicator color={Colors.navy900} />
            ) : (
              <>
                <Text style={styles.scanIcon}>🪪</Text>
                <View style={styles.scanTextBlock}>
                  <Text style={styles.scanTitle}>Photograph the ID *</Text>
                  <Text style={styles.scanSubtitle}>
                    Camera only — the photo is the record that you checked it
                  </Text>
                </View>
              </>
            )}
          </Pressable>
        )}

        {/* ---- The schedule, for a regular pass ---- */}
        {isRegular && (
          <>
            <Text style={styles.sectionTitle}>REGULAR PASS</Text>

            <Text style={styles.fieldLabel}>WHO THEY ARE</Text>
            <View style={styles.chipWrap}>
              {(Object.keys(RECURRING_CATEGORY_LABELS) as RecurringCategory[]).map((category) => {
                const isSelected = draft.regular.category === category;
                return (
                  <Pressable
                    key={category}
                    onPress={() => updateRegular({ category })}
                    style={[
                      styles.chip,
                      isSelected ? { backgroundColor: Colors.navy900 } : neuOutset(3, 6, Colors.neuSurface),
                    ]}
                  >
                    <Text
                      style={[
                        Typography.caption,
                        { color: isSelected ? Colors.white : Colors.gray700, fontWeight: '700' },
                      ]}
                    >
                      {RECURRING_CATEGORY_LABELS[category]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <NeuInput
              label="COMPANY / ORGANISATION"
              value={draft.regular.organisation}
              onChangeText={(text) => updateRegular({ organisation: text })}
              placeholder="e.g. Annapurna Caterers"
              autoCapitalize="words"
            />

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <NativeDateTimePicker
                  label="FIRST DAY"
                  mode="date"
                  value={keyToDate(draft.regular.validFrom)}
                  minimumDate={keyToDate(istToday())}
                  onChange={(date) => {
                    const validFrom = dateToKey(date);
                    updateRegular({
                      validFrom,
                      validUntil: draft.regular.validUntil < validFrom ? validFrom : draft.regular.validUntil,
                    });
                  }}
                />
              </View>
              <View style={styles.rowItem}>
                <NativeDateTimePicker
                  label="LAST DAY"
                  mode="date"
                  value={keyToDate(draft.regular.validUntil)}
                  minimumDate={keyToDate(draft.regular.validFrom)}
                  maximumDate={keyToDate(addDaysKey(draft.regular.validFrom, SECURITY_MAX_DAYS - 1))}
                  onChange={(date) => updateRegular({ validUntil: dateToKey(date) })}
                />
              </View>
            </View>
            <Text style={styles.sectionHint}>
              {daysBetweenInclusive(draft.regular.validFrom, draft.regular.validUntil)} days. The gate
              can issue up to {SECURITY_MAX_DAYS}; longer contracts go through admin.
            </Text>

            <Text style={styles.fieldLabel}>DAYS OF THE WEEK</Text>
            <View style={styles.chipWrap}>
              {WEEKDAY_SHORT.map((label, day) => {
                const isSelected = draft.regular.weekdays.includes(day);
                return (
                  <Pressable
                    key={label}
                    onPress={() =>
                      updateRegular({
                        weekdays: isSelected
                          ? draft.regular.weekdays.filter((d) => d !== day)
                          : [...draft.regular.weekdays, day].sort(),
                      })
                    }
                    style={[
                      styles.dayChip,
                      isSelected ? { backgroundColor: Colors.navy900 } : neuOutset(3, 6, Colors.neuSurface),
                    ]}
                  >
                    <Text
                      style={[
                        Typography.caption,
                        { color: isSelected ? Colors.white : Colors.gray700, fontWeight: '700' },
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <NativeDateTimePicker
                  label="DAILY FROM"
                  mode="time"
                  value={timeToDate(draft.regular.dailyStart)}
                  onChange={(date) => updateRegular({ dailyStart: toHHMM(date) })}
                />
              </View>
              <View style={styles.rowItem}>
                <NativeDateTimePicker
                  label="DAILY UNTIL"
                  mode="time"
                  value={timeToDate(draft.regular.dailyEnd)}
                  onChange={(date) => updateRegular({ dailyEnd: toHHMM(date) })}
                />
              </View>
            </View>
          </>
        )}

        {/* ---- The visit ---- */}
        <Text style={styles.sectionTitle}>PASS DETAILS</Text>

        <NeuDropdown
          label="GATE"
          options={GATES}
          selectedValue={draft.gate}
          onSelect={(value) => update({ gate: value })}
        />

        {!isRegular && <Text style={styles.fieldLabel}>VALID FOR</Text>}
        {!isRegular && (
        <View style={styles.chipRow}>
          {VALIDITY_OPTIONS.map((option) => {
            const isSelected = draft.validForHours === option.hours;

            return (
              <Pressable
                key={option.hours}
                onPress={() => update({ validForHours: option.hours })}
                style={[
                  styles.chip,
                  isSelected
                    ? { backgroundColor: Colors.navy900 }
                    : neuOutset(3, 6, Colors.neuSurface),
                ]}
              >
                <Text
                  style={[
                    Typography.caption,
                    {
                      color: isSelected ? Colors.white : Colors.gray700,
                      fontWeight: '700',
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        )}

        <NeuInput
          label="NOTES"
          value={draft.notes}
          onChangeText={(text) => update({ notes: text })}
          placeholder="Anything the next shift should know (optional)"
          multiline
          numberOfLines={3}
          style={styles.notesInput}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        {watchlistMatches ? (
          <WatchlistAlert
            matches={watchlistMatches}
            busy={submitting}
            error={watchlistError}
            onDeny={handleDeny}
            onAdmit={(reason) => submit(reason)}
          />
        ) : (
          <NeuButton
            title={isRegular ? 'Issue regular pass & check in' : 'Register & issue pass'}
            variant="accent"
            size="lg"
            fullWidth
            loading={submitting}
            onPress={handleSubmit}
            style={styles.submit}
          />
        )}

        <Pressable onPress={handleCancel} style={styles.cancelLink}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.neuBackground },
  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    paddingBottom: Spacing['3xl'],
    gap: Spacing.md,
  },
  header: { gap: 4, marginBottom: Spacing.xs },
  badge: { ...Typography.tiny, color: Colors.orange600, fontWeight: '800', letterSpacing: 1 },
  title: { ...Typography.headlineLgMobile, color: Colors.navy900, fontWeight: '800' },
  subtitle: { ...Typography.bodySm, color: Colors.gray600 },

  sectionTitle: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
    marginTop: Spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  sectionHint: { ...Typography.tiny, color: Colors.gray500, lineHeight: 15 },
  fieldLabel: { ...Typography.caption, color: Colors.gray600, marginTop: Spacing.xs },
  addLink: { ...Typography.caption, color: Colors.orange600, fontWeight: '800' },
  removeLink: { ...Typography.tiny, color: Colors.red600, fontWeight: '700' },

  row: { flexDirection: 'row', gap: Spacing.md },
  rowItem: { flex: 1 },
  rowItemNarrow: { width: 88 },

  companionCard: { padding: Spacing.md, borderRadius: Radius.lg, gap: Spacing.sm },
  companionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  companionIndex: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  captureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
    minHeight: 78,
  },
  scanTextBlock: { flex: 1, gap: 2 },
  scanTitle: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  scanSubtitle: { ...Typography.tiny, color: Colors.gray500, lineHeight: 15 },

  plateInput: {
    // A plate is read character by character and mistyped otherwise. Monospaced, large
    // and widely tracked is the difference between catching a wrong character and not.
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 20,
    letterSpacing: 2,
    fontWeight: '700',
  },
  plateMetaCard: { padding: Spacing.sm, borderRadius: Radius.md, gap: 2 },
  plateMetaLine: { ...Typography.tiny, color: Colors.gray600 },
  plateMetaRaw: {
    ...Typography.tiny,
    color: Colors.gray500,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  warning: { ...Typography.caption, color: Colors.orange600 },

  idPreviewCard: {
    padding: Spacing.md,
    borderRadius: Radius.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  idPreview: {
    width: '100%',
    height: 180,
    borderRadius: Radius.lg,
    resizeMode: 'cover',
    backgroundColor: Colors.gray100,
  },
  retakeLink: { ...Typography.caption, color: Colors.navy900, fontWeight: '800' },

  chipRow: { flexDirection: 'row', gap: Spacing.sm },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  dayChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    minWidth: 48,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },

  notesInput: { minHeight: 70, textAlignVertical: 'top' },
  error: { ...Typography.caption, color: Colors.red600 },
  submit: { marginTop: Spacing.md },
  cancelLink: { alignItems: 'center', paddingVertical: Spacing.md },
  cancelText: { ...Typography.bodySm, color: Colors.gray600 },
});
