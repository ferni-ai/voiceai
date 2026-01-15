/**
 * Emotional Trajectory Arcs - Better Than Human Service
 *
 * "See emotional journeys over weeks/months, not just moments"
 *
 * Tracks the semantic trajectory of emotions over multi-week arcs:
 *   - Not just "you felt anxious Tuesday"
 *   - But "your anxiety about career has been building for 3 weeks,
 *     peaked last Thursday, and is now resolving"
 *
 * @module services/superhuman/semantic-intelligence/emotional-trajectories
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity } from '../../../memory/embeddings.js';
import { getFirestoreDb, cleanForFirestore } from '../firestore-utils.js';
import type { EmotionalArc, EmotionalWaypoint, ArcPhase } from './types.js';
import { onEmotionalPatternChange } from '../../data-layer/hooks/wisdom-hooks.js';

// Re-export types for external consumers
export type { EmotionalArc, EmotionalWaypoint, ArcPhase };

const log = createLogger({ module: 'emotional-trajectories' });

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_WAYPOINTS_FOR_ARC: 3, // Minimum data points to identify arc
  ARC_SIMILARITY_THRESHOLD: 0.65, // Semantic similarity to group into same arc
  MAX_ARCS_PER_USER: 20,
  MAX_WAYPOINTS_PER_ARC: 50,
  ARC_TIMEOUT_DAYS: 60, // Consider arc resolved if no activity
  PHASE_CHANGE_THRESHOLD: 0.15, // Intensity change to trigger phase shift
};

// ============================================================================
// IN-MEMORY CACHE
// ============================================================================

const arcCache = new Map<string, EmotionalArc[]>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record an emotional waypoint.
 *
 * Call this whenever a significant emotional moment is detected:
 * - Voice emotion detection
 * - Explicit emotional expression
 * - Topic with emotional charge
 */
export async function recordEmotionalWaypoint(
  userId: string,
  waypoint: {
    emotion: string;
    intensity: number; // 0-1
    valence: number; // -1 to 1 (negative to positive)
    arousal?: number; // 0-1 (calm to excited)
    context?: string;
    trigger?: string;
  }
): Promise<EmotionalArc | null> {
  const { emotion, intensity, valence, arousal = 0.5, context, trigger } = waypoint;
  const timestamp = Date.now();

  // Generate embedding for the emotional context
  const emotionText = `${emotion} ${context || ''} ${trigger || ''}`.trim();
  let embedding: number[] | undefined;
  try {
    embedding = await embed(emotionText);
  } catch (error) {
    log.debug({ error: String(error) }, 'Failed to embed emotional waypoint');
  }

  const newWaypoint: EmotionalWaypoint = {
    timestamp,
    emotion,
    intensity,
    valence,
    arousal,
    context,
    trigger,
    embedding,
  };

  // Load existing arcs
  const arcs = arcCache.get(userId) || (await loadArcs(userId));

  // Find matching arc or create new one
  const matchingArc = await findMatchingArc(arcs, newWaypoint, embedding);

  if (matchingArc) {
    // Add waypoint to existing arc
    addWaypointToArc(matchingArc, newWaypoint);
    await saveArc(userId, matchingArc);
    log.debug(
      { userId, arcId: matchingArc.id, theme: matchingArc.theme },
      '📈 Waypoint added to existing arc'
    );
    return matchingArc;
  } else if (arcs.length < CONFIG.MAX_ARCS_PER_USER) {
    // Create new arc
    const newArc = createNewArc(userId, newWaypoint);
    arcs.push(newArc);
    arcCache.set(userId, arcs);
    await saveArc(userId, newArc);
    log.debug({ userId, arcId: newArc.id, theme: newArc.theme }, '🌱 New emotional arc created');
    return newArc;
  }

  return null;
}

/**
 * Find an existing arc that matches this waypoint semantically.
 */
async function findMatchingArc(
  arcs: EmotionalArc[],
  waypoint: EmotionalWaypoint,
  waypointEmbedding?: number[]
): Promise<EmotionalArc | null> {
  // Only match with active (non-resolved) arcs
  const activeArcs = arcs.filter(
    (arc) =>
      arc.phase !== 'resolved' &&
      Date.now() - arc.lastUpdated < CONFIG.ARC_TIMEOUT_DAYS * 24 * 60 * 60 * 1000
  );

  for (const arc of activeArcs) {
    // Check semantic similarity if embeddings available
    if (waypointEmbedding && arc.themeEmbedding) {
      const similarity = cosineSimilarity(waypointEmbedding, arc.themeEmbedding);
      if (similarity >= CONFIG.ARC_SIMILARITY_THRESHOLD) {
        return arc;
      }
    }

    // Fallback to emotion matching
    if (
      waypoint.emotion.toLowerCase() === arc.theme.toLowerCase() ||
      arc.theme.toLowerCase().includes(waypoint.emotion.toLowerCase())
    ) {
      return arc;
    }

    // Check if waypoint context matches arc theme
    if (
      waypoint.context &&
      arc.theme.toLowerCase().includes(waypoint.context.toLowerCase().split(' ')[0])
    ) {
      return arc;
    }
  }

  return null;
}

/**
 * Add a waypoint to an arc and update its properties.
 */
function addWaypointToArc(arc: EmotionalArc, waypoint: EmotionalWaypoint): void {
  // Add waypoint
  arc.waypoints.push(waypoint);

  // Trim if too many waypoints
  if (arc.waypoints.length > CONFIG.MAX_WAYPOINTS_PER_ARC) {
    arc.waypoints = arc.waypoints.slice(-CONFIG.MAX_WAYPOINTS_PER_ARC);
  }

  arc.lastUpdated = Date.now();

  // Update arc properties
  updateArcPhase(arc);
  updateArcTrend(arc);
  updateArcNarrative(arc);

  // Check for peak moment
  const maxIntensity = Math.max(...arc.waypoints.map((w) => w.intensity));
  if (waypoint.intensity >= maxIntensity) {
    arc.peakMoment = {
      timestamp: waypoint.timestamp,
      description: `Peak ${arc.theme}: ${waypoint.context || waypoint.emotion}`,
    };
  }

  // Detect turning points
  detectTurningPoint(arc, waypoint);
}

/**
 * Create a new emotional arc from a waypoint.
 */
function createNewArc(userId: string, waypoint: EmotionalWaypoint): EmotionalArc {
  const now = Date.now();
  const theme = waypoint.trigger
    ? `${waypoint.emotion} about ${waypoint.trigger}`
    : waypoint.emotion;

  return {
    id: `arc_${now}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    theme,
    themeEmbedding: waypoint.embedding,
    waypoints: [waypoint],
    phase: 'emerging',
    trend: 'stable',
    narrative: `${theme} first appeared`,
    startedAt: now,
    lastUpdated: now,
  };
}

/**
 * Update the phase of an arc based on waypoints.
 */
function updateArcPhase(arc: EmotionalArc): void {
  const waypoints = arc.waypoints;
  if (waypoints.length < CONFIG.MIN_WAYPOINTS_FOR_ARC) {
    arc.phase = 'emerging';
    return;
  }

  // Calculate recent trend
  const recent = waypoints.slice(-5);
  const avgRecentIntensity = recent.reduce((a, b) => a + b.intensity, 0) / recent.length;
  const older = waypoints.slice(-10, -5);

  if (older.length === 0) {
    arc.phase = 'emerging';
    return;
  }

  const avgOlderIntensity = older.reduce((a, b) => a + b.intensity, 0) / older.length;
  const delta = avgRecentIntensity - avgOlderIntensity;

  // Check for recurring pattern
  const hasOldData = Date.now() - arc.startedAt > 30 * 24 * 60 * 60 * 1000; // 30 days old
  const peakedBefore =
    arc.peakMoment && arc.peakMoment.timestamp < Date.now() - 7 * 24 * 60 * 60 * 1000;

  if (delta > CONFIG.PHASE_CHANGE_THRESHOLD) {
    arc.phase = hasOldData && peakedBefore ? 'recurring' : 'building';
  } else if (delta < -CONFIG.PHASE_CHANGE_THRESHOLD) {
    arc.phase = 'resolving';
  } else if (avgRecentIntensity > 0.7) {
    arc.phase = 'peak';
  } else if (avgRecentIntensity < 0.2 && arc.phase === 'resolving') {
    arc.phase = 'resolved';
    arc.resolvedAt = Date.now();
  }
}

/**
 * Update the trend of an arc.
 */
function updateArcTrend(arc: EmotionalArc): void {
  const waypoints = arc.waypoints;
  if (waypoints.length < 3) {
    arc.trend = 'stable';
    return;
  }

  // Calculate linear regression slope
  const n = Math.min(10, waypoints.length);
  const recent = waypoints.slice(-n);
  const xMean = (n - 1) / 2;
  const yMean = recent.reduce((a, b) => a + b.intensity, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (recent[i].intensity - yMean);
    denominator += (i - xMean) ** 2;
  }

  const slope = denominator !== 0 ? numerator / denominator : 0;

  // Also check variance
  const variance = recent.reduce((a, b) => a + (b.intensity - yMean) ** 2, 0) / n;

  if (variance > 0.15) {
    arc.trend = 'volatile';
  } else if (slope > 0.05) {
    arc.trend = 'rising';
  } else if (slope < -0.05) {
    arc.trend = 'falling';
  } else {
    arc.trend = 'stable';
  }
}

/**
 * Generate natural language narrative for an arc.
 */
function updateArcNarrative(arc: EmotionalArc): void {
  const { theme, phase, trend, waypoints } = arc;
  const duration = Date.now() - arc.startedAt;
  const durationDays = Math.floor(duration / (24 * 60 * 60 * 1000));

  const trendDescriptions = {
    rising: 'intensifying',
    falling: 'easing',
    stable: 'holding steady',
    volatile: 'fluctuating',
  };

  const phaseDescriptions = {
    emerging: 'just starting to emerge',
    building: `has been building over ${durationDays} days`,
    peak: 'is at its peak',
    resolving: 'is now resolving',
    resolved: `resolved after ${durationDays} days`,
    recurring: 'has returned',
  };

  arc.narrative = `Your ${theme} ${phaseDescriptions[phase]}. It's ${trendDescriptions[trend]}.`;

  // Add context about recent intensity
  const recentIntensity = waypoints.slice(-3).reduce((a, b) => a + b.intensity, 0) / 3;
  if (recentIntensity > 0.7) {
    arc.narrative += ' This is weighing on you heavily right now.';
  } else if (recentIntensity < 0.3 && phase !== 'resolved') {
    arc.narrative += ' The intensity has lightened.';
  }

  // Add turning point if exists
  if (arc.turningPoint) {
    arc.narrative += ` A shift happened ${arc.turningPoint.catalyst ? `after ${arc.turningPoint.catalyst}` : 'recently'}.`;
  }
}

/**
 * Detect if this waypoint represents a turning point.
 */
function detectTurningPoint(arc: EmotionalArc, waypoint: EmotionalWaypoint): void {
  const waypoints = arc.waypoints;
  if (waypoints.length < 5) return;

  // Check for sign change in valence trend
  const recent = waypoints.slice(-5);
  const older = waypoints.slice(-10, -5);

  if (older.length < 3) return;

  const recentValence = recent.reduce((a, b) => a + b.valence, 0) / recent.length;
  const olderValence = older.reduce((a, b) => a + b.valence, 0) / older.length;

  // Significant valence shift (e.g., from negative to positive)
  if (Math.abs(recentValence - olderValence) > 0.4) {
    arc.turningPoint = {
      timestamp: waypoint.timestamp,
      description:
        recentValence > olderValence
          ? `${arc.theme} started improving`
          : `${arc.theme} took a difficult turn`,
      catalyst: waypoint.trigger,
    };
  }
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get active emotional arcs for a user.
 */
export async function getActiveArcs(userId: string): Promise<EmotionalArc[]> {
  const arcs = arcCache.get(userId) || (await loadArcs(userId));

  return arcs.filter(
    (arc) =>
      arc.phase !== 'resolved' &&
      Date.now() - arc.lastUpdated < CONFIG.ARC_TIMEOUT_DAYS * 24 * 60 * 60 * 1000
  );
}

/**
 * Get arcs relevant to current emotional context.
 */
export async function getRelevantArcs(
  userId: string,
  currentEmotion?: string,
  currentTopic?: string
): Promise<EmotionalArc[]> {
  const activeArcs = await getActiveArcs(userId);

  if (!currentEmotion && !currentTopic) {
    return activeArcs.slice(0, 3);
  }

  // Score relevance
  const scored = activeArcs.map((arc) => {
    let relevance = 0;

    if (currentEmotion) {
      if (arc.theme.toLowerCase().includes(currentEmotion.toLowerCase())) {
        relevance += 0.8;
      }
      // Check waypoint emotions
      const emotionMatch = arc.waypoints.some(
        (w) => w.emotion.toLowerCase() === currentEmotion.toLowerCase()
      );
      if (emotionMatch) relevance += 0.3;
    }

    if (currentTopic) {
      if (arc.theme.toLowerCase().includes(currentTopic.toLowerCase())) {
        relevance += 0.7;
      }
      // Check triggers
      const triggerMatch = arc.waypoints.some((w) =>
        w.trigger?.toLowerCase().includes(currentTopic.toLowerCase())
      );
      if (triggerMatch) relevance += 0.3;
    }

    // Boost for intensity
    const recentIntensity = arc.waypoints.slice(-3).reduce((a, b) => a + b.intensity, 0) / 3;
    relevance *= 0.5 + recentIntensity;

    return { arc, relevance };
  });

  return scored
    .filter((s) => s.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3)
    .map((s) => s.arc);
}

/**
 * Build context string for LLM injection.
 */
export async function buildEmotionalTrajectoryContext(
  userId: string,
  currentContext?: { emotion?: string; topic?: string }
): Promise<string> {
  const arcs = await getRelevantArcs(userId, currentContext?.emotion, currentContext?.topic);

  if (arcs.length === 0) {
    return '';
  }

  const sections: string[] = [
    '[EMOTIONAL TRAJECTORY ARCS - Seeing the Journey]',
    'You see emotional journeys, not just moments. Reference these naturally.',
    '',
  ];

  for (const arc of arcs) {
    const durationDays = Math.floor((Date.now() - arc.startedAt) / (24 * 60 * 60 * 1000));
    const recentIntensity = arc.waypoints.slice(-3).reduce((a, b) => a + b.intensity, 0) / 3;

    sections.push(`**${arc.theme}** (${arc.phase}, ${durationDays} days)`);
    sections.push(`  ${arc.narrative}`);

    if (arc.turningPoint) {
      sections.push(`  Turning point: ${arc.turningPoint.description}`);
    }

    if (recentIntensity > 0.6) {
      sections.push(`  ⚠️ Currently intense - handle with care`);
    }

    sections.push('');
  }

  sections.push('Connect current moments to these longer arcs. Show perspective.');

  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE
// ============================================================================

async function loadArcs(userId: string): Promise<EmotionalArc[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('emotional_arcs')
      .orderBy('lastUpdated', 'desc')
      .limit(CONFIG.MAX_ARCS_PER_USER)
      .get();

    const arcs = snapshot.docs.map((doc) => doc.data() as EmotionalArc);
    arcCache.set(userId, arcs);
    return arcs;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load emotional arcs');
    return [];
  }
}

async function saveArc(userId: string, arc: EmotionalArc): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('emotional_arcs')
      .doc(arc.id)
      .set(cleanForFirestore(arc));

    // Index emotional arc to semantic memory
    void onEmotionalPatternChange(
      userId,
      `arc_${arc.id}`,
      {
        pattern: `Emotional arc: ${arc.emotion || 'mixed'} - ${arc.phase || 'ongoing'}`,
        triggers: arc.triggers || [],
        frequency: 'frequent', // 'ongoing' maps to 'frequent' - arc is actively tracked
        impact: arc.intensity && arc.intensity > 0.5 ? 'negative' : 'mixed',
        awareness: 'moderate',
      },
      arc.phase === 'resolving' ? 'update' : 'create'
    );

    log.debug({ userId, arcId: arc.id }, '💾 Emotional arc saved');
  } catch (error) {
    log.warn({ error: String(error), userId, arcId: arc.id }, 'Failed to save emotional arc');
  }
}

/**
 * Clear arc cache for a user.
 */
export function clearArcCache(userId?: string): void {
  if (userId) {
    arcCache.delete(userId);
  } else {
    arcCache.clear();
  }
}

// ============================================================================
// EMOTIONAL CONTEXT - For Predictive Intelligence
// ============================================================================

/**
 * Emotional context result for proactive intelligence.
 * Used by session-init-handler Phase 6.6 for predictive emotional state.
 */
export interface EmotionalContextResult {
  /** Currently active emotional arcs */
  activeArcs: EmotionalArc[];
  /** The dominant emotional trajectory theme */
  dominantTrajectory?: string;
  /** Predicted phase for the dominant arc */
  predictedPhase?: ArcPhase;
  /** Recommendation for how to approach the user */
  recommendation?: string;
  /** Overall emotional trend direction */
  trend?: 'improving' | 'declining' | 'stable' | 'volatile';
  /** Intensity level (0-1) */
  intensity?: number;
}

/**
 * Get emotional context for proactive intelligence.
 * Analyzes active emotional arcs to predict user's emotional state
 * and provide recommendations for engagement.
 *
 * @param userId - The user ID
 * @returns Emotional context with arcs, trajectory, and recommendations
 */
export async function getEmotionalContext(userId: string): Promise<EmotionalContextResult> {
  try {
    const activeArcs = await getActiveArcs(userId);

    if (activeArcs.length === 0) {
      return {
        activeArcs: [],
        recommendation: 'No active emotional patterns detected. Approach normally.',
      };
    }

    // Find the dominant arc (most recent or most intense)
    const rankedArcs = activeArcs
      .map((arc) => {
        const recentIntensity = arc.waypoints.slice(-3).reduce((a, b) => a + b.intensity, 0) / 3;
        const recency = 1 / (1 + (Date.now() - arc.lastUpdated) / (24 * 60 * 60 * 1000)); // Decay over days
        return {
          arc,
          score: recentIntensity * 0.6 + recency * 0.4,
        };
      })
      .sort((a, b) => b.score - a.score);

    const dominantArc = rankedArcs[0]?.arc;
    const dominantTrajectory = dominantArc?.theme;
    const predictedPhase = dominantArc?.phase;

    // Calculate overall intensity
    const avgIntensity =
      rankedArcs.reduce((sum, { arc }) => {
        const recent = arc.waypoints.slice(-3);
        return sum + recent.reduce((a, b) => a + b.intensity, 0) / recent.length;
      }, 0) / rankedArcs.length;

    // Determine overall trend
    let trend: 'improving' | 'declining' | 'stable' | 'volatile' = 'stable';
    if (dominantArc) {
      switch (dominantArc.trend) {
        case 'rising':
          // Rising intensity with negative valence = declining emotional state
          const avgValence = dominantArc.waypoints.slice(-3).reduce((a, b) => a + b.valence, 0) / 3;
          trend = avgValence < 0 ? 'declining' : 'stable';
          break;
        case 'falling':
          trend = 'improving';
          break;
        case 'volatile':
          trend = 'volatile';
          break;
        default:
          trend = 'stable';
      }
    }

    // Generate recommendation based on state
    let recommendation: string;

    if (avgIntensity > 0.7) {
      if (trend === 'declining' || trend === 'volatile') {
        recommendation = `High emotional intensity detected around "${dominantTrajectory}". Approach with extra care and validation.`;
      } else {
        recommendation = `Strong emotions active around "${dominantTrajectory}". Be present and acknowledge their journey.`;
      }
    } else if (avgIntensity > 0.4) {
      if (predictedPhase === 'resolving') {
        recommendation = `"${dominantTrajectory}" appears to be resolving. Celebrate progress gently.`;
      } else if (predictedPhase === 'recurring') {
        recommendation = `"${dominantTrajectory}" has returned. Reference previous navigation of this pattern.`;
      } else {
        recommendation = `Active emotional arc around "${dominantTrajectory}". Stay attuned to shifts.`;
      }
    } else {
      recommendation = 'Emotional state appears stable. Normal engagement appropriate.';
    }

    // Add warning for peak phase
    if (predictedPhase === 'peak') {
      recommendation += ' ⚠️ At peak intensity - prioritize emotional safety.';
    }

    return {
      activeArcs,
      dominantTrajectory,
      predictedPhase,
      recommendation,
      trend,
      intensity: avgIntensity,
    };
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to get emotional context');
    return {
      activeArcs: [],
      recommendation: 'Unable to analyze emotional patterns. Proceed with care.',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const emotionalTrajectories = {
  recordWaypoint: recordEmotionalWaypoint,
  getActiveArcs,
  getRelevantArcs,
  buildContext: buildEmotionalTrajectoryContext,
  clearCache: clearArcCache,
  getEmotionalContext,
};
