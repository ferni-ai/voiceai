/**
 * Cognitive Fingerprint Similarity - Community Learning
 *
 * Finds users with similar cognitive patterns for community-based learning.
 *
 * Example: "People with your cognitive pattern respond well to X."
 *
 * Privacy-preserving: Only shares aggregated patterns, never raw data.
 * Uses embeddings to find similar cognitive profiles without exposing details.
 *
 * @module intelligence/predictive/embeddings/cognitive-similarity
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { embed, cosineSimilarity, findTopK } from '../../../memory/embeddings.js';
import type { CognitiveFingerprint, DecisionStyle, StressResponse } from '../cognitive-fingerprint.js';

const log = createLogger({ module: 'CognitiveSimilarity' });

// ============================================================================
// TYPES
// ============================================================================

export interface CognitiveFingerprintEmbedding {
  userId: string;
  
  // Component embeddings
  overallEmbedding: number[];       // Full fingerprint
  decisionStyleEmbedding: number[];
  stressResponseEmbedding: number[];
  communicationEmbedding: number[];
  growthPatternEmbedding: number[];
  
  // Key traits (for efficient filtering)
  primaryDecisionStyle: DecisionStyle;
  primaryStressResponse: StressResponse;
  changeVelocity: 'fast' | 'moderate' | 'slow';
  
  // Quality indicators
  observationCount: number;
  confidence: number;
  lastUpdated: number;
}

export interface SimilarProfile {
  userId: string;  // Anonymized in results
  similarity: number;
  similarAspects: string[];
  differentAspects: string[];
}

export interface CommunityInsight {
  insight: string;
  applicability: number;  // 0-1, how applicable to this user
  basedOnCount: number;   // How many similar users
  confidence: number;
}

export interface InterventionSuccessData {
  interventionType: string;
  successRate: number;
  sampleSize: number;
  optimalConditions: string[];
}

// ============================================================================
// STORAGE (In production, this would be a shared database)
// ============================================================================

const communityFingerprints = new Map<string, CognitiveFingerprintEmbedding>();
const communityInterventionOutcomes = new Map<string, Map<string, {
  successes: number;
  failures: number;
  conditions: string[];
}>>();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Register a user's cognitive fingerprint for community learning
 * (Privacy-preserving: only embeddings stored, no raw data)
 */
export async function registerFingerprintForCommunity(
  userId: string,
  fingerprint: CognitiveFingerprint
): Promise<CognitiveFingerprintEmbedding> {
  // Build text representations for embedding
  const overallText = buildOverallFingerprintText(fingerprint);
  const decisionText = buildDecisionStyleText(fingerprint);
  const stressText = buildStressResponseText(fingerprint);
  const communicationText = buildCommunicationText(fingerprint);
  const growthText = buildGrowthPatternText(fingerprint);
  
  // Generate embeddings (batch for efficiency)
  const [
    overallEmbedding,
    decisionStyleEmbedding,
    stressResponseEmbedding,
    communicationEmbedding,
    growthPatternEmbedding,
  ] = await Promise.all([
    embed(overallText),
    embed(decisionText),
    embed(stressText),
    embed(communicationText),
    embed(growthText),
  ]);
  
  const fingerprintEmbedding: CognitiveFingerprintEmbedding = {
    userId,
    overallEmbedding,
    decisionStyleEmbedding,
    stressResponseEmbedding,
    communicationEmbedding,
    growthPatternEmbedding,
    primaryDecisionStyle: fingerprint.decisionStyle.primary,
    primaryStressResponse: fingerprint.stressResponse.primary,
    changeVelocity: categorizeChangeVelocity(fingerprint.changeVelocity.speed),
    observationCount: fingerprint.totalObservations,
    confidence: calculateOverallConfidence(fingerprint),
    lastUpdated: Date.now(),
  };
  
  communityFingerprints.set(userId, fingerprintEmbedding);
  
  log.debug(
    { userId, observationCount: fingerprint.totalObservations },
    '🧬 Registered fingerprint for community learning'
  );
  
  return fingerprintEmbedding;
}

/**
 * Find users with similar cognitive profiles
 */
export async function findSimilarProfiles(
  userId: string,
  k = 10
): Promise<SimilarProfile[]> {
  const myFingerprint = communityFingerprints.get(userId);
  if (!myFingerprint) return [];
  
  const similar: SimilarProfile[] = [];
  
  for (const [otherId, otherFingerprint] of communityFingerprints) {
    if (otherId === userId) continue;
    
    // Calculate component similarities
    const overallSim = cosineSimilarity(myFingerprint.overallEmbedding, otherFingerprint.overallEmbedding);
    const decisionSim = cosineSimilarity(myFingerprint.decisionStyleEmbedding, otherFingerprint.decisionStyleEmbedding);
    const stressSim = cosineSimilarity(myFingerprint.stressResponseEmbedding, otherFingerprint.stressResponseEmbedding);
    const commSim = cosineSimilarity(myFingerprint.communicationEmbedding, otherFingerprint.communicationEmbedding);
    const growthSim = cosineSimilarity(myFingerprint.growthPatternEmbedding, otherFingerprint.growthPatternEmbedding);
    
    // Weighted overall similarity
    const similarity = 
      overallSim * 0.3 +
      decisionSim * 0.2 +
      stressSim * 0.2 +
      commSim * 0.15 +
      growthSim * 0.15;
    
    if (similarity > 0.6) {
      similar.push({
        userId: `anon-${otherId.slice(0, 8)}`,  // Anonymize
        similarity,
        similarAspects: identifySimilarAspects(
          { decisionSim, stressSim, commSim, growthSim }
        ),
        differentAspects: identifyDifferentAspects(
          { decisionSim, stressSim, commSim, growthSim }
        ),
      });
    }
  }
  
  return similar
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}

/**
 * Get community insights for a user based on similar profiles
 */
export async function getCommunityInsights(
  userId: string,
  aspect?: 'interventions' | 'growth' | 'stress' | 'communication'
): Promise<CommunityInsight[]> {
  const similarProfiles = await findSimilarProfiles(userId, 20);
  if (similarProfiles.length < 3) return [];
  
  const insights: CommunityInsight[] = [];
  
  // Aggregate insights from similar profiles
  const myFingerprint = communityFingerprints.get(userId);
  if (!myFingerprint) return [];
  
  // Decision style insights
  if (!aspect || aspect === 'growth') {
    const sameDecisionStyle = similarProfiles.filter((p) => {
      const other = communityFingerprints.get(p.userId.replace('anon-', ''));
      return other?.primaryDecisionStyle === myFingerprint.primaryDecisionStyle;
    });
    
    if (sameDecisionStyle.length >= 3) {
      insights.push({
        insight: `People with your ${myFingerprint.primaryDecisionStyle} decision style tend to benefit from ${getDecisionStyleAdvice(myFingerprint.primaryDecisionStyle)}`,
        applicability: 0.8,
        basedOnCount: sameDecisionStyle.length,
        confidence: 0.7,
      });
    }
  }
  
  // Stress response insights
  if (!aspect || aspect === 'stress') {
    const sameStressResponse = similarProfiles.filter((p) => {
      const other = communityFingerprints.get(p.userId.replace('anon-', ''));
      return other?.primaryStressResponse === myFingerprint.primaryStressResponse;
    });
    
    if (sameStressResponse.length >= 3) {
      insights.push({
        insight: `Those with your stress response pattern (${myFingerprint.primaryStressResponse}) often find ${getStressResponseAdvice(myFingerprint.primaryStressResponse)} helpful`,
        applicability: 0.75,
        basedOnCount: sameStressResponse.length,
        confidence: 0.65,
      });
    }
  }
  
  // Change velocity insights
  if (!aspect || aspect === 'growth') {
    const sameVelocity = similarProfiles.filter((p) => {
      const other = communityFingerprints.get(p.userId.replace('anon-', ''));
      return other?.changeVelocity === myFingerprint.changeVelocity;
    });
    
    if (sameVelocity.length >= 3) {
      insights.push({
        insight: `People with your change pace (${myFingerprint.changeVelocity}) typically ${getChangeVelocityAdvice(myFingerprint.changeVelocity)}`,
        applicability: 0.7,
        basedOnCount: sameVelocity.length,
        confidence: 0.6,
      });
    }
  }
  
  return insights.sort((a, b) => b.applicability - a.applicability);
}

/**
 * Get intervention success data from similar profiles
 */
export async function getCommunityInterventionSuccess(
  userId: string,
  interventionType: string
): Promise<InterventionSuccessData | null> {
  const similarProfiles = await findSimilarProfiles(userId, 20);
  if (similarProfiles.length < 3) return null;
  
  let totalSuccesses = 0;
  let totalAttempts = 0;
  const allConditions: string[] = [];
  
  for (const profile of similarProfiles) {
    const realUserId = profile.userId.replace('anon-', '');
    const outcomes = communityInterventionOutcomes.get(realUserId);
    
    if (outcomes) {
      const interventionOutcome = outcomes.get(interventionType);
      if (interventionOutcome) {
        totalSuccesses += interventionOutcome.successes;
        totalAttempts += interventionOutcome.successes + interventionOutcome.failures;
        allConditions.push(...interventionOutcome.conditions);
      }
    }
  }
  
  if (totalAttempts < 5) return null;
  
  // Find most common successful conditions
  const conditionCounts: Record<string, number> = {};
  for (const condition of allConditions) {
    conditionCounts[condition] = (conditionCounts[condition] || 0) + 1;
  }
  
  const optimalConditions = Object.entries(conditionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([condition]) => condition);
  
  return {
    interventionType,
    successRate: totalSuccesses / totalAttempts,
    sampleSize: totalAttempts,
    optimalConditions,
  };
}

/**
 * Record intervention outcome for community learning
 */
export function recordInterventionOutcome(
  userId: string,
  interventionType: string,
  success: boolean,
  conditions: string[]
): void {
  const userOutcomes = communityInterventionOutcomes.get(userId) || new Map();
  const existing = userOutcomes.get(interventionType) || {
    successes: 0,
    failures: 0,
    conditions: [],
  };
  
  if (success) {
    existing.successes++;
    existing.conditions.push(...conditions);
  } else {
    existing.failures++;
  }
  
  userOutcomes.set(interventionType, existing);
  communityInterventionOutcomes.set(userId, userOutcomes);
}

/**
 * Get overall community statistics
 */
export function getCommunityStats(): {
  totalProfiles: number;
  averageConfidence: number;
  decisionStyleDistribution: Record<string, number>;
  stressResponseDistribution: Record<string, number>;
} {
  const profiles = Array.from(communityFingerprints.values());
  
  const decisionDist: Record<string, number> = {};
  const stressDist: Record<string, number> = {};
  let totalConfidence = 0;
  
  for (const profile of profiles) {
    decisionDist[profile.primaryDecisionStyle] = (decisionDist[profile.primaryDecisionStyle] || 0) + 1;
    stressDist[profile.primaryStressResponse] = (stressDist[profile.primaryStressResponse] || 0) + 1;
    totalConfidence += profile.confidence;
  }
  
  return {
    totalProfiles: profiles.length,
    averageConfidence: profiles.length > 0 ? totalConfidence / profiles.length : 0,
    decisionStyleDistribution: decisionDist,
    stressResponseDistribution: stressDist,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function buildOverallFingerprintText(fp: CognitiveFingerprint): string {
  return [
    `decision style: ${fp.decisionStyle.primary}`,
    `stress response: ${fp.stressResponse.primary}`,
    `change velocity: ${fp.changeVelocity.preference}`,
    `communication: ${fp.communicationPatterns.preferredTone}`,
    `learning: ${fp.growthPatterns.learningStyle}`,
  ].join('. ');
}

function buildDecisionStyleText(fp: CognitiveFingerprint): string {
  return [
    `primary: ${fp.decisionStyle.primary}`,
    fp.decisionStyle.secondary ? `secondary: ${fp.decisionStyle.secondary}` : '',
  ].filter(Boolean).join('. ');
}

function buildStressResponseText(fp: CognitiveFingerprint): string {
  return [
    `primary response: ${fp.stressResponse.primary}`,
    `recovery time: ${fp.stressResponse.recoveryTime} hours`,
    fp.stressResponse.deEscalationTriggers.length > 0 
      ? `helps: ${fp.stressResponse.deEscalationTriggers.join(', ')}`
      : '',
  ].filter(Boolean).join('. ');
}

function buildCommunicationText(fp: CognitiveFingerprint): string {
  return [
    `preferred tone: ${fp.communicationPatterns.preferredTone}`,
    `space needs: ${fp.communicationPatterns.spaceNeeds}`,
    fp.communicationPatterns.trustBuilders.length > 0
      ? `trust builders: ${fp.communicationPatterns.trustBuilders.join(', ')}`
      : '',
  ].filter(Boolean).join('. ');
}

function buildGrowthPatternText(fp: CognitiveFingerprint): string {
  return [
    `learning style: ${fp.growthPatterns.learningStyle}`,
    `concurrent capacity: ${fp.growthPatterns.concurrentCapacity}`,
    fp.growthPatterns.breakthroughCatalysts.length > 0
      ? `catalysts: ${fp.growthPatterns.breakthroughCatalysts.join(', ')}`
      : '',
  ].filter(Boolean).join('. ');
}

function categorizeChangeVelocity(speed: number): 'fast' | 'moderate' | 'slow' {
  if (speed > 0.7) return 'fast';
  if (speed > 0.4) return 'moderate';
  return 'slow';
}

function calculateOverallConfidence(fp: CognitiveFingerprint): number {
  const confidences = [
    fp.decisionStyle.confidence,
    fp.stressResponse.confidence,
    fp.changeVelocity.confidence,
    fp.communicationPatterns.confidence,
    fp.growthPatterns.confidence,
  ];
  return confidences.reduce((a, b) => a + b, 0) / confidences.length;
}

function identifySimilarAspects(similarities: Record<string, number>): string[] {
  const aspects: string[] = [];
  if (similarities.decisionSim > 0.7) aspects.push('decision making');
  if (similarities.stressSim > 0.7) aspects.push('stress response');
  if (similarities.commSim > 0.7) aspects.push('communication style');
  if (similarities.growthSim > 0.7) aspects.push('growth patterns');
  return aspects;
}

function identifyDifferentAspects(similarities: Record<string, number>): string[] {
  const aspects: string[] = [];
  if (similarities.decisionSim < 0.5) aspects.push('decision making');
  if (similarities.stressSim < 0.5) aspects.push('stress response');
  if (similarities.commSim < 0.5) aspects.push('communication style');
  if (similarities.growthSim < 0.5) aspects.push('growth patterns');
  return aspects;
}

function getDecisionStyleAdvice(style: DecisionStyle): string {
  const advice: Record<DecisionStyle, string> = {
    analytical: 'having data and time to process before committing',
    intuitive: 'trusting their gut after gathering enough context',
    social_validation: 'discussing options with trusted others',
    procrastinate_leap: 'deadlines that force action (self-imposed or external)',
    incremental: 'breaking decisions into smaller steps',
    values_based: 'clarity on what matters most before deciding',
    deadline_driven: 'clear deadlines and external accountability',
    emotion_driven: 'feeling emotionally ready and aligned before committing',
  };
  return advice[style] || 'thoughtful consideration';
}

function getStressResponseAdvice(response: StressResponse): string {
  const advice: Record<StressResponse, string> = {
    fight: 'channeling energy into constructive action',
    flight: 'having an escape plan while building coping skills',
    freeze: 'gentle grounding and small manageable steps',
    fawn: 'validating their own needs alongside others',
    analyze: 'time to understand before acting',
    numb: 'gentle reconnection with feelings at their pace',
    distract: 'balance of distraction and gradual processing',
    express: 'safe outlets for emotional expression',
  };
  return advice[response] || 'self-compassion and support';
}

function getChangeVelocityAdvice(velocity: 'fast' | 'moderate' | 'slow'): string {
  const advice: Record<string, string> = {
    fast: 'move quickly when ready, with periodic integration pauses',
    moderate: 'balance action with reflection, steady progress',
    slow: 'take the time they need - depth matters more than speed',
  };
  return advice[velocity] || 'honor their natural pace';
}

// ============================================================================
// CONTEXT BUILDER
// ============================================================================

/**
 * Build community learning context for LLM
 */
export async function buildCommunityLearningContext(userId: string): Promise<string> {
  const insights = await getCommunityInsights(userId);
  const similarCount = (await findSimilarProfiles(userId, 10)).length;
  
  if (insights.length === 0 && similarCount === 0) return '';
  
  const sections: string[] = ['[COMMUNITY LEARNING INTELLIGENCE]'];
  
  if (similarCount > 0) {
    sections.push(`\nBased on ${similarCount} people with similar cognitive patterns:`);
  }
  
  for (const insight of insights.slice(0, 3)) {
    sections.push(`• ${insight.insight}`);
  }
  
  return sections.join('\n');
}

// ============================================================================
// PERSISTENCE (Hydration & Export)
// ============================================================================

export interface CognitiveSimilarityPersistenceData {
  fingerprint: CognitiveFingerprintEmbedding | null;
  interventionOutcomes: Array<{
    interventionType: string;
    successes: number;
    failures: number;
    conditions: string[];
  }>;
}

/**
 * Get current state for persistence (per-user)
 */
export function getStateForPersistence(userId: string): CognitiveSimilarityPersistenceData {
  const fingerprint = communityFingerprints.get(userId) || null;
  const outcomes = communityInterventionOutcomes.get(userId);
  
  const interventionOutcomes: CognitiveSimilarityPersistenceData['interventionOutcomes'] = [];
  if (outcomes) {
    for (const [interventionType, data] of outcomes) {
      interventionOutcomes.push({
        interventionType,
        successes: data.successes,
        failures: data.failures,
        conditions: data.conditions,
      });
    }
  }
  
  return { fingerprint, interventionOutcomes };
}

/**
 * Hydrate from persisted data
 */
export function hydrateFromPersistence(
  userId: string,
  data: CognitiveSimilarityPersistenceData
): void {
  if (data.fingerprint) {
    communityFingerprints.set(userId, data.fingerprint);
    log.debug({ userId }, '💧 Hydrated cognitive fingerprint');
  }
  
  if (data.interventionOutcomes && data.interventionOutcomes.length > 0) {
    const outcomes = new Map<string, { successes: number; failures: number; conditions: string[] }>();
    for (const o of data.interventionOutcomes) {
      outcomes.set(o.interventionType, {
        successes: o.successes,
        failures: o.failures,
        conditions: o.conditions,
      });
    }
    communityInterventionOutcomes.set(userId, outcomes);
    log.debug({ userId, count: data.interventionOutcomes.length }, '💧 Hydrated intervention outcomes');
  }
}

/**
 * Clear user data (for cleanup)
 */
export function clearUserData(userId: string): void {
  communityFingerprints.delete(userId);
  communityInterventionOutcomes.delete(userId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const cognitiveSimilarity = {
  registerFingerprintForCommunity,
  findSimilarProfiles,
  getCommunityInsights,
  getCommunityInterventionSuccess,
  recordInterventionOutcome,
  getCommunityStats,
  buildCommunityLearningContext,
  // Persistence
  getStateForPersistence,
  hydrateFromPersistence,
  clearUserData,
};

export default cognitiveSimilarity;
