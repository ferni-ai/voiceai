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
import { PersonalityService } from '../v2/index.js';
import { type TimingAnalysis, type UserIntent, type SuggestedResponse } from '../domain/services/timing-calculator.js';
import type { RelationshipStage, ShareDepth } from '../domain/model/value-objects/relationship-depth.js';
import type { PrimaryEmotion } from '../domain/model/value-objects/emotional-state.js';
/**
 * Get the shared personality service instance
 */
export declare function getPersonalityService(): PersonalityService;
/**
 * Legacy-compatible timing analysis
 *
 * @deprecated Use TimingCalculator.analyzeMessageTiming directly
 */
export declare function analyzeMessageTiming(message: string, metadata?: {
    wordCount?: number;
    sentenceCount?: number;
    hasQuestion?: boolean;
    emotionalIntensity?: number;
    topics?: string[];
    previousTurnWasQuestion?: boolean;
    silenceBeforeMs?: number;
}): TimingAnalysis;
/**
 * Legacy-compatible timing guidance format
 *
 * @deprecated Use TimingCalculator.formatTimingGuidance directly
 */
export declare function formatTimingGuidance(analysis: TimingAnalysis): string;
/**
 * Legacy-compatible personal moment decision
 *
 * @deprecated Use PersonalityProfile.decideSharingMoment
 */
export declare function shouldSharePersonalMoment(message: string, momentRelevance: number, emotionalState: {
    isNegative: boolean;
    intensity: number;
}, relationshipStage: RelationshipStage): {
    should: boolean;
    reason: string;
};
/**
 * Legacy-compatible emotional data recording
 *
 * @deprecated Use PersonalityService.recordMoment
 */
export declare function recordEmotionalDataPoint(userId: string, personaId: string, message: string, detectedEmotion?: PrimaryEmotion, topics?: string[]): Promise<void>;
/**
 * Legacy-compatible pattern insights retrieval
 *
 * @deprecated Use PersonalityService.buildContext
 */
export declare function getPatternInsights(userId: string, personaId: string): Promise<Array<{
    insight: string;
    confidence: number;
}>>;
/**
 * Legacy-compatible growth celebrations retrieval
 *
 * @deprecated Use PersonalityService.buildContext
 */
export declare function getGrowthCelebrations(userId: string, personaId: string): Promise<Array<{
    celebration: string;
    significance: string;
}>>;
/**
 * Legacy-compatible pattern format
 *
 * @deprecated Use EmotionalPattern.formatForPrompt
 */
export declare function formatPatternForPrompt(pattern: {
    insight: string;
    confidence: number;
}): string;
/**
 * Legacy-compatible growth format
 *
 * @deprecated Use GrowthMilestone.formatForPrompt
 */
export declare function formatGrowthForPrompt(growth: {
    celebration: string;
    significance: string;
}): string;
/**
 * Legacy-compatible vulnerability detection
 *
 * @deprecated Use VulnerabilityScorer.detectVulnerability
 */
export declare function detectVulnerability(message: string): {
    isVulnerable: boolean;
    level: string;
    isFirstTime: boolean;
    acknowledgment: string;
};
/**
 * Legacy-compatible anticipation
 *
 * @deprecated Use AnticipationEngine.anticipateFromContext
 */
export declare function anticipateEmotion(partialTranscript?: string, voiceTone?: 'rising' | 'falling' | 'flat' | 'breaking'): {
    emotion: PrimaryEmotion;
    confidence: number;
} | null;
/**
 * Build complete personality context (v2 API)
 *
 * This is the recommended way to get personality intelligence.
 */
export declare function buildPersonalityContext(params: {
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
    anticipatedEmotion: {
        emotion: PrimaryEmotion;
        confidence: number;
    } | null;
}>;
export type { TimingAnalysis, UserIntent, SuggestedResponse, RelationshipStage, ShareDepth };
//# sourceMappingURL=legacy-bridge.d.ts.map