/**
 * Pass Routes - /api/passes/*
 *
 * Recurring (multi-day) passes, issued by admin or security, and the passes a visitor
 * finds in their own account.
 */

import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { userLimiter } from '../middleware/rateLimit.middleware';
import * as recurring from '../services/recurring.service';
import { listLinkedEntries } from '../services/gate.service';
import { sendGateError } from './gate.routes';
import { AuthenticatedRequest, ApiResponse, CreateRecurringPassInput } from '../types';

const router = Router();

router.use(authenticateToken, userLimiter);

const staff = requireRole('admin', 'security');

function actorFrom(req: AuthenticatedRequest) {
  return {
    uid: req.user!.uid,
    employeeId: req.user!.employeeId || req.user!.uid,
    role: req.user!.role ?? null,
  };
}

/**
 * GET /api/passes/mine
 * The signed-in visitor's gate passes: walk-in passes security sent to their account, and
 * their active regular passes, each with a fresh QR token.
 */
router.get(
  '/mine',
  requireRole('visitor', 'parent'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [entries, regular] = await Promise.all([
        listLinkedEntries(req.user!.uid),
        recurring.listLinkedRecurring(req.user!.uid),
      ]);
      res.json({ success: true, data: { entries, recurring: regular } } as ApiResponse);
    } catch (error) {
      sendGateError(res, error, 'Could not load your passes');
    }
  }
);

/**
 * POST /api/passes/recurring
 * Issue a regular pass. Security may also check the holder in at once (`checkInNow`).
 */
router.post('/recurring', staff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await recurring.issueRecurringPass(
      req.body as CreateRecurringPassInput,
      actorFrom(req)
    );
    res.status(201).json({ success: true, message: 'Pass issued', data: result } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not issue the pass');
  }
});

/**
 * GET /api/passes/recurring?status=&q=
 */
router.get('/recurring', staff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = String(req.query.status || '');
    const passes = await recurring.listRecurringPasses({
      status: ['active', 'revoked', 'expired'].includes(status)
        ? (status as 'active' | 'revoked' | 'expired')
        : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
    });
    res.json({ success: true, data: { passes } } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not load passes');
  }
});

/**
 * GET /api/passes/recurring/:id
 * One pass, with its QR token while it is active.
 */
router.get('/recurring/:id', staff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await recurring.getRecurringPass(req.params.id);
    if (!result) {
      res.status(404).json({ success: false, error: 'Pass not found' } as ApiResponse);
      return;
    }
    res.json({ success: true, data: result } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not load the pass');
  }
});

/**
 * POST /api/passes/recurring/:id/revoke   Body: { reason }
 */
router.post(
  '/recurring/:id/revoke',
  requireRole('admin'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const pass = await recurring.revokeRecurringPass(
        req.params.id,
        String(req.body?.reason || ''),
        actorFrom(req)
      );
      res.json({ success: true, message: 'Pass revoked', data: { pass } } as ApiResponse);
    } catch (error) {
      sendGateError(res, error, 'Could not revoke the pass');
    }
  }
);

/**
 * POST /api/passes/recurring/:id/link
 * Send the pass to the account matched by phone, once the officer has confirmed it.
 */
router.post('/recurring/:id/link', staff, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await recurring.linkRecurringToSuggestedAccount(req.params.id, actorFrom(req));
    res.json({ success: true, message: 'Pass sent to their VISION account', data: result } as ApiResponse);
  } catch (error) {
    sendGateError(res, error, 'Could not send the pass');
  }
});

export default router;
