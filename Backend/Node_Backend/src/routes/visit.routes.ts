/**
 * Visit Request Routes - /api/visits/*
 *
 *   visitor / parent / student   create, list own, view own, cancel own
 *   faculty                      inbox, view addressed-to-me, approve, reject
 *   security / admin             view any (to check a permit at the gate)
 *
 * Who is allowed to act on a given request is decided in visit.service from the verified
 * token. The faculty member is resolved server-side from their account; the app never
 * tells the server which faculty it is.
 */

import { Router, Response, NextFunction } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireRole, requireVerifiedEmail } from '../middleware/rbac.middleware';
import { userLimiter } from '../middleware/rateLimit.middleware';
import * as visitService from '../services/visit.service';
import { VisitRequestError } from '../services/visit.service';
import { resolveFacultyForUser } from '../services/faculty.service';
import {
  AuthenticatedRequest,
  ApiResponse,
  CreateVisitRequestInput,
  PublicFaculty,
} from '../types';

const router = Router();

router.use(authenticateToken, userLimiter);

const REQUESTER_ROLES = ['visitor', 'parent', 'student'] as const;

type FacultyRequest = AuthenticatedRequest & { faculty?: PublicFaculty };

/**
 * Attach the caller's faculty record, or stop.
 *
 * A faculty-role account with no record in the `faculty` collection (e.g. the demo
 * VITAP-FAC01 account, which lives in staff_credentials) cannot receive requests, because
 * requests are addressed to faculty records. It is told so, rather than shown an inbox
 * that is empty for a reason nobody can see.
 */
async function loadFaculty(req: FacultyRequest, res: Response, next: NextFunction) {
  try {
    const faculty = await resolveFacultyForUser(req.user!.uid, req.user!.employeeId);

    if (!faculty) {
      res.status(403).json({
        success: false,
        error: 'No faculty record',
        message:
          'This account is not linked to a faculty record, so it cannot receive visit requests.',
      } as ApiResponse);
      return;
    }

    req.faculty = faculty;
    next();
  } catch (error) {
    next(error);
  }
}

/** Service errors carry a status and a message written for the person using the app. */
function sendError(res: Response, error: unknown, fallback: string) {
  if (error instanceof VisitRequestError) {
    res.status(error.statusCode).json({ success: false, error: error.message } as ApiResponse);
    return;
  }
  console.error(`${fallback}:`, (error as Error).message);
  res.status(500).json({ success: false, error: fallback } as ApiResponse);
}

/**
 * POST /api/visits
 * Create a request. Requires a verified email address (VISION.md §3.1).
 */
router.post(
  '/',
  requireRole(...REQUESTER_ROLES),
  requireVerifiedEmail,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = await visitService.createVisitRequest(
        req.body as CreateVisitRequestInput,
        { uid: req.user!.uid, role: req.user!.role!, email: req.user!.email }
      );
      res.status(201).json({
        success: true,
        message: 'Request submitted',
        data: { request },
      } as ApiResponse);
    } catch (error) {
      sendError(res, error, 'Could not submit the request');
    }
  }
);

/**
 * GET /api/visits/mine
 * The caller's own requests, newest first.
 */
router.get(
  '/mine',
  requireRole(...REQUESTER_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requests = await visitService.listByRequester(req.user!.uid);
      res.json({ success: true, data: { requests } } as ApiResponse);
    } catch (error) {
      sendError(res, error, 'Could not load your requests');
    }
  }
);

/**
 * GET /api/visits/inbox?scope=pending|all
 * Requests addressed to the signed-in faculty member.
 */
router.get(
  '/inbox',
  requireRole('faculty'),
  loadFaculty,
  async (req: FacultyRequest, res: Response) => {
    try {
      const scope = req.query.scope === 'all' ? 'all' : 'pending';
      const requests = await visitService.listForFaculty(req.faculty!.id, scope);
      res.json({ success: true, data: { requests, faculty: req.faculty } } as ApiResponse);
    } catch (error) {
      sendError(res, error, 'Could not load the inbox');
    }
  }
);

/**
 * GET /api/visits/:id
 * The requester, the host faculty member, or security/admin. The host also gets a short
 * summary of the requester (photo, ID type, verification) to decide on.
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const request = await visitService.getVisitRequest(req.params.id);
    const role = req.user!.role;

    // Same 404 for "doesn't exist" and "not yours", so ids cannot be probed.
    const notFound = () => {
      res.status(404).json({ success: false, error: 'Request not found' } as ApiResponse);
    };

    if (!request) return notFound();

    if (role === 'security' || role === 'admin') {
      res.json({ success: true, data: { request } } as ApiResponse);
      return;
    }

    if (role === 'faculty') {
      const faculty = await resolveFacultyForUser(req.user!.uid, req.user!.employeeId);
      if (!faculty || faculty.id !== request.targetFacultyId) return notFound();

      const requester = await visitService.getRequesterSummary(request.requesterId);
      res.json({ success: true, data: { request, requester } } as ApiResponse);
      return;
    }

    if (request.requesterId !== req.user!.uid) return notFound();
    res.json({ success: true, data: { request } } as ApiResponse);
  } catch (error) {
    sendError(res, error, 'Could not load the request');
  }
});

/** POST /api/visits/:id/approve  { remarks? } */
router.post(
  '/:id/approve',
  requireRole('faculty'),
  loadFaculty,
  async (req: FacultyRequest, res: Response) => {
    try {
      const request = await visitService.approveVisitRequest(
        req.params.id,
        req.faculty!,
        req.body?.remarks
      );
      res.json({ success: true, message: 'Request approved', data: { request } } as ApiResponse);
    } catch (error) {
      sendError(res, error, 'Could not approve the request');
    }
  }
);

/** POST /api/visits/:id/reject  { remarks } — a reason is required. */
router.post(
  '/:id/reject',
  requireRole('faculty'),
  loadFaculty,
  async (req: FacultyRequest, res: Response) => {
    try {
      const request = await visitService.rejectVisitRequest(
        req.params.id,
        req.faculty!,
        req.body?.remarks
      );
      res.json({ success: true, message: 'Request rejected', data: { request } } as ApiResponse);
    } catch (error) {
      sendError(res, error, 'Could not reject the request');
    }
  }
);

/** POST /api/visits/:id/cancel — the requester withdraws their own request. */
router.post(
  '/:id/cancel',
  requireRole(...REQUESTER_ROLES),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const request = await visitService.cancelVisitRequest(req.params.id, {
        uid: req.user!.uid,
        name: req.user!.name,
      });
      res.json({ success: true, message: 'Request cancelled', data: { request } } as ApiResponse);
    } catch (error) {
      sendError(res, error, 'Could not cancel the request');
    }
  }
);

export default router;
