/**
 * Gate passes in the visitor's own account.
 *
 * When security registers a visitor who has a VISION account — matched by verified email,
 * or by phone once the officer confirms — the pass also appears here, with its QR. So do
 * regular (multi-day) passes issued to them. Each open pass comes with a freshly signed QR
 * token from the server; nothing here can mint or alter one.
 */

import { API_BASE_URL } from '@/config/backend';
import { firebaseAuth } from '@/services/firebase.auth';
import type { GateEntry, RecurringPass } from '@/services/gate.api';

export interface GatePassItem {
  /** Unique across both kinds, for lists and routes: `walkin-<entryId>` or `regular-<passId>`. */
  key: string;
  kind: 'walkin' | 'regular';
  title: string;
  passCode: string;
  /** The QR contents, or null when the pass is no longer usable. */
  qr: string | null;
  /** One line: "On campus", "Signed out 4:12 pm", "Mon–Sat, 07:00–19:00". */
  status: string;
  active: boolean;
  entry?: GateEntry;
  regular?: RecurringPass;
}

function time(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : '';
}

export async function fetchMyGatePasses(): Promise<GatePassItem[]> {
  const idToken = await firebaseAuth.getIdToken();
  if (!idToken) return [];

  const response = await fetch(`${API_BASE_URL}/passes/mine`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.message || body.error || 'Could not load your passes');
  }

  const entries: { entry: GateEntry; passToken: string | null }[] = body.data?.entries ?? [];
  const regular: { pass: RecurringPass; passToken: string | null }[] = body.data?.recurring ?? [];

  return [
    ...regular.map(({ pass, passToken }) => ({
      key: `regular-${pass.id}`,
      kind: 'regular' as const,
      title: pass.organisation ? `Regular pass · ${pass.organisation}` : 'Regular pass',
      passCode: pass.passCode,
      qr: passToken,
      status: pass.onCampus ? 'On campus now' : pass.schedule,
      active: pass.status === 'active',
      regular: pass,
    })),
    ...entries.map(({ entry, passToken }) => ({
      key: `walkin-${entry.id}`,
      kind: 'walkin' as const,
      title: entry.hostName ? `Gate pass · ${entry.hostName}` : `Gate pass · ${entry.purpose}`,
      passCode: entry.passCode,
      qr: passToken,
      status:
        entry.status === 'on_campus'
          ? entry.overstay
            ? 'Pass expired — please sign out at the gate'
            : `On campus · valid until ${time(entry.expiresAt)}`
          : `Signed out ${time(entry.exitAt)}`,
      active: entry.status === 'on_campus',
      entry,
    })),
  ];
}
