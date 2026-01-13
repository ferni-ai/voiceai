/**
 * Voice Agent Integration - Engine Access
 *
 * Access functions for various humanization engines.
 *
 * @module @ferni/humanization/voice-agent-integration/engines
 */
import { getBreathingSyncEngine } from '../breathing-sync.js';
import { getCrossSessionVoiceEngine } from '../cross-session-voice.js';
import { getEmotionalLeadingEngine, type UserEmotionalState } from '../emotional-leading.js';
import { getVoicePrintEngine, type VoiceSnapshot } from '../voice-print.js';
/**
 * Get emotional leading guidance for current user state
 */
export declare function getEmotionalLeadingGuidance(sessionId: string, userState: UserEmotionalState, userMessage: string): ReturnType<ReturnType<typeof getEmotionalLeadingEngine>['decideLeading']> | null;
/**
 * Get ambient context for conversation adaptation
 */
export declare function getAmbientContext(sessionId: string): import("../ambient-awareness.js").AmbientContext | null;
/**
 * Get ambient acknowledgment if appropriate
 */
export declare function getAmbientAcknowledgment(sessionId: string): string | null;
/**
 * Detect voice state changes from baseline
 */
export declare function detectVoiceState(sessionId: string, currentVoice: VoiceSnapshot): ReturnType<ReturnType<typeof getVoicePrintEngine>['detectState']> | null;
/**
 * Get cross-session acknowledgment if appropriate
 */
export declare function getCrossSessionAcknowledgment(sessionId: string, currentVoice: VoiceSnapshot): ReturnType<ReturnType<typeof getCrossSessionVoiceEngine>['generateAcknowledgment']> | null;
/**
 * Mark a cross-session acknowledgment as delivered
 */
export declare function markCrossSessionAcknowledged(sessionId: string, changeId: string): void;
/**
 * Get breathing sync adjustments for SSML
 */
export declare function getBreathingSyncAdjustments(sessionId: string, text: string, emotionalContext?: {
    isEmotional: boolean;
    isHeavy: boolean;
    isExcited: boolean;
}): ReturnType<ReturnType<typeof getBreathingSyncEngine>['calculateAdjustments']> | null;
/**
 * Apply breathing sync to SSML
 */
export declare function applyBreathingSync(sessionId: string, ssml: string, adjustments: ReturnType<ReturnType<typeof getBreathingSyncEngine>['calculateAdjustments']>): string;
//# sourceMappingURL=engines.d.ts.map