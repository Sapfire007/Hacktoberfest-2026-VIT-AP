/**
 * Gate analytics for the admin dashboard (PRD.md FR-RPT-03).
 *
 * Computed on request from the gate entries in the chosen range, rather than kept as
 * running counters: a campus has thousands of entries a week, not millions, and computing
 * from the records means the figures can never drift from the data they describe.
 * `computeAnalytics` is pure so it can be tested on fixtures.
 */

import { Timestamp } from 'firebase-admin/firestore';
import { addDays, daysInclusive, istDateKey, istDayEnd, istDayStart, istHour, isDateKey } from '../core/ist';
import { listEntriesInRange } from './gate.service';
import { listAlerts, PublicAlert } from './gate-log.service';
import { GateEntry } from '../types';

export const MAX_RANGE_DAYS = 92;

export class AnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalyticsError';
  }
}

export interface Analytics {
  range: { from: string; to: string; days: number };
  totals: {
    visits: number;
    people: number;
    uniqueVisitors: number;
    exited: number;
    stillInside: number;
    overstaysNow: number;
    vehicles: number;
  };
  byDay: { date: string; visits: number; people: number }[];
  byHour: { hour: number; visits: number }[];
  peakHours: { hour: number; visits: number }[];
  byGate: { gate: string; visits: number }[];
  bySource: { source: string; visits: number }[];
  byCategory: { category: string; visits: number }[];
  duration: { averageMinutes: number | null; medianMinutes: number | null; p90Minutes: number | null; measured: number };
  ocr: {
    vehicles: number;
    manual: number;
    acceptedAsRead: number;
    corrected: number;
    /** Share of camera reads the officer accepted unchanged. Null with no camera reads. */
    acceptanceRate: number | null;
    meanConfidence: number | null;
  };
  watchlist: { hits: number; overrides: number; denials: number };
  truncated: boolean;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function countBy<T>(items: T[], key: (item: T) => string): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([k, count]) => ({ key: k, count }))
    .sort((a, b) => b.count - a.count);
}

const SOURCE_LABELS: Record<string, string> = {
  walkin: 'Walk-in',
  permit: 'Pre-approved permit',
  recurring: 'Regular pass',
};

export function computeAnalytics(
  entries: GateEntry[],
  alerts: Pick<PublicAlert, 'type'>[],
  range: { from: string; to: string },
  now: Date = new Date(),
  truncated = false
): Analytics {
  const days = daysInclusive(range.from, range.to);

  const byDayMap = new Map<string, { visits: number; people: number }>();
  for (let i = 0; i < days; i++) byDayMap.set(addDays(range.from, i), { visits: 0, people: 0 });
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0 }));

  const durations: number[] = [];
  const phones = new Set<string>();
  let people = 0;
  let exited = 0;
  let stillInside = 0;
  let overstaysNow = 0;

  const ocr = { vehicles: 0, manual: 0, acceptedAsRead: 0, corrected: 0 };
  const confidences: number[] = [];

  for (const entry of entries) {
    const entryAt = toDate(entry.entryAt);
    if (!entryAt) continue;

    people += entry.partySize || 1;
    if (entry.phone) phones.add(entry.phone);

    const day = byDayMap.get(istDateKey(entryAt));
    if (day) {
      day.visits += 1;
      day.people += entry.partySize || 1;
    }
    byHour[istHour(entryAt)].visits += 1;

    const exitAt = toDate(entry.exitAt);
    if (entry.status === 'exited' && exitAt) {
      exited += 1;
      durations.push(Math.max(0, Math.round((exitAt.getTime() - entryAt.getTime()) / 60000)));
    } else if (entry.status === 'on_campus') {
      stillInside += 1;
      const expiresAt = toDate(entry.expiresAt);
      if (expiresAt && expiresAt.getTime() < now.getTime()) overstaysNow += 1;
    }

    if (entry.vehicle?.plate) {
      ocr.vehicles += 1;
      if (entry.vehicle.source === 'ocr') ocr.acceptedAsRead += 1;
      else if (entry.vehicle.source === 'ocr_edited') ocr.corrected += 1;
      else ocr.manual += 1;
      if (entry.vehicle.source !== 'manual' && typeof entry.vehicle.confidence === 'number') {
        confidences.push(entry.vehicle.confidence);
      }
    }
  }

  durations.sort((a, b) => a - b);
  const scanned = ocr.acceptedAsRead + ocr.corrected;

  return {
    range: { ...range, days },
    totals: {
      visits: entries.length,
      people,
      uniqueVisitors: phones.size,
      exited,
      stillInside,
      overstaysNow,
      vehicles: ocr.vehicles,
    },
    byDay: [...byDayMap.entries()].map(([date, v]) => ({ date, ...v })),
    byHour,
    peakHours: [...byHour]
      .filter((h) => h.visits > 0)
      .sort((a, b) => b.visits - a.visits || a.hour - b.hour)
      .slice(0, 3),
    byGate: countBy(entries, (e) => e.gate || 'Not recorded').map((r) => ({ gate: r.key, visits: r.count })),
    bySource: countBy(entries, (e) => SOURCE_LABELS[e.source ?? 'walkin'] ?? 'Walk-in').map((r) => ({
      source: r.key,
      visits: r.count,
    })),
    byCategory: countBy(entries, (e) => {
      if (e.source === 'permit') return 'Pre-approved visitor';
      if (e.source === 'recurring') return 'Regular (vendor / staff)';
      return e.visitorSubtype ? String(e.visitorSubtype).replace(/_/g, ' ') : 'Walk-in (unspecified)';
    }).map((r) => ({ category: r.key, visits: r.count })),
    duration: {
      averageMinutes: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : null,
      medianMinutes: percentile(durations, 50),
      p90Minutes: percentile(durations, 90),
      measured: durations.length,
    },
    ocr: {
      ...ocr,
      acceptanceRate: scanned ? Math.round((ocr.acceptedAsRead / scanned) * 1000) / 1000 : null,
      meanConfidence: confidences.length
        ? Math.round((confidences.reduce((a, b) => a + b, 0) / confidences.length) * 1000) / 1000
        : null,
    },
    watchlist: {
      hits: alerts.filter((a) => a.type === 'watchlist_hit').length,
      overrides: alerts.filter((a) => a.type === 'watchlist_override').length,
      denials: alerts.filter((a) => a.type === 'watchlist_denied').length,
    },
    truncated,
  };
}

/** Validate a date range from query strings; defaults to the last 7 days. */
export function parseRange(fromRaw: unknown, toRaw: unknown, now = new Date()): { from: string; to: string } {
  const today = istDateKey(now);
  const to = isDateKey(toRaw) ? toRaw : today;
  const from = isDateKey(fromRaw) ? fromRaw : addDays(to, -6);
  if (from > to) throw new AnalyticsError('The start date must be on or before the end date');
  if (daysInclusive(from, to) > MAX_RANGE_DAYS) {
    throw new AnalyticsError(`Choose a range of at most ${MAX_RANGE_DAYS} days`);
  }
  return { from, to };
}

const ENTRY_CAP = 10000;

export async function getAnalytics(range: { from: string; to: string }): Promise<Analytics> {
  const start = istDayStart(range.from);
  const end = istDayEnd(range.to);
  const [entries, alerts] = await Promise.all([
    listEntriesInRange(start, end, ENTRY_CAP),
    listAlerts({ from: start, limit: 2000 }),
  ]);
  const inRange = alerts.filter((a) => a.at && new Date(a.at) < end);
  return computeAnalytics(entries, inRange, range, new Date(), entries.length >= ENTRY_CAP);
}
