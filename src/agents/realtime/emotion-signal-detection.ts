/**
 * BTH Signal Detection Helpers
 *
 * Pure text/context checks that decide when to trigger "Better Than Human"
 * signals from conversation content (delight, vulnerability, meta-relationship,
 * temporal insight). Re-exported from emotion-event-dispatcher.ts.
 *
 * @module agents/realtime/emotion-signal-detection
 */

import { STRESS_NEEDS_SPACE } from '../../config/emotion-thresholds.js';

// ============================================================================
// BTH SIGNAL DETECTION HELPERS
// These help detect when to trigger BTH signals from conversation content
// ============================================================================

/**
 * Patterns that indicate user is sharing good news/achievement
 */
const DELIGHT_PATTERNS = [
  /i got (the|a) (job|promotion|raise|offer)/i,
  /i (passed|aced|nailed|crushed) (the|my)/i,
  /we('re| are) (pregnant|having a baby|engaged|getting married)/i,
  /i('m| am) so (happy|excited|thrilled|proud)/i,
  /guess what[!?]/i,
  /great news/i,
  /can('t| not) believe it/i,
];

/**
 * Patterns that indicate sarcasm or frustration (false delight)
 * These should NOT trigger delight response
 */
const SARCASM_PATTERNS = [
  /great,? (another|more|just what)/i, // "Great, another problem"
  /oh (great|wonderful|perfect),? (so|now)/i, // "Oh great, so now..."
  /just (great|wonderful|perfect)/i, // "Just great" (often sarcastic)
  /(yeah|sure),? (that's )?(great|wonderful)/i, // "Yeah, that's great" (dismissive)
  /how (great|wonderful|fantastic)\.{3}/i, // "How wonderful..." (sarcastic ellipsis)
];

/**
 * Patterns indicating user is discussing someone else's news (third-person)
 */
const THIRD_PERSON_PATTERNS = [
  /\b(he|she|they|my (friend|sister|brother|mom|dad|boss|coworker))\b.*(got|got a|passed|aced)/i,
  /\b(his|her|their)\b.*(promotion|job|raise|offer)/i,
  /\bdid you (hear|know) (about|that)\b/i, // Often leads to others' news
];

/**
 * Patterns that indicate vulnerability expression (Ferni's output)
 */
const VULNERABILITY_PATTERNS = [
  /i('m| am) not (sure|certain)/i,
  /i (might|may|could) be wrong/i,
  /i (don't|do not) (know|have all the answers)/i,
  /i('m| am) still (learning|figuring)/i,
  /honestly,? i('m| am) (not sure|uncertain)/i,
  /i realize i/i,
  /that('s| is) a good question.* i/i,
];

/**
 * Patterns that indicate meta-relationship commentary
 */
const META_RELATIONSHIP_PATTERNS = [
  /i (really )?(appreciate|value|love) (how|that|when)/i, // More flexible - matches "I appreciate how open..."
  /our (conversations?|relationship|friendship|time together)/i,
  /i('ve| have) (noticed|seen) (how|that) you('ve| have)/i,
  /you('ve| have) (come|grown|changed) (so|a long) (far|way|much)/i,
  /i feel (close|connected|honored) to/i,
];

/**
 * Patterns that indicate temporal insight (memory reference)
 */
const TEMPORAL_PATTERNS = [
  /remember (when|that time|how)/i,
  /(last|a few) (week|month|year)s?( ago| back)?( you)?/i, // More flexible - matches "Last month you..."
  /the (first|last) time (we|you)/i,
  /back (when|in)/i,
  /you (mentioned|said|told me) (earlier|before|last time)/i,
];

/**
 * Detect if user message contains delight/achievement (simple version)
 * @deprecated Use detectUserDelightWithContext for better accuracy
 */
export function detectUserDelight(userMessage: string): boolean {
  return DELIGHT_PATTERNS.some((pattern) => pattern.test(userMessage));
}

/**
 * Context-aware delight detection result
 */
export interface DelightDetectionResult {
  detected: boolean;
  confidence: number;
  /** Reason detection was rejected (if not detected) */
  rejectionReason?: 'sarcasm' | 'third_person' | 'negative_context' | 'no_match';
  /** The specific trigger pattern that matched */
  trigger?: string;
}

/**
 * Context-aware delight detection
 * Filters out sarcasm, third-person references, and negative emotional context
 *
 * @param userMessage - The user's message
 * @param emotionalContext - Optional emotional context from turn analysis
 * @returns Detection result with confidence and reasoning
 */
export function detectUserDelightWithContext(
  userMessage: string,
  emotionalContext?: { sentiment?: 'positive' | 'negative' | 'neutral'; intensity?: number }
): DelightDetectionResult {
  // Check for sarcasm patterns first (high priority rejection)
  if (SARCASM_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      detected: false,
      confidence: 0,
      rejectionReason: 'sarcasm',
    };
  }

  // Check for third-person patterns (they're discussing someone else's news)
  if (THIRD_PERSON_PATTERNS.some((pattern) => pattern.test(userMessage))) {
    return {
      detected: false,
      confidence: 0,
      rejectionReason: 'third_person',
    };
  }

  // Check for negative emotional context from turn analysis
  if (
    emotionalContext?.sentiment === 'negative' &&
    (emotionalContext.intensity ?? 0) > STRESS_NEEDS_SPACE
  ) {
    return {
      detected: false,
      confidence: 0,
      rejectionReason: 'negative_context',
    };
  }

  // Check for positive delight patterns
  for (const pattern of DELIGHT_PATTERNS) {
    if (pattern.test(userMessage)) {
      // Calculate confidence based on pattern strength and context
      let confidence = 0.8;

      // Boost confidence for explicit first-person achievements
      if (/\bi\b/i.test(userMessage)) {
        confidence += 0.1;
      }

      // Boost confidence for exclamation marks (genuine excitement)
      if (userMessage.includes('!')) {
        confidence += 0.05;
      }

      // Boost confidence for positive emotional context
      if (emotionalContext?.sentiment === 'positive') {
        confidence += 0.05;
      }

      return {
        detected: true,
        confidence: Math.min(confidence, 1.0),
        trigger: pattern.source,
      };
    }
  }

  return {
    detected: false,
    confidence: 0,
    rejectionReason: 'no_match',
  };
}

/**
 * Detect if Ferni's response contains vulnerability expression
 * @deprecated Use detectVulnerabilityWithContext for topic-aware detection
 */
export function detectVulnerabilityInResponse(ferniResponse: string): {
  detected: boolean;
  type: 'uncertainty' | 'admission' | 'reflection' | 'growth';
} {
  for (const pattern of VULNERABILITY_PATTERNS) {
    if (pattern.test(ferniResponse)) {
      // Categorize the type
      if (/not (sure|certain)|might be wrong/i.test(ferniResponse)) {
        return { detected: true, type: 'uncertainty' };
      }
      if (/don't (know|have)/i.test(ferniResponse)) {
        return { detected: true, type: 'admission' };
      }
      if (/realize|still (learning|figuring)/i.test(ferniResponse)) {
        return { detected: true, type: 'reflection' };
      }
      return { detected: true, type: 'growth' };
    }
  }
  return { detected: false, type: 'uncertainty' };
}

/**
 * Patterns indicating technical/factual context where vulnerability shouldn't trigger
 * These are "I don't know" statements about technical things, not emotional/philosophical
 */
const TECHNICAL_CONTEXT_PATTERNS = [
  /i('m| am) not sure (how|what) (the|this|that) (api|code|function|method|syntax)/i,
  /i don't (know|have) (the|that) (api|code|documentation|spec)/i,
  /technically|implementation|configuration|syntax|parameter/i,
  /let me (check|look that up|find out)/i, // Informational not emotional
  /i('ll| will) need to (look|check|verify)/i,
];

/**
 * Patterns indicating emotional/philosophical context where vulnerability should trigger
 * These represent genuine emotional uncertainty that humanizes Ferni
 */
const EMOTIONAL_VULNERABILITY_PATTERNS = [
  /i('m| am) not sure (what|how) (you|to help you|to support|the best way)/i,
  /i don't (have|know) all the answers (when it comes to|about|for) (life|feelings|emotions|relationships)/i,
  /this (is|feels) (hard|difficult) (to|for) (me|even) (to )?know/i,
  /honestly,? (i'm|i am) (unsure|uncertain) (how|what) (you|to)/i,
  /i (might|may) be wrong (about|on) this,? but/i,
  /i realize (i|that i) (don't|may not) (fully )?understand/i,
];

/**
 * Context-aware vulnerability detection result
 */
export interface VulnerabilityDetectionResult {
  detected: boolean;
  type: 'uncertainty' | 'admission' | 'reflection' | 'growth';
  confidence: number;
  /** Whether this is emotional vulnerability (vs technical uncertainty) */
  isEmotional: boolean;
  /** Reason for rejection if not detected */
  rejectionReason?: 'technical_context' | 'no_match';
}

/**
 * Context-aware vulnerability detection
 * Distinguishes between technical "I don't know" (ignore) and emotional vulnerability (trigger)
 *
 * @param ferniResponse - Ferni's response to analyze
 * @param userTopic - The topic the user was asking about (optional, for context)
 * @returns Detection result with type and context
 */
export function detectVulnerabilityWithContext(
  ferniResponse: string,
  userTopic?: string
): VulnerabilityDetectionResult {
  // Check for technical context first (should NOT trigger vulnerability)
  const isTechnicalContext =
    TECHNICAL_CONTEXT_PATTERNS.some((p) => p.test(ferniResponse)) ||
    (userTopic && /(api|code|bug|error|config|setup|install|deploy)/i.test(userTopic));

  if (isTechnicalContext) {
    // Check if there's ALSO emotional vulnerability layered in
    const hasEmotionalVulnerability = EMOTIONAL_VULNERABILITY_PATTERNS.some((p) =>
      p.test(ferniResponse)
    );
    if (!hasEmotionalVulnerability) {
      return {
        detected: false,
        type: 'uncertainty',
        confidence: 0,
        isEmotional: false,
        rejectionReason: 'technical_context',
      };
    }
  }

  // Check for emotional vulnerability patterns (high priority)
  if (EMOTIONAL_VULNERABILITY_PATTERNS.some((p) => p.test(ferniResponse))) {
    const type = categorizeVulnerabilityType(ferniResponse);
    return {
      detected: true,
      type,
      confidence: 0.9,
      isEmotional: true,
    };
  }

  // Fall back to standard vulnerability patterns
  for (const pattern of VULNERABILITY_PATTERNS) {
    if (pattern.test(ferniResponse)) {
      const type = categorizeVulnerabilityType(ferniResponse);
      return {
        detected: true,
        type,
        confidence: 0.7,
        isEmotional: !isTechnicalContext,
      };
    }
  }

  return {
    detected: false,
    type: 'uncertainty',
    confidence: 0,
    isEmotional: false,
    rejectionReason: 'no_match',
  };
}

/**
 * Helper to categorize vulnerability type
 */
function categorizeVulnerabilityType(
  response: string
): 'uncertainty' | 'admission' | 'reflection' | 'growth' {
  if (/not (sure|certain)|might be wrong/i.test(response)) {
    return 'uncertainty';
  }
  if (/don't (know|have)/i.test(response)) {
    return 'admission';
  }
  if (/realize|still (learning|figuring)/i.test(response)) {
    return 'reflection';
  }
  return 'growth';
}

/**
 * Detect if Ferni's response contains meta-relationship commentary
 */
export function detectMetaRelationship(ferniResponse: string): boolean {
  return META_RELATIONSHIP_PATTERNS.some((pattern) => pattern.test(ferniResponse));
}

/**
 * Detect if Ferni's response contains temporal insight
 */
export function detectTemporalInsight(ferniResponse: string): boolean {
  return TEMPORAL_PATTERNS.some((pattern) => pattern.test(ferniResponse));
}

/**
 * Get appropriate time context for anticipatory presence
 */
export function getTimeContext():
  | 'late_night'
  | 'early_morning'
  | 'weekend'
  | 'monday'
  | 'evening'
  | null {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();

  // Late night: 11pm - 4am
  if (hour >= 23 || hour < 4) return 'late_night';

  // Early morning: 4am - 6am
  if (hour >= 4 && hour < 6) return 'early_morning';

  // Weekend (Saturday=6, Sunday=0)
  if (day === 0 || day === 6) return 'weekend';

  // Monday
  if (day === 1 && hour < 12) return 'monday';

  // Evening: 6pm - 10pm
  if (hour >= 18 && hour < 22) return 'evening';

  return null;
}
