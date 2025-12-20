/**
 * Trust Systems → Outreach Bridge
 *
 * Connects all "better than human" trust-building systems to proactive outreach.
 *
 * This is where the magic happens:
 * - "I noticed you've been avoiding talking about work..."
 * - "Hey! How did that interview go?"
 * - "That thing you were celebrating? Still riding that high?"
 * - "I know Mondays are tough for you - just checking in"
 *
 * @module services/outreach/trust-outreach-bridge
 */

import { createLogger } from '../../utils/safe-logger.js';
import { isOutreachTriggerCreationEnabled } from '../../config/feature-flags.js';
import {
  publishOutreachTrigger,
  type OutreachTriggerPayload,
} from './trigger-publisher.js';
import type { OutreachPriority, OutreachTriggerType } from './decision-engine.js';

// Trust Systems imports
import {
  getDueMoments,
  generateThinkingOfYouMoments,
  generateRandomWarmth,
  markMomentSent,
  type ThinkingOfYouMoment,
} from '../trust-systems/thinking-of-you.js';

import {
  getUncelebratedWins,
  generateCelebration,
  type SmallWin,
  type CelebrationOpportunity,
} from '../trust-systems/small-wins.js';

import {
  getUnreflectedGrowth,
  generateGrowthReflection,
  type GrowthPattern,
  type GrowthReflection,
} from '../trust-systems/growth-reflection.js';

import {
  detectUnsaidSignals,
  getAvoidedTopics,
  type UnsaidSignal,
} from '../trust-systems/reading-between-lines.js';

import { getProactiveRememberWhen, type SongCallback } from '../trust-systems/our-songs.js';

import {
  getOverdueIntentions,
  getPendingIntentions,
  generateIntentionFollowUp,
  type PendingIntention,
} from '../trust-systems/small-wins.js';

import { checkBoundary, getActiveBoundaries, type BoundaryCheckResult } from '../trust-systems/boundary-memory.js';

// Life Rhythm integration
import { evaluateLifeRhythmOutreach, triggerLifeRhythmOutreach } from './life-rhythm-outreach.js';

// Superhuman memory integration
import { checkForMemoryBasedOutreach, syncMemoriesToOutreachContext } from './superhuman-outreach-integration.js';

const log = createLogger({ module: 'TrustOutreachBridge' });

// ============================================================================
// TYPES
// ============================================================================

export interface TrustOutreachEvaluationResult {
  /** Number of triggers created */
  triggersCreated: number;
  /** Types of triggers created */
  triggerTypes: string[];
  /** Reasons skipped */
  skipped: Array<{ reason: string; type: string }>;
}

export interface ConcernOutreachContext {
  userId: string;
  concernLevel: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis';
  concernType: string;
  lastMessage: string;
  detectedEmotion?: string;
  voiceStrain?: number;
}

// ============================================================================
// MAIN EVALUATION FUNCTION
// ============================================================================

/**
 * Evaluate all trust systems for outreach opportunities
 *
 * Called after each session or periodically for all users.
 * This is the main entry point for trust-based outreach.
 */
export async function evaluateTrustBasedOutreach(
  userId: string,
  sessionId?: string
): Promise<TrustOutreachEvaluationResult> {
  const result: TrustOutreachEvaluationResult = {
    triggersCreated: 0,
    triggerTypes: [],
    skipped: [],
  };

  // Check feature flag before creating any triggers
  if (!isOutreachTriggerCreationEnabled()) {
    log.debug({ userId }, 'Outreach trigger creation disabled via feature flag');
    return result;
  }

  // Skip test users
  if (userId.startsWith('e2e-test') || userId.startsWith('test-') || userId.includes('-test-')) {
    log.debug({ userId }, 'Skipping trust-based outreach for test user');
    return result;
  }

  log.debug({ userId }, '🧠 Evaluating trust-based outreach opportunities');

  try {
    // 1. Check "Thinking of You" moments
    await processThinkingOfYouMoments(userId, result);

    // 2. Check uncelebrated wins
    await processUncelebratedWins(userId, result);

    // 3. Check unreflected growth
    await processUnreflectedGrowth(userId, result);

    // 4. Check overdue intentions
    await processOverdueIntentions(userId, result);

    // 5. Check "Our Songs" memories
    await processOurSongsMemories(userId, result);

    // 6. Check life rhythm predictions
    await processLifeRhythmPredictions(userId, result);

    // 7. Sync superhuman memory to outreach context
    if (sessionId) {
      await syncMemoriesToOutreachContext(userId, sessionId);

      // Check for memory-based triggers
      const memoryTriggers = await checkForMemoryBasedOutreach(userId, sessionId);
      for (const trigger of memoryTriggers) {
        const published = await publishOutreachTrigger({
          userId,
          type: mapTriggerType(trigger.type),
          priority: trigger.priority,
          reason: trigger.reason,
          personaId: 'ferni',
          context: {
            metadata: {
              suggestedMessage: trigger.suggestedMessage,
              source: trigger.source,
            },
          },
        });

        if (published.success) {
          result.triggersCreated++;
          result.triggerTypes.push(trigger.type);
        }
      }
    }

    log.info(
      {
        userId,
        triggersCreated: result.triggersCreated,
        types: result.triggerTypes,
      },
      '🧠 Trust-based outreach evaluation complete'
    );
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Error evaluating trust-based outreach');
  }

  return result;
}

// ============================================================================
// THINKING OF YOU PROCESSING
// ============================================================================

async function processThinkingOfYouMoments(
  userId: string,
  result: TrustOutreachEvaluationResult
): Promise<void> {
  // Generate any new moments
  generateThinkingOfYouMoments(userId);

  // Get moments that are due
  const dueMoments = getDueMoments(userId);

  for (const moment of dueMoments) {
    // Check boundaries before sending
    const boundaries = getActiveBoundaries(userId);
    const underlying = moment.trigger.context || '';

    // Skip if this would violate a boundary
    const hasBoundaryIssue = boundaries.some(
      (b) => underlying.toLowerCase().includes(b.topic.toLowerCase())
    );

    if (hasBoundaryIssue) {
      result.skipped.push({
        reason: 'Would violate boundary',
        type: 'thinking_of_you',
      });
      continue;
    }

    const published = await publishOutreachTrigger({
      userId,
      type: 'thinking_of_you',
      priority: moment.priority,
      reason: `Thinking of you: ${moment.type}`,
      personaId: 'ferni',
      context: {
        metadata: {
          message: moment.message,
          ssml: moment.ssml,
          momentType: moment.type,
          triggerType: moment.trigger.type,
          theirWords: moment.trigger.theirWords,
        },
      },
    });

    if (published.success) {
      markMomentSent(userId, moment.id);
      result.triggersCreated++;
      result.triggerTypes.push('thinking_of_you');
    }
  }

  // Possibly generate random warmth
  const randomWarmth = generateRandomWarmth(userId);
  if (randomWarmth) {
    const published = await publishOutreachTrigger({
      userId,
      type: 'thinking_of_you',
      priority: 'low',
      reason: 'Random warmth check-in',
      personaId: 'ferni',
      context: {
        metadata: {
          message: randomWarmth.message,
          ssml: randomWarmth.ssml,
          momentType: 'random_warmth',
        },
      },
    });

    if (published.success) {
      markMomentSent(userId, randomWarmth.id);
      result.triggersCreated++;
      result.triggerTypes.push('random_warmth');
    }
  }
}

// ============================================================================
// SMALL WINS PROCESSING
// ============================================================================

async function processUncelebratedWins(
  userId: string,
  result: TrustOutreachEvaluationResult
): Promise<void> {
  const uncelebrated = getUncelebratedWins(userId);

  for (const win of uncelebrated) {
    // Generate celebration for this specific win
    const celebration = generateCelebration(userId, win);
    if (!celebration) continue;

    // Determine priority based on intensity
    const priority: OutreachPriority = celebration.intensity === 'big' ? 'high' : 'medium';

    const published = await publishOutreachTrigger({
      userId,
      type: 'celebration',
      priority,
      reason: `Celebrate: ${celebration.win.description}`,
      personaId: 'ferni',
      context: {
        metadata: {
          winId: celebration.win.id,
          winDescription: celebration.win.description,
          winType: celebration.win.type,
          intensity: celebration.intensity,
          celebration: celebration.celebration,
          ssml: celebration.ssml,
        },
      },
    });

    if (published.success) {
      result.triggersCreated++;
      result.triggerTypes.push('celebration');
    }
  }
}

// ============================================================================
// GROWTH REFLECTION PROCESSING
// ============================================================================

async function processUnreflectedGrowth(
  userId: string,
  result: TrustOutreachEvaluationResult
): Promise<void> {
  const unreflected = getUnreflectedGrowth(userId);

  // If there are unreflected growth patterns, try to generate a reflection
  if (unreflected.length === 0) return;

  // generateGrowthReflection picks the best unreflected pattern internally
  const reflection = generateGrowthReflection(userId);
  if (!reflection) return;

  const growth = reflection.pattern; // The pattern is embedded in the reflection

  const published = await publishOutreachTrigger({
    userId,
    type: 'growth_reflection' as OutreachTriggerType,
    priority: 'medium',
    reason: `Growth reflection: ${growth.type}`,
    personaId: 'ferni',
    context: {
      metadata: {
        growthId: growth.id,
        growthType: growth.type,
        beforePattern: growth.before.pattern,
        reflection: reflection.reflection,
        timing: reflection.timing,
        ssml: reflection.ssml,
      },
    },
  });

  if (published.success) {
    result.triggersCreated++;
    result.triggerTypes.push('growth_reflection');
  }
}

// ============================================================================
// OVERDUE INTENTIONS PROCESSING
// ============================================================================

async function processOverdueIntentions(
  userId: string,
  result: TrustOutreachEvaluationResult
): Promise<void> {
  const overdue = getOverdueIntentions(userId);

  for (const intention of overdue) {
    // generateIntentionFollowUp just takes the intention
    const followUp = generateIntentionFollowUp(intention);

    // Check if this intention is related to a boundary
    const boundaries = getActiveBoundaries(userId);
    const wouldViolateBoundary = boundaries.some(
      (b) => intention.intention.toLowerCase().includes(b.topic.toLowerCase())
    );

    if (wouldViolateBoundary) {
      result.skipped.push({
        reason: 'Intention touches boundary topic',
        type: 'intention_followup',
      });
      continue;
    }

    // Calculate days overdue
    const targetTime = intention.targetTime || intention.statedAt;
    const daysOverdue = Math.floor(
      (Date.now() - new Date(targetTime).getTime()) / (1000 * 60 * 60 * 24)
    );

    const priority: OutreachPriority = daysOverdue > 7 ? 'high' : 'medium';

    const published = await publishOutreachTrigger({
      userId,
      type: 'commitment_check',
      priority,
      reason: `Follow up on intention: ${intention.intention}`,
      personaId: 'maya', // Maya handles habits and intentions
      context: {
        commitment: intention.intention,
        metadata: {
          intentionId: intention.id,
          daysOverdue,
          question: followUp.question,
          tone: followUp.tone,
          ssml: followUp.ssml,
        },
      },
    });

    if (published.success) {
      result.triggersCreated++;
      result.triggerTypes.push('intention_followup');
    }
  }
}

// ============================================================================
// OUR SONGS MEMORIES
// ============================================================================

async function processOurSongsMemories(
  userId: string,
  result: TrustOutreachEvaluationResult
): Promise<void> {
  const songCallback = getProactiveRememberWhen(userId);
  if (!songCallback) return;

  const published = await publishOutreachTrigger({
    userId,
    type: 'thinking_of_you',
    priority: 'low',
    reason: 'Shared musical memory callback',
    personaId: 'ferni',
    context: {
      metadata: {
        message: songCallback.phrase,
        ssml: songCallback.ssml,
        timing: songCallback.timing,
        songName: songCallback.memory.song.name,
        songArtist: songCallback.memory.song.artist,
        momentType: songCallback.memory.moment.type,
      },
    },
  });

  if (published.success) {
    result.triggersCreated++;
    result.triggerTypes.push('shared_memory');
  }
}

// ============================================================================
// LIFE RHYTHM PREDICTIONS
// ============================================================================

async function processLifeRhythmPredictions(
  userId: string,
  result: TrustOutreachEvaluationResult
): Promise<void> {
  const evaluation = evaluateLifeRhythmOutreach(userId);

  if (evaluation.triggered && evaluation.prediction) {
    const success = await triggerLifeRhythmOutreach(userId, evaluation.prediction);

    if (success) {
      result.triggersCreated++;
      result.triggerTypes.push('life_rhythm_prediction');
    }
  } else if (evaluation.reason) {
    result.skipped.push({
      reason: evaluation.reason,
      type: 'life_rhythm',
    });
  }
}

// ============================================================================
// CONCERN DETECTION → OUTREACH
// ============================================================================

/**
 * Handle concern detection from conversation or voice analysis
 *
 * When we detect someone is struggling, don't wait - reach out with care.
 */
export async function handleConcernDetection(context: ConcernOutreachContext): Promise<boolean> {
  const { userId, concernLevel, concernType, lastMessage, detectedEmotion } = context;

  // Only trigger outreach for moderate+ concern
  if (concernLevel === 'none' || concernLevel === 'mild') {
    return false;
  }

  // Check "reading between lines" for additional signals
  const unsaidSignals = detectUnsaidSignals(userId, lastMessage, {
    detectedEmotion,
    emotionIntensity: concernLevel === 'crisis' ? 1.0 : concernLevel === 'elevated' ? 0.8 : 0.6,
  });

  // Look for minimizing or false closure
  const significantSignal = unsaidSignals.find(
    (s) =>
      s.type === 'minimizing_pain' ||
      s.type === 'false_closure' ||
      s.type === 'emotional_mismatch'
  );

  // Calculate priority
  const priority: OutreachPriority =
    concernLevel === 'crisis' ? 'urgent' : concernLevel === 'elevated' ? 'high' : 'medium';

  // Schedule for next day at a good time (10am)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(10, 0, 0, 0);

  // Build reason with intelligence
  let reason = `Concern detected: ${concernType}`;
  if (significantSignal) {
    reason += ` (${significantSignal.type}: ${significantSignal.observation})`;
  }

  // Build suggested message based on what we detected
  let suggestedMessage = "Hey, I've been thinking about you. How are you doing?";

  if (significantSignal?.type === 'minimizing_pain') {
    suggestedMessage =
      "I wanted to check in. I know you said things are fine, but I'm here if you want to talk about it.";
  } else if (significantSignal?.type === 'emotional_mismatch') {
    suggestedMessage = "Just reaching out to see how you're really doing. No pressure to talk.";
  } else if (concernLevel === 'crisis') {
    suggestedMessage =
      "Hey. I wanted to reach out and see how you're holding up. I'm here whenever you need me.";
  }

  const published = await publishOutreachTrigger({
    userId,
    type: 'emotional_support',
    priority,
    reason,
    scheduledFor: tomorrow.toISOString(),
    personaId: 'ferni', // Ferni handles emotional support
    context: {
      emotion: detectedEmotion,
      emotionIntensity:
        concernLevel === 'crisis' ? 1.0 : concernLevel === 'elevated' ? 0.8 : 0.6,
      metadata: {
        concernLevel,
        concernType,
        suggestedMessage,
        unsaidSignal: significantSignal
          ? {
              type: significantSignal.type,
              observation: significantSignal.observation,
              approach: significantSignal.approach,
              phrase: significantSignal.phrase,
            }
          : undefined,
      },
    },
  });

  if (published.success) {
    log.info(
      { userId, concernLevel, concernType },
      '💚 Concern-based outreach scheduled'
    );
    return true;
  }

  return false;
}

// ============================================================================
// AVOIDED TOPIC AWARENESS
// ============================================================================

/**
 * Check if a proposed outreach topic should be avoided
 *
 * Uses boundary memory and reading-between-lines to prevent
 * outreach that would make users uncomfortable.
 */
export function shouldAvoidOutreachTopic(userId: string, topic: string): {
  avoid: boolean;
  reason?: string;
} {
  // Check explicit boundaries - needs context argument
  const boundaryCheck = checkBoundary(userId, topic, { userInitiatedTopic: false });
  if (boundaryCheck.crossesBoundary) {
    return {
      avoid: true,
      reason: boundaryCheck.recommendation === 'avoid_completely' 
        ? 'Topic crosses explicit boundary' 
        : 'Topic should be approached carefully',
    };
  }

  // Check avoided topics from reading-between-lines
  // getAvoidedTopics returns string[], not ConversationPattern[]
  const avoidedTopics = getAvoidedTopics(userId);
  const isAvoided = avoidedTopics.some(
    (avoidedTopic) => topic.toLowerCase().includes(avoidedTopic.toLowerCase())
  );

  if (isAvoided) {
    return {
      avoid: true,
      reason: 'User has consistently avoided this topic',
    };
  }

  return { avoid: false };
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Map superhuman trigger types to outreach trigger types
 */
function mapTriggerType(
  superhumanType: 'memory_followup' | 'pattern_acknowledgment' | 'concern_checkin' | 'milestone'
): OutreachTriggerType {
  const mapping: Record<string, OutreachTriggerType> = {
    memory_followup: 'commitment_check',
    pattern_acknowledgment: 'check_in',
    concern_checkin: 'emotional_support',
    milestone: 'celebration',
  };
  return mapping[superhumanType] || 'thinking_of_you';
}

// ============================================================================
// SCHEDULED EVALUATION
// ============================================================================

/**
 * Run trust-based outreach evaluation for a batch of users
 *
 * Called by the daily outreach job.
 */
export async function runTrustBasedOutreachBatch(
  userIds: string[]
): Promise<{
  processed: number;
  totalTriggers: number;
  byType: Record<string, number>;
}> {
  let processed = 0;
  let totalTriggers = 0;
  const byType: Record<string, number> = {};

  for (const userId of userIds) {
    try {
      const result = await evaluateTrustBasedOutreach(userId);
      processed++;
      totalTriggers += result.triggersCreated;

      for (const type of result.triggerTypes) {
        byType[type] = (byType[type] || 0) + 1;
      }
    } catch (error) {
      log.warn({ userId, error: String(error) }, 'Error in batch evaluation');
    }
  }

  log.info(
    { processed, totalTriggers, byType },
    '🧠 Trust-based outreach batch complete'
  );

  return { processed, totalTriggers, byType };
}
