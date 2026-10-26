/**
 * Reports: the daily visitor register (CSV, PDF) and the gate log (CSV).
 *
 * Downloads use short-lived signed links rather than the usual bearer header, because the
 * file is opened by a browser — the phone's, or the admin's on a laptop — which cannot
 * attach one. An admin asks the API for a link (authenticated, admin-only); the link is
 * good for five minutes, for that one report, and every use is audited.
 */

import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { Timestamp } from 'firebase-admin/firestore';
import {
  daysInclusive,
  formatIstTime,
  isDateKey,
  istDateKey,
  istDayEnd,
  istDayStart,
} from '../core/ist';
import { listEntriesInRange } from './gate.service';
import { listEvents } from './gate-log.service';
import { GateEntry } from '../types';

export type ReportKind = 'register-csv' | 'register-pdf' | 'log-csv';
export const REPORT_KINDS: ReportKind[] = ['register-csv', 'register-pdf', 'log-csv'];

const LINK_TTL_SECONDS = 5 * 60;
const MAX_LOG_DAYS = 31;

export class ReportError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'ReportError';
  }
}

// =========================================
// Signed download links
// =========================================

export interface ReportLinkClaims {
  kind: ReportKind;
  from: string;
  to: string;
  /** The admin who asked, for the audit row written on download. */
  uid: string;
  employeeId: string | null;
  exp: number;
}

/**
 * A key of its own, derived from the gate-pass secret with a label, so a report link can
 * never be passed off as a gate pass or the other way round.
 */
function linkKey(): Buffer {
  const secret = process.env.GATE_PASS_SECRET;
  if (!secret || secret.length < 32) throw new Error('GATE_PASS_SECRET is missing or too short');
  return crypto.createHmac('sha256', secret).update('vision-report-link-v1').digest();
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function signReportLink(claims: Omit<ReportLinkClaims, 'exp'>, now = new Date()): string {
  const payload = b64url(
    JSON.stringify({ ...claims, exp: Math.floor(now.getTime() / 1000) + LINK_TTL_SECONDS })
  );
  const signature = b64url(crypto.createHmac('sha256', linkKey()).update(payload).digest());
  return `${payload}.${signature}`;
}

export function verifyReportLink(token: string, now = new Date()): ReportLinkClaims | null {
  const [payload, signature] = String(token || '').split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(b64url(crypto.createHmac('sha256', linkKey()).update(payload).digest()));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  try {
    const claims = JSON.parse(
      Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as ReportLinkClaims;
    if (!REPORT_KINDS.includes(claims.kind) || claims.exp * 1000 < now.getTime()) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Check a requested report before signing a link for it. */
export function validateReportRequest(kind: unknown, fromRaw: unknown, toRaw: unknown) {
  if (!REPORT_KINDS.includes(kind as ReportKind)) throw new ReportError('Unknown report');
  const today = istDateKey(new Date());
  const from = isDateKey(fromRaw) ? fromRaw : today;
  const to = kind === 'log-csv' ? (isDateKey(toRaw) ? toRaw : from) : from;
  if (from > to) throw new ReportError('The start date must be on or before the end date');
  if (daysInclusive(from, to) > MAX_LOG_DAYS) {
    throw new ReportError(`Export at most ${MAX_LOG_DAYS} days at a time`);
  }
  return { kind: kind as ReportKind, from, to };
}

// =========================================
// CSV
// =========================================

/**
 * One CSV cell. Quoted when needed, and a leading `= + - @` is neutralised: the register
 * is opened in Excel by administrators, and a visitor who types `=HYPERLINK(...)` as their
 * name should not get a formula executed on an admin's machine.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // Byte-order mark so Excel reads UTF-8 names (Telugu, Hindi) correctly.
  return '﻿' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// =========================================
// The daily register
// =========================================

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

const SOURCE_LABEL: Record<string, string> = { walkin: 'Walk-in', permit: 'Permit', recurring: 'Regular' };

export interface RegisterRow {
  passCode: string;
  name: string;
  phone: string;
  party: number;
  vehicle: string;
  source: string;
  hostOrPurpose: string;
  gate: string;
  inTime: string;
  outTime: string;
  duration: string;
  officerIn: string;
  officerOut: string;
  flags: string;
}

export function registerRows(entries: GateEntry[], now = new Date()): RegisterRow[] {
  return [...entries]
    .sort((a, b) => (toDate(a.entryAt)?.getTime() ?? 0) - (toDate(b.entryAt)?.getTime() ?? 0))
    .map((e) => {
      const entryAt = toDate(e.entryAt);
      const exitAt = toDate(e.exitAt);
      const expiresAt = toDate(e.expiresAt);
      const minutes = entryAt && exitAt ? Math.round((exitAt.getTime() - entryAt.getTime()) / 60000) : null;
      const flags = [
        e.status === 'on_campus' && expiresAt && expiresAt < now ? 'OVERSTAY' : '',
        e.status === 'on_campus' ? 'Still inside' : '',
        e.watchlistOverride ? `Watchlist override: ${e.watchlistOverride.reason}` : '',
      ]
        .filter(Boolean)
        .join('; ');

      return {
        passCode: e.passCode,
        name: e.visitorName,
        phone: e.phone,
        party: e.partySize,
        vehicle: e.vehicle?.plate ?? '',
        source: SOURCE_LABEL[e.source ?? 'walkin'] ?? 'Walk-in',
        hostOrPurpose: [e.hostName, e.purpose].filter(Boolean).join(' — '),
        gate: e.gate ?? '',
        inTime: entryAt ? formatIstTime(entryAt) : '',
        outTime: exitAt ? formatIstTime(exitAt) : '',
        duration: minutes === null ? '' : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`,
        officerIn: e.registeredByEmployeeId,
        officerOut: e.exitedByEmployeeId ?? '',
        flags,
      };
    });
}

const REGISTER_HEADERS = [
  'Pass code', 'Name', 'Phone', 'Party', 'Vehicle', 'Type', 'Host / purpose', 'Gate',
  'In', 'Out', 'Duration', 'Officer in', 'Officer out', 'Flags',
];

function rowValues(r: RegisterRow): unknown[] {
  return [r.passCode, r.name, r.phone, r.party, r.vehicle, r.source, r.hostOrPurpose, r.gate,
    r.inTime, r.outTime, r.duration, r.officerIn, r.officerOut, r.flags];
}

export async function registerForDay(date: string): Promise<RegisterRow[]> {
  const entries = await listEntriesInRange(istDayStart(date), istDayEnd(date), 10000);
  return registerRows(entries);
}

export function registerCsv(rows: RegisterRow[]): string {
  return toCsv(REGISTER_HEADERS, rows.map(rowValues));
}

/** The register as an A4 landscape PDF: header, totals, one row per visit. */
export function registerPdf(date: string, rows: RegisterRow[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 28 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const people = rows.reduce((total, r) => total + r.party, 0);
    const inside = rows.filter((r) => r.flags.includes('Still inside')).length;
    const overstays = rows.filter((r) => r.flags.includes('OVERSTAY')).length;

    doc.font('Helvetica-Bold').fontSize(15).text('VISION — Daily Visitor Register', { continued: false });
    doc.font('Helvetica').fontSize(9).fillColor('#444')
      .text(`VIT-AP University  ·  ${date}  ·  generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
    doc.moveDown(0.3);
    doc.fillColor('#000').fontSize(10)
      .text(`Visits: ${rows.length}    People: ${people}    Still inside: ${inside}    Overstays: ${overstays}`);
    doc.moveDown(0.6);

    // Column widths sum to the printable width (842 - 56 = 786).
    const columns: { key: keyof RegisterRow; label: string; width: number }[] = [
      { key: 'passCode', label: 'Pass', width: 72 },
      { key: 'name', label: 'Name', width: 100 },
      { key: 'phone', label: 'Phone', width: 64 },
      { key: 'party', label: 'Pty', width: 22 },
      { key: 'vehicle', label: 'Vehicle', width: 64 },
      { key: 'source', label: 'Type', width: 44 },
      { key: 'hostOrPurpose', label: 'Host / purpose', width: 130 },
      { key: 'gate', label: 'Gate', width: 56 },
      { key: 'inTime', label: 'In', width: 32 },
      { key: 'outTime', label: 'Out', width: 32 },
      { key: 'duration', label: 'Dur.', width: 40 },
      { key: 'officerIn', label: 'Officer', width: 56 },
      { key: 'flags', label: 'Flags', width: 74 },
    ];
    const left = doc.page.margins.left;
    const bottom = doc.page.height - doc.page.margins.bottom;

    const drawHeader = () => {
      let x = left;
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(7.5);
      for (const col of columns) {
        doc.text(col.label, x + 2, y, { width: col.width - 4, lineBreak: false });
        x += col.width;
      }
      doc.moveTo(left, y + 11).lineTo(left + 786, y + 11).strokeColor('#999').stroke();
      doc.y = y + 14;
    };

    drawHeader();
    doc.font('Helvetica').fontSize(7.5);

    if (rows.length === 0) {
      doc.text('No visits were recorded on this day.', left, doc.y + 6);
    }

    for (const row of rows) {
      const height =
        Math.max(
          ...columns.map((col) =>
            doc.heightOfString(String(row[col.key] ?? ''), { width: col.width - 4 })
          )
        ) + 4;

      if (doc.y + height > bottom) {
        doc.addPage();
        drawHeader();
        doc.font('Helvetica').fontSize(7.5);
      }

      const y = doc.y;
      let x = left;
      doc.fillColor(row.flags.includes('OVERSTAY') ? '#B00020' : '#000');
      for (const col of columns) {
        doc.text(String(row[col.key] ?? ''), x + 2, y + 2, { width: col.width - 4 });
        x += col.width;
      }
      doc.fillColor('#000');
      doc.moveTo(left, y + height).lineTo(left + 786, y + height).strokeColor('#e3e3e3').stroke();
      doc.y = y + height;
    }

    doc.end();
  });
}

// =========================================
// Gate log CSV
// =========================================

export async function gateLogCsv(from: string, to: string): Promise<string> {
  const events = await listEvents({ from: istDayStart(from), to: istDayEnd(to), limit: 5000 });
  const rows = [...events]
    .reverse()
    .map((e) => {
      const at = e.at ? new Date(e.at) : null;
      return [
        at ? istDateKey(at) : '',
        at ? formatIstTime(at) : '',
        e.type,
        e.visitorName,
        e.phone,
        e.partySize,
        e.plate,
        e.passCode,
        e.source ? SOURCE_LABEL[e.source] : '',
        e.gate,
        e.officerEmployeeId,
        e.flagged ? 'yes' : '',
        e.note,
      ];
    });
  return toCsv(
    ['Date', 'Time', 'Event', 'Name', 'Phone', 'Party', 'Vehicle', 'Pass code', 'Type', 'Gate', 'Officer', 'Watchlist', 'Note'],
    rows
  );
}

export function reportFilename(kind: ReportKind, from: string, to: string): string {
  if (kind === 'log-csv') return `vision-gate-log_${from}${to !== from ? `_to_${to}` : ''}.csv`;
  return `vision-register_${from}.${kind === 'register-pdf' ? 'pdf' : 'csv'}`;
}

