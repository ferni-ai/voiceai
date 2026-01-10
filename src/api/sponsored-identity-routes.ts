/**
 * Sponsored Identity API Routes
 *
 * Enables sponsors to manage identities for family members and friends
 * who call Ferni via phone.
 *
 * Endpoints:
 * - GET    /api/sponsored-identities              - List sponsor's identities
 * - POST   /api/sponsored-identities              - Create a new identity
 * - GET    /api/sponsored-identities/:id          - Get identity details
 * - PUT    /api/sponsored-identities/:id          - Update identity
 * - DELETE /api/sponsored-identities/:id          - Delete identity
 * - POST   /api/sponsored-identities/:id/revoke   - Revoke identity
 * - GET    /api/sponsored-identities/pending      - List pending self-registrations
 * - POST   /api/sponsored-identities/:id/approve  - Approve pending identity
 *
 * @module api/sponsored-identity-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getLogger } from '../utils/safe-logger.js';
import {
  createSponsoredIdentity,
  getSponsoredIdentity,
  getSponsoredIdentities,
  updateSponsoredIdentity,
  deleteSponsoredIdentity,
  revokeSponsoredIdentity,
  getPendingIdentities,
  approveSelfRegisteredIdentity,
  type CreateSponsoredIdentityData,
  type UpdateSponsoredIdentityData,
  type RelationshipType,
} from '../services/identity/sponsored-identity.js';

const log = getLogger().child({ module: 'sponsored-identity-routes' });

// ============================================================================
// HELPERS
// ============================================================================

function sendJSON(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-UID',
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, status = 400): void {
  sendJSON(res, status, { error: message });
}

async function parseBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : ({} as T));
      } catch (e) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function getUserId(req: IncomingMessage): string | null {
  return (req.headers['x-firebase-uid'] as string) || null;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle sponsored identity API routes.
 * @returns true if the route was handled
 */
export async function handleSponsoredIdentityRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/sponsored-identities routes
  if (!pathname.startsWith('/api/sponsored-identities')) {
    return false;
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Firebase-UID',
    });
    res.end();
    return true;
  }

  // Get authenticated user
  const userId = getUserId(req);
  if (!userId) {
    sendError(res, 'Authentication required', 401);
    return true;
  }

  const route = pathname.replace('/api/sponsored-identities', '');

  try {
    // GET /api/sponsored-identities - List sponsor's identities
    if (route === '' && req.method === 'GET') {
      const identities = await getSponsoredIdentities(userId);
      sendJSON(res, 200, {
        identities: identities.map(sanitizeIdentity),
      });
      return true;
    }

    // POST /api/sponsored-identities - Create new identity
    if (route === '' && req.method === 'POST') {
      const body = await parseBody<CreateSponsoredIdentityData>(req);

      if (!body.displayName || !body.phoneNumber || !body.relationship) {
        sendError(res, 'displayName, phoneNumber, and relationship are required');
        return true;
      }

      // Validate relationship type
      const validRelationships: RelationshipType[] = [
        'mother',
        'father',
        'parent',
        'grandmother',
        'grandfather',
        'grandparent',
        'sibling',
        'child',
        'spouse',
        'partner',
        'friend',
        'other',
      ];
      if (!validRelationships.includes(body.relationship)) {
        sendError(res, `Invalid relationship. Must be one of: ${validRelationships.join(', ')}`);
        return true;
      }

      const identity = await createSponsoredIdentity(userId, body);
      log.info({ identityId: identity.id, userId }, 'Created sponsored identity');

      sendJSON(res, 201, { identity: sanitizeIdentity(identity) });
      return true;
    }

    // GET /api/sponsored-identities/pending - List pending self-registrations
    if (route === '/pending' && req.method === 'GET') {
      const pending = await getPendingIdentities();

      // Note: In a full implementation, we'd filter by claimed sponsor name
      // For now, return all pending (admin view)
      sendJSON(res, 200, {
        pending: pending.map((p) => ({
          id: p.id,
          displayName: p.displayName,
          phoneNumber: maskPhone(p.phoneNumber),
          notes: p.notes,
          selfRegisteredName: p.selfRegisteredName,
          selfRegisteredAt: p.selfRegisteredAt,
          createdAt: p.createdAt,
        })),
      });
      return true;
    }

    // Routes with :id parameter
    const idMatch = route.match(/^\/([^/]+)$/);
    const actionMatch = route.match(/^\/([^/]+)\/(approve|revoke)$/);

    // POST /api/sponsored-identities/:id/approve - Approve pending identity
    if (actionMatch && req.method === 'POST' && actionMatch[2] === 'approve') {
      const identityId = actionMatch[1];
      const body = await parseBody<{
        displayName?: string;
        relationship?: RelationshipType;
        notes?: string;
      }>(req);

      const identity = await approveSelfRegisteredIdentity(identityId, userId, {
        displayName: body.displayName,
        relationship: body.relationship,
        notes: body.notes,
      });

      if (!identity) {
        sendError(res, 'Identity not found', 404);
        return true;
      }

      log.info({ identityId, userId }, 'Approved self-registered identity');
      sendJSON(res, 200, { identity: sanitizeIdentity(identity) });
      return true;
    }

    // POST /api/sponsored-identities/:id/revoke - Revoke identity
    if (actionMatch && req.method === 'POST' && actionMatch[2] === 'revoke') {
      const identityId = actionMatch[1];
      const success = await revokeSponsoredIdentity(identityId, userId);

      if (!success) {
        sendError(res, 'Identity not found or not authorized', 404);
        return true;
      }

      log.info({ identityId, userId }, 'Revoked sponsored identity');
      sendJSON(res, 200, { success: true });
      return true;
    }

    // GET /api/sponsored-identities/:id - Get identity details
    if (idMatch && req.method === 'GET') {
      const identityId = idMatch[1];
      const identity = await getSponsoredIdentity(identityId);

      if (!identity) {
        sendError(res, 'Identity not found', 404);
        return true;
      }

      // Verify ownership
      if (identity.sponsorUserId !== userId) {
        sendError(res, 'Not authorized', 403);
        return true;
      }

      sendJSON(res, 200, { identity: sanitizeIdentity(identity) });
      return true;
    }

    // PUT /api/sponsored-identities/:id - Update identity
    if (idMatch && req.method === 'PUT') {
      const identityId = idMatch[1];
      const body = await parseBody<UpdateSponsoredIdentityData>(req);

      const identity = await updateSponsoredIdentity(identityId, userId, body);
      if (!identity) {
        sendError(res, 'Identity not found or not authorized', 404);
        return true;
      }

      log.info({ identityId, userId }, 'Updated sponsored identity');
      sendJSON(res, 200, { identity: sanitizeIdentity(identity) });
      return true;
    }

    // DELETE /api/sponsored-identities/:id - Delete identity
    if (idMatch && req.method === 'DELETE') {
      const identityId = idMatch[1];
      const success = await deleteSponsoredIdentity(identityId, userId);

      if (!success) {
        sendError(res, 'Identity not found or not authorized', 404);
        return true;
      }

      log.info({ identityId, userId }, 'Deleted sponsored identity');
      sendJSON(res, 200, { success: true });
      return true;
    }

    // Route not found
    return false;
  } catch (error) {
    log.error({ error: String(error), route }, 'Sponsored identity route error');
    sendError(res, (error as Error).message || 'Internal server error', 500);
    return true;
  }
}

// ============================================================================
// SANITIZERS
// ============================================================================

/**
 * Sanitize identity for API response.
 */
function sanitizeIdentity(identity: ReturnType<typeof getSponsoredIdentity> extends Promise<infer T> ? NonNullable<T> : never) {
  return {
    id: identity.id,
    displayName: identity.displayName,
    preferredName: identity.preferredName,
    relationship: identity.relationship,
    phoneNumber: maskPhone(identity.phoneNumber),
    voiceEnrolled: identity.voiceEnrolled,
    accessLevel: identity.accessLevel,
    allowedPersonas: identity.allowedPersonas,
    status: identity.status,
    notes: identity.notes,
    createdAt: identity.createdAt,
    updatedAt: identity.updatedAt,
    lastCallAt: identity.lastCallAt,
    totalCalls: identity.totalCalls,
    totalMinutes: identity.totalMinutes,
  };
}

/**
 * Mask phone number for privacy.
 */
function maskPhone(phone: string): string {
  if (phone.length < 6) return '***';
  return phone.slice(0, 4) + '****' + phone.slice(-2);
}
