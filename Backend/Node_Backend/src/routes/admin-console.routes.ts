/**
 * Admin Console Routes - /api/admin/*
 *
 * Overview, gate records and the entry/exit log, requester accounts, the watchlist,
 * analytics, reports and the audit log. Admin role only: this router is mounted *inside*
 * admin.routes.ts, after that router's authentication and admin-role guard, so the guard
 * runs once per request. Never mount it anywhere else.
 *
 * The one public route, the report download, lives in `reportDownloadRouter` below: it is
 * opened by a browser that cannot send a bearer token, and is protected by a signed,
 * five-minute link instead.
 */

import { Router, Request, Response } from 'express';
import { publicLimiter } from '../middleware/rateLimit.middleware';
import { istDayEnd, istDayStart } from '../core/ist';
import * as gateService from '../services/gate.service';
import { listEvents, listEventsForEntry, GateEventType } from '../services/gate-log.service';
import { getRecurringIdPhoto } from '../services/recurring.service';
import {
  addToWatchlist,
  clearWatchlistEntry,
  listWatchlist,
  WatchlistError,
} from '../services/watchlist.service';
import { getAnalytics, parseRange, AnalyticsError } from '../services/analytics.service';
import {
  gateLogCsv,
  registerCsv,
  registerForDay,
  registerPdf,
  reportFilename,
  ReportError,
  signReportLink,
  validateReportRequest,
  verifyReportLink,
} from '../services/report.service';
import {
  AdminConsoleError,
  getOverview,
  listRequesters,
  setRequesterSuspended,
} from '../services/admin-console.service';
import { listAudit, recordAudit } from '../services/audit.service';
import { AuthenticatedRequest, ApiResponse, GateEntry } from '../types';

const router = Router();

function actorFrom(req: AuthenticatedRequest) {
  return {
    uid: req.user!.uid,
    employeeId: req.user!.employeeId || null,
    role: req.user!.role ?? null,
  };
}

function sendError(res: Response, error: unknown, fallback: string): void {
  if (
    error instanceof WatchlistError ||
    error instanceof AnalyticsError ||
    error instanceof ReportError ||
    error instanceof AdminConsoleError
  ) {
    const status = 'statusCode' in error ? (error as { statusCode: number }).statusCode : 400;
    res.status(status).json({ success: false, error: error.message } as ApiResponse);
    return;
  }
  console.error(`${fallback}:`, (error as Error).message);
  res.status(500).json({ success: false, error: fallback } as ApiResponse);
}

/** GET /api/admin/overview — the live dashboard. */
router.get('/overview', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ success: true, data: await getOverview() } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the overview');
  }
});

// =========================================
// Gate records and the entry/exit log
// =========================================

/** GET /api/admin/gate/events?from&to&type&gate&q — who came in, went out, was turned away. */
router.get('/gate/events', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const range = parseRange(req.query.from, req.query.to);
    const type = String(req.query.type || '');
    const events = await listEvents({
      from: istDayStart(range.from),
      to: istDayEnd(range.to),
      type: ['entry', 'exit', 'denied'].includes(type) ? (type as GateEventType) : undefined,
      gate: req.query.gate ? String(req.query.gate) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      limit: 1000,
    });
    res.json({ success: true, data: { range, events } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the gate log');
  }
});

/** GET /api/admin/gate/entries?from&to&status&source&q — visit records. */
router.get('/gate/entries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const range = parseRange(req.query.from, req.query.to);
    const status = String(req.query.status || '');
    const source = String(req.query.source || '');
    const q = String(req.query.q || '').trim().toLowerCase();

    const raw = await gateService.listEntriesInRange(istDayStart(range.from), istDayEnd(range.to), 5000);
    const now = new Date();
    const entries = raw
      .map((entry: GateEntry) => gateService.toPublic(entry, now))
      .filter((e) => !status || (status === 'overstay' ? e.overstay : e.status === status))
      .filter((e) => !source || e.source === source)
      .filter(
        (e) =>
          !q ||
          e.visitorName.toLowerCase().includes(q) ||
          e.passCode.toLowerCase().includes(q) ||
          e.phone.includes(q) ||
          (e.vehicle?.plate ?? '').toLowerCase().includes(q.replace(/[^a-z0-9]/g, ''))
      )
      .slice(0, 1000);

    res.json({ success: true, data: { range, entries } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load gate records');
  }
});

/** GET /api/admin/gate/entries/:id — one record and its log rows. */
router.get('/gate/entries/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = await gateService.getEntry(req.params.id);
    if (!entry) {
      res.status(404).json({ success: false, error: 'Record not found' } as ApiResponse);
      return;
    }
    const events = await listEventsForEntry(req.params.id);
    res.json({ success: true, data: { entry, events } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the record');
  }
});

/**
 * GET /api/admin/gate/entries/:id/id-photo
 * The ID photo the officer took. The most sensitive thing in the system, so every view is
 * written to the audit log.
 */
router.get('/gate/entries/:id/id-photo', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const photo = await gateService.getEntryIdPhoto(req.params.id);
    if (!photo || (!photo.imageDataUri && !photo.storageUri)) {
      res.status(404).json({ success: false, error: 'No ID photo on this record' } as ApiResponse);
      return;
    }
    await recordAudit({
      actor: actorFrom(req),
      action: 'record.id_photo_view',
      targetType: 'gate_entries',
      targetId: req.params.id,
      summary: `Viewed the ID photo of ${photo.visitorName}`,
    });
    res.json({ success: true, data: photo } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the photo');
  }
});

/** GET /api/admin/passes/recurring/:id/id-photo — same rule for a regular pass. */
router.get('/passes/recurring/:id/id-photo', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const photo = await getRecurringIdPhoto(req.params.id);
    if (!photo?.imageDataUri) {
      res.status(404).json({ success: false, error: 'No ID photo on this pass' } as ApiResponse);
      return;
    }
    await recordAudit({
      actor: actorFrom(req),
      action: 'record.id_photo_view',
      targetType: 'recurring_passes',
      targetId: req.params.id,
      summary: `Viewed the ID photo of ${photo.holderName}`,
    });
    res.json({ success: true, data: photo } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the photo');
  }
});

// =========================================
// Requester accounts
// =========================================

router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await listRequesters({
      q: req.query.q ? String(req.query.q) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
    });
    res.json({ success: true, data: { users } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load accounts');
  }
});

router.post('/users/:uid/suspend', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await setRequesterSuspended(req.params.uid, true, String(req.body?.reason || ''), actorFrom(req));
    res.json({ success: true, message: 'Account suspended', data: { user } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not suspend the account');
  }
});

router.post('/users/:uid/reactivate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await setRequesterSuspended(req.params.uid, false, String(req.body?.reason || ''), actorFrom(req));
    res.json({ success: true, message: 'Account reactivated', data: { user } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not reactivate the account');
  }
});

// =========================================
// Watchlist
// =========================================

router.get('/watchlist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entries = await listWatchlist(req.query.active === 'true');
    res.json({ success: true, data: { entries } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the watchlist');
  }
});

router.post('/watchlist', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = await addToWatchlist(req.body ?? {}, actorFrom(req));
    res.status(201).json({ success: true, message: 'Added to the watchlist', data: { entry } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not add to the watchlist');
  }
});

router.post('/watchlist/:id/clear', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = await clearWatchlistEntry(req.params.id, String(req.body?.reason || ''), actorFrom(req));
    res.json({ success: true, message: 'Flag cleared', data: { entry } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not clear the flag');
  }
});

// =========================================
// Analytics, reports, audit
// =========================================

router.get('/analytics', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const range = parseRange(req.query.from, req.query.to);
    res.json({ success: true, data: await getAnalytics(range) } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not compute analytics');
  }
});

/**
 * POST /api/admin/reports/link   Body: { kind, from, to? }
 * A five-minute download link for one report.
 */
router.post('/reports/link', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const request = validateReportRequest(req.body?.kind, req.body?.from, req.body?.to);
    const token = signReportLink({
      ...request,
      uid: req.user!.uid,
      employeeId: req.user!.employeeId || null,
    });
    res.json({
      success: true,
      data: {
        url: `${req.protocol}://${req.get('host')}/api/reports/download?t=${encodeURIComponent(token)}`,
        filename: reportFilename(request.kind, request.from, request.to),
        expiresInSeconds: 300,
      },
    } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not prepare the report');
  }
});

router.get('/audit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const rows = await listAudit({
      before: req.query.before ? String(req.query.before) : undefined,
      action: req.query.action ? String(req.query.action) : undefined,
      limit: 100,
    });
    res.json({ success: true, data: { rows } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the audit log');
  }
});

export default router;

// =========================================
// Public: report download by signed link
// =========================================

export const reportDownloadRouter = Router();

/** GET /api/reports/download?t=<signed link> */
reportDownloadRouter.get('/download', publicLimiter, async (req: Request, res: Response) => {
  const claims = verifyReportLink(String(req.query.t || ''));
  if (!claims) {
    res
      .status(403)
      .type('text/plain')
      .send('This download link has expired or is not valid. Generate a new one from the admin console.');
    return;
  }

  try {
    const filename = reportFilename(claims.kind, claims.from, claims.to);
    let body: Buffer | string;
    let contentType: string;

    if (claims.kind === 'log-csv') {
      body = await gateLogCsv(claims.from, claims.to);
      contentType = 'text/csv; charset=utf-8';
    } else {
      const rows = await registerForDay(claims.from);
      if (claims.kind === 'register-pdf') {
        body = await registerPdf(claims.from, rows);
        contentType = 'application/pdf';
      } else {
        body = registerCsv(rows);
        contentType = 'text/csv; charset=utf-8';
      }
    }

    await recordAudit({
      actor: { uid: claims.uid, employeeId: claims.employeeId, role: 'admin' },
      action: 'report.download',
      targetType: 'report',
      targetId: filename,
      summary: `Downloaded ${filename}`,
    });

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  } catch (error) {
    console.error('Report download failed:', (error as Error).message);
    res.status(500).type('text/plain').send('Could not generate the report.');
  }
});
