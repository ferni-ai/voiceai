/**
 * Voice Household Routes
 *
 * Handles household management for multi-user voice identification:
 * - GET  /api/voice/household              - Get household for device
 * - POST /api/voice/household              - Create household
 * - POST /api/voice/household/members      - Add member to household
 * - DELETE /api/voice/household/members/:id - Remove member
 * - POST /api/voice/household/identify     - Identify speaker from household
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  addHouseholdMember,
  createHousehold,
  getHousehold,
  identifyHouseholdSpeaker,
  removeHouseholdMember,
} from '../../services/voice/voice-household.js';
import { parseBody, sendJson, getUserId, parseAudio } from './helpers.js';

/**
 * Handle voice household routes.
 * @returns true if route was handled
 */
export async function handleHouseholdRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string
): Promise<boolean> {
  // GET /api/voice/household - Get household for device
  if (route === '/household' && req.method === 'GET') {
    const deviceId = req.headers['x-device-id'] as string;
    if (!deviceId) {
      sendJson(res, 400, { error: 'Device ID required (X-Device-ID header)' });
      return true;
    }

    const household = await getHousehold(deviceId);
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
    const userId = getUserId(req);
    const deviceId = req.headers['x-device-id'] as string;

    if (!userId || !deviceId) {
      sendJson(res, 400, { error: 'User ID and Device ID required' });
      return true;
    }

    const body = await parseBody(req);
    const household = await createHousehold(deviceId, userId, body.name as string | undefined);

    sendJson(res, 201, {
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
    const deviceId = req.headers['x-device-id'] as string;
    if (!deviceId) {
      sendJson(res, 400, { error: 'Device ID required' });
      return true;
    }

    const body = await parseBody(req);
    const { userId, displayName, role } = body as {
      userId?: string;
      displayName?: string;
      role?: string;
    };

    if (!userId || !displayName) {
      sendJson(res, 400, { error: 'userId and displayName required' });
      return true;
    }

    // Validate role if provided
    const validRoles = ['owner', 'adult', 'child', 'guest'] as const;
    const validatedRole =
      role && validRoles.includes(role as (typeof validRoles)[number])
        ? (role as (typeof validRoles)[number])
        : undefined;

    const member = await addHouseholdMember(deviceId, userId, displayName, validatedRole);
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
    const deviceId = req.headers['x-device-id'] as string;
    const memberUserId = route.split('/household/members/')[1];

    if (!deviceId || !memberUserId) {
      sendJson(res, 400, { error: 'Device ID and member user ID required' });
      return true;
    }

    const success = await removeHouseholdMember(deviceId, memberUserId);
    sendJson(res, success ? 200 : 404, {
      success,
      message: success ? 'Member removed' : 'Member not found',
    });
    return true;
  }

  // POST /api/voice/household/identify - Identify speaker from household
  if (route === '/household/identify' && req.method === 'POST') {
    const deviceId = req.headers['x-device-id'] as string;
    if (!deviceId) {
      sendJson(res, 400, { error: 'Device ID required' });
      return true;
    }

    const body = await parseBody(req);
    const audio = parseAudio(body);

    if (!audio) {
      sendJson(res, 400, { error: 'Invalid audio data' });
      return true;
    }

    const result = await identifyHouseholdSpeaker(deviceId, audio);

    sendJson(res, 200, {
      identified: result.identified,
      member: result.member,
      confidence: result.confidence,
      isNewSpeaker: result.isNewSpeaker,
      suggestedAction: result.suggestedAction,
    });
    return true;
  }

  return false;
}
