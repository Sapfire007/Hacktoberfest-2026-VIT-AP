/**
 * Government ID Upload Screen
 * 
 * Captures document photo proof per PRD.md FR-REG-05 & Design.md §5.1.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset, neuInset } from '@/constants/neumorphic';
import { NeuButton } from '@/components/ui/NeuButton';

const ID_TYPES = ['Aadhaar Card', 'Voter ID', 'Driving Licence', 'Passport', 'College ID'];

export default function GovtIdUploadScreen() {
  const router = useRouter();
  const [selectedType, setSelectedType] = useState('Aadhaar Card');
  const [photoCaptured, setPhotoCaptured] = useState(true);
  // Lorem Picsum sample document image placeholder per user instructions
  const docImageUri = 'https://picsum.photos/id/1025/600/400';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Government ID Proof</Text>
        <Text style={styles.subtitle}>Upload or capture a photo of your government-issued ID card</Text>
      </View>

      {/* ID Type Dropdown/Selector */}
      <View style={styles.selectorSection}>
        <Text style={styles.sectionLabel}>SELECT ID DOCUMENT TYPE:</Text>
        <View style={styles.typeChipsRow}>
          {ID_TYPES.map((type) => {
            const isSelected = selectedType === type;
            return (
              <Pressable
                key={type}
                onPress={() => setSelectedType(type)}
                style={[
                  styles.typeChip,
                  isSelected
                    ? { backgroundColor: Colors.navy900 }
                    : neuOutset(3, 6, Colors.neuSurface),
                ]}
              >
                <Text
                  style={[
                    Typography.caption,
                    { color: isSelected ? Colors.white : Colors.gray800, fontWeight: '700' },
                  ]}
                >
                  {type}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Document Frame / Preview */}
      <View style={styles.docFrameSection}>
        <View style={[styles.docCard, neuOutset(6, 12, Colors.neuSurface)]}>
          {photoCaptured ? (
            <Image source={{ uri: docImageUri }} style={styles.docImage} />
          ) : (
            <View style={styles.emptyDocBox}>
              <Text style={styles.cameraIcon}>📷</Text>
              <Text style={styles.docPrompt}>Position ID inside rectangle</Text>
            </View>
          )}

          <View style={styles.overlayFrame}>
            <View style={styles.cornerTL} />
            <View style={styles.cornerTR} />
            <View style={styles.cornerBL} />
            <View style={styles.cornerBR} />
          </View>
        </View>

        <View style={styles.btnRow}>
          <Pressable onPress={() => setPhotoCaptured(!photoCaptured)} style={styles.retakeBtn}>
            <Text style={styles.retakeText}>{photoCaptured ? '📷 Retake Photo' : '📸 Take Photo'}</Text>
          </Pressable>
        </View>
      </View>

      {/* Privacy Note */}
      <View style={styles.privacyNote}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.privacyText}>
          Stored securely as encrypted image proof only. Visible strictly to gate security officers.
        </Text>
      </View>

      <View style={styles.footer}>
        <NeuButton
          title="Confirm ID & Continue →"
          variant="accent"
          size="lg"
          fullWidth
          onPress={() => router.push('/(onboarding)/profile-form')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing['3xl'],
    justifyContent: 'space-between',
  },
  header: {
    gap: Spacing.xs,
  },
  title: {
    ...Typography.headlineLgMobile,
    color: Colors.navy900,
    fontWeight: '800',
  },
  subtitle: {
    ...Typography.bodyMd,
    color: Colors.gray600,
  },
  selectorSection: {
    gap: Spacing.sm,
  },
  sectionLabel: {
    ...Typography.tiny,
    color: Colors.gray600,
    letterSpacing: 0.5,
  },
  typeChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.full,
  },
  docFrameSection: {
    alignItems: 'center',
    gap: Spacing.md,
  },
  docCard: {
    width: '100%',
    height: 200,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  docImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  emptyDocBox: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  cameraIcon: {
    fontSize: 32,
    color: Colors.gray400,
  },
  docPrompt: {
    ...Typography.caption,
    color: Colors.gray500,
  },
  overlayFrame: {
    ...StyleSheet.absoluteFill,
    padding: Spacing.md,
    justifyContent: 'space-between',
  },
  cornerTL: {
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: Colors.orange600,
    position: 'absolute',
    top: 16,
    left: 16,
  },
  cornerTR: {
    width: 24,
    height: 24,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: Colors.orange600,
    position: 'absolute',
    top: 16,
    right: 16,
  },
  cornerBL: {
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: Colors.orange600,
    position: 'absolute',
    bottom: 16,
    left: 16,
  },
  cornerBR: {
    width: 24,
    height: 24,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: Colors.orange600,
    position: 'absolute',
    bottom: 16,
    right: 16,
  },
  btnRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  retakeBtn: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  retakeText: {
    ...Typography.buttonSm,
    color: Colors.navy900,
    fontWeight: '700',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.blue100,
    padding: Spacing.md,
    borderRadius: Radius.lg,
  },
  lockIcon: {
    fontSize: 16,
  },
  privacyText: {
    ...Typography.caption,
    color: Colors.blue500,
    flex: 1,
  },
  footer: {
    paddingVertical: Spacing.lg,
  },
});
