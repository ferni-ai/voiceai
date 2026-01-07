/**
 * Trajectory Pattern Library - Embedding-Powered
 *
 * Embeds past emotional trajectories to match current patterns against
 * historical precedent.
 *
 * Example: "Last time you had similar signals, anxiety spike happened within 3 days."
 *
 * This enables learning from the user's own history to predict their future.
 *
 * @module intelligence/predictive/embeddings/trajectory-patterns
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, embedBatch, cosineSimilarity, findTopK } from '../../../memory/embeddings.js';
import type { EmotionalTrajectory, PrecursorSignal } from '../pre-trajectory-detection.js';

const log = createLogger({ module: 'TrajectoryPatterns' });

// ============================================================================
// TYPES
// ============================================================================

export interface TrajectoryPattern {
  id: string;
  userId: string;
  
  // The trajectory that occurred
  trajectory: EmotionalTrajectory;
  severity: number;  // 0-1
  duration: number;  // hours
  
  // Embeddings
  trajectoryEmbedding: number[];   // Embed the sequence of states
  precursorEmbedding: number[];    // Embed the signals that preceded
  contextEmbedding: number[];      // Embed the life context
  
  // Precursor details
  precursorSignals: Array<{
    signal: PrecursorSignal;
    value: number;
    daysBeforeOnset: number;
  }>;
  
  // Context
  contextDescription: string;
  lifeDomains: string[];  // What life areas were involved
  
  // Temporal
  recordedAt: number;
  onsetAt: number;
  resolvedAt?: number;
  
  // Outcome
  resolution: 'natural' | 'intervention' | 'escalation' | 'ongoing';
  helpfulInterventions?: string[];
}

export interface PatternMatch {
  pattern: TrajectoryPattern;
  overallSimilarity: number;
  precursorSimilarity: number;
  contextSimilarity: number;
  confidence: number;
  implication: string;
}

export interface TrajectoryPrediction {
  likelyTrajectory: EmotionalTrajectory;
  probability: number;
  expectedOnset: string;  // "within 2-3 days"
  expectedSeverity: number;
  basedOn: PatternMatch[];
  preventiveActions: string[];
}

export interface CurrentSignalState {
  signals: Array<{ signal: PrecursorSignal; value: number }>;
  contextDescription: string;
  lifeDomains: string[];
  emotionalState: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const userPatternLibrary = new Map<string, TrajectoryPattern[]>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Record a trajectory pattern after it completes
 */
export async function recordTrajectoryPattern(
  userId: string,
  pattern: Omit<TrajectoryPattern, 'id' | 'trajectoryEmbedding' | 'precursorEmbedding' | 'contextEmbedding'>
): Promise<TrajectoryPattern> {
  const patterns = userPatternLibrary.get(userId) || [];
  
  // Build text representations for embedding
  const trajectoryText = buildTrajectoryText(pattern);
  const precursorText = buildPrecursorText(pattern.precursorSignals);
  const contextText = pattern.contextDescription;
  
  // Generate embeddings
  const [trajectoryEmbedding, precursorEmbedding, contextEmbedding] = await embedBatch([
    trajectoryText,
    precursorText,
    contextText,
  ]);
  
  const fullPattern: TrajectoryPattern = {
    ...pattern,
    id: `traj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    trajectoryEmbedding,
    precursorEmbedding,
    contextEmbedding,
  };
  
  patterns.push(fullPattern);
  userPatternLibrary.set(userId, patterns);
  
  log.info(
    { userId, trajectory: pattern.trajectory, severity: pattern.severity },
    '📈 Recorded trajectory pattern'
  );
  
  return fullPattern;
}

/**
 * Find similar patterns from history
 */
export async function findSimilarPatterns(
  userId: string,
  currentState: CurrentSignalState,
  k = 5
): Promise<PatternMatch[]> {
  const patterns = userPatternLibrary.get(userId) || [];
  if (patterns.length === 0) return [];
  
  // Embed current state
  const precursorText = buildPrecursorText(
    currentState.signals.map((s) => ({
      signal: s.signal,
      value: s.value,
      daysBeforeOnset: 0,
    }))
  );
  const contextText = currentState.contextDescription;
  
  const [currentPrecursorEmb, currentContextEmb] = await embedBatch([
    precursorText,
    contextText,
  ]);
  
  // Score all patterns
  const scored: PatternMatch[] = [];
  
  for (const pattern of patterns) {
    const precursorSimilarity = cosineSimilarity(currentPrecursorEmb, pattern.precursorEmbedding);
    const contextSimilarity = cosineSimilarity(currentContextEmb, pattern.contextEmbedding);
    
    // Weight precursor similarity higher
    const overallSimilarity = precursorSimilarity * 0.6 + contextSimilarity * 0.4;
    
    // Confidence based on pattern quality
    const recency = (Date.now() - pattern.recordedAt) / (30 * 24 * 60 * 60 * 1000); // months ago
    const recencyFactor = Math.max(0.5, 1 - recency * 0.1);
    const confidence = overallSimilarity * recencyFactor;
    
    // Generate implication
    const implication = generateImplication(pattern, precursorSimilarity);
    
    scored.push({
      pattern,
      overallSimilarity,
      precursorSimilarity,
      contextSimilarity,
      confidence,
      implication,
    });
  }
  
  return scored
    .filter((m) => m.overallSimilarity > 0.5)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, k);
}

/**
 * Predict trajectory based on pattern matching
 */
export async function predictTrajectoryFromPatterns(
  userId: string,
  currentState: CurrentSignalState
): Promise<TrajectoryPrediction | null> {
  const matches = await findSimilarPatterns(userId, currentState, 5);
  
  if (matches.length === 0) return null;
  
  // Aggregate predictions from matches
  const trajectoryVotes: Record<string, { count: number; totalWeight: number; severities: number[]; onsets: number[] }> = {};
  
  for (const match of matches) {
    const traj = match.pattern.trajectory;
    if (!trajectoryVotes[traj]) {
      trajectoryVotes[traj] = { count: 0, totalWeight: 0, severities: [], onsets: [] };
    }
    
    trajectoryVotes[traj].count++;
    trajectoryVotes[traj].totalWeight += match.confidence;
    trajectoryVotes[traj].severities.push(match.pattern.severity);
    
    // Estimate onset based on historical lead time
    const avgLeadTime = match.pattern.precursorSignals.reduce(
      (sum, s) => sum + s.daysBeforeOnset,
      0
    ) / (match.pattern.precursorSignals.length || 1);
    trajectoryVotes[traj].onsets.push(avgLeadTime);
  }
  
  // Find most likely trajectory
  const sorted = Object.entries(trajectoryVotes)
    .map(([trajectory, data]) => ({
      trajectory: trajectory as EmotionalTrajectory,
      probability: data.totalWeight / matches.reduce((sum, m) => sum + m.confidence, 0),
      avgSeverity: data.severities.reduce((a, b) => a + b, 0) / data.severities.length,
      avgOnset: data.onsets.reduce((a, b) => a + b, 0) / data.onsets.length,
    }))
    .sort((a, b) => b.probability - a.probability);
  
  if (sorted.length === 0) return null;
  
  const top = sorted[0];
  
  // Generate preventive actions from successful resolutions
  const preventiveActions = matches
    .filter((m) => m.pattern.resolution === 'intervention' && m.pattern.helpfulInterventions)
    .flatMap((m) => m.pattern.helpfulInterventions!)
    .slice(0, 5);
  
  return {
    likelyTrajectory: top.trajectory,
    probability: top.probability,
    expectedOnset: formatOnset(top.avgOnset),
    expectedSeverity: top.avgSeverity,
    basedOn: matches,
    preventiveActions: [...new Set(preventiveActions)],
  };
}

/**
 * Learn from trajectory outcome
 */
export async function recordTrajectoryOutcome(
  userId: string,
  patternId: string,
  outcome: {
    resolution: 'natural' | 'intervention' | 'escalation' | 'ongoing';
    actualSeverity?: number;
    actualDuration?: number;
    helpfulInterventions?: string[];
  }
): Promise<void> {
  const patterns = userPatternLibrary.get(userId) || [];
  const pattern = patterns.find((p) => p.id === patternId);
  
  if (pattern) {
    pattern.resolution = outcome.resolution;
    if (outcome.actualSeverity !== undefined) pattern.severity = outcome.actualSeverity;
    if (outcome.actualDuration !== undefined) pattern.duration = outcome.actualDuration;
    if (outcome.helpfulInterventions) pattern.helpfulInterventions = outcome.helpfulInterventions;
    
    log.info({ userId, patternId, resolution: outcome.resolution }, '📊 Recorded trajectory outcome');
  }
}

/**
 * Get trajectory pattern statistics
 */
export function getTrajectoryStats(userId: string): {
  totalPatterns: number;
  byTrajectory: Record<string, number>;
  avgSeverity: number;
  successfulInterventions: string[];
} {
  const patterns = userPatternLibrary.get(userId) || [];
  
  const byTrajectory: Record<string, number> = {};
  let totalSeverity = 0;
  const interventions: string[] = [];
  
  for (const pattern of patterns) {
    byTrajectory[pattern.trajectory] = (byTrajectory[pattern.trajectory] || 0) + 1;
    totalSeverity += pattern.severity;
    if (pattern.helpfulInterventions) {
      interventions.push(...pattern.helpfulInterventions);
    }
  }
  
  return {
    totalPatterns: patterns.length,
    byTrajectory,
    avgSeverity: patterns.length > 0 ? totalSeverity / patterns.length : 0,
    successfulInterventions: [...new Set(interventions)],
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildTrajectoryText(pattern: Partial<TrajectoryPattern>): string {
  const parts = [
    `trajectory: ${pattern.trajectory}`,
    `severity: ${pattern.severity?.toFixed(2) || 'unknown'}`,
    `duration: ${pattern.duration ? `${pattern.duration} hours` : 'unknown'}`,
    `resolution: ${pattern.resolution || 'unknown'}`,
  ];
  
  if (pattern.lifeDomains?.length) {
    parts.push(`domains: ${pattern.lifeDomains.join(', ')}`);
  }
  
  return parts.join(' | ');
}

function buildPrecursorText(
  signals: Array<{ signal: PrecursorSignal; value: number; daysBeforeOnset: number }>
): string {
  if (signals.length === 0) return 'no precursor signals';
  
  return signals
    .map((s) => `${s.signal.replace(/_/g, ' ')}: ${s.value.toFixed(2)} (${s.daysBeforeOnset}d before)`)
    .join(', ');
}

function generateImplication(pattern: TrajectoryPattern, similarity: number): string {
  const confidenceWord = similarity > 0.8 ? 'strongly' : similarity > 0.6 ? 'moderately' : 'somewhat';
  const trajectoryName = pattern.trajectory.replace(/_/g, ' ');
  const timeAgo = Math.round((Date.now() - pattern.recordedAt) / (24 * 60 * 60 * 1000));
  
  let implication = `Current signals ${confidenceWord} match a pattern from ${timeAgo} days ago that led to ${trajectoryName}`;
  
  if (pattern.severity > 0.7) {
    implication += ' (was severe)';
  }
  
  if (pattern.resolution === 'intervention' && pattern.helpfulInterventions?.length) {
    implication += `. What helped: ${pattern.helpfulInterventions[0]}`;
  }
  
  return implication;
}

function formatOnset(daysFromNow: number): string {
  if (daysFromNow < 1) return 'within 24 hours';
  if (daysFromNow < 2) return 'within 1-2 days';
  if (daysFromNow < 4) return 'within 2-4 days';
  if (daysFromNow < 7) return 'within a week';
  return 'within 1-2 weeks';
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build trajectory pattern context for LLM
 */
export async function buildTrajectoryPatternContext(
  userId: string,
  currentState: CurrentSignalState
): Promise<string> {
  const prediction = await predictTrajectoryFromPatterns(userId, currentState);
  
  if (!prediction || prediction.probability < 0.4) return '';
  
  const sections: string[] = ['[TRAJECTORY PATTERN INTELLIGENCE]'];
  
  sections.push(`\nPattern match detected (${Math.round(prediction.probability * 100)}% confidence):`);
  sections.push(`• Similar signals in past led to: ${prediction.likelyTrajectory.replace(/_/g, ' ')}`);
  sections.push(`• Expected timing: ${prediction.expectedOnset}`);
  sections.push(`• Expected severity: ${Math.round(prediction.expectedSeverity * 100)}%`);
  
  if (prediction.preventiveActions.length > 0) {
    sections.push('\nWhat helped before:');
    for (const action of prediction.preventiveActions.slice(0, 3)) {
      sections.push(`• ${action}`);
    }
  }
  
  if (prediction.basedOn.length > 0) {
    sections.push(`\nBased on ${prediction.basedOn.length} similar historical patterns.`);
  }
  
  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const trajectoryPatterns = {
  recordTrajectoryPattern,
  findSimilarPatterns,
  predictTrajectoryFromPatterns,
  recordTrajectoryOutcome,
  getTrajectoryStats,
  buildTrajectoryPatternContext,
};

export default trajectoryPatterns;
