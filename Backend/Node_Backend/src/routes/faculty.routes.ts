/**
 * Faculty Routes - /api/faculty/*
 *
 * The faculty directory, for any signed-in user choosing a host, and a faculty member's
 * own record. Every response is built from the allow-listed PublicFaculty shape; no route
 * here can return a password hash.
 */

import { Router, Response } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import { userLimiter } from '../middleware/rateLimit.middleware';
import * as facultyService from '../services/faculty.service';
import { AuthenticatedRequest, ApiResponse } from '../types';

const router = Router();

router.use(authenticateToken, userLimiter);

/**
 * GET /api/faculty?cursor=<lastId>&limit=50
 * One page of active faculty, sorted by name.
 */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const page = await facultyService.getFacultyPage(cursor, limit);

    res.json({ success: true, data: page } as ApiResponse);
  } catch (error) {
    console.error('Faculty list failed:', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not load faculty' } as ApiResponse);
  }
});

/**
 * GET /api/faculty/search?q=
 * Match on name, department, designation, email or employee ID (2+ characters).
 */
router.get('/search', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const faculty = await facultyService.searchFaculty(String(req.query.q || ''));
    res.json({ success: true, data: { faculty } } as ApiResponse);
  } catch (error) {
    console.error('Faculty search failed:', (error as Error).message);
    res.status(500).json({ success: false, error: 'Search failed' } as ApiResponse);
  }
});

/**
 * GET /api/faculty/me
 * The signed-in faculty member's own directory record.
 */
router.get('/me', requireRole('faculty'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const faculty = await facultyService.resolveFacultyForUser(
      req.user!.uid,
      req.user!.employeeId
    );

    if (!faculty) {
      res.status(404).json({
        success: false,
        error: 'No faculty record is linked to this account',
      } as ApiResponse);
      return;
    }

    res.json({ success: true, data: { faculty } } as ApiResponse);
  } catch (error) {
    console.error('Faculty profile failed:', (error as Error).message);
    res.status(500).json({ success: false, error: 'Could not load your profile' } as ApiResponse);
  }
});

/**
 * GET /api/faculty/:id
 */
router.get('/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const faculty = await facultyService.getFacultyById(req.params.id);

    if (!faculty) {
      res.status(404).json({ success: false, error: 'Faculty member not found' } as ApiResponse);
      return;
    }

    res.json({ success: true, data: { faculty } } as ApiResponse);
  } catch (error) {
    console.error('Faculty lookup failed:', (error as Error).message);
    res.status(500).json({ success: false, error: 'Lookup failed' } as ApiResponse);
  }
});

export default router;
