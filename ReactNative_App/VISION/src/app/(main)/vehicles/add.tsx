/**
 * Add Vehicle Form Screen
 *
 * The number plate is read with the camera (ANPR) and lands in an ordinary text field,
 * so a wrong read can always be corrected by hand. The scanner opens as a full-screen
 * modal rather than a route, so nothing already typed on this form is lost.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/colors';
import { Typography } from '@/constants/typography';
import { Spacing, Radius, neuOutset } from '@/constants/neumorphic';
import { NeuHeader } from '@/components/ui/NeuHeader';
import { NeuInput } from '@/components/ui/NeuInput';
import { NeuButton } from '@/components/ui/NeuButton';
import { PlateScanner, AcceptedPlate } from '@/components/anpr/PlateScanner';
import { useApp } from '@/context/AppContext';

export default function AddVehicleScreen() {
  const router = useRouter();
  const { addVehicle } = useApp();

  const [plateNumber, setPlateNumber] = useState('');
  const [vehicleType, setVehicleType] = useState<'2-wheeler' | '4-wheeler' | 'other'>('4-wheeler');
  const [model, setModel] = useState('Honda City');
  const [color, setColor] = useState('Silver');
  const [isDefault, setIsDefault] = useState(true);

  const [scannerOpen, setScannerOpen] = useState(false);
  /** The last camera read, kept so the form can say whether the field was edited since. */
  const [scanned, setScanned] = useState<AcceptedPlate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = (result: AcceptedPlate) => {
    setPlateNumber(result.display);
    setScanned(result);
    setError(null);
    setScannerOpen(false);
  };

  const handlePlateChange = (text: string) => {
    setPlateNumber(text.toUpperCase().replace(/[^A-Z0-9 ]/g, ''));
  };

  const handleSubmit = () => {
    if (plateNumber.replace(/\s/g, '').length < 6) {
      setError('Scan the number plate or type it in');
      return;
    }

    addVehicle({
      plateNumber: plateNumber.trim(),
      vehicleType,
      model,
      color,
      isDefault,
    });
    router.push('/(main)/vehicles');
  };

  const editedAfterScan =
    scanned !== null &&
    plateNumber.replace(/\s/g, '') !== scanned.plate.replace(/\s/g, '');

  return (
    <View style={styles.container}>
      <NeuHeader title="Add Vehicle" showLogo={false} />

      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => setScannerOpen(true)}
          style={[styles.scanButton, neuOutset(4, 8, Colors.neuSurface)]}
        >
          <Text style={styles.scanIcon}>📷</Text>
          <View style={styles.scanTextBlock}>
            <Text style={styles.scanTitle}>
              {scanned ? 'Scan the number plate again' : 'Scan the number plate'}
            </Text>
            <Text style={styles.scanSubtitle}>
              Point the camera at your plate. You can edit the result.
            </Text>
          </View>
        </Pressable>

        <NeuInput
          label="NUMBER PLATE"
          value={plateNumber}
          onChangeText={handlePlateChange}
          placeholder="Scan above, or type it in"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={16}
        />

        {scanned && (
          <Text style={styles.scanMeta}>
            {editedAfterScan
              ? `Edited — camera read ${scanned.display}`
              : `Read by camera · ${Math.round(scanned.confidence * 100)}% confident`}
            {!scanned.formatValid && !editedAfterScan
              ? ' · not a standard Indian format, check it'
              : ''}
          </Text>
        )}

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.section}>
          <Text style={styles.label}>VEHICLE TYPE:</Text>
          <View style={styles.typeRow}>
            {(['4-wheeler', '2-wheeler', 'other'] as const).map((t) => {
              const isSelected = vehicleType === t;
              return (
                <Pressable
                  key={t}
                  onPress={() => setVehicleType(t)}
                  style={[
                    styles.typeChip,
                    isSelected
                      ? { backgroundColor: Colors.navy900 }
                      : neuOutset(3, 6, Colors.neuSurface),
                  ]}
                >
                  <Text style={[Typography.caption, { color: isSelected ? Colors.white : Colors.gray800, fontWeight: '700' }]}>
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <NeuInput
          label="VEHICLE MODEL / MAKE"
          value={model}
          onChangeText={setModel}
          placeholder="e.g. Hyundai Creta / Honda Activa"
        />

        <NeuInput
          label="VEHICLE COLOR"
          value={color}
          onChangeText={setColor}
          placeholder="e.g. White / Black"
        />

        <NeuButton
          title="Save Vehicle →"
          variant="accent"
          size="lg"
          fullWidth
          onPress={handleSubmit}
          style={{ marginTop: Spacing.md }}
        />
      </ScrollView>

      <Modal
        visible={scannerOpen}
        animationType="slide"
        onRequestClose={() => setScannerOpen(false)}
      >
        {/* Mounted only while open, so the camera is released as soon as it closes. */}
        {scannerOpen && (
          <PlateScanner onAccept={handleAccept} onCancel={() => setScannerOpen(false)} />
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neuBackground,
  },
  formContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    gap: Spacing.lg,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    borderRadius: Radius.xl,
    gap: Spacing.md,
  },
  scanIcon: { fontSize: 26 },
  scanTextBlock: { flex: 1, gap: 2 },
  scanTitle: { ...Typography.bodyMd, color: Colors.navy900, fontWeight: '800' },
  scanSubtitle: { ...Typography.tiny, color: Colors.gray500, lineHeight: 15 },
  scanMeta: { ...Typography.caption, color: Colors.gray600, marginTop: -Spacing.sm },
  error: { ...Typography.caption, color: Colors.red600, marginTop: -Spacing.sm },
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
    flexDirection: 'row',
    gap: Spacing.md,
  },
  typeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    flex: 1,
    alignItems: 'center',
  },
});
