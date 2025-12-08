/**
 * Outreach API Handler
 *
 * HTTP handler for outreach routes that works with the raw http server in ui-server.js.
 * Wraps the Express router-style outreach-routes for compatibility.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { handleCorsPreflightIfNeeded } from './helpers.js';
import { sendJsonResponse, parseRequestBody } from './utils.js';
import { getLogger } from '../utils/safe-logger.js';
import {
  getOutreachDecisionEngine,
  triggerOutreach,
  updateOutreachPreferences,
  updateUserContext,
  registerUserForOutreach,
  getPendingOutreach,
  getOutreachHistory,
  cancelOutreach,
  triggerThinkingOfYou,
  getConversationalCallService,
  getTimingProfile,
  getChannelProfile,
  getUserContext,
  calculateOptimalTime,
  type OutreachTriggerType,
  type OutreachPriority,
} from '../services/outreach/index.js';
import { handleOutreachWebhookRoutes } from './outreach-webhook-routes.js';

const log = getLogger().child({ module: 'outreach-handler' });

// Route prefix for early bailout
const OUTREACH_PREFIX = '/api/outreach';

// In-memory verification codes (in production, use Redis/Firestore with TTL)
const verificationCodes = new Map<string, { code: string; expires: number }>();

// Helper to get persona display name
function getPersonaName(personaId: string): string {
  const names: Record<string, string> = {
    ferni: 'Ferni',
    maya: 'Maya Santos',
    peter: 'Peter John',
    alex: 'Alex Chen',
    jordan: 'Jordan Taylor',
    nayan: 'Nayan Patel',
  };
  return names[personaId] || 'Ferni';
}

/**
 * Check if a pathname is an outreach route
 */
function isOutreachRoute(pathname: string): boolean {
  return pathname.startsWith(OUTREACH_PREFIX);
}

/**
 * Handle outreach API routes
 * @returns true if route was handled
 */
export async function handleOutreachRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  // Early bailout
  if (!isOutreachRoute(pathname)) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  const method = req.method || 'GET';
  const route = pathname.replace(OUTREACH_PREFIX, '');

  try {
    // Handle webhook routes first
    if (route.startsWith('/webhooks')) {
      return handleOutreachWebhookRoutes(req, res, pathname);
    }
    // ========================================================================
    // PREFERENCES
    // ========================================================================

    // GET /api/outreach/preferences
    if (route === '/preferences' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'default';

      const engine = getOutreachDecisionEngine();
      const state = engine.getUserState(userId);

      sendJsonResponse(res, 200, {
        success: true,
        preferences: state.preferences,
        allowedChannels: state.allowedChannels,
        outreachEnabled: state.outreachEnabled,
        relationshipStage: state.relationshipStage,
        counters: state.counters,
      });
      return true;
    }

    // POST /api/outreach/preferences
    if (route === '/preferences' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, preferences } = body as { userId: string; preferences: any };

      if (!userId) {
        sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
        return true;
      }

      updateOutreachPreferences(userId, preferences);
      sendJsonResponse(res, 200, { success: true, message: 'Preferences updated' });
      return true;
    }

    // POST /api/outreach/pause
    if (route === '/pause' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, durationDays } = body as { userId: string; durationDays?: number };

      if (!userId) {
        sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
        return true;
      }

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
      const body = await parseRequestBody(req);
      const { userId } = body as { userId: string };

      if (!userId) {
        sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
        return true;
      }

      const engine = getOutreachDecisionEngine();
      engine.updateUserState(userId, { outreachEnabled: true });

      log.info({ userId }, 'Outreach resumed');
      sendJsonResponse(res, 200, { success: true, message: 'Outreach resumed' });
      return true;
    }

    // ========================================================================
    // TRIGGERS
    // ========================================================================

    // POST /api/outreach/trigger
    if (route === '/trigger' && method === 'POST') {
      const body = await parseRequestBody(req);
      const {
        userId,
        type,
        priority = 'medium',
        reason,
        commitment,
        milestone,
        goal,
        event,
        suggestedTime,
      } = body as {
        userId: string;
        type: OutreachTriggerType;
        priority?: OutreachPriority;
        reason: string;
        commitment?: string;
        milestone?: string;
        goal?: string;
        event?: string;
        suggestedTime?: string;
      };

      if (!userId || !type || !reason) {
        sendJsonResponse(res, 400, {
          success: false,
          error: 'userId, type, and reason are required',
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
      const { userId, trigger, reason } = body as {
        userId: string;
        trigger?: string;
        reason?: string;
      };

      if (!userId) {
        sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
        return true;
      }

      await triggerThinkingOfYou(userId, trigger as any, reason);
      sendJsonResponse(res, 200, {
        success: true,
        message: 'Thinking-of-you outreach triggered',
      });
      return true;
    }

    // ========================================================================
    // PENDING & HISTORY
    // ========================================================================

    // GET /api/outreach/pending
    if (route === '/pending' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'default';

      const pending = getPendingOutreach(userId);
      sendJsonResponse(res, 200, {
        success: true,
        pending,
        count: pending.length,
      });
      return true;
    }

    // GET /api/outreach/upcoming - formatted for UI
    if (route === '/upcoming' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'default';

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
      const userId = url.searchParams.get('userId') || 'default';
      const limit = parseInt(url.searchParams.get('limit') || '20');

      const history = getOutreachHistory(userId, limit);
      sendJsonResponse(res, 200, {
        success: true,
        history,
        count: history.length,
      });
      return true;
    }

    // ========================================================================
    // ANALYTICS
    // ========================================================================

    // GET /api/outreach/analytics
    if (route === '/analytics' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'default';

      const engine = getOutreachDecisionEngine();
      const analytics = engine.getAnalytics(userId);

      sendJsonResponse(res, 200, {
        success: true,
        analytics,
      });
      return true;
    }

    // GET /api/outreach/timing
    if (route === '/timing' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'default';

      const profile = getTimingProfile(userId);
      const nextOptimal = calculateOptimalTime(userId, {
        trigger: { type: 'general', priority: 'medium' },
        channel: 'sms',
      });

      sendJsonResponse(res, 200, {
        success: true,
        patterns: {
          preferredHours: profile.engagementPatterns.preferredHours,
          preferredDays: profile.engagementPatterns.preferredDays,
          avgResponseTimeMs: profile.engagementPatterns.avgResponseTimeMs,
          totalInteractions: profile.engagementPatterns.totalInteractions,
        },
        nextOptimalWindow: nextOptimal,
        preferences: profile.preferences,
      });
      return true;
    }

    // GET /api/outreach/channel-stats
    if (route === '/channel-stats' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'default';

      const profile = getChannelProfile(userId);

      sendJsonResponse(res, 200, {
        success: true,
        stats: {
          preferredChannel: profile.preferences.preferredChannel,
          disabledChannels: profile.preferences.disabledChannels,
          responseRates: profile.learning.responseRates,
          successRates: profile.learning.successfulByChannel,
          totalByChannel: profile.learning.totalByChannel,
          relationshipStage: profile.relationshipStage,
          allowedChannels: profile.allowedChannels,
        },
      });
      return true;
    }

    // GET /api/outreach/context
    if (route === '/context' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const userId = url.searchParams.get('userId') || 'default';

      const context = getUserContext(userId);

      sendJsonResponse(res, 200, {
        success: true,
        context: {
          lastConversation: context.conversations.lastConversation,
          emotionalState: context.emotional.currentState,
          emotionalTrend: context.emotional.emotionalTrend,
          activeCommitments: context.commitments.active.length,
          currentStruggles: context.progress.currentStruggles.length,
          recentWins: context.progress.recentWins.length,
          relationshipStage: context.relationship.stage,
          upcomingEvents: context.lifeEvents.upcoming.length,
        },
      });
      return true;
    }

    // ========================================================================
    // REGISTRATION
    // ========================================================================

    // POST /api/outreach/register
    if (route === '/register' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, relationshipStartDate } = body as {
        userId: string;
        relationshipStartDate?: string;
      };

      if (!userId) {
        sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
        return true;
      }

      registerUserForOutreach(
        userId,
        relationshipStartDate ? new Date(relationshipStartDate) : undefined
      );

      sendJsonResponse(res, 200, {
        success: true,
        message: 'User registered for outreach',
      });
      return true;
    }

    // POST /api/outreach/context
    if (route === '/context' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, context } = body as {
        userId: string;
        context: {
          emotionalState?: string;
          recentTopics?: string[];
          recentWins?: string[];
          currentStruggles?: string[];
          upcomingEvents?: Array<{ date: Date; description: string }>;
          interests?: string[];
        };
      };

      if (!userId) {
        sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
        return true;
      }

      updateUserContext(userId, context);
      sendJsonResponse(res, 200, { success: true, message: 'Context updated' });
      return true;
    }

    // ========================================================================
    // TWILIO WEBHOOKS
    // ========================================================================

    // POST /api/outreach/call/status/:callId
    if (route.startsWith('/call/status/') && method === 'POST') {
      const callId = route.replace('/call/status/', '');
      const body = await parseRequestBody(req);
      const { CallStatus, AnsweredBy } = body as { CallStatus: string; AnsweredBy?: string };

      log.debug({ callId, CallStatus, AnsweredBy }, 'Call status callback');

      try {
        const callService = getConversationalCallService();
        await callService.handleStatusCallback(callId, CallStatus, body as Record<string, unknown>);

        // Validate machine detection result
        const validMachineResults = ['human', 'machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax', 'unknown'] as const;
        type MachineResult = typeof validMachineResults[number];

        if (AnsweredBy && AnsweredBy !== 'human') {
          const machineResult = validMachineResults.includes(AnsweredBy as MachineResult)
            ? (AnsweredBy as MachineResult)
            : 'unknown';
          const twiml = await callService.handleMachineDetection(callId, machineResult);
          if (twiml) {
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead(200);
            res.end(twiml);
            return true;
          }
        }

        res.writeHead(200);
        res.end('OK');
        return true;
      } catch (error) {
        log.error({ error, callId }, 'Error handling call status');
        res.writeHead(500);
        res.end('Error');
        return true;
      }
    }

    // POST /api/outreach/call/machine/:callId
    if (route.startsWith('/call/machine/') && method === 'POST') {
      const callId = route.replace('/call/machine/', '');
      const body = await parseRequestBody(req);
      const { AnsweredBy } = body as { AnsweredBy: string };

      log.debug({ callId, AnsweredBy }, 'Machine detection callback');

      try {
        const callService = getConversationalCallService();

        // Validate machine detection result
        const validMachineResults = ['human', 'machine_start', 'machine_end_beep', 'machine_end_silence', 'machine_end_other', 'fax', 'unknown'] as const;
        type MachineResult = typeof validMachineResults[number];
        const machineResult = validMachineResults.includes(AnsweredBy as MachineResult)
          ? (AnsweredBy as MachineResult)
          : 'unknown';

        const twiml = await callService.handleMachineDetection(callId, machineResult);

        if (twiml) {
          res.setHeader('Content-Type', 'text/xml');
          res.writeHead(200);
          res.end(twiml);
        } else {
          res.writeHead(200);
          res.end('OK');
        }
        return true;
      } catch (error) {
        log.error({ error, callId }, 'Error handling machine detection');
        res.writeHead(500);
        res.end('Error');
        return true;
      }
    }

    // ========================================================================
    // TEST ENDPOINTS (dev only)
    // ========================================================================

    // POST /api/outreach/verify-phone - Send verification code
    if (route === '/verify-phone' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { phone } = body as { phone: string };

      if (!phone) {
        sendJsonResponse(res, 400, { success: false, error: 'phone is required' });
        return true;
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();

      // Store code temporarily (in production, use Redis/Firestore with TTL)
      verificationCodes.set(phone, { code, expires: Date.now() + 10 * 60 * 1000 });

      // Send via Twilio
      try {
        const { textUser } = await import('../tools/proactive-outreach.js');
        await textUser(phone, `Your Ferni verification code is: ${code}`, 'ferni');
        log.info({ phone }, 'Sent verification code');
        sendJsonResponse(res, 200, { success: true, message: 'Verification code sent' });
      } catch (error) {
        log.error({ error, phone }, 'Failed to send verification code');
        sendJsonResponse(res, 500, { success: false, error: 'Failed to send code' });
      }
      return true;
    }

    // POST /api/outreach/verify-phone/confirm - Verify the code
    if (route === '/verify-phone/confirm' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { phone, code } = body as { phone: string; code: string };

      if (!phone || !code) {
        sendJsonResponse(res, 400, { success: false, error: 'phone and code are required' });
        return true;
      }

      const stored = verificationCodes.get(phone);
      if (!stored) {
        sendJsonResponse(res, 400, { success: false, error: 'No verification pending for this number' });
        return true;
      }

      if (Date.now() > stored.expires) {
        verificationCodes.delete(phone);
        sendJsonResponse(res, 400, { success: false, error: 'Code expired. Please request a new one.' });
        return true;
      }

      if (stored.code !== code) {
        sendJsonResponse(res, 400, { success: false, error: 'Invalid code' });
        return true;
      }

      // Code verified!
      verificationCodes.delete(phone);
      log.info({ phone }, 'Phone verified');
      sendJsonResponse(res, 200, { success: true, message: 'Phone verified' });
      return true;
    }

    // POST /api/outreach/contact - Set user contact info
    if (route === '/contact' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, phone, email, preferredMethod, timezone } = body as {
        userId: string;
        phone?: string;
        email?: string;
        preferredMethod?: 'sms' | 'email' | 'call';
        timezone?: string;
      };

      if (!userId) {
        sendJsonResponse(res, 400, { success: false, error: 'userId is required' });
        return true;
      }

      if (!phone && !email) {
        sendJsonResponse(res, 400, { success: false, error: 'At least phone or email is required' });
        return true;
      }

      // Import the outreach tools
      const { setUserContactInfo } = await import('../tools/proactive-outreach.js');

      await setUserContactInfo(userId, { phone, email, preferredMethod, timezone });

      log.info({ userId, hasPhone: !!phone, hasEmail: !!email }, 'Contact info set');
      sendJsonResponse(res, 200, { success: true, message: 'Contact info saved' });
      return true;
    }

    // POST /api/outreach/test/send
    if (route === '/test/send' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { userId, channel, message, subject } = body as {
        userId: string;
        channel: 'sms' | 'email' | 'call';
        message: string;
        subject?: string;
      };

      if (!userId || !channel || !message) {
        sendJsonResponse(res, 400, {
          success: false,
          error: 'userId, channel, and message are required',
        });
        return true;
      }

      // Import the outreach tools
      const { textUser, emailUser, callUser } = await import('../tools/proactive-outreach.js');

      let result: { success: boolean; error?: string };
      switch (channel) {
        case 'sms':
          result = await textUser(userId, message);
          break;
        case 'email':
          result = await emailUser(userId, subject || 'Test from Ferni', message);
          break;
        case 'call':
          result = await callUser(userId, message);
          break;
        default:
          result = { success: false, error: 'Invalid channel' };
      }

      sendJsonResponse(res, result.success ? 200 : 400, result);
      return true;
    }

    // Not found in outreach routes
    sendJsonResponse(res, 404, { success: false, error: 'Outreach endpoint not found' });
    return true;
  } catch (error) {
    log.error({ error, pathname }, 'Outreach route error');
    sendJsonResponse(res, 500, { success: false, error: 'Internal server error' });
    return true;
  }
}

