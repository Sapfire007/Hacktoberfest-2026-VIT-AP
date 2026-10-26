/**
 * Authentication Middleware
 * 
 * Verifies Firebase ID tokens on protected routes
 * Attaches decoded user info to request object
 */

import { Response, NextFunction } from 'express';
import { verifyIdToken } from '../config/firebase.admin';
import { AuthenticatedRequest, ApiResponse } from '../types';

/**
 * Middleware to verify Firebase ID token
 * Expects Authorization header: Bearer <token>
 */
async function authenticateToken(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No authentication token provided',
        message: 'Please include Authorization: Bearer <token> header',
      } as ApiResponse);
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    if (!idToken) {
      res.status(401).json({
        success: false,
        error: 'Invalid token format',
      } as ApiResponse);
      return;
    }

    // Verify the ID token
    const decodedToken = await verifyIdToken(idToken);

    // Attach user info to request.
    // `role` comes from the token's custom claim, which only this server can write —
    // never from the request body, which the caller controls.
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      name: decodedToken.name,
      picture: decodedToken.picture,
      role: decodedToken.role,
      employeeId: decodedToken.employeeId,
    };

    next();
  } catch (error) {
    console.error('Authentication error:', (error as Error).message);

    // 401, not 403: the credential is missing or invalid, so the client should
    // re-authenticate. 403 means "we know who you are and you still may not" — that is
    // what the RBAC middleware returns, and the app branches on the difference to decide
    // between sending the user to sign-in and showing a permissions message.
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: 'Invalid or expired token',
    } as ApiResponse);
    return;
  }
}

/**
 * Optional authentication middleware
 * Continues even if no token provided, but verifies if present
 */
async function optionalAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.split('Bearer ')[1];
      
      if (idToken) {
        const decodedToken = await verifyIdToken(idToken);
        req.user = {
          uid: decodedToken.uid,
          email: decodedToken.email,
          emailVerified: decodedToken.email_verified,
          name: decodedToken.name,
          picture: decodedToken.picture,
          role: decodedToken.role,
          employeeId: decodedToken.employeeId,
        };
      }
    }

    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
}

export {
  authenticateToken,
  optionalAuth,
};
