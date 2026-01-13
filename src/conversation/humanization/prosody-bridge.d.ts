/**
 * Prosody Bridge - Connects Voice Agent Audio Analysis to Humanization
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module bridges the gap between the voice agent's real-time audio prosody
 * analysis and the humanization system's voice learning capabilities.
 *
 * It enables:
 * - Voice print learning from real prosody data
 * - Breathing pattern detection
 * - Ambient sound awareness integration
 * - Cross-session voice characteristic tracking
 *
 * @module @ferni/humanization/prosody-bridge
 */
import type { ProsodyFeatures, VoiceEmotionResult } from '../../speech/audio-prosody.js';
import { type AmbientDetectionResult } from './ambient-awareness.js';
import { type BreathPattern } from './breathing-sync.js';
import { type VoiceSnapshot } from './voice-print.js';
interface BridgeState {
    lastProcessedAt: number;
    snapshotCount: number;
    calibrationComplete: boolean;
    baselinePitch: number;
    baselineEnergy: number;
    baselineRate: number;
}
/**
 * Convert prosody features to a VoiceSnapshot for the humanization system
 */
export declare function prosodyToVoiceSnapshot(prosody: ProsodyFeatures, emotion: VoiceEmotionResult): VoiceSnapshot;
/**
 * Estimate breathing pattern from prosody features
 */
export declare function prosodyToBreathPattern(prosody: ProsodyFeatures): BreathPattern;
/**
 * Process voice emotion result through the humanization bridge
 *
 * Call this when the voice agent's prosody analyzer produces a result.
 * It feeds the data into all relevant humanization engines.
 */
export declare function processProsodyForHumanization(sessionId: string, userId: string, voiceEmotion: VoiceEmotionResult): void;
/**
 * Get voice state detection for current user
 * Returns insights like "you sound tired today" or "more energetic than usual"
 */
export declare function getVoiceStateInsight(sessionId: string, userId: string, currentProsody: ProsodyFeatures, currentEmotion: VoiceEmotionResult): {
    hasInsight: boolean;
    insight?: string;
    suggestedAcknowledgment?: string;
    deviation?: 'significant' | 'moderate' | 'none';
};
/**
 * Get cross-session acknowledgment if user's voice has changed significantly
 */
export declare function getCrossSessionInsight(sessionId: string, userId: string, currentProsody: ProsodyFeatures, currentEmotion: VoiceEmotionResult): {
    hasInsight: boolean;
    acknowledgment?: string;
    changeType?: string;
};
/**
 * Simulate ambient detection from prosody (placeholder for real ambient detection)
 *
 * In a full implementation, this would use:
 * - Background noise classification from audio frames
 * - Environmental sound detection models
 *
 * For now, we infer from prosody features:
 * - High noise floor → public/noisy environment
 * - Echo patterns → large/open space
 * - Etc.
 */
export declare function inferAmbientFromProsody(prosody: ProsodyFeatures): AmbientDetectionResult | null;
/**
 * Initialize the prosody bridge for a session
 */
export declare function initProsodyBridge(sessionId: string, userId: string): void;
/**
 * Clean up the prosody bridge for a session
 */
export declare function cleanupProsodyBridge(sessionId: string): void;
/**
 * Get bridge state for debugging
 */
export declare function getBridgeState(sessionId: string): BridgeState | null;
export type { BridgeState };
//# sourceMappingURL=prosody-bridge.d.ts.map