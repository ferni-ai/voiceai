/**
 * Telephony Domain Tool Executor
 *
 * Handles phone call tools: calling on behalf of the user (mom, doctor, restaurant),
 * scheduling callbacks, and checking voicemail.
 *
 * Routes JSON function calls to the telephony domain tools.
 *
 * @module agents/shared/tool-executors/telephony-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'TelephonyExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  'reachout', // Unified "Better than Human" outreach (auto-selects channel)
  'multioutreach', // Multi-target outreach (call/text/email multiple people)
  'callonbehalf',
  // NOTE: callandconverse is handled by scheduling-executor (it came first in registry)
  // NOTE: makephonecall is handled by scheduling-executor (for scheduling calls)
  'schedulecallback',
  'checkvoicemail',
  'requestcallback',
] as const;

/**
 * Execute telephony-related tools with real backend integration.
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();
  const userId = ctx.userId || 'unknown';
  const { sessionId } = ctx;

  // ========================================
  // REACH OUT - UNIFIED "BETTER THAN HUMAN" OUTREACH
  // Auto-selects best channel (call, text, email, conversation)
  // based on purpose, contact preferences, and relationship
  // ========================================
  if (fnLower === 'reachout') {
    const contact = args.contact as string;
    const purpose = args.purpose as string;
    const preferredChannel = args.preferredChannel as string | undefined;
    const message = args.message as string | undefined;
    const sendNow = args.sendNow !== false; // Default to true

    log.info({ contact, purpose, preferredChannel, userId }, '🤝 Unified outreach initiated');

    if (!contact) {
      return 'Who would you like me to reach out to?';
    }

    if (!purpose) {
      return `What would you like me to say to ${contact}?`;
    }

    try {
      // Import the unified outreach service functions
      const { searchContacts } =
        await import('../../../services/contacts/contact-relationship-service.js');
      const { callWithPersonaVoice } = await import('../../../services/voice/voice-call.js');
      const { sendSMS } = await import('../../../services/outreach/delivery/sms-delivery.js');
      const { sendEmail } = await import('../../../services/outreach/delivery/email-delivery.js');

      // Resolve contact info
      let contactInfo: { name: string; phone?: string; email?: string } | null = null;

      const matches = await searchContacts(userId, contact);
      if (matches.length > 0) {
        const match = matches[0];
        contactInfo = {
          name: match.name,
          phone: match.phone,
          email: match.email,
        };
      }

      if (!contactInfo) {
        return `I don't have ${contact} in your contacts. Can you give me their phone number or email?`;
      }

      // Generate simple message
      const messageToSend = message || purpose;
      const personaId = ctx.personaId || 'ferni';
      const outreachId = `outreach_${Date.now()}`;

      // Determine channel (simplified logic)
      let selectedChannel = preferredChannel;
      if (!selectedChannel || selectedChannel === 'auto') {
        // Default: text if we have phone, email if we only have email
        selectedChannel = contactInfo.phone ? 'text' : 'email';

        // Upgrade to call for certain purposes
        const purposeLower = purpose.toLowerCase();
        if (
          purposeLower.includes('check in') ||
          purposeLower.includes('talk') ||
          purposeLower.includes('conversation')
        ) {
          selectedChannel = 'call';
        }
      }

      // Execute the outreach based on channel
      if (selectedChannel === 'call' || selectedChannel === 'conversation') {
        if (!contactInfo.phone) {
          return `I don't have ${contactInfo.name}'s phone number. Should I send an email instead?`;
        }
        const result = await callWithPersonaVoice(contactInfo.phone, messageToSend, personaId, {
          fallbackToTwilioVoice: true,
        });
        if (result.success) {
          return `📞 Calling ${contactInfo.name} now: "${messageToSend}"`;
        }
        return `I couldn't call ${contactInfo.name}. ${result.message || 'Want me to try texting?'}`;
      }

      if (selectedChannel === 'text') {
        if (!contactInfo.phone) {
          return `I don't have ${contactInfo.name}'s phone number. Should I send an email instead?`;
        }
        const result = await sendSMS({
          to: contactInfo.phone,
          body: messageToSend,
          personaId,
          userId,
          outreachId,
        });
        if (result.success) {
          return `📱 Texted ${contactInfo.name}: "${messageToSend}"`;
        }
        return `I couldn't text ${contactInfo.name}. ${result.error || 'Want me to try email?'}`;
      }

      if (selectedChannel === 'email') {
        if (!contactInfo.email) {
          return `I don't have ${contactInfo.name}'s email. Should I try calling or texting?`;
        }
        const result = await sendEmail({
          to: contactInfo.email,
          subject: `From Ferni: ${purpose.slice(0, 50)}`,
          body: messageToSend,
          personaId,
          userId,
          outreachId,
        });
        if (result.success) {
          return `📧 Emailed ${contactInfo.name}: "${messageToSend}"`;
        }
        return `I couldn't email ${contactInfo.name}. ${result.error}`;
      }

      return `I'm not sure how to reach ${contactInfo.name}. What's the best way?`;
    } catch (error) {
      log.error({ error: String(error), contact, purpose }, '🤝 Unified outreach failed');
      return `I had trouble reaching out to ${contact}. ${error instanceof Error ? error.message : 'Would you like me to try a different way?'}`;
    }
  }

  // ========================================
  // MULTI-OUTREACH - Reach multiple people at once
  // Supports mixed channels and scheduling
  // ========================================
  if (fnLower === 'multioutreach') {
    const targets = args.targets as Array<{
      contact: string;
      purpose?: string;
      channel?: string;
      message?: string;
      scheduledFor?: string;
    }>;
    const defaultPurpose = (args.defaultPurpose as string) || 'check in';

    log.info(
      { userId, targetCount: targets?.length, defaultPurpose },
      '🤝 Multi-outreach initiated'
    );

    if (!targets || targets.length === 0) {
      return 'Who would you like me to reach out to?';
    }

    try {
      // Lazy load the multi-outreach tool
      const { createMultiOutreachTool } =
        await import('../../../tools/domains/communication/outreach/multi-outreach.js');

      // Create the tool with context
      const tool = createMultiOutreachTool({
        userId,
        agentId: ctx.personaId || 'ferni',
        agentDisplayName: 'Ferni',
        services: {
          has: () => false,
          get: () => {
            throw new Error('Service not available');
          },
          getOptional: () => undefined,
        },
      });

      // Execute the tool
      const result = await tool.execute({
        targets,
        defaultPurpose,
      });

      return result;
    } catch (error) {
      log.error({ error: String(error), targetCount: targets?.length }, '🤝 Multi-outreach failed');
      return `I had trouble reaching out to those contacts. ${error instanceof Error ? error.message : 'Would you like me to try one at a time?'}`;
    }
  }

  // ========================================
  // CALL ON BEHALF
  // Call someone (mom, doctor, restaurant) on behalf of the user
  // callOnBehalf: Task-driven calls (doctor to reschedule, restaurant to book)
  // NOTE: callandconverse is handled by scheduling-executor
  // NOTE: makephonecall is handled by scheduling-executor
  // ========================================
  if (fnLower === 'callonbehalf') {
    const contact = args.contact as string;
    const phoneNumber = args.phoneNumber as string;
    // callOnBehalf uses 'objective' for what to accomplish
    const objective = (args.objective || args.purpose) as string;
    const callType = (args.callType as string) || 'business';
    const tone = args.tone as string;

    log.info(
      { contact, objective, callType, tone, userId, fn: fnLower },
      '📞 Initiating phone call'
    );

    // Validate required info
    if (!contact && !phoneNumber) {
      return "Who should I call? I'll need a name or phone number.";
    }

    // If we don't have a phone number, try to resolve the contact first
    let resolvedPhoneNumber = phoneNumber;
    let resolvedContactName = contact;

    if (!resolvedPhoneNumber && contact) {
      try {
        // Try to look up the contact in the user's contacts
        const { searchContacts } =
          await import('../../../services/contacts/contact-relationship-service.js');
        const results = await searchContacts(userId, contact);

        if (results.length > 0) {
          const found = results[0];
          if (found.phone) {
            resolvedPhoneNumber = found.phone;
            resolvedContactName = found.name || contact;
            log.info(
              { contact, resolvedName: resolvedContactName, userId },
              '📞 Resolved contact from user contacts'
            );
          } else {
            log.debug({ contact, userId }, '📞 Contact found but no phone number');
            return `I found ${found.name} in your contacts, but I don't have a phone number saved. What's the best number to reach ${found.name === contact ? 'them' : found.name}?`;
          }
        } else {
          log.debug({ contact, userId }, '📞 Contact not found in user contacts');
          return `I don't have ${contact}'s phone number saved yet. What number should I call?`;
        }
      } catch (lookupError) {
        log.warn(
          { error: String(lookupError), contact },
          '📞 Contact lookup failed, asking for number'
        );
        return `I couldn't look up ${contact}'s number right now. Can you tell me what number to call?`;
      }
    }

    try {
      // Lazy load the telephony domain tool
      const { createCallOnBehalfTool } =
        await import('../../../tools/domains/telephony/call-on-behalf.js');

      // Create the tool with context
      const tool = createCallOnBehalfTool({
        userId,
        agentId: ctx.personaId || 'ferni',
        agentDisplayName: 'Ferni',
        services: {
          has: () => false,
          get: () => {
            throw new Error('Service not available');
          },
          getOptional: () => undefined,
        },
      });

      // Execute the tool with resolved values
      const result = await tool.execute({
        contact: resolvedContactName,
        phoneNumber: resolvedPhoneNumber,
        objective: objective || `Check in with ${resolvedContactName}`,
        callType,
      });

      return result;
    } catch (err) {
      log.error({ error: String(err), contact }, '📞 Failed to initiate call');

      // Provide helpful error message
      const errorMsg = String(err);
      if (errorMsg.includes('TWILIO') || errorMsg.includes('SIP')) {
        return "Phone calls aren't set up yet. I can help you prepare what to say instead, or remind you to call later.";
      }

      return `I couldn't start that call right now. Would you like me to remind you to call ${resolvedContactName || contact} later?`;
    }
  }

  // ========================================
  // SCHEDULE CALLBACK / REQUEST CALLBACK
  // Request a callback from a business
  // ========================================
  if (fnLower === 'schedulecallback' || fnLower === 'requestcallback') {
    const contact = args.contact as string;
    const when = args.when as string;

    log.info({ contact, when, userId }, '📅 Scheduling callback');

    if (!contact) {
      return 'Who should call you back?';
    }

    // For now, return a helpful message since callbacks aren't fully implemented
    return `I've noted that you'd like a callback from ${contact}${when ? ` around ${when}` : ''}. I'll remind you to follow up if we don't hear from them.`;
  }

  // ========================================
  // CHECK VOICEMAIL
  // Check or manage voicemail messages
  // ========================================
  if (fnLower === 'checkvoicemail') {
    log.info({ userId }, '📬 Checking voicemail');

    // For now, voicemail integration isn't set up
    return "Voicemail checking isn't set up yet. Is there someone specific you're expecting to hear from?";
  }

  return null;
}

export const telephonyExecutor: DomainExecutor = {
  domain: 'telephony',
  handles: HANDLED_TOOLS,
  execute,
};

export default telephonyExecutor;
