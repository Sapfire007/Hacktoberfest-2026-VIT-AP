/**
 * Admin Routes — staff account provisioning
 *
 * The only way a Faculty, Security or Admin account comes into existence (PRD.md
 * FR-ADM-06). There is deliberately no self-signup path for these roles: institutional
 * access is a fact about employment, not something a person should be able to claim by
 * filling in a form.
 *
 * Every route here is gated on the `admin` role read from the caller's verified token.
 */

import { Router, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.middleware';
import { userLimiter } from '../middleware/rateLimit.middleware';
import { requireRole } from '../middleware/rbac.middleware';
import {
  provisionStaff,
  resetStaffPassword,
  setStaffActive,
  listStaff,
} from '../services/staff.service';
import { recordAudit } from '../services/audit.service';
import adminConsoleRoutes from './admin-console.routes';
import { AuthenticatedRequest, ApiResponse, StaffRole, STAFF_ROLES } from '../types';

/**
 * A password equal to the employee ID is the first thing anyone would guess. Reads the ID
 * from the body field named, or from the `:employeeId` route parameter.
 */
function notEmployeeId(bodyField?: string) {
  return (value: unknown, { req }: { req: any }) => {
    const id = String((bodyField ? req.body?.[bodyField] : req.params?.employeeId) || '');
    if (id && String(value).trim().toUpperCase() === id.trim().toUpperCase()) {
      throw new Error('The password must not be the employee ID');
    }
    return true;
  };
}

function actorFrom(req: AuthenticatedRequest) {
  return { uid: req.user!.uid, employeeId: req.user!.employeeId || null, role: req.user!.role ?? null };
}

const router = Router();

// Applies to every route below. Mounted once rather than repeated per-route, so a new
// route cannot be added here without inheriting the guard.
router.use(authenticateToken, requireRole('admin'), userLimiter);

// The console (overview, gate records, watchlist, analytics, reports, audit) inherits the
// guard above by being mounted here.
router.use(adminConsoleRoutes);

/**
 * GET /api/admin/staff
 * List staff accounts, optionally filtered by role.
 */
router.get('/staff', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const role = req.query.role as StaffRole | undefined;
    if (role && !STAFF_ROLES.includes(role)) {
      res.status(400).json({ success: false, error: 'Unknown role filter' } as ApiResponse);
      return;
    }

    const staff = await listStaff(role);
    res.status(200).json({ success: true, data: { staff, total: staff.length } } as ApiResponse);
  } catch (error) {
    console.error('List staff error:', error);
    res.status(500).json({ success: false, error: 'Failed to list staff' } as ApiResponse);
  }
});

/**
 * POST /api/admin/staff
 * Provision a new staff account.
 *
 * Body: { employeeId, password, role, displayName, department?, email? }
 *
 * The initial password is chosen by the admin and handed over directly, so the account
 * is flagged to force a change at first sign-in. It is echoed back once in the response
 * for the admin to pass on, and never stored in readable form.
 */
router.post(
  '/staff',
  [
    body('employeeId')
      .trim()
      .notEmpty()
      .withMessage('Employee ID is required')
      .isLength({ max: 32 })
      .withMessage('Employee ID is too long')
      // Also what makes it a valid Firestore document id and Firebase uid suffix.
      .matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
      .withMessage('Employee ID may contain only letters, digits, dots, hyphens and underscores'),
    body('password')
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage('Initial password must be 8 to 128 characters')
      .custom(notEmployeeId('employeeId')),
    body('role').isIn(STAFF_ROLES as unknown as string[]).withMessage('Role must be faculty, security or admin'),
    body('displayName').trim().notEmpty().withMessage('Name is required'),
    body('department').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() } as ApiResponse);
        return;
      }

      const credential = await provisionStaff({
        employeeId: req.body.employeeId,
        password: req.body.password,
        role: req.body.role,
        displayName: req.body.displayName,
        department: req.body.department,
        email: req.body.email,
        provisionedByUid: req.user!.uid,
      });

      console.log(
        `Staff account ${credential.employeeId} (${credential.role}) provisioned by ${req.user!.uid}`
      );
      await recordAudit({
        actor: actorFrom(req),
        action: 'staff.create',
        targetType: 'staff',
        targetId: credential.employeeId,
        summary: `Created ${credential.role} account ${credential.employeeId} (${req.body.displayName})`,
      });

      res.status(201).json({
        success: true,
        message: 'Staff account created. The holder must change this password at first sign-in.',
        data: { staff: credential },
      } as ApiResponse);
    } catch (error) {
      const message = (error as Error).message;

      // A duplicate employee ID is the caller's mistake, not a server fault. Deactivated
      // IDs collide here too, on purpose — they are never reissued (FR-ADM-08).
      if (message.includes('already in use')) {
        res.status(409).json({ success: false, error: message } as ApiResponse);
        return;
      }

      console.error('Provision staff error:', error);
      res.status(500).json({ success: false, error: 'Failed to create staff account' } as ApiResponse);
    }
  }
);

/**
 * POST /api/admin/staff/:employeeId/reset-password
 * Admin-initiated reset. Staff have no self-service recovery, because an employee ID has
 * no verified address attached to send a link to (PRD.md FR-PROF-07).
 */
router.post(
  '/staff/:employeeId/reset-password',
  [
    param('employeeId').trim().notEmpty(),
    body('newPassword')
      .isString()
      .isLength({ min: 8, max: 128 })
      .withMessage('Password must be 8 to 128 characters')
      .custom(notEmployeeId()),
  ],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() } as ApiResponse);
        return;
      }

      const done = await resetStaffPassword(req.params.employeeId, req.body.newPassword);
      if (!done) {
        res.status(404).json({ success: false, error: 'Employee ID not found' } as ApiResponse);
        return;
      }

      console.log(`Password reset for ${req.params.employeeId} by ${req.user!.uid}`);
      await recordAudit({
        actor: actorFrom(req),
        action: 'staff.reset_password',
        targetType: 'staff',
        targetId: req.params.employeeId.toUpperCase(),
        summary: `Reset the password of ${req.params.employeeId.toUpperCase()}`,
      });

      res.status(200).json({
        success: true,
        message: 'Password reset. The holder must change it at next sign-in.',
      } as ApiResponse);
    } catch (error) {
      console.error('Staff password reset error:', error);
      res.status(500).json({ success: false, error: 'Password reset failed' } as ApiResponse);
    }
  }
);

/**
 * PATCH /api/admin/staff/:employeeId
 * Activate or deactivate a staff account.
 *
 * Deactivating revokes refresh tokens and clears the role claim, so access ends now
 * rather than whenever the current token expires (PRD.md FR-ADM-07).
 */
router.patch(
  '/staff/:employeeId',
  [param('employeeId').trim().notEmpty(), body('active').isBoolean()],
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, errors: errors.array() } as ApiResponse);
        return;
      }

      // An admin cannot lock themselves out (Design.md §5.7); another admin has to do it.
      if (
        !req.body.active &&
        req.user!.employeeId &&
        req.params.employeeId.trim().toUpperCase() === req.user!.employeeId.toUpperCase()
      ) {
        res.status(409).json({
          success: false,
          error: 'You cannot deactivate your own account',
        } as ApiResponse);
        return;
      }

      const done = await setStaffActive(req.params.employeeId, req.body.active);
      if (!done) {
        res.status(404).json({ success: false, error: 'Employee ID not found' } as ApiResponse);
        return;
      }

      console.log(
        `Staff ${req.params.employeeId} ${req.body.active ? 'activated' : 'deactivated'} by ${req.user!.uid}`
      );
      await recordAudit({
        actor: actorFrom(req),
        action: req.body.active ? 'staff.reactivate' : 'staff.deactivate',
        targetType: 'staff',
        targetId: req.params.employeeId.toUpperCase(),
        summary: `${req.body.active ? 'Reactivated' : 'Deactivated'} staff account ${req.params.employeeId.toUpperCase()}`,
      });

      res.status(200).json({
        success: true,
        message: req.body.active ? 'Account activated' : 'Account deactivated',
      } as ApiResponse);
    } catch (error) {
      const message = (error as Error).message;

      if (message.includes('last remaining active admin')) {
        res.status(409).json({ success: false, error: message } as ApiResponse);
        return;
      }

      console.error('Staff activation error:', error);
      res.status(500).json({ success: false, error: 'Update failed' } as ApiResponse);
    }
  }
);

export default router;
