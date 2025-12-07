/**
 * Experiment Integration Service
 *
 * Wires the A/B testing framework from agent-evolution into the conversation flow.
 * This enables persona behavior experiments to actually run and collect data.
 *
 * Integration points:
 * 1. Session start: Assign user to experiment variants
 * 2. Response generation: Apply treatment modifications
 * 3. Session end: Record metrics for experiment analysis
 *
 * @module services/experiment-integration
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getAgentEvolution,
  type PersonaExperiment,
} from '../../intelligence/agent-evolution.js';
import {
  sendExperimentConclusionAlert,
  getBanditVariant,
  recordSegmentMetric,
  type UserProfileForSegment,
} from './advanced.js';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Breakthrough question detected during conversation
 */
export interface BreakthroughQuestion {
  /** The question that led to a breakthrough */
  question: string;
  /** Turn number when asked */
  turnNumber: number;
  /** Engagement score before the question */
  engagementBefore: number;
  /** Engagement score after the question */
  engagementAfter: number;
  /** Calculated lift */
  engagementLift: number;
  /** Topic context */
  topic?: string;
}

/**
 * Per-session experiment state
 */
export interface SessionExperimentState {
  /** User ID for this session */
  userId: string;
  /** Persona ID for this session */
  personaId: string;
  /** Active experiment assignments for this session */
  assignments: Map<string, 'control' | 'treatment'>;
  /** Accumulated metrics for this session */
  metrics: {
    engagementScores: number[];
    satisfactionSignals: ('positive' | 'neutral' | 'negative')[];
    conversationDepth: number;
    turnCount: number;
  };
  /** Detected breakthrough questions */
  breakthroughQuestions: BreakthroughQuestion[];
  /** Recent questions for breakthrough detection */
  recentQuestions: Array<{
    question: string;
    turnNumber: number;
    engagementAtTime: number;
  }>;
  /** User profile for segment analysis */
  userProfile?: UserProfileForSegment;
}

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

const sessionStates = new Map<string, SessionExperimentState>();

/**
 * Initialize experiment state for a new session
 */
export function initializeSessionExperiments(
  sessionId: string,
  userId: string,
  personaId: string
): SessionExperimentState {
  const evolution = getAgentEvolution();
  const assignments = new Map<string, 'control' | 'treatment'>();

  // Get all running experiments for this persona
  const state = evolution.exportState().get(personaId);
  if (state) {
    for (const experiment of state.experiments) {
      if (experiment.status === 'running') {
        // Use Multi-Armed Bandit for variant assignment if enabled
        // Falls back to deterministic hash assignment otherwise
        const variant = getBanditVariant(experiment, userId);
        assignments.set(experiment.id, variant);
        getLogger().info(
          {
            sessionId,
            experimentId: experiment.id,
            variant,
            experimentName: experiment.name,
          },
          '🧪 User assigned to experiment variant'
        );
      }
    }
  }

  const sessionState: SessionExperimentState = {
    userId,
    personaId,
    assignments,
    metrics: {
      engagementScores: [],
      satisfactionSignals: [],
      conversationDepth: 0,
      turnCount: 0,
    },
    breakthroughQuestions: [],
    recentQuestions: [],
  };

  sessionStates.set(sessionId, sessionState);
  return sessionState;
}

/**
 * Set user profile for segment analysis
 */
export function setSessionUserProfile(
  sessionId: string,
  userProfile: Partial<UserProfileForSegment>
): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.userProfile = {
      userId: state.userId,
      totalConversations: userProfile.totalConversations || 0,
      ...userProfile,
    };
  }
}

/**
 * Get experiment state for a session
 */
export function getSessionExperimentState(
  sessionId: string
): SessionExperimentState | undefined {
  return sessionStates.get(sessionId);
}

/**
 * Clean up experiment state for a session
 */
export function cleanupSessionExperiments(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    // Record final metrics to experiments
    recordSessionMetricsToExperiments(sessionId);
    sessionStates.delete(sessionId);
    getLogger().debug({ sessionId }, 'Cleaned up session experiment state');
  }
}

// ============================================================================
// PROMPT MODIFICATION FOR EXPERIMENTS
// ============================================================================

/**
 * Get prompt modifications based on active experiment treatments
 *
 * Call this when building the system prompt to inject experiment-specific
 * behavior modifications.
 *
 * Can look up by either sessionId or userId (for cases where sessionId isn't available)
 */
export function getExperimentPromptModifications(sessionIdOrUserId: string): string {
  // First try direct sessionId lookup
  let state = sessionStates.get(sessionIdOrUserId);

  // If not found, try to find by userId
  if (!state) {
    for (const [, s] of sessionStates) {
      if (s.userId === sessionIdOrUserId) {
        state = s;
        break;
      }
    }
  }

  if (!state || state.assignments.size === 0) {
    return '';
  }

  const evolution = getAgentEvolution();
  const modifications: string[] = [];

  for (const [experimentId, variant] of state.assignments) {
    if (variant === 'treatment') {
      // Find the experiment and get its treatment modification
      const evolutionState = evolution.exportState().get(state.personaId);
      const experiment = evolutionState?.experiments.find((e) => e.id === experimentId);

      if (experiment?.treatment.promptModification) {
        modifications.push(experiment.treatment.promptModification);
      }
    }
  }

  if (modifications.length === 0) {
    return '';
  }

  return `\n[EXPERIMENTAL ADJUSTMENTS - Testing new approaches]\n${modifications.join('\n')}\n`;
}

// ============================================================================
// METRIC RECORDING
// ============================================================================

/**
 * Record an engagement score for the session
 */
export function recordEngagementScore(sessionId: string, score: number): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.metrics.engagementScores.push(score);
    state.metrics.turnCount++;

    // Record to segment analysis if user profile is available
    if (state.userProfile) {
      for (const [experimentId, variant] of state.assignments) {
        recordSegmentMetric(experimentId, variant, score, state.userProfile);
      }
    }

    // Check for breakthrough questions
    detectBreakthroughQuestions(state, score);
  }
}

/**
 * Record a satisfaction signal
 */
export function recordSatisfactionSignal(
  sessionId: string,
  signal: 'positive' | 'neutral' | 'negative'
): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.metrics.satisfactionSignals.push(signal);
  }
}

/**
 * Record a question asked by the agent
 * Used for breakthrough question detection
 */
export function recordAgentQuestion(
  sessionId: string,
  question: string,
  currentEngagement: number
): void {
  const state = sessionStates.get(sessionId);
  if (!state) return;

  // Keep track of recent questions for breakthrough detection
  state.recentQuestions.push({
    question,
    turnNumber: state.metrics.turnCount,
    engagementAtTime: currentEngagement,
  });

  // Keep only last 10 questions
  if (state.recentQuestions.length > 10) {
    state.recentQuestions.shift();
  }
}

/**
 * Record conversation depth (topics explored, follow-ups, etc.)
 */
export function recordConversationDepth(sessionId: string, depth: number): void {
  const state = sessionStates.get(sessionId);
  if (state) {
    state.metrics.conversationDepth = Math.max(state.metrics.conversationDepth, depth);
  }
}

// ============================================================================
// BREAKTHROUGH QUESTION DETECTION
// ============================================================================

/**
 * Detect breakthrough questions by looking for significant engagement lifts
 * after a question was asked
 */
function detectBreakthroughQuestions(
  state: SessionExperimentState,
  currentEngagement: number
): void {
  const BREAKTHROUGH_THRESHOLD = 0.2; // 20% engagement lift

  // Look at questions asked 1-3 turns ago
  for (const q of state.recentQuestions) {
    const turnsSinceQuestion = state.metrics.turnCount - q.turnNumber;

    // Only check questions from 1-3 turns ago that haven't been processed
    if (turnsSinceQuestion >= 1 && turnsSinceQuestion <= 3) {
      const engagementLift = currentEngagement - q.engagementAtTime;

      if (engagementLift >= BREAKTHROUGH_THRESHOLD) {
        // Check if we already recorded this breakthrough
        const alreadyRecorded = state.breakthroughQuestions.some(
          (bq) => bq.question === q.question && bq.turnNumber === q.turnNumber
        );

        if (!alreadyRecorded) {
          const breakthrough: BreakthroughQuestion = {
            question: q.question,
            turnNumber: q.turnNumber,
            engagementBefore: q.engagementAtTime,
            engagementAfter: currentEngagement,
            engagementLift,
          };

          state.breakthroughQuestions.push(breakthrough);

          getLogger().info(
            {
              question: q.question.slice(0, 100),
              engagementLift: `+${(engagementLift * 100).toFixed(1)}%`,
              userId: state.userId,
            },
            '💡 Breakthrough question detected'
          );
        }
      }
    }
  }

  // Clean up old questions (more than 5 turns ago)
  state.recentQuestions = state.recentQuestions.filter(
    (q) => state.metrics.turnCount - q.turnNumber <= 5
  );
}

/**
 * Get breakthrough questions for the session
 */
export function getBreakthroughQuestions(
  sessionId: string
): BreakthroughQuestion[] {
  const state = sessionStates.get(sessionId);
  return state?.breakthroughQuestions || [];
}

// ============================================================================
// EXPERIMENT METRIC SUBMISSION
// ============================================================================

/**
 * Record session metrics to all active experiments
 * Called at session end
 */
function recordSessionMetricsToExperiments(sessionId: string): void {
  const state = sessionStates.get(sessionId);
  if (!state || state.assignments.size === 0) {
    return;
  }

  const evolution = getAgentEvolution();

  // Calculate aggregated metrics
  const avgEngagement =
    state.metrics.engagementScores.length > 0
      ? state.metrics.engagementScores.reduce((a, b) => a + b, 0) /
        state.metrics.engagementScores.length
      : 0.5;

  const positiveSignals = state.metrics.satisfactionSignals.filter(
    (s) => s === 'positive'
  ).length;
  const totalSignals = state.metrics.satisfactionSignals.length;
  const satisfactionRate = totalSignals > 0 ? positiveSignals / totalSignals : 0.5;

  const depthScore = Math.min(1, state.metrics.conversationDepth / 10);

  // Record to each experiment
  for (const [experimentId, variant] of state.assignments) {
    evolution.recordExperimentMetric(experimentId, variant, 'engagement', avgEngagement);
    evolution.recordExperimentMetric(experimentId, variant, 'satisfaction', satisfactionRate);
    evolution.recordExperimentMetric(experimentId, variant, 'depth', depthScore);

    getLogger().debug(
      {
        experimentId,
        variant,
        engagement: avgEngagement.toFixed(2),
        satisfaction: satisfactionRate.toFixed(2),
        depth: depthScore.toFixed(2),
      },
      'Recorded session metrics to experiment'
    );

    // Check if experiment should auto-conclude
    checkExperimentConclusion(experimentId, state.personaId);
  }
}

// ============================================================================
// AUTO-CONCLUSION & STATISTICAL SIGNIFICANCE
// ============================================================================

/**
 * Calculate z-score for comparing two proportions
 * Used to determine statistical significance
 */
function calculateZScore(
  controlMean: number,
  controlN: number,
  treatmentMean: number,
  treatmentN: number
): number {
  if (controlN < 2 || treatmentN < 2) return 0;

  const pooledMean = (controlMean * controlN + treatmentMean * treatmentN) / (controlN + treatmentN);
  const pooledStdErr = Math.sqrt(
    pooledMean * (1 - pooledMean) * (1 / controlN + 1 / treatmentN)
  );

  if (pooledStdErr === 0) return 0;

  return (treatmentMean - controlMean) / pooledStdErr;
}

/**
 * Convert z-score to confidence level (one-tailed)
 */
function zScoreToConfidence(zScore: number): number {
  // Approximation of normal CDF
  const absZ = Math.abs(zScore);

  // Using the approximation for CDF
  const t = 1 / (1 + 0.2316419 * absZ);
  const d = 0.3989423 * Math.exp(-absZ * absZ / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return zScore >= 0 ? 1 - p : p;
}

/**
 * Check if an experiment should auto-conclude based on sample size and significance
 */
function checkExperimentConclusion(experimentId: string, personaId: string): void {
  const evolution = getAgentEvolution();
  const state = evolution.exportState().get(personaId);
  if (!state) return;

  const experiment = state.experiments.find((e) => e.id === experimentId);
  if (!experiment || experiment.status !== 'running') return;

  const { engagement, satisfaction, depth } = experiment.metrics;
  const totalSamples = engagement.controlN + engagement.treatmentN;

  // Check if we have minimum samples
  if (totalSamples < experiment.minimumSampleSize) return;

  // Calculate statistical significance for engagement (primary metric)
  const zScore = calculateZScore(
    engagement.control,
    engagement.controlN,
    engagement.treatment,
    engagement.treatmentN
  );

  const confidence = zScoreToConfidence(Math.abs(zScore));

  // Conclude if we have high confidence (95%) or reached 2x minimum samples
  const CONFIDENCE_THRESHOLD = 0.95;
  const MAX_SAMPLES_MULTIPLIER = 2;

  const shouldConclude =
    confidence >= CONFIDENCE_THRESHOLD ||
    totalSamples >= experiment.minimumSampleSize * MAX_SAMPLES_MULTIPLIER;

  if (shouldConclude) {
    const diff = engagement.treatment - engagement.control;

    // Determine winner
    if (confidence >= CONFIDENCE_THRESHOLD && Math.abs(diff) > 0.02) {
      experiment.winner = diff > 0 ? 'treatment' : 'control';
      experiment.winnerConfidence = confidence;
    } else {
      experiment.winner = 'inconclusive';
      experiment.winnerConfidence = confidence;
    }

    experiment.status = 'concluded';
    experiment.endedAt = new Date();

    getLogger().info(
      {
        experimentId,
        experimentName: experiment.name,
        winner: experiment.winner,
        confidence: `${(confidence * 100).toFixed(1)}%`,
        improvement: `${(diff * 100).toFixed(1)}%`,
        totalSamples,
        controlN: engagement.controlN,
        treatmentN: engagement.treatmentN,
      },
      '🏆 Experiment auto-concluded'
    );

    // Persist to Firestore and send alerts
    void (async () => {
      try {
        const { saveAgentEvolutionToFirestore } = await import('../../intelligence/agent-evolution.js');
        await saveAgentEvolutionToFirestore();
        getLogger().debug({ experimentId }, 'Experiment conclusion persisted to Firestore');

        // Send Slack/Email alerts
        await sendExperimentConclusionAlert(experiment, personaId);
      } catch (error) {
        getLogger().warn({ error: String(error) }, 'Failed to persist/alert experiment conclusion');
      }
    })();
  }
}

// ============================================================================
// EXPERIMENT LIFECYCLE HELPERS
// ============================================================================

/**
 * Start a new persona experiment
 *
 * Example usage:
 * ```typescript
 * startExperiment({
 *   personaId: 'ferni',
 *   name: 'Humor Frequency Test',
 *   hypothesis: 'More frequent humor improves engagement',
 *   trafficAllocation: 0.5,
 *   minimumSampleSize: 100,
 *   control: { description: 'Current humor frequency' },
 *   treatment: {
 *     description: 'Increased humor frequency',
 *     promptModification: 'Add a light touch of humor to most responses when appropriate.',
 *   },
 * });
 * ```
 */
export function startExperiment(config: {
  personaId: string;
  name: string;
  hypothesis: string;
  trafficAllocation: number;
  minimumSampleSize: number;
  control: { description: string; promptModification?: string };
  treatment: { description: string; promptModification?: string };
}): PersonaExperiment {
  const evolution = getAgentEvolution();

  const experiment = evolution.createExperiment(config);

  // Start the experiment immediately
  experiment.status = 'running';
  experiment.startedAt = new Date();

  getLogger().info(
    {
      experimentId: experiment.id,
      personaId: config.personaId,
      name: config.name,
      trafficAllocation: `${config.trafficAllocation * 100}%`,
    },
    '🧪 Experiment started'
  );

  return experiment;
}

/**
 * Get all running experiments for a persona
 */
export function getRunningExperiments(personaId: string): PersonaExperiment[] {
  const evolution = getAgentEvolution();
  const state = evolution.exportState().get(personaId);

  if (!state) return [];

  return state.experiments.filter((e) => e.status === 'running');
}

/**
 * Get experiment results summary
 */
export function getExperimentResults(experimentId: string): {
  status: string;
  winner?: string;
  confidence?: number;
  metrics: PersonaExperiment['metrics'];
} | null {
  const evolution = getAgentEvolution();

  for (const state of evolution.exportState().values()) {
    const experiment = state.experiments.find((e) => e.id === experimentId);
    if (experiment) {
      return {
        status: experiment.status,
        winner: experiment.winner,
        confidence: experiment.winnerConfidence,
        metrics: experiment.metrics,
      };
    }
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  initializeSessionExperiments,
  getSessionExperimentState,
  cleanupSessionExperiments,
  getExperimentPromptModifications,
  recordEngagementScore,
  recordSatisfactionSignal,
  recordAgentQuestion,
  recordConversationDepth,
  getBreakthroughQuestions,
  startExperiment,
  getRunningExperiments,
  getExperimentResults,
};

