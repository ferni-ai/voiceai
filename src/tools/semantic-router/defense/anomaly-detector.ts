/**
 * Anomaly Detector - Phase 5 Adversarial Defense
 *
 * Detects out-of-distribution inputs using embedding distance analysis.
 * Applies confidence caps to suspicious inputs to prevent false-positive tool execution.
 *
 * @module tools/semantic-router/defense/anomaly-detector
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { getEmbedding, cosineSimilarity } from '../embedding-providers.js';

const log = createLogger({ module: 'anomaly-detector' });

// ============================================================================
// TYPES
// ============================================================================

export interface AnomalyResult {
  /** Whether the input is considered anomalous */
  isAnomaly: boolean;
  /** Anomaly score (0-1, higher = more anomalous) */
  anomalyScore: number;
  /** Distance to nearest known intent cluster */
  nearestClusterDistance: number;
  /** Confidence penalty to apply (0-1, multiply with original confidence) */
  confidencePenalty: number;
  /** Reason for anomaly detection */
  reason: string | null;
}

export interface IntentCluster {
  /** Cluster identifier */
  id: string;
  /** Centroid embedding */
  centroid: number[];
  /** Average distance of members from centroid */
  avgRadius: number;
  /** Number of samples in cluster */
  sampleCount: number;
}

export interface AnomalyDetectorConfig {
  /** Distance threshold for anomaly detection (default: 0.6) */
  distanceThreshold: number;
  /** Minimum confidence after penalty (default: 0.1) */
  minConfidenceFloor: number;
  /** Whether to use dynamic thresholds based on cluster variance */
  useDynamicThreshold: boolean;
}

// ============================================================================
// INTENT CLUSTERS (Training Distribution)
// ============================================================================

/**
 * Pre-computed intent clusters representing the training distribution.
 * These are computed from known good examples during model training.
 *
 * In production, these would be loaded from a file or computed at startup.
 * Here we define archetypal clusters for common intent categories.
 */
const INTENT_CLUSTER_DEFINITIONS: Array<{
  id: string;
  examples: string[];
  description: string;
}> = [
  {
    id: 'music_playback',
    examples: ['play some music', 'put on jazz', 'I want to listen to rock', 'play my playlist'],
    description: 'Music playback requests',
  },
  {
    id: 'calendar_query',
    examples: [
      "what's on my calendar",
      'show my schedule',
      'do I have meetings tomorrow',
      'check my appointments',
    ],
    description: 'Calendar queries',
  },
  {
    id: 'weather_query',
    examples: [
      "what's the weather",
      'is it going to rain',
      'temperature today',
      'weather forecast',
    ],
    description: 'Weather queries',
  },
  {
    id: 'reminder_set',
    examples: [
      'remind me to call mom',
      'set a reminder for 3pm',
      "don't let me forget",
      'remember to buy milk',
    ],
    description: 'Reminder requests',
  },
  {
    id: 'handoff_request',
    examples: [
      'talk to Maya',
      'transfer me to Peter',
      'I want to speak with Alex',
      'can I talk to Jordan',
    ],
    description: 'Agent handoff requests',
  },
  {
    id: 'habit_tracking',
    examples: [
      'log my workout',
      'I meditated today',
      'track my water intake',
      'mark exercise complete',
    ],
    description: 'Habit tracking',
  },
  {
    id: 'conversation',
    examples: [
      'how are you',
      "I'm feeling stressed",
      'tell me about yourself',
      "I had a rough day",
    ],
    description: 'General conversation',
  },
];

// Cache for computed clusters
let intentClusters: IntentCluster[] | null = null;
let clusterInitPromise: Promise<void> | null = null;

/**
 * Initialize intent clusters by computing embeddings for examples.
 * This is done lazily on first use.
 */
async function initializeIntentClusters(): Promise<IntentCluster[]> {
  if (intentClusters) {
    return intentClusters;
  }

  // Prevent duplicate initialization
  if (clusterInitPromise) {
    await clusterInitPromise;
    return intentClusters!;
  }

  clusterInitPromise = (async () => {
    log.info('Initializing intent clusters for anomaly detection');

    const clusters: IntentCluster[] = [];

    for (const def of INTENT_CLUSTER_DEFINITIONS) {
      try {
        // Compute embeddings for all examples
        const embeddings: number[][] = [];
        for (const example of def.examples) {
          const embedding = await getEmbedding(example);
          if (embedding && embedding.length > 0) {
            // Convert Float32Array to number[] if needed
            embeddings.push(Array.from(embedding) as number[]);
          }
        }

        if (embeddings.length === 0) {
          log.warn({ clusterId: def.id }, 'No embeddings computed for cluster');
          continue;
        }

        // Compute centroid (average of all embeddings)
        const centroid = computeCentroid(embeddings);

        // Compute average radius (average distance from centroid)
        const distances = embeddings.map((emb) => 1 - cosineSimilarity(emb, centroid));
        const avgRadius = distances.reduce((a, b) => a + b, 0) / distances.length;

        clusters.push({
          id: def.id,
          centroid,
          avgRadius: Math.max(avgRadius, 0.1), // Minimum radius to avoid division issues
          sampleCount: embeddings.length,
        });

        log.debug(
          {
            clusterId: def.id,
            avgRadius: avgRadius.toFixed(3),
            sampleCount: embeddings.length,
          },
          'Cluster initialized'
        );
      } catch (error) {
        log.error({ error: String(error), clusterId: def.id }, 'Failed to initialize cluster');
      }
    }

    intentClusters = clusters;
    log.info({ clusterCount: clusters.length }, 'Intent clusters initialized');
  })();

  await clusterInitPromise;
  return intentClusters!;
}

/**
 * Compute centroid of embeddings.
 */
function computeCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];
  if (embeddings.length === 1) return [...embeddings[0]];

  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i];
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  // Normalize the centroid
  const norm = Math.sqrt(centroid.reduce((sum, v) => sum + v * v, 0));
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      centroid[i] /= norm;
    }
  }

  return centroid;
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

const DEFAULT_CONFIG: AnomalyDetectorConfig = {
  distanceThreshold: 0.6,
  minConfidenceFloor: 0.1,
  useDynamicThreshold: true,
};

/**
 * Detect if input is anomalous (out-of-distribution).
 *
 * @param input - User input text
 * @param config - Detection configuration
 * @returns Anomaly detection result
 */
export async function detectAnomaly(
  input: string,
  config: Partial<AnomalyDetectorConfig> = {}
): Promise<AnomalyResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Initialize clusters if needed
  const clusters = await initializeIntentClusters();

  if (clusters.length === 0) {
    log.warn('No intent clusters available, skipping anomaly detection');
    return {
      isAnomaly: false,
      anomalyScore: 0,
      nearestClusterDistance: 0,
      confidencePenalty: 1.0,
      reason: null,
    };
  }

  try {
    // Get embedding for input
    const inputEmbedding = await getEmbedding(input);
    if (!inputEmbedding || inputEmbedding.length === 0) {
      log.warn('Could not compute embedding for anomaly detection');
      return {
        isAnomaly: false,
        anomalyScore: 0,
        nearestClusterDistance: 0,
        confidencePenalty: 1.0,
        reason: 'Embedding computation failed',
      };
    }

    // Find nearest cluster
    let nearestDistance = Infinity;
    let nearestCluster: IntentCluster | null = null;

    for (const cluster of clusters) {
      const similarity = cosineSimilarity(inputEmbedding, cluster.centroid);
      const distance = 1 - similarity;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestCluster = cluster;
      }
    }

    // Calculate anomaly score
    let effectiveThreshold = cfg.distanceThreshold;

    // Dynamic threshold based on cluster variance
    if (cfg.useDynamicThreshold && nearestCluster) {
      // Allow more variance for clusters with naturally high radius
      effectiveThreshold = Math.max(cfg.distanceThreshold, nearestCluster.avgRadius * 2);
    }

    // Anomaly score: how far beyond the threshold (0 = within threshold, 1 = very far)
    const anomalyScore = Math.max(0, (nearestDistance - effectiveThreshold) / effectiveThreshold);
    const isAnomaly = nearestDistance > effectiveThreshold;

    // Calculate confidence penalty
    // - Within threshold: no penalty (1.0)
    // - Slightly outside: moderate penalty
    // - Very far: heavy penalty (down to minConfidenceFloor)
    let confidencePenalty = 1.0;
    if (isAnomaly) {
      // Exponential decay based on anomaly score
      confidencePenalty = Math.max(cfg.minConfidenceFloor, Math.exp(-anomalyScore * 2));
    }

    const result: AnomalyResult = {
      isAnomaly,
      anomalyScore: Math.min(1.0, anomalyScore),
      nearestClusterDistance: nearestDistance,
      confidencePenalty,
      reason: isAnomaly
        ? `Input is ${(nearestDistance / effectiveThreshold * 100).toFixed(0)}% beyond threshold from "${nearestCluster?.id}" cluster`
        : null,
    };

    if (isAnomaly) {
      log.debug(
        {
          input: input.slice(0, 50),
          nearestCluster: nearestCluster?.id,
          distance: nearestDistance.toFixed(3),
          threshold: effectiveThreshold.toFixed(3),
          penalty: confidencePenalty.toFixed(2),
        },
        'Anomalous input detected'
      );
    }

    return result;
  } catch (error) {
    log.error({ error: String(error) }, 'Anomaly detection failed');
    return {
      isAnomaly: false,
      anomalyScore: 0,
      nearestClusterDistance: 0,
      confidencePenalty: 1.0,
      reason: `Detection error: ${String(error)}`,
    };
  }
}

/**
 * Apply anomaly penalty to a confidence score.
 *
 * @param originalConfidence - Original routing confidence
 * @param anomalyResult - Result from detectAnomaly
 * @returns Adjusted confidence score
 */
export function applyAnomalyPenalty(
  originalConfidence: number,
  anomalyResult: AnomalyResult
): number {
  return originalConfidence * anomalyResult.confidencePenalty;
}

/**
 * Check if anomaly detection should block tool execution.
 *
 * @param anomalyResult - Result from detectAnomaly
 * @param blockThreshold - Anomaly score threshold for blocking (default: 0.8)
 * @returns Whether to block execution
 */
export function shouldBlockExecution(
  anomalyResult: AnomalyResult,
  blockThreshold = 0.8
): boolean {
  return anomalyResult.isAnomaly && anomalyResult.anomalyScore >= blockThreshold;
}

// ============================================================================
// CLUSTER MANAGEMENT
// ============================================================================

/**
 * Reset intent clusters (useful for testing or re-initialization).
 */
export function resetIntentClusters(): void {
  intentClusters = null;
  clusterInitPromise = null;
}

/**
 * Get current intent clusters (for inspection/debugging).
 */
export function getIntentClusters(): IntentCluster[] | null {
  return intentClusters;
}

/**
 * Add a new cluster from examples.
 */
export async function addCluster(
  id: string,
  examples: string[]
): Promise<IntentCluster | null> {
  try {
    const embeddings: number[][] = [];
    for (const example of examples) {
      const embedding = await getEmbedding(example);
      if (embedding && embedding.length > 0) {
        // Convert Float32Array to number[] if needed
        embeddings.push(Array.from(embedding) as number[]);
      }
    }

    if (embeddings.length === 0) {
      return null;
    }

    const centroid = computeCentroid(embeddings);
    const distances = embeddings.map((emb) => 1 - cosineSimilarity(emb, centroid));
    const avgRadius = distances.reduce((a, b) => a + b, 0) / distances.length;

    const cluster: IntentCluster = {
      id,
      centroid,
      avgRadius: Math.max(avgRadius, 0.1),
      sampleCount: embeddings.length,
    };

    // Initialize if needed and add
    await initializeIntentClusters();
    intentClusters!.push(cluster);

    return cluster;
  } catch (error) {
    log.error({ error: String(error), clusterId: id }, 'Failed to add cluster');
    return null;
  }
}
