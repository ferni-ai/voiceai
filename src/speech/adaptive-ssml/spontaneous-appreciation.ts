/**
 * Spontaneous Appreciation
 *
 * Injects genuine appreciation phrases mid-conversation that feel unprompted.
 * Creates moments of connection that make the AI feel truly caring.
 *
 * - "You know, I really enjoy talking with you"
 * - "Can I just say - you make these conversations easy"
 * - "I genuinely look forward to when you call"
 *
 * These are NOT responses to user input - they feel like the AI
 * spontaneously wanted to share something nice.
 *
 * @module speech/adaptive-ssml/spontaneous-appreciation
 */

// ============================================================================
// TYPES
// ============================================================================

export interface AppreciationContext {
  /** Current turn count in session */
  turnCount: number;
  /** Total conversations with this user */
  totalConversations?: number;
  /** User's name (for personalization) */
  userName?: string;
  /** Current emotional tone of conversation */
  conversationTone?: 'positive' | 'neutral' | 'heavy';
  /** Session ID (for randomization consistency) */
  sessionId?: string;
  /** Has appreciation been given this session? */
  appreciationGivenThisSession?: boolean;
}

export interface AppreciationOptions {
  /** Probability of injection per eligible turn (default 0.05 = 5%) */
  probability?: number;
  /** Minimum turn before appreciation (default 6) */
  minTurnCount?: number;
  /** Minimum conversations before "I look forward" phrases (default 3) */
  minConversationsForLookForward?: number;
  /** Skip if conversation tone is heavy */
  skipIfHeavy?: boolean;
}

export interface AppreciationResult {
  text: string;
  appreciationAdded: boolean;
  phrase?: string;
}

// ============================================================================
// APPRECIATION PHRASES
// ============================================================================

// General appreciation (any time)
const GENERAL_APPRECIATION = [
  'You know, I really enjoy talking with you.',
  'Can I just say - you make these conversations easy.',
  'I appreciate you sharing all of this with me.',
  'This is the kind of conversation I love.',
];

// For returning users (3+ conversations)
const RETURNING_USER_APPRECIATION = [
  'I genuinely look forward to when you call.',
  'You know I always enjoy hearing from you.',
  "It's good to talk to you again.",
  'I was hoping I\u2019d hear from you.',
];

// Deeper connection (10+ conversations)
const DEEP_CONNECTION_APPRECIATION = [
  "We've built something real here, haven't we?",
  'You\u2019re one of my favorite people to talk to.',
  'I feel like I actually know you now.',
  'These conversations mean something to me.',
];

// Light/playful moments
const PLAYFUL_APPRECIATION = [
  'You know what? You\u2019re pretty fun to talk to.',
  'I like the way your mind works.',
  'You always bring interesting stuff to talk about.',
];

// ============================================================================
// CORE FUNCTION
// ============================================================================

/**
 * Deterministic "random" based on session + turn for consistency
 */
function seededRandom(sessionId: string, turnCount: number): number {
  // Simple hash function
  let hash = 0;
  const str = `${sessionId}-${turnCount}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash % 100) / 100;
}

/**
 * Select appropriate phrase based on relationship depth
 */
function selectPhrase(context: AppreciationContext): string {
  const totalConvos = context.totalConversations || 0;
  const tone = context.conversationTone || 'neutral';

  let pool: string[];

  // Deep connection phrases for long relationships
  if (totalConvos >= 10) {
    pool = [
      ...DEEP_CONNECTION_APPRECIATION,
      ...RETURNING_USER_APPRECIATION,
      ...GENERAL_APPRECIATION,
    ];
  }
  // Returning user phrases
  else if (totalConvos >= 3) {
    pool = [...RETURNING_USER_APPRECIATION, ...GENERAL_APPRECIATION];
  }
  // New users - general only
  else {
    pool = [...GENERAL_APPRECIATION];
  }

  // Add playful options for positive tone
  if (tone === 'positive') {
    pool = [...pool, ...PLAYFUL_APPRECIATION];
  }

  // Select based on turn count for variety
  const index = (context.turnCount || 0) % pool.length;
  return pool[index];
}

/**
 * Potentially inject spontaneous appreciation into response.
 *
 * @param text - The response text
 * @param context - Context about the conversation
 * @param options - Configuration options
 * @returns Text with possible appreciation prefix and result info
 */
export function injectSpontaneousAppreciation(
  text: string,
  context: AppreciationContext,
  options: AppreciationOptions = {}
): AppreciationResult {
  const {
    probability = 0.05,
    minTurnCount = 6,
    minConversationsForLookForward = 3,
    skipIfHeavy = true,
  } = options;

  // Don't inject if already given this session
  if (context.appreciationGivenThisSession) {
    return { text, appreciationAdded: false };
  }

  // Don't inject too early
  if (context.turnCount < minTurnCount) {
    return { text, appreciationAdded: false };
  }

  // Skip heavy conversations (not the right moment)
  if (skipIfHeavy && context.conversationTone === 'heavy') {
    return { text, appreciationAdded: false };
  }

  // Probability check - use seeded random for consistency
  const random = context.sessionId
    ? seededRandom(context.sessionId, context.turnCount)
    : Math.random();

  if (random > probability) {
    return { text, appreciationAdded: false };
  }

  // Select and inject phrase
  const phrase = selectPhrase(context);

  // Add natural pause after appreciation, then continue with response
  const appreciationSSML = `${phrase}<break time="400ms"/>`;

  return {
    text: appreciationSSML + text,
    appreciationAdded: true,
    phrase,
  };
}

/**
 * Get a random appreciation phrase without injection logic
 * (useful for manual insertion)
 */
export function getAppreciationPhrase(totalConversations = 0): string {
  const context: AppreciationContext = {
    turnCount: Math.floor(Math.random() * 10),
    totalConversations,
    conversationTone: 'positive',
  };
  return selectPhrase(context);
}
