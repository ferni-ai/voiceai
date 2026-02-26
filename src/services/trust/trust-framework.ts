/**
 * Trust Framework
 *
 * Unified trust context for a conversation turn. Coordinates all trust
 * subsystems to build a complete picture of the user's emotional state,
 * boundaries, growth, and relationship health.
 *
 * Extracted from trust-systems/index.ts to serve as the bounded context
 * entry point for trust operations.
 *
 * @module trust/TrustFramework
 */

import {
  detectUnsaidSignals,
  getAvoidedTopics,
  recordDeflectionPattern,
  buildDeflectionContext,
  type UnsaidSignal,
} from './reading-between-lines.js';

import {
  buildProtectiveMemoryContext,
  checkBoundary,
  detectNewBoundary,
  type BoundaryCheckResult,
} from '../trust-systems/boundary-memory.js';

import {
  generateGrowthReflection,
  recordResponse,
  type GrowthReflection,
} from '../trust-systems/growth-reflection.js';

import {
  detectCallbackMoment,
  findCallbackOpportunity,
  type CallbackOpportunity,
} from '../trust-systems/inside-jokes.js';

import {
  detectIntention,
  detectSmallWin,
  generateCelebration,
  type CelebrationOpportunity,
} from '../trust-systems/small-wins.js';

import {
  detectSignificantShare,
  getDueMoments,
  type ThinkingOfYouMoment,
} from '../trust-systems/thinking-of-you.js';

import {
  detectFirstTimeVulnerability,
  recordVulnerabilityShare,
  type FirstTimeVulnerabilityResult,
} from '../trust-systems/first-time-vulnerability.js';

import { buildLinguisticContext, recordLinguisticPatterns } from '../trust-systems/linguistic-mirroring.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Unified trust context for a conversation turn
 */
export interface TrustContext {
  unsaidSignals: UnsaidSignal[];
  boundaryCheck: BoundaryCheckResult | null;
  growthReflection: GrowthReflection | null;
  callbackOpportunity: CallbackOpportunity | null;
  celebrationOpportunity: CelebrationOpportunity | null;
  pendingOutreach: ThinkingOfYouMoment[];
  topicsToAvoid: string[];
  firstTimeVulnerability: FirstTimeVulnerabilityResult | null;
  linguisticContext: string;
  protectiveMemory: string;
  deflectionContext: string;
}

// ============================================================================
// CONTEXT BUILDERS
// ============================================================================

/**
 * Build complete trust context for a conversation turn
 */
export function buildTrustContext(
  userId: string,
  userMessage: string,
  context: {
    currentTopic?: string;
    recentTopic?: string;
    detectedEmotion?: string;
    emotionIntensity?: number;
    previousMessages?: string[];
    aiResponse?: string;
  }
): TrustContext {
  // 1. Detect what's not being said
  const unsaidSignals = detectUnsaidSignals(userId, userMessage, {
    recentTopics: context.currentTopic ? [context.currentTopic] : undefined,
    detectedEmotion: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
    previousMessages: context.previousMessages,
    topicBeforeThis: context.recentTopic,
  });

  // 1.5. Record deflection patterns for cross-session tracking
  for (const signal of unsaidSignals) {
    if (signal.type === 'deflection' || signal.type === 'topic_avoidance') {
      recordDeflectionPattern(userId, signal);
    }
  }

  // 2. Check boundaries for AI response
  let boundaryCheck: BoundaryCheckResult | null = null;
  if (context.aiResponse) {
    boundaryCheck = checkBoundary(userId, context.aiResponse, {
      userInitiatedTopic: true,
      currentTopic: context.currentTopic,
    });
  }

  // 3. Detect any new boundaries being established
  detectNewBoundary(userId, userMessage, {
    currentTopic: context.currentTopic,
    recentTopic: context.recentTopic,
    emotionDetected: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
  });

  // 4. Record response for growth tracking
  if (context.currentTopic && context.detectedEmotion) {
    recordResponse(
      userId,
      context.currentTopic,
      userMessage,
      context.detectedEmotion,
      context.currentTopic
    );
  }

  // 5. Check for growth reflection opportunity
  const growthReflection = generateGrowthReflection(userId, {
    currentTopic: context.currentTopic,
    currentEmotion: context.detectedEmotion,
  });

  // 6. Detect callback moments and check for opportunities
  detectCallbackMoment(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
  });

  const callbackOpportunity = findCallbackOpportunity(userId, {
    userMessage,
    topic: context.currentTopic,
  });

  // 7. Detect small wins and intentions
  detectSmallWin(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
  });

  detectIntention(userId, userMessage);
  const celebrationOpportunity = generateCelebration(userId);

  // 8. Detect significant shares for future outreach
  detectSignificantShare(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
    emotionIntensity: context.emotionIntensity,
  });

  const pendingOutreach = getDueMoments(userId);

  // 9. Get topics to avoid
  const topicsToAvoid = getAvoidedTopics(userId);

  // 10. First-time vulnerability detection
  const firstTimeVulnerability = detectFirstTimeVulnerability(userId, userMessage);
  if (firstTimeVulnerability) {
    recordVulnerabilityShare(
      userId,
      firstTimeVulnerability,
      firstTimeVulnerability.suggestedAcknowledgment
    );
  }

  // 11. Record linguistic patterns for mirroring
  recordLinguisticPatterns(userId, userMessage, {
    topic: context.currentTopic,
    emotion: context.detectedEmotion,
  });

  // 12. Build context strings
  const linguisticContext = buildLinguisticContext(userId);
  const protectiveMemory = buildProtectiveMemoryContext(userId);
  const deflectionContext = buildDeflectionContext(userId);

  return {
    unsaidSignals,
    boundaryCheck,
    growthReflection,
    callbackOpportunity,
    celebrationOpportunity,
    pendingOutreach,
    topicsToAvoid,
    firstTimeVulnerability,
    linguisticContext,
    protectiveMemory,
    deflectionContext,
  };
}

/**
 * Check if an AI response is safe to send
 */
export function checkResponseSafety(
  userId: string,
  proposedResponse: string,
  context?: { currentTopic?: string }
): {
  safe: boolean;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const boundaryCheck = checkBoundary(userId, proposedResponse, {
    currentTopic: context?.currentTopic,
  });

  if (boundaryCheck.crossesBoundary) {
    warnings.push(`Response mentions bounded topic: ${boundaryCheck.boundary?.topic}`);
    if (boundaryCheck.carefulApproach) {
      suggestions.push(boundaryCheck.carefulApproach);
    }
  }

  const avoidedTopics = getAvoidedTopics(userId);
  const responseLower = proposedResponse.toLowerCase();

  for (const topic of avoidedTopics) {
    if (responseLower.includes(topic.toLowerCase())) {
      warnings.push(`Response mentions avoided topic: ${topic}`);
    }
  }

  return { safe: warnings.length === 0, warnings, suggestions };
}

export default { buildTrustContext, checkResponseSafety };
