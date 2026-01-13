/**
 * Emotional Arc Tracker Engine
 *
 * Tracks emotional trajectory across turns, not just per-message.
 *
 * @module @ferni/conversation/emotional-arc/engine
 */
import type { EmotionResult } from '../../intelligence/emotion-detector.js';
import type { VoiceEmotionResult } from '../../speech/audio-prosody.js';
import type { EmotionalArc, EmotionalResponse, NarrativePhase } from './types.js';
export declare class EmotionalArcTracker {
    private history;
    private readonly maxHistory;
    private lastSignificantEvent;
    private peakArousal;
    private distressCount;
    private readonly smoothingFactor;
    private readonly trajectoryWindow;
    private currentPhase;
    private phaseStartTurn;
    private peakTurn;
    private peakIntensity;
    private hasReachedPeak;
    private signalEmittedThisPhase;
    constructor();
    /**
     * Record a new emotional snapshot
     */
    recordEmotion(textEmotion: EmotionResult | null, voiceEmotion: VoiceEmotionResult | null): EmotionalArc;
    /**
     * Get current emotional arc
     */
    getArc(): EmotionalArc;
    /**
     * Get response recommendations
     */
    getResponseRecommendation(): EmotionalResponse;
    /**
     * Get SSML adjustments based on emotional state
     */
    getSsmlAdjustments(): {
        speed: number;
        volume: number;
        emotion: string;
        addBreaks: boolean;
    };
    /**
     * Check if there was a sudden emotional shift
     */
    hasSuddenShift(): boolean;
    /**
     * Get transition phrase for emotional shift
     */
    getTransitionPhrase(): string | null;
    /**
     * Get current narrative phase
     */
    getNarrativePhase(): NarrativePhase;
    /**
     * Get turns since emotional peak
     */
    getTurnsSincePeak(): number;
    /**
     * Reset tracker
     */
    reset(): void;
    private updateNarrativePhase;
    private isEmotionRising;
    private isEmotionFalling;
    private createSnapshot;
    private emotionToValence;
    private computeArc;
    private computeSmoothedValue;
    private computeTrajectory;
    private computeMomentum;
    private computeTemperature;
    private computeResponse;
    private getDefaultArc;
}
export default EmotionalArcTracker;
//# sourceMappingURL=engine.d.ts.map