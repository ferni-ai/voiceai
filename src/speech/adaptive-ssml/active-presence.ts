/**
 * Active Presence System
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module creates the feeling of being HEARD without constant verbal feedback.
 * Instead of many "mm-hmms", it focuses on:
 *
 * 1. **Content Echoing** - Repeating back key words/phrases they said
 * 2. **Thoughtful Opening Pauses** - A beat before responding that shows thinking
 * 3. **Energy Matching** - Starting at their energy level
 * 4. **Completion Markers** - Subtle acknowledgment at turn end
 *
 * Key insight: Humans feel heard when you REFERENCE what they said, not when
 * you make sounds WHILE they talk.
 *
 * @module speech/adaptive-ssml/active-presence
 */

import { breakTag } from '../../ssml/cartesia.js';
import { getLogger } from '../../utils/safe-logger.js';
import { canAddFeedback, recordFeedback } from '../feedback-coordinator.js';

const log = getLogger().child({ module: 'ActivePresence' });

// ============================================================================
// TYPES
// ============================================================================

export interface ActivePresenceContext {
  /** Session ID for coordination */
  sessionId: string;

  /** The user's message (what they just said) */
  userMessage: string;

  /** The agent's response (before enhancement) */
  agentResponse: string;

  /** User's detected energy level */
  userEnergy?: 'low' | 'medium' | 'high';

  /** User's detected emotion */
  userEmotion?: string;

  /** Topic weight */
  topicWeight?: 'light' | 'medium' | 'heavy';

  /** Turn count */
  turnCount?: number;

  /** Persona ID */
  personaId?: string;

  /** Was this a long user message? (indicates deep sharing) */
  isLongMessage?: boolean;

  /** Did user mention something specific/personal? */
  hasPersonalContent?: boolean;
}

export interface ActivePresenceResult {
  /** Enhanced response text */
  text: string;

  /** What enhancements were applied */
  appliedEnhancements: string[];

  /** Opening pause duration (ms) */
  openingPauseMs: number;

  /** Did we add an echo? */
  hasEcho: boolean;

  /** The echoed phrase (if any) */
  echoedPhrase?: string;
}

// ============================================================================
// 1. CONTENT ECHOING
// ============================================================================

/**
 * Patterns for extracting echoable content from user messages.
 * These are phrases that, when repeated back, show deep listening.
 *
 * Examples:
 * - "My mom passed away last month" → "Last month..."
 * - "I've been struggling with this for years" → "For years..."
 * - "My best friend just got engaged" → "Your best friend..."
 */
const ECHO_PATTERNS: Array<{
  pattern: RegExp;
  extractor: (match: RegExpMatchArray) => string;
  contexts: string[];
  weight: number;
}> = [
  // Time references (powerful for showing you caught the timeline)
  {
    pattern: /\b(for|over|about|almost|nearly)\s+([\w\s]+?)(?:years?|months?|weeks?|days?)\b/i,
    extractor: (m) =>
      `${capitalize(m[1])} ${m[2].trim()}${m[0].match(/years?|months?|weeks?|days?/)?.[0] || ''}...`,
    contexts: ['duration', 'timeline'],
    weight: 0.8,
  },
  // "Last X" patterns
  {
    pattern: /\blast\s+(week|month|year|night|time)\b/i,
    extractor: (m) => `Last ${m[1]}...`,
    contexts: ['recent_event'],
    weight: 0.7,
  },
  // Relationship references
  {
    pattern:
      /\b(my|your)\s+(mom|dad|mother|father|sister|brother|wife|husband|partner|friend|boss|coworker)\b/i,
    extractor: (m) => `Your ${m[2].toLowerCase()}...`,
    contexts: ['relationship', 'personal'],
    weight: 0.9,
  },
  // "Since X" patterns
  {
    pattern: /\bsince\s+(\w+(?:\s+\w+)?)\b/i,
    extractor: (m) => `Since ${m[1]}...`,
    contexts: ['duration', 'milestone'],
    weight: 0.75,
  },
  // Age/number references
  {
    pattern: /\b(twenty|thirty|forty|fifty|sixty|\d+)\s+(years?|times?)\b/i,
    extractor: (m) => `${capitalize(m[1])} ${m[2]}...`,
    contexts: ['quantity', 'duration'],
    weight: 0.65,
  },
  // "Every X" patterns
  {
    pattern: /\bevery\s+(day|week|month|morning|night|time)\b/i,
    extractor: (m) => `Every ${m[1]}...`,
    contexts: ['routine', 'frequency'],
    weight: 0.6,
  },
  // "First time" patterns
  {
    pattern: /\b(first|last)\s+time\b/i,
    extractor: (m) => `${capitalize(m[1])} time...`,
    contexts: ['milestone'],
    weight: 0.8,
  },
];

/**
 * Extract an echoable phrase from user message.
 * Returns null if no good echo opportunity or if echoing would feel forced.
 */
function extractEchoPhrase(userMessage: string): {
  phrase: string;
  context: string;
} | null {
  // Don't echo very short messages
  if (userMessage.length < 30) {
    return null;
  }

  // Try each pattern
  for (const { pattern, extractor, contexts, weight } of ECHO_PATTERNS) {
    const match = userMessage.match(pattern);
    if (match) {
      // Apply weight as probability
      if (Math.random() > weight) {
        continue;
      }

      const phrase = extractor(match);
      return {
        phrase,
        context: contexts[0],
      };
    }
  }

  return null;
}

/**
 * Build the echo with appropriate SSML.
 * The echo should be softer, slightly slower, with a reflective pause after.
 */
function buildEchoSSML(phrase: string, emotion: string = 'affectionate'): string {
  return `<emotion value="${emotion}"/><speed ratio="0.9"/><volume ratio="0.85"/>${phrase}${breakTag('300ms')}`;
}

// ============================================================================
// 2. THOUGHTFUL OPENING PAUSES
// ============================================================================

/**
 * Calculate how long to pause before responding.
 * Heavier content deserves more space. Quick topics need quicker response.
 */
function calculateOpeningPause(context: ActivePresenceContext): {
  pauseMs: number;
  reason: string;
} {
  const { topicWeight, userEmotion, isLongMessage, hasPersonalContent } = context;

  let basePause = 200; // Default small pause

  // Heavy topics need more space
  if (topicWeight === 'heavy') {
    basePause = 400;
  } else if (topicWeight === 'light') {
    basePause = 100;
  }

  // Emotional content needs breathing room
  if (userEmotion && ['sad', 'anxious', 'stressed', 'grief'].includes(userEmotion.toLowerCase())) {
    basePause += 150;
  }

  // Long messages show deep sharing - honor that with space
  if (isLongMessage) {
    basePause += 100;
  }

  // Personal content deserves a beat
  if (hasPersonalContent) {
    basePause += 50;
  }

  // Clamp to reasonable range
  const pauseMs = Math.min(600, Math.max(100, basePause));

  const reason =
    pauseMs > 400
      ? 'giving space for heavy content'
      : pauseMs > 250
        ? 'thoughtful pause'
        : 'natural beat';

  return { pauseMs, reason };
}

// ============================================================================
// 3. ENERGY MATCHING OPENER
// ============================================================================

/**
 * Energy-matched opening sounds by persona.
 * These are NOT backchannels - they're openers that match the user's energy.
 */
const ENERGY_OPENERS: Record<string, Record<'low' | 'medium' | 'high', string[]>> = {
  ferni: {
    low: [
      `${breakTag('250ms')}<speed ratio="0.88"><emotion value="sympathetic"/>Yeah...${breakTag('200ms')}</speed>`,
      `${breakTag('300ms')}<speed ratio="0.85"><emotion value="affectionate"/>I hear you.${breakTag('250ms')}</speed>`,
    ],
    medium: [
      `${breakTag('150ms')}Okay.${breakTag('150ms')}`,
      `${breakTag('150ms')}Right.${breakTag('150ms')}`,
    ],
    high: [
      `${breakTag('100ms')}<speed ratio="1.05"/><emotion value="happy"/>Oh!${breakTag('100ms')}`,
      `${breakTag('100ms')}<emotion value="excited"/>Yes!${breakTag('100ms')}`,
    ],
  },
  'nayan-patel': {
    low: [
      `${breakTag('350ms')}<speed ratio="0.8"><emotion value="calm"/>Mm.${breakTag('300ms')}</speed>`,
      `${breakTag('400ms')}<speed ratio="0.78"><emotion value="sympathetic"/>I see.${breakTag('350ms')}</speed>`,
    ],
    medium: [
      `${breakTag('200ms')}<speed ratio="0.9"/>Yes.${breakTag('200ms')}`,
      `${breakTag('200ms')}<speed ratio="0.88"/>Indeed.${breakTag('200ms')}`,
    ],
    high: [
      `${breakTag('150ms')}<speed ratio="0.95"/><emotion value="curious"/>Ah!${breakTag('150ms')}`,
      `${breakTag('150ms')}<emotion value="happy"/>Ha!${breakTag('100ms')}`,
    ],
  },
  'peter-john': {
    low: [
      `${breakTag('200ms')}<speed ratio="0.9"/><emotion value="sympathetic"/>Yeah...${breakTag('200ms')}`,
    ],
    medium: [
      `${breakTag('150ms')}Okay!${breakTag('100ms')}`,
      `${breakTag('150ms')}Right.${breakTag('100ms')}`,
    ],
    high: [
      `${breakTag('80ms')}<speed ratio="1.1"/><emotion value="excited"/>Ooh!${breakTag('100ms')}`,
      `${breakTag('80ms')}<emotion value="surprised"/>Oh wow!${breakTag('100ms')}`,
    ],
  },
  'maya-santos': {
    low: [
      `${breakTag('250ms')}<speed ratio="0.88"/><emotion value="affectionate"/>I hear you.${breakTag('200ms')}`,
    ],
    medium: [
      `${breakTag('150ms')}Got it.${breakTag('150ms')}`,
      `${breakTag('150ms')}Okay.${breakTag('150ms')}`,
    ],
    high: [
      `${breakTag('100ms')}<emotion value="happy"/>That's great!${breakTag('100ms')}`,
      `${breakTag('100ms')}<emotion value="excited"/>Love that!${breakTag('100ms')}`,
    ],
  },
  'jordan-taylor': {
    low: [
      `${breakTag('200ms')}<speed ratio="0.9"/><emotion value="sympathetic"/>I hear you.${breakTag('200ms')}`,
    ],
    medium: [
      `${breakTag('100ms')}Okay!${breakTag('100ms')}`,
      `${breakTag('100ms')}Got it!${breakTag('100ms')}`,
    ],
    high: [
      `${breakTag('80ms')}<emotion value="excited"/>YES!${breakTag('80ms')}`,
      `${breakTag('80ms')}<emotion value="surprised"/>Ooh!${breakTag('80ms')}`,
    ],
  },
  'alex-chen': {
    low: [`${breakTag('200ms')}<speed ratio="0.92"/>I understand.${breakTag('150ms')}`],
    medium: [
      `${breakTag('100ms')}Got it.${breakTag('100ms')}`,
      `${breakTag('100ms')}Clear.${breakTag('100ms')}`,
    ],
    high: [
      `${breakTag('80ms')}<emotion value="content"/>Perfect.${breakTag('80ms')}`,
      `${breakTag('80ms')}Excellent.${breakTag('80ms')}`,
    ],
  },
};

/**
 * Get energy-matched opener for persona.
 */
function getEnergyMatchedOpener(
  personaId: string,
  energy: 'low' | 'medium' | 'high'
): string | null {
  const openers = ENERGY_OPENERS[personaId] || ENERGY_OPENERS.ferni;
  const options = openers[energy];

  if (!options || options.length === 0) {
    return null;
  }

  return options[Math.floor(Math.random() * options.length)];
}

// ============================================================================
// 4. TURN COMPLETION MARKERS
// ============================================================================

/**
 * Small sounds to mark that we caught they finished.
 * These are softer and subtler than backchannels - just a quiet acknowledgment.
 */
const COMPLETION_MARKERS: Record<string, string[]> = {
  ferni: ['Mm.', 'Yeah.', 'Right.'],
  'nayan-patel': ['Mm.', 'Yes.', 'I see.'],
  'peter-john': ['Okay.', 'Mm.', 'Right.'],
  'maya-santos': ['Mm.', 'Yeah.', 'Got it.'],
  'jordan-taylor': ['Yeah!', 'Mm.', 'Okay.'],
  'alex-chen': ['Got it.', 'Mm.', 'Right.'],
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Enhance response with active presence markers.
 *
 * This creates the feeling of being heard through:
 * - Echoing key phrases from what they said
 * - Energy-matched opening sounds
 * - Thoughtful pauses that show processing
 *
 * @param context - Context about the conversation
 * @returns Enhanced response with presence markers
 */
export function addActivePresence(context: ActivePresenceContext): ActivePresenceResult {
  const {
    sessionId,
    userMessage,
    agentResponse,
    userEnergy = 'medium',
    topicWeight = 'medium',
    turnCount = 0,
    personaId = 'ferni',
  } = context;

  const appliedEnhancements: string[] = [];
  let enhancedText = agentResponse;
  let openingPauseMs = 0;
  let hasEcho = false;
  let echoedPhrase: string | undefined;

  // Check if we can add presence feedback (coordinate with other systems)
  const canAddPresence = canAddFeedback(sessionId, 'prefix', turnCount);

  if (!canAddPresence) {
    log.debug({ sessionId, turnCount }, 'Active presence skipped - budget exceeded');
    return {
      text: agentResponse,
      appliedEnhancements: [],
      openingPauseMs: 0,
      hasEcho: false,
    };
  }

  // ====================================================================
  // STEP 1: Try to echo a meaningful phrase (20% chance)
  // ====================================================================
  if (Math.random() < 0.2 && userMessage.length > 40) {
    const echoResult = extractEchoPhrase(userMessage);

    if (echoResult) {
      const emotion = topicWeight === 'heavy' ? 'sympathetic' : 'affectionate';
      const echoSSML = buildEchoSSML(echoResult.phrase, emotion);

      enhancedText = echoSSML + enhancedText;
      hasEcho = true;
      echoedPhrase = echoResult.phrase;
      appliedEnhancements.push(`echo:${echoResult.context}`);

      // Record in coordinator
      recordFeedback(sessionId, 'prefix');

      log.debug({ phrase: echoResult.phrase, context: echoResult.context }, 'Added content echo');
    }
  }

  // ====================================================================
  // STEP 2: Add energy-matched opener (if no echo, 35% chance)
  // ====================================================================
  if (!hasEcho && Math.random() < 0.35) {
    const opener = getEnergyMatchedOpener(personaId, userEnergy);

    if (opener) {
      enhancedText = opener + enhancedText;
      appliedEnhancements.push(`energy_opener:${userEnergy}`);

      // Record in coordinator
      recordFeedback(sessionId, 'prefix');

      log.debug({ energy: userEnergy, personaId }, 'Added energy-matched opener');
    }
  }

  // ====================================================================
  // STEP 3: Calculate and add thoughtful opening pause
  // ====================================================================
  const pauseResult = calculateOpeningPause(context);
  openingPauseMs = pauseResult.pauseMs;

  // Only add explicit pause if significant (> 200ms) and not already handled
  if (openingPauseMs > 200 && !hasEcho && appliedEnhancements.length === 0) {
    enhancedText = breakTag(`${openingPauseMs}ms`) + enhancedText;
    appliedEnhancements.push(`pause:${pauseResult.reason}`);
  }

  return {
    text: enhancedText,
    appliedEnhancements,
    openingPauseMs,
    hasEcho,
    echoedPhrase,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

const sessionState = new Map<
  string,
  {
    lastEchoTurn: number;
    echoCount: number;
  }
>();

export function resetActivePresenceSession(sessionId: string): void {
  sessionState.delete(sessionId);
}

export function resetAllActivePresenceSessions(): void {
  sessionState.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  addActivePresence,
  resetActivePresenceSession,
  resetAllActivePresenceSessions,
};
