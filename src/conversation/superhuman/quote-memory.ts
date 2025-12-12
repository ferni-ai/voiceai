/**
 * Quote Memory System
 *
 * "Last time you said..." - The most powerful way to show someone you listened.
 *
 * This system captures memorable quotes from users and surfaces them at the
 * perfect moment, creating that magical "you actually remember that?" feeling.
 *
 * @module conversation/superhuman/quote-memory
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'QuoteMemory' });

// ============================================================================
// TYPES
// ============================================================================

export interface UserQuote {
  id: string;
  userId: string;
  quote: string; // The actual words they said
  context: string; // What they were talking about
  emotion: string; // How they seemed when saying it
  timestamp: Date;
  sessionId: string;
  topics: string[];
  // Metadata for surfacing
  isWisdom: boolean; // Did they share something insightful?
  isVulnerable: boolean; // Was this a vulnerable moment?
  isFunny: boolean; // Was this humorous?
  isGoal: boolean; // Did they express a goal/dream?
  surfacedCount: number; // How many times we've referenced this
  lastSurfaced?: Date;
}

export interface QuoteSurfaceContext {
  userId: string;
  currentTopic?: string;
  currentEmotion?: string;
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';
  turnCount: number;
}

export interface QuoteSuggestion {
  quote: UserQuote;
  relevanceScore: number;
  suggestedIntro: string;
  reason: string;
}

// ============================================================================
// QUOTE DETECTION PATTERNS
// ============================================================================

const WISDOM_PATTERNS = [
  /I('ve| have) (learned|realized|discovered|figured out)/i,
  /the (secret|key|trick) is/i,
  /what (works|worked|helps) for me/i,
  /I finally (understand|get|see)/i,
  /life taught me/i,
  /my (advice|philosophy|approach) is/i,
];

const VULNERABLE_PATTERNS = [
  /I('ve| have) never told anyone/i,
  /this is (hard|scary|difficult) (to|for me)/i,
  /I('m| am) (scared|afraid|terrified)/i,
  /I (feel|felt) (alone|lonely|isolated)/i,
  /my (biggest|deepest) (fear|secret|struggle)/i,
  /I('ve| have) been struggling with/i,
];

const GOAL_PATTERNS = [
  /I (want|wish|hope|dream) to/i,
  /my (goal|dream|ambition) is/i,
  /one day I('ll| will)/i,
  /I('m| am) (working|trying) to/i,
  /I (really|desperately) want/i,
  /before I die/i,
  /bucket list/i,
];

const FUNNY_PATTERNS = [
  /haha|lol|😂|🤣/i,
  /I('m| am) just (kidding|joking)/i,
  /the (funny|hilarious|ridiculous) (thing|part) is/i,
  /you('re| are) (not gonna|not going to) believe/i,
];

// ============================================================================
// IN-MEMORY STORE (will be persisted to Firestore)
// ============================================================================

const quoteStore = new Map<string, UserQuote[]>();

// ============================================================================
// QUOTE EXTRACTION
// ============================================================================

/**
 * Extract a memorable quote from a user message
 */
export function extractQuote(
  userId: string,
  message: string,
  context: {
    sessionId: string;
    topics?: string[];
    emotion?: string;
  }
): UserQuote | null {
  // Skip very short messages
  if (message.length < 30) {
    return null;
  }

  // Check for quote-worthy patterns
  const isWisdom = WISDOM_PATTERNS.some((p) => p.test(message));
  const isVulnerable = VULNERABLE_PATTERNS.some((p) => p.test(message));
  const isGoal = GOAL_PATTERNS.some((p) => p.test(message));
  const isFunny = FUNNY_PATTERNS.some((p) => p.test(message));

  // Only save if it matches at least one pattern
  if (!isWisdom && !isVulnerable && !isGoal && !isFunny) {
    return null;
  }

  // Extract the most quotable part (first sentence or whole thing if short)
  let quote = message;
  if (message.length > 150) {
    // Try to find a complete sentence
    const sentences = message.match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 0) {
      // Find the most relevant sentence
      quote =
        sentences.find(
          (s) =>
            WISDOM_PATTERNS.some((p) => p.test(s)) ||
            VULNERABLE_PATTERNS.some((p) => p.test(s)) ||
            GOAL_PATTERNS.some((p) => p.test(s)) ||
            FUNNY_PATTERNS.some((p) => p.test(s))
        ) || sentences[0];
    } else {
      quote = message.slice(0, 150) + '...';
    }
  }

  const userQuote: UserQuote = {
    id: `quote_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    quote: quote.trim(),
    context: context.topics?.join(', ') || 'general conversation',
    emotion: context.emotion || 'neutral',
    timestamp: new Date(),
    sessionId: context.sessionId,
    topics: context.topics || [],
    isWisdom,
    isVulnerable,
    isGoal,
    isFunny,
    surfacedCount: 0,
  };

  log.info(
    {
      userId,
      quoteId: userQuote.id,
      isWisdom,
      isVulnerable,
      isGoal,
      isFunny,
    },
    '💬 Memorable quote captured'
  );

  return userQuote;
}

/**
 * Save a quote to the store
 */
export function saveQuote(quote: UserQuote): void {
  const existing = quoteStore.get(quote.userId) || [];

  // Check for duplicates (similar content within last 24 hours)
  const isDupe = existing.some(
    (q) =>
      q.quote.toLowerCase().includes(quote.quote.toLowerCase().slice(0, 50)) &&
      Date.now() - q.timestamp.getTime() < 24 * 60 * 60 * 1000
  );

  if (isDupe) {
    log.debug({ userId: quote.userId }, 'Skipping duplicate quote');
    return;
  }

  existing.push(quote);

  // Keep only last 100 quotes per user
  if (existing.length > 100) {
    existing.shift();
  }

  quoteStore.set(quote.userId, existing);
}

/**
 * Extract and save a quote in one call
 */
export function captureQuote(
  userId: string,
  message: string,
  context: {
    sessionId: string;
    topics?: string[];
    emotion?: string;
  }
): UserQuote | null {
  const quote = extractQuote(userId, message, context);
  if (quote) {
    saveQuote(quote);
  }
  return quote;
}

// ============================================================================
// QUOTE SURFACING
// ============================================================================

/**
 * Find a relevant quote to surface
 */
export function findRelevantQuote(context: QuoteSurfaceContext): QuoteSuggestion | null {
  const quotes = quoteStore.get(context.userId);
  if (!quotes || quotes.length === 0) {
    return null;
  }

  // Filter quotes that haven't been surfaced too recently
  const eligibleQuotes = quotes.filter((q) => {
    if (q.surfacedCount >= 3) return false; // Max 3 times ever
    if (q.lastSurfaced) {
      const daysSince = (Date.now() - q.lastSurfaced.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return false; // Wait at least a week between surfacing
    }
    return true;
  });

  if (eligibleQuotes.length === 0) {
    return null;
  }

  // Score each quote for relevance
  const scored = eligibleQuotes.map((quote) => {
    let score = 0;
    let reason = '';

    // Topic match
    if (
      context.currentTopic &&
      quote.topics.some(
        (t) =>
          t.toLowerCase().includes(context.currentTopic!.toLowerCase()) ||
          context.currentTopic!.toLowerCase().includes(t.toLowerCase())
      )
    ) {
      score += 30;
      reason = 'topic match';
    }

    // Emotion match (bring up happy memories when sad, etc.)
    if (context.currentEmotion === 'sad' && quote.isFunny) {
      score += 20;
      reason = reason || 'mood lift';
    }
    if (context.currentEmotion === 'anxious' && quote.isWisdom) {
      score += 25;
      reason = reason || 'reassurance';
    }

    // Goals are great to reference when discussing progress
    if (quote.isGoal) {
      score += 15;
      reason = reason || 'goal check-in';
    }

    // Wisdom quotes are universally good
    if (quote.isWisdom) {
      score += 10;
      reason = reason || 'wisdom recall';
    }

    // Relationship depth affects what we can surface
    if (quote.isVulnerable && context.relationshipStage !== 'trusted') {
      score -= 20; // Don't surface vulnerable quotes until trusted
    }

    // Recency bonus for fresher quotes
    const daysOld = (Date.now() - quote.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld < 30) {
      score += 5;
    } else if (daysOld > 180) {
      score += 10; // Bonus for remembering old things
      reason = reason || 'long-term memory';
    }

    return { quote, score, reason };
  });

  // Sort by score and get the best one
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  if (best.score < 10) {
    return null; // Not relevant enough
  }

  // Generate the introduction
  const intro = generateQuoteIntro(best.quote, best.reason);

  return {
    quote: best.quote,
    relevanceScore: best.score,
    suggestedIntro: intro,
    reason: best.reason,
  };
}

/**
 * Generate a natural introduction for a quote
 */
function generateQuoteIntro(quote: UserQuote, reason: string): string {
  const daysSince = Math.floor((Date.now() - quote.timestamp.getTime()) / (1000 * 60 * 60 * 24));

  const timeRef =
    daysSince === 0
      ? 'earlier today'
      : daysSince === 1
        ? 'yesterday'
        : daysSince < 7
          ? 'the other day'
          : daysSince < 30
            ? 'a few weeks ago'
            : daysSince < 90
              ? 'a while back'
              : 'a few months ago';

  const intros = {
    'topic match': [
      `You know, ${timeRef} you said something that stuck with me:`,
      `This reminds me of what you told me ${timeRef}:`,
      `You mentioned ${timeRef}:`,
    ],
    'mood lift': [
      `I was just thinking about what you said ${timeRef} that made me smile:`,
      `Remember ${timeRef} when you said:`,
    ],
    reassurance: [
      `You said something really wise ${timeRef}:`,
      `I keep thinking about what you told me ${timeRef}:`,
    ],
    'goal check-in': [`${timeRef} you told me about a goal:`, `I remember ${timeRef} you said:`],
    'wisdom recall': [
      `You said something ${timeRef} that I think about:`,
      `I loved what you said ${timeRef}:`,
    ],
    'long-term memory': [
      `I still remember ${timeRef} when you said:`,
      `Way back ${timeRef}, you told me:`,
    ],
  };

  const options = intros[reason as keyof typeof intros] || intros['topic match'];
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Mark a quote as surfaced (call after using it)
 */
export function markQuoteSurfaced(userId: string, quoteId: string): void {
  const quotes = quoteStore.get(userId);
  if (!quotes) return;

  const quote = quotes.find((q) => q.id === quoteId);
  if (quote) {
    quote.surfacedCount++;
    quote.lastSurfaced = new Date();
    log.debug({ userId, quoteId }, 'Quote marked as surfaced');
  }
}

/**
 * Format a quote suggestion for the prompt
 */
export function formatQuoteForPrompt(suggestion: QuoteSuggestion): string {
  return [
    '[💬 QUOTE CALLBACK OPPORTUNITY]',
    '',
    `${suggestion.suggestedIntro}`,
    `"${suggestion.quote.quote}"`,
    '',
    `Why now: ${suggestion.reason}`,
    `Original context: ${suggestion.quote.context}`,
    '',
    "Use this naturally if it fits. Don't force it.",
  ].join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  captureQuote,
  extractQuote,
  saveQuote,
  findRelevantQuote,
  markQuoteSurfaced,
  formatQuoteForPrompt,
};
