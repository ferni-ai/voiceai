/**
 * Language Service
 *
 * Manages language detection, preferences, and switching for multilingual voice support.
 *
 * Features:
 * - Automatic language detection from speech
 * - User language preference storage
 * - Dynamic language switching via voice commands
 * - Cartesia TTS language configuration
 * - Gemini STT language configuration
 *
 * @module services/language/language-service
 */
/**
 * Supported language codes (BCP-47 format)
 */
export type SupportedLanguage = 'en' | 'en-US' | 'en-GB' | 'en-AU' | 'en-IN' | 'es' | 'es-ES' | 'es-MX' | 'fr' | 'fr-FR' | 'de' | 'de-DE' | 'it' | 'pt' | 'pt-BR' | 'ja' | 'ko' | 'zh' | 'zh-CN' | 'hi' | 'ar' | 'ru' | 'nl' | 'pl' | 'tr' | 'sv';
/**
 * Language configuration for a session
 */
export interface LanguageConfig {
    /** Primary spoken language */
    spokenLanguage: SupportedLanguage;
    /** Language for STT (inputAudioTranscription) */
    sttLanguage: string;
    /** Language for TTS (Cartesia) */
    ttsLanguage: string;
    /** Cartesia voice ID override for this language (optional) */
    ttsVoiceId?: string;
    /** Display name for UI */
    displayName: string;
    /** Native name (in that language) */
    nativeName: string;
    /** Whether this language is fully supported */
    fullySupported: boolean;
}
/**
 * Language detection result
 */
export interface LanguageDetectionResult {
    detectedLanguage: SupportedLanguage;
    confidence: number;
    alternativeLanguages?: Array<{
        language: SupportedLanguage;
        confidence: number;
    }>;
    sampleText?: string;
}
/**
 * Session language state
 */
export interface SessionLanguageState {
    /** Current active language */
    currentLanguage: SupportedLanguage;
    /** User's preferred language (from profile) */
    preferredLanguage?: SupportedLanguage;
    /** Whether language was auto-detected this session */
    autoDetected: boolean;
    /** Detection confidence (0-1) */
    detectionConfidence?: number;
    /** Number of utterances analyzed */
    utterancesAnalyzed: number;
    /** Timestamp when language was set/detected */
    lastUpdated: Date;
}
/**
 * Full language configuration map
 */
export declare const LANGUAGE_CONFIGS: Record<string, LanguageConfig>;
/**
 * Get the current language for a session
 */
export declare function getSessionLanguage(sessionId: string): SupportedLanguage;
/**
 * Get full session language state
 */
export declare function getSessionLanguageState(sessionId: string): SessionLanguageState | null;
/**
 * Get language configuration
 */
export declare function getLanguageConfig(language: SupportedLanguage): LanguageConfig;
/**
 * Initialize session language from user profile or defaults
 */
export declare function initializeSessionLanguage(sessionId: string, userId?: string, preferredLanguage?: SupportedLanguage): SessionLanguageState;
/**
 * Set session language explicitly (e.g., from voice command)
 */
export declare function setSessionLanguage(sessionId: string, language: SupportedLanguage, userId?: string): LanguageConfig;
/**
 * Update language based on detection
 */
export declare function updateDetectedLanguage(sessionId: string, detection: LanguageDetectionResult): boolean;
/**
 * Clear session language state
 */
export declare function clearSessionLanguage(sessionId: string): void;
/**
 * Detect language from text using pattern matching
 * This is a lightweight local detection - for production, consider using Gemini's detection
 */
export declare function detectLanguageFromText(text: string): LanguageDetectionResult;
export declare function accumulateForDetection(sessionId: string, transcript: string): LanguageDetectionResult | null;
/**
 * Clear utterance buffer for a session
 */
export declare function clearUtteranceBuffer(sessionId: string): void;
/**
 * Parse a language name (from voice command) to language code
 */
export declare function parseLanguageName(name: string): SupportedLanguage | null;
/**
 * Get list of supported languages for voice prompts
 */
export declare function getSupportedLanguagesList(): Array<{
    code: SupportedLanguage;
    name: string;
}>;
/**
 * Save user language preference to Firestore
 */
export declare function persistUserLanguagePreference(userId: string, language: SupportedLanguage): Promise<void>;
/**
 * Load user language preference from Firestore
 */
export declare function loadUserLanguagePreference(userId: string): Promise<SupportedLanguage | null>;
/**
 * Get the TTS language code for Cartesia from session language
 */
export declare function getTtsLanguageForSession(sessionId: string): string;
/**
 * Get the STT language code for Gemini from session language
 */
export declare function getSttLanguageForSession(sessionId: string): string;
/**
 * Get the language service singleton.
 * This factory pattern allows lazy imports and testing.
 */
export declare function languageService(): {
    /**
     * Set the user's spoken language.
     * High-level API for tool calls - handles both session and persistence.
     *
     * @param userId - User ID for persistence
     * @param languageCode - Language name or code (e.g., "Japanese", "ja")
     * @param sessionId - Optional session ID for real-time state (uses userId if not provided)
     */
    setLanguage(userId: string, languageCode: string, sessionId?: string): Promise<{
        success: boolean;
        confirmationMessage?: string;
        error?: string;
    }>;
    /**
     * Get list of supported languages.
     * High-level API for tool calls.
     */
    getSupportedLanguages(): Promise<Array<{
        code: string;
        displayName: string;
        nativeName: string;
    }>>;
    /**
     * Get the user's current language.
     * High-level API for tool calls.
     */
    getCurrentLanguage(userId: string): Promise<{
        code: string;
        displayName: string;
    }>;
    /**
     * Clear language state for a session.
     * Called during session cleanup.
     */
    clearSession(sessionId: string): void;
    getSessionLanguage: typeof getSessionLanguage;
    getSessionLanguageState: typeof getSessionLanguageState;
    initializeSessionLanguage: typeof initializeSessionLanguage;
    setSessionLanguage: typeof setSessionLanguage;
    updateDetectedLanguage: typeof updateDetectedLanguage;
    clearSessionLanguage: typeof clearSessionLanguage;
    getLanguageConfig: typeof getLanguageConfig;
    getSupportedLanguagesList: typeof getSupportedLanguagesList;
    detectLanguageFromText: typeof detectLanguageFromText;
    accumulateForDetection: typeof accumulateForDetection;
    clearUtteranceBuffer: typeof clearUtteranceBuffer;
    parseLanguageName: typeof parseLanguageName;
    persistUserLanguagePreference: typeof persistUserLanguagePreference;
    loadUserLanguagePreference: typeof loadUserLanguagePreference;
    getTtsLanguageForSession: typeof getTtsLanguageForSession;
    getSttLanguageForSession: typeof getSttLanguageForSession;
};
export default languageService;
//# sourceMappingURL=language-service.d.ts.map