/**
 * Language Service Module
 *
 * Provides multilingual support for the voice agent.
 *
 * @module services/language
 */
export { type SupportedLanguage, type LanguageConfig, type LanguageDetectionResult, type SessionLanguageState, LANGUAGE_CONFIGS, getSessionLanguage, getSessionLanguageState, initializeSessionLanguage, setSessionLanguage, updateDetectedLanguage, clearSessionLanguage, getLanguageConfig, getSupportedLanguagesList, detectLanguageFromText, accumulateForDetection, clearUtteranceBuffer, parseLanguageName, persistUserLanguagePreference, loadUserLanguagePreference, getTtsLanguageForSession, getSttLanguageForSession, languageService, } from './language-service.js';
//# sourceMappingURL=index.d.ts.map