/**
 * Conversation Semantic Trajectory
 *
 * Tracks how the semantic space shifts across a conversation in real-time.
 *
 * Enables:
 * - Detecting when conversation is circling an avoided topic
 * - Measuring semantic drift (how far from starting point)
 * - Tracking depth progression (surface → deep)
 * - Identifying topic coherence vs. scattered conversations
 *
 * @module intelligence/predictive/embeddings/conversation-trajectory
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';

const log = createLogger({ module: 'ConversationTrajectory' });

// ============================================================================
// TYPES
// ============================================================================

export interface TurnEmbedding {
  turnNumber: number;
  timestamp: number;
  embedding: number[];
  text: string;
  speaker: 'user' | 'agent';
  emotionalValence: number; // -1 to 1
  topicDepth: number; // 0-1, surface to deep
}

export interface ConversationTrajectory {
  sessionId: string;
  userId: string;
  startTime: number;

  // Turn-by-turn embeddings
  turns: TurnEmbedding[];

  // Derived metrics (updated in real-time)
  metrics: {
    semanticDrift: number; // Distance from start
    topicCoherence: number; // How focused (0 = scattered, 1 = focused)
    depthProgression: number; // Trend of depth over time
    emotionalArc: number; // Overall emotional trajectory
    avoidanceProximity: number; // How close to avoided topics
    circlingDetected: boolean; // Are we circling something?
    circlingTopic?: string;
  };

  // Key moments
  pivotPoints: Array<{
    turnNumber: number;
    description: string;
    type: 'topic_shift' | 'depth_increase' | 'emotional_peak' | 'avoidance_approach';
  }>;
}

export interface TrajectoryAnalysis {
  pattern: 'linear' | 'spiral' | 'wandering' | 'deepening' | 'circling' | 'avoiding';
  depth: 'surface' | 'moderate' | 'deep';
  coherence: 'scattered' | 'moderate' | 'focused';
  emotionalDirection: 'improving' | 'declining' | 'stable' | 'volatile';
  recommendations: string[];
}

// ============================================================================
// STORAGE
// ============================================================================

const activeTrajectories = new Map<string, ConversationTrajectory>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Start tracking a conversation trajectory
 */
export function startTrajectory(sessionId: string, userId: string): ConversationTrajectory {
  const trajectory: ConversationTrajectory = {
    sessionId,
    userId,
    startTime: Date.now(),
    turns: [],
    metrics: {
      semanticDrift: 0,
      topicCoherence: 1,
      depthProgression: 0,
      emotionalArc: 0,
      avoidanceProximity: 0,
      circlingDetected: false,
    },
    pivotPoints: [],
  };

  activeTrajectories.set(sessionId, trajectory);
  log.debug({ sessionId, userId }, '📍 Started conversation trajectory');

  return trajectory;
}

/**
 * Record a turn and update trajectory
 */
export async function recordTurn(
  sessionId: string,
  turn: {
    text: string;
    speaker: 'user' | 'agent';
    emotionalValence?: number;
    topicDepth?: number;
  },
  avoidedTopicEmbeddings?: number[][]
): Promise<ConversationTrajectory | null> {
  const trajectory = activeTrajectories.get(sessionId);
  if (!trajectory) return null;

  // Generate embedding for this turn
  const embedding = await embed(turn.text);

  const turnRecord: TurnEmbedding = {
    turnNumber: trajectory.turns.length,
    timestamp: Date.now(),
    embedding,
    text: turn.text,
    speaker: turn.speaker,
    emotionalValence: turn.emotionalValence ?? 0,
    topicDepth: turn.topicDepth ?? estimateDepth(turn.text),
  };

  trajectory.turns.push(turnRecord);

  // Update metrics
  await updateMetrics(trajectory, avoidedTopicEmbeddings);

  // Detect pivot points
  detectPivotPoints(trajectory);

  return trajectory;
}

/**
 * Get current trajectory state
 */
export function getTrajectory(sessionId: string): ConversationTrajectory | null {
  return activeTrajectories.get(sessionId) || null;
}

/**
 * Analyze the trajectory pattern
 */
export function analyzeTrajectory(sessionId: string): TrajectoryAnalysis | null {
  const trajectory = activeTrajectories.get(sessionId);
  if (!trajectory || trajectory.turns.length < 3) return null;

  const { metrics } = trajectory;

  // Determine pattern
  let pattern: TrajectoryAnalysis['pattern'] = 'linear';
  if (metrics.circlingDetected) {
    pattern = 'circling';
  } else if (metrics.avoidanceProximity > 0.6) {
    pattern = 'avoiding';
  } else if (metrics.topicCoherence < 0.4) {
    pattern = 'wandering';
  } else if (metrics.depthProgression > 0.3) {
    pattern = 'deepening';
  } else if (metrics.semanticDrift < 0.3 && metrics.topicCoherence > 0.7) {
    pattern = 'spiral'; // Circling same topic but going deeper
  }

  // Determine depth
  const avgDepth =
    trajectory.turns.reduce((sum, t) => sum + t.topicDepth, 0) / trajectory.turns.length;
  const depth: TrajectoryAnalysis['depth'] =
    avgDepth > 0.7 ? 'deep' : avgDepth > 0.4 ? 'moderate' : 'surface';

  // Determine coherence
  const coherence: TrajectoryAnalysis['coherence'] =
    metrics.topicCoherence > 0.7
      ? 'focused'
      : metrics.topicCoherence > 0.4
        ? 'moderate'
        : 'scattered';

  // Determine emotional direction
  const recentEmotions = trajectory.turns.slice(-5).map((t) => t.emotionalValence);
  const emotionTrend = calculateTrend(recentEmotions);
  const emotionVolatility = calculateVolatility(recentEmotions);

  const emotionalDirection: TrajectoryAnalysis['emotionalDirection'] =
    emotionVolatility > 0.4
      ? 'volatile'
      : emotionTrend > 0.1
        ? 'improving'
        : emotionTrend < -0.1
          ? 'declining'
          : 'stable';

  // Generate recommendations
  const recommendations = generateRecommendations(
    pattern,
    depth,
    coherence,
    emotionalDirection,
    metrics
  );

  return {
    pattern,
    depth,
    coherence,
    emotionalDirection,
    recommendations,
  };
}

/**
 * Check if conversation is approaching avoided territory
 */
export async function checkAvoidanceApproach(
  sessionId: string,
  avoidedTopicEmbeddings: number[][]
): Promise<{
  approaching: boolean;
  distance: number;
  direction: 'toward' | 'away' | 'stable';
  nearestTopic?: number; // Index into avoidedTopicEmbeddings
}> {
  const trajectory = activeTrajectories.get(sessionId);
  if (!trajectory || trajectory.turns.length < 2) {
    return { approaching: false, distance: 1, direction: 'stable' };
  }

  const recentTurns = trajectory.turns.slice(-3);

  // Calculate distances to each avoided topic
  let minCurrentDistance = 1;
  let nearestTopic = -1;

  for (let i = 0; i < avoidedTopicEmbeddings.length; i++) {
    const avoidedEmb = avoidedTopicEmbeddings[i];
    const currentDistance =
      1 - cosineSimilarity(recentTurns[recentTurns.length - 1].embedding, avoidedEmb);

    if (currentDistance < minCurrentDistance) {
      minCurrentDistance = currentDistance;
      nearestTopic = i;
    }
  }

  // Calculate trend
  if (recentTurns.length >= 2 && nearestTopic >= 0) {
    const previousDistance =
      1 -
      cosineSimilarity(
        recentTurns[recentTurns.length - 2].embedding,
        avoidedTopicEmbeddings[nearestTopic]
      );

    const direction =
      minCurrentDistance < previousDistance - 0.05
        ? 'toward'
        : minCurrentDistance > previousDistance + 0.05
          ? 'away'
          : 'stable';

    return {
      approaching: direction === 'toward' && minCurrentDistance < 0.5,
      distance: minCurrentDistance,
      direction,
      nearestTopic,
    };
  }

  return {
    approaching: false,
    distance: minCurrentDistance,
    direction: 'stable',
    nearestTopic: nearestTopic >= 0 ? nearestTopic : undefined,
  };
}

/**
 * Get semantic distance between two points in conversation
 */
export function getSemanticDistance(
  sessionId: string,
  turnA: number,
  turnB: number
): number | null {
  const trajectory = activeTrajectories.get(sessionId);
  if (!trajectory) return null;

  const embA = trajectory.turns[turnA]?.embedding;
  const embB = trajectory.turns[turnB]?.embedding;

  if (!embA || !embB) return null;

  return 1 - cosineSimilarity(embA, embB);
}

/**
 * End trajectory tracking
 */
export function endTrajectory(sessionId: string): ConversationTrajectory | null {
  const trajectory = activeTrajectories.get(sessionId);
  activeTrajectories.delete(sessionId);

  if (trajectory) {
    log.debug(
      { sessionId, turns: trajectory.turns.length, drift: trajectory.metrics.semanticDrift },
      '📊 Ended conversation trajectory'
    );
  }

  return trajectory ?? null;
}

// ============================================================================
// METRIC UPDATES
// ============================================================================

async function updateMetrics(
  trajectory: ConversationTrajectory,
  avoidedTopicEmbeddings?: number[][]
): Promise<void> {
  const { turns, metrics } = trajectory;
  if (turns.length < 2) return;

  const firstTurn = turns[0];
  const lastTurn = turns[turns.length - 1];

  // Semantic drift (distance from start)
  metrics.semanticDrift = 1 - cosineSimilarity(firstTurn.embedding, lastTurn.embedding);

  // Topic coherence (average similarity between consecutive turns)
  if (turns.length >= 2) {
    let totalSimilarity = 0;
    for (let i = 1; i < turns.length; i++) {
      totalSimilarity += cosineSimilarity(turns[i - 1].embedding, turns[i].embedding);
    }
    metrics.topicCoherence = totalSimilarity / (turns.length - 1);
  }

  // Depth progression
  if (turns.length >= 3) {
    const depths = turns.map((t) => t.topicDepth);
    metrics.depthProgression = calculateTrend(depths);
  }

  // Emotional arc
  const emotions = turns.map((t) => t.emotionalValence);
  metrics.emotionalArc = emotions.reduce((a, b) => a + b, 0) / emotions.length;

  // Avoidance proximity
  if (avoidedTopicEmbeddings && avoidedTopicEmbeddings.length > 0) {
    const recentEmbeddings = turns.slice(-3).map((t) => t.embedding);
    let minDistance = 1;

    for (const turnEmb of recentEmbeddings) {
      for (const avoidedEmb of avoidedTopicEmbeddings) {
        const distance = 1 - cosineSimilarity(turnEmb, avoidedEmb);
        minDistance = Math.min(minDistance, distance);
      }
    }

    metrics.avoidanceProximity = 1 - minDistance;

    // Circling detection
    if (turns.length >= 5) {
      const distances = turns.slice(-5).map((t) => {
        let minD = 1;
        for (const avoidedEmb of avoidedTopicEmbeddings) {
          minD = Math.min(minD, 1 - cosineSimilarity(t.embedding, avoidedEmb));
        }
        return minD;
      });

      const avgDistance = distances.reduce((a, b) => a + b, 0) / distances.length;
      const variance =
        distances.reduce((sum, d) => sum + Math.pow(d - avgDistance, 2), 0) / distances.length;

      // Circling = consistently close but not direct
      metrics.circlingDetected = avgDistance < 0.5 && variance < 0.05;
    }
  }
}

function detectPivotPoints(trajectory: ConversationTrajectory): void {
  const { turns, pivotPoints } = trajectory;
  if (turns.length < 3) return;

  const currentTurn = turns[turns.length - 1];
  const previousTurn = turns[turns.length - 2];
  const prePreviousTurn = turns[turns.length - 3];

  // Topic shift detection
  const similarity = cosineSimilarity(previousTurn.embedding, currentTurn.embedding);
  if (similarity < 0.6) {
    pivotPoints.push({
      turnNumber: currentTurn.turnNumber,
      description: 'Significant topic shift detected',
      type: 'topic_shift',
    });
  }

  // Depth increase detection
  if (
    currentTurn.topicDepth > previousTurn.topicDepth + 0.2 &&
    previousTurn.topicDepth > prePreviousTurn.topicDepth + 0.1
  ) {
    pivotPoints.push({
      turnNumber: currentTurn.turnNumber,
      description: 'Conversation deepening',
      type: 'depth_increase',
    });
  }

  // Emotional peak detection
  if (
    Math.abs(currentTurn.emotionalValence) > 0.7 &&
    Math.abs(currentTurn.emotionalValence) > Math.abs(previousTurn.emotionalValence) + 0.3
  ) {
    pivotPoints.push({
      turnNumber: currentTurn.turnNumber,
      description: `Emotional ${currentTurn.emotionalValence > 0 ? 'high' : 'low'} point`,
      type: 'emotional_peak',
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function estimateDepth(text: string): number {
  const lower = text.toLowerCase();

  // Deep indicators
  const deepIndicators = [
    'i realize',
    'i feel',
    'i think',
    'i believe',
    'i need',
    'i want',
    'scared',
    'afraid',
    'anxious',
    'sad',
    'angry',
    'frustrated',
    'love',
    'hate',
    'hurt',
    'vulnerable',
    'ashamed',
    'guilty',
    'always',
    'never',
    'everything',
    'nothing',
    'why',
    'how do i',
    'what if',
    'i wonder',
    'my father',
    'my mother',
    'my childhood',
    'growing up',
  ];

  // Surface indicators
  const surfaceIndicators = [
    'yeah',
    'okay',
    'sure',
    'fine',
    'good',
    'great',
    'weather',
    'work',
    'weekend',
    'plan',
    'schedule',
  ];

  let deepScore = 0;
  let surfaceScore = 0;

  for (const indicator of deepIndicators) {
    if (lower.includes(indicator)) deepScore += 0.15;
  }

  for (const indicator of surfaceIndicators) {
    if (lower.includes(indicator)) surfaceScore += 0.1;
  }

  // Length also indicates depth
  const lengthFactor = Math.min(0.3, text.length / 500);

  const depth = Math.min(1, Math.max(0, 0.3 + deepScore - surfaceScore + lengthFactor));
  return depth;
}

function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;

  const n = values.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumXX = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}

function calculateVolatility(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

  return Math.sqrt(variance);
}

function generateRecommendations(
  pattern: TrajectoryAnalysis['pattern'],
  depth: TrajectoryAnalysis['depth'],
  coherence: TrajectoryAnalysis['coherence'],
  emotionalDirection: TrajectoryAnalysis['emotionalDirection'],
  metrics: ConversationTrajectory['metrics']
): string[] {
  const recs: string[] = [];

  if (pattern === 'circling') {
    recs.push('They seem to be circling something. Gently name what you notice.');
  }

  if (pattern === 'avoiding') {
    recs.push("Approaching sensitive territory. Follow their lead, don't push.");
  }

  if (pattern === 'wandering' && coherence === 'scattered') {
    recs.push('Conversation is scattered. Consider grounding in one thread.');
  }

  if (depth === 'surface' && metrics.depthProgression < 0) {
    recs.push('Conversation staying surface. This might be what they need today.');
  }

  if (depth === 'deep' && emotionalDirection === 'declining') {
    recs.push("Deep and emotionally heavy. Check in on how they're doing.");
  }

  if (emotionalDirection === 'volatile') {
    recs.push('Emotional volatility detected. Stay steady and present.');
  }

  if (pattern === 'deepening') {
    recs.push("Trust is building. They're going deeper.");
  }

  return recs;
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build conversation trajectory context for LLM
 */
export function buildTrajectoryContext(sessionId: string): string {
  const analysis = analyzeTrajectory(sessionId);
  const trajectory = getTrajectory(sessionId);

  if (!analysis || !trajectory) return '';

  const sections: string[] = ['[CONVERSATION TRAJECTORY]'];

  sections.push(`\nPattern: ${analysis.pattern}`);
  sections.push(`Depth: ${analysis.depth}`);
  sections.push(`Coherence: ${analysis.coherence}`);
  sections.push(`Emotional direction: ${analysis.emotionalDirection}`);

  if (trajectory.metrics.circlingDetected) {
    sections.push('\n⚠️ Circling detected - may be approaching something important');
  }

  if (trajectory.metrics.avoidanceProximity > 0.5) {
    sections.push(
      `\n⚠️ Near avoided territory (proximity: ${Math.round(trajectory.metrics.avoidanceProximity * 100)}%)`
    );
  }

  if (analysis.recommendations.length > 0) {
    sections.push('\nGuidance:');
    for (const rec of analysis.recommendations) {
      sections.push(`• ${rec}`);
    }
  }

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const conversationTrajectory = {
  startTrajectory,
  recordTurn,
  getTrajectory,
  analyzeTrajectory,
  checkAvoidanceApproach,
  getSemanticDistance,
  endTrajectory,
  buildTrajectoryContext,
};

export default conversationTrajectory;
