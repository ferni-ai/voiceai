/**
 * Voice Pace Adapter
 *
 * Learns and adapts to each user's preferred conversation rhythm.
 *
 * Features:
 * - Track user's speaking pace (WPM)
 * - Learn pause preferences (how long they need to think)
 * - Adapt Jack's response length and pacing
 * - Detect when user is rushed vs relaxed
 * - Match energy levels
 * - Handle interruption patterns
 */
/**
 * Speaking pace category
 */
export type PaceCategory = 'very_slow' | 'slow' | 'moderate' | 'fast' | 'very_fast';
/**
 * Energy level
 */
export type EnergyLevel = 'low' | 'moderate' | 'high';
/**
 * Conversation tempo
 */
export type ConversationTempo = 'relaxed' | 'normal' | 'brisk' | 'rushed';
/**
 * A single pace observation
 */
export interface PaceObservation {
    timestamp: Date;
    userWPM: number;
    userMessageLength: number;
    userResponseTime: number;
    topic: string;
    emotionalState: string;
    conversationMinute: number;
    wasInterruption: boolean;
    askedToSlowDown: boolean;
    askedToSpeedUp: boolean;
    seemedRushed: boolean;
    seemedRelaxed: boolean;
}
/**
 * Learned pace preferences
 */
export interface LearnedPacePreferences {
    avgWPM: number;
    wpmCategory: PaceCategory;
    wpmVariance: number;
    avgResponseTime: number;
    avgMessageLength: number;
    prefersShortResponses: boolean;
    preferredPauseLength: number;
    needsThinkingTime: boolean;
    typicalEnergyLevel: EnergyLevel;
    energyVariesByTime: boolean;
    preferredTempo: ConversationTempo;
    toleratesLongResponses: boolean;
    paceFasterWhenAnxious: boolean;
    paceSlowerWhenThinking: boolean;
    interruptionFrequency: 'rare' | 'occasional' | 'frequent';
    interruptsWhenExcited: boolean;
    recommendedJackWPM: number;
    recommendedJackPause: number;
    recommendedResponseLength: 'brief' | 'moderate' | 'detailed';
    totalObservations: number;
    lastUpdated: Date;
}
/**
 * Real-time pace state
 */
export interface CurrentPaceState {
    sessionStarted: Date;
    observationCount: number;
    currentUserWPM: number;
    currentEnergyLevel: EnergyLevel;
    currentTempo: ConversationTempo;
    isRushed: boolean;
    isRelaxed: boolean;
    hasRequestedPaceChange: boolean;
    jackShouldSlowDown: boolean;
    jackShouldSpeedUp: boolean;
    jackShouldBeBrief: boolean;
    jackShouldElaborate: boolean;
}
export declare class VoicePaceAdapter {
    private userId;
    private observations;
    private currentState;
    private sessionStart;
    constructor(userId: string, existingObservations?: PaceObservation[]);
    /**
     * Initialize current state
     */
    private initializeCurrentState;
    /**
     * Record a pace observation from user message
     */
    recordObservation(params: {
        userMessage: string;
        responseTimeSeconds: number;
        topic: string;
        emotionalState: string;
        wasInterruption?: boolean;
    }): PaceObservation;
    /**
     * Update current state based on new observation
     */
    private updateCurrentState;
    /**
     * Calculate learned preferences from observations
     */
    calculatePreferences(): LearnedPacePreferences;
    /**
     * Get default preferences for new users
     */
    private getDefaultPreferences;
    /**
     * Get current state
     */
    getCurrentState(): CurrentPaceState;
    /**
     * Get SSML rate adjustment for TTS
     */
    getSSMLRateAdjustment(): string;
    /**
     * Get recommended response length in words
     */
    getRecommendedResponseLength(): {
        min: number;
        max: number;
    };
    /**
     * Get pace context for prompt injection
     */
    getPaceContext(): string;
    /**
     * Get speech context for SSML generation
     */
    getSpeechContext(): {
        rate: string;
        pauseMultiplier: number;
        energy: EnergyLevel;
        shouldBeBrief: boolean;
    };
    /**
     * Get all observations for persistence
     */
    getObservations(): PaceObservation[];
    /**
     * Start a new session
     */
    startNewSession(): void;
}
export declare function getVoicePaceAdapter(userId: string, existingObservations?: PaceObservation[]): VoicePaceAdapter;
export declare function removeVoicePaceAdapter(userId: string): void;
export default VoicePaceAdapter;
//# sourceMappingURL=voice-pace.d.ts.map