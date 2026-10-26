/**
 * Gate Routes - /api/gate/*
 *
 * The security officer's API: register a walk-in, check in permits and regular passes,
 * scan people out, turn people away, and see who is inside and who has overstayed.
 *
 * Every route here requires the `security` or `admin` role. Admin is included not as a
 * convenience but because an administrator has to be able to correct a gate record and
 * answer "who was on campus on Tuesday" without being handed a security officer's
 * credential.
 *
 * Convention: a scan *verdict* — forged, expired, too early, already out — is HTTP 200
 * with `success: false` and an `error` code, because the scan itself worked and what it
 * found is the answer. Returning 4xx there would make the app's "no network" branch and
 * its "stop that vehicle" branch indistinguishable. HTTP errors are for bad input (400),
 * a watchlist decision the officer still has to make (409), and server faults (500).
 */

import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { userLimiter } from '../middleware/rateLimit.middleware';
import * as gateService from '../services/gate.service';
import { GateValidationError, PermitRefusedError, ExitResult } from '../services/gate.service';
import { WatchlistHitError } from '../services/watchlist.service';
import { AccountLinkError } from '../services/account-link.service';
import { formatPlateForDisplay, isRecognisedFormat } from '../core/plate';
import {
  AuthenticatedRequest,
  ApiResponse,
  CreateGateEntryInput,
  CheckInPermitInput,
} from '../types';

const router = Router();

// Every gate route is authenticated and role-gated. Mounted once here rather than
// repeated per-route, so a new route cannot be added without the guard by forgetting it.
router.use(authenticateToken, requireRole('security', 'admin'), userLimiter);

/**
 * The officer's identity, taken from the verified token.
 *
 * An admin acting at the gate has no employee ID in some seeded setups, so it falls back
 * to the uid rather than writing an empty string - an unattributable entry is worse than
 * an ugly one.
 */
export function officerFrom(req: AuthenticatedRequest): { uid: string; employeeId: string } {
  return {
    uid: req.user!.uid,
    employeeId: req.user!.employeeId || req.user!.uid,
  };
}

/**
 * One place that turns a gate failure into a response. A validation failure is the
 * officer's input and carries a message written to be read aloud at a gate; a watchlist
 * hit carries who matched and why; anything else is ours and is not shown.
 */
export function sendGateError(res: Response, error: unknown, fallback: string): void {
  if (error instanceof WatchlistHitError) {
    res.status(409).json({
      success: false,
      error: 'watchlist_hit',
      message: error.message,
      data: { matches: error.matches },
    } as ApiResponse);
    return;
  }
  if (error instanceof PermitRefusedError) {
    res.json({ success: false, error: error.reason, message: error.message } as ApiResponse);
    return;
  }
  if (error instanceof GateValidationError) {
    res.status(400).json({ success: false, error: error.message } as ApiResponse);
    return;
  }
  if (error instanceof AccountLinkError) {
    res.status(error.statusCode).json({ success: false, error: error.message } as ApiResponse);
    return;
  }

  console.error(`${fallback}:`, (error as Error).message);
  res.status(500).json({ success: false, error: fallback } as ApiResponse);
}

/**
 * POST /api/gate/entries
 * Register a walk-in visitor and issue their QR pass.
 */
router.post('/entries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await gateService.registerEntry(
      req.body as CreateGateEntryInput,
      officerFrom(req)
    );

    res.status(201).json({
      success: true,
      message: 'Entry registered',
      data: {
        entry: result.entry,
        passToken: result.passToken,
        plateDisplay: result.entry.vehicle
          ? formatPlateForDisplay(result.entry.vehicle.plate)
          : null,
      },
    } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not register the entry');
  }
});

/**
 * GET /api/gate/entries/:id
 */
router.get('/entries/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = await gateService.getEntry(req.params.id);

    if (!entry) {
      res.status(404).json({ success: false, error: 'Entry not found' } as ApiResponse);
      return;
    }

    res.json({ success: true, data: { entry } } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Lookup failed');
  }
});

/**
 * POST /api/gate/entries/:id/reissue
 * Hand out another copy of the QR for a pass that is still valid.
 */
router.post('/entries/:id/reissue', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await gateService.reissuePass(req.params.id);

    if (!result) {
      res.status(404).json({ success: false, error: 'Entry not found' } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: { entry: result.entry, passToken: result.passToken },
    } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not re-issue the pass');
  }
});

/**
 * POST /api/gate/entries/:id/link
 * The officer confirms that the account matched by phone is the visitor's, and the pass
 * is sent to it.
 */
router.post('/entries/:id/link', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await gateService.linkEntryToSuggestedAccount(req.params.id, officerFrom(req));
    res.json({ success: true, message: 'Pass sent to their VISION account', data: result } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not send the pass');
  }
});

/**
 * The response body for an exit scan. Shared by /exit and /scan so both report the same
 * verdicts in the same shape.
 */
function exitResponse(result: ExitResult): ApiResponse {
  if (result.ok) {
    return { success: true, message: 'Exit recorded', data: { entry: result.entry } } as ApiResponse;
  }

  switch (result.reason) {
    case 'already_exited':
      return {
        success: false,
        error: 'already_exited',
        message: 'This visitor has already been signed out',
        data: { entry: result.entry },
      } as ApiResponse;
    case 'not_found':
      return {
        success: false,
        error: 'not_found',
        message: 'This pass is signed correctly but has no record. Escalate to the supervisor.',
      } as ApiResponse;
    case 'not_checked_in':
      return { success: false, error: 'not_checked_in', message: result.detail } as ApiResponse;
    default:
      return { success: false, error: 'invalid_pass', message: result.detail } as ApiResponse;
  }
}

/**
 * POST /api/gate/exit
 * Scan a pass and close the visit. Kept for older app builds; /scan does the same for
 * departures and also handles arrivals.
 */
router.post('/exit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const passToken = String(req.body?.passToken || '').trim();

    if (!passToken) {
      res.status(400).json({ success: false, error: 'No pass was scanned' } as ApiResponse);
      return;
    }

    const result = await gateService.recordExit(passToken, officerFrom(req));
    res.json(exitResponse(result));
  } catch (error) {
    sendGateError(res, error, 'Could not record the exit');
  }
});

/**
 * POST /api/gate/scan
 * The one scanner. Body: { passToken }.
 *
 * - walk-in pass, or a permit / regular pass already checked in -> the exit is recorded,
 *   and the body is exactly what /exit returns, plus `data.action: 'exit'`;
 * - approved permit not yet checked in -> `data.action: 'check_in'` with a preview;
 * - regular pass valid now -> `data.action: 'check_in_recurring'` with a preview.
 *   Nothing is written for an arrival until the officer confirms;
 * - a pass that cannot be used now -> `success: false`, `error` = the reason
 *   (too_early, window_over, not_approved, revoked, not_today, outside_hours, ...), with
 *   the preview so the officer can see whose pass it is.
 */
router.post('/scan', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const passToken = String(req.body?.passToken || '').trim();

    if (!passToken) {
      res.status(400).json({ success: false, error: 'No pass was scanned' } as ApiResponse);
      return;
    }

    const scan = await gateService.scanPass(passToken, officerFrom(req));

    switch (scan.action) {
      case 'exit': {
        const body = exitResponse(scan.result);
        res.json({ ...body, data: { ...(body.data as object), action: 'exit' } } as ApiResponse);
        return;
      }
      case 'check_in':
        res.json({
          success: true,
          message: 'Permit valid - confirm the visitor to check them in',
          data: { action: 'check_in', preview: scan.preview },
        } as ApiResponse);
        return;
      case 'check_in_recurring':
        res.json({
          success: true,
          message: 'Regular pass valid today - confirm to check them in',
          data: { action: 'check_in_recurring', recurring: scan.recurring },
        } as ApiResponse);
        return;
      default:
        res.json({
          success: false,
          error: scan.reason,
          message: scan.detail,
          data: { action: 'refused', preview: scan.preview, recurring: scan.recurring },
        } as ApiResponse);
    }
  } catch (error) {
    sendGateError(res, error, 'Could not check the pass');
  }
});

/**
 * POST /api/gate/permits/preview
 * Read-only: who a permit belongs to and whether it can admit them now. Body: { passToken }.
 */
router.post('/permits/preview', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const passToken = String(req.body?.passToken || '').trim();

    if (!passToken) {
      res.status(400).json({ success: false, error: 'No pass was scanned' } as ApiResponse);
      return;
    }

    const result = await gateService.previewPermit(passToken);

    if (result.ok) {
      res.json({ success: true, data: { preview: result.preview } } as ApiResponse);
      return;
    }

    res.json({
      success: false,
      error: result.reason,
      message: result.detail,
      data: result.preview ? { preview: result.preview } : undefined,
    } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not check the permit');
  }
});

/**
 * POST /api/gate/permits/check-in
 * Admit a permit holder after the officer has looked at them. Body: CheckInPermitInput.
 */
router.post('/permits/check-in', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = await gateService.checkInPermit(
      req.body as CheckInPermitInput,
      officerFrom(req)
    );

    res.status(201).json({
      success: true,
      message: 'Checked in',
      data: {
        entry,
        plateDisplay: entry.vehicle ? formatPlateForDisplay(entry.vehicle.plate) : null,
      },
    } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not check the visitor in');
  }
});

/**
 * POST /api/gate/recurring/check-in
 * Admit a regular pass holder for today. Body: { passToken, gate?, watchlistOverride? }.
 */
router.post('/recurring/check-in', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entry = await gateService.recurringCheckIn(req.body ?? {}, officerFrom(req));
    res.status(201).json({ success: true, message: 'Checked in', data: { entry } } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not check the visitor in');
  }
});

/**
 * POST /api/gate/denials
 * The officer turned someone away after a watchlist alert.
 * Body: { visitorName, phone?, plate?, gate?, reason?, source? }.
 */
router.post('/denials', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await gateService.recordDenial(req.body ?? {}, officerFrom(req));
    res.status(201).json({ success: true, message: 'Denial recorded' } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not record the denial');
  }
});

/**
 * GET /api/gate/on-campus
 * Everyone currently inside, overstays first.
 */
router.get('/on-campus', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const entries = await gateService.listOnCampus(limit);

    res.json({
      success: true,
      data: {
        entries,
        count: entries.length,
        // The head count is not entries.length: a party of four is one record.
        peopleOnCampus: entries.reduce((total, entry) => total + entry.partySize, 0),
        overstayCount: entries.filter((entry) => entry.overstay).length,
      },
    } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not load the list');
  }
});

/**
 * GET /api/gate/overstays
 * Visitors still inside after their pass expired, longest overstay first.
 */
router.get('/overstays', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const entries = await gateService.listOverstays();
    res.json({ success: true, data: { entries, count: entries.length } } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not load overstays');
  }
});

/**
 * GET /api/gate/my-entries
 * What this officer has registered, newest first.
 */
router.get('/my-entries', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const entries = await gateService.listByOfficer(req.user!.uid, Number(req.query.limit) || 50);
    res.json({ success: true, data: { entries } } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not load your entries');
  }
});

/**
 * GET /api/gate/search?q=
 * Fallback lookup by pass code, plate or phone, for when the QR will not scan.
 */
router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = String(req.query.q || '');

    if (query.trim().length < 3) {
      res.status(400).json({
        success: false,
        error: 'Enter at least 3 characters of a pass code, plate or phone number',
      } as ApiResponse);
      return;
    }

    const entries = await gateService.findEntries(query);
    res.json({ success: true, data: { entries } } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Search failed');
  }
});

/**
 * GET /api/gate/plate-check?plate=
 *
 * Whether a plate parses as a known Indian format, and how it should be displayed. The
 * app calls this to decide whether to show the officer a "does that look right?" nudge
 * after an OCR read - it is advisory, and never blocks saving.
 */
router.get('/plate-check', (req: AuthenticatedRequest, res: Response) => {
  const plate = String(req.query.plate || '');

  res.json({
    success: true,
    data: {
      recognised: isRecognisedFormat(plate),
      display: formatPlateForDisplay(plate),
    },
  } as ApiResponse);
});

/**
 * POST /api/security/find-approved-request
 * Find an approved visit request by visitor's phone number or request ID.
 * Used by security officer before biometric verification.
 */
router.post('/security/find-approved-request', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { phone, requestId } = req.body;

    console.log('[Gate Route] Find approved request:', { phone, requestId });

    if (!phone && !requestId) {
      res.status(400).json({
        success: false,
        error: 'Phone number or request ID is required',
      } as ApiResponse);
      return;
    }

    const result = await gateService.findApprovedRequest(phone, requestId);

    if (!result) {
      res.json({
        success: false,
        error: 'NOT_FOUND',
        message: requestId 
          ? `No approved visit request found with ID: ${requestId}` 
          : `No approved visit request found for phone: ${phone}`,
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      request: result,
    } as ApiResponse);
  } catch (error) {
    console.error('[Gate Route] Error in find-approved-request:', error);
    sendGateError(res, error, 'Could not find approved request');
  }
});

/**
 * POST /api/security/activate-permit
 * Generate QR code and change status from 'approved' to 'permit_active' after
 * biometric verification at gate.
 */
router.post('/security/activate-permit', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { requestId, vehicleNumber } = req.body;

    if (!requestId) {
      res.status(400).json({
        success: false,
        error: 'Request ID is required',
      } as ApiResponse);
      return;
    }

    const result = await gateService.activatePermit(requestId, officerFrom(req), vehicleNumber);

    res.json({
      success: true,
      message: vehicleNumber 
        ? `Permit activated with vehicle ${vehicleNumber}`
        : 'Permit activated successfully',
      permitId: result.permitId,
      qrPayload: result.qrPayload,
      expiresAt: result.expiresAt,
      vehicleNumber: vehicleNumber || null,
    } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not activate permit');
  }
});

export default router;
