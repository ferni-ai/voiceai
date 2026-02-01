/**
 * Message Crafting - LLM-Powered "Better than Human" Personalization
 *
 * This is where the magic happens. Instead of templates, we use the LLM
 * to craft genuinely personal messages based on:
 * - Relationship history (what you've talked about)
 * - Recent context (what's going on in their life)
 * - Appropriate tone for the relationship
 * - The specific purpose/occasion
 *
 * Why "Better than Human":
 * - Perfect memory of every conversation topic
 * - No cognitive load remembering details
 * - Consistent thoughtfulness at scale
 * - Never forgets important dates or follow-ups
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { callLLM } from '../../../../services/llm-utils.js';
import {
  TEMP_REASONING,
  MAX_TOKENS_TINY,
  LLM_TIMEOUT_MS,
} from '../../../../config/gemini-config.js';
import type { OutreachIntent } from './unified-outreach.js';

const log = createLogger({ module: 'message-crafting' });

// ============================================================================
// TYPES
// ============================================================================

export interface MessageCraftingContext {
  contactName: string;
  purpose: string;
  intent: OutreachIntent;
  recentTopics: string[];
  daysSinceLastContact: number;
  relationshipStrength: number; // 0-100
  pendingFollowUp?: string;
  personaId: string;
  channel?: 'text' | 'email' | 'voicemail' | 'call' | 'conversation';
}

// ============================================================================
// FALLBACK TEMPLATES (When LLM unavailable)
// ============================================================================

const FALLBACK_TEMPLATES: Record<OutreachIntent, string[]> = {
  check_in: [
    "Hey {name}, just thinking about you - how's everything going?",
    "Hi {name}! Hope you're doing well. Would love to catch up.",
    'Hey {name}, been a while! How are you?',
  ],
  wish_well: [
    "Hey {name}, sending good vibes your way! Hope today's amazing.",
    'Hi {name}! Wishing you a wonderful {occasion}!',
    '{name} - hope you have an incredible day!',
  ],
  share_news: [
    'Hey {name}, wanted to share something with you...',
    "Hi {name}! Got some news I thought you'd want to hear.",
    "{name} - thought you'd like to know...",
  ],
  ask_question: [
    'Hey {name}, quick question for you when you have a sec.',
    'Hi {name}! Got something I wanted to ask you about.',
    '{name} - need your input on something.',
  ],
  follow_up: [
    'Hey {name}, following up on our conversation.',
    'Hi {name}! Just checking back in.',
    '{name} - wanted to circle back.',
  ],
  important: [
    '{name}, something important came up I need to tell you.',
    'Hey {name}, please call me when you get this.',
    '{name} - need to talk to you about something important.',
  ],
  just_because: [
    'Hey {name}! Just wanted to say hi.',
    'Thinking of you, {name}!',
    'Hi {name}! No reason, just wanted to reach out.',
  ],
  schedule: [
    'Hey {name}, want to find a time to meet up?',
    "Hi {name}! Let's get something on the calendar.",
    '{name} - when works for you?',
  ],
  thank_you: [
    'Hey {name}, thank you so much!',
    '{name} - really appreciate you!',
    'Thank you, {name}! That meant a lot.',
  ],
  apology: [
    'Hey {name}, I wanted to apologize.',
    "{name}, I'm sorry. Can we talk?",
    'Hey {name}, I owe you an apology.',
  ],
  reminder: [
    'Hey {name}, quick reminder about {topic}.',
    'Hi {name}! Just a heads up about {topic}.',
    "{name} - don't forget about {topic}!",
  ],
};

// ============================================================================
// LLM-POWERED MESSAGE CRAFTING
// ============================================================================

export async function craftPersonalizedMessage(ctx: MessageCraftingContext): Promise<string> {
  const {
    contactName,
    purpose,
    intent,
    recentTopics,
    daysSinceLastContact,
    relationshipStrength,
    pendingFollowUp,
    personaId,
    channel = 'text',
  } = ctx;

  const firstName = contactName.split(' ')[0];

  // Build context for the LLM
  const relationshipDescription =
    relationshipStrength >= 80
      ? 'very close'
      : relationshipStrength >= 60
        ? 'good friends'
        : relationshipStrength >= 40
          ? 'friendly acquaintances'
          : 'casual contacts';

  const timeSince =
    daysSinceLastContact === 0
      ? 'talked today'
      : daysSinceLastContact === 1
        ? 'talked yesterday'
        : daysSinceLastContact < 7
          ? `talked ${daysSinceLastContact} days ago`
          : daysSinceLastContact < 30
            ? `talked about ${Math.floor(daysSinceLastContact / 7)} weeks ago`
            : daysSinceLastContact < 365
              ? `haven't talked in ${Math.floor(daysSinceLastContact / 30)} months`
              : `haven't talked in a while`;

  const systemPrompt = `You are crafting a ${channel} message for Ferni, an AI life coach, to send on behalf of the user.

CRITICAL RULES:
1. MATCH THE CHANNEL LENGTH:
   - text/sms: 1-2 sentences MAX. Like a real text message.
   - voicemail: 2-3 sentences. Conversational, like leaving a message.
   - email: Can be a bit longer, but still personal, not corporate.
   - conversation: This is an opening line for a call, keep it warm and brief.

2. SOUND LIKE THE USER, not an AI:
   - Use contractions (don't, I'm, you're, let's)
   - Be casual and warm
   - Don't be overly formal or flowery
   - No emojis in voicemail (you can't speak emojis)
   - 1-2 emojis OK for text, none for formal email

3. PERSONALIZATION IS KEY:
   - If we know recent topics, subtly reference ONE (not all)
   - If there's a pending follow-up, acknowledge it
   - Match the relationship closeness

4. PURPOSE: ${purpose}

DO NOT:
- Use "I hope this message finds you well"
- Start with "Hey there!" (just use their name)
- Be generic or corporate
- Over-explain
- Use multiple exclamation points

Output ONLY the message, nothing else.`;

  const userPrompt = `Craft a ${channel} message for ${firstName}.

CONTEXT:
- Relationship: ${relationshipDescription}
- Last contact: ${timeSince}
- Recent topics we've discussed: ${recentTopics.length > 0 ? recentTopics.slice(0, 3).join(', ') : 'none captured yet'}
- Purpose: ${purpose}
- Intent category: ${intent}
${pendingFollowUp ? `- Pending follow-up: ${pendingFollowUp}` : ''}

Remember: ${channel === 'text' ? 'Keep it to 1-2 sentences like a real text.' : channel === 'voicemail' ? 'Keep it brief, conversational, no emojis.' : 'Keep it personal and warm.'}`;

  try {
    // Combine prompts for single-call LLM
    const combinedPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

    const message = await callLLM(combinedPrompt, {
      maxTokens: MAX_TOKENS_TINY, // Keep it short
      temperature: TEMP_REASONING, // Some creativity but not too wild
      timeout: LLM_TIMEOUT_MS,
    });

    if (message && message.length > 5 && message.length < 500) {
      log.debug(
        { contactName, intent, channel, messageLength: message.length },
        'Crafted personalized message'
      );
      return message;
    }

    // Fall through to fallback if response is weird
    log.warn({ response: message }, 'LLM response was invalid, using fallback');
  } catch (error) {
    log.warn({ error: String(error) }, 'LLM message crafting failed, using fallback');
  }

  // Fallback to template
  return useFallbackTemplate(firstName, intent, purpose);
}

function useFallbackTemplate(name: string, intent: OutreachIntent, purpose: string): string {
  const templates = FALLBACK_TEMPLATES[intent] || FALLBACK_TEMPLATES.just_because;
  const template = templates[Math.floor(Math.random() * templates.length)];

  return template
    .replace(/{name}/g, name)
    .replace(/{occasion}/g, extractOccasion(purpose))
    .replace(/{topic}/g, extractTopic(purpose));
}

function extractOccasion(purpose: string): string {
  const p = purpose.toLowerCase();
  if (p.includes('birthday')) return 'birthday';
  if (p.includes('new year')) return 'New Year';
  if (p.includes('christmas')) return 'Christmas';
  if (p.includes('thanksgiving')) return 'Thanksgiving';
  if (p.includes('anniversary')) return 'anniversary';
  if (p.includes('holiday')) return 'holidays';
  return 'day';
}

function extractTopic(purpose: string): string {
  // Simple extraction - in production, could be smarter
  const words = purpose.split(' ').slice(0, 5).join(' ');
  return words.length > 3 ? words : 'that thing';
}

// ============================================================================
// SPECIALIZED CRAFTING FOR DIFFERENT CONTEXTS
// ============================================================================

/**
 * Craft a conversation opener for real-time calls
 * This is what the agent says when the call connects
 */
export async function craftConversationOpener(ctx: MessageCraftingContext): Promise<string> {
  return craftPersonalizedMessage({
    ...ctx,
    channel: 'conversation',
  });
}

/**
 * Craft a follow-up message referencing a specific topic
 */
export async function craftFollowUpMessage(
  ctx: MessageCraftingContext,
  originalTopic: string
): Promise<string> {
  return craftPersonalizedMessage({
    ...ctx,
    intent: 'follow_up',
    purpose: `Follow up on: ${originalTopic}`,
  });
}

/**
 * Craft a "thinking of you" message that feels genuine
 */
export async function craftThinkingOfYouMessage(ctx: MessageCraftingContext): Promise<string> {
  // Pick a specific topic if we have any to make it feel real
  const specificReason =
    ctx.recentTopics.length > 0
      ? `Saw something that reminded me of ${ctx.recentTopics[0]}`
      : 'Just thinking of you';

  return craftPersonalizedMessage({
    ...ctx,
    intent: 'just_because',
    purpose: specificReason,
  });
}

export default craftPersonalizedMessage;
