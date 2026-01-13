/**
 * Voice Agent Integration - Session Lifecycle
 *
 * @module @ferni/humanization/voice-agent-integration/session-lifecycle
 */
import { getCrossSessionVoiceEngine, type CrossSessionVoiceMemory } from '../cross-session-voice.js';
import { type HumanizationOrchestratorConfig } from '../index.js';
import { getVoicePrintEngine, type VoiceSnapshot } from '../voice-print.js';
import type { HumanizationSessionState } from './types.js';
/**
 * Initialize humanization for a new voice session
 */
export declare function onSessionStart(sessionId: string, userId: string, personaId: string, options?: {
    config?: Partial<HumanizationOrchestratorConfig>;
    crossSessionMemory?: CrossSessionVoiceMemory;
    initialVoice?: VoiceSnapshot;
    relationshipStage?: HumanizationSessionState['relationshipStage'];
    enableAdvancedHumanization?: boolean;
}): {
    advancedStart?: {
        greeting: string | null;
        eventFollowUp: string | null;
        milestoneAcknowledgment: string | null;
    };
};
/**
 * Clean up humanization for an ended session
 */
export declare function onSessionEnd(sessionId: string, options?: {
    endingVoice?: VoiceSnapshot;
}): {
    voicePrint: ReturnType<ReturnType<typeof getVoicePrintEngine>['getVoicePrint']>;
    crossSessionMemory: ReturnType<ReturnType<typeof getCrossSessionVoiceEngine>['getMemory']>;
} | null;
//# sourceMappingURL=session-lifecycle.d.ts.map