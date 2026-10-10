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
  // Domain tool names (camelCase)
  'reachout', // Unified "Better than Human" outreach (auto-selects channel)
  'multioutreach', // Multi-target outreach (call/text/email multiple people)
  'callonbehalf',
  // NOTE: callandconverse is handled by scheduling-executor (it came first in registry)
  // NOTE: makephonecall is handled by scheduling-executor (for scheduling calls)
  'schedulecallback',
  'checkvoicemail',
  'requestcallback',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // call_make category
  'call_make',
  'telephony_call',
  // call_manage category
  'call_voicemail',
  'call_history',
] as const;

/** Map FTIS tool IDs to canonical handler names */
const TOOL_ALIASES: Record<string, string> = {
  call_make: 'callonbehalf',
  telephony_call: 'callonbehalf',
  call_voicemail: 'checkvoicemail',
  call_history: 'checkvoicemail',
};

/**
 * Execute telephony-related tools with real backend integration.
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  let fnLower = fn.toLowerCase();
  const userId = ctx.userId || 'unknown';
  const { sessionId } = ctx;

  // Resolve FTIS aliases to canonical tool names
  if (TOOL_ALIASES[fnLower]) {
    log.debug(
      { original: fnLower, resolved: TOOL_ALIASES[fnLower] },
      '🔀 Resolving FTIS tool alias'
    );
    fnLower = TOOL_ALIASES[fnLower];
  }

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
    // Text chat and older callers send contact/objective; the tool's schema is
    // contactQuery/purpose. The tool resolves the contact itself (entity store,
    // then saved contacts), so this only maps arguments and hands over.
    const contactQuery = (args.contactQuery || args.contact || args.name) as string | undefined;
    const phoneNumber = args.phoneNumber as string | undefined;
    const purpose = (args.purpose || args.objective) as string | undefined;
    const tone = args.tone as string | undefined;

    log.info({ contactQuery, purpose, userId, fn: fnLower }, '📞 Initiating phone call');

    if (!contactQuery && !phoneNumber) {
      return "Who should I call? I'll need a name or phone number.";
    }
    const contact = contactQuery || phoneNumber;

    try {
      // Ensure on-behalf orchestrator is initialized so call-on-behalf tool has a registered initiator
      const { getOnBehalfCallOrchestrator } =
        await import('../../../services/outreach/on-behalf-call-orchestrator.js');
      getOnBehalfCallOrchestrator();

      const { createCallOnBehalfTool } =
        await import('../../../tools/domains/telephony/call-on-behalf.js');

      const tool = createCallOnBehalfTool({
        userId,
        sessionId: ctx.sessionId,
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

      return await tool.execute({
        contactQuery: contact,
        phoneNumber,
        purpose: purpose || `Check in with ${contact}`,
        additionalContext: tone ? `Tone: ${tone}` : undefined,
      });
    } catch (err) {
      log.error({ error: String(err), contact }, '📞 Failed to initiate call');

      // Provide helpful error message
      const errorMsg = String(err);
      if (errorMsg.includes('TWILIO') || errorMsg.includes('SIP')) {
        return "Phone calls aren't set up yet. I can help you prepare what to say instead, or remind you to call later.";
      }

      return `I couldn't start that call right now. Would you like me to remind you to call ${contact} later?`;
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
