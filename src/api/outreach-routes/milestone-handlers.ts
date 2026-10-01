/**
 * Outreach API: milestone, journey and test-send endpoints.
 * Extracted from outreach.routes.ts.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { parseRequestBody, sendJsonResponse } from '../helpers.js';
import type { OutreachRouteContext } from './types.js';

const log = getLogger().child({ module: 'outreach-handler' });

export async function handleMilestoneRoutes(ctx: OutreachRouteContext): Promise<boolean> {
  const { req, res, method, route, authenticatedUserId } = ctx;

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
      await import('../../tools/domains/proactive/outreach/index.js');

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
      await import('../../tools/domains/proactive/outreach/index.js');

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
      await import('../../tools/domains/proactive/outreach/index.js');

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
      await import('../../tools/domains/proactive/outreach/index.js');

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

  return false;
}
