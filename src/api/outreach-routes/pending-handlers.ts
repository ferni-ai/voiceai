/**
 * Outreach API: pending and history endpoints.
 * Extracted from outreach.routes.ts.
 */

import {
  cancelOutreach,
  getOutreachDecisionEngine,
  getOutreachHistory,
  getPendingOutreach,
  triggerOutreach,
} from '../../services/outreach/index.js';
import { getLogger } from '../../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from '../helpers.js';
import { getPersonaName } from './helpers.js';
import type { OutreachRouteContext } from './types.js';

const log = getLogger().child({ module: 'outreach-handler' });

export async function handlePendingRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route, authenticatedUserId } = ctx;

  // ========================================================================
  // PENDING & HISTORY
  // ========================================================================

  // GET /api/outreach/pending
  if (route === '/pending' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    const pending = getPendingOutreach(userId);
    sendJsonResponse(res, 200, {
      success: true,
      pending,
      count: pending.length,
    });
    return true;
  }

  // GET /api/outreach/pending-checkin - Get pending check-in for badge UI
  // Returns the most relevant check-in Ferni wants to have with the user
  if (route === '/pending-checkin' && method === 'GET') {
    const userId = authenticatedUserId;

    const pending = getPendingOutreach(userId);

    // Find the most relevant check-in type item
    const checkinTypes = [
      'thinking_of_you',
      'emotional_support',
      'commitment_check',
      'growth_reflection',
      'gentle_checkin',
    ];
    const checkinItem = pending.find((item) => checkinTypes.includes(item.type));

    if (!checkinItem) {
      sendJsonResponse(res, 200, {
        hasCheckin: false,
        checkin: null,
      });
      return true;
    }

    // Map outreach type to badge icon type
    type BadgeType = 'thinking_of_you' | 'gentle_checkin' | 'celebration' | 'support';
    const iconTypes: Record<string, BadgeType> = {
      thinking_of_you: 'thinking_of_you',
      emotional_support: 'support',
      commitment_check: 'gentle_checkin',
      growth_reflection: 'celebration',
      gentle_checkin: 'gentle_checkin',
      celebration: 'celebration',
    };

    sendJsonResponse(res, 200, {
      hasCheckin: true,
      checkin: {
        id: checkinItem.id,
        type: iconTypes[checkinItem.type] || 'thinking_of_you',
        message: checkinItem.reason || "I've been thinking about you",
        personaId: checkinItem.suggestedPersona || 'ferni',
        timestamp: checkinItem.suggestedTime?.toISOString() || new Date().toISOString(),
      },
    });
    return true;
  }

  // GET /api/outreach/upcoming - formatted for UI
  if (route === '/upcoming' && method === 'GET') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    const pending = getPendingOutreach(userId);

    // Format for the schedule UI
    const upcoming = pending.map((trigger) => ({
      id: trigger.id,
      type: trigger.type,
      personaId: trigger.suggestedPersona || 'ferni',
      personaName: getPersonaName(trigger.suggestedPersona || 'ferni'),
      channel: 'sms' as const, // Default channel
      scheduledFor: trigger.suggestedTime || new Date(),
      preview: {
        body: trigger.reason,
      },
      reason: trigger.commitment || trigger.milestone || trigger.event || 'Check-in scheduled',
      priority: trigger.priority,
      canReschedule: true,
      canCancel: true,
    }));

    sendJsonResponse(res, 200, {
      success: true,
      upcoming,
      count: upcoming.length,
    });
    return true;
  }

  // DELETE /api/outreach/pending/:triggerId
  if (route.startsWith('/pending/') && method === 'DELETE') {
    const triggerId = route.replace('/pending/', '');

    const cancelled = cancelOutreach(triggerId);
    if (cancelled) {
      sendJsonResponse(res, 200, { success: true, message: 'Outreach cancelled' });
    } else {
      sendJsonResponse(res, 404, { success: false, error: 'Trigger not found' });
    }
    return true;
  }

  // POST /api/outreach/reschedule
  if (route === '/reschedule' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { triggerId, newTime } = body as { triggerId: string; newTime: string };

    if (!triggerId || !newTime) {
      sendJsonResponse(res, 400, { success: false, error: 'triggerId and newTime are required' });
      return true;
    }

    const engine = getOutreachDecisionEngine();
    const trigger = engine.getTrigger(triggerId);

    if (!trigger) {
      sendJsonResponse(res, 404, { success: false, error: 'Trigger not found' });
      return true;
    }

    // Cancel the old trigger and create a new one with the updated time
    cancelOutreach(triggerId);

    const newTriggerId = triggerOutreach({
      ...trigger,
      suggestedTime: new Date(newTime),
    });

    log.info({ oldTriggerId: triggerId, newTriggerId, newTime }, 'Rescheduled outreach');
    sendJsonResponse(res, 200, {
      success: true,
      message: 'Outreach rescheduled',
      newTriggerId,
    });
    return true;
  }

  // GET /api/outreach/history
  if (route === '/history' && method === 'GET') {
    const url = new URL(req.url || '', 'http://localhost');
    // Use authenticated userId
    const userId = authenticatedUserId;
    const limit = parseInt(url.searchParams.get('limit') || '20');

    const history = getOutreachHistory(userId, limit);
    sendJsonResponse(res, 200, {
      success: true,
      history,
      count: history.length,
    });
    return true;
  }

  return false;
}
