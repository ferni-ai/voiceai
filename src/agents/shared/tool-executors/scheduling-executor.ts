/**
 * Scheduling Domain Tool Executor
 *
 * Handles scheduled communication tools: text messages, calls, emails, and contacts.
 * Routes JSON function calls to the scheduling domain tools.
 *
 * Wired up to:
 * - src/tools/proactive-outreach.ts (scheduling functions)
 * - src/services/scheduling/reminder-scheduler.ts (persistence + delivery)
 * - src/services/calendar/index.ts (calendar events)
 *
 * @module agents/shared/tool-executors/scheduling-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'SchedulingExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Core scheduling
  'schedulemessage',
  'scheduletext',
  'schedulecall',
  'scheduleemail',
  'sendmessagenow',
  'sendtextnow',
  // Immediate calls
  'makephonecall',
  'callcontact',
  // Conversational calls (Ferni talks to someone)
  'callandconverse',
  'havefernicall',
  'callforconversation',
  // Management
  'listscheduled',
  'getscheduled',
  'cancelscheduled',
  'cancelreminder',
  // Contacts
  'savecontact',
  'savecontactinfo',
  'addcontact',
] as const;

/**
 * Execute scheduling-related tools with real backend integration.
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();
  const userId = ctx.userId || 'unknown';
  const personaId = ctx.personaId || 'ferni';

  // Lazy load dependencies
  const loadOutreach = async () => import('../../../tools/domains/proactive/outreach/index.js');
  const loadScheduler = async () => import('../../../services/scheduling/reminder-scheduler.js');

  // ========================================
  // SCHEDULE MESSAGE / TEXT
  // ========================================
  if (fnLower === 'schedulemessage' || fnLower === 'scheduletext') {
    const recipient = args.recipient as string;
    const message = args.message as string;
    const when = args.when as string;

    log.info({ recipient, when, userId }, '📱 Scheduling text message');

    if (!message) {
      return recipient
        ? `What would you like me to say to ${recipient}?`
        : 'What message would you like me to schedule?';
    }

    try {
      const { scheduleText, getUserContactInfo } = await loadOutreach();
      const { parseNaturalTime } = await loadScheduler();

      // Get user's timezone
      const contact = await getUserContactInfo(userId);
      const scheduledFor = parseNaturalTime(when || 'in 1 hour', contact?.timezone);

      if (!scheduledFor) {
        return "I couldn't understand that time. Try something like 'tomorrow at 9am' or 'in 2 hours'.";
      }

      const result = await scheduleText(userId, message, scheduledFor, personaId);

      if (result.success) {
        const timeStr = scheduledFor.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

        // Try to add to calendar
        try {
          await addToCalendar(userId, 'text', recipient || 'you', message, scheduledFor);
        } catch {
          // Calendar integration is optional
        }

        return `Got it! I'll text ${recipient || 'you'} on ${timeStr}: "${message}"`;
      } else {
        if (result.error?.includes('phone')) {
          return "I don't have a phone number on file. What's the best number to reach you at?";
        }
        return `I couldn't schedule that: ${result.error}`;
      }
    } catch (err) {
      log.error({ error: String(err) }, '📱 Failed to schedule text');
      return 'I had trouble scheduling that text. Let me try again in a moment.';
    }
  }

  // ========================================
  // SCHEDULE CALL
  // ========================================
  if (fnLower === 'schedulecall') {
    const recipient = args.recipient as string;
    const reason = (args.reason as string) || (args.message as string);
    const when = args.when as string;

    log.info({ recipient, when, userId }, '📞 Scheduling phone call');

    if (!recipient) {
      return 'Who would you like me to remind you to call?';
    }

    try {
      const { scheduleCall, getUserContactInfo } = await loadOutreach();
      const { parseNaturalTime } = await loadScheduler();

      const contact = await getUserContactInfo(userId);
      const scheduledFor = parseNaturalTime(when || 'in 1 hour', contact?.timezone);

      if (!scheduledFor) {
        return "I couldn't parse that time. Try 'tomorrow at 2pm' or 'in 30 minutes'.";
      }

      const callMessage = reason
        ? `Time to call ${recipient} about ${reason}`
        : `Time to call ${recipient}`;

      const result = await scheduleCall(userId, callMessage, scheduledFor, personaId);

      if (result.success) {
        const timeStr = scheduledFor.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

        // Add to calendar
        try {
          await addToCalendar(userId, 'call', recipient, reason || '', scheduledFor);
        } catch {
          // Calendar integration is optional
        }

        return `I'll remind you to call ${recipient} on ${timeStr}${reason ? ` about ${reason}` : ''}.`;
      } else {
        if (result.error?.includes('phone')) {
          return "I don't have your phone number. What number should I call you at?";
        }
        return `I couldn't schedule that: ${result.error}`;
      }
    } catch (err) {
      log.error({ error: String(err) }, '📞 Failed to schedule call');
      return 'I had trouble scheduling that call reminder. Try again?';
    }
  }

  // ========================================
  // SCHEDULE EMAIL
  // ========================================
  if (fnLower === 'scheduleemail') {
    const recipient = args.recipient as string;
    const subject = (args.subject as string) || 'Reminder';
    const body = (args.body as string) || (args.message as string);
    const when = args.when as string;

    log.info({ recipient, subject, when, userId }, '📧 Scheduling email');

    if (!body) {
      return 'What would you like the email to say?';
    }

    try {
      const { scheduleEmail, getUserContactInfo } = await loadOutreach();
      const { parseNaturalTime } = await loadScheduler();

      const contact = await getUserContactInfo(userId);
      const scheduledFor = parseNaturalTime(when || 'in 1 hour', contact?.timezone);

      if (!scheduledFor) {
        return "I couldn't understand that time. Try 'Friday morning' or 'next week'.";
      }

      const result = await scheduleEmail(userId, subject, body, scheduledFor, personaId);

      if (result.success) {
        const timeStr = scheduledFor.toLocaleString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });

        // Add to calendar
        try {
          await addToCalendar(userId, 'email', recipient || 'you', subject, scheduledFor);
        } catch {
          // Calendar integration is optional
        }

        return `Email scheduled for ${timeStr} with subject: "${subject}"`;
      } else {
        if (result.error?.includes('email')) {
          return "I don't have your email address. What's your email?";
        }
        return `I couldn't schedule that: ${result.error}`;
      }
    } catch (err) {
      log.error({ error: String(err) }, '📧 Failed to schedule email');
      return 'I had trouble scheduling that email. Try again in a moment?';
    }
  }

  // ========================================
  // SEND MESSAGE NOW
  // ========================================
  if (fnLower === 'sendmessagenow' || fnLower === 'sendtextnow') {
    const recipient = args.recipient as string;
    const message = args.message as string;

    log.info({ recipient, userId }, '📱 Sending text now');

    if (!message) {
      return recipient
        ? `What would you like me to say to ${recipient}?`
        : 'What message would you like me to send?';
    }

    try {
      const { textUser } = await loadOutreach();
      const result = await textUser(userId, message, personaId);

      if (result.success) {
        return `Done! I just texted ${recipient || 'you'}: "${message}"`;
      } else {
        if (result.error?.includes('phone')) {
          return "I don't have a phone number on file. What's your number?";
        }
        return `I couldn't send that: ${result.error}. Want me to schedule it instead?`;
      }
    } catch (err) {
      log.error({ error: String(err) }, '📱 Failed to send text');
      return 'I had trouble sending that. Want me to try scheduling it instead?';
    }
  }

  // ========================================
  // MAKE PHONE CALL (Immediate)
  // ========================================
  if (fnLower === 'makephonecall' || fnLower === 'callcontact') {
    const phoneNumber = (args.phoneNumber as string) || (args.phone as string) || (args.contact as string);
    const message = (args.message as string) || (args.purpose as string);

    log.info({ phoneNumber: phoneNumber ? '***' : undefined, userId }, '📞 Making phone call');

    if (!phoneNumber) {
      return 'What phone number would you like me to call?';
    }

    if (!message) {
      return `What message should I deliver when I call ${phoneNumber}?`;
    }

    try {
      // Check if Twilio is configured
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        log.warn('Twilio not configured for calls');
        return `I'd love to make that call, but my phone service isn't fully set up yet. Would you like me to send a text instead?`;
      }

      // Validate and clean phone number
      const cleanNumber = phoneNumber.replace(/\D/g, '');
      if (cleanNumber.length < 10) {
        return `I need a valid phone number. Can you double-check "${phoneNumber}"?`;
      }
      const e164Number = cleanNumber.startsWith('1') ? `+${cleanNumber}` : `+1${cleanNumber}`;

      // Build TwiML for the voice message - use Ferni's persona voice
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Hi! This is a message from Ferni. ${message.replace(/"/g, '&quot;')}. Take care!</Say>
</Response>`;

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: e164Number,
            From: fromNumber,
            Twiml: twiml,
          }),
          signal: AbortSignal.timeout(15000),
        }
      );

      if (response.ok) {
        const data = (await response.json()) as { sid?: string };
        log.info({ callSid: data.sid }, '📞 Call initiated successfully');
        return `Done! I'm calling now. They'll hear: "${message}"`;
      } else {
        const errorBody = await response.text();
        log.error({ status: response.status, body: errorBody }, 'Twilio call error');
        return `I had trouble making that call. Want me to send a text instead?`;
      }
    } catch (err) {
      log.error({ error: String(err) }, '📞 Failed to make call');
      return 'Something went wrong with the call. Would a text work instead?';
    }
  }

  // ========================================
  // LIST SCHEDULED
  // ========================================
  if (fnLower === 'listscheduled' || fnLower === 'getscheduled') {
    log.info({ userId }, '📋 Listing scheduled items');

    try {
      const { getPendingReminders } = await loadScheduler();
      const pending = getPendingReminders(userId);

      if (pending.length === 0) {
        return "You don't have any scheduled messages, calls, or emails right now.";
      }

      const items = pending.slice(0, 5).map((r, i) => {
        const timeStr = r.scheduledFor.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        const typeEmoji =
          r.deliveryMethod === 'sms' ? '📱' : r.deliveryMethod === 'call' ? '📞' : '📧';
        const preview = r.message.length > 40 ? `${r.message.slice(0, 40)}...` : r.message;
        return `${i + 1}. ${typeEmoji} ${timeStr}: "${preview}"`;
      });

      const more = pending.length > 5 ? `\n... and ${pending.length - 5} more` : '';
      return `You have ${pending.length} scheduled:\n${items.join('\n')}${more}`;
    } catch (err) {
      log.error({ error: String(err) }, '📋 Failed to list scheduled');
      return "I couldn't check your scheduled items right now. Try again in a moment?";
    }
  }

  // ========================================
  // CANCEL SCHEDULED
  // ========================================
  if (fnLower === 'cancelscheduled' || fnLower === 'cancelreminder') {
    const itemId = args.itemId as string;
    const recipient = args.recipient as string;
    const which = (args.which as string) || recipient || itemId;

    log.info({ which, userId }, '❌ Canceling scheduled item');

    try {
      const { getPendingReminders, cancelReminder } = await loadScheduler();
      const pending = getPendingReminders(userId);

      if (pending.length === 0) {
        return "You don't have any scheduled items to cancel.";
      }

      // If only one, cancel it
      if (pending.length === 1) {
        const cancelled = await cancelReminder(pending[0].id);
        if (cancelled) {
          return `Done! I cancelled: "${pending[0].message.slice(0, 50)}..."`;
        }
        return 'I had trouble canceling that. Try again?';
      }

      // Try to match by number or content
      if (which) {
        const num = parseInt(which);
        if (!isNaN(num) && num >= 1 && num <= pending.length) {
          const item = pending[num - 1];
          const cancelled = await cancelReminder(item.id);
          if (cancelled) {
            return `Cancelled #${num}: "${item.message.slice(0, 50)}..."`;
          }
        }

        // Try matching by content
        const match = pending.find(
          (r) =>
            r.message.toLowerCase().includes(which.toLowerCase()) ||
            r.deliveryMethod.includes(which.toLowerCase())
        );
        if (match) {
          const cancelled = await cancelReminder(match.id);
          if (cancelled) {
            return `Cancelled: "${match.message.slice(0, 50)}..."`;
          }
        }
      }

      // Show list and ask which one
      const items = pending.map((r, i) => {
        const timeStr = r.scheduledFor.toLocaleString('en-US', {
          weekday: 'short',
          hour: 'numeric',
          minute: '2-digit',
        });
        return `${i + 1}. ${timeStr}: "${r.message.slice(0, 30)}..."`;
      });

      return `Which one should I cancel?\n${items.join('\n')}`;
    } catch (err) {
      log.error({ error: String(err) }, '❌ Failed to cancel scheduled');
      return "I couldn't cancel that right now. Try again in a moment?";
    }
  }

  // ========================================
  // SAVE CONTACT INFO
  // ========================================
  if (fnLower === 'savecontact' || fnLower === 'savecontactinfo' || fnLower === 'addcontact') {
    const name = args.name as string;
    const phone = args.phone as string;
    const email = args.email as string;
    const relationship = args.relationship as string;

    log.info({ name, hasPhone: !!phone, hasEmail: !!email, userId }, '👤 Saving contact');

    if (!phone && !email) {
      return name
        ? `What's the best way to reach ${name}? Phone number or email?`
        : 'I need at least a phone number or email to save.';
    }

    try {
      const { setUserContactInfo } = await loadOutreach();

      await setUserContactInfo(userId, {
        phone,
        email,
        timezone: (args.timezone as string) || undefined,
      });

      const saved: string[] = [];
      if (phone) saved.push('phone number');
      if (email) saved.push('email');

      const whom = name ? `${name}'s` : 'your';
      const extra = relationship ? ` (${relationship})` : '';

      return `Got it! I saved ${whom} ${saved.join(' and ')}${extra}. Now I can text, email, or call for reminders.`;
    } catch (err) {
      log.error({ error: String(err) }, '👤 Failed to save contact');
      return 'I had trouble saving that contact info. Try again?';
    }
  }

  // ========================================
  // CONVERSATIONAL CALL (Ferni calls and has a real conversation)
  // ========================================
  if (
    fnLower === 'callandconverse' ||
    fnLower === 'havefernicall' ||
    fnLower === 'callforconversation'
  ) {
    const contactName = (args.contact as string) || (args.name as string) || (args.recipient as string);
    const phoneNumber = (args.phoneNumber as string) || (args.phone as string);
    const purpose = (args.purpose as string) || (args.reason as string) || (args.message as string);
    const tone = (args.tone as string) || 'casual';

    log.info({ contactName, hasPurpose: !!purpose, userId, personaId }, '🗣️ Initiating conversational call');

    if (!phoneNumber && !contactName) {
      return 'Who would you like me to call and have a conversation with? I need a name or phone number.';
    }

    if (!purpose) {
      return contactName
        ? `What should I talk to ${contactName} about? What's the reason for the call?`
        : 'What should I talk to them about?';
    }

    try {
      // Check if conversational calls are configured
      const { isConversationalCallsConfigured, makeConversationalCall } = await import(
        '../../../services/outreach/conversational-calls.js'
      );

      if (!isConversationalCallsConfigured()) {
        // Fallback: SIP not configured, offer alternative
        log.warn('Conversational calls not configured - SIP trunk needed');
        return `I'd love to call ${contactName || 'them'} and have a real conversation, but my voice calling system needs a bit more setup. Would you like me to:
• Leave a voice message instead?
• Send a text on your behalf?
• Schedule a reminder for you to call them yourself?`;
      }

      // Resolve phone number from contact if needed
      let resolvedPhone = phoneNumber;
      if (!resolvedPhone && contactName) {
        // Try to look up contact
        const { getContact } = await import('../../../services/contacts/contact-relationship-service.js');
        const contact = await getContact(userId, contactName);
        if (contact?.phone) {
          resolvedPhone = contact.phone;
        }
      }

      if (!resolvedPhone) {
        return `I don't have a phone number for ${contactName}. Can you give me their number?`;
      }

      // Validate phone number
      const cleanNumber = resolvedPhone.replace(/\D/g, '');
      if (cleanNumber.length < 10) {
        return `That phone number doesn't look right. Can you double-check it?`;
      }
      const e164Number = cleanNumber.startsWith('1') ? `+${cleanNumber}` : `+1${cleanNumber}`;

      // Determine tone/approach
      const approachTone = tone === 'supportive' ? 'supportive'
        : tone === 'celebratory' ? 'celebratory'
        : tone === 'accountability' ? 'accountability'
        : 'casual';

      // Initiate the conversational call
      const call = await makeConversationalCall({
        trigger: {
          id: `check_in_${Date.now()}`,
          type: 'check_in', // User-initiated calls are check-ins
          reason: purpose,
          urgency: 'medium',
        },
        user: {
          id: `contact_${contactName?.replace(/\s+/g, '_') || 'unknown'}`,
          name: contactName || 'your contact',
          phone: e164Number,
          relationshipStage: 'new',
        },
        context: {
          lastConversationSummary: purpose,
        },
        approach: {
          tone: approachTone,
          primaryGoal: purpose,
        },
        persona: personaId as 'ferni' | 'maya-santos' | 'peter-john' | 'alex-chen' | 'jordan-taylor' | 'nayan',
      });

      log.info({ callId: call.id, status: call.status }, '🗣️ Conversational call initiated');

      // Return immediate response - the call is happening async
      // The conversation summary will be stored and injected later
      return `Okay! I'm calling ${contactName || 'them'} right now. I'll introduce myself and ${purpose}. Give me a few minutes - I'll let you know how the conversation went when I'm done!`;

    } catch (err) {
      log.error({ error: String(err) }, '🗣️ Failed to initiate conversational call');
      return `I ran into a problem setting up that call. Would you like me to send a text to ${contactName || 'them'} instead?`;
    }
  }

  return null;
}

/**
 * Add a scheduled item to the user's calendar.
 */
async function addToCalendar(
  userId: string,
  type: 'text' | 'call' | 'email',
  recipient: string,
  content: string,
  scheduledFor: Date
): Promise<void> {
  try {
    // Dynamic import to avoid circular dependencies
    const { createEvent } = await import('../../../services/calendar/unified-calendar-store.js');

    const emoji = type === 'text' ? '📱' : type === 'call' ? '📞' : '📧';
    const action = type === 'text' ? 'Text' : type === 'call' ? 'Call' : 'Email';
    const title = `${emoji} ${action} ${recipient}`;

    await createEvent(userId, {
      title,
      description: content || `Scheduled ${type} to ${recipient}`,
      startTime: scheduledFor,
      durationMinutes: 15, // 15 min duration
      reminders: [{ method: 'popup', minutesBefore: 5 }],
    });

    log.info({ userId, type, recipient, scheduledFor }, '📅 Added to calendar');
  } catch (err) {
    log.debug({ error: String(err) }, 'Calendar integration not available');
    // Calendar is optional - don't fail the operation
  }
}

export const schedulingExecutor: DomainExecutor = {
  domain: 'scheduling',
  handles: HANDLED_TOOLS,
  execute,
};

export default schedulingExecutor;
