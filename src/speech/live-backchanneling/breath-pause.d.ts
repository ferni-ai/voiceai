/**
 * Breath Pause Detector
 *
 * Audio-based breath pause detection for natural backchannel timing.
 */
import type { AudioFrameData } from './types.js';
/**
 * Breath Pause Detector (Audio-Based)
 *
 * Processes actual audio frames to detect natural breath pauses during
 * user speech. Uses RMS energy analysis to distinguish speech from silence.
 *
 * Breath pauses (100-400ms) are ideal moments for soft backchannels
 * because they're natural breaks where overlapping audio won't disrupt.
 */
export declare class BreathPauseDetector {
    private pauseStartTime;
    private speechStartTime;
    private inPause;
    private isSpeaking;
    private pauseHistory;
    private smoothedEnergy;
    private lowEnergyFrameCount;
    private highEnergyFrameCount;
    private frameCount;
    private lastProcessTime;
    private recentEnergyLevels;
    private adaptiveSilenceThreshold;
    private adaptiveSpeechThreshold;
    private log;
    /**
     * Process an audio frame from LiveKit
     *
     * Call this with each audio frame from the user's microphone stream.
     * The detector will analyze energy levels to detect speech/silence transitions.
     */
    processAudioFrame(frame: AudioFrameData): void;
    /**
     * Calculate RMS (Root Mean Square) energy from audio samples
     */
    private calculateRMSEnergy;
    /**
     * Update adaptive thresholds based on recent audio
     */
    private updateAdaptiveThresholds;
    /**
     * Update speech/pause state based on energy levels
     */
    private updateSpeechState;
    /**
     * Simple update method for compatibility (uses binary isSpeaking signal)
     * Prefer processAudioFrame() for better accuracy
     */
    update(isSpeaking: boolean): void;
    /**
     * Check if currently in a breath pause (short pause mid-speech)
     *
     * A breath pause is:
     * - 100-400ms of silence
     * - Occurring after at least MIN_SPEAKING_TIME of speech
     * - Not a turn-ending pause
     */
    isBreathPause(): boolean;
    /**
     * Check if user is currently speaking
     */
    isUserSpeaking(): boolean;
    /**
     * Get current pause duration
     */
    getCurrentPauseDuration(): number;
    /**
     * Get current speech duration
     */
    getCurrentSpeechDuration(): number;
    /**
     * Get current smoothed energy level (0-1)
     */
    getCurrentEnergy(): number;
    /**
     * Get average pause length for this user
     */
    getAveragePauseLength(): number | undefined;
    /**
     * Get breath pause statistics
     */
    getBreathPauseStats(): {
        totalPauses: number;
        breathPauseCount: number;
        averagePauseMs: number | undefined;
        adaptiveSilenceThreshold: number;
        adaptiveSpeechThreshold: number;
    };
    /**
     * Reset detector
     */
    reset(): void;
}
//# sourceMappingURL=breath-pause.d.ts.map