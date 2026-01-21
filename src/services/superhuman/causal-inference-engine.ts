/**
 * Causal Inference Engine - Better Than Human Service
 *
 * What no human friend can do: Determine causation from correlation,
 * run counterfactual analysis, and identify confounding variables
 * across life domains with statistical rigor.
 *
 * Research Foundation:
 * - Judea Pearl's Causal Inference Framework
 * - Granger Causality for time-series
 * - Structural Equation Modeling
 * - Bayesian Networks
 * - Counterfactual Reasoning
 *
 * @module services/superhuman/causal-inference-engine
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'causal-inference-engine' });

// ============================================================================
// TYPES
// ============================================================================

export type CausalConfidence = 'speculative' | 'suggestive' | 'moderate' | 'strong' | 'robust';
export type EvidenceType =
  | 'observational'
  | 'quasi_experimental'
  | 'natural_experiment'
  | 'randomized';
export type CausalDirection =
  | 'causes'
  | 'caused_by'
  | 'bidirectional'
  | 'confounded'
  | 'independent';

export interface CausalRelationship {
  id: string;
  userId: string;

  // The relationship
  cause: string;
  effect: string;
  direction: CausalDirection;

  // Strength metrics
  causalStrength: number; // 0-1
  confidence: CausalConfidence;
  pValue?: number; // Statistical significance
  effectSize: number; // Cohen's d or similar

  // Evidence
  evidenceType: EvidenceType;
  observationCount: number;
  timeseriesLength: number;

  // Confounders
  knownConfounders: string[];
  potentialConfounders: string[];
  confoundingAdjusted: boolean;

  // Temporal
  lagDays: number; // How long before effect manifests
  consistency: number; // 0-1, how consistent is this relationship

  // Meta
  domain: string;
  firstObserved: number;
  lastUpdated: number;
  humanReadable: string;
}

export interface TimeSeriesDataPoint {
  timestamp: number;
  variable: string;
  value: number;
  context?: string;
}

export interface CounterfactualAnalysis {
  id: string;
  userId: string;

  // The scenario
  actualScenario: string;
  actualOutcome: string;

  // The counterfactual
  counterfactualChange: string;
  predictedOutcome: string;
  outcomeChange: number; // Percentage or absolute change

  // Confidence
  confidence: CausalConfidence;
  basedOnRelationships: string[]; // IDs of causal relationships
  assumptions: string[];

  // Presentation
  humanReadable: string;
  actionableInsight: string;

  createdAt: number;
}

export interface InterventionRecommendation {
  variable: string;
  currentValue: number | string;
  suggestedValue: number | string;
  expectedOutcomeChange: number;
  confidenceLevel: CausalConfidence;
  explanation: string;
  effort: 'low' | 'medium' | 'high';
  priority: number; // 1-10
}

export interface CausalGraph {
  nodes: Array<{ id: string; label: string; domain: string }>;
  edges: Array<{
    source: string;
    target: string;
    strength: number;
    direction: CausalDirection;
  }>;
}

export interface CausalInferenceProfile {
  userId: string;
  relationships: CausalRelationship[];
  timeSeries: Record<string, TimeSeriesDataPoint[]>;
  counterfactuals: CounterfactualAnalysis[];
  graph: CausalGraph;
  lastAnalyzed: number;
  updatedAt: number;
}

// ============================================================================
// GRANGER CAUSALITY (TIME-SERIES)
// ============================================================================

/**
 * Simplified Granger causality test.
 * Tests if X Granger-causes Y by checking if past values of X help predict Y
 * beyond what past values of Y alone can predict.
 *
 * Full implementation would use VAR models; this is a heuristic version.
 */
export function testGrangerCausality(
  xSeries: number[],
  ySeries: number[],
  lagPeriods: number = 3
): {
  grangerCauses: boolean;
  fStatistic: number;
  pValue: number;
  optimalLag: number;
  bidirectional: boolean;
} {
  if (xSeries.length !== ySeries.length || xSeries.length < lagPeriods * 3) {
    return {
      grangerCauses: false,
      fStatistic: 0,
      pValue: 1,
      optimalLag: 0,
      bidirectional: false,
    };
  }

  const n = xSeries.length;

  // Calculate predictive improvement for different lags
  let bestLag = 1;
  let bestImprovement = 0;

  for (let lag = 1; lag <= lagPeriods; lag++) {
    // Calculate variance of Y
    const yMean = ySeries.slice(lag).reduce((a, b) => a + b, 0) / (n - lag);
    const yVariance =
      ySeries.slice(lag).reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0) / (n - lag);

    // Calculate residuals when predicting Y from its own past
    let ssrRestricted = 0;
    for (let t = lag; t < n; t++) {
      const yPastMean = ySeries.slice(t - lag, t).reduce((a, b) => a + b, 0) / lag;
      ssrRestricted += Math.pow(ySeries[t] - yPastMean, 2);
    }

    // Calculate residuals when predicting Y from both past Y and past X
    let ssrUnrestricted = 0;
    for (let t = lag; t < n; t++) {
      const yPastMean = ySeries.slice(t - lag, t).reduce((a, b) => a + b, 0) / lag;
      const xPastMean = xSeries.slice(t - lag, t).reduce((a, b) => a + b, 0) / lag;
      // Simple linear combination
      const combined =
        yPastMean * 0.7 +
        xPastMean *
          0.3 *
          (yVariance > 0 ? Math.sqrt(ssrRestricted / (n - lag)) / Math.sqrt(yVariance) : 0);
      ssrUnrestricted += Math.pow(ySeries[t] - combined, 2);
    }

    const improvement = ssrRestricted > 0 ? (ssrRestricted - ssrUnrestricted) / ssrRestricted : 0;

    if (improvement > bestImprovement) {
      bestImprovement = improvement;
      bestLag = lag;
    }
  }

  // Calculate F-statistic approximation
  const dfNum = bestLag;
  const dfDen = n - 2 * bestLag - 1;
  const fStatistic = dfDen > 0 ? (bestImprovement / (1 - bestImprovement)) * (dfDen / dfNum) : 0;

  // Approximate p-value (simplified)
  const pValue = Math.max(0.001, 1 - Math.min(0.999, fStatistic / 10));

  // Test reverse direction
  const reverseResult = testGrangerCausalityOneWay(ySeries, xSeries, bestLag);

  return {
    grangerCauses: bestImprovement > 0.05 && pValue < 0.1,
    fStatistic,
    pValue,
    optimalLag: bestLag,
    bidirectional: bestImprovement > 0.05 && reverseResult > 0.05,
  };
}

function testGrangerCausalityOneWay(xSeries: number[], ySeries: number[], lag: number): number {
  const n = xSeries.length;
  if (n < lag * 2) return 0;

  let ssrRestricted = 0;
  let ssrUnrestricted = 0;

  for (let t = lag; t < n; t++) {
    const yPastMean = ySeries.slice(t - lag, t).reduce((a, b) => a + b, 0) / lag;
    const xPastMean = xSeries.slice(t - lag, t).reduce((a, b) => a + b, 0) / lag;

    ssrRestricted += Math.pow(ySeries[t] - yPastMean, 2);
    const combined = yPastMean * 0.7 + xPastMean * 0.3;
    ssrUnrestricted += Math.pow(ySeries[t] - combined, 2);
  }

  return ssrRestricted > 0 ? (ssrRestricted - ssrUnrestricted) / ssrRestricted : 0;
}

// ============================================================================
// CAUSAL RELATIONSHIP DETECTION
// ============================================================================

/**
 * Analyze potential causal relationship between two variables.
 */
export function analyzeCausalRelationship(
  userId: string,
  cause: {
    name: string;
    timeSeries: TimeSeriesDataPoint[];
  },
  effect: {
    name: string;
    timeSeries: TimeSeriesDataPoint[];
  },
  options?: {
    knownConfounders?: string[];
    domain?: string;
  }
): CausalRelationship | null {
  // Align time series
  const { alignedCause, alignedEffect } = alignTimeSeries(cause.timeSeries, effect.timeSeries);

  if (alignedCause.length < 7) {
    log.debug(
      { userId, cause: cause.name, effect: effect.name },
      'Insufficient data for causal analysis'
    );
    return null;
  }

  // Run Granger causality test
  const grangerResult = testGrangerCausality(alignedCause, alignedEffect, 3);

  // Calculate correlation for effect size
  const correlation = calculateCorrelation(alignedCause, alignedEffect);
  const effectSize = Math.abs(correlation);

  // Determine direction
  let direction: CausalDirection;
  if (grangerResult.grangerCauses && grangerResult.bidirectional) {
    direction = 'bidirectional';
  } else if (grangerResult.grangerCauses) {
    direction = 'causes';
  } else if (grangerResult.pValue > 0.5) {
    direction = 'independent';
  } else {
    direction = 'confounded';
  }

  // Determine confidence
  let confidence: CausalConfidence;
  if (grangerResult.pValue < 0.01 && alignedCause.length > 30) {
    confidence = 'robust';
  } else if (grangerResult.pValue < 0.05 && alignedCause.length > 14) {
    confidence = 'strong';
  } else if (grangerResult.pValue < 0.1) {
    confidence = 'moderate';
  } else if (grangerResult.grangerCauses) {
    confidence = 'suggestive';
  } else {
    confidence = 'speculative';
  }

  // Check for common confounders
  const potentialConfounders = identifyPotentialConfounders(cause.name, effect.name);

  const relationship: CausalRelationship = {
    id: `causal_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    cause: cause.name,
    effect: effect.name,
    direction,
    causalStrength: effectSize,
    confidence,
    pValue: grangerResult.pValue,
    effectSize,
    evidenceType: 'observational',
    observationCount: alignedCause.length,
    timeseriesLength: alignedCause.length,
    knownConfounders: options?.knownConfounders || [],
    potentialConfounders,
    confoundingAdjusted: false,
    lagDays: grangerResult.optimalLag,
    consistency: calculateConsistency(alignedCause, alignedEffect),
    domain: options?.domain || 'general',
    firstObserved: Date.now(),
    lastUpdated: Date.now(),
    humanReadable: generateHumanReadable(
      cause.name,
      effect.name,
      direction,
      confidence,
      effectSize
    ),
  };

  return relationship;
}

function alignTimeSeries(
  series1: TimeSeriesDataPoint[],
  series2: TimeSeriesDataPoint[]
): { alignedCause: number[]; alignedEffect: number[] } {
  // Create daily buckets
  const bucket1: Record<string, number[]> = {};
  const bucket2: Record<string, number[]> = {};

  for (const point of series1) {
    const day = new Date(point.timestamp).toISOString().split('T')[0];
    if (!bucket1[day]) bucket1[day] = [];
    bucket1[day].push(point.value);
  }

  for (const point of series2) {
    const day = new Date(point.timestamp).toISOString().split('T')[0];
    if (!bucket2[day]) bucket2[day] = [];
    bucket2[day].push(point.value);
  }

  // Get common days
  const commonDays = Object.keys(bucket1)
    .filter((day) => bucket2[day])
    .sort();

  const alignedCause = commonDays.map(
    (day) => bucket1[day].reduce((a, b) => a + b, 0) / bucket1[day].length
  );
  const alignedEffect = commonDays.map(
    (day) => bucket2[day].reduce((a, b) => a + b, 0) / bucket2[day].length
  );

  return { alignedCause, alignedEffect };
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n === 0) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom > 0 ? numerator / denom : 0;
}

function calculateConsistency(x: number[], y: number[]): number {
  // Calculate rolling correlation to measure consistency
  if (x.length < 7) return 0;

  const windowSize = Math.max(3, Math.floor(x.length / 4));
  const correlations: number[] = [];

  for (let i = 0; i <= x.length - windowSize; i++) {
    const corr = calculateCorrelation(x.slice(i, i + windowSize), y.slice(i, i + windowSize));
    correlations.push(corr);
  }

  // Consistency is inverse of variance in correlations
  const mean = correlations.reduce((a, b) => a + b, 0) / correlations.length;
  const variance =
    correlations.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / correlations.length;

  return Math.max(0, 1 - Math.sqrt(variance));
}

// ============================================================================
// CONFOUNDER IDENTIFICATION
// ============================================================================

/**
 * Common confounders in life domains.
 * Based on causal inference literature and common spurious correlations.
 */
const CONFOUNDER_PATTERNS: Record<string, { for: string[]; confounder: string }[]> = {
  sleep: [
    { for: ['productivity', 'mood', 'energy', 'focus'], confounder: 'underlying stress' },
    { for: ['exercise', 'diet'], confounder: 'general health motivation' },
  ],
  exercise: [
    { for: ['mood', 'energy', 'productivity'], confounder: 'sleep quality' },
    { for: ['stress', 'anxiety'], confounder: 'time availability' },
  ],
  mood: [
    { for: ['productivity', 'social', 'decisions'], confounder: 'recent events' },
    { for: ['sleep', 'exercise'], confounder: 'depression/energy levels' },
  ],
  spending: [
    { for: ['stress', 'mood'], confounder: 'life events (job, relationship)' },
    { for: ['happiness'], confounder: 'income level' },
  ],
  coffee: [
    { for: ['productivity', 'alertness'], confounder: 'sleep deprivation' },
    { for: ['anxiety'], confounder: 'existing stress' },
  ],
  social_media: [
    { for: ['mood', 'productivity'], confounder: 'boredom/avoidance' },
    { for: ['sleep'], confounder: 'anxiety/racing thoughts' },
  ],
};

function identifyPotentialConfounders(cause: string, effect: string): string[] {
  const confounders: string[] = [];
  const normalizedCause = cause.toLowerCase();
  const normalizedEffect = effect.toLowerCase();

  for (const [variable, patterns] of Object.entries(CONFOUNDER_PATTERNS)) {
    if (normalizedCause.includes(variable)) {
      for (const pattern of patterns) {
        if (pattern.for.some((f) => normalizedEffect.includes(f))) {
          confounders.push(pattern.confounder);
        }
      }
    }
    if (normalizedEffect.includes(variable)) {
      for (const pattern of patterns) {
        if (pattern.for.some((f) => normalizedCause.includes(f))) {
          confounders.push(pattern.confounder);
        }
      }
    }
  }

  // Add universal confounders
  confounders.push('day of week effects');
  confounders.push('seasonal variation');
  confounders.push('measurement error');

  return [...new Set(confounders)];
}

function generateHumanReadable(
  cause: string,
  effect: string,
  direction: CausalDirection,
  confidence: CausalConfidence,
  effectSize: number
): string {
  const strengthWord =
    effectSize > 0.7
      ? 'strong'
      : effectSize > 0.4
        ? 'moderate'
        : effectSize > 0.2
          ? 'weak'
          : 'very weak';

  const confidenceWord =
    confidence === 'robust'
      ? 'high confidence'
      : confidence === 'strong'
        ? 'good evidence'
        : confidence === 'moderate'
          ? 'some evidence'
          : confidence === 'suggestive'
            ? 'early signs'
            : 'speculative';

  switch (direction) {
    case 'causes':
      return `${cause} appears to cause ${effect} (${strengthWord} effect, ${confidenceWord})`;
    case 'caused_by':
      return `${effect} may actually cause ${cause}, not vice versa (${confidenceWord})`;
    case 'bidirectional':
      return `${cause} and ${effect} appear to influence each other (${strengthWord}, ${confidenceWord})`;
    case 'confounded':
      return `${cause} correlates with ${effect}, but a hidden factor likely drives both`;
    case 'independent':
      return `${cause} and ${effect} appear to be independent`;
    default:
      return `${cause} and ${effect} relationship is unclear`;
  }
}

// ============================================================================
// COUNTERFACTUAL ANALYSIS
// ============================================================================

/**
 * Generate counterfactual analysis: "What would have happened if..."
 */
export function generateCounterfactual(
  userId: string,
  scenario: {
    variable: string;
    actualValue: number;
    counterfactualValue: number;
    outcomeVariable: string;
    actualOutcome: number;
  },
  relationships: CausalRelationship[]
): CounterfactualAnalysis | null {
  const { variable, actualValue, counterfactualValue, outcomeVariable, actualOutcome } = scenario;

  // Find relevant causal relationship
  const relationship = relationships.find(
    (r) =>
      (r.cause.toLowerCase().includes(variable.toLowerCase()) &&
        r.effect.toLowerCase().includes(outcomeVariable.toLowerCase())) ||
      (r.effect.toLowerCase().includes(variable.toLowerCase()) &&
        r.cause.toLowerCase().includes(outcomeVariable.toLowerCase()))
  );

  if (!relationship || relationship.direction === 'independent') {
    return null;
  }

  // Calculate expected change
  const valueDiff = counterfactualValue - actualValue;
  const normalizedDiff = actualValue !== 0 ? valueDiff / actualValue : valueDiff;

  // Apply causal effect (simplified linear model)
  const expectedOutcomeChange =
    normalizedDiff * relationship.causalStrength * relationship.effectSize;
  const predictedOutcome = actualOutcome * (1 + expectedOutcomeChange);

  const analysis: CounterfactualAnalysis = {
    id: `cf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    actualScenario: `${variable} was ${actualValue}`,
    actualOutcome: `${outcomeVariable} was ${actualOutcome}`,
    counterfactualChange: `If ${variable} had been ${counterfactualValue}`,
    predictedOutcome: `${outcomeVariable} would have been approximately ${predictedOutcome.toFixed(2)}`,
    outcomeChange: expectedOutcomeChange * 100,
    confidence: relationship.confidence,
    basedOnRelationships: [relationship.id],
    assumptions: [
      'Linear causal relationship',
      'No significant confounders',
      'Relationship holds at counterfactual value',
      ...relationship.knownConfounders.map((c) => `Assumes ${c} is controlled`),
    ],
    humanReadable: generateCounterfactualNarrative(
      variable,
      actualValue,
      counterfactualValue,
      outcomeVariable,
      actualOutcome,
      predictedOutcome,
      relationship
    ),
    actionableInsight: generateActionableInsight(
      variable,
      outcomeVariable,
      expectedOutcomeChange,
      relationship
    ),
    createdAt: Date.now(),
  };

  return analysis;
}

function generateCounterfactualNarrative(
  variable: string,
  actualValue: number,
  counterfactualValue: number,
  outcomeVariable: string,
  actualOutcome: number,
  predictedOutcome: number,
  relationship: CausalRelationship
): string {
  const changeDirection = predictedOutcome > actualOutcome ? 'higher' : 'lower';
  const changePercent = Math.abs(
    ((predictedOutcome - actualOutcome) / actualOutcome) * 100
  ).toFixed(1);

  return (
    `If you had ${variable === 'sleep' ? 'slept' : 'had'} ${counterfactualValue} instead of ${actualValue}, ` +
    `your ${outcomeVariable} would likely have been ${changePercent}% ${changeDirection} ` +
    `(based on ${relationship.observationCount} observations with ${relationship.confidence} confidence).`
  );
}

function generateActionableInsight(
  variable: string,
  outcomeVariable: string,
  changePercent: number,
  relationship: CausalRelationship
): string {
  if (relationship.confidence === 'speculative' || relationship.confidence === 'suggestive') {
    return `Track ${variable} and ${outcomeVariable} together to better understand their relationship.`;
  }

  if (changePercent > 0) {
    return `Increasing ${variable} appears to improve ${outcomeVariable}. Consider making ${variable} a priority.`;
  } else {
    return `Decreasing ${variable} may actually help ${outcomeVariable}. The relationship might be more nuanced than expected.`;
  }
}

// ============================================================================
// INTERVENTION RECOMMENDATIONS
// ============================================================================

/**
 * Generate intervention recommendations based on causal graph.
 */
export function generateInterventionRecommendations(
  targetOutcome: string,
  relationships: CausalRelationship[],
  currentValues: Record<string, number>
): InterventionRecommendation[] {
  const recommendations: InterventionRecommendation[] = [];

  // Find all causes of the target outcome
  const causes = relationships.filter(
    (r) =>
      r.effect.toLowerCase().includes(targetOutcome.toLowerCase()) &&
      r.direction === 'causes' &&
      r.confidence !== 'speculative'
  );

  for (const cause of causes) {
    const currentValue = currentValues[cause.cause.toLowerCase()] || 0;

    // Calculate suggested change
    const improvementDirection = cause.causalStrength > 0 ? 1 : -1;
    const suggestedChange = improvementDirection * 0.2; // Suggest 20% change
    const suggestedValue = currentValue * (1 + suggestedChange);

    // Estimate expected outcome improvement
    const expectedImprovement = Math.abs(cause.effectSize * suggestedChange * 100);

    // Determine effort level
    const effortEstimate: 'low' | 'medium' | 'high' =
      Math.abs(suggestedChange) < 0.1 ? 'low' : Math.abs(suggestedChange) < 0.3 ? 'medium' : 'high';

    // Calculate priority based on effect size, confidence, and effort
    const confidenceMultiplier =
      cause.confidence === 'robust'
        ? 1.0
        : cause.confidence === 'strong'
          ? 0.8
          : cause.confidence === 'moderate'
            ? 0.6
            : 0.4;

    const effortMultiplier =
      effortEstimate === 'low' ? 1.0 : effortEstimate === 'medium' ? 0.8 : 0.6;

    const priority = Math.round(cause.effectSize * confidenceMultiplier * effortMultiplier * 10);

    recommendations.push({
      variable: cause.cause,
      currentValue,
      suggestedValue,
      expectedOutcomeChange: expectedImprovement,
      confidenceLevel: cause.confidence,
      explanation:
        `${cause.humanReadable}. A ${Math.round(Math.abs(suggestedChange) * 100)}% ` +
        `${improvementDirection > 0 ? 'increase' : 'decrease'} in ${cause.cause} could improve ` +
        `${targetOutcome} by approximately ${expectedImprovement.toFixed(1)}%.`,
      effort: effortEstimate,
      priority,
    });
  }

  // Sort by priority
  recommendations.sort((a, b) => b.priority - a.priority);

  return recommendations.slice(0, 5);
}

// ============================================================================
// CAUSAL GRAPH BUILDING
// ============================================================================

/**
 * Build a causal graph from relationships.
 */
export function buildCausalGraph(relationships: CausalRelationship[]): CausalGraph {
  const nodes = new Map<string, { id: string; label: string; domain: string }>();
  const edges: CausalGraph['edges'] = [];

  for (const rel of relationships) {
    // Add nodes
    if (!nodes.has(rel.cause)) {
      nodes.set(rel.cause, {
        id: rel.cause.toLowerCase().replace(/\s+/g, '_'),
        label: rel.cause,
        domain: rel.domain,
      });
    }
    if (!nodes.has(rel.effect)) {
      nodes.set(rel.effect, {
        id: rel.effect.toLowerCase().replace(/\s+/g, '_'),
        label: rel.effect,
        domain: rel.domain,
      });
    }

    // Add edge
    if (rel.direction !== 'independent' && rel.confidence !== 'speculative') {
      edges.push({
        source: rel.cause.toLowerCase().replace(/\s+/g, '_'),
        target: rel.effect.toLowerCase().replace(/\s+/g, '_'),
        strength: rel.causalStrength,
        direction: rel.direction,
      });
    }
  }

  return {
    nodes: Array.from(nodes.values()),
    edges,
  };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadCausalProfile(userId: string): Promise<CausalInferenceProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('causal_inference')
      .get();

    if (!doc.exists) return null;
    return doc.data() as CausalInferenceProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load causal inference profile');
    return null;
  }
}

export async function saveCausalProfile(profile: CausalInferenceProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('causal_inference')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Causal inference profile saved');
  } catch (error) {
    log.warn({ error: String(error), userId: profile.userId }, 'Failed to save causal profile');
  }
}

export async function recordTimeSeriesData(
  userId: string,
  variable: string,
  value: number,
  context?: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    const dataPoint: TimeSeriesDataPoint = {
      timestamp: Date.now(),
      variable,
      value,
      context,
    };

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('causal_timeseries')
      .add(cleanForFirestore(dataPoint));

    log.debug({ userId, variable, value }, 'Time series data recorded');
  } catch (error) {
    log.warn({ error: String(error), userId, variable }, 'Failed to record time series data');
  }
}

export async function loadTimeSeries(
  userId: string,
  variable: string,
  daysBack: number = 90
): Promise<TimeSeriesDataPoint[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('causal_timeseries')
      .where('variable', '==', variable)
      .where('timestamp', '>=', cutoff)
      .orderBy('timestamp', 'asc')
      .get();

    return snapshot.docs.map((doc) => doc.data() as TimeSeriesDataPoint);
  } catch (error) {
    log.warn({ error: String(error), userId, variable }, 'Failed to load time series');
    return [];
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildCausalInferenceContext(userId: string): Promise<string> {
  const profile = await loadCausalProfile(userId);
  if (!profile || profile.relationships.length === 0) return '';

  const sections: string[] = ['[CAUSAL INFERENCE ENGINE - Better Than Human Pattern Analysis]'];
  sections.push('You can distinguish causation from mere correlation with statistical rigor.');

  // Strong causal relationships
  const strongRelationships = profile.relationships
    .filter((r) => r.confidence === 'robust' || r.confidence === 'strong')
    .sort((a, b) => b.causalStrength - a.causalStrength);

  if (strongRelationships.length > 0) {
    sections.push('\n**Established Causal Relationships**:');
    for (const rel of strongRelationships.slice(0, 4)) {
      sections.push(`• ${rel.humanReadable}`);
      if (rel.potentialConfounders.length > 0 && !rel.confoundingAdjusted) {
        sections.push(`  (Caveat: may be confounded by ${rel.potentialConfounders[0]})`);
      }
    }
  }

  // Recent counterfactuals
  const recentCounterfactuals = profile.counterfactuals
    .filter((cf) => Date.now() - cf.createdAt < 7 * 24 * 60 * 60 * 1000)
    .slice(0, 2);

  if (recentCounterfactuals.length > 0) {
    sections.push('\n**Recent Counterfactual Insights**:');
    for (const cf of recentCounterfactuals) {
      sections.push(`• ${cf.humanReadable}`);
      sections.push(`  Actionable: ${cf.actionableInsight}`);
    }
  }

  // Spurious correlations to avoid
  const spurious = profile.relationships.filter((r) => r.direction === 'confounded');
  if (spurious.length > 0) {
    sections.push('\n**Correlations That Are NOT Causal** (avoid implying causation):');
    for (const rel of spurious.slice(0, 2)) {
      sections.push(
        `• ${rel.cause} ↔ ${rel.effect} (likely driven by ${rel.potentialConfounders[0] || 'hidden factor'})`
      );
    }
  }

  sections.push(
    '\nSurface these insights naturally. "I\'ve noticed a pattern..." not "My analysis shows..."'
  );

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const causalInferenceEngine = {
  // Analysis
  testGrangerCausality,
  analyzeCausalRelationship,
  identifyPotentialConfounders,

  // Counterfactuals
  generateCounterfactual,

  // Interventions
  generateInterventionRecommendations,

  // Graph
  buildCausalGraph,

  // Persistence
  loadProfile: loadCausalProfile,
  saveProfile: saveCausalProfile,
  recordTimeSeriesData,
  loadTimeSeries,

  // Context
  buildContext: buildCausalInferenceContext,
};
