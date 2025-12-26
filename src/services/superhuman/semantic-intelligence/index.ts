/**
 * Semantic Intelligence System - Better Than Human v3
 *
 * Six new superhuman capabilities that leverage semantic understanding
 * to provide insights no human friend could offer:
 *
 * 1. **Correlation Mining** - Connect dots across domains
 * 2. **Emotional Trajectories** - See journeys, not moments
 * 3. **Relational Semantics** - Know who brings joy vs. drains energy
 * 4. **Counter-Factual Memory** - Learn from paths taken/not taken
 * 5. **Growth Fingerprint** - Show how they've evolved
 * 6. **Cross-Session Threading** - Find hidden connections
 *
 * @module services/superhuman/semantic-intelligence
 */

import { createLogger } from '../../../utils/safe-logger.js';
import {
  correlationMining,
  recordObservation,
  buildCorrelationContext,
  getRelevantCorrelations,
} from './correlation-mining.js';
import {
  emotionalTrajectories,
  recordEmotionalWaypoint,
  buildEmotionalTrajectoryContext,
  getActiveArcs,
} from './emotional-trajectories.js';
import {
  relationalSemantics,
  recordPersonMention,
  buildRelationalContext,
  getImpactfulRelationships,
} from './relational-semantics.js';
import {
  counterfactualMemory,
  recordDecisionPoint,
  buildCounterfactualContext,
  getPendingFollowUps,
} from './counterfactual-memory.js';
import {
  growthFingerprint,
  recordConversationData,
  buildGrowthContext,
  getGrowthFingerprint,
} from './growth-fingerprint.js';
import {
  crossSessionThreading,
  recordMoment,
  buildThreadingContext,
  getUnconsciousConnections,
} from './cross-session-threading.js';
import type { SemanticIntelligenceContext } from './types.js';

// V3.2+ imports
import { insightBroker } from './insight-broker.js';
import { openLoops } from './open-loops.js';
import { ferniCommitments } from './ferni-commitments.js';
import { relationshipGraph } from './relationship-graph.js';
import { temporalPatterns } from './temporal-patterns.js';
import { behavioralIntelligence } from './behavioral-intelligence.js';
import { coachingIntelligence } from './coaching-intelligence.js';
import { selfAwareness } from './self-awareness.js';

const log = createLogger({ module: 'semantic-intelligence' });

// ============================================================================
// RE-EXPORTS
// ============================================================================

// Types
export * from './types.js';

// Individual services
export { correlationMining } from './correlation-mining.js';
export { emotionalTrajectories } from './emotional-trajectories.js';
export { relationalSemantics } from './relational-semantics.js';
export { counterfactualMemory } from './counterfactual-memory.js';
export { growthFingerprint } from './growth-fingerprint.js';
export { crossSessionThreading } from './cross-session-threading.js';

// Integration layer (for turn handler)
export {
  processSemanticIntelligence,
  recordAgentAdvice,
  recordAdviceOutcome,
  detectAdviceOutcome,
  warmupSemanticIntelligence,
  type TurnSemanticData,
  type AgentAdviceContext,
} from './integration.js';

// Advice detection (for response tracking)
export {
  detectAdvice,
  trackAdviceInResponse,
  type AdviceDetectionResult,
} from './advice-detector.js';

// Enhanced person extraction (V3.1)
export {
  extractPersons,
  getPrimaryPerson,
  getPrimaryPersonName,
  type ExtractedPerson,
  type PersonRelationship,
} from './person-extractor.js';

// Semantic advice matching (V3.1)
export {
  findMatchingAdvice,
  precomputeAdviceEmbeddings,
  clearAdviceEmbeddingCache,
  type PastAdvice,
  type AdviceMatch,
} from './advice-matcher.js';

// ============================================================================
// V3.2 PROACTIVE INTELLIGENCE
// ============================================================================

// Insight Broker - proactive surfacing of insights
export {
  insightBroker,
  createInsight,
  getInsightsToSurface,
  markInsightSurfaced,
  dismissInsight,
  getPendingInsightCount,
  formatInsightsForPrompt,
  generateCorrelationInsight,
  generateTrajectoryInsight,
  generateCounterfactualInsight,
  generateGrowthInsight,
  generateThreadingInsight,
  clearInsightCache,
  type ProactiveInsight,
  type InsightSource,
  type InsightPriority,
  type InsightTrigger,
} from './insight-broker.js';

// Open Loops - track things needing follow-up
export {
  openLoops,
  createOpenLoop,
  getLoopsReadyForFollowUp,
  markFollowedUp,
  resolveLoop,
  dismissLoop,
  getAllOpenLoops,
  getLoopsByType,
  detectOpenLoops,
  processUserTextForLoops,
  clearLoopCache,
  type OpenLoop,
  type OpenLoopType,
  type OpenLoopStatus,
} from './open-loops.js';

// Ferni Commitments - track Ferni's promises
export {
  ferniCommitments,
  createCommitment,
  fulfillCommitment,
  checkAvoidanceViolation,
  getPendingCommitments,
  getRememberedThings,
  getAvoidanceTopics,
  getAllCommitments,
  detectCommitmentsInResponse,
  trackCommitmentsInResponse,
  formatCommitmentsForContext,
  clearCommitmentCache,
  type FerniCommitment,
  type CommitmentType,
} from './ferni-commitments.js';

// ============================================================================
// V3.3 RELATIONAL NETWORK
// ============================================================================

export {
  relationshipGraph,
  upsertPerson,
  findPersonByName,
  getAllPeople,
  getPeopleByRelationship,
  getPeopleByImpact,
  getMostMentioned,
  getRecentlyMentioned,
  recordConnection,
  getConnectionsForPerson,
  getConflicts,
  updateSupportScore,
  getTopSupporters,
  getGraphSummary,
  formatGraphForContext,
  clearGraphCache,
  type PersonNode,
  type PersonConnection,
  type RelationshipType,
  type ConnectionType,
  type RelationshipGraphSummary,
} from './relationship-graph.js';

// ============================================================================
// V3.4 TEMPORAL INTELLIGENCE
// ============================================================================

export {
  temporalPatterns,
  recordSnapshot as recordTemporalSnapshot,
  getHourlyPattern,
  getDayPattern,
  getSeasonalPattern,
  getTemporalContext,
  detectAnomaly as detectTemporalAnomaly,
  formatTemporalContext,
  clearTemporalCache,
  type HourlyPattern,
  type DayOfWeekPattern,
  type SeasonalPattern,
  type TemporalContext,
  type TemporalSnapshot,
} from './temporal-patterns.js';

// ============================================================================
// V3.5 BEHAVIORAL INTELLIGENCE
// ============================================================================

export {
  behavioralIntelligence,
  recordPotentialSabotage,
  getSabotagePatterns,
  getUnsurfacedPatterns,
  markPatternSurfaced,
  updateBaseline,
  getBaseline,
  checkBaselineDeviation,
  recordTrigger,
  getTriggers,
  checkForTriggers,
  formatBehavioralContext,
  clearBehavioralCache,
  type SelfSabotagePattern,
  type EmotionalBaseline,
  type Trigger,
  type BehavioralCycle,
} from './behavioral-intelligence.js';

// ============================================================================
// V3.6 COACHING INTELLIGENCE
// ============================================================================

export {
  coachingIntelligence,
  recordAdviceOutcome as recordCoachingOutcome,
  getEffectivenessProfile,
  getBestApproach,
  detectLearningStyleFromText,
  updateLearningStyle,
  getLearningStyle,
  recordDeflection,
  recordPushback,
  getResistancePattern,
  isTopicSensitive,
  getCoachingRecommendations,
  formatCoachingContext,
  clearCoachingCache,
  type AdviceEffectivenessProfile,
  type LearningStyle,
  type ResistancePattern,
  type CoachingRecommendation,
} from './coaching-intelligence.js';

// ============================================================================
// V3.7 SELF-AWARENESS INTELLIGENCE
// ============================================================================

export {
  selfAwareness,
  recordBlindSpotEvidence,
  getBlindSpots,
  getUnsurfacedBlindSpots,
  markBlindSpotSurfaced,
  recordSelfPerception,
  recordBehavior,
  getGaps,
  recordStatedValue,
  recordValueBehavior,
  getValuesAlignment,
  getMisalignedValues,
  detectDistortions,
  recordDistortions,
  getDistortionProfile,
  formatSelfAwarenessContext,
  clearSelfAwarenessCache,
  type BlindSpot,
  type SelfPerceptionGap,
  type ValuesBehaviorAlignment,
  type CognitiveDistortionProfile,
  type CognitiveDistortion,
} from './self-awareness.js';

// ============================================================================
// UNIFIED RECORDING
// ============================================================================

/**
 * Record a conversation turn for all semantic intelligence systems.
 *
 * This is the main entry point - call this after each meaningful
 * user turn to feed all six systems.
 */
export async function recordSemanticData(
  userId: string,
  data: {
    // Content
    content: string;
    topics?: string[];

    // Emotional context
    emotion?: string;
    emotionIntensity?: number;
    emotionValence?: number;

    // Person mentioned
    personMentioned?: string;
    personRelationship?: string;
    personSentiment?: number;

    // Advice/decision
    adviceGiven?: string;
    adviceContext?: string;

    // Cognitive signals
    cognitivePattern?: 'problem_solving' | 'catastrophizing' | 'growth' | 'self_compassion';

    // Significance
    significance?: 'low' | 'medium' | 'high';
  }
): Promise<void> {
  const {
    content,
    topics,
    emotion,
    emotionIntensity,
    emotionValence,
    personMentioned,
    personRelationship,
    personSentiment,
    adviceGiven,
    adviceContext,
    cognitivePattern,
    significance = 'medium',
  } = data;

  // Skip low significance data
  if (significance === 'low' && !personMentioned && !adviceGiven) {
    return;
  }

  try {
    // 1. Correlation Mining - record observations from various domains
    const correlationPromises: Promise<void>[] = [];

    if (emotion) {
      correlationPromises.push(
        recordObservation(userId, {
          domain: 'emotion',
          pattern: emotion,
          context: content.slice(0, 100),
        })
      );
    }

    if (topics && topics.length > 0) {
      for (const topic of topics.slice(0, 3)) {
        correlationPromises.push(
          recordObservation(userId, {
            domain: 'topic',
            pattern: topic,
            context: content.slice(0, 100),
          })
        );
      }
    }

    if (personMentioned) {
      correlationPromises.push(
        recordObservation(userId, {
          domain: 'person',
          pattern: personMentioned,
          context: content.slice(0, 100),
        })
      );
    }

    // 2. Emotional Trajectories - record waypoints
    if (emotion && emotionIntensity !== undefined) {
      correlationPromises.push(
        recordEmotionalWaypoint(userId, {
          emotion,
          intensity: emotionIntensity,
          valence: emotionValence ?? 0,
          context: content.slice(0, 100),
          trigger: topics?.[0],
        }).then(() => {})
      );
    }

    // 3. Relational Semantics - record person mentions
    if (personMentioned) {
      correlationPromises.push(
        recordPersonMention(userId, {
          name: personMentioned,
          relationship: personRelationship,
          context: content.slice(0, 100),
          emotion,
          sentiment: personSentiment,
          topics,
        }).then(() => {})
      );
    }

    // 4. Counter-Factual Memory - record advice
    if (adviceGiven) {
      correlationPromises.push(
        recordDecisionPoint(userId, {
          advice: adviceGiven,
          context: adviceContext || content.slice(0, 200),
        }).then(() => {})
      );
    }

    // 5. Growth Fingerprint - record conversation data
    correlationPromises.push(
      recordConversationData(userId, {
        topics,
        emotion,
        messageText: content,
        cognitivePattern,
      })
    );

    // 6. Cross-Session Threading - record significant moments
    if (significance !== 'low') {
      correlationPromises.push(
        recordMoment(userId, {
          content,
          emotion,
          topic: topics?.[0],
          significance,
        }).then(() => {})
      );
    }

    // Execute all in parallel
    await Promise.all(correlationPromises);

    log.debug(
      { userId, hasEmotion: !!emotion, hasPerson: !!personMentioned },
      '🧠 Semantic data recorded'
    );
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to record semantic data');
  }
}

// ============================================================================
// UNIFIED CONTEXT BUILDING
// ============================================================================

/**
 * Build complete semantic intelligence context for LLM injection.
 *
 * Use this to get all relevant semantic insights for the current
 * conversation context.
 */
export async function buildSemanticIntelligenceContext(
  userId: string,
  currentContext?: {
    content?: string;
    topics?: string[];
    emotion?: string;
    personMentioned?: string;
  }
): Promise<SemanticIntelligenceContext> {
  const context: SemanticIntelligenceContext = {
    activeCorrelations: [],
    emotionalArcs: [],
    relationalInsights: [],
    relevantPatterns: [],
    growthContext: '',
    hiddenConnections: [],
  };

  try {
    // Build all contexts in parallel
    const [
      correlationCtx,
      trajectoryCtx,
      relationalCtx,
      counterfactualCtx,
      growthCtx,
      threadingCtx,
    ] = await Promise.all([
      buildCorrelationContext(userId, {
        currentTopics: currentContext?.topics,
        currentEmotion: currentContext?.emotion,
        currentPerson: currentContext?.personMentioned,
      }),
      buildEmotionalTrajectoryContext(userId, {
        emotion: currentContext?.emotion,
        topic: currentContext?.topics?.[0],
      }),
      buildRelationalContext(userId, {
        mentionedPerson: currentContext?.personMentioned,
        currentEmotion: currentContext?.emotion,
        currentTopic: currentContext?.topics?.[0],
      }),
      buildCounterfactualContext(userId, {
        topic: currentContext?.topics?.[0],
        situation: currentContext?.content,
      }),
      buildGrowthContext(userId),
      buildThreadingContext(userId, {
        content: currentContext?.content,
        topic: currentContext?.topics?.[0],
      }),
    ]);

    // Populate context
    if (correlationCtx) context.activeCorrelations = [correlationCtx];
    if (trajectoryCtx) context.emotionalArcs = [trajectoryCtx];
    if (relationalCtx) context.relationalInsights = [relationalCtx];
    if (counterfactualCtx) context.relevantPatterns = [counterfactualCtx];
    if (growthCtx) context.growthContext = growthCtx;
    if (threadingCtx) context.hiddenConnections = [threadingCtx];
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build semantic context');
  }

  return context;
}

/**
 * Format semantic intelligence context as a single string for LLM injection.
 */
export function formatSemanticIntelligenceContext(
  context: SemanticIntelligenceContext
): string {
  const sections: string[] = [];

  // Only include non-empty sections
  const allSections = [
    ...context.activeCorrelations,
    ...context.emotionalArcs,
    ...context.relationalInsights,
    ...context.relevantPatterns,
    context.growthContext,
    ...context.hiddenConnections,
  ].filter((s) => s && s.length > 0);

  if (allSections.length === 0) {
    return '';
  }

  sections.push('═══════════════════════════════════════════════════════════');
  sections.push('SEMANTIC INTELLIGENCE - Better Than Human v3');
  sections.push('═══════════════════════════════════════════════════════════');
  sections.push('');
  sections.push(...allSections);
  sections.push('');
  sections.push('═══════════════════════════════════════════════════════════');

  return sections.join('\n');
}

// ============================================================================
// QUICK ACCESS FUNCTIONS
// ============================================================================

/**
 * Get a quick summary of semantic intelligence state for a user.
 */
export async function getSemanticIntelligenceSummary(
  userId: string
): Promise<{
  correlationCount: number;
  activeArcs: number;
  trackedPeople: number;
  pendingDecisions: number;
  growthWeeks: number;
  hiddenThreads: number;
}> {
  const [correlations, arcs, relationships, pending, fingerprint, threads] =
    await Promise.all([
      getRelevantCorrelations(userId, {}),
      getActiveArcs(userId),
      getImpactfulRelationships(userId),
      getPendingFollowUps(userId),
      getGrowthFingerprint(userId),
      getUnconsciousConnections(userId),
    ]);

  return {
    correlationCount: correlations.length,
    activeArcs: arcs.length,
    trackedPeople:
      (relationships.energizing.length || 0) + (relationships.draining.length || 0),
    pendingDecisions: pending.length,
    growthWeeks: fingerprint?.snapshots.length || 0,
    hiddenThreads: threads.length,
  };
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Clear all semantic intelligence caches for a user.
 */
export function clearSemanticIntelligenceCache(userId?: string): void {
  // V3 Core
  correlationMining.clearCache(userId);
  emotionalTrajectories.clearCache(userId);
  relationalSemantics.clearCache(userId);
  counterfactualMemory.clearCache(userId);
  growthFingerprint.clearCache(userId);
  crossSessionThreading.clearCache(userId);
  
  // V3.2 Proactive Intelligence
  insightBroker.clearCache(userId);
  openLoops.clearCache(userId);
  ferniCommitments.clearCache(userId);
  
  // V3.3 Relational Network
  relationshipGraph.clearCache(userId);
  
  // V3.4 Temporal Intelligence
  temporalPatterns.clearCache(userId);
  
  // V3.5 Behavioral Intelligence
  behavioralIntelligence.clearCache(userId);
  
  // V3.6 Coaching Intelligence
  coachingIntelligence.clearCache(userId);
  
  // V3.7 Self-Awareness
  selfAwareness.clearCache(userId);

  log.debug({ userId: userId || 'all' }, '🧹 Semantic intelligence cache cleared');
}

// ============================================================================
// DEFAULT EXPORT
// ============================================================================

export const semanticIntelligence = {
  // Unified recording
  record: recordSemanticData,

  // Context building
  buildContext: buildSemanticIntelligenceContext,
  formatContext: formatSemanticIntelligenceContext,

  // Quick access
  getSummary: getSemanticIntelligenceSummary,

  // Cache management
  clearCache: clearSemanticIntelligenceCache,

  // Individual services
  correlations: correlationMining,
  trajectories: emotionalTrajectories,
  relationships: relationalSemantics,
  counterfactual: counterfactualMemory,
  growth: growthFingerprint,
  threading: crossSessionThreading,
};

export default semanticIntelligence;

