/**
 * Voice Signal Detection for Anticipatory Questions
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module detects voice signals that indicate emotional state:
 * - Voice dropped or slowed
 * - Long pause before speaking
 * - Short answers after longer ones
 * - Energy level changes
 * - Speech pace changes
 *
 * These signals enable Ferni to ask anticipatory questions:
 * "Your voice dropped. What shifted?"
 * "You got quiet. That usually means something."
 */
export interface VoiceSignals {
    pauseBeforeSpeaking: boolean;
    pauseDurationMs?: number;
    voiceDropped: boolean;
    voiceEnergyChange?: 'increased' | 'decreased' | 'stable';
    shortAnswers: boolean;
    answerLengthTrend?: 'getting_shorter' | 'getting_longer' | 'stable';
    changedSubject: boolean;
    speechPace?: 'faster' | 'slower' | 'stable';
    repeatedPerson?: string;
}
export interface SignalContext {
    currentTranscript: string;
    previousTranscript?: string;
    currentTopic?: string;
    previousTopic?: string;
    pauseBeforeSpeakingMs?: number;
    currentEnergy?: number;
    previousEnergy?: number;
    recentAnswerLengths?: number[];
    mentionedPeople?: string[];
    previousMentionedPeople?: string[];
}
export interface AnticipatedNeed {
    signal: string;
    anticipated: string;
    checkQuestion: string;
    confidence: number;
    ifConfirmed: string;
    ifDenied: string;
}
/**
 * Analyze voice signals from context
 */
export declare function analyzeVoiceSignals(context: SignalContext): VoiceSignals;
/**
 * Get anticipated need based on signals
 */
export declare function getAnticipatedNeed(signals: VoiceSignals): AnticipatedNeed | null;
/**
 * Initialize session tracking
 */
export declare function initializeVoiceTracking(sessionId: string): void;
/**
 * Record a turn for voice tracking
 */
export declare function recordVoiceTurn(sessionId: string, transcript: string, options?: {
    topic?: string;
    energy?: number;
    pauseBeforeMs?: number;
    mentionedPeople?: string[];
}): void;
/**
 * Build signal context from session history
 */
export declare function buildSignalContext(sessionId: string, currentTranscript: string, options?: {
    currentTopic?: string;
    currentEnergy?: number;
    pauseBeforeSpeakingMs?: number;
    currentMentionedPeople?: string[];
}): SignalContext;
/**
 * Get voice signals for current turn
 */
export declare function getVoiceSignalsForTurn(sessionId: string, currentTranscript: string, options?: {
    currentTopic?: string;
    currentEnergy?: number;
    pauseBeforeSpeakingMs?: number;
    currentMentionedPeople?: string[];
}): VoiceSignals;
/**
 * Clear session history
 */
export declare function clearVoiceHistory(sessionId: string): void;
declare const _default: {
    analyzeVoiceSignals: typeof analyzeVoiceSignals;
    getAnticipatedNeed: typeof getAnticipatedNeed;
    initializeVoiceTracking: typeof initializeVoiceTracking;
    recordVoiceTurn: typeof recordVoiceTurn;
    buildSignalContext: typeof buildSignalContext;
    getVoiceSignalsForTurn: typeof getVoiceSignalsForTurn;
    clearVoiceHistory: typeof clearVoiceHistory;
};
export default _default;
//# sourceMappingURL=voice-signals.d.ts.map