/**
 * Ambient Context Detection
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Understand their environment from audio cues.
 * "Sounds like you're in a busy place - should we talk later?"
 *
 * We can't hear what's happening around them. Ferni can:
 * - Detect background environment (quiet, noisy, office, outdoor)
 * - Identify contextual signals (baby crying, typing, other voices)
 * - Adjust conversation accordingly
 * - Offer to reschedule if environment isn't conducive
 *
 * @module AmbientContext
 */
export type Environment = 'quiet' | 'noisy' | 'office' | 'outdoor' | 'public' | 'home';
export type AmbientSignalType = 'baby_crying' | 'child_voice' | 'typing' | 'other_voices' | 'tv_radio' | 'traffic' | 'nature' | 'music' | 'phone_ringing' | 'door_knock' | 'pet';
export interface AmbientSignal {
    type: AmbientSignalType;
    confidence: number;
    timestamp: Date;
}
export interface AmbientContext {
    /** Detected environment */
    environment: Environment;
    /** Confidence in environment detection */
    confidence: number;
    /** Specific signals detected */
    signals: AmbientSignal[];
    /** Privacy concern - others might hear */
    privacyConcern: boolean;
    /** Distraction level (0-1) */
    distractionLevel: number;
    /** Suggested adjustments */
    suggestions: string[];
    /** Whether to offer rescheduling */
    shouldOfferReschedule: boolean;
}
export interface AmbientResponse {
    shouldMention: boolean;
    message: string;
    adjustments: {
        keepShort: boolean;
        avoidSensitiveTopics: boolean;
        speakClearly: boolean;
        offerPause: boolean;
    };
}
/**
 * Analyze audio for ambient context.
 * In production, this would use audio feature extraction.
 * Here we provide the interface and basic heuristics.
 */
export declare function analyzeAmbientAudio(audioFeatures: {
    backgroundNoiseLevel: number;
    speechToNoiseRatio: number;
    frequencySpread: number;
    rhythmicPatterns?: boolean;
    multipleVoices?: boolean;
    outdoorIndicators?: boolean;
}): AmbientContext;
/**
 * Get a response based on ambient context.
 */
export declare function getAmbientResponse(context: AmbientContext): AmbientResponse | null;
/**
 * Manually record a detected signal (for use when specific detection available).
 */
export declare function recordAmbientSignal(signalType: AmbientSignalType, confidence: number): AmbientSignal;
/**
 * Build context for LLM injection.
 */
export declare function buildAmbientContext(context: AmbientContext): string;
export declare const ambientContext: {
    analyzeAmbientAudio: typeof analyzeAmbientAudio;
    getAmbientResponse: typeof getAmbientResponse;
    recordAmbientSignal: typeof recordAmbientSignal;
    buildAmbientContext: typeof buildAmbientContext;
};
export default ambientContext;
//# sourceMappingURL=ambient-context.d.ts.map