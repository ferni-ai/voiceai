/**
 * Better Than Human - Blind Evaluation System
 *
 * Collects unbiased preference ratings by presenting randomized
 * human vs Ferni responses without revealing which is which.
 *
 * @module services/better-than-human-validation/blind-evaluation
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval } from '../../utils/interval-manager.js';
import type {
  HumanBaselineScenario,
  HumanResponse,
  FerniResponse,
  BlindEvaluation,
  EvaluationRatings,
  ScenarioEvaluationResults,
  BTH_COLLECTIONS,
} from './types.js';

const log = createLogger({ module: 'BTHBlindEvaluation' });

// ============================================================================
// EVALUATION SESSION MANAGEMENT
// ============================================================================

interface EvaluationSession {
  sessionId: string;
  evaluatorId: string;
  scenarioId: string;
  responseASource: 'human' | 'ferni';
  responseA: string;
  responseB: string;
  humanResponseId: string;
  ferniResponseId: string;
  startedAt: Date;
  expiresAt: Date;
}

// In-memory session store (production would use Redis)
const activeSessions = new Map<string, EvaluationSession>();

// Session TTL: 30 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;

/**
 * Create a blind evaluation session for a scenario.
 *
 * Randomly assigns human/Ferni responses to A/B positions.
 */
export async function createBlindEvaluationSession(params: {
  evaluatorId: string;
  scenarioId: string;
}): Promise<{
  sessionId: string;
  scenario: string;
  context?: string;
  responseA: string;
  responseB: string;
} | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.warn('Firestore not available for blind evaluation');
      return null;
    }

    // Fetch scenario
    const scenarioDoc = await db.collection('bth_scenarios').doc(params.scenarioId).get();

    if (!scenarioDoc.exists) {
      log.warn({ scenarioId: params.scenarioId }, 'Scenario not found');
      return null;
    }

    const scenario = scenarioDoc.data() as HumanBaselineScenario;

    // Need at least one human response and one Ferni response
    if (!scenario.humanResponses?.length || !scenario.ferniResponse) {
      log.warn({ scenarioId: params.scenarioId }, 'Scenario missing human or Ferni responses');
      return null;
    }

    // Select a random human response for comparison
    const humanResponse =
      scenario.humanResponses[Math.floor(Math.random() * scenario.humanResponses.length)];

    // Randomly decide which goes in position A
    const showFerniAsA = Math.random() < 0.5;

    const sessionId = `eval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date();

    const session: EvaluationSession = {
      sessionId,
      evaluatorId: params.evaluatorId,
      scenarioId: params.scenarioId,
      responseASource: showFerniAsA ? 'ferni' : 'human',
      responseA: showFerniAsA ? scenario.ferniResponse.response : humanResponse.response,
      responseB: showFerniAsA ? humanResponse.response : scenario.ferniResponse.response,
      humanResponseId: humanResponse.id,
      ferniResponseId: scenario.ferniResponse.id,
      startedAt: now,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    };

    activeSessions.set(sessionId, session);

    // Format context if available
    let contextStr: string | undefined;
    if (scenario.scenario.context?.previousMessages?.length) {
      contextStr = scenario.scenario.context.previousMessages
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');
    }

    log.debug(
      {
        sessionId,
        evaluatorId: params.evaluatorId,
        scenarioId: params.scenarioId,
        ferniAsA: showFerniAsA,
      },
      'Created blind evaluation session'
    );

    return {
      sessionId,
      scenario: scenario.scenario.userMessage,
      context: contextStr,
      responseA: session.responseA,
      responseB: session.responseB,
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create evaluation session');
    return null;
  }
}

/**
 * Submit a completed blind evaluation.
 */
export async function submitBlindEvaluation(params: {
  sessionId: string;
  responseARatings: EvaluationRatings;
  responseBRatings: EvaluationRatings;
  preferredResponse: 'A' | 'B' | 'no_preference';
  feedback?: string;
  evaluatorConfidence: number;
}): Promise<{ success: boolean; evaluationId?: string; error?: string }> {
  const session = activeSessions.get(params.sessionId);

  if (!session) {
    return { success: false, error: 'Session not found or expired' };
  }

  // Check expiration
  if (new Date() > session.expiresAt) {
    activeSessions.delete(params.sessionId);
    return { success: false, error: 'Session expired' };
  }

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    const evaluationId = `eval_result_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const evaluation: BlindEvaluation = {
      id: evaluationId,
      scenarioId: session.scenarioId,
      evaluatorId: session.evaluatorId,
      evaluatedAt: new Date(),
      responseASource: session.responseASource,
      responseARatings: params.responseARatings,
      responseBRatings: params.responseBRatings,
      preferredResponse: params.preferredResponse,
      feedback: params.feedback,
      evaluatorConfidence: params.evaluatorConfidence,
    };

    await db
      .collection('bth_evaluations')
      .doc(evaluationId)
      .set({
        ...evaluation,
        evaluatedAt: evaluation.evaluatedAt.toISOString(),
        // Also store response IDs for audit trail
        humanResponseId: session.humanResponseId,
        ferniResponseId: session.ferniResponseId,
      });

    // Clean up session
    activeSessions.delete(params.sessionId);

    log.info(
      {
        evaluationId,
        scenarioId: session.scenarioId,
        preferred: params.preferredResponse,
        ferniWon:
          (session.responseASource === 'ferni' && params.preferredResponse === 'A') ||
          (session.responseASource === 'human' && params.preferredResponse === 'B'),
      },
      'Blind evaluation submitted'
    );

    return { success: true, evaluationId };
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to submit evaluation');
    return { success: false, error: 'Failed to save evaluation' };
  }
}

// ============================================================================
// RESULT AGGREGATION
// ============================================================================

/**
 * Aggregate evaluation results for a scenario.
 */
export async function getScenarioEvaluationResults(
  scenarioId: string
): Promise<ScenarioEvaluationResults | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return null;
    }

    const snapshot = await db
      .collection('bth_evaluations')
      .where('scenarioId', '==', scenarioId)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const evaluations = snapshot.docs.map((doc) => doc.data() as BlindEvaluation);

    // Count preferences
    let ferniPreferred = 0;
    let humanPreferred = 0;
    let noPreference = 0;

    // Aggregate ratings
    const ferniRatingsSum: EvaluationRatings = {
      empathy: 0,
      helpfulness: 0,
      memoryUsage: 0,
      timeliness: 0,
      superhumanFactor: 0,
    };

    const humanRatingsSum: EvaluationRatings = {
      empathy: 0,
      helpfulness: 0,
      memoryUsage: 0,
      timeliness: 0,
      superhumanFactor: 0,
    };

    for (const evaluation of evaluations) {
      // Determine which ratings are Ferni's
      const ferniRatings =
        evaluation.responseASource === 'ferni'
          ? evaluation.responseARatings
          : evaluation.responseBRatings;

      const humanRatings =
        evaluation.responseASource === 'human'
          ? evaluation.responseARatings
          : evaluation.responseBRatings;

      // Sum ratings
      for (const key of Object.keys(ferniRatingsSum) as Array<keyof EvaluationRatings>) {
        ferniRatingsSum[key] += ferniRatings[key];
        humanRatingsSum[key] += humanRatings[key];
      }

      // Count preferences (translate A/B back to source)
      if (evaluation.preferredResponse === 'no_preference') {
        noPreference++;
      } else {
        const preferredSource =
          evaluation.preferredResponse === 'A'
            ? evaluation.responseASource
            : evaluation.responseASource === 'ferni'
              ? 'human'
              : 'ferni';

        if (preferredSource === 'ferni') {
          ferniPreferred++;
        } else {
          humanPreferred++;
        }
      }
    }

    const count = evaluations.length;

    // Calculate averages
    const ferniAverageRatings: EvaluationRatings = {
      empathy: ferniRatingsSum.empathy / count,
      helpfulness: ferniRatingsSum.helpfulness / count,
      memoryUsage: ferniRatingsSum.memoryUsage / count,
      timeliness: ferniRatingsSum.timeliness / count,
      superhumanFactor: ferniRatingsSum.superhumanFactor / count,
    };

    const humanAverageRatings: EvaluationRatings = {
      empathy: humanRatingsSum.empathy / count,
      helpfulness: humanRatingsSum.helpfulness / count,
      memoryUsage: humanRatingsSum.memoryUsage / count,
      timeliness: humanRatingsSum.timeliness / count,
      superhumanFactor: humanRatingsSum.superhumanFactor / count,
    };

    // Calculate deltas
    const ratingDeltas: EvaluationRatings = {
      empathy: ferniAverageRatings.empathy - humanAverageRatings.empathy,
      helpfulness: ferniAverageRatings.helpfulness - humanAverageRatings.helpfulness,
      memoryUsage: ferniAverageRatings.memoryUsage - humanAverageRatings.memoryUsage,
      timeliness: ferniAverageRatings.timeliness - humanAverageRatings.timeliness,
      superhumanFactor: ferniAverageRatings.superhumanFactor - humanAverageRatings.superhumanFactor,
    };

    // Calculate statistical significance (simple chi-squared approximation)
    const totalVotes = ferniPreferred + humanPreferred;
    const expectedIfEqual = totalVotes / 2;
    const chiSquared =
      totalVotes > 0
        ? Math.pow(ferniPreferred - expectedIfEqual, 2) / expectedIfEqual +
          Math.pow(humanPreferred - expectedIfEqual, 2) / expectedIfEqual
        : 0;

    // p < 0.05 requires chi-squared > 3.84 for df=1
    const isSignificant = chiSquared > 3.84 && count >= 10;

    return {
      scenarioId,
      totalEvaluations: count,
      ferniPreferred,
      humanPreferred,
      noPreference,
      ferniPreferenceRate: totalVotes > 0 ? ferniPreferred / totalVotes : 0,
      ferniAverageRatings,
      humanAverageRatings,
      ratingDeltas,
      pValue: chiSquared > 0 ? estimatePValue(chiSquared) : undefined,
      isSignificant,
    };
  } catch (error) {
    log.error({ error: String(error), scenarioId }, 'Failed to aggregate results');
    return null;
  }
}

/**
 * Get aggregate results across all scenarios for a capability.
 */
export async function getCapabilityEvaluationResults(capability: string): Promise<{
  capability: string;
  totalScenarios: number;
  totalEvaluations: number;
  overallFerniPreferenceRate: number;
  significantScenarios: number;
  averageRatingDeltas: EvaluationRatings;
} | null> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return null;
    }

    // Get all scenarios for this capability
    const scenariosSnapshot = await db
      .collection('bth_scenarios')
      .where('expectedCapabilities', 'array-contains', capability)
      .get();

    if (scenariosSnapshot.empty) {
      return null;
    }

    const scenarioIds = scenariosSnapshot.docs.map((doc) => doc.id);

    let totalEvaluations = 0;
    let totalFerniPreferred = 0;
    let totalVotes = 0;
    let significantScenarios = 0;

    const aggregateDeltas: EvaluationRatings = {
      empathy: 0,
      helpfulness: 0,
      memoryUsage: 0,
      timeliness: 0,
      superhumanFactor: 0,
    };

    for (const scenarioId of scenarioIds) {
      const results = await getScenarioEvaluationResults(scenarioId);
      if (results && results.totalEvaluations > 0) {
        totalEvaluations += results.totalEvaluations;
        totalFerniPreferred += results.ferniPreferred;
        totalVotes += results.ferniPreferred + results.humanPreferred;

        if (results.isSignificant) {
          significantScenarios++;
        }

        // Weight deltas by evaluation count
        for (const key of Object.keys(aggregateDeltas) as Array<keyof EvaluationRatings>) {
          aggregateDeltas[key] += results.ratingDeltas[key] * results.totalEvaluations;
        }
      }
    }

    // Calculate weighted averages
    if (totalEvaluations > 0) {
      for (const key of Object.keys(aggregateDeltas) as Array<keyof EvaluationRatings>) {
        aggregateDeltas[key] /= totalEvaluations;
      }
    }

    return {
      capability,
      totalScenarios: scenarioIds.length,
      totalEvaluations,
      overallFerniPreferenceRate: totalVotes > 0 ? totalFerniPreferred / totalVotes : 0,
      significantScenarios,
      averageRatingDeltas: aggregateDeltas,
    };
  } catch (error) {
    log.error({ error: String(error), capability }, 'Failed to get capability results');
    return null;
  }
}

// ============================================================================
// SCENARIO MANAGEMENT
// ============================================================================

/**
 * Get scenarios available for evaluation (have human + Ferni responses).
 */
export async function getAvailableScenarios(options?: {
  capability?: string;
  difficulty?: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    userMessage: string;
    capability: string;
    difficulty: string;
    evaluationCount: number;
  }>
> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return [];
    }

    let query = db.collection('bth_scenarios').where('ferniResponse', '!=', null);

    if (options?.capability) {
      query = query.where('expectedCapabilities', 'array-contains', options.capability);
    }

    if (options?.difficulty) {
      query = query.where('difficulty', '==', options.difficulty);
    }

    const snapshot = await query.limit(options?.limit || 50).get();

    const scenarios: Array<{
      id: string;
      userMessage: string;
      capability: string;
      difficulty: string;
      evaluationCount: number;
    }> = [];

    for (const doc of snapshot.docs) {
      const data = doc.data() as HumanBaselineScenario;

      // Only include scenarios with at least one human response
      if (data.humanResponses?.length > 0) {
        // Get evaluation count for this scenario
        const evalSnapshot = await db
          .collection('bth_evaluations')
          .where('scenarioId', '==', doc.id)
          .count()
          .get();

        scenarios.push({
          id: doc.id,
          userMessage: data.scenario.userMessage,
          capability: data.expectedCapabilities[0] || 'unknown',
          difficulty: data.difficulty,
          evaluationCount: evalSnapshot.data().count,
        });
      }
    }

    // Sort by least evaluated first (prioritize under-evaluated scenarios)
    scenarios.sort((a, b) => a.evaluationCount - b.evaluationCount);

    return scenarios;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get available scenarios');
    return [];
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Rough p-value estimation from chi-squared statistic.
 */
function estimatePValue(chiSquared: number): number {
  // Approximation for df=1
  if (chiSquared < 0.455) return 0.5;
  if (chiSquared < 1.323) return 0.25;
  if (chiSquared < 2.706) return 0.1;
  if (chiSquared < 3.841) return 0.05;
  if (chiSquared < 5.024) return 0.025;
  if (chiSquared < 6.635) return 0.01;
  if (chiSquared < 7.879) return 0.005;
  return 0.001;
}

/**
 * Clean up expired sessions.
 */
export function cleanupExpiredSessions(): number {
  const now = new Date();
  let cleaned = 0;

  for (const [sessionId, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    log.debug({ cleaned }, 'Cleaned up expired evaluation sessions');
  }

  return cleaned;
}

// Run cleanup every 5 minutes (managed interval for proper shutdown)
registerInterval(
  'bth-evaluation-cleanup',
  () => {
    cleanupExpiredSessions();
  },
  5 * 60 * 1000
);
