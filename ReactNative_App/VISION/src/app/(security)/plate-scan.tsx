/**
 * Number plate scanner — security gate registration.
 *
 * The scanning itself lives in the shared `PlateScanner` component. This screen only
 * decides where an accepted plate goes: into the walk-in registration draft, as an
 * editable suggestion the officer can still correct.
 */

import React from 'react';
import { useRouter } from 'expo-router';
import { PlateScanner } from '@/components/anpr/PlateScanner';
import { useGateDraft } from '@/context/GateDraftContext';

export default function PlateScanScreen() {
  const router = useRouter();
  const { setScannedPlate } = useGateDraft();

  return (
    <PlateScanner
      onAccept={({ plate, confidence, formatValid }) => {
        setScannedPlate({ plate, confidence, formatValid, raw: plate });
        router.back();
      }}
      onCancel={() => router.back()}
    />
  );
}
