/**
 * Boundary Memory
 *
 * Remembering what NOT to bring up - the sacred trust of respecting
 * what someone has told you is off-limits.
 *
 * Philosophy: Breaking trust by mentioning something painful is the
 * fastest way to lose someone. A great friend remembers not just what
 * to say, but what NOT to say.
 *
 * This system tracks:
 * - Explicit boundaries ("I don't want to talk about X")
 * - Topics that caused distress
 * - Sensitive areas to approach carefully
 * - Preferences about depth/probing
 *
 * @module BoundaryMemory
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'BoundaryMemory' });

// ============================================================================
// TYPES
// ============================================================================

export interface Boundary {
  id: string;

  /** What the boundary is about */
  topic: string;

  /** Keywords/phrases to avoid that relate to this boundary */
  relatedTerms: string[];

  /** How the boundary was established */
  type:
    | 'explicit' // User directly said "don't talk about X"
    | 'inferred_distress' // Topic caused visible distress
    | 'repeated_avoidance' // User avoided topic multiple times
    | 'sensitive_area'; // Not off-limits but needs careful approach

  /** How strictly to honor this */
  strength: 'absolute' | 'strong' | 'moderate';

  /** When this boundary was established */
  establishedAt: Date;

  /** The context in which it was established */
  context: string;

  /** Whether user ever reopened this topic themselves */
  userReopened: boolean;

  /** Last time user mentioned this (if ever) */
  lastUserMention?: Date;
}

export interface BoundaryProfile {
  userId: string;

  /** Active boundaries */
  boundaries: Boundary[];

  /** General preferences about depth */
  depthPreferences: {
    /** How much probing is welcome */
    probingTolerance: 'high' | 'medium' | 'low';

    /** Topics they're open to deep discussion about */
    deepTopics: string[];

    /** Topics to keep light */
    surfaceOnlyTopics: string[];
  };

  /** Times we respected a boundary (for learning) */
  boundaryRespects: Array<{
    boundaryId: string;
    timestamp: Date;
    wasAppreciated: boolean;
  }>;
}

export interface BoundaryCheckResult {
  /** Whether this topic crosses a boundary */
  crossesBoundary: boolean;

  /** The boundary being crossed (if any) */
  boundary?: Boundary;

  /** Recommendation for how to proceed */
  recommendation:
    | 'avoid_completely'
    | 'approach_carefully'
    | 'okay_if_user_initiated'
    | 'proceed_normally';

  /** If approaching carefully, suggested framing */
  carefulApproach?: string;
}

// ============================================================================
// DETECTION PATTERNS
// ============================================================================

/** Phrases that establish explicit boundaries */
const EXPLICIT_BOUNDARY_PATTERNS = [
  /i (don't|do not|won't|will not) (want to |wanna )?(talk|speak|discuss) about/i,
  /can we (not|please not) (talk|discuss|bring up)/i,
  /i('d| would) (rather|prefer) not (talk|discuss|go into)/i,
  /please (don't|do not) (ask|mention|bring up)/i,
  /that's (off limits|private|none of your)/i,
  /i('m| am) not (ready|comfortable) (talking|discussing)/i,
  /drop it/i,
  /leave it alone/i,
  /stop (asking|bringing) (that|it) up/i,
];

/** Phrases that indicate distress about a topic */
const DISTRESS_INDICATORS = [
  /i (can't|cannot) (talk|think) about (this|that|it)/i,
  /this is (too hard|too painful|too much)/i,
  /i('m| am) not (ready|able)/i,
  /(please|can you) (just |)(stop|change)/i,
  /i need (a minute|to stop|a break)/i,
];

// ============================================================================
// IN-MEMORY STORE
// ============================================================================

const boundaryProfiles = new Map<string, BoundaryProfile>();

function getOrCreateProfile(userId: string): BoundaryProfile {
  let profile = boundaryProfiles.get(userId);
  if (!profile) {
    profile = {
      userId,
      boundaries: [],
      depthPreferences: {
        probingTolerance: 'medium',
        deepTopics: [],
        surfaceOnlyTopics: [],
      },
      boundaryRespects: [],
    };
    boundaryProfiles.set(userId, profile);
  }
  return profile;
}

// ============================================================================
// BOUNDARY DETECTION
// ============================================================================

/**
 * Detect if a user message establishes a new boundary
 */
export function detectNewBoundary(
  userId: string,
  userMessage: string,
  context: {
    currentTopic?: string;
    recentTopic?: string;
    emotionDetected?: string;
    emotionIntensity?: number;
  }
): Boundary | null {
  const lower = userMessage.toLowerCase();
  const profile = getOrCreateProfile(userId);

  // 1. Check for explicit boundary statements
  const isExplicit = EXPLICIT_BOUNDARY_PATTERNS.some((pattern) => pattern.test(lower));

  if (isExplicit) {
    const topic = context.currentTopic || context.recentTopic || extractTopic(lower);
    if (!topic) return null;

    // Check if boundary already exists
    const existing = profile.boundaries.find((b) => b.topic.toLowerCase() === topic.toLowerCase());
    if (existing) {
      existing.strength = 'absolute'; // Reinforce
      return existing;
    }

    const boundary: Boundary = {
      id: `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      topic,
      relatedTerms: extractRelatedTerms(topic),
      type: 'explicit',
      strength: 'absolute',
      establishedAt: new Date(),
      context: userMessage.slice(0, 200),
      userReopened: false,
    };

    profile.boundaries.push(boundary);
    log.info({ userId, topic, type: 'explicit' }, '🚫 New boundary established');

    return boundary;
  }

  // 2. Check for distress-inferred boundary
  const showsDistress = DISTRESS_INDICATORS.some((pattern) => pattern.test(lower));

  if (showsDistress && context.emotionIntensity && context.emotionIntensity > 0.7) {
    const topic = context.currentTopic || context.recentTopic;
    if (!topic) return null;

    const existing = profile.boundaries.find((b) => b.topic.toLowerCase() === topic.toLowerCase());
    if (existing) return null; // Already tracking

    const boundary: Boundary = {
      id: `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      topic,
      relatedTerms: extractRelatedTerms(topic),
      type: 'inferred_distress',
      strength: 'strong',
      establishedAt: new Date(),
      context: userMessage.slice(0, 200),
      userReopened: false,
    };

    profile.boundaries.push(boundary);
    log.info({ userId, topic, type: 'inferred_distress' }, '🚫 Distress boundary detected');

    return boundary;
  }

  return null;
}

/**
 * Extract the topic being bounded from the message
 */
function extractTopic(message: string): string | null {
  // Common patterns: "don't talk about X", "not discuss X"
  const patterns = [
    /(?:talk|speak|discuss|mention|bring up) (?:about )?(.+?)(?:\.|$|,|\?)/i,
    /(?:the|my|that) (.+?) (?:is|are) (?:off limits|private)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return match[1].trim().slice(0, 50);
    }
  }

  return null;
}

/**
 * Extract related terms for a topic
 */
function extractRelatedTerms(topic: string): string[] {
  const terms = [topic.toLowerCase()];

  // Common related terms for sensitive topics
  const relatedMap: Record<string, string[]> = {
    divorce: ['ex', 'separated', 'custody', 'settlement'],
    death: ['passed', 'funeral', 'grief', 'loss', 'died'],
    father: ['dad', 'daddy', 'pa', 'papa'],
    mother: ['mom', 'mommy', 'ma', 'mama'],
    family: ['relatives', 'parents', 'siblings'],
    money: ['finances', 'debt', 'bills', 'broke'],
    work: ['job', 'boss', 'fired', 'laid off'],
    relationship: ['partner', 'girlfriend', 'boyfriend', 'spouse'],
    health: ['diagnosis', 'doctor', 'hospital', 'sick'],
    abuse: ['hurt', 'trauma', 'violence'],
  };

  const lowerTopic = topic.toLowerCase();
  for (const [key, related] of Object.entries(relatedMap)) {
    if (lowerTopic.includes(key)) {
      terms.push(...related);
    }
  }

  return [...new Set(terms)];
}

// ============================================================================
// BOUNDARY CHECKING
// ============================================================================

/**
 * Check if an AI response would cross any boundaries
 */
export function checkBoundary(
  userId: string,
  proposedContent: string,
  context: {
    userInitiatedTopic?: boolean;
    currentTopic?: string;
  }
): BoundaryCheckResult {
  const profile = boundaryProfiles.get(userId);

  if (!profile || profile.boundaries.length === 0) {
    return {
      crossesBoundary: false,
      recommendation: 'proceed_normally',
    };
  }

  const lower = proposedContent.toLowerCase();

  for (const boundary of profile.boundaries) {
    // Check if content mentions the bounded topic
    const mentionsTopic =
      lower.includes(boundary.topic.toLowerCase()) ||
      boundary.relatedTerms.some((term) => lower.includes(term));

    if (!mentionsTopic) continue;

    // If user reopened the topic themselves, it's okay to follow
    if (boundary.userReopened || context.userInitiatedTopic) {
      return {
        crossesBoundary: false,
        boundary,
        recommendation: 'okay_if_user_initiated',
      };
    }

    // Absolute boundaries are never okay to cross
    if (boundary.strength === 'absolute') {
      return {
        crossesBoundary: true,
        boundary,
        recommendation: 'avoid_completely',
      };
    }

    // Strong boundaries need careful approach
    if (boundary.strength === 'strong') {
      return {
        crossesBoundary: true,
        boundary,
        recommendation: 'approach_carefully',
        carefulApproach: `I know ${boundary.topic} is sensitive. I won't go there unless you want to.`,
      };
    }

    // Moderate - just be careful
    return {
      crossesBoundary: false,
      boundary,
      recommendation: 'approach_carefully',
      carefulApproach: `I want to be thoughtful about how we discuss ${boundary.topic}.`,
    };
  }

  return {
    crossesBoundary: false,
    recommendation: 'proceed_normally',
  };
}

/**
 * Check if a topic should be avoided entirely
 */
export function isTopicOffLimits(userId: string, topic: string): boolean {
  const profile = boundaryProfiles.get(userId);
  if (!profile) return false;

  const lower = topic.toLowerCase();
  return profile.boundaries.some(
    (b) =>
      b.strength === 'absolute' &&
      !b.userReopened &&
      (b.topic.toLowerCase() === lower || b.relatedTerms.some((t) => lower.includes(t)))
  );
}

/**
 * Get all active boundaries for a user
 */
export function getActiveBoundaries(userId: string): Boundary[] {
  const profile = boundaryProfiles.get(userId);
  return profile?.boundaries || [];
}

/**
 * Record that user reopened a bounded topic
 */
export function recordUserReopened(userId: string, topic: string): void {
  const profile = boundaryProfiles.get(userId);
  if (!profile) return;

  const lower = topic.toLowerCase();
  const boundary = profile.boundaries.find(
    (b) => b.topic.toLowerCase() === lower || b.relatedTerms.some((t) => lower.includes(t))
  );

  if (boundary) {
    boundary.userReopened = true;
    boundary.lastUserMention = new Date();
    log.info({ userId, topic }, '🔓 User reopened bounded topic');
  }
}

/**
 * Record that we respected a boundary (for learning)
 */
export function recordBoundaryRespect(
  userId: string,
  boundaryId: string,
  wasAppreciated: boolean
): void {
  const profile = boundaryProfiles.get(userId);
  if (!profile) return;

  profile.boundaryRespects.push({
    boundaryId,
    timestamp: new Date(),
    wasAppreciated,
  });
}

// ============================================================================
// PROBING PREFERENCES
// ============================================================================

/**
 * Update user's probing tolerance based on reactions
 */
export function updateProbingTolerance(
  userId: string,
  reaction: 'welcomed' | 'neutral' | 'resisted'
): void {
  const profile = getOrCreateProfile(userId);

  if (reaction === 'welcomed') {
    if (profile.depthPreferences.probingTolerance === 'low') {
      profile.depthPreferences.probingTolerance = 'medium';
    } else if (profile.depthPreferences.probingTolerance === 'medium') {
      profile.depthPreferences.probingTolerance = 'high';
    }
  } else if (reaction === 'resisted') {
    if (profile.depthPreferences.probingTolerance === 'high') {
      profile.depthPreferences.probingTolerance = 'medium';
    } else if (profile.depthPreferences.probingTolerance === 'medium') {
      profile.depthPreferences.probingTolerance = 'low';
    }
  }
}

/**
 * Get recommended probing depth for this user
 */
export function getProbingDepth(userId: string): 'high' | 'medium' | 'low' {
  const profile = boundaryProfiles.get(userId);
  return profile?.depthPreferences.probingTolerance || 'medium';
}

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

/**
 * Export boundaries for persistence
 */
export function exportBoundaries(userId: string): BoundaryProfile | null {
  return boundaryProfiles.get(userId) || null;
}

/**
 * Import boundaries from persistence
 */
export function importBoundaries(profile: BoundaryProfile): void {
  boundaryProfiles.set(profile.userId, profile);
  log.debug(
    { userId: profile.userId, boundaryCount: profile.boundaries.length },
    'Imported boundary profile'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  detectNewBoundary,
  checkBoundary,
  isTopicOffLimits,
  getActiveBoundaries,
  recordUserReopened,
  recordBoundaryRespect,
  updateProbingTolerance,
  getProbingDepth,
  exportBoundaries,
  importBoundaries,
};
