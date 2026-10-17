/**
 * POST /demo-claim: attach a landing-page demo conversation to the signed-in user.
 *
 * The account comes only from the verified Firebase ID token
 * (`Authorization: Bearer <idToken>`), never from the body. Holding a claim token
 * proves you were in the demo, not who you are, so a body `firebase_uid` that
 * differs from the verified uid is refused (403) rather than trusted.
 *
 * Verification reuses verifyFirebaseToken / isVerifiedToken, the same check
 * /token uses in ./token.ts.
 *
 * @module servers/api/routes/demo-claim
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { rateLimit } from '../../../api/auth-middleware.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { onBodyEnd } from '../request-failure.js';
import * as demoSessions from '../services/demo-sessions.js';

const log = createLogger({ module: 'DemoClaimRoute' });

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/**
 * The uid of the verified Firebase ID token on the request, or null after
 * answering 401 (missing or invalid token) or 503 (verifier unavailable).
 */
async function verifiedUidOrRespond(
  req: IncomingMessage,
  res: ServerResponse
): Promise<string | null> {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    log.warn('SECURITY: /demo-claim rejected, missing Firebase auth');
    sendJson(res, 401, { error: 'Authentication required' });
    return null;
  }

  try {
    const { verifyFirebaseToken, isVerifiedToken } =
      await import('../../../services/identity/firebase-auth.js');
    const verified = await verifyFirebaseToken(authHeader.slice(7));
    if (!isVerifiedToken(verified)) {
      log.warn('SECURITY: /demo-claim rejected, invalid or expired Firebase token');
      sendJson(res, 401, { error: 'Invalid or expired authentication token' });
      return null;
    }
    return verified.uid;
  } catch (err) {
    log.error({ error: String(err) }, 'Firebase auth verification failed for /demo-claim');
    sendJson(res, 503, { error: 'Authentication service unavailable' });
    return null;
  }
}

/** Largest body /demo-claim reads; a claim is two short strings. */
const MAX_BODY_BYTES = 4096;

function parseBody(body: string): { claimToken?: string; bodyUid?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Not JSON: treated like a body with no claim_token, so the caller gets a 400
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const record = parsed as Record<string, unknown>;
  const claimToken = record['claim_token'];
  const bodyUid = record['firebase_uid'];
  return {
    claimToken: typeof claimToken === 'string' ? claimToken : undefined,
    bodyUid: typeof bodyUid === 'string' ? bodyUid : undefined,
  };
}

/** Handle POST /demo-claim. Always answers the request. Rate limit: 10/min. */
export async function handleDemoClaim(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (rateLimit(req, res, { maxRequests: 10, windowMs: 60000 })) {
    return true;
  }
  let body = '';
  let tooLarge = false;
  req.on('data', (chunk: Buffer) => {
    if (tooLarge) return;
    body += chunk.toString();
    if (body.length > MAX_BODY_BYTES) {
      tooLarge = true;
      body = '';
    }
  });

  return new Promise((resolve) => {
    req.on('error', (err) => {
      log.error({ error: err.message }, 'Request error in demo claim');
      if (!res.headersSent) sendJson(res, 500, { error: 'Request error' });
      resolve(true);
    });

    onBodyEnd(req, res, resolve, async () => {
      try {
        if (tooLarge) {
          sendJson(res, 413, { error: 'Request body too large' });
          resolve(true);
          return;
        }
        const uid = await verifiedUidOrRespond(req, res);
        if (!uid) {
          resolve(true);
          return;
        }

        const { claimToken, bodyUid } = parseBody(body);
        if (!claimToken) {
          sendJson(res, 400, { error: 'Missing claim_token' });
          resolve(true);
          return;
        }
        if (bodyUid && bodyUid !== uid) {
          log.warn(
            { claimed: bodyUid.substring(0, 8), actual: uid.substring(0, 8) },
            'SECURITY: /demo-claim rejected, firebase_uid does not match authenticated user'
          );
          sendJson(res, 403, { error: 'firebase_uid does not match authenticated user' });
          resolve(true);
          return;
        }

        // Async - loads from Firestore if needed
        const result = await demoSessions.claimDemoSession(claimToken, uid);
        if (!result.success) {
          sendJson(res, 400, { error: result.error });
          resolve(true);
          return;
        }

        sendJson(res, 200, {
          success: true,
          already_claimed: result.alreadyClaimed,
          conversation: result.session?.conversation,
        });
      } catch (err) {
        log.error({ error: String(err) }, 'Demo claim error');
        if (!res.headersSent) sendJson(res, 500, { error: 'Internal server error' });
      }
      resolve(true);
    });
  });
}
