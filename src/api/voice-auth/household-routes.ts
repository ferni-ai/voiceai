/**
 * Voice Household Routes
 *
 * Household management for multi-user voice identification:
 * - GET  /api/voice/household              - Get the caller's household for a device
 * - POST /api/voice/household              - Create a household (caller owns it)
 * - POST /api/voice/household/members      - Add member (owner only)
 * - DELETE /api/voice/household/members/:id - Remove member (owner only)
 *
 * Every route needs the signed-in caller (getSignedInUserId); the X-Device-ID
 * header only names which household, it grants nothing. A household that is
 * not the caller's reads as not found. There is no HTTP identify route: with
 * a working speaker model it would tell any caller whose voice a recording is
 * (and, after adding a victim as a member, confirm a guess). Speaker
 * identification runs agent-side only (identifyHouseholdSpeaker).
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  addHouseholdMember,
  createHousehold,
  getHousehold,
  removeHouseholdMember,
  type Household,
} from '../../services/voice/voice-household.js';
import { parseBody, sendJson, getSignedInUserId } from './helpers.js';

/** The device's household if the caller owns it (or, with members, belongs to it). */
async function callersHousehold(
  deviceId: string,
  userId: string,
  { members = false } = {}
): Promise<Household | null> {
  const household = await getHousehold(deviceId);
  if (!household) return null;
  if (household.ownerId === userId) return household;
  return members && household.members.some((m) => m.userId === userId) ? household : null;
}

/**
 * Handle voice household routes.
 * @returns true if route was handled
 */
export async function handleHouseholdRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string
): Promise<boolean> {
  const isHouseholdRoute =
    route === '/household' ||
    route === '/household/members' ||
    route.startsWith('/household/members/');
  if (!isHouseholdRoute) return false;

  const userId = getSignedInUserId(req);
  if (!userId) {
    sendJson(res, 401, { error: 'Authentication required' });
    return true;
  }
  const deviceId = req.headers['x-device-id'] as string;
  if (!deviceId) {
    sendJson(res, 400, { error: 'Device ID required (X-Device-ID header)' });
    return true;
  }

  // GET /api/voice/household - Get household for device
  if (route === '/household' && req.method === 'GET') {
    const household = await callersHousehold(deviceId, userId, { members: true });
    if (!household) {
      sendJson(res, 404, { error: 'No household found for this device' });
      return true;
    }

    sendJson(res, 200, {
      id: household.id,
      name: household.name,
      members: household.members,
      settings: household.settings,
    });
    return true;
  }

  // POST /api/voice/household - Create household
  if (route === '/household' && req.method === 'POST') {
    const existing = await getHousehold(deviceId);
    if (existing && existing.ownerId !== userId) {
      sendJson(res, 409, { error: 'This device already has a household' });
      return true;
    }

    const body = await parseBody(req);
    const household =
      existing ?? (await createHousehold(deviceId, userId, body.name as string | undefined));

    sendJson(res, existing ? 200 : 201, {
      success: true,
      household: {
        id: household.id,
        name: household.name,
      },
    });
    return true;
  }

  // POST /api/voice/household/members - Add member to household
  if (route === '/household/members' && req.method === 'POST') {
    if (!(await callersHousehold(deviceId, userId))) {
      sendJson(res, 404, { error: 'No household found for this device' });
      return true;
    }

    const body = await parseBody(req);
    const {
      userId: memberUserId,
      displayName,
      role,
    } = body as {
      userId?: string;
      displayName?: string;
      role?: string;
    };

    if (!memberUserId || !displayName) {
      sendJson(res, 400, { error: 'userId and displayName required' });
      return true;
    }

    // Validate role if provided
    const validRoles = ['owner', 'adult', 'child', 'guest'] as const;
    const validatedRole =
      role && validRoles.includes(role as (typeof validRoles)[number])
        ? (role as (typeof validRoles)[number])
        : undefined;

    const member = await addHouseholdMember(deviceId, memberUserId, displayName, validatedRole);
    if (!member) {
      sendJson(res, 500, { error: 'Failed to add member to household' });
      return true;
    }

    sendJson(res, 201, {
      success: true,
      member,
      needsVoiceEnrollment: !member.preferences?.voiceEnrolled,
    });
    return true;
  }

  // DELETE /api/voice/household/members/:userId
  if (route.startsWith('/household/members/') && req.method === 'DELETE') {
    const memberUserId = route.split('/household/members/')[1];
    if (!memberUserId) {
      sendJson(res, 400, { error: 'Member user ID required' });
      return true;
    }
    if (!(await callersHousehold(deviceId, userId))) {
      sendJson(res, 404, { error: 'No household found for this device' });
      return true;
    }

    const success = await removeHouseholdMember(deviceId, memberUserId);
    sendJson(res, success ? 200 : 404, {
      success,
      message: success ? 'Member removed' : 'Member not found',
    });
    return true;
  }

  return false;
}
