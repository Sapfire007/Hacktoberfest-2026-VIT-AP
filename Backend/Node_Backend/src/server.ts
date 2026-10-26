/**
 * VISION Backend Server
 * 
 * Main Express server for VISION campus access management system
 * Handles authentication, user management, and API endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import * as dotenv from 'dotenv';

import { initializeFirebase } from './config/firebase.admin';
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import gateRoutes from './routes/gate.routes';
import facultyRoutes from './routes/faculty.routes';
import visitRoutes from './routes/visit.routes';
import passRoutes from './routes/pass.routes';
import { reportDownloadRouter } from './routes/admin-console.routes';
import { ApiResponse } from './types';

dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// =========================================
// Middleware
// =========================================

// Behind a reverse proxy (nginx, Render, Railway...) every request arrives from the proxy's
// IP, so the per-IP rate limits would treat all users as one. TRUST_PROXY tells Express how
// many proxy hops to trust when reading the real client IP from X-Forwarded-For. Leave it
// unset when running directly, or any client could fake its IP with that header.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isFinite(hops) ? hops : process.env.TRUST_PROXY);
}

// Security headers
app.use(helmet());

const isDevelopment = process.env.NODE_ENV === 'development';

// CORS. Only browsers enforce it, and only the admin console runs in one - the phone app
// sends no Origin at all. Development allows any origin so the web build works from
// whatever address Metro serves it on. Elsewhere only CORS_ORIGINS may call in, and with
// none configured, no browser origin can. Credentials stay off: sessions are a bearer
// header, never a cookie, so there is nothing for a browser to attach.
const corsOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
if (!isDevelopment && corsOrigins.length === 0) {
  console.warn('⚠️  CORS_ORIGINS is not set: the admin console cannot be used from a browser');
}
app.use(
  cors({
    origin: isDevelopment ? true : corsOrigins.length > 0 ? corsOrigins : false,
    credentials: false,
    optionsSuccessStatus: 200,
  })
);

// Body parsers. Bodies are parsed before authentication, so the limit is what any anonymous
// caller can make the server read. 1 MB covers every ordinary request (the largest, an
// encrypted face embedding, is about 150 KB); only the routes that carry a photo of an ID
// document get 10 MB.
const IMAGE_ROUTES = new Set([
  '/api/auth/upload-id-document',
  '/api/gate/entries',
  '/api/gate/permits/check-in',
  '/api/passes/recurring',
]);
const jsonDefault = express.json({ limit: '1mb' });
const jsonImages = express.json({ limit: '10mb' });
app.use((req, res, next) => {
  const path = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;
  return (IMAGE_ROUTES.has(path) ? jsonImages : jsonDefault)(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Request logging, without query strings: they carry report-download tokens and the phone
// numbers and names typed into searches, and logs are kept and shared.
morgan.token('path', (req) => ((req as Request).originalUrl || req.url || '').split('?')[0]);
app.use(
  morgan(
    isDevelopment
      ? ':method :path :status :response-time ms - :res[content-length]'
      : ':remote-addr - [:date[clf]] ":method :path HTTP/:http-version" :status :res[content-length] ":user-agent"'
  )
);

// API responses carry personal data - names, phone numbers, ID photos. Nothing in between,
// and no browser cache on a shared office machine, should keep a copy.
app.use('/api', (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const passSecret = process.env.GATE_PASS_SECRET;
if (!passSecret || passSecret.length < 32) {
  console.warn('⚠️  GATE_PASS_SECRET is missing or shorter than 32 characters: gate passes will fail');
}

// =========================================
// Initialize Firebase
// =========================================

try {
  initializeFirebase();
  console.log('✅ Firebase Admin SDK initialized');
} catch (error) {
  console.error('❌ Failed to initialize Firebase:', (error as Error).message);
  process.exit(1);
}

// =========================================
// Routes
// =========================================

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'VISION Backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  } as ApiResponse);
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes); // Admin console and staff provisioning; admin role required
app.use('/api/gate', gateRoutes); // Walk-in registration and exit scans; security/admin only
app.use('/api/faculty', facultyRoutes); // Faculty directory (password hashes never leave the server)
app.use('/api/visits', visitRoutes); // Visit requests: create, approve/reject, cancel
app.use('/api/passes', passRoutes); // Recurring passes; a visitor's own gate passes
app.use('/api/reports', reportDownloadRouter); // Report downloads by signed, 5-minute link

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Cannot ${req.method} ${req.path}`,
  } as ApiResponse);
});

// Global error handler
app.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  // Body-parser failures are the caller's mistake, not ours, and say so.
  if (err.type === 'entity.too.large') {
    res.status(413).json({ success: false, error: 'Request too large' } as ApiResponse);
    return;
  }
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, error: 'Malformed JSON' } as ApiResponse);
    return;
  }
  if (err.status && err.status >= 400 && err.status < 500) {
    res.status(err.status).json({ success: false, error: 'Bad request' } as ApiResponse);
    return;
  }

  console.error('Server error:', err);

  // The detail is for the developer at the console, never for a caller in production.
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(isDevelopment && { message: err.message, stack: err.stack }),
  } as ApiResponse);
});

// =========================================
// Start Server
// =========================================

const server = app.listen(PORT, () => {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 VISION Backend Server`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Server: http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Auth API: http://localhost:${PORT}/api/auth`);
  console.log(`🚪 Gate API: http://localhost:${PORT}/api/gate`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✅ HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('\n👋 SIGINT signal received: closing HTTP server');
  process.exit(0);
});

export default app;
