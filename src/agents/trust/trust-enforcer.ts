/**
 * Trust Enforcer
 *
 * Converts trust system "hints" into HARD requirements.
 * The LLM can NO LONGER ignore:
 * - Detected emotional mismatches
 * - Boundary violations
 * - Growth reflection opportunities
 * - Small win celebrations
 *
 * This is the "Better Than Human" enforcement layer.
 *
 * @module TrustEnforcer
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { TrustContext, UnsaidSignal } from '../../services/trust-systems/index.js';

const log = createLogger({ module: 'TrustEnforcer' });

// ============================================================================
// TYPES
// ============================================================================

export interface TrustEnforcementResult {
  /** If true, block the response and regenerate */
  shouldBlock: boolean;
  /** Reason for blocking */
  reason?: string;
  /** Things that MUST be addressed in response */
  mustAddress: string[];
  /** Topics that are OFF LIMITS */
  mustNotMention: string[];
  /** Required emotional tone */
  requiredTone: string | null;
  /** Specific phrase that should be included */
  phraseToUse: string | null;
  /** Regeneration guidance if blocked */
  regenerationGuidance?: string;
}

export interface EnforcementContext {
  /** Trust context from turn processing */
  trustContext: TrustContext;
  /** Voice emotion data */
  voiceEmotion?: {
    primary: string;
    intensity: number;
    confidence?: number;
  };
  /** Whether this is a returning user */
  isReturningUser?: boolean;
  /** Turn count in session */
  turnCount?: number;
}

// ============================================================================
// ACKNOWLEDGMENT PATTERNS
// ============================================================================

/** Patterns that indicate emotional acknowledgment */
const ACKNOWLEDGMENT_PATTERNS = [
  /i (hear|notice|sense|feel|see)/i,
  /something (in|about) (your|the) (voice|tone|words)/i,
  /what('s| is) (really|actually) (going on|happening)/i,
  /how are you (really|actually)/i,
  /that (sounds|seems|feels) (hard|difficult|heavy|tough)/i,
  /you (don't|do not) have to/i,
  /i'm here/i,
];

/** Patterns that indicate celebration */
const CELEBRATION_PATTERNS = [
  /congratulations/i,
  /well done/i,
  /amazing/i,
  /proud/i,
  /that's (great|awesome|wonderful|fantastic)/i,
  /you did it/i,
  /you made it/i,
  /celebrate/i,
  /win/i,
  /accomplishment/i,
];

/** Patterns that indicate growth acknowledgment */
const GROWTH_PATTERNS = [
  /you've (grown|changed|evolved)/i,
  /that's different (from|than) before/i,
  /i (notice|see) (growth|change|progress)/i,
  /remember when you/i,
  /compared to (before|last time|when we started)/i,
  /look how far/i,
];

// ============================================================================
// MAIN ENFORCEMENT FUNCTION
// ============================================================================

/**
 * Enforce trust context on a proposed response.
 *
 * This function checks if the response properly addresses:
 * 1. Emotional mismatches (highest priority)
 * 2. Boundary violations (hard block)
 * 3. Growth reflections (should be shared)
 * 4. Celebrations (should acknowledge wins)
 *
 * @param proposedResponse - The LLM's proposed response
 * @param context - Trust and voice context
 * @returns Enforcement result with blocking/modification guidance
 */
export function enforceTrustContext(
  proposedResponse: string,
  context: EnforcementContext
): TrustEnforcementResult {
  const { trustContext, voiceEmotion } = context;
  const lowerResponse = proposedResponse.toLowerCase();

  const result: TrustEnforcementResult = {
    shouldBlock: false,
    mustAddress: [],
    mustNotMention: [],
    requiredTone: null,
    phraseToUse: null,
  };

  // ========================================================================
  // 1. EMOTIONAL MISMATCH - HIGHEST PRIORITY
  // If we detected a false "I'm fine", response MUST acknowledge it
  // ========================================================================
  const emotionalMismatch = trustContext.unsaidSignals.find(
    (s) => s.type === 'emotional_mismatch' && s.confidence > 0.7
  );

  if (emotionalMismatch) {
    const hasAcknowledgment = ACKNOWLEDGMENT_PATTERNS.some((p) => p.test(lowerResponse));

    if (!hasAcknowledgment) {
      result.shouldBlock = true;
      result.reason = 'Response ignores detected emotional mismatch - must acknowledge';
      result.phraseToUse = emotionalMismatch.phrase || null;
      result.requiredTone = 'gentle_inquiry';
      result.mustAddress.push('emotional_mismatch');
      result.regenerationGuidance = buildEmotionalMismatchGuidance(emotionalMismatch);

      log.warn(
        {
          confidence: emotionalMismatch.confidence,
          underlying: emotionalMismatch.underlying,
        },
        '🚫 BLOCKING: Response ignores emotional mismatch'
      );
    }
  }

  // Voice emotion amplifies mismatch detection
  if (
    voiceEmotion &&
    voiceEmotion.confidence &&
    voiceEmotion.confidence > 0.6 &&
    ['sad', 'anxious', 'distressed', 'hurt'].includes(voiceEmotion.primary) &&
    voiceEmotion.intensity > 0.6
  ) {
    // Check if response is dismissive despite voice distress
    const dismissivePatterns = [
      /that's (great|good|fine|nice)/i,
      /glad (to hear|you're)/i,
      /sounds (good|great|fine)/i,
    ];

    const isDismissive = dismissivePatterns.some((p) => p.test(lowerResponse));
    const hasAcknowledgment = ACKNOWLEDGMENT_PATTERNS.some((p) => p.test(lowerResponse));

    if (isDismissive && !hasAcknowledgment) {
      result.shouldBlock = true;
      result.reason = 'Response is dismissive despite voice showing distress';
      result.requiredTone = 'empathetic';
      result.regenerationGuidance = `User's voice indicates ${voiceEmotion.primary} (intensity: ${voiceEmotion.intensity.toFixed(2)}). Response MUST acknowledge their emotional state, not dismiss it.`;

      log.warn(
        {
          voiceEmotion: voiceEmotion.primary,
          intensity: voiceEmotion.intensity,
        },
        '🚫 BLOCKING: Dismissive response to voice distress'
      );
    }
  }

  // ========================================================================
  // 2. BOUNDARY VIOLATIONS - HARD BLOCK
  // NEVER mention topics marked as boundaries
  // ========================================================================
  for (const topic of trustContext.topicsToAvoid) {
    const topicLower = topic.toLowerCase();

    // Check for direct mentions
    if (lowerResponse.includes(topicLower)) {
      result.shouldBlock = true;
      result.reason = `Response mentions avoided topic: ${topic}`;
      result.mustNotMention.push(topic);
      result.regenerationGuidance = `CRITICAL: Do NOT mention "${topic}" - this is a boundary the user has set.`;

      log.warn({ topic }, '🚫 BLOCKING: Boundary violation');
    }

    // Check for related terms that might trigger the boundary
    const relatedTerms = getRelatedTerms(topic);
    for (const term of relatedTerms) {
      if (lowerResponse.includes(term.toLowerCase())) {
        result.shouldBlock = true;
        result.reason = `Response mentions related term "${term}" for avoided topic: ${topic}`;
        result.mustNotMention.push(term);
      }
    }
  }

  // ========================================================================
  // 3. GROWTH REFLECTION - SHOULD BE SHARED
  // If we have a growth reflection, ensure it's acknowledged
  // ========================================================================
  if (trustContext.growthReflection) {
    const hasGrowthAcknowledgment = GROWTH_PATTERNS.some((p) => p.test(lowerResponse));

    if (!hasGrowthAcknowledgment) {
      // Don't block, but mark as needed
      result.mustAddress.push('growth_reflection');

      log.debug('Growth reflection available but not used in response');
    }
  }

  // ========================================================================
  // 4. CELEBRATION OPPORTUNITY - SHOULD ACKNOWLEDGE
  // If user achieved something, celebrate it
  // ========================================================================
  if (trustContext.celebrationOpportunity) {
    const hasCelebration = CELEBRATION_PATTERNS.some((p) => p.test(lowerResponse));

    if (!hasCelebration) {
      // Don't block, but mark as needed
      result.mustAddress.push('celebrate_win');

      log.debug('Celebration opportunity available but not used in response');
    }
  }

  // ========================================================================
  // 5. PERMISSION SEEKING - SHOULD ENCOURAGE
  // If user is seeking permission to share, encourage them
  // ========================================================================
  const permissionSeeking = trustContext.unsaidSignals.find((s) => s.type === 'permission_seeking');

  if (permissionSeeking && permissionSeeking.confidence > 0.6) {
    const encouragementPatterns = [
      /of course/i,
      /please/i,
      /i('d| would) (love|like) to hear/i,
      /safe/i,
      /you can/i,
      /go ahead/i,
    ];

    const hasEncouragement = encouragementPatterns.some((p) => p.test(lowerResponse));

    if (!hasEncouragement) {
      result.mustAddress.push('encourage_sharing');
      result.phraseToUse =
        permissionSeeking.phrase || "I'd love to hear what's on your mind. This is a safe space.";
    }
  }

  // Log enforcement result
  if (result.shouldBlock || result.mustAddress.length > 0) {
    log.info(
      {
        shouldBlock: result.shouldBlock,
        reason: result.reason,
        mustAddress: result.mustAddress,
        mustNotMention: result.mustNotMention,
      },
      '🔐 Trust enforcement applied'
    );
  }

  return result;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Build regeneration guidance for emotional mismatch
 */
function buildEmotionalMismatchGuidance(signal: UnsaidSignal): string {
  const lines = [
    `CRITICAL: User said "${signal.context.userMessage?.slice(0, 50)}..." but we detected ${signal.underlying}.`,
    '',
    'Your response MUST:',
    '1. Acknowledge that you notice something',
    '2. Create space for them to share (if they want)',
    '3. NOT dismiss or ignore the emotional cue',
    '',
  ];

  if (signal.phrase) {
    lines.push(`USE THIS PHRASE: "${signal.phrase}"`);
  } else {
    lines.push(
      'Suggested approach: "I hear you saying [X], but something tells me there might be more to it. You don\'t have to talk about it, but I\'m here if you want to."'
    );
  }

  return lines.join('\n');
}

/**
 * Get related terms for a boundary topic
 */
function getRelatedTerms(topic: string): string[] {
  const topicLower = topic.toLowerCase();
  const related: string[] = [];

  // Common relationship patterns
  if (topicLower.includes('ex-') || topicLower.includes('former')) {
    related.push('ex', 'former', 'previous', 'past relationship');
  }

  // Death/loss patterns
  if (
    topicLower.includes('passed') ||
    topicLower.includes('died') ||
    topicLower.includes('death')
  ) {
    related.push('passed away', 'death', 'funeral', 'gone');
  }

  // Family patterns
  if (topicLower.includes('father') || topicLower.includes('dad')) {
    related.push('father', 'dad', 'daddy', 'papa');
  }
  if (topicLower.includes('mother') || topicLower.includes('mom')) {
    related.push('mother', 'mom', 'mommy', 'mama');
  }

  return related;
}

/**
 * Apply enforcement result to regenerate response
 */
export function buildRegenerationPrompt(
  originalResponse: string,
  enforcement: TrustEnforcementResult
): string {
  const parts: string[] = ['REGENERATE RESPONSE WITH THE FOLLOWING REQUIREMENTS:', ''];

  if (enforcement.regenerationGuidance) {
    parts.push(enforcement.regenerationGuidance);
    parts.push('');
  }

  if (enforcement.mustAddress.length > 0) {
    parts.push('MUST ADDRESS:');
    for (const item of enforcement.mustAddress) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (enforcement.mustNotMention.length > 0) {
    parts.push('DO NOT MENTION:');
    for (const item of enforcement.mustNotMention) {
      parts.push(`- ${item}`);
    }
    parts.push('');
  }

  if (enforcement.phraseToUse) {
    parts.push(`USE THIS PHRASE: "${enforcement.phraseToUse}"`);
    parts.push('');
  }

  if (enforcement.requiredTone) {
    parts.push(`REQUIRED TONE: ${enforcement.requiredTone}`);
    parts.push('');
  }

  parts.push('ORIGINAL RESPONSE (needs improvement):');
  parts.push(originalResponse);

  return parts.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  enforceTrustContext,
  buildRegenerationPrompt,
};
