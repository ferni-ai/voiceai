/**
 * Ferni Personality Integration
 *
 * Unified entry point for the "Better Than Human" personality system.
 * This module orchestrates all personality subsystems:
 *
 * 1. Context Assembly - Gather all signals
 * 2. Real-time Noticing - Detect what just happened
 * 3. Expression Composition - Generate appropriate response
 * 4. Resonance Learning - Track what works
 *
 * MIGRATION NOTE (January 2026):
 * Superhuman features (anticipation, vulnerability tracking, pattern detection)
 * are being migrated to the Clean Architecture v2 system in src/personality/v2/.
 * This file continues to handle expression composition and resonance learning.
 * The v2 system runs in parallel via the personality-v2 context builder.
 *
 * Usage:
 *   const personality = await processTurnPersonality(input);
 *   if (personality) {
 *     // Inject personality.expression into response
 *     // Apply personality.noticing if present
 *   }
 *
 * @module personas/bundles/ferni/personality-integration
 */
import { composeExpression, type ComposedExpression, type PersonalityContext } from '../../shared/better-than-human-personality.js';
import { assemblePersonalityContext, type ContextAssemblerInput } from '../../shared/personality-context-assembler.js';
import { detectNoticing, type NoticingResult } from '../../shared/realtime-noticing.js';
import { recordResonanceEvent, detectEngagement } from '../../shared/personality-resonance-store.js';
import { getStats as getLLMStats } from './llm-expression-generator.js';
import type { ThemeCategory } from '../../../services/session-variety-tracker.js';
import type { BehaviorEvent } from '../../../types/behavior-types.js';
/**
 * Convert a personality noticing to a behavior event
 */
export declare function noticingToBehaviorEvent(noticing: NoticingResult): BehaviorEvent | null;
export interface PersonalityTurnInput {
    sessionId: string;
    userId?: string;
    turnCount: number;
    userTranscript: string;
    pauseBeforeMs?: number;
    speechRateWPM?: number;
    voiceEmotion?: {
        primary: string;
        confidence: number;
        arousal?: number;
        valence?: number;
    };
    textEmotion?: {
        primary: string;
        intensity: number;
        distressLevel: number;
        valence?: 'positive' | 'negative' | 'neutral';
        trajectory?: 'rising' | 'falling' | 'stable';
    };
    momentum?: 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing' | 'stalled';
    topics?: string[];
    lastTopic?: string;
    relationshipStage?: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
    totalConversations?: number;
    sharedVulnerabilities?: number;
    previousTurns?: Array<{
        userTranscript: string;
        speechRate?: number;
        pauseBefore?: number;
        voiceEmotion?: string;
        topics?: string[];
    }>;
    isHeavyTopic?: boolean;
    wasPersonalSharing?: boolean;
    userIntent?: 'sharing' | 'asking' | 'venting' | 'exploring' | 'celebrating' | 'requesting';
    previousExpression?: {
        theme: ThemeCategory;
        content: string;
    };
}
export interface PersonalityTurnResult {
    expression: ComposedExpression | null;
    noticing: NoticingResult | null;
    context: PersonalityContext;
    shouldInject: boolean;
    injectionPoint: 'before_response' | 'mid_response' | 'after_response' | 'as_acknowledgment';
    behaviorEvent: BehaviorEvent | null;
}
/**
 * Process a conversation turn for personality injection
 *
 * This is the main entry point. Call this after analysis but before
 * generating the response.
 */
export declare function processTurnPersonality(input: PersonalityTurnInput): Promise<PersonalityTurnResult>;
/**
 * Apply personality to a response
 *
 * Takes the raw response and weaves in personality elements
 */
export declare function applyPersonalityToResponse(rawResponse: string, personalityResult: PersonalityTurnResult): string;
/**
 * Cleanup session state
 */
export declare function cleanupPersonalitySession(sessionId: string): void;
/**
 * Pre-warm the LLM expression cache for a session
 * Call this at session start for better expression availability
 *
 * This does two things:
 * 1. Loads persisted high-engagement expressions from Firestore
 * 2. Queues new LLM expression generation for common themes
 */
export declare function prewarmPersonalitySession(userId: string | undefined, context: Pick<PersonalityTurnInput, 'relationshipStage' | 'textEmotion'>): Promise<void>;
export { composeExpression, type ComposedExpression, type PersonalityContext, assemblePersonalityContext, type ContextAssemblerInput, detectNoticing, type NoticingResult, recordResonanceEvent, detectEngagement, };
export declare const ferniPersonality: {
    processTurn: typeof processTurnPersonality;
    applyToResponse: typeof applyPersonalityToResponse;
    cleanup: typeof cleanupPersonalitySession;
    prewarm: typeof prewarmPersonalitySession;
    /** Get stats about LLM expression generation */
    getLLMStats: typeof getLLMStats;
};
export default ferniPersonality;
//# sourceMappingURL=personality-integration.d.ts.map