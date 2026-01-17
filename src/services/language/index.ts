/**
 * Language Service Module
 *
 * Provides multilingual support for the voice agent.
 *
 * @module services/language
 */

export {
  // Types
  type SupportedLanguage,
  type LanguageConfig,
  type LanguageDetectionResult,
  type SessionLanguageState,

  // Constants
  LANGUAGE_CONFIGS,

  // Session management
  getSessionLanguage,
  getSessionLanguageState,
  initializeSessionLanguage,
  setSessionLanguage,
  updateDetectedLanguage,
  clearSessionLanguage,

  // Configuration
  getLanguageConfig,
  getSupportedLanguagesList,

  // Detection
  detectLanguageFromText,
  accumulateForDetection,
  clearUtteranceBuffer,

  // Parsing
  parseLanguageName,

  // Persistence
  persistUserLanguagePreference,
  loadUserLanguagePreference,

  // TTS/STT helpers
  getTtsLanguageForSession,
  getSttLanguageForSession,

  // Default export
  languageService,
} from './language-service.js';
