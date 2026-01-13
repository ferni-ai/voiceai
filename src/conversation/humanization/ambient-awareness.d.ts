/**
 * Ambient Sound Awareness
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Detect and appropriately respond to background sounds that provide
 * context about the user's situation. This enables contextually aware
 * conversations—knowing when to keep things brief because someone is
 * in public, or when to be more open because they're in a quiet space.
 *
 * **What we detect:**
 * - Location indicators (traffic, office, home)
 * - Privacy level (quiet, public, semi-private)
 * - Interruption potential (doorbell, phone, kids)
 * - Activity context (driving, working, relaxing)
 *
 * @module @ferni/humanization/ambient-awareness
 */
export type AmbientSound = 'traffic' | 'wind' | 'crowd' | 'keyboard' | 'tv_radio' | 'baby_child' | 'pet' | 'cooking' | 'water' | 'gym' | 'office' | 'quiet' | 'echo' | 'doorbell' | 'phone_ring' | 'notification' | 'music' | 'nature';
export type LocationType = 'home' | 'car' | 'public' | 'work' | 'outside' | 'unknown';
export type PrivacyLevel = 'private' | 'semi_private' | 'public';
export interface AmbientAdaptation {
    /** Conversation implications */
    implications: {
        shouldKeepBrief: boolean;
        shouldAvoidSensitiveTopics: boolean;
        mayBeInterrupted: boolean;
        attentionMayBeDivided: boolean;
    };
    /** Suggested acknowledgments */
    acknowledgments: string[];
    /** SSML acknowledgments */
    ssmlAcknowledgments: string[];
    /** Volume adjustment (0.8-1.2) */
    volumeAdjust: number;
    /** Pace adjustment (0.85-1.1) */
    paceAdjust: number;
    /** How tolerant of interruptions to be */
    interruptionTolerance: 'low' | 'medium' | 'high';
    /** Behavior for sensitive topics */
    sensitiveTopicBehavior: 'normal' | 'ask_before_discussing' | 'avoid';
}
export interface AmbientContext {
    /** Primary detected sound */
    primarySound: AmbientSound | null;
    /** Secondary sounds */
    secondarySounds: AmbientSound[];
    /** Confidence in detection (0-1) */
    confidence: number;
    /** Derived context */
    likelyLocation: LocationType;
    /** Privacy assessment */
    privacyLevel: PrivacyLevel;
    /** Conversation implications */
    implications: {
        shouldKeepBrief: boolean;
        shouldAvoidSensitiveTopics: boolean;
        mayBeInterrupted: boolean;
        attentionMayBeDivided: boolean;
    };
    /** Suggested acknowledgments (if appropriate) */
    acknowledgments: string[];
    /** Whether we should acknowledge the ambient sound */
    shouldAcknowledge: boolean;
    /** When was this detected */
    detectedAt: Date;
}
export interface AmbientDetectionResult {
    /** Detected sounds with confidence */
    sounds: Array<{
        sound: AmbientSound;
        confidence: number;
    }>;
    /** Overall confidence */
    overallConfidence: number;
    /** Raw audio features that led to detection */
    features: {
        energyLevel: number;
        frequencyProfile: string;
        periodicityScore: number;
        noisiness: number;
    };
}
export declare class AmbientAwarenessEngine {
    private currentContext;
    private contextHistory;
    private lastAcknowledgmentTurn;
    private acknowledgedSounds;
    constructor();
    /**
     * Process ambient detection results
     */
    processDetection(detection: AmbientDetectionResult, turnCount: number): AmbientContext;
    /**
     * Simulate detection from audio features
     * (In production, this would come from actual audio analysis)
     */
    simulateDetection(hints: {
        energyLevel?: number;
        hasVoices?: boolean;
        hasMusic?: boolean;
        hasTraffic?: boolean;
        isQuiet?: boolean;
    }): AmbientDetectionResult;
    /**
     * Get current ambient context
     */
    getCurrentContext(): AmbientContext | null;
    /**
     * Get adaptation for current context
     */
    getAdaptation(): AmbientAdaptation | null;
    /**
     * Check if topic is appropriate for current context
     */
    isTopicAppropriate(isSensitive: boolean): boolean;
    /**
     * Get random acknowledgment for current context
     */
    getAcknowledgment(): string | null;
    /**
     * Mark that we've acknowledged the current sound
     */
    markAcknowledged(): void;
    /**
     * Reset for new session
     */
    reset(): void;
    private combineImplications;
    private shouldAcknowledge;
}
export declare function getAmbientAwarenessEngine(sessionId: string): AmbientAwarenessEngine;
export declare function resetAmbientAwarenessEngine(sessionId: string): void;
export declare function resetAllAmbientAwarenessEngines(): void;
export default AmbientAwarenessEngine;
//# sourceMappingURL=ambient-awareness.d.ts.map