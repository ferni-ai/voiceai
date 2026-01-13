/**
 * Naturalness Engine Types
 *
 * Types for the unified voice naturalness system that combines
 * stress adaptation, voice patterns, ambient reactivity, and rapport.
 *
 * @module naturalness/types
 */
/**
 * Audio signal input for naturalness processing
 */
export interface AudioSignalInput {
    /** Current stress level from prosody (0-1) */
    stressLevel?: number;
    /** Anxiety markers detected */
    anxietyMarkers?: boolean;
    /** Breath pattern detected */
    breathPattern?: 'normal' | 'shallow' | 'deep' | 'held' | 'irregular' | 'relaxing';
    /** Voice tremor level (0-1) */
    voiceTremor?: number;
    /** Concern level (0-1) */
    concernLevel?: number;
    /** User energy level (0-1) */
    userEnergy?: number;
}
/**
 * Turn context for naturalness processing
 */
export interface TurnContextInput {
    /** Session ID */
    sessionId: string;
    /** User ID (for cross-session patterns) */
    userId: string;
    /** Current turn number */
    turnNumber: number;
    /** User's words this turn */
    userWordCount: number;
    /** Agent's words this turn */
    agentWordCount: number;
    /** User emotion detected */
    userEmotion?: string;
    /** Agent emotion expressed */
    agentEmotion?: string;
    /** Were emotions aligned? */
    emotionsAligned?: boolean;
    /** Did user ask a question? */
    userAskedQuestion?: boolean;
    /** User response length */
    responseLength?: 'short' | 'medium' | 'long';
    /** Silence before response (ms) */
    silenceDurationMs?: number;
    /** Was transition smooth? */
    smoothTransition?: boolean;
    /** User disclosed personal info? */
    userDisclosed?: boolean;
    /** User comfort level (0-1) */
    comfortLevel?: number;
    /** Agent interrupted user? */
    agentInterrupted?: boolean;
    /** User interrupted agent? */
    userInterrupted?: boolean;
}
/**
 * Ambient audio input for environment tracking
 */
export interface AmbientAudioInput {
    /** Noise level (dB) */
    noiseDb: number;
    /** Signal-to-noise ratio (dB) */
    snr: number;
    /** Speech detected? */
    hasSpeech: boolean;
    /** Music detected? */
    hasMusic: boolean;
    /** Environment classification */
    environment: 'quiet' | 'speech' | 'music' | 'traffic' | 'wind' | 'crowd';
    /** Spectral centroid (Hz) */
    spectralCentroid: number;
    /** Band energies */
    bandEnergies: {
        subBass: number;
        bass: number;
        lowMid: number;
        mid: number;
        highMid: number;
        presence: number;
        brilliance: number;
    };
}
/**
 * Combined TTS adjustments from all systems
 */
export interface CombinedTtsAdjustments {
    /** Speed multiplier (0.8-1.2, 1.0 = no change) */
    speedMultiplier: number;
    /** Volume boost (0-0.3, 0 = no boost) */
    volumeBoost: number;
    /** Enable clarity mode (clearer articulation) */
    clarityMode: boolean;
    /** Extra pause at sentence boundaries (ms) */
    extraPauseMs: number;
    /** Warmth level for emotional tone */
    warmthLevel: 'neutral' | 'warm' | 'very_warm';
    /** Reason string for debugging */
    reasons: string[];
}
/**
 * LLM context injection recommendations
 */
export interface ContextInjection {
    /** Should inject context? */
    shouldInject: boolean;
    /** The context to inject */
    context: string;
    /** Priority (higher = more important) */
    priority: number;
    /** Source system */
    source: 'stress' | 'rapport' | 'ambient' | 'patterns';
}
/**
 * Verbal acknowledgment to speak
 */
export interface VerbalAcknowledgment {
    /** Phrase to speak */
    phrase: string;
    /** Source system */
    source: 'ambient' | 'rapport';
    /** Should pause after? */
    shouldPause: boolean;
    /** Pause duration (ms) */
    pauseDurationMs: number;
}
/**
 * Full naturalness result
 */
export interface NaturalnessResult {
    /** Combined TTS adjustments */
    ttsAdjustments: CombinedTtsAdjustments;
    /** LLM context injections */
    contextInjections: ContextInjection[];
    /** Verbal acknowledgment (if any) */
    acknowledgment: VerbalAcknowledgment | null;
    /** Current rapport level */
    rapportLevel: 'excellent' | 'good' | 'needs_attention' | 'repair_needed' | 'critical';
    /** Rapport score (0-100) */
    rapportScore: number;
    /** Recommended agent WPM */
    recommendedWpm: number;
    /** Recommended turn gap (ms) */
    recommendedTurnGapMs: number;
    /** Is environment noisy? */
    isNoisy: boolean;
    /** Active systems that contributed */
    activeSystems: ('stress' | 'patterns' | 'ambient' | 'rapport')[];
}
/**
 * Full state of the naturalness engine
 */
export interface NaturalnessEngineState {
    /** Session ID */
    sessionId: string;
    /** User ID */
    userId: string;
    /** Turns processed */
    turnsProcessed: number;
    /** Last result */
    lastResult: NaturalnessResult | null;
    /** System health */
    systemHealth: {
        stress: boolean;
        patterns: boolean;
        ambient: boolean;
        rapport: boolean;
    };
    /** Session started at */
    sessionStartedAt: number;
}
//# sourceMappingURL=types.d.ts.map