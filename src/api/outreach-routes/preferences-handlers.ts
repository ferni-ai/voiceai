/**
 * Outreach API: preference and trigger endpoints.
 * Extracted from outreach.routes.ts.
 */

import {
  getOutreachDecisionEngine,
  triggerOutreach,
  triggerThinkingOfYou,
  updateOutreachPreferences,
  type OutreachPriority,
  type OutreachTriggerType,
  type ThinkingOfYouTrigger,
} from '../../services/outreach/index.js';
import {
  channelsFromSettings,
  readOutreachConsent,
  settingsFromChannels,
  writeOutreachConsent,
} from '../../services/outreach/outreach-consent.js';
import { getLogger } from '../../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from '../helpers.js';
import type { OutreachRouteContext } from './types.js';

const log = getLogger().child({ module: 'outreach-handler' });

export async function handlePreferenceRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route, authenticatedUserId } = ctx;

  // ========================================================================
  // PREFERENCES
  // ========================================================================

  // GET /api/outreach/preferences
  if (route === '/preferences' && method === 'GET') {
    const userId = authenticatedUserId;

    const engine = getOutreachDecisionEngine();
    const state = engine.getUserState(userId);
    // On/off and channels come from the stored consent the scheduler obeys,
    // not the in-memory engine (which forgets on restart).
    const consent = await readOutreachConsent(userId);

    sendJsonResponse(res, 200, {
      success: true,
      preferences: state.preferences,
      allowedChannels: settingsFromChannels(consent.channels),
      outreachEnabled: consent.enabled,
      relationshipStage: state.relationshipStage,
      counters: state.counters,
    });
    return true;
  }

  // POST /api/outreach/preferences
  if (route === '/preferences' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { preferences } = body as {
      preferences: {
        enabled?: boolean;
        allowedChannels?: Array<'sms' | 'email' | 'call'>;
        preferredChannel?: 'sms' | 'email' | 'call';
        disabledChannels?: Array<'sms' | 'email' | 'call'>;
        quietHours?: { start: number; end: number };
        timezone?: string;
        maxOutreachPerDay?: number;
        maxOutreachPerWeek?: number;
      };
    };

    // Use authenticated userId (ignore body.userId to prevent tampering)
    await writeOutreachConsent(authenticatedUserId, {
      enabled: preferences?.enabled,
      channels: Array.isArray(preferences?.allowedChannels)
        ? channelsFromSettings(preferences.allowedChannels)
        : undefined,
    });
    updateOutreachPreferences(authenticatedUserId, preferences);
    sendJsonResponse(res, 200, { success: true, message: 'Preferences updated' });
    return true;
  }

  // POST /api/outreach/pause
  if (route === '/pause' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { durationDays } = body as { durationDays?: number };

    // Use authenticated userId
    const userId = authenticatedUserId;

    await writeOutreachConsent(userId, { enabled: false });
    const engine = getOutreachDecisionEngine();
    engine.updateUserState(userId, { outreachEnabled: false });

    log.info({ userId, durationDays }, 'Outreach paused');
    sendJsonResponse(res, 200, {
      success: true,
      message: durationDays
        ? `Outreach paused for ${durationDays} days`
        : 'Outreach paused indefinitely',
    });
    return true;
  }

  // POST /api/outreach/resume
  if (route === '/resume' && method === 'POST') {
    // Use authenticated userId
    const userId = authenticatedUserId;

    await writeOutreachConsent(userId, { enabled: true });
    const engine = getOutreachDecisionEngine();
    engine.updateUserState(userId, { outreachEnabled: true });

    log.info({ userId }, 'Outreach resumed');
    sendJsonResponse(res, 200, { success: true, message: 'Outreach resumed' });
    return true;
  }

  return false;
}

export async function handleTriggerRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route, authenticatedUserId } = ctx;

  // ========================================================================
  // TRIGGERS
  // ========================================================================

  // POST /api/outreach/trigger
  if (route === '/trigger' && method === 'POST') {
    const body = await parseRequestBody(req);
    const {
      type,
      priority = 'medium',
      reason,
      commitment,
      milestone,
      goal,
      event,
      suggestedTime,
    } = body as {
      type: OutreachTriggerType;
      priority?: OutreachPriority;
      reason: string;
      commitment?: string;
      milestone?: string;
      goal?: string;
      event?: string;
      suggestedTime?: string;
    };

    // Use authenticated userId
    const userId = authenticatedUserId;

    if (!type || !reason) {
      sendJsonResponse(res, 400, {
        success: false,
        error: 'type and reason are required',
      });
      return true;
    }

    const triggerId = triggerOutreach({
      userId,
      type,
      priority,
      reason,
      commitment,
      milestone,
      goal,
      event,
      suggestedTime: suggestedTime ? new Date(suggestedTime) : undefined,
    });

    log.info({ triggerId, userId, type }, 'Manual trigger created');
    sendJsonResponse(res, 200, {
      success: true,
      triggerId,
      message: 'Outreach triggered',
    });
    return true;
  }

  // POST /api/outreach/thinking-of-you
  if (route === '/thinking-of-you' && method === 'POST') {
    const body = await parseRequestBody(req);
    const { trigger, reason } = body as {
      trigger?: string;
      reason?: string;
    };

    // Use authenticated userId
    const userId = authenticatedUserId;

    await triggerThinkingOfYou(userId, trigger as ThinkingOfYouTrigger | undefined, reason);
    sendJsonResponse(res, 200, {
      success: true,
      message: 'Thinking-of-you outreach triggered',
    });
    return true;
  }

  return false;
}
