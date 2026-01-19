/**
 * Communication Domain Tool Executor
 *
 * Handles direct communication tools: sending texts, emails, and voice messages.
 * Routes JSON function calls to the communication services.
 *
 * Note: For scheduled messages, see scheduling-executor.ts
 * Note: For unified outreach (reachOut), see telephony-executor.ts
 *
 * @module agents/shared/tool-executors/communication-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'CommunicationExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Text/SMS
  'sendmessage',
  'sendtext',
  'sendsms',
  // Voice messages
  'sendvoicemessage',
  // Email
  'sendemail',
  // Message analysis/drafting
  'draftmessage',
  'analyzemessage',
] as const;

/**
 * Execute communication-related tools with real backend integration.
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // ========================================
  // SEND VOICE MESSAGE (MMS with audio)
  // ========================================
  if (fnLower === 'sendvoicemessage') {
    const contactName = (args.contactName || args.contact || args.to) as string;
    const message = (args.message || args.text) as string;
    const persona = (args.persona as string) || 'ferni';

    if (!contactName) {
      return 'Who would you like me to send a voice message to?';
    }

    if (!message) {
      return `What would you like me to say to ${contactName}?`;
    }

    log.info({ contactName, persona, userId: ctx.userId }, '🎤 Voice message requested');

    if (!ctx.userId) {
      return 'I need to know who you are to send voice messages.';
    }

    try {
      // Check if voice synthesis is available
      const { isVoiceSynthesisAvailable, generateVoiceMessage } = await import(
        '../../../services/outreach/voice-synthesis.js'
      );

      if (!isVoiceSynthesisAvailable()) {
        log.warn('Voice synthesis not configured');
        return "Voice messages aren't set up yet. Would you like me to send a text instead?";
      }

      // Find the contact
      const { searchContacts } = await import(
        '../../../services/contacts/contact-relationship-service.js'
      );
      const matches = await searchContacts(ctx.userId, contactName);

      if (matches.length === 0) {
        return `I don't have ${contactName} in your contacts. Would you like to add them first?`;
      }

      const contact = matches[0];

      if (!contact.phone) {
        return `${contact.name} doesn't have a phone number saved. Voice messages need a phone number.`;
      }

      // Generate the voice message
      log.info({ persona, messageLength: message.length }, '🎤 Generating voice message');
      const voiceMessage = await generateVoiceMessage({
        text: message,
        personaId: persona,
        userId: ctx.userId,
      });

      if (!voiceMessage) {
        return 'Had trouble generating the voice message. Want me to try again or send a text instead?';
      }

      // Send via MMS using Twilio
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        log.warn('Twilio not configured for MMS');
        return `Voice message ready! Here's the preview: ${voiceMessage.audioUrl}\n\nBut I can't send it yet - messaging isn't fully configured.`;
      }

      // Send MMS with audio attachment
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: contact.phone,
            From: fromNumber,
            Body: `🎤 Voice message from ${persona === 'ferni' ? 'Ferni' : persona}`,
            MediaUrl: voiceMessage.audioUrl,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, '📱 MMS send failed');
        return `I generated the voice message but had trouble sending it. ${voiceMessage.audioUrl}`;
      }

      const mmsData = (await response.json()) as { sid: string };
      log.info({ sid: mmsData.sid, to: contact.phone }, '📱 Voice message sent via MMS');

      return `I sent a voice message to ${contact.name}. They'll receive it as an audio message.`;
    } catch (err) {
      log.error({ error: String(err) }, '🎤 Voice message failed');
      return `Something went wrong sending the voice message. ${String(err)}`;
    }
  }

  // ========================================
  // SEND TEXT MESSAGE (SMS)
  // ========================================
  if (fnLower === 'sendmessage' || fnLower === 'sendtext' || fnLower === 'sendsms') {
    const contactName = (args.contactName || args.contact || args.recipient || args.to) as string;
    const message = (args.message || args.text || args.body) as string;

    if (!contactName) {
      return 'Who would you like me to send a text to?';
    }

    if (!message) {
      return `What would you like me to say to ${contactName}?`;
    }

    log.info({ contactName, userId: ctx.userId }, '📱 Text message requested');

    if (!ctx.userId) {
      return 'I need to know who you are to send messages.';
    }

    try {
      // Find the contact
      const { searchContacts } = await import(
        '../../../services/contacts/contact-relationship-service.js'
      );
      const matches = await searchContacts(ctx.userId, contactName);

      if (matches.length === 0) {
        return `I don't have ${contactName} in your contacts. Would you like to add them first?`;
      }

      const contact = matches[0];

      if (!contact.phone) {
        return `${contact.name} doesn't have a phone number saved. Text messages need a phone number.`;
      }

      // Check Twilio credentials
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        log.warn('Twilio not configured for SMS');
        return `I'd send "${message}" to ${contact.name}, but messaging isn't set up yet. Want me to help you draft it for copy-paste?`;
      }

      // Send SMS via Twilio
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: contact.phone,
            From: fromNumber,
            Body: message,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        log.error({ status: response.status, error: errorText }, '📱 SMS send failed');
        return `Couldn't send the text to ${contact.name}. Want me to try again?`;
      }

      const smsData = (await response.json()) as { sid: string };
      log.info({ sid: smsData.sid, to: contact.phone }, '📱 SMS sent');

      return `I sent your message to ${contact.name}.`;
    } catch (err) {
      log.error({ error: String(err) }, '📱 Text message failed');
      return `Something went wrong sending the text. ${String(err)}`;
    }
  }

  // ========================================
  // SEND EMAIL
  // ========================================
  if (fnLower === 'sendemail') {
    const contactName = (args.contactName || args.contact || args.recipient || args.to) as string;
    const subject = (args.subject || args.title) as string;
    const message = (args.message || args.body || args.text) as string;

    if (!contactName) {
      return 'Who would you like me to email?';
    }

    if (!message) {
      return `What would you like me to say to ${contactName}?`;
    }

    log.info({ contactName, userId: ctx.userId }, '📧 Email requested');

    if (!ctx.userId) {
      return 'I need to know who you are to send emails.';
    }

    try {
      // Find the contact
      const { searchContacts } = await import(
        '../../../services/contacts/contact-relationship-service.js'
      );
      const matches = await searchContacts(ctx.userId, contactName);

      if (matches.length === 0) {
        return `I don't have ${contactName} in your contacts. Would you like to add them first?`;
      }

      const contact = matches[0];

      if (!contact.email) {
        return `${contact.name} doesn't have an email address saved.`;
      }

      // Use the email delivery service
      const { sendEmail } = await import('../../../services/outreach/delivery/email-delivery.js');

      const result = await sendEmail({
        to: contact.email,
        toName: contact.name,
        subject: subject || `Message from Ferni`,
        body: message,
        userId: ctx.userId,
        personaId: ctx.personaId || 'ferni',
        outreachId: `email_${Date.now()}`,
      });

      if (result.success) {
        log.info({ to: contact.email, messageId: result.messageId }, '📧 Email sent');
        return `I sent the email to ${contact.name}.`;
      }

      log.error({ error: result.error }, '📧 Email send failed');
      return `Couldn't send the email to ${contact.name}. ${result.error || 'Please try again.'}`;
    } catch (err) {
      log.error({ error: String(err) }, '📧 Email failed');
      return `Something went wrong sending the email. ${String(err)}`;
    }
  }

  // ========================================
  // DRAFT MESSAGE (Route to communication coaching)
  // ========================================
  if (fnLower === 'draftmessage') {
    const situation = args.situation as string;
    const tone = (args.tone as string) || 'professional';
    const recipient = args.recipient as string;
    const keyPoints = args.keyPoints as string;

    if (!situation) {
      return 'What kind of message would you like help drafting?';
    }

    log.info({ situation, tone }, '✍️ Draft message requested');

    try {
      const { createCommunicationCoachingTools } = await import(
        '../../../tools/domains/communication/communication-coaching.js'
      );
      const tools = createCommunicationCoachingTools();

      // Use the draft difficult message tool
      const result = await tools.draftDifficultMessage.execute(
        {
          conversationType: 'other',
          context: situation,
          recipient: recipient || 'recipient',
          keyPoints: keyPoints || situation,
          desiredOutcome: 'Clear communication',
          format: 'email',
          tone: tone as 'formal' | 'professional' | 'friendly' | 'direct' | 'diplomatic' | 'warm',
        },
        // RunContext stub - the execute function extracts only what it needs
        { ctx: {}, toolCallId: 'internal' } as Parameters<
          typeof tools.draftDifficultMessage.execute
        >[1]
      );

      return result;
    } catch (err) {
      log.error({ error: String(err) }, '✍️ Draft message failed');
      return `Let me help you draft that. What's the main point you want to get across?`;
    }
  }

  // ========================================
  // ANALYZE MESSAGE (Route to communication coaching)
  // ========================================
  if (fnLower === 'analyzemessage') {
    const message = args.message as string;
    const context = args.context as string;
    const concern = args.concern as string | undefined;

    if (!message) {
      return 'Please share the message you would like me to analyze.';
    }

    log.info({ messageLength: message.length }, '🔍 Analyze message requested');

    try {
      const { createCommunicationCoachingTools } = await import(
        '../../../tools/domains/communication/communication-coaching.js'
      );
      const tools = createCommunicationCoachingTools();

      // Use the review message tool
      const result = await tools.reviewMessage.execute(
        {
          message,
          context: context || 'general review',
          concern,
        },
        // RunContext stub - the execute function extracts only what it needs
        { ctx: {}, toolCallId: 'internal' } as Parameters<typeof tools.reviewMessage.execute>[1]
      );

      return result;
    } catch (err) {
      log.error({ error: String(err) }, '🔍 Analyze message failed');
      return `I see your message. What specifically would you like feedback on?`;
    }
  }

  return null;
}

export const communicationExecutor: DomainExecutor = {
  domain: 'communication',
  handles: HANDLED_TOOLS,
  execute,
};

export default communicationExecutor;
