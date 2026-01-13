/**
 * Voice Agent Integration - Utility Functions
 *
 * @module @ferni/humanization/voice-agent-integration/utils
 */
import { type BreathPattern } from '../breathing-sync.js';
import type { VoiceSnapshot } from '../voice-print.js';
import type { HumanizationSessionState } from './types.js';
/**
 * Create a VoiceSnapshot from prosody analysis data
 */
export declare function createVoiceSnapshot(prosodyData: {
    pitchHz?: number;
    pitchMin?: number;
    pitchMax?: number;
    speechRate?: number;
    energy?: number;
    breathiness?: number;
    roughness?: number;
    strain?: number;
    valence?: number;
    arousal?: number;
}): VoiceSnapshot;
/**
 * Simulate breath pattern from emotional state
 */
export declare function simulateBreathFromEmotion(emotion: string): BreathPattern;
/**
 * Get current session state
 */
export declare function getSessionState(sessionId: string): HumanizationSessionState | null;
/**
 * Get all engine states for debugging
 */
export declare function getEngineStates(sessionId: string): Record<string, unknown> | null;
//# sourceMappingURL=utils.d.ts.map