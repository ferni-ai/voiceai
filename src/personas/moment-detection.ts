/**
 * Automatic Moment Detection
 *
 * > "We hear what you're not saying."
 *
 * Automatically detects significant moments in conversations:
 * - Breakthroughs (insights, realizations)
 * - Vulnerability (opening up, sharing feelings)
 * - Laughter (genuine connection)
 * - Celebrations (wins, achievements)
 * - Crisis support (being there during hard times)
 * - Trust demonstrations (sharing something sensitive)
 *
 * This powers the Relationship Memory Engine's automatic tracking.
 *
 * NOTE: This file now delegates to unified-moment-detection.ts as the
 * single source of truth. We keep this file for backward compatibility
 * with existing imports.
 */

import { getLogger } from '../utils/safe-logger.js';
// UPDATED (Jan 2026): Import from intelligence/relationship (relationship-memory deleted)
import type { SharedMomentType } from '../intelligence/relationship/types.js';
import {
  detectMomentsUnified,
  extractMemorableMoments as extractMemorableMomentsUnified,
  type MomentDetectionContext as UnifiedContext,
  type UnifiedMoment,
} from './unified-moment-detection.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

/**
 * Detected moment with confidence and metadata
 */
export interface DetectedMoment {
  type: SharedMomentType;
  confidence: number;
  summary: string;
  userPhrase?: string;
  topic?: string;
  significance: number;
  tags: string[];
}

/**
 * Context for moment detection
 */
export interface MomentDetectionContext {
  /** User's message */
  userMessage: string;
  /** AI's response (if available) */
  aiResponse?: string;
  /** Current topic being discussed */
  topic?: string;
  /** User's emotional state (if detected) */
  emotionalState?: string;
  /** Session number */
  sessionNumber: number;
  /** Is this the first vulnerability share? */
  hasSharedVulnerabilityBefore: boolean;
  /** Previous mood in session */
  previousMood?: string;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/**
 * Patterns that indicate a breakthrough moment
 */
const BREAKTHROUGH_PATTERNS = {
  realizations: [
    'i never realized',
    'i just realized',
    "that's why i",
    'now i understand',
    'it all makes sense',
    "i've been",
    "that's what's been",
    'oh my god',
    'oh wow',
    "i didn't see it",
    'i can see now',
    'the pattern',
    'i finally get it',
  ],
  insights: [
    "so what you're saying is",
    "you're right",
    'that hits different',
    'that lands',
    'i needed to hear that',
    'thank you for saying',
    'that resonates',
  ],
  shifts: [
    'i think i need to',
    'i want to change',
    "i'm going to",
    'i should probably',
    'maybe i should',
    "it's time to",
    'i have to stop',
  ],
};

/**
 * Patterns that indicate vulnerability
 */
const VULNERABILITY_PATTERNS = {
  openingUp: [
    "i've never told anyone",
    'this is hard to say',
    "i'm scared to admit",
    'the truth is',
    'honestly',
    'to be honest',
    "i'm afraid",
    "i'm worried",
    "i'm anxious about",
    'i feel like',
    'deep down',
    "what i haven't said",
  ],
  emotional: [
    "i've been struggling",
    'it hurts',
    "i'm hurting",
    'i feel so',
    "i can't stop",
    'i keep thinking about',
    'it keeps me up',
    "i don't know what to do",
    'i feel lost',
    'i feel stuck',
  ],
  past: [
    'when i was younger',
    'growing up',
    'my childhood',
    'my parents',
    'that trauma',
    'that experience',
    'when that happened',
  ],
};

/**
 * Patterns that indicate laughter/joy
 */
const LAUGHTER_PATTERNS = {
  explicit: ['haha', 'lol', 'lmao', 'hahaha', 'lololol', '😂', '🤣', 'dying'],
  genuine: [
    "that's so funny",
    "you're hilarious",
    'i love that',
    'stop it',
    "you're killing me",
    "i can't",
    "that's amazing",
    'omg',
    'too good',
  ],
};

/**
 * Patterns that indicate celebration
 */
const CELEBRATION_PATTERNS = {
  wins: [
    'i did it',
    'i got the',
    'they said yes',
    'it worked',
    'i passed',
    'i finished',
    'i made it',
    'i accomplished',
    'i achieved',
    'i completed',
  ],
  excitement: [
    "i'm so excited",
    "i can't believe it",
    'finally',
    'at last',
    'this is amazing',
    'best day',
    'i got in',
    'they accepted',
  ],
  milestones: [
    '1 year',
    '5 years',
    'anniversary',
    'birthday',
    'graduation',
    'promotion',
    'engaged',
    'married',
    'pregnant',
    'new job',
    'new home',
  ],
};

/**
 * Patterns that indicate crisis
 */
const CRISIS_PATTERNS = {
  distress: [
    "i can't do this anymore",
    "i'm falling apart",
    "i don't know how",
    'everything is',
    "it's too much",
    "i can't handle",
    "i'm overwhelmed",
    "i'm drowning",
  ],
  urgency: [
    'i need help',
    'please help',
    "i'm desperate",
    "i don't know what to do",
    'emergency',
    'urgent',
  ],
  dark: [
    "what's the point",
    'why bother',
    "i don't care anymore",
    'nothing matters',
    'give up',
    'hopeless',
  ],
};

/**
 * Patterns that indicate trust demonstration
 */
const TRUST_PATTERNS = {
  secrets: [
    "don't tell anyone",
    'between us',
    "i've never",
    'secret',
    'just you',
    'only you',
    'trust you',
    'can i tell you',
  ],
  sensitive: [
    'my salary',
    'my weight',
    'my debt',
    'my diagnosis',
    'my addiction',
    'my affair',
    'my failure',
  ],
};

/**
 * Patterns that indicate growth recognition
 */
const GROWTH_PATTERNS = {
  progress: [
    "i've come so far",
    'look how far',
    'compared to before',
    'a year ago',
    'i used to',
    "i'm different now",
    "i've changed",
    "i've grown",
  ],
  selfAwareness: [
    'i notice when i',
    'i catch myself',
    "i'm more aware",
    'i understand myself',
    'i know now that',
  ],
};

// ============================================================================
// DETECTION FUNCTIONS
// ============================================================================

/**
 * Check if message matches any patterns in a category
 */
function matchesPatterns(
  message: string,
  patterns: Record<string, string[]>
): { matched: boolean; matches: string[] } {
  const messageLower = message.toLowerCase();
  const matches: string[] = [];

  for (const [, patternList] of Object.entries(patterns)) {
    for (const pattern of patternList) {
      if (messageLower.includes(pattern.toLowerCase())) {
        matches.push(pattern);
      }
    }
  }

  return { matched: matches.length > 0, matches };
}

/**
 * Calculate significance based on matches and context
 */
function calculateSignificance(matchCount: number, context: MomentDetectionContext): number {
  let base = Math.min(0.3 + matchCount * 0.15, 0.9);

  // Boost for first-time events
  if (!context.hasSharedVulnerabilityBefore) {
    base += 0.1;
  }

  // Early session moments are slightly more significant (relationship building)
  if (context.sessionNumber < 10) {
    base += 0.05;
  }

  return Math.min(base, 1);
}

/**
 * Detect breakthrough moments
 */
function detectBreakthrough(context: MomentDetectionContext): DetectedMoment | null {
  const { userMessage, topic } = context;
  const { matched, matches } = matchesPatterns(userMessage, BREAKTHROUGH_PATTERNS);

  if (!matched) return null;

  return {
    type: 'breakthrough',
    confidence: Math.min(0.5 + matches.length * 0.1, 0.9),
    summary: `User had insight: "${userMessage.slice(0, 100)}..."`,
    userPhrase: matches[0],
    topic,
    significance: calculateSignificance(matches.length, context),
    tags: ['insight', 'growth', topic || 'general'].filter(Boolean) as string[],
  };
}

/**
 * Detect vulnerability moments
 */
function detectVulnerability(context: MomentDetectionContext): DetectedMoment | null {
  const { userMessage, topic, hasSharedVulnerabilityBefore } = context;
  const { matched, matches } = matchesPatterns(userMessage, VULNERABILITY_PATTERNS);

  if (!matched) return null;

  const type: SharedMomentType = hasSharedVulnerabilityBefore
    ? 'trust_demonstration'
    : 'first_vulnerability';

  return {
    type,
    confidence: Math.min(0.6 + matches.length * 0.1, 0.95),
    summary: `User opened up: "${userMessage.slice(0, 100)}..."`,
    userPhrase: matches[0],
    topic,
    significance: calculateSignificance(matches.length, context),
    tags: ['vulnerability', 'emotional', topic || 'personal'].filter(Boolean) as string[],
  };
}

/**
 * Detect laughter moments
 */
function detectLaughter(context: MomentDetectionContext): DetectedMoment | null {
  const { userMessage, topic } = context;
  const { matched, matches } = matchesPatterns(userMessage, LAUGHTER_PATTERNS);

  if (!matched) return null;

  // Only count genuine laughter (multiple signals or genuine phrases)
  const isGenuine =
    matches.length >= 2 ||
    LAUGHTER_PATTERNS.genuine.some((p) => userMessage.toLowerCase().includes(p));

  if (!isGenuine) return null;

  return {
    type: 'laughter',
    confidence: Math.min(0.5 + matches.length * 0.1, 0.85),
    summary: `Shared laughter moment`,
    userPhrase: matches[0],
    topic,
    significance: 0.5 + matches.length * 0.1,
    tags: ['joy', 'connection', 'humor'],
  };
}

/**
 * Detect celebration moments
 */
function detectCelebration(context: MomentDetectionContext): DetectedMoment | null {
  const { userMessage, topic } = context;
  const { matched, matches } = matchesPatterns(userMessage, CELEBRATION_PATTERNS);

  if (!matched) return null;

  return {
    type: 'celebration',
    confidence: Math.min(0.6 + matches.length * 0.1, 0.9),
    summary: `User celebrating: "${userMessage.slice(0, 100)}..."`,
    userPhrase: matches[0],
    topic,
    significance: calculateSignificance(matches.length, context),
    tags: ['win', 'achievement', 'celebration', topic || 'milestone'].filter(Boolean) as string[],
  };
}

/**
 * Detect crisis support moments
 */
function detectCrisis(context: MomentDetectionContext): DetectedMoment | null {
  const { userMessage, topic } = context;
  const { matched, matches } = matchesPatterns(userMessage, CRISIS_PATTERNS);

  if (!matched) return null;

  return {
    type: 'crisis_support',
    confidence: Math.min(0.7 + matches.length * 0.1, 0.95),
    summary: `User in distress: "${userMessage.slice(0, 100)}..."`,
    userPhrase: matches[0],
    topic,
    significance: 0.9, // Crisis moments are always highly significant
    tags: ['crisis', 'support', 'presence', topic || 'emotional'].filter(Boolean) as string[],
  };
}

/**
 * Detect trust demonstration moments
 */
function detectTrust(context: MomentDetectionContext): DetectedMoment | null {
  const { userMessage, topic } = context;
  const { matched, matches } = matchesPatterns(userMessage, TRUST_PATTERNS);

  if (!matched) return null;

  return {
    type: 'trust_demonstration',
    confidence: Math.min(0.6 + matches.length * 0.1, 0.9),
    summary: `User trusted with sensitive information`,
    userPhrase: matches[0],
    topic,
    significance: calculateSignificance(matches.length, context),
    tags: ['trust', 'sensitive', topic || 'personal'].filter(Boolean) as string[],
  };
}

/**
 * Detect growth recognition moments
 */
function detectGrowth(context: MomentDetectionContext): DetectedMoment | null {
  const { userMessage, topic } = context;
  const { matched, matches } = matchesPatterns(userMessage, GROWTH_PATTERNS);

  if (!matched) return null;

  return {
    type: 'growth_recognition',
    confidence: Math.min(0.5 + matches.length * 0.1, 0.85),
    summary: `User recognized their growth`,
    userPhrase: matches[0],
    topic,
    significance: calculateSignificance(matches.length, context),
    tags: ['growth', 'progress', 'awareness', topic || 'self'].filter(Boolean) as string[],
  };
}

// ============================================================================
// MAIN DETECTION API
// ============================================================================

/**
 * Detect all significant moments in a message
 */
export function detectMoments(context: MomentDetectionContext): DetectedMoment[] {
  const moments: DetectedMoment[] = [];

  // Run all detectors
  const detectors = [
    detectCrisis, // Check crisis first (highest priority)
    detectBreakthrough,
    detectVulnerability,
    detectCelebration,
    detectLaughter,
    detectTrust,
    detectGrowth,
  ];

  for (const detector of detectors) {
    try {
      const moment = detector(context);
      if (moment) {
        moments.push(moment);
      }
    } catch (error) {
      log.error({ error, detector: detector.name }, 'Error in moment detector');
    }
  }

  // Sort by significance (most significant first)
  moments.sort((a, b) => b.significance - a.significance);

  // Return top 2 moments max (to avoid over-detecting)
  return moments.slice(0, 2);
}

/**
 * Detect the most significant moment in a message
 */
export function detectPrimaryMoment(context: MomentDetectionContext): DetectedMoment | null {
  const moments = detectMoments(context);
  return moments.length > 0 ? moments[0] : null;
}

/**
 * Check if message contains any significant moment
 */
export function hasMoment(context: MomentDetectionContext): boolean {
  return detectMoments(context).length > 0;
}

/**
 * Get moment type priority (for filtering)
 */
export function getMomentPriority(type: SharedMomentType): number {
  const priorities: Record<SharedMomentType, number> = {
    crisis_support: 10,
    first_vulnerability: 9,
    vulnerability: 8, // General vulnerability (not first time)
    breakthrough: 8,
    trust_demonstration: 7,
    growth_recognition: 6,
    celebration: 5,
    deep_conversation: 5, // Meaningful exchange
    laughter: 4,
    disagreement_resolved: 3,
    callback_resonance: 2,
    emotional_mirror: 2,
    protective_moment: 6,
    silence_held: 3,
    pattern_insight: 5,
  };

  return priorities[type] || 1;
}

/**
 * NEW: Convert unified moments to legacy DetectedMoment format
 */
function convertUnifiedMoment(unified: UnifiedMoment): DetectedMoment {
  return {
    type: unified.type,
    confidence: unified.confidence,
    summary: unified.summary,
    userPhrase: unified.triggerPhrase,
    topic: unified.topic,
    significance: unified.significance,
    tags: unified.tags,
  };
}

/**
 * NEW: Detect moments using unified system (preferred method)
 *
 * Returns the full unified result including memorable details for callbacks
 */
export function detectMomentsUnifiedWrapper(context: MomentDetectionContext) {
  const unifiedContext: UnifiedContext = {
    userMessage: context.userMessage,
    aiResponse: context.aiResponse,
    topic: context.topic,
    emotionalState: context.emotionalState,
    sessionNumber: context.sessionNumber,
    hasSharedVulnerabilityBefore: context.hasSharedVulnerabilityBefore,
  };
  return detectMomentsUnified(unifiedContext);
}

/**
 * NEW: Re-export unified extractMemorableMoments
 */
export { extractMemorableMomentsUnified as extractMemorableMoments };

export default {
  detectMoments,
  detectPrimaryMoment,
  hasMoment,
  getMomentPriority,
  detectMomentsUnifiedWrapper,
  extractMemorableMoments: extractMemorableMomentsUnified,
};
