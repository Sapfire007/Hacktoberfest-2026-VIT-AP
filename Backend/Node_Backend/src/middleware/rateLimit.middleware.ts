/**
 * Rate limiting
 *
 * Three limiters, because the three kinds of traffic fail in different ways:
 *
 * 1. `loginLimiter` — password endpoints. Counts only **failed** attempts, per IP. A campus
 *    shares a handful of public IPs behind NAT, so counting successes would lock a whole
 *    building out at 9am when everyone signs in at once. Failed attempts from one address
 *    are what a password-guessing script looks like. This sits in front of the per-account
 *    lockout in staff.service, which stops guessing one account; this stops spraying many.
 *
 * 2. `publicLimiter` — unauthenticated endpoints that do work or reveal something
 *    (registration, email check, password reset). Per IP.
 *
 * 3. `userLimiter` — authenticated API traffic. Keyed by the **signed-in user**, not the IP,
 *    for the same NAT reason: forty officers and students on campus Wi-Fi share one IP, and
 *    must not share one budget. Must be mounted *after* `authenticateToken`, which is what
 *    sets `req.user`.
 *
 * The general per-user budget comes from RATE_LIMIT_WINDOW_MS / RATE_LIMIT_MAX_REQUESTS.
 */

import rateLimit, { ipKeyGenerator, Options } from 'express-rate-limit';
import { Request, Response } from 'express';
import { AuthenticatedRequest, ApiResponse } from '../types';

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** The client's IP, with IPv6 addresses grouped by /56 so one host cannot rotate through them. */
function ipKey(req: Request): string {
  return ipKeyGenerator(req.ip ?? 'unknown');
}

/**
 * The response every limiter sends.
 *
 * Same shape as every other error from this API, so the app's existing error handling
 * shows the message without special cases. `Retry-After` is set by the library.
 */
function limitHandler(message: string): Options['handler'] {
  return (_req: Request, res: Response, _next, options) => {
    res.status(options.statusCode).json({
      success: false,
      error: 'Too many requests',
      message,
    } as ApiResponse);
  };
}

const common = {
  standardHeaders: 'draft-8' as const,
  legacyHeaders: false,
};

/** Password sign-in: 10 failed attempts per IP per 15 minutes. */
export const loginLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: envInt('RATE_LIMIT_LOGIN_MAX', 10),
  skipSuccessfulRequests: true,
  keyGenerator: ipKey,
  handler: limitHandler(
    'Too many failed sign-in attempts from this network. Wait 15 minutes and try again.'
  ),
});

/** Unauthenticated endpoints: 30 requests per IP per 15 minutes. */
export const publicLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  limit: envInt('RATE_LIMIT_PUBLIC_MAX', 30),
  keyGenerator: ipKey,
  handler: limitHandler('Too many requests from this network. Wait a few minutes and try again.'),
});

/**
 * Authenticated traffic, per user. Falls back to the IP if mounted before authentication
 * by mistake, so a wiring error degrades to a stricter limit rather than no limit.
 */
export const userLimiter = rateLimit({
  ...common,
  windowMs: envInt('RATE_LIMIT_WINDOW_MS', 60 * 1000),
  limit: envInt('RATE_LIMIT_MAX_REQUESTS', 120),
  keyGenerator: (req: Request) => {
    const uid = (req as AuthenticatedRequest).user?.uid;
    return uid ? `user:${uid}` : `ip:${ipKey(req)}`;
  },
  handler: limitHandler('You are making requests too quickly. Wait a moment and try again.'),
});
