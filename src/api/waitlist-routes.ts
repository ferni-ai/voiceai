/**
 * Waitlist Routes API Handler
 *
 * Handles email signups for:
 * - Landing page invite-only waitlist
 * - Marketplace portal notifications
 * - Developer portal early access
 * - Feature interest/voting
 *
 * Stores emails in Firestore for future outreach.
 *
 * Admin endpoints for viewing/exporting waitlist:
 * - GET /api/waitlist/admin - List signups (paginated)
 * - GET /api/waitlist/admin/stats - Signup statistics
 * - GET /api/waitlist/admin/export - CSV download
 *
 * @module WaitlistRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';

import admin from 'firebase-admin';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import { rateLimit, requireAdmin } from './auth-middleware.js';
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
      // Use the same project ID pattern as other routes
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for waitlist routes');
      } else {
        // Fall back to ADC (works on Cloud Run)
        admin.initializeApp();
        log.info('Firebase initialized with default credentials for waitlist routes');
      }
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
  phone?: string;
  source: 'landing' | 'marketplace' | 'developer' | 'feature' | 'newsletter';
  featureId?: string;
  timestamp: Date;
  userAgent?: string;
  referrer?: string;
  status?: 'pending' | 'approved' | 'rejected';
  approvedAt?: Date;
  approvedBy?: string;
}

type WaitlistSource = 'landing' | 'marketplace' | 'developer' | 'feature' | 'newsletter';

const VALID_SOURCES: WaitlistSource[] = [
  'landing',
  'marketplace',
  'developer',
  'feature',
  'newsletter',
];

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
  // rateLimit returns true if blocked (response already sent), false if allowed
  if (rateLimit(req, res, { maxRequests: 5, windowMs: 60000, keyPrefix: 'waitlist' })) {
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

    // ========================================================================
    // ADMIN ROUTES (require authentication)
    // ========================================================================

    // GET /api/waitlist/admin/export - CSV download
    if (pathname === '/api/waitlist/admin/export' && req.method === 'GET') {
      const auth = await requireAdmin(req, res);
      if (!auth) return true;
      return await handleAdminExport(res);
    }

    // GET /api/waitlist/admin/stats - Signup statistics
    if (pathname === '/api/waitlist/admin/stats' && req.method === 'GET') {
      const auth = await requireAdmin(req, res);
      if (!auth) return true;
      return await handleAdminStats(res);
    }

    // GET /api/waitlist/admin - List signups (paginated)
    if (pathname === '/api/waitlist/admin' && req.method === 'GET') {
      const auth = await requireAdmin(req, res);
      if (!auth) return true;
      return await handleAdminList(req, res);
    }

    // GET /api/waitlist/approve/:token - One-click approval from email
    if (pathname.startsWith('/api/waitlist/approve/') && req.method === 'GET') {
      const token = pathname.split('/').pop();
      return await handleApproval(req, res, token || '');
    }

    // POST /api/waitlist/approve - Manual approval (admin only)
    if (pathname === '/api/waitlist/approve' && req.method === 'POST') {
      const auth = await requireAdmin(req, res);
      if (!auth) return true;
      return await handleManualApproval(req, res);
    }

    // GET /api/waitlist/check - Check if authenticated user has access
    if (pathname === '/api/waitlist/check' && req.method === 'GET') {
      return await handleCheckAccess(req, res);
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
  const body = await parseBody<{ email?: string; phone?: string; source?: string }>(req);

  if (!body || !isValidEmail(body.email)) {
    sendJson(res, 400, { error: 'Valid email is required' });
    return true;
  }

  const source = isValidSource(body.source) ? body.source : 'marketplace';

  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    // Filter out undefined values - Firestore rejects undefined
    const signup: WaitlistSignup = {
      email: body.email.toLowerCase().trim(),
      source,
      timestamp: new Date(),
      status: 'pending',
      ...(body.phone && { phone: body.phone.trim() }),
      ...(req.headers['user-agent'] && { userAgent: req.headers['user-agent'] }),
      ...(req.headers.referer && { referrer: req.headers.referer }),
    };

    // Use email as document ID to prevent duplicates
    const docId = Buffer.from(signup.email).toString('base64').replace(/[/+=]/g, '_');

    await db
      .collection('waitlist')
      .doc(docId)
      .set(
        cleanForFirestore({
          ...signup,
          updatedAt: new Date(),
        }),
        { merge: true }
      );

    log.info('Waitlist signup recorded', {
      email: hashEmail(body.email),
      source,
      hasPhone: !!body.phone,
    });

    // Send admin notification (fire-and-forget)
    void notifyAdminOfSignup(signup.email, source, signup.phone).catch((err) => {
      log.warn({ error: String(err) }, 'Failed to send admin notification');
    });

    // For newsletter signups, send welcome email immediately (no approval needed)
    if (source === 'newsletter') {
      void sendNewsletterWelcomeEmail(signup.email).catch((err) => {
        log.warn({ error: String(err) }, 'Failed to send newsletter welcome email');
      });

      sendJson(res, 200, {
        success: true,
        message: "You're subscribed! Check your inbox for a welcome email.",
      });
      return true;
    }

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

    // Increment vote count atomically (using feature stats collection)
    const featureRef = db.collection('roadmap_feature_stats').doc(featureId);

    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(featureRef);
      const currentVotes = doc.exists ? doc.data()?.votes || 0 : 0;

      transaction.set(
        featureRef,
        cleanForFirestore({
          featureId,
          votes: currentVotes + 1,
          updatedAt: new Date(),
        }),
        { merge: true }
      );
    });

    // If email provided, also save to waitlist
    if (isValidEmail(body.email)) {
      // Filter out undefined values - Firestore rejects undefined
      const signup: WaitlistSignup = {
        email: body.email.toLowerCase().trim(),
        source: 'feature',
        featureId,
        timestamp: new Date(),
        ...(req.headers['user-agent'] && { userAgent: req.headers['user-agent'] }),
        ...(req.headers.referer && { referrer: req.headers.referer }),
      };

      const docId = Buffer.from(signup.email).toString('base64').replace(/[/+=]/g, '_');
      await db
        .collection('waitlist')
        .doc(docId)
        .set(
          cleanForFirestore({
            ...signup,
            interestedFeatures: FieldValue.arrayUnion(featureId),
            updatedAt: new Date(),
          }),
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

    const doc = await db.collection('roadmap_feature_stats').doc(featureId).get();
    const votes = doc.exists ? doc.data()?.votes || 0 : 0;

    sendJson(res, 200, { featureId, votes });
    return true;
  } catch (error) {
    log.error('Failed to get vote count', { error, featureId });
    sendJson(res, 500, { error: 'Failed to get votes' });
    return true;
  }
}

// ============================================================================
// ACCESS CHECK
// ============================================================================

/**
 * Check if authenticated user has app access.
 * Verifies Firebase ID token and checks waitlist/approval status.
 */
async function handleCheckAccess(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    sendJson(res, 401, { error: 'Missing authorization token' });
    return true;
  }

  const idToken = authHeader.slice(7);

  // Debug: Log token info (NOT the full token for security)
  log.info(
    {
      tokenLength: idToken.length,
      tokenStart: `${idToken.slice(0, 20)}...`,
      hasThreeParts: idToken.split('.').length === 3,
    },
    'Checking waitlist access'
  );

  try {
    ensureFirebaseInitialized();
    const auth = admin.auth();
    const db = getFirestore();

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(idToken);
    const email = decodedToken.email?.toLowerCase().trim();

    if (!email) {
      log.warn({ uid: decodedToken.uid }, 'User signed in without email');
      sendJson(res, 200, {
        approved: false,
        status: 'no_email',
        message: 'Please sign in with an account that has an email address.',
      });
      return true;
    }

    // =========================================================================
    // ADMIN BYPASS - Founders/admins should NEVER be blocked
    // =========================================================================
    if (ADMIN_BYPASS_EMAILS.includes(email)) {
      log.info({ email: hashEmail(email) }, '👑 Admin bypass - auto-approved');
      sendJson(res, 200, {
        approved: true,
        status: 'approved',
        tier: 'partner',
        email,
        message: 'Welcome back, boss! 👑',
      });
      return true;
    }

    // Check user_profiles for existing access (from approval)
    const profileDocId = Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');
    const profileDoc = await db.collection('user_profiles').doc(profileDocId).get();

    if (profileDoc.exists) {
      const profile = profileDoc.data();
      if (profile?.subscription?.status === 'active') {
        log.info({ email: hashEmail(email) }, 'User has active subscription');
        sendJson(res, 200, {
          approved: true,
          status: 'approved',
          tier: profile.subscription.tier || 'friend',
          email,
        });
        return true;
      }
    }

    // Also check bogle_users collection (alternative profile storage)
    const bogleQuery = await db
      .collection('bogle_users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!bogleQuery.empty) {
      const bogleProfile = bogleQuery.docs[0].data();
      if (bogleProfile?.subscription?.status === 'active') {
        log.info({ email: hashEmail(email) }, 'User has active subscription in bogle_users');
        sendJson(res, 200, {
          approved: true,
          status: 'approved',
          tier: bogleProfile.subscription.tier || 'friend',
          email,
        });
        return true;
      }
    }

    // Check waitlist status
    const waitlistDocId = Buffer.from(email).toString('base64').replace(/[/+=]/g, '_');
    const waitlistDoc = await db.collection('waitlist').doc(waitlistDocId).get();

    if (waitlistDoc.exists) {
      const waitlistData = waitlistDoc.data();
      if (waitlistData?.status === 'approved') {
        // Approved but no profile yet - create one now
        await db
          .collection('user_profiles')
          .doc(profileDocId)
          .set(
            cleanForFirestore({
              email,
              firebaseUid: decodedToken.uid,
              subscription: {
                tier: 'partner',
                status: 'active',
                subscribedAt: new Date(),
                currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10),
                grantedVia: 'waitlist-approval-auto',
              },
              createdAt: new Date(),
              updatedAt: new Date(),
            }),
            { merge: true }
          );

        log.info({ email: hashEmail(email) }, 'Auto-created profile for approved waitlist user');
        sendJson(res, 200, {
          approved: true,
          status: 'approved',
          tier: 'partner',
          email,
        });
        return true;
      }

      // On waitlist but pending
      log.info({ email: hashEmail(email) }, 'User on waitlist, pending approval');
      sendJson(res, 200, {
        approved: false,
        status: 'pending',
        email,
        message: "You're on the waitlist! We'll notify you when it's your turn.",
      });
      return true;
    }

    // Not on waitlist - add them automatically
    await db
      .collection('waitlist')
      .doc(waitlistDocId)
      .set(
        cleanForFirestore({
          email,
          status: 'pending',
          source: 'app_signin',
          timestamp: new Date(),
          createdAt: new Date(),
        })
      );

    log.info({ email: hashEmail(email) }, 'Auto-added user to waitlist on sign-in');
    sendJson(res, 200, {
      approved: false,
      status: 'pending',
      email,
      message: "You've been added to the waitlist! We'll notify you when it's your turn.",
    });
    return true;
  } catch (error) {
    log.error('Failed to check access', { error });
    sendJson(res, 500, { error: 'Failed to verify access' });
    return true;
  }
}

// ============================================================================
// ADMIN NOTIFICATIONS
// ============================================================================

/**
 * Emails to notify about new signups (comma-separated list)
 */
const ADMIN_NOTIFICATION_EMAILS: string[] = (
  process.env.WAITLIST_ADMIN_EMAIL || 'noreply@ferni.ai,admin@ferni.ai'
)
  .split(',')
  .map((e) => e.trim())
  .filter(Boolean);

/**
 * Admin emails that bypass waitlist entirely (auto-approved)
 * These are the owners/founders who should NEVER be blocked
 */
const ADMIN_BYPASS_EMAILS: string[] = [
  'noreply@ferni.ai',
  'sethford@gmail.com',
  'seth.ford@gmail.com', // Gmail treats dots as optional, but we check exact strings
  'admin@ferni.ai',
];

/**
 * Secret for generating approval tokens
 */
const APPROVAL_SECRET = process.env.WAITLIST_APPROVAL_SECRET || 'ferni-waitlist-2025';

/**
 * Generate a secure approval token for one-click approve
 */
function generateApprovalToken(email: string): string {
  const data = `${email}:${APPROVAL_SECRET}:${Math.floor(Date.now() / (1000 * 60 * 60 * 24))}`; // Valid for 24h
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Verify approval token
 */
function verifyApprovalToken(email: string, token: string): boolean {
  // Check current day and previous day (in case of rollover)
  const todayToken = generateApprovalToken(email);
  if (token === todayToken) return true;

  // Check yesterday's token
  const yesterdayData = `${email}:${APPROVAL_SECRET}:${Math.floor(Date.now() / (1000 * 60 * 60 * 24)) - 1}`;
  const yesterdayToken = crypto
    .createHash('sha256')
    .update(yesterdayData)
    .digest('hex')
    .substring(0, 32);
  return token === yesterdayToken;
}

/**
 * Send notification to admin when someone joins the waitlist
 */
async function notifyAdminOfSignup(email: string, source: string, phone?: string): Promise<void> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ferni.ai';

  if (!sendgridApiKey) {
    log.debug('SendGrid not configured, skipping admin notification');
    return;
  }

  // Generate one-click approval token
  const approvalToken = generateApprovalToken(email);
  const approveUrl = `https://app.ferni.ai/api/waitlist/approve/${approvalToken}?email=${encodeURIComponent(email)}`;

  const subject = phone
    ? `🌿 New Waitlist Signup (with phone!): ${email}`
    : `🌿 New Waitlist Signup: ${email}`;
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/Denver' });

  const phoneSection = phone
    ? `<div class="detail">
        <span class="label">Phone:</span>
        <span class="value">${phone}</span>
        <span class="phone-note">📞 Ferni can personally call to welcome them!</span>
      </div>`
    : '';

  const phoneText = phone ? `Phone: ${phone} (Ferni can personally call!)` : '';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; color: #2C2520; }
    .container { max-width: 500px; margin: 20px auto; padding: 20px; }
    .card { background: #fff; border: 1px solid #e8e2da; border-radius: 12px; padding: 24px; }
    h1 { font-size: 20px; color: #4a6741; margin: 0 0 16px; }
    .detail { margin: 8px 0; }
    .label { color: #756a5e; font-size: 13px; }
    .value { font-weight: 600; color: #2C2520; }
    .phone-note { display: block; font-size: 12px; color: #4a6741; margin-top: 4px; }
    .actions { margin-top: 24px; padding-top: 16px; border-top: 1px solid #e8e2da; }
    .btn { display: inline-block; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-right: 8px; margin-bottom: 8px; }
    .btn-approve { background: #4a6741; color: #fff !important; }
    .btn-secondary { background: #5c544a; color: #fff !important; }
    .approve-note { font-size: 12px; color: #756a5e; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>🌿 New Waitlist Signup!</h1>
      <div class="detail">
        <span class="label">Email:</span>
        <span class="value">${email}</span>
      </div>
      ${phoneSection}
      <div class="detail">
        <span class="label">Source:</span>
        <span class="value">${source}</span>
      </div>
      <div class="detail">
        <span class="label">Time:</span>
        <span class="value">${timestamp}</span>
      </div>
      <div class="actions">
        <a href="${approveUrl}" class="btn btn-approve">✅ Approve & Grant Access</a>
        <a href="https://ferni.ai/admin/waitlist/" class="btn btn-secondary">View Waitlist</a>
        <p class="approve-note">One-click approval grants full app access${phone ? ' and triggers a welcome call from Ferni' : ''}. Link expires in 24 hours.</p>
      </div>
    </div>
  </div>
</body>
</html>`;

  const text = `New Waitlist Signup!

Email: ${email}
${phoneText}
Source: ${source}
Time: ${timestamp}

APPROVE NOW: ${approveUrl}

View waitlist: https://ferni.ai/admin/waitlist/`;

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: ADMIN_NOTIFICATION_EMAILS.map((e) => ({ email: e })) }],
        from: { email: fromEmail, name: 'Ferni Waitlist' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (response.status === 202) {
      log.info(
        { adminEmail: ADMIN_NOTIFICATION_EMAILS },
        'Admin notification sent for waitlist signup'
      );
    } else {
      log.warn({ status: response.status }, 'Failed to send admin notification');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Error sending admin notification');
  }
}

// ============================================================================
// APPROVAL HANDLERS
// ============================================================================

/**
 * Handle one-click approval from email link
 */
async function handleApproval(
  req: IncomingMessage,
  res: ServerResponse,
  token: string
): Promise<boolean> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const email = url.searchParams.get('email');

  if (!email || !token) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end(generateApprovalResultPage(false, 'Invalid approval link'));
    return true;
  }

  // Verify the token
  if (!verifyApprovalToken(email, token)) {
    res.writeHead(403, { 'Content-Type': 'text/html' });
    res.end(generateApprovalResultPage(false, 'Approval link has expired or is invalid'));
    return true;
  }

  try {
    const result = await approveUserAndGrantAccess(email, 'email-link');

    if (result.success) {
      log.info(
        { email: hashEmail(email), phone: result.phone ? '***' : null },
        'User approved via email link'
      );

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        generateApprovalResultPage(
          true,
          `${email} has been approved!`,
          result.phone
            ? 'Ferni will personally call to welcome them shortly. 🌿'
            : "They'll receive a welcome email. 🌿"
        )
      );
    } else {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(generateApprovalResultPage(false, result.error || 'Failed to approve user'));
    }

    return true;
  } catch (error) {
    log.error('Failed to approve user', { error, email: hashEmail(email) });
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(generateApprovalResultPage(false, 'Something went wrong. Please try again.'));
    return true;
  }
}

/**
 * Handle manual approval via admin API
 */
async function handleManualApproval(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const body = await parseBody<{ email?: string }>(req);

  if (!body || !isValidEmail(body.email)) {
    sendJson(res, 400, { error: 'Valid email is required' });
    return true;
  }

  try {
    const result = await approveUserAndGrantAccess(body.email, 'admin-api');

    if (result.success) {
      log.info({ email: hashEmail(body.email) }, 'User approved via admin API');
      sendJson(res, 200, {
        success: true,
        message: `${body.email} has been approved and granted access`,
        welcomeCallScheduled: !!result.phone,
      });
    } else {
      sendJson(res, 400, { error: result.error || 'Failed to approve user' });
    }

    return true;
  } catch (error) {
    log.error('Failed to approve user via API', { error });
    sendJson(res, 500, { error: 'Failed to approve user' });
    return true;
  }
}

/**
 * Core approval logic - grants access and triggers welcome call if phone provided
 */
async function approveUserAndGrantAccess(
  email: string,
  approvedBy: string
): Promise<{ success: boolean; phone?: string; error?: string }> {
  ensureFirebaseInitialized();
  const db = getFirestore();

  // Find the waitlist entry
  const docId = Buffer.from(email.toLowerCase().trim()).toString('base64').replace(/[/+=]/g, '_');
  const waitlistRef = db.collection('waitlist').doc(docId);
  const waitlistDoc = await waitlistRef.get();

  if (!waitlistDoc.exists) {
    return { success: false, error: 'User not found on waitlist' };
  }

  const waitlistData = waitlistDoc.data() as WaitlistSignup;

  if (waitlistData.status === 'approved') {
    return { success: false, error: 'User already approved' };
  }

  // Update waitlist status
  await waitlistRef.update(
    cleanForFirestore({
      status: 'approved',
      approvedAt: new Date(),
      approvedBy,
    })
  );

  // Grant app access by creating/updating user profile with partner tier
  // Use email as a consistent user ID (base64 encoded)
  const userId = docId;

  const profileRef = db.collection('user_profiles').doc(userId);
  await profileRef.set(
    cleanForFirestore({
      email: email.toLowerCase().trim(),
      phone: waitlistData.phone || null,
      subscription: {
        tier: 'partner',
        status: 'active',
        subscribedAt: new Date(),
        currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 10), // 10 years
        inTrial: false,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        grantedVia: 'waitlist-approval',
        monthlyUsage: {
          conversationCount: 0,
          minutesTalked: 0,
          lastUpdated: new Date(),
        },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    { merge: true }
  );

  log.info({ email: hashEmail(email), userId }, 'User granted partner tier access');

  // Trigger welcome call or email
  if (waitlistData.phone) {
    // Fire-and-forget: trigger Ferni welcome call
    void triggerWelcomeCall(email, waitlistData.phone).catch((err) => {
      log.warn({ error: String(err) }, 'Failed to trigger welcome call');
    });
  } else {
    // Fire-and-forget: send welcome email
    void sendWelcomeEmail(email).catch((err) => {
      log.warn({ error: String(err) }, 'Failed to send welcome email');
    });
  }

  return { success: true, phone: waitlistData.phone };
}

/**
 * Trigger a welcome call from Ferni using Cartesia voice + Twilio
 */
async function triggerWelcomeCall(email: string, phone: string): Promise<void> {
  log.info({ email: hashEmail(email), phone: `${phone.slice(0, 4)}***` }, 'Welcome call initiated');

  // Import the voice call service dynamically to avoid circular deps
  const { callWithPersonaVoice } = await import('../services/voice/voice-call.js');

  // Craft a warm, personal welcome message from Ferni
  const welcomeMessage = `
Hey there! It's Ferni. I'm so glad you're here.

I wanted to personally welcome you to our little corner of the world.
Your account is all set up and ready to go.

Whenever you're ready, just head over to app dot ferni dot a i, and we can start talking.

No rush. I'm here whenever you need me.

Take care of yourself, okay? I'll see you soon.
  `.trim();

  try {
    const result = await callWithPersonaVoice(phone, welcomeMessage, 'ferni', {
      customGreeting: "Hey! It's Ferni calling.",
      fallbackToTwilioVoice: true,
    });

    if (result.success) {
      log.info(
        {
          email: hashEmail(email),
          callSid: result.callSid,
          usedCartesiaVoice: result.usedCartesiaVoice,
        },
        '✅ Ferni welcome call initiated'
      );

      // Notify admin that call was made
      await notifyAdminOfWelcomeCall(
        email,
        phone,
        result.callSid || 'unknown',
        result.usedCartesiaVoice || false
      );
    } else {
      log.warn({ email: hashEmail(email), error: result.message }, 'Welcome call failed');

      // Fall back to email notification
      await notifyAdminOfWelcomeCallFailure(email, phone, result.message);
    }
  } catch (error) {
    log.error({ error: String(error), email: hashEmail(email) }, 'Welcome call error');
    await notifyAdminOfWelcomeCallFailure(email, phone, String(error));
  }
}

/**
 * Notify admin that a welcome call was successfully made
 */
async function notifyAdminOfWelcomeCall(
  email: string,
  phone: string,
  callSid: string,
  usedCartesiaVoice: boolean
): Promise<void> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ferni.ai';

  if (!sendgridApiKey) return;

  const voiceType = usedCartesiaVoice ? "Ferni's real voice (Cartesia)" : 'Twilio fallback voice';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; color: #2C2520; }
    .container { max-width: 500px; margin: 20px auto; padding: 20px; }
    .card { background: #f0f8f0; border: 2px solid #4a6741; border-radius: 12px; padding: 24px; }
    h1 { font-size: 18px; color: #4a6741; margin: 0 0 16px; }
    .detail { margin: 8px 0; }
    .label { color: #756a5e; font-size: 13px; }
    .value { font-weight: 600; color: #2C2520; }
    .success { color: #4a6741; font-size: 14px; margin-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>📞 ✅ Ferni Welcome Call SENT!</h1>
      <p class="success">Ferni just called to personally welcome this new user!</p>
      <div class="detail">
        <span class="label">Email:</span>
        <span class="value">${email}</span>
      </div>
      <div class="detail">
        <span class="label">Phone:</span>
        <span class="value">${phone}</span>
      </div>
      <div class="detail">
        <span class="label">Voice:</span>
        <span class="value">${voiceType}</span>
      </div>
      <div class="detail">
        <span class="label">Call SID:</span>
        <span class="value">${callSid}</span>
      </div>
    </div>
  </div>
</body>
</html>`;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: ADMIN_NOTIFICATION_EMAILS.map((e) => ({ email: e })) }],
      from: { email: fromEmail, name: 'Ferni' },
      subject: `📞 ✅ Welcome Call Made: ${email}`,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

/**
 * Notify admin that a welcome call failed
 */
async function notifyAdminOfWelcomeCallFailure(
  email: string,
  phone: string,
  error: string
): Promise<void> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ferni.ai';

  if (!sendgridApiKey) return;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.6; color: #2C2520; }
    .container { max-width: 500px; margin: 20px auto; padding: 20px; }
    .card { background: #fff8f0; border: 2px solid #dc3545; border-radius: 12px; padding: 24px; }
    h1 { font-size: 18px; color: #dc3545; margin: 0 0 16px; }
    .detail { margin: 8px 0; }
    .label { color: #756a5e; font-size: 13px; }
    .value { font-weight: 600; color: #2C2520; }
    .error { color: #dc3545; font-size: 13px; margin-top: 12px; padding: 8px; background: #ffeef0; border-radius: 6px; }
    .fallback { margin-top: 16px; padding: 12px; background: #f8f8f8; border-radius: 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>📞 ⚠️ Welcome Call Failed</h1>
      <p>The automated welcome call couldn't be completed. User still has app access.</p>
      <div class="detail">
        <span class="label">Email:</span>
        <span class="value">${email}</span>
      </div>
      <div class="detail">
        <span class="label">Phone:</span>
        <span class="value">${phone}</span>
      </div>
      <div class="error">Error: ${error}</div>
      <div class="fallback">
        <strong>Manual options:</strong><br>
        • Call them at <a href="tel:${phone}">${phone}</a><br>
        • Send a manual welcome email
      </div>
    </div>
  </div>
</body>
</html>`;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: ADMIN_NOTIFICATION_EMAILS.map((e) => ({ email: e })) }],
      from: { email: fromEmail, name: 'Ferni' },
      subject: `⚠️ Welcome Call Failed: ${email}`,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

/**
 * Send welcome email when no phone provided
 */
async function sendWelcomeEmail(email: string): Promise<void> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ferni.ai';

  if (!sendgridApiKey) {
    log.debug('SendGrid not configured, skipping welcome email');
    return;
  }

  const appUrl = 'https://app.ferni.ai';

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.8; color: #2C2520; background: #FFFDFB; }
    .container { max-width: 500px; margin: 40px auto; padding: 20px; }
    .card { background: #fff; border: 1px solid #e8e2da; border-radius: 16px; padding: 32px; }
    .avatar { width: 64px; height: 64px; background: linear-gradient(145deg, #4a6741, #3D5A45); border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center; }
    .avatar svg { width: 48px; height: 48px; }
    h1 { font-size: 24px; color: #2C2520; margin: 0 0 8px; text-align: center; }
    .subtitle { color: #756a5e; text-align: center; margin-bottom: 24px; }
    p { color: #4a4540; margin: 16px 0; }
    .cta { display: block; background: #4a6741; color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 10px; font-size: 16px; font-weight: 600; text-align: center; margin: 24px 0; }
    .footer { font-size: 13px; color: #9a9590; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="avatar">
        <svg viewBox="0 0 100 100"><ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/><circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/><ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/><circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/></svg>
      </div>
      <h1>You're in! 🌿</h1>
      <p class="subtitle">Welcome to Ferni</p>
      <p>Hey there,</p>
      <p>I'm so glad you're here. I've been looking forward to meeting you.</p>
      <p>Ferni is a place where you can talk through anything—big decisions, daily frustrations, or just the feeling of being stuck. I'm not here to fix you (you're not broken). I'm here to help you think out loud, see patterns you might miss, and remind you of your own wisdom.</p>
      <p>Ready to start a conversation?</p>
      <a href="${appUrl}" class="cta">Open Ferni</a>
      <p class="footer">Just hit reply if you need anything. I'm here. 🌱</p>
    </div>
  </div>
</body>
</html>`;

  const text = `You're in! 🌿

Welcome to Ferni.

Hey there,

I'm so glad you're here. I've been looking forward to meeting you.

Ferni is a place where you can talk through anything—big decisions, daily frustrations, or just the feeling of being stuck. I'm not here to fix you (you're not broken). I'm here to help you think out loud, see patterns you might miss, and remind you of your own wisdom.

Ready to start a conversation?

Open Ferni: ${appUrl}

Just reply if you need anything. I'm here. 🌱`;

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: fromEmail, name: 'Ferni' },
        subject: "You're in! Welcome to Ferni 🌿",
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (response.status === 202) {
      log.info({ email: hashEmail(email) }, 'Welcome email sent');
    } else {
      log.warn({ status: response.status }, 'Failed to send welcome email');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Error sending welcome email');
  }
}

/**
 * Extract a likely first name from an email address
 * e.g., "noreply@ferni.ai" → "Seth"
 *       "john_doe@example.com" → "John"
 *       "marketing@company.com" → null (generic)
 */
function extractNameFromEmail(email: string): string | null {
  const localPart = email.split('@')[0]?.toLowerCase() || '';

  // Skip generic/functional emails
  const genericPrefixes = [
    'info',
    'contact',
    'hello',
    'admin',
    'support',
    'sales',
    'marketing',
    'team',
    'noreply',
    'no-reply',
    'notifications',
    'newsletter',
    'test',
  ];
  if (genericPrefixes.some((prefix) => localPart.startsWith(prefix))) {
    return null;
  }

  // Extract first name from common patterns
  // "firstname.lastname" → "firstname"
  // "firstname_lastname" → "firstname"
  // "firstnamelastname" → try to detect (harder)
  const separators = /[._-]/;
  const parts = localPart.split(separators);
  const firstName = parts[0];

  // Skip if it's just numbers or too short
  if (!firstName || firstName.length < 2 || /^\d+$/.test(firstName)) {
    return null;
  }

  // Capitalize first letter
  return firstName.charAt(0).toUpperCase() + firstName.slice(1);
}

/**
 * Get a warm, time-aware greeting
 */
function getTimeBasedGreeting(): string {
  const hour = new Date().getUTCHours();
  // Assume US-centric timing (UTC-5 to UTC-8)
  const adjustedHour = (hour - 6 + 24) % 24; // Roughly central time

  if (adjustedHour >= 5 && adjustedHour < 12) {
    return 'Good morning';
  } else if (adjustedHour >= 12 && adjustedHour < 17) {
    return 'Good afternoon';
  } else {
    return 'Good evening';
  }
}

/**
 * Featured blog posts to recommend (rotate through these)
 */
const FEATURED_POSTS = [
  {
    title: 'Why Voice-First AI Changes Everything',
    url: '/blog/why-voice-first/',
    excerpt: "There's something different about talking to AI instead of typing.",
  },
  {
    title: 'How Ferni Remembers You',
    url: '/blog/how-ferni-remembers-you/',
    excerpt: 'Building memory systems that make AI feel like it truly knows you.',
  },
  {
    title: 'The Loneliness Gap',
    url: '/blog/the-loneliness-gap/',
    excerpt: "Why we're building AI that makes you feel less alone, not more.",
  },
  {
    title: 'Giving AI a Personality',
    url: '/blog/giving-ai-a-personality/',
    excerpt: 'The design decisions behind making AI companions feel real.',
  },
];

/**
 * Get a featured blog post (rotates based on day)
 */
function getFeaturedPost(): (typeof FEATURED_POSTS)[0] {
  const dayOfYear = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
  return FEATURED_POSTS[dayOfYear % FEATURED_POSTS.length];
}

/**
 * Personal sign-off variations for warmth
 */
const PERSONAL_SIGNOFFS = [
  { name: 'Ferni', role: null },
  { name: 'The Ferni Team', role: null },
  { name: 'Your friends at Ferni', role: null },
  { name: 'The Ferni Team', role: null },
];

function getPersonalSignoff(): { name: string; role: string | null } {
  const index = Math.floor(Math.random() * PERSONAL_SIGNOFFS.length);
  return PERSONAL_SIGNOFFS[index];
}

/**
 * Send newsletter subscription confirmation email with deep personalization
 */
async function sendNewsletterWelcomeEmail(email: string): Promise<void> {
  const sendgridApiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@ferni.ai';

  if (!sendgridApiKey) {
    log.debug('SendGrid not configured, skipping newsletter welcome email');
    return;
  }

  // Deep personalization elements
  const firstName = extractNameFromEmail(email);
  const greeting = getTimeBasedGreeting();
  const featuredPost = getFeaturedPost();
  const signoff = getPersonalSignoff();

  // Personalized greeting
  const personalGreeting = firstName ? `${greeting}, ${firstName}!` : `${greeting}!`;

  // Personalized headline
  const headline = firstName ? `Welcome, ${firstName}.` : `You're in.`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, system-ui, sans-serif; line-height: 1.8; color: #2C2520; background: #F5F1E8; }
    .container { max-width: 560px; margin: 40px auto; padding: 20px; }
    .card { background: #ffffff; border-radius: 16px; padding: 48px; box-shadow: 0 4px 24px rgba(74, 103, 65, 0.08); }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo svg { width: 64px; height: 64px; }
    h1 { font-size: 28px; color: #2C2520; margin: 0 0 8px; text-align: center; font-weight: 600; }
    .subtitle { color: #6B5C4D; text-align: center; margin-bottom: 32px; font-size: 16px; }
    p { color: #4a4540; margin: 16px 0; }
    .what-to-expect { background: rgba(74, 103, 65, 0.05); border-radius: 12px; padding: 24px; margin: 24px 0; }
    .what-to-expect h3 { color: #4a6741; margin: 0 0 12px; font-size: 16px; font-weight: 600; }
    .what-to-expect ul { margin: 0; padding-left: 20px; color: #4a4540; }
    .what-to-expect li { margin: 8px 0; }
    .cta { display: block; background: #3D5A45; color: #fff !important; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-size: 16px; font-weight: 500; text-align: center; margin: 24px 0; }
    .cta:hover { background: #4a6741; }
    .featured { background: #fff; border: 1px solid #E5DFD6; border-radius: 12px; padding: 20px; margin: 24px 0; }
    .featured-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #9A8B7A; margin-bottom: 8px; }
    .featured-title { font-size: 18px; font-weight: 600; color: #2C2520; margin: 0 0 8px; }
    .featured-title a { color: #2C2520; text-decoration: none; }
    .featured-title a:hover { color: #4a6741; }
    .featured-excerpt { color: #6B5C4D; font-size: 14px; margin: 0; }
    .signoff { margin-top: 24px; }
    .signoff-name { font-weight: 500; color: #2C2520; }
    .signoff-role { font-size: 13px; color: #9A8B7A; }
    .footer { font-size: 13px; color: #9A8B7A; text-align: center; margin-top: 24px; border-top: 1px solid #E5DFD6; padding-top: 24px; }
    .footer a { color: #4a6741; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="45" fill="#4a6741"/>
          <ellipse cx="36" cy="50" rx="10" ry="12" fill="white"/>
          <circle cx="33" cy="45" r="2.5" fill="white" opacity="0.9"/>
          <ellipse cx="64" cy="50" rx="10" ry="12" fill="white"/>
          <circle cx="61" cy="45" r="2.5" fill="white" opacity="0.9"/>
        </svg>
      </div>
      <h1>${headline}</h1>
      <p class="subtitle">${personalGreeting} Thanks for joining our community.</p>

      <div class="what-to-expect">
        <h3>What you'll get:</h3>
        <ul>
          <li>New blog posts about AI coaching, personal growth, and building Ferni</li>
          <li>Product updates when we ship something meaningful</li>
          <li>Occasionally, something we think you'll find genuinely useful</li>
        </ul>
      </div>

      <div class="featured">
        <div class="featured-label">Start here</div>
        <h4 class="featured-title"><a href="https://ferni.ai${featuredPost.url}">${featuredPost.title}</a></h4>
        <p class="featured-excerpt">${featuredPost.excerpt}</p>
      </div>

      <p>We respect your inbox. No spam, no daily newsletters, no stuff that wastes your time.</p>

      <p>If you ever want to chat, just reply to any email. We read everything.</p>

      <a href="https://ferni.ai/blog/" class="cta">Explore the Blog</a>

      <div class="signoff">
        <span class="signoff-name">${signoff.name}</span>${signoff.role ? `<br><span class="signoff-role">${signoff.role}</span>` : ''}
      </div>

      <p class="footer">
        <a href="https://ferni.ai">ferni.ai</a> · Building AI that feels human
      </p>
    </div>
  </div>
</body>
</html>`;

  const text = `${headline}

${personalGreeting} Thanks for joining our community.

What you'll get:
- New blog posts about AI coaching, personal growth, and building Ferni
- Product updates when we ship something meaningful
- Occasionally, something we think you'll find genuinely useful

START HERE: ${featuredPost.title}
${featuredPost.excerpt}
https://ferni.ai${featuredPost.url}

We respect your inbox. No spam, no daily newsletters, no stuff that wastes your time.

If you ever want to chat, just reply to any email. We read everything.

Explore the blog: https://ferni.ai/blog/

${signoff.name}${signoff.role ? `\n${signoff.role}` : ''}
ferni.ai - Building AI that feels human`;

  // Personalized subject line
  const subject = firstName ? `Welcome to Ferni, ${firstName}` : 'Welcome to Ferni';

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: fromEmail, name: 'Ferni' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (response.status === 202) {
      log.info(
        { email: hashEmail(email), personalized: !!firstName },
        'Newsletter welcome email sent'
      );
    } else {
      log.warn({ status: response.status }, 'Failed to send newsletter welcome email');
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Error sending newsletter welcome email');
  }
}

/**
 * Generate a nice HTML page showing approval result
 */
function generateApprovalResultPage(
  success: boolean,
  message: string,
  subMessage?: string
): string {
  const icon = success
    ? `<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#4a6741" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="8 12 11 15 16 9"/>
      </svg>`
    : `<svg viewBox="0 0 24 24" width="64" height="64" fill="none" stroke="#dc3545" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${success ? 'Approved!' : 'Error'} - Ferni Waitlist</title>
  <style>
    body {
      font-family: -apple-system, system-ui, sans-serif;
      background: #FFFDFB;
      color: #2C2520;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: #fff;
      border: 1px solid #e8e2da;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
      max-width: 400px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .icon { margin-bottom: 20px; }
    h1 {
      font-size: 24px;
      margin: 0 0 12px;
      color: ${success ? '#4a6741' : '#dc3545'};
    }
    p { color: #756a5e; margin: 8px 0; }
    .sub { font-size: 14px; }
    .btn {
      display: inline-block;
      background: #4a6741;
      color: #fff;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      margin-top: 20px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${success ? 'Approved!' : 'Oops!'}</h1>
    <p>${message}</p>
    ${subMessage ? `<p class="sub">${subMessage}</p>` : ''}
    <a href="https://ferni.ai/admin/waitlist/" class="btn">Back to Waitlist</a>
  </div>
</body>
</html>`;
}

// ============================================================================
// ADMIN HANDLERS
// ============================================================================

/**
 * List all waitlist signups (paginated)
 */
async function handleAdminList(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 250);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const source = url.searchParams.get('source');

    let query = db.collection('waitlist').orderBy('timestamp', 'desc');

    // Filter by source if provided
    if (source && VALID_SOURCES.includes(source as WaitlistSource)) {
      query = query.where('source', '==', source);
    }

    const snapshot = await query.limit(limit).offset(offset).get();

    const entries = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data.email,
        phone: data.phone || null,
        status: data.status || 'pending',
        source: data.source,
        timestamp: data.timestamp?.toDate?.().toISOString() || data.timestamp,
        referrer: data.referrer,
        approvedAt: data.approvedAt?.toDate?.().toISOString() || null,
      };
    });

    // Get total count
    const countQuery = source
      ? db.collection('waitlist').where('source', '==', source)
      : db.collection('waitlist');
    const countSnapshot = await countQuery.count().get();
    const total = countSnapshot.data().count;

    log.info('Admin fetched waitlist', { count: entries.length, total, source });

    sendJson(res, 200, {
      entries,
      total,
      limit,
      offset,
      hasMore: offset + entries.length < total,
    });
    return true;
  } catch (error) {
    log.error('Failed to fetch waitlist', { error });
    sendJson(res, 500, { error: 'Failed to fetch waitlist' });
    return true;
  }
}

/**
 * Get waitlist signup statistics
 */
async function handleAdminStats(res: ServerResponse): Promise<boolean> {
  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    // Get total count
    const countSnapshot = await db.collection('waitlist').count().get();
    const total = countSnapshot.data().count;

    // Get signups by day (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSnapshot = await db
      .collection('waitlist')
      .where('timestamp', '>=', sevenDaysAgo)
      .get();

    const byDay: Record<string, number> = {};
    const bySource: Record<string, number> = {};

    recentSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const date = data.timestamp?.toDate?.();
      if (date) {
        const key = date.toISOString().split('T')[0];
        byDay[key] = (byDay[key] || 0) + 1;
      }
      const source = data.source || 'unknown';
      bySource[source] = (bySource[source] || 0) + 1;
    });

    // Get source breakdown and status breakdown for all time
    const allSnapshot = await db.collection('waitlist').get();
    const allBySource: Record<string, number> = {};
    const byStatus: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
    let withPhone = 0;

    allSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const source = data.source || 'unknown';
      allBySource[source] = (allBySource[source] || 0) + 1;

      const status = data.status || 'pending';
      byStatus[status] = (byStatus[status] || 0) + 1;

      if (data.phone) {
        withPhone++;
      }
    });

    log.info('Admin fetched waitlist stats', { total, last7Days: recentSnapshot.size });

    sendJson(res, 200, {
      total,
      last7Days: recentSnapshot.size,
      byDay,
      bySource: allBySource,
      byStatus,
      withPhone,
    });
    return true;
  } catch (error) {
    log.error('Failed to fetch waitlist stats', { error });
    sendJson(res, 500, { error: 'Failed to fetch stats' });
    return true;
  }
}

/**
 * Export waitlist as CSV
 */
async function handleAdminExport(res: ServerResponse): Promise<boolean> {
  try {
    ensureFirebaseInitialized();
    const db = getFirestore();

    const snapshot = await db.collection('waitlist').orderBy('timestamp', 'desc').get();

    // Build CSV
    const headers = ['email', 'phone', 'status', 'source', 'timestamp', 'approvedAt', 'referrer'];
    const rows = snapshot.docs.map((doc) => {
      const data = doc.data();
      return [
        data.email || '',
        data.phone || '',
        data.status || 'pending',
        data.source || '',
        data.timestamp?.toDate?.().toISOString() || '',
        data.approvedAt?.toDate?.().toISOString() || '',
        data.referrer || '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const filename = `waitlist-${new Date().toISOString().split('T')[0]}.csv`;

    log.info('Admin exported waitlist', { count: snapshot.size });

    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(csv);
    return true;
  } catch (error) {
    log.error('Failed to export waitlist', { error });
    sendJson(res, 500, { error: 'Failed to export' });
    return true;
  }
}
