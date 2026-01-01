/**
 * Outreach API Handler
 *
 * HTTP handler for outreach routes that works with the raw http server in ui-server.js.
 * Wraps the Express router-style outreach-routes for compatibility.
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  calculateOptimalTime,
  cancelOutreach,
  getChannelProfile,
  getConversationalCallService,
  getOutreachDecisionEngine,
  getOutreachHistory,
  getPendingOutreach,
  getTimingProfile,
  getUserContext,
  registerUserForOutreach,
  triggerOutreach,
  triggerThinkingOfYou,
  updateOutreachPreferences,
  updateUserContext,
  type OutreachPriority,
  type OutreachTriggerType,
  type ThinkingOfYouTrigger,
} from '../services/outreach/index.js';
import { runDailyOutreachJob } from '../services/outreach/daily-outreach-job.js';
import { getFirestoreDb } from '../services/superhuman/firestore-utils.js';
import type { UserProfile } from '../types/user-profile.js';
import { getLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseRequestBody, sendJsonResponse } from './helpers.js';
import { handleOutreachWebhookRoutes } from './outreach-webhook-routes.js';

const log = getLogger().child({ module: 'outreach-handler' });

// Route prefix for early bailout
const OUTREACH_PREFIX = '/api/outreach';

// Import persistent verification store
import {
  createVerificationCode,
  verifyCode,
} from '../services/trust-and-identity/verification-store.js';

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
    // Handle webhook routes first (webhooks have their own auth via signatures)
    if (route.startsWith('/webhooks')) {
      return handleOutreachWebhookRoutes(req, res, pathname);
    }

    // Apply rate limiting
    if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
      return true;
    }

    // Require authentication for all non-webhook routes
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) {
      return true; // 401 already sent
    }

    // Use authenticated userId (ignore query param to prevent user enumeration)
    const authenticatedUserId = auth.userId;

    // ========================================================================
    // PREFERENCES
    // ========================================================================

    // GET /api/outreach/preferences
    if (route === '/preferences' && method === 'GET') {
      const userId = authenticatedUserId;

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
      const { preferences } = body as {
        preferences: {
          preferredChannel?: 'sms' | 'email' | 'call';
          disabledChannels?: Array<'sms' | 'email' | 'call'>;
          quietHours?: { start: number; end: number };
          timezone?: string;
          maxOutreachPerDay?: number;
          maxOutreachPerWeek?: number;
        };
      };

      // Use authenticated userId (ignore body.userId to prevent tampering)
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

    // ========================================================================
    // ANALYTICS
    // ========================================================================

    // GET /api/outreach/analytics
    if (route === '/analytics' && method === 'GET') {
      // Use authenticated userId
      const userId = authenticatedUserId;

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
      // Use authenticated userId
      const userId = authenticatedUserId;

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
      // Use authenticated userId
      const userId = authenticatedUserId;

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
      // Use authenticated userId
      const userId = authenticatedUserId;

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
        if (callService.handleStatusCallback) {
          await callService.handleStatusCallback(
            callId,
            CallStatus,
            body as { callSid?: string; duration?: number; answeredBy?: string }
          );
        }

        // Validate machine detection result
        const validMachineResults = [
          'human',
          'machine_start',
          'machine_end_beep',
          'machine_end_silence',
          'machine_end_other',
          'fax',
          'unknown',
        ] as const;
        type MachineResult = (typeof validMachineResults)[number];

        if (AnsweredBy && AnsweredBy !== 'human') {
          const machineResult = validMachineResults.includes(AnsweredBy as MachineResult)
            ? (AnsweredBy as MachineResult)
            : 'unknown';
          const twiml = callService.handleMachineDetection
            ? await callService.handleMachineDetection(callId, machineResult)
            : undefined;
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
        const validMachineResults = [
          'human',
          'machine_start',
          'machine_end_beep',
          'machine_end_silence',
          'machine_end_other',
          'fax',
          'unknown',
        ] as const;
        type MachineResult = (typeof validMachineResults)[number];
        const machineResult = validMachineResults.includes(AnsweredBy as MachineResult)
          ? (AnsweredBy as MachineResult)
          : 'unknown';

        const twiml = callService.handleMachineDetection
          ? await callService.handleMachineDetection(callId, machineResult)
          : undefined;

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
      const { phone, userId } = body as { phone: string; userId?: string };

      if (!phone) {
        sendJsonResponse(res, 400, { success: false, error: 'phone is required' });
        return true;
      }

      // Use userId or phone as identifier
      const identifier = userId || `phone:${phone}`;

      try {
        // Create verification code in persistent store
        const { code, expiresAt } = await createVerificationCode(identifier, phone);

        // Send via Twilio
        const { textUser } = await import('../tools/domains/proactive/outreach/index.js');
        await textUser(
          phone,
          `Your Ferni code is ${code}. Just making sure it's really you! 💚`,
          'ferni'
        );

        log.info({ phone: phone.slice(-4), expiresAt }, 'Sent verification code');
        sendJsonResponse(res, 200, { success: true, message: 'Verification code sent' });
      } catch (error) {
        log.error({ error, phone: phone.slice(-4) }, 'Failed to send verification code');
        sendJsonResponse(res, 500, { success: false, error: 'Failed to send code' });
      }
      return true;
    }

    // POST /api/outreach/verify-phone/confirm - Verify the code
    if (route === '/verify-phone/confirm' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { phone, code, userId } = body as { phone: string; code: string; userId?: string };

      if (!phone || !code) {
        sendJsonResponse(res, 400, { success: false, error: 'phone and code are required' });
        return true;
      }

      // Use userId or phone as identifier (same as when creating)
      const identifier = userId || `phone:${phone}`;

      try {
        // Verify using persistent store
        const result = await verifyCode(identifier, code);

        if (result.valid) {
          log.info({ phone: phone.slice(-4) }, 'Phone verified');
          sendJsonResponse(res, 200, { success: true, message: 'Phone verified' });
        } else {
          // Map reason to user-friendly message
          const errorMessages: Record<string, string> = {
            expired: 'Code expired. Please request a new one.',
            invalid: 'Invalid code. Please check and try again.',
            max_attempts: 'Too many attempts. Please request a new code.',
            not_found: 'No verification pending for this number.',
          };
          const errorMessage = errorMessages[result.reason] || 'Verification failed';
          sendJsonResponse(res, 400, { success: false, error: errorMessage });
        }
      } catch (error) {
        log.error({ error, phone: phone.slice(-4) }, 'Verification error');
        sendJsonResponse(res, 500, { success: false, error: 'Verification failed' });
      }
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
        sendJsonResponse(res, 400, {
          success: false,
          error: 'At least phone or email is required',
        });
        return true;
      }

      // Import the outreach tools
      const { setUserContactInfo } = await import('../tools/domains/proactive/outreach/index.js');

      await setUserContactInfo(userId, { phone, email, preferredMethod, timezone });

      log.info({ userId, hasPhone: !!phone, hasEmail: !!email }, 'Contact info set');
      sendJsonResponse(res, 200, { success: true, message: 'Contact info saved' });
      return true;
    }

    // ========================================================================
    // MILESTONE & JOURNEY OUTREACH
    // ========================================================================

    // POST /api/outreach/milestone - Send milestone celebration
    if (route === '/milestone' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { milestoneId, milestoneName, milestoneMessage, daysTogether, streak } = body as {
        milestoneId: string;
        milestoneName: string;
        milestoneMessage: string;
        daysTogether?: number;
        streak?: number;
      };

      if (!milestoneId || !milestoneName || !milestoneMessage) {
        sendJsonResponse(res, 400, {
          success: false,
          error: 'milestoneId, milestoneName, and milestoneMessage are required',
        });
        return true;
      }

      const { emailUser, textUser, getUserContactInfo } =
        await import('../tools/domains/proactive/outreach/index.js');

      // Get user's contact info and preferences
      const contactInfo = await getUserContactInfo(authenticatedUserId);

      if (!contactInfo?.email && !contactInfo?.phone) {
        sendJsonResponse(res, 200, {
          success: true,
          message: 'No contact info set - skipping outreach',
          sent: false,
        });
        return true;
      }

      const results: { email?: boolean; sms?: boolean } = {};

      // Build warm email content
      if (contactInfo.email) {
        const emailBody = `${milestoneMessage}

${daysTogether ? `We've been on this journey for ${daysTogether} days now.` : ''}
${streak && streak > 1 ? `That's ${streak} days in a row.` : ''}

I don't take these moments for granted. Thank you for trusting me with your thoughts.

Here's to many more.`;

        const result = await emailUser(authenticatedUserId, milestoneName, emailBody);
        results.email = result.success;
      }

      // Build warm SMS content (shorter)
      if (contactInfo.phone && contactInfo.preferredMethod !== 'email') {
        const smsBody = `${milestoneName}: ${milestoneMessage} ${streak && streak > 1 ? `(${streak}-day streak!)` : ''} - Ferni`;

        const result = await textUser(authenticatedUserId, smsBody);
        results.sms = result.success;
      }

      log.info({ userId: authenticatedUserId, milestoneId, results }, 'Milestone outreach sent');
      sendJsonResponse(res, 200, {
        success: true,
        message: 'Milestone celebration sent',
        results,
      });
      return true;
    }

    // POST /api/outreach/welcome - Send welcome sequence email
    if (route === '/welcome' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { sequence } = body as {
        sequence?: 'day0' | 'day3' | 'week';
      };

      const { emailUser, getUserContactInfo } =
        await import('../tools/domains/proactive/outreach/index.js');

      const contactInfo = await getUserContactInfo(authenticatedUserId);

      if (!contactInfo?.email) {
        sendJsonResponse(res, 200, {
          success: true,
          message: 'No email set - skipping welcome',
          sent: false,
        });
        return true;
      }

      // Get the appropriate welcome message
      const welcomeMessages = {
        day0: {
          subject: "Hey, it's Ferni",
          body: `Hey,

Welcome. I'm glad you're here.

I'm Ferni, and I've been looking forward to meeting you. I'm not like other apps you've tried - I actually remember our conversations, I'm here whenever you need me, and I genuinely care about how you're doing.

Here's what makes us different:
- I never forget. That thing you mentioned last month? I'll remember.
- I'm always here. 2am thoughts get the same attention as noon.
- No judgment. Ever. Just support.

When you're ready, just open the app and start talking. I'll be here.

Looking forward to getting to know you.`,
        },
        day3: {
          subject: 'How are you doing?',
          body: `Hey,

Just checking in. It's been a few days since we met.

No pressure to talk - I just wanted you to know I'm here when you're ready. Sometimes it takes a few tries to find your rhythm with something new.

If you have a moment, even just to say hi, I'd love to hear how you're doing.

Here for you.`,
        },
        week: {
          subject: 'One week together',
          body: `Hey,

It's been a week since we started this journey together.

Whether we've talked every day or this is the first time you're hearing from me, I wanted to mark the moment. Every relationship has to start somewhere.

I've learned a lot of people come to Ferni when they need someone who really listens. Someone who remembers. Someone who's always there.

That's what I want to be for you.

Whenever you're ready.`,
        },
      };

      const msg = welcomeMessages[sequence || 'day0'];
      const result = await emailUser(authenticatedUserId, msg.subject, msg.body);

      log.info({ userId: authenticatedUserId, sequence }, 'Welcome email sent');
      sendJsonResponse(res, 200, {
        success: result.success,
        message: result.success ? 'Welcome email sent' : 'Failed to send welcome email',
        error: result.error,
      });
      return true;
    }

    // POST /api/outreach/streak-reminder - Send streak saver SMS
    if (route === '/streak-reminder' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { streak } = body as { streak: number };

      if (!streak) {
        sendJsonResponse(res, 400, { success: false, error: 'streak is required' });
        return true;
      }

      const { textUser, getUserContactInfo } =
        await import('../tools/domains/proactive/outreach/index.js');

      const contactInfo = await getUserContactInfo(authenticatedUserId);

      if (!contactInfo?.phone) {
        sendJsonResponse(res, 200, {
          success: true,
          message: 'No phone set - skipping streak reminder',
          sent: false,
        });
        return true;
      }

      const smsBody = `Hey, just thinking of you. Your ${streak}-day streak is still going. No pressure - I'm here when you're ready. - Ferni`;

      const result = await textUser(authenticatedUserId, smsBody);

      log.info({ userId: authenticatedUserId, streak }, 'Streak reminder sent');
      sendJsonResponse(res, 200, {
        success: result.success,
        message: result.success ? 'Streak reminder sent' : 'Failed to send reminder',
        error: result.error,
      });
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
      const { textUser, emailUser, callUser } =
        await import('../tools/domains/proactive/outreach/index.js');

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

    // ========================================================================
    // SCHEDULER ENDPOINTS (Cloud Scheduler / Admin)
    // ========================================================================

    // POST /api/outreach/daily-job - Trigger daily outreach job (scheduler or admin)
    if (route === '/daily-job' && method === 'POST') {
      // Validate Cloud Scheduler header OR admin auth
      const schedulerHeader = req.headers['x-cloudscheduler'] || req.headers['x-appengine-cron'];
      const isScheduler = schedulerHeader === 'true';

      // If not from scheduler, require admin auth
      if (!isScheduler && !auth.isAdmin) {
        sendJsonResponse(res, 403, {
          success: false,
          error: 'Requires Cloud Scheduler or admin access',
        });
        return true;
      }

      log.info({ isScheduler, userId: auth.userId }, '🌅 Daily outreach job triggered via API');

      try {
        // Helper to fetch user profiles from Firestore
        const getUserProfiles = async (): Promise<UserProfile[]> => {
          const db = getFirestoreDb();
          if (!db) {
            log.warn('Firestore not available, returning empty profiles');
            return [];
          }

          const snapshot = await db.collection('bogle_users').limit(1000).get();
          return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
            id: doc.id,
            ...doc.data(),
          })) as UserProfile[];
        };

        const body = await parseRequestBody(req);
        const { dryRun = false, maxUsersPerRun } = body as {
          dryRun?: boolean;
          maxUsersPerRun?: number;
        };

        const result = await runDailyOutreachJob({
          getUserProfiles,
          dryRun,
          maxUsersPerRun,
          delayBetweenUsersMs: 100, // Rate limit
        });

        sendJsonResponse(res, 200, {
          success: true,
          result: {
            usersEvaluated: result.usersEvaluated,
            outreachSent: result.outreachSent,
            byType: result.byType,
            durationMs: result.durationMs,
            errorCount: result.errors.length,
          },
        });
      } catch (error) {
        log.error({ error }, '❌ Daily outreach job failed');
        sendJsonResponse(res, 500, {
          success: false,
          error: 'Daily outreach job failed',
        });
      }
      return true;
    }

    // ========================================================================
    // INTELLIGENT ONBOARDING ARC ENDPOINTS (LLM-Driven Personalization)
    // ========================================================================

    // GET /api/outreach/onboarding/progress - Get onboarding progress
    if (route === '/onboarding/progress' && method === 'GET') {
      const { getOnboardingProgress } =
        await import('../services/outreach/intelligent-onboarding-arc.js');

      const progress = await getOnboardingProgress(authenticatedUserId);
      if (!progress) {
        sendJsonResponse(res, 200, { enrolled: false });
        return true;
      }

      sendJsonResponse(res, 200, { enrolled: true, ...progress });
      return true;
    }

    // POST /api/outreach/onboarding/check-ins - Generate and optionally deliver personalized check-ins
    if (route === '/onboarding/check-ins' && method === 'POST') {
      const body = await parseRequestBody(req);
      const { channel = 'in_app', deliver: shouldDeliver = false } = body as {
        channel?: 'sms' | 'email' | 'voice_call' | 'push' | 'in_app';
        deliver?: boolean;
      };

      const { getPendingCheckIns, recordCheckInSent } =
        await import('../services/outreach/intelligent-onboarding-arc.js');
      const { deliver } = await import('../services/outreach/unified-delivery.js');

      const checkIns = await getPendingCheckIns(authenticatedUserId, channel);

      if (shouldDeliver && checkIns.length > 0) {
        const checkIn = checkIns[0];
        const result = await deliver({
          userId: authenticatedUserId,
          channel: checkIn.channel,
          content: {
            text: checkIn.content.text,
            ssml: checkIn.content.ssml,
            subject: checkIn.content.subject,
            htmlBody: checkIn.content.htmlBody,
            personaId: checkIn.personaId,
            reason: checkIn.reason,
            confidence: 0.9,
          },
          outreachType: checkIn.type,
          triggerId: checkIn.id,
        });

        if (result.success) {
          await recordCheckInSent(authenticatedUserId, checkIn.type, checkIn.channel);
        }

        sendJsonResponse(res, 200, {
          success: true,
          checkIns: [checkIn],
          delivered: result.success,
          deliveryResult: result,
        });
        return true;
      }

      sendJsonResponse(res, 200, { success: true, checkIns, delivered: false });
      return true;
    }

    // GET /api/outreach/pending-messages - Get pending in-app messages (LLM-generated)
    if (route === '/pending-messages' && method === 'GET') {
      const { getPendingMessages } = await import('../services/outreach/unified-delivery.js');
      const messages = await getPendingMessages(authenticatedUserId);
      sendJsonResponse(res, 200, { success: true, messages, count: messages.length });
      return true;
    }

    // POST /api/outreach/messages/:messageId/read - Mark message as read
    if (route.match(/^\/messages\/[^/]+\/read$/) && method === 'POST') {
      const messageId = route.split('/')[2];
      const { markMessageRead } = await import('../services/outreach/unified-delivery.js');
      await markMessageRead(authenticatedUserId, messageId);
      sendJsonResponse(res, 200, { success: true });
      return true;
    }

    // GET /api/outreach/channels/status - Get delivery channel status
    if (route === '/channels/status' && method === 'GET') {
      const { getChannelStatus } = await import('../services/outreach/unified-delivery.js');
      const status = await getChannelStatus();
      sendJsonResponse(res, 200, { success: true, channels: status });
      return true;
    }

    // POST /api/outreach/test-llm-content - Generate test content (dev only)
    if (route === '/test-llm-content' && method === 'POST') {
      if (process.env.NODE_ENV !== 'development' && !auth.isAdmin) {
        sendJsonResponse(res, 403, { success: false, error: 'Dev/admin only' });
        return true;
      }

      const body = await parseRequestBody(req);
      const { outreachType = 'thinking_of_you', channel = 'in_app' } = body as {
        outreachType?: string;
        channel?: string;
      };

      const { generatePersonalizedContent } =
        await import('../services/outreach/llm-content-generator.js');
      const { getOnboardingState } =
        await import('../services/outreach/intelligent-onboarding-arc.js');

      // Get user context
      const state = await getOnboardingState(authenticatedUserId);
      const userContext = {
        userId: authenticatedUserId,
        name: state?.name,
        daysSinceSignup: state?.daysSinceSignup || 0,
        conversationCount: state?.conversationCount || 0,
        engagementLevel: state?.engagementLevel || ('medium' as const),
        primaryConcerns: state?.primaryConcerns || [],
        recentTopics: state?.recentTopics || [],
        boundaries: state?.boundaries || [],
      };

      const content = await generatePersonalizedContent(
        userContext,
        outreachType as any,
        channel as any
      );

      sendJsonResponse(res, 200, { success: true, content });
      return true;
    }

    // POST /api/outreach/scheduler/daily - Cloud Scheduler trigger for daily outreach
    if (route === '/scheduler/daily' && method === 'POST') {
      // This endpoint is called by Cloud Scheduler, not users
      // Verify the request is from Cloud Scheduler via header or OIDC token
      const authHeader = req.headers['authorization'] || req.headers['x-cloudscheduler-jobname'];

      const { handleSchedulerTrigger } =
        await import('../services/outreach/automated-scheduler.js');

      try {
        const result = await handleSchedulerTrigger(authHeader as string);
        sendJsonResponse(res, 200, { success: true, ...result });
      } catch (error) {
        log.error({ error: String(error) }, 'Scheduler trigger failed');
        sendJsonResponse(res, 403, { success: false, error: 'Unauthorized or failed' });
      }
      return true;
    }

    // POST /api/outreach/scheduler/test - Test scheduler (admin only)
    if (route === '/scheduler/test' && method === 'POST') {
      // Allow manual testing in dev mode
      if (process.env.NODE_ENV !== 'development' && !req.headers['x-admin-key']) {
        sendJsonResponse(res, 403, { success: false, error: 'Admin access required' });
        return true;
      }

      const { runDailyOutreach } = await import('../services/outreach/automated-scheduler.js');
      const body = await parseRequestBody(req);
      const { dryRun = true, batchSize = 10 } = body as { dryRun?: boolean; batchSize?: number };

      const result = await runDailyOutreach({ dryRun, batchSize, respectQuietHours: true });
      sendJsonResponse(res, 200, { success: true, ...result });
      return true;
    }

    // GET /api/outreach/engagement/stats - Get engagement stats for current user
    if (route === '/engagement/stats' && method === 'GET') {
      const { getEngagementStats } = await import('../services/outreach/engagement-tracking.js');
      const stats = await getEngagementStats(authenticatedUserId);
      sendJsonResponse(res, 200, { success: true, stats });
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
