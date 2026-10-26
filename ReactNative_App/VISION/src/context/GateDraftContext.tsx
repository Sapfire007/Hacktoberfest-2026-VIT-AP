/**
 * GateDraftContext — the walk-in registration form, held above the screens that edit it.
 *
 * The registration form spans more than one screen: the officer fills in the visitor's
 * details, leaves to point the camera at a number plate, and comes back. React Native
 * unmounts the form screen during that trip, so form state held inside it is gone on
 * return — and a half-filled visitor form that clears itself because the officer used the
 * plate scanner is the kind of bug that makes people stop using the scanner.
 *
 * Lifting the draft into a provider mounted by the `(security)` layout fixes that: the
 * provider outlives every screen inside the group, so the plate scanner can write its
 * result into the draft and the form simply reads it back.
 *
 * The draft is deliberately **not** persisted to storage. It contains a photograph of a
 * government ID, and an abandoned registration should not leave one on the device after
 * the officer's shift ends.
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { addDaysKey, istToday } from '@/utils/istDate';

export interface CompanionDraft {
  /** Stable key for the list. Companions have no server identity until the entry is saved. */
  key: string;
  name: string;
  relation: string;
  age: string;
}

export interface PlateDraft {
  /** What sits in the editable field. Always what gets submitted. */
  value: string;
  /**
   * How it got there. Starts `manual`; the scanner sets `ocr`; any keystroke afterwards
   * turns it into `ocr_edited`. This is what later answers "is the plate reader actually
   * helping, or is it overruled every time?"
   */
  source: 'manual' | 'ocr' | 'ocr_edited';
  /** Recogniser confidence, when the value came from the scanner. */
  confidence: number | null;
  /** Exactly what the recogniser returned, before the officer touched it. */
  ocrRaw: string | null;
  /** Whether the read parsed as a known Indian plate format. */
  formatValid: boolean;
}

export interface IdProofDraft {
  idType: string;
  lastFour: string;
  /** Base64 data URI of the photo the officer took of the document. */
  imageDataUri: string | null;
  /** Local file URI, for showing a preview without re-encoding the base64. */
  previewUri: string | null;
}

/** A regular (multi-day) pass, when the officer chooses that instead of a single visit. */
export interface RegularDraft {
  category: 'vendor' | 'contractor' | 'driver' | 'mess_staff' | 'other';
  organisation: string;
  /** IST "YYYY-MM-DD", inclusive. */
  validFrom: string;
  validUntil: string;
  weekdays: number[];
  /** "HH:MM". */
  dailyStart: string;
  dailyEnd: string;
}

export interface GateDraft {
  /** A one-off walk-in, or a regular pass reused on the days it covers. */
  passType: 'single' | 'regular';
  visitorName: string;
  phone: string;
  /** Optional — sends the pass to the visitor's VISION account if one exists. */
  email: string;
  purpose: string;
  hostName: string;
  companions: CompanionDraft[];
  hasVehicle: boolean;
  plate: PlateDraft;
  vehicleMake: string;
  vehicleColor: string;
  idProof: IdProofDraft;
  gate: string;
  notes: string;
  validForHours: number;
  regular: RegularDraft;
}

export const EMPTY_PLATE: PlateDraft = {
  value: '',
  source: 'manual',
  confidence: null,
  ocrRaw: null,
  formatValid: false,
};

function emptyDraft(): GateDraft {
  const today = istToday();
  return {
    passType: 'single',
    visitorName: '',
    phone: '',
    email: '',
    purpose: '',
    hostName: '',
    companions: [],
    hasVehicle: false,
    plate: { ...EMPTY_PLATE },
    vehicleMake: '',
    vehicleColor: '',
    idProof: { idType: '', lastFour: '', imageDataUri: null, previewUri: null },
    gate: 'Main Gate',
    notes: '',
    // Twelve hours covers a working day's visit without letting a pass sit valid
    // overnight. The officer can extend it on the form.
    validForHours: 12,
    // A working week of mess or delivery duty is the common case.
    regular: {
      category: 'vendor',
      organisation: '',
      validFrom: today,
      validUntil: addDaysKey(today, 6),
      weekdays: [1, 2, 3, 4, 5, 6],
      dailyStart: '07:00',
      dailyEnd: '19:00',
    },
  };
}

interface GateDraftContextValue {
  draft: GateDraft;
  update: (patch: Partial<GateDraft>) => void;
  /** Set the plate from a scan result, preserving the audit fields. */
  setScannedPlate: (result: {
    plate: string;
    confidence: number;
    formatValid: boolean;
    raw: string;
  }) => void;
  /** Set the plate from the officer's typing. Flips an OCR source to `ocr_edited`. */
  setTypedPlate: (value: string) => void;
  addCompanion: () => void;
  updateCompanion: (key: string, patch: Partial<CompanionDraft>) => void;
  removeCompanion: (key: string) => void;
  reset: () => void;
}

const GateDraftContext = createContext<GateDraftContextValue | undefined>(undefined);

export function GateDraftProvider({ children }: { children: React.ReactNode }) {
  const [draft, setDraft] = useState<GateDraft>(emptyDraft);

  const update = useCallback((patch: Partial<GateDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
  }, []);

  const setScannedPlate = useCallback(
    (result: { plate: string; confidence: number; formatValid: boolean; raw: string }) => {
      setDraft((current) => ({
        ...current,
        // A scan implies a vehicle, and making the officer tick the box afterwards is a
        // step that exists only because of how the form is built.
        hasVehicle: true,
        plate: {
          value: result.plate,
          source: 'ocr',
          confidence: result.confidence,
          ocrRaw: result.raw,
          formatValid: result.formatValid,
        },
      }));
    },
    []
  );

  const setTypedPlate = useCallback((value: string) => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9 ]/g, '');

    setDraft((current) => ({
      ...current,
      plate: {
        ...current.plate,
        value: normalized,
        // Once the officer edits a scanned plate the record should say so — the stored
        // value is no longer what the model produced, and `ocrRaw` keeps what was.
        source:
          current.plate.source === 'manual'
            ? 'manual'
            : normalized === current.plate.ocrRaw
              ? 'ocr'
              : 'ocr_edited',
      },
    }));
  }, []);

  const addCompanion = useCallback(() => {
    setDraft((current) => ({
      ...current,
      companions: [
        ...current.companions,
        { key: `${Date.now()}-${current.companions.length}`, name: '', relation: '', age: '' },
      ],
    }));
  }, []);

  const updateCompanion = useCallback((key: string, patch: Partial<CompanionDraft>) => {
    setDraft((current) => ({
      ...current,
      companions: current.companions.map((companion) =>
        companion.key === key ? { ...companion, ...patch } : companion
      ),
    }));
  }, []);

  const removeCompanion = useCallback((key: string) => {
    setDraft((current) => ({
      ...current,
      companions: current.companions.filter((companion) => companion.key !== key),
    }));
  }, []);

  const reset = useCallback(() => setDraft(emptyDraft()), []);

  const value = useMemo(
    () => ({
      draft,
      update,
      setScannedPlate,
      setTypedPlate,
      addCompanion,
      updateCompanion,
      removeCompanion,
      reset,
    }),
    [draft, update, setScannedPlate, setTypedPlate, addCompanion, updateCompanion, removeCompanion, reset]
  );

  return <GateDraftContext.Provider value={value}>{children}</GateDraftContext.Provider>;
}

export function useGateDraft(): GateDraftContextValue {
  const context = useContext(GateDraftContext);
  if (!context) {
    throw new Error('useGateDraft must be used inside the (security) route group');
  }
  return context;
}
