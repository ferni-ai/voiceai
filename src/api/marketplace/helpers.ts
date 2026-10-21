/**
 * Marketplace API Helpers
 *
 * Shared utilities for marketplace routes.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { AgentManifest, ToolManifest } from '../../marketplace/schema/types.js';
import { getSubscriptionInfo } from '../../services/billing/stripe-subscription.js';
import type { SubscriptionTier } from '../../types/subscription.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isVerifiedToken, verifyFirebaseToken } from '../../services/identity/firebase-auth.js';
import { parseBody as parseBodyHelper, sendJSON } from '../helpers.js';
import { isVerifiedAdmin } from '../rate-limit-identity.js';
import { resolvePublisher } from '../v1/developers/shared/developer-auth.js';

const log = createLogger({ module: 'marketplace-helpers' });

// ============================================================================
// TYPES
// ============================================================================

export interface PublisherSession {
  publisherId: string;
  publisherName: string;
  /** The publisher's email on record (set at developer sign-in from a verified token). */
  email?: string;
  verified: boolean;
}

// ============================================================================
// REQUEST HELPERS
// ============================================================================

/**
 * Parse raw body from request (for Stripe webhooks)
 */
export async function parseRawBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

/**
 * Parse JSON body using centralized helper
 */
export async function parseBody<T = unknown>(req: IncomingMessage): Promise<T> {
  return parseBodyHelper<T>(req);
}

/**
 * Send JSON response using centralized helper with swapped parameter order.
 * Wrapper for backward compatibility: sendJson(res, status, data)
 */
export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  sendJSON(res, data, status);
}

/**
 * The user a request acts for: the verified caller (x-firebase-uid, set only
 * by bindVerifiedIdentity), or the user a verified admin names in x-user-id.
 * A raw x-user-id is a claim; the door only rewrites it outside development.
 */
export function getUserId(req: IncomingMessage): string | null {
  const firebaseUid = req.headers['x-firebase-uid'];
  if (typeof firebaseUid === 'string' && firebaseUid) return firebaseUid;
  const named = req.headers['x-user-id'];
  return typeof named === 'string' && named && isVerifiedAdmin(req) ? named : null;
}

/**
 * The publisher the caller is, from their verified Firebase token: the
 * publishers record linked to that uid, re-checked on every request against a
 * verified, non-anonymous email equal to the record's. Request headers
 * (x-publisher-id, x-publisher-name) are claims and are never read.
 * `verified` comes from the record, which only an admin can change.
 * Returns null after sending the 401/403 that explains why.
 */
export async function requirePublisher(
  req: IncomingMessage,
  res: ServerResponse
): Promise<PublisherSession | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : '';
  try {
    const verified = token ? await verifyFirebaseToken(token) : null;
    if (!isVerifiedToken(verified)) {
      sendJson(res, 401, { error: 'Publisher authentication required' });
      return null;
    }
    const resolved = await resolvePublisher({
      uid: verified.uid,
      email: verified.email,
      emailVerified: verified.emailVerified === true,
      anonymous: verified.isAnonymous === true,
    });
    if (!resolved.ok) {
      sendJson(res, resolved.status, { error: resolved.error });
      return null;
    }
    const record = resolved.publisher;
    return {
      publisherId: record.id,
      publisherName: record.name || 'Unknown Publisher',
      email: record.email,
      verified: record.verified === true,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Publisher lookup failed');
    sendJson(res, 500, { error: 'Publisher lookup failed' });
    return null;
  }
}

/**
 * The plan a user is on, read from their account (never from the request, which
 * the client controls). Fails closed: if the lookup fails, the user gets 'free'.
 */
export async function getSubscriptionTier(userId: string): Promise<SubscriptionTier> {
  try {
    return (await getSubscriptionInfo(userId)).tier;
  } catch (error) {
    log.warn({ error, userId }, 'Plan lookup failed; using the free quota');
    return 'free';
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateToolManifest(manifest: ToolManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Tool ID is required');
  } else if (!/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('Tool ID must be lowercase alphanumeric with hyphens');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Tool name is required');
  }

  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Valid semantic version required (e.g., 1.0.0)');
  }

  if (!manifest.publisher?.id) {
    errors.push('Publisher ID is required');
  }

  if (!manifest.description?.short) {
    errors.push('Short description is required');
  }

  if (!manifest.execution?.runtime?.type) {
    errors.push('Execution runtime type is required');
  }

  if (!manifest.interface?.llmDescription) {
    errors.push('LLM description is required for tool discovery');
  }

  return errors;
}

export function validateAgentManifest(manifest: AgentManifest): string[] {
  const errors: string[] = [];

  if (!manifest.id || typeof manifest.id !== 'string') {
    errors.push('Agent ID is required');
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    errors.push('Agent name is required');
  }

  if (!manifest.displayName) {
    errors.push('Display name is required');
  }

  if (!manifest.version || !/^\d+\.\d+\.\d+$/.test(manifest.version)) {
    errors.push('Valid semantic version required');
  }

  if (!manifest.publisher?.id) {
    errors.push('Publisher ID is required');
  }

  return errors;
}
