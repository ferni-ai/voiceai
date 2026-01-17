/**
 * Ferni Message Generator - Let Ferni Craft Real Messages
 *
 * Instead of static templates, we give Ferni context and let him
 * write a natural message like he would in a real conversation.
 *
 * This is how you get "better than human" - authentic voice, not scripts.
 *
 * @module ferni-message-generator
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getContextForOutreach,
  loadUserContextFromFirestore,
} from '../outreach/context-aggregator.js';
import { TEMP_CREATIVE, MAX_TOKENS_TINY } from '../../config/gemini-config.js';
import { HTTP_TIMEOUT_MS } from '../../config/resilience-config.js';

const log = createLogger({ module: 'ferni-message-generator' });

// ============================================================================
// TYPES
// ============================================================================

export interface MessageContext {
  /** Who we're calling */
  recipientName: string;
  /** User ID for loading rich context */
  userId?: string;
  /** What kind of outreach */
  purpose:
    | 'thinking_of_you'
    | 'check_in'
    | 'birthday'
    | 'celebration'
    | 'reminder'
    | 'follow_up'
    | 'encouragement'
    | 'concern'
    | 'gratitude'
    | 'appointment';
  /** Their relationship with Ferni */
  relationshipDepth?: 'new' | 'building' | 'established' | 'deep';
  /** Days since last contact */
  daysSinceContact?: number;
  /** Topics from previous conversations */
  previousTopics?: string[];
  /** Specific context for the call */
  specificContext?: string;
  /** Time of day */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'late_night';
  /** Any appointment/reminder details */
  details?: {
    appointment?: string;
    time?: string;
    location?: string;
    achievement?: string;
    reminder?: string;
  };
  /** Rich life context (auto-loaded if userId provided) */
  lifeContext?: {
    emotionalState?: string;
    emotionalTrend?: string;
    recentTopics?: string[];
    activeCommitments?: string[];
    recentWins?: string[];
    currentStruggles?: string[];
    upcomingEvents?: string[];
    openLoops?: string[];
    insideJokes?: string[];
    lastConversationSummary?: string;
  };
}

export interface GeneratedMessage {
  message: string;
  estimatedDuration: number;
}

// ============================================================================
// SEED PROMPTS - Give Ferni the context to craft a message
// ============================================================================

const FERNI_VOICE_SEED = `You are Ferni leaving a voicemail. This is an OUTBOUND call - you're reaching out to someone you care about.

ENERGY FOR OUTBOUND:
- MORE upbeat than normal conversations - you're excited to connect!
- Warm and genuine, not shy or tentative
- Sound like you're smiling when you talk
- Bring positive energy - you're the one initiating!

ESSENCE:
- Wyoming kid, big family (7 siblings), lived in Japan  
- Warm, grounded, genuinely curious about their life
- "Just thought of you" energy - you remembered something about them
- Uses their name warmly

SPEECH PATTERNS:
- Contractions always (it's, don't, I've, you're)
- Upbeat pacing - not rushed, but not dragging
- Reference something SPECIFIC about them (if given context)
- End on a warm, positive note

KEY RULE: If you have context about their life (topics, wins, struggles, events), REFERENCE IT SPECIFICALLY. Don't be generic.

AVOID:
- Sounding shy, tentative, or apologetic
- "I hope this message finds you well"
- Generic messages that could be for anyone
- Being too wordy - keep it punchy

LENGTH: Keep it SHORT and WARM. 3-5 sentences. Like a friend who's genuinely happy to call.`;

function buildPrompt(ctx: MessageContext): string {
  const parts: string[] = [FERNI_VOICE_SEED];

  parts.push(`\n---\nCONTEXT FOR THIS CALL:`);
  parts.push(`- Calling: ${ctx.recipientName}`);
  parts.push(`- Purpose: ${ctx.purpose.replace(/_/g, ' ')}`);

  if (ctx.relationshipDepth) {
    const depthDesc = {
      new: "You've talked a few times",
      building: "You're getting to know each other",
      established: 'You know them well',
      deep: 'Close friend, deep trust',
    };
    parts.push(`- Relationship: ${depthDesc[ctx.relationshipDepth]}`);
  }

  if (ctx.daysSinceContact) {
    if (ctx.daysSinceContact > 30) {
      parts.push(`- It's been over a month since you talked`);
    } else if (ctx.daysSinceContact > 14) {
      parts.push(`- It's been a couple weeks`);
    }
  }

  // RICH LIFE CONTEXT - This is what makes it personal!
  const life = ctx.lifeContext;
  if (life) {
    // Emotional context
    if (life.emotionalState && life.emotionalState !== 'stable') {
      parts.push(
        `- Their emotional state: ${life.emotionalState}${life.emotionalTrend ? ` (trending ${life.emotionalTrend})` : ''}`
      );
    }

    // What you've been talking about
    if (life.recentTopics && life.recentTopics.length > 0) {
      parts.push(`- Recent topics you've discussed: ${life.recentTopics.slice(0, 3).join(', ')}`);
    } else if (ctx.previousTopics && ctx.previousTopics.length > 0) {
      parts.push(`- Recent topics: ${ctx.previousTopics.slice(0, 2).join(', ')}`);
    }

    // Last conversation
    if (life.lastConversationSummary) {
      parts.push(`- Last conversation: "${life.lastConversationSummary}"`);
    }

    // What they're working on
    if (life.activeCommitments && life.activeCommitments.length > 0) {
      parts.push(`- They committed to: ${life.activeCommitments.slice(0, 2).join(', ')}`);
    }

    // Recent wins to celebrate
    if (life.recentWins && life.recentWins.length > 0) {
      parts.push(`- Recent wins: ${life.recentWins.slice(0, 2).join(', ')}`);
    }

    // Current struggles
    if (life.currentStruggles && life.currentStruggles.length > 0) {
      parts.push(`- They're dealing with: ${life.currentStruggles.slice(0, 2).join(', ')}`);
    }

    // Upcoming events
    if (life.upcomingEvents && life.upcomingEvents.length > 0) {
      parts.push(`- Coming up for them: ${life.upcomingEvents.slice(0, 2).join(', ')}`);
    }

    // Open loops
    if (life.openLoops && life.openLoops.length > 0) {
      parts.push(`- Unresolved from last time: ${life.openLoops[0]}`);
    }

    // Inside jokes - use sparingly
    if (life.insideJokes && life.insideJokes.length > 0 && Math.random() < 0.3) {
      parts.push(`- Inside joke you share: "${life.insideJokes[0]}" (only reference if natural)`);
    }
  }

  if (ctx.specificContext) {
    parts.push(`- Specific context: ${ctx.specificContext}`);
  }

  if (ctx.details) {
    if (ctx.details.achievement) parts.push(`- Their achievement: ${ctx.details.achievement}`);
    if (ctx.details.appointment) parts.push(`- Appointment: ${ctx.details.appointment}`);
    if (ctx.details.time) parts.push(`- Time: ${ctx.details.time}`);
    if (ctx.details.location) parts.push(`- Location: ${ctx.details.location}`);
    if (ctx.details.reminder) parts.push(`- Reminder about: ${ctx.details.reminder}`);
  }

  if (ctx.timeOfDay) {
    const timeContext = {
      morning: "It's morning",
      afternoon: "It's afternoon",
      evening: "It's evening",
      late_night: "It's late (be brief)",
    };
    parts.push(`- ${timeContext[ctx.timeOfDay]}`);
  }

  parts.push(`\n---\nIMPORTANT RULES:`);
  parts.push(`1. Be UPBEAT and WARM - you're happy to call them!`);
  parts.push(`2. Reference something SPECIFIC from the context above - don't be generic`);
  parts.push(`3. Sound like a friend who genuinely cares, not a shy acquaintance`);
  parts.push(`4. Keep it SHORT - 3-5 sentences max`);
  parts.push(`\nNow write Ferni's voicemail. Just the message, nothing else:`);

  return parts.join('\n');
}

// ============================================================================
// MESSAGE GENERATION
// ============================================================================

/**
 * Generate a natural Ferni message using LLM
 *
 * If userId is provided, automatically loads rich life context from Firestore
 */
export async function generateFerniMessage(ctx: MessageContext): Promise<GeneratedMessage> {
  // Auto-load rich context if userId provided but lifeContext missing
  if (ctx.userId && !ctx.lifeContext) {
    try {
      // Load context from Firestore
      await loadUserContextFromFirestore(ctx.userId);
      const outreachContext = getContextForOutreach(ctx.userId);

      ctx.lifeContext = {
        emotionalState: outreachContext.emotionalState,
        emotionalTrend: outreachContext.emotionalTrend,
        recentTopics: outreachContext.recentTopics,
        activeCommitments: outreachContext.activeCommitments,
        recentWins: outreachContext.recentWins,
        currentStruggles: outreachContext.currentStruggles,
        upcomingEvents: outreachContext.upcomingEvents,
        openLoops: outreachContext.openLoops,
        insideJokes: outreachContext.insideJokes,
        lastConversationSummary: outreachContext.lastConversationSummary,
      };

      // Also get relationship stage
      ctx.relationshipDepth =
        outreachContext.relationshipStage as MessageContext['relationshipDepth'];

      log.debug(
        {
          userId: ctx.userId,
          hasTopics: (ctx.lifeContext.recentTopics?.length || 0) > 0,
          hasWins: (ctx.lifeContext.recentWins?.length || 0) > 0,
          hasStruggles: (ctx.lifeContext.currentStruggles?.length || 0) > 0,
        },
        '📚 Loaded rich life context for personalized message'
      );
    } catch (error) {
      log.warn({ error: String(error), userId: ctx.userId }, 'Failed to load life context');
    }
  }

  const prompt = buildPrompt(ctx);

  log.debug(
    { purpose: ctx.purpose, recipient: ctx.recipientName, hasLifeContext: !!ctx.lifeContext },
    'Generating Ferni message'
  );

  try {
    // Try Gemini first (fast, good for short generation)
    const message = await generateWithGemini(prompt);

    if (message) {
      const wordCount = message.split(/\s+/).length;
      const estimatedDuration = Math.ceil(wordCount * 0.4); // ~0.4s per word

      log.info(
        { purpose: ctx.purpose, wordCount, estimatedDuration, hadContext: !!ctx.lifeContext },
        '✨ Generated natural Ferni message'
      );

      return { message, estimatedDuration };
    }

    // Fallback to simple generation if LLM unavailable
    log.warn({}, 'LLM unavailable, using fallback');
    return generateFallback(ctx);
  } catch (error) {
    log.error({ error: String(error) }, 'Message generation failed');
    return generateFallback(ctx);
  }
}

/**
 * Generate using Gemini
 */
async function generateWithGemini(prompt: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    // Using gemini-2.0-flash-exp for best quality
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: TEMP_CREATIVE, // Higher for more natural variation
            maxOutputTokens: MAX_TOKENS_TINY, // Keep it short
            topP: 0.95,
          },
        }),
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      log.warn({ status: response.status }, 'Gemini request failed');
      return null;
    }

    const data = (await response.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return null;
    }

    // Clean up the response
    return cleanMessage(text);
  } catch (error) {
    log.warn({ error: String(error) }, 'Gemini generation failed');
    return null;
  }
}

/**
 * Clean up LLM response
 */
function cleanMessage(text: string): string {
  return text
    .replace(/^["']|["']$/g, '') // Remove quotes
    .replace(/^\*+|\*+$/g, '') // Remove asterisks
    .replace(/^(Voicemail|Message|Script):\s*/i, '') // Remove prefixes
    .replace(/\[.*?\]/g, '') // Remove stage directions
    .replace(/\(.*?\)/g, '') // Remove parentheticals
    .trim();
}

/**
 * Simple fallback when LLM is unavailable
 */
function generateFallback(ctx: MessageContext): GeneratedMessage {
  const name = ctx.recipientName;

  // Super simple, natural fallbacks
  const messages: Record<string, string[]> = {
    thinking_of_you: [
      `Hey ${name}, it's Ferni. You just... crossed my mind. Wanted to say hey. Hope you're good.`,
      `Hey. It's Ferni. Was thinking about you. No reason really. Just... yeah. Take care.`,
    ],
    check_in: [
      `Hey ${name}, it's Ferni. Just checking in. How are you? Call me back whenever.`,
      `Hey. Ferni here. Wanted to see how you're doing. Talk soon.`,
    ],
    birthday: [`Hey ${name}! Ferni. Happy birthday. Hope it's a good one. Take care of yourself.`],
    celebration: [
      `${name}! It's Ferni. I heard... that's amazing. Genuinely proud of you. Talk soon.`,
    ],
    reminder: [
      `Hey ${name}, Ferni. Quick reminder about ${ctx.details?.reminder || 'that thing'}. That's all. Bye.`,
    ],
    follow_up: [`Hey ${name}. Ferni. Been thinking about what we talked about. How's that going?`],
    encouragement: [
      `Hey ${name}. It's Ferni. Just wanted you to know... you're doing better than you think. Hang in there.`,
    ],
    concern: [`Hey ${name}. Ferni. Thinking about you. Call me if you want to talk. I'm here.`],
    gratitude: [`Hey ${name}. Ferni. Just wanted to say thanks. For everything. Means a lot.`],
    appointment: [
      `Hey ${name}, Ferni. Your ${ctx.details?.appointment || 'appointment'} is set${ctx.details?.time ? ` for ${ctx.details.time}` : ''}. Let me know if anything changes.`,
    ],
  };

  const options = messages[ctx.purpose] || messages.thinking_of_you;
  const message = options[Math.floor(Math.random() * options.length)];
  const wordCount = message.split(/\s+/).length;

  return {
    message,
    estimatedDuration: Math.ceil(wordCount * 0.4),
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Quick thinking-of-you message
 */
export async function generateThinkingOfYou(
  name: string,
  previousTopics?: string[]
): Promise<GeneratedMessage> {
  return generateFerniMessage({
    recipientName: name,
    purpose: 'thinking_of_you',
    previousTopics,
    relationshipDepth: 'established',
  });
}

/**
 * Quick check-in message
 */
export async function generateCheckIn(
  name: string,
  daysSinceContact?: number
): Promise<GeneratedMessage> {
  return generateFerniMessage({
    recipientName: name,
    purpose: 'check_in',
    daysSinceContact,
    relationshipDepth: daysSinceContact && daysSinceContact > 30 ? 'established' : 'building',
  });
}

/**
 * Quick appointment confirmation
 */
export async function generateAppointmentMessage(
  name: string,
  appointment: string,
  time?: string,
  location?: string
): Promise<GeneratedMessage> {
  return generateFerniMessage({
    recipientName: name,
    purpose: 'appointment',
    details: { appointment, time, location },
  });
}

export default {
  generateFerniMessage,
  generateThinkingOfYou,
  generateCheckIn,
  generateAppointmentMessage,
};
