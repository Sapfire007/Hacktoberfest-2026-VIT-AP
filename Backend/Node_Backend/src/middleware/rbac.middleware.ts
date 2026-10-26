/**
 * Role-Based Access Control Middleware
 *
 * Authorization is decided from the role claim carried inside the verified token and
 * attached to `req.user` by `authenticateToken`. It is never read from the request body,
 * a query parameter, or client state — those are caller-controlled inputs, and treating
 * one as an authorization source is how a user promotes themselves.
 *
 * Always mount these AFTER `authenticateToken`. On their own they deny everything,
 * because an unauthenticated request has no `req.user` and therefore no role.
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest, ApiResponse, UserRole } from '../types';

/**
 * Require the caller to hold one of the given roles.
 *
 *   router.get('/staff', authenticateToken, requireRole('admin'), handler);
 */
function requireRole(...allowed: UserRole[]) {
  return function roleGuard(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
    const role = req.user?.role;

    if (!req.user) {
      // Reaching here means the route forgot `authenticateToken`. Fail closed and say so
      // in the log, because it is a wiring bug rather than a caller's mistake.
      console.error('requireRole used on a route without authenticateToken');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
      return;
    }

    if (!role || !allowed.includes(role)) {
      // The response deliberately does not name the roles that would have worked —
      // that would map out the permission model for anyone probing endpoints.
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: 'Your account does not have access to this resource',
      } as ApiResponse);
      return;
    }

    next();
  };
}

/**
 * Allow a caller to act on their own record, or allow an admin to act on anyone's.
 *
 * `paramName` is the route parameter holding the target user id, e.g. `/biometrics/:userId`.
 * Without this, any authenticated user can read any other user's data simply by changing
 * the id in the URL.
 */
function requireSelfOrRole(paramName: string, ...allowed: UserRole[]) {
  return function selfOrRoleGuard(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      } as ApiResponse);
      return;
    }

    const targetUid = req.params[paramName];
    const isSelf = targetUid === req.user.uid;
    const isAllowedRole = !!req.user.role && allowed.includes(req.user.role);

    if (!isSelf && !isAllowedRole) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: 'Your account does not have access to this resource',
      } as ApiResponse);
      return;
    }

    next();
  };
}

/**
 * Require a verified email address.
 *
 * Applied to actions that commit the user to something real — submitting a visit request,
 * for instance — rather than to onboarding, so an unverified account can still finish
 * registering. See PRD.md FR-REG-01a.
 */
function requireVerifiedEmail(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    } as ApiResponse);
    return;
  }

  // Staff accounts are provisioned by an admin against an employee ID and have no
  // self-verified address, so the check does not apply to them.
  if (req.user.employeeId) {
    next();
    return;
  }

  if (!req.user.emailVerified) {
    res.status(403).json({
      success: false,
      error: 'Email not verified',
      message: 'Please verify your email address before continuing',
    } as ApiResponse);
    return;
  }

  next();
}

export {
  requireRole,
  requireSelfOrRole,
  requireVerifiedEmail,
};
