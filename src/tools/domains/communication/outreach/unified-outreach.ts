/**
 * Unified Outreach Tool - "Better than Human" Communication
 * THE ONE tool for reaching out to contacts (replaced sendMessage, sendEmail, sendSMS,
 * sendPersonalizedMessage, makePhoneCall, callAndConverse, sendVoiceMessage).
 *
 * "Better than Human" because:
 * 1. REMEMBERS EVERYTHING - Pulls full relationship context
 * 2. PERFECT TIMING - Uses ML to pick optimal send time
 * 3. TRULY PERSONAL - LLM crafts messages from relationship history
 * 4. CHANNEL SMART - Picks best channel based on purpose + preferences
 * 5. REAL CONVERSATIONS - Can have actual dialogue, not just voicemail
 *
 * "Reach out to Mom and wish her happy birthday": look up Mom and her history, craft a
 * message only we'd write, and send it on her preferred channel.
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { createLogger } from '../../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition, Tool } from '../../../registry/types.js';

import {
  searchContacts,
  getContact,
  getContactContext,
  getInteractionHistory,
  getTopicsToDiscuss,
  recordInteraction,
  type ContactRelationship,
} from '../../../../services/contacts/contact-relationship-service.js';

import { calculateOptimalTime } from '../../../../services/outreach/timing-intelligence.js';
import { makeConversationalCall } from '../../../../services/outreach/conversational-calls.js';
import type { OutboundCallContext } from '../../../../services/outreach/conversational-calls.js';

import {
  isOwnVerifiedPhone,
  onBehalfNotSent,
  textOnBehalf,
} from '../../../../services/outreach/guarded-text.js';
import { thirdPartyRefusal } from '../../../../utils/consent-port.js';
import { callWithPersonaVoice } from '../../../../services/voice/voice-call.js';

import { craftPersonalizedMessage } from './message-crafting.js';
import { emailSender, sendOutreachEmail, type EmailFrom } from './outreach-email.js';
import { PLAN_ONLY, PLANNED, type Planned } from './outreach-confirm.js';

const log = createLogger({ module: 'unified-outreach' });
const notAgreed = (why: string): string =>
  why === 'opted-out' ? 'They asked not to be called.' : "They haven't said yes to my calls yet.";

// ============================================================================
// TYPES
// ============================================================================

export type OutreachIntent =
  | 'check_in' // Just seeing how they're doing
  | 'wish_well' // Birthday, congrats, good morning, etc.
  | 'share_news' // Sharing something with them
  | 'ask_question' // Need to ask them something
  | 'follow_up' // Following up on previous conversation
  | 'important' // Something urgent/important
  | 'just_because' // No specific reason, thinking of them
  | 'schedule' // Scheduling something
  | 'thank_you' // Expressing gratitude
  | 'apology' // Apologizing
  | 'reminder'; // Reminding them

export type Channel = 'call' | 'text' | 'email' | 'voicemail' | 'conversation';

export interface OutreachContext {
  contact: ContactRelationship;
  intent: OutreachIntent;
  purpose: string;
  userId: string;
  personaId: string;

  // Rich context from relationship
  daysSinceLastContact: number;
  recentTopics: string[];
  pendingFollowUp?: string;
  relationshipStrength: number;
  preferredChannel?: Channel;
  bestTimeToReach?: string;
}

export interface OutreachDecision {
  channel: Channel;
  confidence: number;
  reasoning: string;
  alternatives: Channel[];
  suggestedTime?: Date;
  isNowGood: boolean;
}

export interface OutreachResult {
  success: boolean;
  channel: Channel;
  message: string;
  contactName: string;
  error?: string;
  to?: string; // where it would go, and who: set only on a PLAN_ONLY preview (sends nothing)
  contactId?: string;
  from?: EmailFrom; // an email's mailbox (outreach-email.ts); fromAddress only on a preview
  fromAddress?: string;
}

// ============================================================================
// INTENT DETECTION
// ============================================================================

function detectIntent(purpose: string): OutreachIntent {
  const p = purpose.toLowerCase();

  if (
    /\b(happy birthday|birthday|congratulat|good (morning|afternoon|evening)|wish(ing)?|great day|best wishes|get well|feel better|thinking of you)\b/.test(
      p
    )
  ) {
    return 'wish_well';
  }

  if (/\b(thank|grateful|appreciate|gratitude)\b/.test(p)) return 'thank_you';

  if (/\b(sorry|apologize|apology|forgive)\b/.test(p)) return 'apology';

  if (/\b(urgent|important|emergency|asap|need to|must)\b/.test(p)) return 'important';

  if (/\b(ask|question|wondering|know if|find out)\b/.test(p)) return 'ask_question';

  if (/\b(follow up|following up|check(ing)? (back|in)|how did|how was)\b/.test(p))
    return 'follow_up';

  if (/\b(schedule|plan|set up|arrange|meet|appointment|calendar)\b/.test(p)) return 'schedule';

  if (/\b(share|tell|let .* know|update|news)\b/.test(p)) return 'share_news';

  if (/\b(remind|reminder|don't forget|remember)\b/.test(p)) return 'reminder';

  if (/\b(check in|checking in|see how|how (are|is)|doing)\b/.test(p)) return 'check_in';

  return 'just_because';
}

// ============================================================================
// CHANNEL SELECTION - "Better than Human" Decision Engine
// ============================================================================

function needsConversation(intent: OutreachIntent, purpose: string): boolean {
  const conversationalIntents: OutreachIntent[] = [
    'check_in',
    'ask_question',
    'schedule',
    'apology',
    'important',
  ];

  if (conversationalIntents.includes(intent)) return true;

  const conversationPhrases = [
    'chat',
    'talk',
    'discuss',
    'conversation',
    'speak with',
    'catch up',
    'hear from',
  ];
  return conversationPhrases.some((phrase) => purpose.toLowerCase().includes(phrase));
}

function selectOptimalChannel(ctx: OutreachContext): OutreachDecision {
  const { intent, purpose, contact, daysSinceLastContact } = ctx;

  // Channel priority by intent
  const priorities: Record<OutreachIntent, Channel[]> = {
    check_in: ['conversation', 'text', 'call', 'email'],
    wish_well: ['text', 'voicemail', 'email', 'conversation'],
    share_news: ['text', 'email', 'conversation', 'voicemail'],
    ask_question: ['conversation', 'text', 'call', 'email'],
    follow_up: ['text', 'conversation', 'email', 'call'],
    important: ['conversation', 'call', 'text', 'email'],
    just_because: ['text', 'voicemail', 'email', 'conversation'],
    schedule: ['text', 'conversation', 'email', 'call'],
    thank_you: ['text', 'voicemail', 'email', 'conversation'],
    apology: ['conversation', 'call', 'text', 'email'],
    reminder: ['text', 'email', 'voicemail', 'call'],
  };

  let channelList = priorities[intent] || ['text', 'conversation', 'email', 'call'];

  if (ctx.preferredChannel) {
    channelList = [ctx.preferredChannel, ...channelList.filter((c) => c !== ctx.preferredChannel)];
  }

  const hasPhone = !!contact.phone;
  const hasEmail = !!contact.email;

  const available = channelList.filter((ch) => {
    if (ch === 'email') return hasEmail;
    if (['call', 'conversation', 'voicemail', 'text'].includes(ch)) return hasPhone;
    return true;
  });

  if (available.length === 0) {
    return {
      channel: 'email',
      confidence: 0.3,
      reasoning: "I don't have contact info. Can you provide a phone number or email?",
      alternatives: [],
      isNowGood: false,
    };
  }

  const selected = available[0];
  const reasoning: string[] = [];

  if (needsConversation(intent, purpose) && selected === 'conversation') {
    reasoning.push('This seems like something worth having a real conversation about');
  } else if (intent === 'wish_well' && selected === 'text') {
    reasoning.push('A quick text is perfect for sending good wishes');
  } else if (intent === 'important' && ['conversation', 'call'].includes(selected)) {
    reasoning.push('For something important, a call ensures they hear it');
  } else if (ctx.preferredChannel === selected) {
    reasoning.push(`${selected} is how they prefer to be reached`);
  }

  // Relationship-aware reasoning
  if (daysSinceLastContact > 30) {
    reasoning.push("It's been a while - a personal touch would be nice");
  }
  if (ctx.relationshipStrength >= 80) {
    reasoning.push('Given your close relationship');
  }

  return {
    channel: selected,
    confidence: 0.85,
    reasoning: reasoning.length > 0 ? `${reasoning.join('. ')}.` : `${selected} seems best here.`,
    alternatives: available.slice(1, 3),
    isNowGood: true,
  };
}

// ============================================================================
// CONTEXT GATHERING - "Better than Human" Memory
// ============================================================================

async function gatherOutreachContext(
  userId: string,
  contact: ContactRelationship,
  purpose: string,
  personaId: string
): Promise<OutreachContext> {
  // No recorded interaction means no "it's been a while": 0 keeps the message from claiming a gap
  const last = contact.lastInteraction;
  const daysSinceLastContact = last ? Math.floor((Date.now() - last.getTime()) / 86_400_000) : 0;

  const recentTopics = contact.topics?.slice(0, 5).map((t) => t.topic) || [];

  const pendingFollowUp =
    contact.pendingFollowUp?.completed === false ? contact.pendingFollowUp.reason : undefined;

  return {
    contact,
    intent: detectIntent(purpose),
    purpose,
    userId,
    personaId,
    daysSinceLastContact,
    recentTopics,
    pendingFollowUp,
    relationshipStrength: contact.strengthScore || 50,
    preferredChannel: contact.preferredChannel as Channel | undefined,
    bestTimeToReach: contact.bestTimeToReach,
  };
}

// ============================================================================
// OUTREACH EXECUTION
// ============================================================================

async function executeOutreach(
  ctx: OutreachContext,
  decision: OutreachDecision,
  customMessage?: string,
  planOnly = false,
  emailFrom?: EmailFrom
): Promise<OutreachResult> {
  const { contact, userId, personaId, purpose, intent } = ctx;
  const { channel } = decision;
  const outreachId = `outreach_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const message =
    customMessage ||
    (await craftPersonalizedMessage({
      contactName: contact.name,
      purpose,
      intent,
      recentTopics: ctx.recentTopics,
      daysSinceLastContact: ctx.daysSinceLastContact,
      relationshipStrength: ctx.relationshipStrength,
      pendingFollowUp: ctx.pendingFollowUp,
      personaId,
    }));
  const to = channel === 'email' ? contact.email : contact.phone;
  const sender = channel === 'email' ? await emailSender(userId, emailFrom) : {};
  if ('error' in sender)
    return { success: false, channel, message, contactName: contact.name, ...sender };
  const plan = { contactName: contact.name, contactId: contact.id, to, ...sender };
  if (planOnly) return { success: true, channel, message, ...plan };
  // MESSAGING_PIPELINE: a call to anyone but the owner needs their consent (consent-grants.ts).
  const isCall = ['call', 'voicemail', 'conversation'].includes(channel);
  const refused =
    isCall && to ? await thirdPartyRefusal(userId, to, 'call', isOwnVerifiedPhone) : null;
  if (refused) return { success: false, channel, message, ...plan, error: notAgreed(refused) };

  log.info(
    {
      channel,
      contactName: contact.name,
      intent,
      messageLength: message.length,
    },
    '🤝 Executing personalized outreach'
  );

  try {
    // CONVERSATION - Real two-way call via LiveKit
    if (channel === 'conversation') {
      if (!contact.phone) {
        return {
          success: false,
          channel,
          message,
          contactName: contact.name,
          error: `I don't have ${contact.name}'s phone number. What's the best number to reach them?`,
        };
      }

      const callContext: OutboundCallContext = {
        trigger: {
          id: outreachId,
          type: 'thinking_of_you',
          reason: purpose,
          urgency: intent === 'important' ? 'high' : 'medium',
        },
        user: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone,
          relationshipStage:
            ctx.relationshipStrength >= 80
              ? 'deep'
              : ctx.relationshipStrength >= 50
                ? 'established'
                : 'building',
        },
        context: {
          lastConversationSummary: ctx.recentTopics.join(', ') || undefined,
          activeCommitments: ctx.pendingFollowUp ? [ctx.pendingFollowUp] : [],
          emotionalState: 'neutral',
        },
        approach: {
          tone: intent === 'apology' ? 'supportive' : 'casual',
          primaryGoal: purpose,
          maxDuration: 5,
        },
        persona: personaId as
          | 'ferni'
          | 'maya-santos'
          | 'peter-john'
          | 'alex-chen'
          | 'jordan-taylor'
          | 'nayan',
      };

      const result = await makeConversationalCall(callContext);

      if (result.status === 'initiating' || result.status === 'ringing') {
        await recordInteraction(userId, {
          contactId: contact.id,
          userId,
          date: new Date(),
          type: 'call',
          direction: 'outbound',
          summary: `Calling to: ${purpose}`,
        }).catch((err) =>
          log.debug(
            { error: String(err), contactId: contact.id },
            'Failed to record call interaction (non-fatal)'
          )
        );

        return {
          success: true,
          channel,
          message: `📞 Calling ${contact.name} now. I'll let you know how it goes!`,
          contactName: contact.name,
        };
      }

      return {
        success: false,
        channel,
        message,
        contactName: contact.name,
        error: `Couldn't start the call to ${contact.name}. Want me to try texting instead?`,
      };
    }

    // CALL/VOICEMAIL - One-way voice message
    if (channel === 'call' || channel === 'voicemail') {
      if (!contact.phone) {
        return {
          success: false,
          channel,
          message,
          contactName: contact.name,
          error: `I don't have ${contact.name}'s phone number.`,
        };
      }

      const result = await callWithPersonaVoice(contact.phone, message, personaId, {
        askedFor: true, // a call they confirmed (outreach-pause.ts)
        ownerUid: userId,
        userId,
      });

      if (result.success) {
        await recordInteraction(userId, {
          contactId: contact.id,
          userId,
          date: new Date(),
          type: 'call',
          direction: 'outbound',
          summary: `Voice message: ${purpose}`,
        }).catch((err) =>
          log.debug(
            { error: String(err), contactId: contact.id },
            'Failed to record voice message interaction (non-fatal)'
          )
        );

        return {
          success: true,
          channel,
          message: `📞 Calling ${contact.name}: "${message}"`,
          contactName: contact.name,
        };
      }

      return {
        success: false,
        channel,
        message,
        contactName: contact.name,
        error: result.message || 'Call failed. Want me to try texting?',
      };
    }

    // TEXT
    if (channel === 'text') {
      if (!contact.phone) {
        return {
          success: false,
          channel,
          message,
          contactName: contact.name,
          error: `I don't have ${contact.name}'s phone number. Should I email instead?`,
        };
      }

      const result = await textOnBehalf({
        senderUserId: userId,
        toPhone: contact.phone,
        body: message,
        refId: outreachId,
        personaId,
      });

      if (result.sent) {
        await recordInteraction(userId, {
          contactId: contact.id,
          userId,
          date: new Date(),
          type: 'text',
          direction: 'outbound',
          summary: `Text: ${purpose}`,
        }).catch((err) =>
          log.debug(
            { error: String(err), contactId: contact.id },
            'Failed to record text interaction (non-fatal)'
          )
        );

        return {
          success: true,
          channel,
          message: `📱 Texted ${contact.name}: "${message}"`,
          contactName: contact.name,
        };
      }

      return {
        success: false,
        channel,
        message,
        contactName: contact.name,
        error: onBehalfNotSent(contact.name, result.reason),
      };
    }

    if (channel === 'email') {
      const subject = generateSubject(intent, purpose, contact.name);
      const { from } = sender;
      return await sendOutreachEmail({ ...ctx, subject, message, outreachId, from });
    }

    return {
      success: false,
      channel,
      message,
      contactName: contact.name,
      error: `I'm not sure how to reach ${contact.name}. What's the best way?`,
    };
  } catch (error) {
    log.error({ error: String(error), channel, contactName: contact.name }, 'Outreach failed');
    return {
      success: false,
      channel,
      message,
      contactName: contact.name,
      error: `Something went wrong reaching ${contact.name}. ${error instanceof Error ? error.message : 'Want to try another way?'}`,
    };
  }
}

function generateSubject(intent: OutreachIntent, purpose: string, name: string): string {
  const firstName = name.split(' ')[0];

  switch (intent) {
    case 'wish_well':
      if (purpose.toLowerCase().includes('birthday')) return `Happy Birthday, ${firstName}! 🎂`;
      return `Thinking of you, ${firstName}`;
    case 'check_in':
      return `Hey ${firstName} - how are you?`;
    case 'thank_you':
      return `Thank you, ${firstName}! 🙏`;
    case 'important':
      return `Important: ${purpose.slice(0, 40)}`;
    case 'follow_up':
      return `Following up - ${purpose.slice(0, 40)}`;
    default:
      return `Hey ${firstName}`;
  }
}

// ============================================================================
// MAIN TOOL CREATOR
// ============================================================================

export function createUnifiedOutreachTool(ctx: ToolContext): Tool {
  return llm.tool({
    description: `Reach out to someone on your behalf. I'll automatically:
- Choose the best channel (call, text, email, conversation) based on the purpose
- Craft a truly personalized message using what I know about your relationship
- Pick optimal timing based on when they're most responsive
- Have a real conversation if needed, not just leave a message

Just tell me WHO and WHY. I'll handle the rest.`,

    parameters: z.object({
      contact: z.string().describe('Who to reach out to (name, relationship, or phone/email)'),
      purpose: z
        .string()
        .describe(
          'Why you want to reach out - be natural: "wish her happy birthday", "see how he\'s doing"'
        ),
      preferredChannel: z
        .enum(['call', 'text', 'email', 'conversation', 'auto'])
        .optional()
        .describe('Override automatic channel selection. "conversation" = real two-way call.'),
      customMessage: z
        .string()
        .optional()
        .describe(
          "Optional: Your own message. Otherwise I'll craft one based on your relationship."
        ),
      fromFerni: z
        .boolean()
        .optional()
        .describe(
          "Email only: send from Ferni's address, not the caller's Gmail. Only if they chose it."
        ),
    }),

    execute: async (params) => {
      const userId = ctx.userId;
      if (!userId) return 'I need to know who you are to reach out on your behalf.';

      const { contact, purpose, preferredChannel, customMessage } = params;
      const personaId = ctx.agentId || 'ferni';

      log.info({ userId, contact, purpose, preferredChannel }, '🤝 Outreach initiated');

      // Step 1: Resolve the contact
      let contactInfo: ContactRelationship | null = null;
      try {
        const matches = await searchContacts(userId, contact);
        if (matches.length > 0) {
          contactInfo = matches[0];
        }
      } catch (err) {
        log.warn({ error: String(err), contact }, 'Contact lookup failed');
      }

      // Try parsing as phone/email if not found
      if (!contactInfo) {
        const phoneMatch = contact.match(/[\d\-\+\(\)\s]{10,}/);
        const emailMatch = contact.match(/[^\s]+@[^\s]+\.[^\s]+/);

        if (phoneMatch || emailMatch) {
          contactInfo = {
            id: `temp_${Date.now()}`,
            userId,
            contactId: phoneMatch?.[0] || emailMatch?.[0] || contact,
            name: 'Unknown',
            phone: phoneMatch?.[0]?.replace(/\D/g, ''),
            email: emailMatch?.[0],
            firstInteraction: new Date(),
            interactionCount: 0,
            topics: [],
            recentContext: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
      }

      if (!contactInfo) {
        return (
          `I don't have ${contact} in your contacts. ` +
          `Can you give me their phone number or email, or should I save them as a new contact?`
        );
      }

      if (!contactInfo.phone && !contactInfo.email) {
        return (
          `I found ${contactInfo.name}, but I don't have their phone or email. ` +
          `What's the best way to reach them?`
        );
      }

      // A confirmed send goes where the caller heard, to the same contact (outreach-confirm.ts)
      const planned = (params as { [PLANNED]?: Planned })[PLANNED];
      const same = planned?.contactId === contactInfo.id || planned?.contactId.startsWith('temp_');
      if (planned && !same) return `Nothing was sent: ${contact} isn't the contact you confirmed.`;
      const at = planned?.channel === 'email' ? 'email' : 'phone';
      if (planned) contactInfo = { ...contactInfo, [at]: planned.to };
      // The mailbox read back, or Ferni's if the caller picked it (outreach-email.ts)
      const emailFrom = planned
        ? (planned.from ?? 'ferni')
        : params.fromFerni
          ? 'ferni'
          : undefined;

      // Step 2: Gather rich context
      const outreachCtx = await gatherOutreachContext(userId, contactInfo, purpose, personaId);

      // Step 3: Select optimal channel
      let decision: OutreachDecision;
      if (preferredChannel && preferredChannel !== 'auto') {
        decision = {
          channel: preferredChannel,
          confidence: 1.0,
          reasoning: `You asked me to ${preferredChannel === 'conversation' ? 'have a conversation' : preferredChannel}.`,
          alternatives: [],
          isNowGood: true,
        };
      } else {
        decision = selectOptimalChannel(outreachCtx);
      }

      // Step 4: Execute outreach, or with PLAN_ONLY only decide it (outreach-confirm.ts)
      const planOnly = PLAN_ONLY in params;
      const result = await executeOutreach(
        outreachCtx,
        decision,
        customMessage,
        planOnly,
        emailFrom
      );
      if (planOnly) return result;

      if (result.success) return result.message;
      return result.error || `I couldn't reach ${contactInfo.name}. Want to try another way?`;
    },
  });
}

// ============================================================================
// TOOL DEFINITION EXPORT
// ============================================================================

export function getUnifiedOutreachDefinition(): ToolDefinition {
  return {
    id: 'reachOut',
    name: 'Reach Out',
    description:
      "Reach out to someone - I'll choose the best channel, craft a personalized message, and handle the delivery.",
    domain: 'communication',
    tags: ['outreach', 'call', 'text', 'email', 'conversation', 'contact', 'message'],
    requiredServices: ['twilio', 'email'],
    create: createUnifiedOutreachTool,
  };
}

export default createUnifiedOutreachTool;
