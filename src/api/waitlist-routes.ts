/**
 * Waitlist Routes API Handler
 *
 * Handles email signups for:
 * - Marketplace portal notifications
 * - Developer portal early access
 * - Feature interest/voting
 *
 * Stores emails in Firestore for future outreach.
 *
 * @module WaitlistRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';

import * as admin from 'firebase-admin';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { createLogger } from '../utils/safe-logger.js';
import { rateLimit } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody } from './helpers.js';

const log = createLogger({ module: 'waitlist-routes' });

// ============================================================================
// FIREBASE INITIALIZATION
// ============================================================================

/**
 * Ensure Firebase Admin is initialized
 */
function ensureFirebaseInitialized(): void {
  if (admin.apps.length === 0) {
    try {
      admin.initializeApp({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || 'ferni-prod',
      });
    } catch {
      // Already initialized
    }
  }
}

// ============================================================================
// TYPES
// ============================================================================

interface WaitlistSignup {
  email: string;
  source: 'marketplace' | 'developer' | 'feature';
  featureId?: string;
  timestamp: Date;
  userAgent?: string;
  referrer?: string;
}

type WaitlistSource = 'marketplace' | 'developer' | 'feature';

const VALID_SOURCES: WaitlistSource[] = ['marketplace', 'developer', 'feature'];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Validate email format
 */
function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate source parameter
 */
function isValidSource(source: unknown): source is WaitlistSource {
  return typeof source === 'string' && VALID_SOURCES.includes(source as WaitlistSource);
}

/**
 * Hash email for privacy-friendly logging
 */
function hashEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  return `${local.slice(0, 2)}***@${domain}`;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle waitlist-related API routes
 *
 * Supported routes:
 * - POST /api/waitlist - Add email to waitlist
 * - POST /api/waitlist/vote - Vote for a feature
 * - GET /api/waitlist/stats - Get signup stats (admin only)
 *
 * @param req - HTTP request
 * @param res - HTTP response
 * @returns true if route was handled, false otherwise
 */
export async function handleWaitlistRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const { pathname } = url;

  // Only handle /api/waitlist routes
  if (!pathname.startsWith('/api/waitlist')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limit: 5 signups per minute per IP
  if (!rateLimit(req, res, { maxRequests: 5, windowMs: 60000, keyPrefix: 'waitlist' })) {
    return true;
  }

  try {
    // POST /api/waitlist - Add email to waitlist
    if (pathname === '/api/waitlist' && req.method === 'POST') {
      return await handleSignup(req, res);
    }

    // POST /api/waitlist/vote - Vote for a feature
    if (pathname === '/api/waitlist/vote' && req.method === 'POST') {
      return await handleFeatureVote(req, res);
    }

    // GET /api/waitlist/votes/:featureId - Get vote count
    if (pathname.startsWith('/api/waitlist/votes/') && req.method === 'GET') {
      const featureId = pathname.split('/').pop();
      return await handleGetVotes(res, featureId || '');
    }

    // Route not found
    sendJson(res, 404, { error: 'Not found' });
    return true;
  } catch (error) {
    log.error('Error handling waitlist route', { error, pathname });
    sendJson(res, 500, { error: 'Internal server error' });
    return true;
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

/**
 * Handle email signup
 */
async function handleSignup(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseBody<{ email?: string; source?: string }>(req);

  if (!body || !isValidEmail(body.email)) {
    sendJson(res, 400, { error: 'Valid email is required' });
    return true;
  }

  const source = isValidSource(body.source) ? body.source : 'marketplace';

  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    const signup: WaitlistSignup = {
      email: body.email.toLowerCase().trim(),
      source,
      timestamp: new Date(),
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer,
    };

    // Use email as document ID to prevent duplicates
    const docId = Buffer.from(signup.email).toString('base64').replace(/[/+=]/g, '_');

    await db
      .collection('waitlist')
      .doc(docId)
      .set(
        {
          ...signup,
          updatedAt: new Date(),
        },
        { merge: true }
      );

    log.info('Waitlist signup recorded', {
      email: hashEmail(body.email),
      source,
    });

    sendJson(res, 200, {
      success: true,
      message: "You're on the list! We'll be in touch soon.",
    });
    return true;
  } catch (error) {
    log.error('Failed to record waitlist signup', { error });
    sendJson(res, 500, { error: 'Failed to save signup' });
    return true;
  }
}

/**
 * Handle feature vote
 */
async function handleFeatureVote(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseBody<{ featureId?: string; email?: string }>(req);

  if (!body || typeof body.featureId !== 'string' || !body.featureId.trim()) {
    sendJson(res, 400, { error: 'Feature ID is required' });
    return true;
  }

  const featureId = body.featureId.trim();

  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    // Increment vote count atomically
    const featureRef = db.collection('roadmap_votes').doc(featureId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(featureRef);
      const currentVotes = doc.exists ? doc.data()?.votes || 0 : 0;

      transaction.set(
        featureRef,
        {
          featureId,
          votes: currentVotes + 1,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    });

    // If email provided, also save to waitlist
    if (isValidEmail(body.email)) {
      const signup: WaitlistSignup = {
        email: body.email.toLowerCase().trim(),
        source: 'feature',
        featureId,
        timestamp: new Date(),
        userAgent: req.headers['user-agent'],
        referrer: req.headers.referer,
      };

      const docId = Buffer.from(signup.email).toString('base64').replace(/[/+=]/g, '_');
      await db
        .collection('waitlist')
        .doc(docId)
        .set(
          {
            ...signup,
            interestedFeatures: FieldValue.arrayUnion(featureId),
            updatedAt: new Date(),
          },
          { merge: true }
        );
    }

    // Get updated count
    const updatedDoc = await featureRef.get();
    const votes = updatedDoc.data()?.votes || 1;

    log.info('Feature vote recorded', { featureId, votes });

    sendJson(res, 200, {
      success: true,
      votes,
      message: 'Thanks for your interest!',
    });
    return true;
  } catch (error) {
    log.error('Failed to record feature vote', { error, featureId });
    sendJson(res, 500, { error: 'Failed to save vote' });
    return true;
  }
}

/**
 * Get vote count for a feature
 */
async function handleGetVotes(res: ServerResponse, featureId: string): Promise<boolean> {
  if (!featureId) {
    sendJson(res, 400, { error: 'Feature ID is required' });
    return true;
  }

  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    const doc = await db.collection('roadmap_votes').doc(featureId).get();
    const votes = doc.exists ? doc.data()?.votes || 0 : 0;

    sendJson(res, 200, { featureId, votes });
    return true;
  } catch (error) {
    log.error('Failed to get vote count', { error, featureId });
    sendJson(res, 500, { error: 'Failed to get votes' });
    return true;
  }
}
