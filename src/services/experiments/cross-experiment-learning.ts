/**
 * Cross-Experiment Learning for Superhuman Experiments
 *
 * Learns patterns across multiple experiments to enable:
 * - Transfer learning: Apply insights from one experiment to another
 * - Correlation detection: Find which user segments respond similarly
 * - Meta-patterns: Build aggregate knowledge about user behavior
 *
 * This is a "better than human" capability - no human experimenter
 * can track correlations across dozens of concurrent experiments.
 *
 * @module experiments/cross-experiment-learning
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'cross-experiment-learning' });

// ============================================================================
// Types
// ============================================================================

export interface ExperimentOutcome {
  experimentId: string;
  variantId: string;
  userId: string;
  success: boolean;
  timestamp: number;
  context?: Record<string, unknown>;
}

export interface UserExperimentProfile {
  userId: string;
  outcomes: ExperimentOutcome[];
  segments: string[]; // Inferred user segments
  preferenceVector: number[]; // Learned preference embedding
}

export interface ExperimentCorrelation {
  experimentA: string;
  experimentB: string;
  variantPairings: VariantPairing[];
  correlation: number; // -1 to 1
  confidence: number; // 0 to 1
  sampleSize: number;
}

export interface VariantPairing {
  variantA: string;
  variantB: string;
  cooccurrenceRate: number; // How often users who like A also like B
  liftOverBaseline: number; // How much better than random
}

export interface TransferLearningPrior {
  experimentId: string;
  variantId: string;
  priorAlpha: number; // Prior successes (from similar experiments)
  priorBeta: number; // Prior failures
  confidence: number; // How confident we are in this prior
  sourceExperiments: string[]; // Which experiments contributed
}

export interface MetaPattern {
  id: string;
  description: string;
  segments: string[];
  preferenceSignature: Record<string, number>; // variant type -> preference strength
  sampleSize: number;
  confidence: number;
}

// ============================================================================
// User Profile Management
// ============================================================================

/**
 * Build a user's experiment profile from their outcome history
 */
export function buildUserProfile(
  userId: string,
  outcomes: ExperimentOutcome[]
): UserExperimentProfile {
  const userOutcomes = outcomes.filter((o) => o.userId === userId);

  // Infer segments based on behavior patterns
  const segments = inferUserSegments(userOutcomes);

  // Build preference vector (simplified embedding)
  const preferenceVector = buildPreferenceVector(userOutcomes);

  return {
    userId,
    outcomes: userOutcomes,
    segments,
    preferenceVector,
  };
}

/**
 * Infer user segments from their experiment behavior
 */
function inferUserSegments(outcomes: ExperimentOutcome[]): string[] {
  const segments: string[] = [];

  if (outcomes.length === 0) return ['new-user'];

  // Calculate overall conversion rate
  const conversionRate =
    outcomes.filter((o) => o.success).length / outcomes.length;

  if (conversionRate > 0.7) segments.push('high-converter');
  else if (conversionRate < 0.3) segments.push('low-converter');
  else segments.push('moderate-converter');

  // Check for time-of-day patterns
  const hourBuckets = outcomes.map((o) => new Date(o.timestamp).getHours());
  const avgHour = hourBuckets.reduce((a, b) => a + b, 0) / hourBuckets.length;

  if (avgHour < 12) segments.push('morning-active');
  else if (avgHour < 18) segments.push('afternoon-active');
  else segments.push('evening-active');

  // Check engagement level (number of experiments participated in)
  const uniqueExperiments = new Set(outcomes.map((o) => o.experimentId));
  if (uniqueExperiments.size > 10) segments.push('highly-engaged');
  else if (uniqueExperiments.size > 3) segments.push('moderately-engaged');
  else segments.push('low-engagement');

  return segments;
}

/**
 * Build a preference vector from outcomes
 * Simple embedding based on variant type patterns
 */
function buildPreferenceVector(outcomes: ExperimentOutcome[]): number[] {
  // 8-dimensional preference vector
  // [0]: prefers-simple vs prefers-complex
  // [1]: prefers-formal vs prefers-casual
  // [2]: prefers-detailed vs prefers-brief
  // [3]: prefers-visual vs prefers-text
  // [4]: prefers-urgent vs prefers-calm
  // [5]: prefers-social vs prefers-individual
  // [6]: prefers-novel vs prefers-familiar
  // [7]: overall engagement strength

  const vector = [0, 0, 0, 0, 0, 0, 0, 0];

  // Initialize with neutral values
  for (let i = 0; i < vector.length; i++) {
    vector[i] = 0.5;
  }

  // Adjust based on successful outcomes
  // This is simplified - real implementation would use embeddings from variant metadata
  const successfulOutcomes = outcomes.filter((o) => o.success);

  if (successfulOutcomes.length > 0) {
    // Higher engagement dimension for more successes
    vector[7] = Math.min(successfulOutcomes.length / 20, 1);
  }

  return vector;
}

// ============================================================================
// Correlation Detection
// ============================================================================

/**
 * Find correlations between two experiments
 */
export function findCorrelation(
  experimentA: string,
  experimentB: string,
  outcomes: ExperimentOutcome[]
): ExperimentCorrelation | null {
  // Get users who participated in both experiments
  const usersA = new Set(
    outcomes.filter((o) => o.experimentId === experimentA).map((o) => o.userId)
  );
  const usersB = new Set(
    outcomes.filter((o) => o.experimentId === experimentB).map((o) => o.userId)
  );

  const commonUsers = [...usersA].filter((u) => usersB.has(u));

  if (commonUsers.length < 30) {
    // Not enough data for meaningful correlation
    return null;
  }

  // Build variant preference maps for each user
  const userPrefsA = new Map<string, string>();
  const userPrefsB = new Map<string, string>();

  for (const outcome of outcomes) {
    if (outcome.success) {
      if (outcome.experimentId === experimentA) {
        userPrefsA.set(outcome.userId, outcome.variantId);
      } else if (outcome.experimentId === experimentB) {
        userPrefsB.set(outcome.userId, outcome.variantId);
      }
    }
  }

  // Count variant pairings
  const pairingCounts = new Map<string, number>();
  let totalPairings = 0;

  for (const userId of commonUsers) {
    const prefA = userPrefsA.get(userId);
    const prefB = userPrefsB.get(userId);

    if (prefA && prefB) {
      const key = `${prefA}:${prefB}`;
      pairingCounts.set(key, (pairingCounts.get(key) || 0) + 1);
      totalPairings++;
    }
  }

  if (totalPairings < 10) {
    return null;
  }

  // Build variant pairings
  const variantPairings: VariantPairing[] = [];
  const variantsA = new Set(
    outcomes.filter((o) => o.experimentId === experimentA).map((o) => o.variantId)
  );
  const variantsB = new Set(
    outcomes.filter((o) => o.experimentId === experimentB).map((o) => o.variantId)
  );

  const baselineA = 1 / variantsA.size;
  const baselineB = 1 / variantsB.size;
  const baselinePairing = baselineA * baselineB;

  for (const [key, count] of pairingCounts) {
    const [variantA, variantB] = key.split(':');
    const cooccurrenceRate = count / totalPairings;
    const liftOverBaseline = cooccurrenceRate / baselinePairing;

    variantPairings.push({
      variantA,
      variantB,
      cooccurrenceRate,
      liftOverBaseline,
    });
  }

  // Calculate overall correlation using Cramér's V
  // Simplified: use variance in lift as proxy for correlation strength
  const lifts = variantPairings.map((p) => p.liftOverBaseline);
  const meanLift = lifts.reduce((a, b) => a + b, 0) / lifts.length;
  const variance =
    lifts.reduce((sum, l) => sum + Math.pow(l - meanLift, 2), 0) / lifts.length;
  const correlation = Math.min(Math.sqrt(variance) / 2, 1);

  // Confidence based on sample size
  const confidence = Math.min(totalPairings / 100, 0.99);

  log.debug(
    {
      experimentA,
      experimentB,
      commonUsers: commonUsers.length,
      correlation: correlation.toFixed(4),
    },
    'Correlation analysis complete'
  );

  return {
    experimentA,
    experimentB,
    variantPairings,
    correlation,
    confidence,
    sampleSize: totalPairings,
  };
}

/**
 * Find all significant correlations in a set of experiments
 */
export function findAllCorrelations(
  experimentIds: string[],
  outcomes: ExperimentOutcome[],
  minCorrelation: number = 0.3
): ExperimentCorrelation[] {
  const correlations: ExperimentCorrelation[] = [];

  // Check all pairs
  for (let i = 0; i < experimentIds.length; i++) {
    for (let j = i + 1; j < experimentIds.length; j++) {
      const correlation = findCorrelation(
        experimentIds[i],
        experimentIds[j],
        outcomes
      );

      if (correlation && correlation.correlation >= minCorrelation) {
        correlations.push(correlation);
      }
    }
  }

  // Sort by correlation strength
  correlations.sort((a, b) => b.correlation - a.correlation);

  return correlations;
}

// ============================================================================
// Transfer Learning
// ============================================================================

/**
 * Generate transfer learning priors for a new experiment
 * based on similar past experiments
 */
export function generateTransferPriors(
  newExperimentId: string,
  newVariantIds: string[],
  correlatedExperiments: ExperimentCorrelation[],
  historicalOutcomes: ExperimentOutcome[]
): TransferLearningPrior[] {
  const priors: TransferLearningPrior[] = [];

  for (const variantId of newVariantIds) {
    let totalAlpha = 1; // Start with uniform prior
    let totalBeta = 1;
    let totalWeight = 0;
    const sourceExperiments: string[] = [];

    for (const correlation of correlatedExperiments) {
      // Find the paired experiment
      const pairedExpId =
        correlation.experimentA === newExperimentId
          ? correlation.experimentB
          : correlation.experimentA;

      // Find most similar variant pairing
      const pairing = findMostSimilarPairing(
        variantId,
        correlation.variantPairings,
        correlation.experimentA === newExperimentId
      );

      if (pairing) {
        // Get historical performance of the paired variant
        const pairedOutcomes = historicalOutcomes.filter(
          (o) =>
            o.experimentId === pairedExpId && o.variantId === pairing.pairedVariant
        );

        const successes = pairedOutcomes.filter((o) => o.success).length;
        const failures = pairedOutcomes.filter((o) => !o.success).length;

        // Weight by correlation strength and sample size
        const weight =
          correlation.correlation * correlation.confidence * pairing.lift;

        totalAlpha += successes * weight;
        totalBeta += failures * weight;
        totalWeight += weight;
        sourceExperiments.push(pairedExpId);
      }
    }

    const confidence = Math.min(totalWeight / 5, 0.8); // Cap at 80% confidence

    priors.push({
      experimentId: newExperimentId,
      variantId,
      priorAlpha: totalAlpha,
      priorBeta: totalBeta,
      confidence,
      sourceExperiments: [...new Set(sourceExperiments)],
    });
  }

  log.info(
    {
      experimentId: newExperimentId,
      variantCount: newVariantIds.length,
      sourceCount: priors[0]?.sourceExperiments.length || 0,
    },
    'Generated transfer learning priors'
  );

  return priors;
}

/**
 * Find the most similar variant pairing
 */
function findMostSimilarPairing(
  variantId: string,
  pairings: VariantPairing[],
  isExperimentA: boolean
): { pairedVariant: string; lift: number } | null {
  // Find pairings involving this variant
  const relevantPairings = pairings.filter((p) =>
    isExperimentA ? p.variantA === variantId : p.variantB === variantId
  );

  if (relevantPairings.length === 0) {
    // If no direct match, use highest lift pairing as fallback
    const sortedPairings = [...pairings].sort(
      (a, b) => b.liftOverBaseline - a.liftOverBaseline
    );
    if (sortedPairings.length > 0) {
      return {
        pairedVariant: isExperimentA
          ? sortedPairings[0].variantB
          : sortedPairings[0].variantA,
        lift: sortedPairings[0].liftOverBaseline * 0.5, // Discount for non-direct match
      };
    }
    return null;
  }

  // Return the highest lift pairing
  const best = relevantPairings.sort(
    (a, b) => b.liftOverBaseline - a.liftOverBaseline
  )[0];

  return {
    pairedVariant: isExperimentA ? best.variantB : best.variantA,
    lift: best.liftOverBaseline,
  };
}

// ============================================================================
// Meta-Pattern Detection
// ============================================================================

/**
 * Detect meta-patterns across all experiments and users
 */
export function detectMetaPatterns(
  profiles: UserExperimentProfile[],
  minSampleSize: number = 50
): MetaPattern[] {
  const patterns: MetaPattern[] = [];

  // Group users by segments
  const segmentGroups = new Map<string, UserExperimentProfile[]>();

  for (const profile of profiles) {
    const segmentKey = profile.segments.sort().join(',');
    if (!segmentGroups.has(segmentKey)) {
      segmentGroups.set(segmentKey, []);
    }
    segmentGroups.get(segmentKey)!.push(profile);
  }

  // Analyze each segment group
  for (const [segmentKey, groupProfiles] of segmentGroups) {
    if (groupProfiles.length < minSampleSize) continue;

    const segments = segmentKey.split(',');

    // Calculate preference signature from successful outcomes
    const preferenceSignature: Record<string, number> = {};
    let totalOutcomes = 0;

    for (const profile of groupProfiles) {
      for (const outcome of profile.outcomes) {
        if (outcome.success) {
          // Use variantId prefix as "type" (simplified)
          const variantType = outcome.variantId.split('-')[0] || 'default';
          preferenceSignature[variantType] =
            (preferenceSignature[variantType] || 0) + 1;
          totalOutcomes++;
        }
      }
    }

    // Normalize to 0-1
    for (const key of Object.keys(preferenceSignature)) {
      preferenceSignature[key] /= totalOutcomes;
    }

    // Calculate confidence based on sample size and consistency
    const confidence = Math.min(groupProfiles.length / 100, 0.95);

    patterns.push({
      id: `pattern-${segmentKey.replace(/,/g, '-')}`,
      description: `Users who are ${segments.join(', ')}`,
      segments,
      preferenceSignature,
      sampleSize: groupProfiles.length,
      confidence,
    });
  }

  // Sort by confidence
  patterns.sort((a, b) => b.confidence - a.confidence);

  log.info(
    {
      totalProfiles: profiles.length,
      patternsFound: patterns.length,
    },
    'Meta-pattern detection complete'
  );

  return patterns;
}

/**
 * Apply meta-patterns to predict variant preference for a user
 */
export function predictVariantPreference(
  userProfile: UserExperimentProfile,
  variantIds: string[],
  metaPatterns: MetaPattern[]
): Map<string, number> {
  const predictions = new Map<string, number>();

  // Initialize with uniform preference
  for (const variantId of variantIds) {
    predictions.set(variantId, 1 / variantIds.length);
  }

  // Find matching patterns
  const matchingPatterns = metaPatterns.filter((pattern) =>
    pattern.segments.some((s) => userProfile.segments.includes(s))
  );

  if (matchingPatterns.length === 0) {
    return predictions;
  }

  // Apply pattern preferences
  for (const variantId of variantIds) {
    const variantType = variantId.split('-')[0] || 'default';
    let totalWeight = 0;
    let weightedPreference = 0;

    for (const pattern of matchingPatterns) {
      // Weight by segment overlap
      const overlapCount = pattern.segments.filter((s) =>
        userProfile.segments.includes(s)
      ).length;
      const weight = (overlapCount / pattern.segments.length) * pattern.confidence;

      const patternPreference = pattern.preferenceSignature[variantType] || 0.5;
      weightedPreference += patternPreference * weight;
      totalWeight += weight;
    }

    if (totalWeight > 0) {
      predictions.set(variantId, weightedPreference / totalWeight);
    }
  }

  // Normalize predictions
  const total = [...predictions.values()].reduce((a, b) => a + b, 0);
  for (const [key, value] of predictions) {
    predictions.set(key, value / total);
  }

  return predictions;
}

// ============================================================================
// Learning Persistence Helpers
// ============================================================================

export interface CrossExperimentLearningState {
  correlations: ExperimentCorrelation[];
  metaPatterns: MetaPattern[];
  lastUpdated: number;
  version: number;
}

/**
 * Serialize learning state for persistence
 */
export function serializeLearningState(
  correlations: ExperimentCorrelation[],
  metaPatterns: MetaPattern[]
): CrossExperimentLearningState {
  return {
    correlations,
    metaPatterns,
    lastUpdated: Date.now(),
    version: 1,
  };
}

/**
 * Calculate how stale the learning state is
 */
export function calculateStaleness(state: CrossExperimentLearningState): number {
  const ageMs = Date.now() - state.lastUpdated;
  const ageHours = ageMs / (1000 * 60 * 60);

  // Exponential decay: 50% stale after 24 hours
  return 1 - Math.exp(-ageHours / 24);
}

export default {
  buildUserProfile,
  findCorrelation,
  findAllCorrelations,
  generateTransferPriors,
  detectMetaPatterns,
  predictVariantPreference,
  serializeLearningState,
  calculateStaleness,
};
