/**
 * Household Settings API Routes
 *
 * Backend persistence for household member settings.
 * Completes the frontend household-manager.ui.ts integration.
 *
 * @module HouseholdRoutes
 */

import { getFirestore } from 'firebase-admin/firestore';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded } from './helpers.js';

const log = createLogger({ module: 'HouseholdAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface HouseholdMember {
  id: string;
  name: string;
  relationship: string;
  voiceEnrolled: boolean;
  lastSeen?: string;
  preferences?: Record<string, unknown>;
}

interface HouseholdSettings {
  privacyMode: 'shared' | 'individual' | 'strict';
  voiceIdentification: boolean;
  sharedCalendar: boolean;
  familyReminders: boolean;
}

interface Household {
  userId: string;
  members: HouseholdMember[];
  settings: HouseholdSettings;
  updatedAt: Date;
}

// ============================================================================
// HELPERS
// ============================================================================

function parseJson(body: string): Record<string, unknown> | null {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function getBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => resolve(body));
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleHouseholdRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  // Require authentication
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) {
    return true; // 401 already sent
  }

  const method = req.method || 'GET';

  // GET /api/household/:userId - Get household data
  const getMatch = pathname.match(/^\/api\/household\/([^/]+)$/);
  if (getMatch && method === 'GET') {
    // SECURITY: Use authenticated userId, ignore URL param to prevent unauthorized access
    const { userId } = auth;
    try {
      const db = getFirestore();
      const doc = await db.collection('households').doc(userId).get();

      if (!doc.exists) {
        // Return default household
        sendJson(res, 200, {
          userId,
          members: [],
          settings: {
            privacyMode: 'shared',
            voiceIdentification: true,
            sharedCalendar: true,
            familyReminders: true,
          },
          updatedAt: new Date().toISOString(),
        });
        return true;
      }

      sendJson(res, 200, doc.data());
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get household');
      sendJson(res, 500, { error: 'Failed to get household data' });
      return true;
    }
  }

  // PUT /api/household/:userId - Update household data
  const putMatch = pathname.match(/^\/api\/household\/([^/]+)$/);
  if (putMatch && method === 'PUT') {
    // SECURITY: Use authenticated userId
    const { userId } = auth;
    try {
      const body = await getBody(req);
      const data = parseJson(body);

      if (!data) {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return true;
      }

      const db = getFirestore();
      const household: Partial<Household> = {
        userId,
        updatedAt: new Date(),
      };

      // Conditionally add members and settings
      if (data.members && Array.isArray(data.members)) {
        household.members = data.members as HouseholdMember[];
      }
      if (data.settings && typeof data.settings === 'object') {
        household.settings = data.settings as HouseholdSettings;
      }

      await db
        .collection('households')
        .doc(userId)
        .set(cleanForFirestore(household), { merge: true });

      log.info({ userId }, 'Household updated');
      sendJson(res, 200, { success: true, household });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to update household');
      sendJson(res, 500, { error: 'Failed to update household' });
      return true;
    }
  }

  // PATCH /api/household/:userId/settings - Update just settings
  const settingsMatch = pathname.match(/^\/api\/household\/([^/]+)\/settings$/);
  if (settingsMatch && method === 'PATCH') {
    // SECURITY: Use authenticated userId
    const { userId } = auth;
    try {
      const body = await getBody(req);
      const settings = parseJson(body);

      if (!settings) {
        sendJson(res, 400, { error: 'Invalid JSON' });
        return true;
      }

      const db = getFirestore();
      await db
        .collection('households')
        .doc(userId)
        .set(
          cleanForFirestore({
            settings,
            updatedAt: new Date(),
          }),
          { merge: true }
        );

      log.info({ userId }, 'Household settings updated');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to update household settings');
      sendJson(res, 500, { error: 'Failed to update settings' });
      return true;
    }
  }

  // POST /api/household/:userId/members - Add a member
  const addMemberMatch = pathname.match(/^\/api\/household\/([^/]+)\/members$/);
  if (addMemberMatch && method === 'POST') {
    const userId = addMemberMatch[1];
    try {
      const body = await getBody(req);
      const parsed = parseJson(body);

      if (!parsed || typeof parsed.name !== 'string') {
        sendJson(res, 400, { error: 'Invalid member data' });
        return true;
      }

      const member = parsed as unknown as HouseholdMember;

      if (!member.name) {
        sendJson(res, 400, { error: 'Invalid member data' });
        return true;
      }

      const db = getFirestore();
      const docRef = db.collection('households').doc(userId);
      const doc = await docRef.get();

      const currentMembers = doc.exists ? doc.data()?.members || [] : [];
      const newMember: HouseholdMember = {
        id: member.id || `member_${Date.now()}`,
        name: member.name,
        relationship: member.relationship || 'family',
        voiceEnrolled: member.voiceEnrolled || false,
        preferences: member.preferences || {},
      };

      await docRef.set(
        cleanForFirestore({
          userId,
          members: [...currentMembers, newMember],
          updatedAt: new Date(),
        }),
        { merge: true }
      );

      log.info({ userId, memberId: newMember.id }, 'Household member added');
      sendJson(res, 201, { success: true, member: newMember });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to add household member');
      sendJson(res, 500, { error: 'Failed to add member' });
      return true;
    }
  }

  // DELETE /api/household/:userId/members/:memberId - Remove a member
  const removeMemberMatch = pathname.match(/^\/api\/household\/([^/]+)\/members\/([^/]+)$/);
  if (removeMemberMatch && method === 'DELETE') {
    const [, userId, memberId] = removeMemberMatch;
    try {
      const db = getFirestore();
      const docRef = db.collection('households').doc(userId);
      const doc = await docRef.get();

      if (!doc.exists) {
        sendJson(res, 404, { error: 'Household not found' });
        return true;
      }

      const currentMembers = doc.data()?.members || [];
      const updatedMembers = currentMembers.filter((m: HouseholdMember) => m.id !== memberId);

      await docRef.update(
        cleanForFirestore({
          members: updatedMembers,
          updatedAt: new Date(),
        })
      );

      log.info({ userId, memberId }, 'Household member removed');
      sendJson(res, 200, { success: true });
      return true;
    } catch (error) {
      log.error({ error: String(error), userId, memberId }, 'Failed to remove household member');
      sendJson(res, 500, { error: 'Failed to remove member' });
      return true;
    }
  }

  return false;
}

export default handleHouseholdRoutes;
