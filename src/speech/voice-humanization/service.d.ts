/**
 * Voice Humanization Service
 *
 * Main service class for voice humanization capabilities.
 */
import type { EmotionalArc } from '../../conversation/emotional-arc.js';
import type { ProsodyFeatures, VoiceEmotionResult } from '../audio-prosody.js';
import { type EnhancedTurnPrediction, type Intonation } from '../prosody-turn-bridge.js';
import type { EmotionalTtsAdjustments, LaughterDetectionResult, MicroInterruptionResult, RhythmMirroringAdjustments, SpeechRhythmProfile, VoiceHumanizationState } from './types.js';
export declare class VoiceHumanizationService {
    private state;
    private readonly maxHistorySize;
    constructor(sessionId: string);
    /**
     * Get enhanced turn prediction using voice prosody signals
     */
    predictTurnWithVoice(transcript: string, voiceEmotion: VoiceEmotionResult | null, options?: {
        speakingDurationMs?: number;
        silenceDurationMs?: number;
        topicWeight?: 'light' | 'medium' | 'heavy';
    }): EnhancedTurnPrediction;
    /**
     * Extract intonation from prosody features
     */
    extractIntonation(prosody: ProsodyFeatures): Intonation;
    /**
     * Check if transcribed text contains a micro-interruption signal
     */
    detectMicroInterruption(text: string, isAgentSpeaking: boolean): MicroInterruptionResult;
    /**
     * Get interruption patterns for learning
     */
    getInterruptionPatterns(): Array<{
        timestamp: number;
        trigger: string;
    }>;
    /**
     * Calculate TTS adjustments based on emotional arc
     */
    getEmotionalTtsAdjustments(emotionalArc: EmotionalArc | null): EmotionalTtsAdjustments;
    /**
     * Apply emotional adjustments to SSML text
     */
    applyEmotionalSsml(text: string, adjustments: EmotionalTtsAdjustments): string;
    /**
     * Detect if audio features indicate laughter
     */
    detectLaughter(prosody: ProsodyFeatures, durationMs: number): LaughterDetectionResult;
    /**
     * Get response suggestion for detected laughter
     */
    getLaughterResponse(detection: LaughterDetectionResult, personaId: string): string | null;
    /**
     * Update user's speech rhythm profile
     */
    updateRhythmProfile(text: string, durationMs: number, pausePatterns?: number[]): SpeechRhythmProfile;
    private estimateAvgPhraseLength;
    /**
     * Get SSML pause adjustments to mirror user's rhythm
     */
    getRhythmMirroringAdjustments(): RhythmMirroringAdjustments;
    recordTurn(): void;
    getState(): VoiceHumanizationState;
    reset(): void;
}
export default VoiceHumanizationService;
//# sourceMappingURL=service.d.ts.map