/**
 * Speech Orchestrator Types
 *
 * @module speech/orchestrator/types
 */
import type { EmotionResult } from '../../intelligence/emotion-detector.js';
export interface SpeechOrchestratorContext {
    /** Session ID for state tracking */
    sessionId: string;
    /** Persona ID for voice characteristics */
    personaId: string;
    /** Current turn number */
    turnNumber: number;
    /** Topic weight for pacing */
    topicWeight: 'light' | 'medium' | 'heavy';
    /** User's detected emotion */
    userEmotion?: EmotionResult;
    /** Is this an emotional moment */
    isEmotionalMoment?: boolean;
    /** Recent user content (for context-aware responses) */
    recentUserContent?: string;
    /** User's words per minute (for mirroring) */
    userWPM?: number;
}
export interface HumanizationOptions {
    /** Enable persona speech fingerprints */
    applyPersonaFingerprint?: boolean;
    /** Enable emotion arcs (mid-sentence emotion shifts) */
    applyEmotionArcs?: boolean;
    /** Enable dynamic pauses based on topic */
    applyDynamicPauses?: boolean;
    /** Enable speed variation */
    applySpeedVariation?: boolean;
    /** Enable natural disfluencies */
    applyDisfluencies?: boolean;
    /** Enable micro-reactions (opening sounds) */
    applyMicroReactions?: boolean;
    /** Enable contextual laughter */
    applyContextualLaughter?: boolean;
    /** Enable acknowledgment prefixes */
    applyAcknowledgmentPrefix?: boolean;
    /** Enable catchphrase injection */
    applyCatchphrases?: boolean;
}
export interface ListeningAnalysisOptions {
    /** Audio samples for prosody analysis */
    audioSamples?: Float32Array;
    /** Sample rate for audio */
    sampleRate?: number;
    /** Enable full analysis (slower but more accurate) */
    fullAnalysis?: boolean;
    /** Text to analyze */
    text?: string;
}
export interface HumanizedResponse {
    /** SSML-tagged response text */
    ssml: string;
    /** Original text before humanization */
    originalText: string;
    /** Features that were applied */
    appliedFeatures: string[];
    /** Metadata about the humanization */
    metadata: {
        /** Speed multiplier applied */
        speedMultiplier: number;
        /** Pause multiplier applied */
        pauseMultiplier: number;
        /** Emotion applied */
        emotion?: string;
        /** Micro-reaction added */
        microReaction?: string;
        /** Acknowledgment prefix added */
        acknowledgmentPrefix?: string;
        /** Catchphrase added */
        catchphrase?: string;
        /** Processing time (ms) */
        processingTimeMs: number;
    };
}
export interface ListeningAnalysisResult {
    /** Overall emotional assessment */
    emotionalUndercurrent: {
        primary: string;
        intensity: number;
        trajectory: 'rising' | 'falling' | 'stable' | 'volatile';
    };
    /** Guidance for agent response */
    agentGuidance: {
        shouldSlowDown: boolean;
        shouldSoften: boolean;
        shouldAddPause: boolean;
        shouldBackchannel: boolean;
        suggestedBackchannel?: string;
    };
    /** SSML suggestions */
    ssmlSuggestions: {
        speedMultiplier: number;
        volumeMultiplier: number;
        pauseMultiplier: number;
    };
    /** Audio-based analysis (if audio provided) */
    audio?: {
        breathPattern?: string;
        voiceStability?: string;
        energyLevel?: string;
    };
    /** Text-based analysis (if text provided) */
    text?: {
        cognitiveLoad?: number;
        hedgingLevel?: number;
        selfSoothingDetected?: boolean;
    };
    /** Processing time (ms) */
    processingTimeMs: number;
}
export interface BackchannelRequest {
    sessionId: string;
    personaId: string;
    userSpeechDuration: number;
    currentPauseDuration: number;
    userEmotion: EmotionResult;
    topicWeight: 'light' | 'medium' | 'heavy';
    turnNumber: number;
    isBreathPause?: boolean;
    isEmotionalMoment?: boolean;
    recentContent?: string;
}
export interface BackchannelResponse {
    shouldEmit: boolean;
    phrase: string | null;
    ssml: string | null;
    timing: 'immediate' | 'after_pause' | 'never';
    volumeRatio: number;
    allowOverlap: boolean;
    reason: string;
}
export interface AnticipationContext {
    sessionId: string;
    partialTranscript: string;
    tone?: 'excited' | 'sad' | 'frustrated' | 'neutral';
    userSpeechRate?: 'fast' | 'normal' | 'slow';
    silenceMs?: number;
}
export interface AnticipatedResult {
    /** Anticipated emotion for response */
    anticipatedEmotion: string;
    /** Micro-reaction SSML to prepend (null if none) */
    microReactionSsml: string | null;
    /** Speed multiplier to apply */
    speedMultiplier: number;
    /** Volume multiplier to apply */
    volumeMultiplier: number;
    /** Pause multiplier to apply */
    pauseMultiplier: number;
    /** Use softer delivery */
    softerDelivery: boolean;
    /** Confidence in anticipation */
    confidence: number;
    /** Reason for anticipation */
    reason: string;
}
//# sourceMappingURL=types.d.ts.map