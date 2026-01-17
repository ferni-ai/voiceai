/**
 * Legacy Personality Bridge
 *
 * Provides backward-compatible access to v2 personality through legacy interfaces.
 * This allows gradual migration from old personality module to v2.
 *
 * Usage:
 *   // Instead of importing from old modules:
 *   import { analyzeMessageTiming } from './timing-intelligence.js';
 *
 *   // You can now use:
 *   import { analyzeMessageTiming } from './infrastructure/legacy-bridge.js';
 *
 * @module personality/infrastructure/legacy-bridge
 */

import { PersonalityService, createPersonalityService } from '../v2/index.js';
import { TimingCalculator, type TimingAnalysis, type UserIntent, type SuggestedResponse } from '../domain/services/timing-calculator.js';
import { VulnerabilityScorer } from '../domain/services/vulnerability-scorer.js';
import { AnticipationEngine } from '../domain/services/anticipation-engine.js';
import type { RelationshipStage, ShareDepth } from '../domain/model/value-objects/relationship-depth.js';
import type { PrimaryEmotion } from '../domain/model/value-objects/emotional-state.js';
import { getFirestorePersonalityRepository } from './firestore-personality-repository.js';
import { getVoiceAnalyzerAdapter } from './adapters/voice-analyzer-adapter.js';
import { getEmotionDetectorAdapter } from './adapters/emotion-detector-adapter.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PersonalityLegacyBridge' });

// Singleton instances
let personalityService: PersonalityService | null = null;
const timingCalculator = new TimingCalculator();
const vulnerabilityScorer = new VulnerabilityScorer();
const anticipationEngine = new AnticipationEngine();

/**
 * Get the shared personality service instance
 */
export function getPersonalityService(): PersonalityService {
  if (!personalityService) {
    personalityService = createPersonalityService({
      repository: getFirestorePersonalityRepository(),
      voiceAnalyzer: getVoiceAnalyzerAdapter(),
      emotionDetector: getEmotionDetectorAdapter(),
    });
  }
  return personalityService;
}

// ============================================================================
// TIMING INTELLIGENCE BRIDGE
// ============================================================================

/**
 * Legacy-compatible timing analysis
 *
 * @deprecated Use TimingCalculator.analyzeMessageTiming directly
 */
export function analyzeMessageTiming(
  message: string,
  metadata?: {
    wordCount?: number;
    sentenceCount?: number;
    hasQuestion?: boolean;
    emotionalIntensity?: number;
    topics?: string[];
    previousTurnWasQuestion?: boolean;
    silenceBeforeMs?: number;
  }
): TimingAnalysis {
  return timingCalculator.analyzeMessageTiming(message, metadata);
}

/**
 * Legacy-compatible timing guidance format
 *
 * @deprecated Use TimingCalculator.formatTimingGuidance directly
 */
export function formatTimingGuidance(analysis: TimingAnalysis): string {
  return timingCalculator.formatTimingGuidance(analysis);
}

/**
 * Legacy-compatible personal moment decision
 *
 * @deprecated Use PersonalityProfile.decideSharingMoment
 */
export function shouldSharePersonalMoment(
  message: string,
  momentRelevance: number,
  emotionalState: { isNegative: boolean; intensity: number },
  relationshipStage: RelationshipStage
): { should: boolean; reason: string } {
  // Create temporary state objects for the new API
  const { RelationshipDepth } = require('../domain/model/value-objects/relationship-depth.js');
  const { EmotionalState } = require('../domain/model/value-objects/emotional-state.js');

  const stageToScores: Record<RelationshipStage, { vulnerability: number; safety: number }> = {
    stranger: { vulnerability: 0, safety: 30 },
    acquaintance: { vulnerability: 15, safety: 45 },
    friend: { vulnerability: 40, safety: 60 },
    trusted: { vulnerability: 65, safety: 75 },
    intimate: { vulnerability: 85, safety: 90 },
  };

  const scores = stageToScores[relationshipStage] ?? stageToScores.acquaintance;

  const depth = RelationshipDepth.create({
    vulnerabilityScore: scores.vulnerability,
    trustVelocity: 2,
    sharedHistoryDensity: scores.vulnerability * 0.8,
    emotionalSafetyIndex: scores.safety,
  });

  const state = EmotionalState.create({
    primary: emotionalState.isNegative ? 'sadness' : 'neutral',
    intensity: emotionalState.intensity,
  });

  return timingCalculator.shouldSharePersonalMoment(message, momentRelevance, state, depth);
}

// ============================================================================
// EMOTIONAL PATTERNS BRIDGE
// ============================================================================

/**
 * Legacy-compatible emotional data recording
 *
 * @deprecated Use PersonalityService.recordMoment
 */
export async function recordEmotionalDataPoint(
  userId: string,
  personaId: string,
  message: string,
  detectedEmotion?: PrimaryEmotion,
  topics?: string[]
): Promise<void> {
  try {
    const service = getPersonalityService();
    await service.recordMoment({
      userId,
      personaId,
      message,
      topics,
    });
  } catch (error) {
    log.warn({ error, userId }, 'Failed to record emotional data point via bridge');
  }
}

/**
 * Legacy-compatible pattern insights retrieval
 *
 * @deprecated Use PersonalityService.buildContext
 */
export async function getPatternInsights(
  userId: string,
  personaId: string
): Promise<Array<{ insight: string; confidence: number }>> {
  try {
    const service = getPersonalityService();
    const context = await service.buildContext({ userId, personaId });

    return context.surfaceablePatterns.map((p) => ({
      insight: p.insightToShare,
      confidence: p.confidence,
    }));
  } catch (error) {
    log.warn({ error, userId }, 'Failed to get pattern insights via bridge');
    return [];
  }
}

/**
 * Legacy-compatible growth celebrations retrieval
 *
 * @deprecated Use PersonalityService.buildContext
 */
export async function getGrowthCelebrations(
  userId: string,
  personaId: string
): Promise<Array<{ celebration: string; significance: string }>> {
  try {
    const service = getPersonalityService();
    const context = await service.buildContext({ userId, personaId });

    return context.celebratableMilestones.map((m) => ({
      celebration: m.celebrationMessage,
      significance: m.significance,
    }));
  } catch (error) {
    log.warn({ error, userId }, 'Failed to get growth celebrations via bridge');
    return [];
  }
}

/**
 * Legacy-compatible pattern format
 *
 * @deprecated Use EmotionalPattern.formatForPrompt
 */
export function formatPatternForPrompt(pattern: { insight: string; confidence: number }): string {
  return [
    '[🔍 PATTERN INSIGHT]',
    '',
    pattern.insight,
    `Confidence: ${Math.round(pattern.confidence * 100)}%`,
  ].join('\n');
}

/**
 * Legacy-compatible growth format
 *
 * @deprecated Use GrowthMilestone.formatForPrompt
 */
export function formatGrowthForPrompt(growth: { celebration: string; significance: string }): string {
  const emoji = growth.significance === 'breakthrough' ? '🌟' : growth.significance === 'significant' ? '✨' : '🌱';
  return [
    `[${emoji} GROWTH CELEBRATION]`,
    '',
    growth.celebration,
  ].join('\n');
}

// ============================================================================
// VULNERABILITY BRIDGE
// ============================================================================

/**
 * Legacy-compatible vulnerability detection
 *
 * @deprecated Use VulnerabilityScorer.detectVulnerability
 */
export function detectVulnerability(message: string): {
  isVulnerable: boolean;
  level: string;
  isFirstTime: boolean;
  acknowledgment: string;
} {
  const result = vulnerabilityScorer.detectVulnerability(message);

  return {
    isVulnerable: result.isVulnerable,
    level: result.level,
    isFirstTime: result.isFirstTime,
    acknowledgment: result.suggestedAcknowledgment,
  };
}

// ============================================================================
// ANTICIPATION BRIDGE
// ============================================================================

/**
 * Legacy-compatible anticipation
 *
 * @deprecated Use AnticipationEngine.anticipateFromContext
 */
export function anticipateEmotion(
  partialTranscript?: string,
  voiceTone?: 'rising' | 'falling' | 'flat' | 'breaking'
): { emotion: PrimaryEmotion; confidence: number } | null {
  const anticipated = anticipationEngine.anticipateFromContext(
    { partialTranscript, voiceTone },
    []
  );

  if (!anticipated) return null;

  return {
    emotion: anticipated.emotion,
    confidence: anticipated.confidenceScore,
  };
}

// ============================================================================
// FULL CONTEXT BRIDGE
// ============================================================================

/**
 * Build complete personality context (v2 API)
 *
 * This is the recommended way to get personality intelligence.
 */
export async function buildPersonalityContext(params: {
  userId: string;
  personaId: string;
  currentMessage?: string;
  partialTranscript?: string;
  topics?: string[];
  turnCount?: number;
}): Promise<{
  formattedContext: string;
  relationshipStage: RelationshipStage;
  shouldHoldSpace: boolean;
  anticipatedEmotion: { emotion: PrimaryEmotion; confidence: number } | null;
}> {
  const service = getPersonalityService();
  const context = await service.buildContext(params);

  return {
    formattedContext: context.formattedContext,
    relationshipStage: context.relationshipStage as RelationshipStage,
    shouldHoldSpace: context.shouldHoldSpace,
    anticipatedEmotion: context.anticipatedEmotion
      ? {
          emotion: context.anticipatedEmotion.emotion,
          confidence: context.anticipatedEmotion.confidenceScore,
        }
      : null,
  };
}

// Re-export types for convenience
export type { TimingAnalysis, UserIntent, SuggestedResponse, RelationshipStage, ShareDepth };
