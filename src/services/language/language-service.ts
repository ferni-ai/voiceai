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

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LanguageService' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Supported language codes (BCP-47 format)
 */
export type SupportedLanguage =
  | 'en'      // English (default)
  | 'en-US'   // American English
  | 'en-GB'   // British English
  | 'en-AU'   // Australian English
  | 'en-IN'   // Indian English
  | 'es'      // Spanish
  | 'es-ES'   // Castilian Spanish
  | 'es-MX'   // Mexican Spanish
  | 'fr'      // French
  | 'fr-FR'   // French (France)
  | 'de'      // German
  | 'de-DE'   // German (Germany)
  | 'it'      // Italian
  | 'pt'      // Portuguese
  | 'pt-BR'   // Brazilian Portuguese
  | 'ja'      // Japanese
  | 'ko'      // Korean
  | 'zh'      // Chinese (Mandarin)
  | 'zh-CN'   // Simplified Chinese
  | 'hi'      // Hindi
  | 'ar'      // Arabic
  | 'ru'      // Russian
  | 'nl'      // Dutch
  | 'pl'      // Polish
  | 'tr'      // Turkish
  | 'sv'      // Swedish;

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
  alternativeLanguages?: Array<{ language: SupportedLanguage; confidence: number }>;
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

// ============================================================================
// LANGUAGE DEFINITIONS
// ============================================================================

/**
 * Full language configuration map
 */
export const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  // English variants (fully supported)
  'en': {
    spokenLanguage: 'en',
    sttLanguage: 'en-US',
    ttsLanguage: 'en',
    displayName: 'English',
    nativeName: 'English',
    fullySupported: true,
  },
  'en-US': {
    spokenLanguage: 'en-US',
    sttLanguage: 'en-US',
    ttsLanguage: 'en',
    displayName: 'American English',
    nativeName: 'American English',
    fullySupported: true,
  },
  'en-GB': {
    spokenLanguage: 'en-GB',
    sttLanguage: 'en-GB',
    ttsLanguage: 'en',
    displayName: 'British English',
    nativeName: 'British English',
    fullySupported: true,
  },
  'en-AU': {
    spokenLanguage: 'en-AU',
    sttLanguage: 'en-AU',
    ttsLanguage: 'en',
    displayName: 'Australian English',
    nativeName: 'Australian English',
    fullySupported: true,
  },
  'en-IN': {
    spokenLanguage: 'en-IN',
    sttLanguage: 'en-IN',
    ttsLanguage: 'en',
    displayName: 'Indian English',
    nativeName: 'Indian English',
    fullySupported: true,
  },

  // Spanish (fully supported)
  'es': {
    spokenLanguage: 'es',
    sttLanguage: 'es-ES',
    ttsLanguage: 'es',
    displayName: 'Spanish',
    nativeName: 'Español',
    fullySupported: true,
  },
  'es-ES': {
    spokenLanguage: 'es-ES',
    sttLanguage: 'es-ES',
    ttsLanguage: 'es',
    displayName: 'Spanish (Spain)',
    nativeName: 'Español (España)',
    fullySupported: true,
  },
  'es-MX': {
    spokenLanguage: 'es-MX',
    sttLanguage: 'es-MX',
    ttsLanguage: 'es',
    displayName: 'Spanish (Mexico)',
    nativeName: 'Español (México)',
    fullySupported: true,
  },

  // French
  'fr': {
    spokenLanguage: 'fr',
    sttLanguage: 'fr-FR',
    ttsLanguage: 'fr',
    displayName: 'French',
    nativeName: 'Français',
    fullySupported: true,
  },
  'fr-FR': {
    spokenLanguage: 'fr-FR',
    sttLanguage: 'fr-FR',
    ttsLanguage: 'fr',
    displayName: 'French (France)',
    nativeName: 'Français (France)',
    fullySupported: true,
  },

  // German
  'de': {
    spokenLanguage: 'de',
    sttLanguage: 'de-DE',
    ttsLanguage: 'de',
    displayName: 'German',
    nativeName: 'Deutsch',
    fullySupported: true,
  },
  'de-DE': {
    spokenLanguage: 'de-DE',
    sttLanguage: 'de-DE',
    ttsLanguage: 'de',
    displayName: 'German (Germany)',
    nativeName: 'Deutsch (Deutschland)',
    fullySupported: true,
  },

  // Italian
  'it': {
    spokenLanguage: 'it',
    sttLanguage: 'it-IT',
    ttsLanguage: 'it',
    displayName: 'Italian',
    nativeName: 'Italiano',
    fullySupported: true,
  },

  // Portuguese
  'pt': {
    spokenLanguage: 'pt',
    sttLanguage: 'pt-PT',
    ttsLanguage: 'pt',
    displayName: 'Portuguese',
    nativeName: 'Português',
    fullySupported: true,
  },
  'pt-BR': {
    spokenLanguage: 'pt-BR',
    sttLanguage: 'pt-BR',
    ttsLanguage: 'pt',
    displayName: 'Portuguese (Brazil)',
    nativeName: 'Português (Brasil)',
    fullySupported: true,
  },

  // Japanese
  'ja': {
    spokenLanguage: 'ja',
    sttLanguage: 'ja-JP',
    ttsLanguage: 'ja',
    displayName: 'Japanese',
    nativeName: '日本語',
    fullySupported: true,
  },

  // Korean
  'ko': {
    spokenLanguage: 'ko',
    sttLanguage: 'ko-KR',
    ttsLanguage: 'ko',
    displayName: 'Korean',
    nativeName: '한국어',
    fullySupported: true,
  },

  // Chinese
  'zh': {
    spokenLanguage: 'zh',
    sttLanguage: 'zh-CN',
    ttsLanguage: 'zh',
    displayName: 'Chinese (Mandarin)',
    nativeName: '中文',
    fullySupported: true,
  },
  'zh-CN': {
    spokenLanguage: 'zh-CN',
    sttLanguage: 'zh-CN',
    ttsLanguage: 'zh',
    displayName: 'Chinese (Simplified)',
    nativeName: '简体中文',
    fullySupported: true,
  },

  // Hindi
  'hi': {
    spokenLanguage: 'hi',
    sttLanguage: 'hi-IN',
    ttsLanguage: 'hi',
    displayName: 'Hindi',
    nativeName: 'हिन्दी',
    fullySupported: true,
  },

  // Arabic
  'ar': {
    spokenLanguage: 'ar',
    sttLanguage: 'ar-SA',
    ttsLanguage: 'ar',
    displayName: 'Arabic',
    nativeName: 'العربية',
    fullySupported: false, // Cartesia support may be limited
  },

  // Russian
  'ru': {
    spokenLanguage: 'ru',
    sttLanguage: 'ru-RU',
    ttsLanguage: 'ru',
    displayName: 'Russian',
    nativeName: 'Русский',
    fullySupported: true,
  },

  // Dutch
  'nl': {
    spokenLanguage: 'nl',
    sttLanguage: 'nl-NL',
    ttsLanguage: 'nl',
    displayName: 'Dutch',
    nativeName: 'Nederlands',
    fullySupported: true,
  },

  // Polish
  'pl': {
    spokenLanguage: 'pl',
    sttLanguage: 'pl-PL',
    ttsLanguage: 'pl',
    displayName: 'Polish',
    nativeName: 'Polski',
    fullySupported: true,
  },

  // Turkish
  'tr': {
    spokenLanguage: 'tr',
    sttLanguage: 'tr-TR',
    ttsLanguage: 'tr',
    displayName: 'Turkish',
    nativeName: 'Türkçe',
    fullySupported: true,
  },

  // Swedish
  'sv': {
    spokenLanguage: 'sv',
    sttLanguage: 'sv-SE',
    ttsLanguage: 'sv',
    displayName: 'Swedish',
    nativeName: 'Svenska',
    fullySupported: true,
  },
};

// ============================================================================
// SESSION STATE MANAGEMENT
// ============================================================================

/**
 * In-memory session language states
 * Key: sessionId
 */
const sessionLanguageStates = new Map<string, SessionLanguageState>();

/**
 * User language preferences cache
 * Key: userId
 */
const userLanguagePreferences = new Map<string, SupportedLanguage>();

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the current language for a session
 */
export function getSessionLanguage(sessionId: string): SupportedLanguage {
  const state = sessionLanguageStates.get(sessionId);
  return state?.currentLanguage ?? 'en';
}

/**
 * Get full session language state
 */
export function getSessionLanguageState(sessionId: string): SessionLanguageState | null {
  return sessionLanguageStates.get(sessionId) ?? null;
}

/**
 * Get language configuration
 */
export function getLanguageConfig(language: SupportedLanguage): LanguageConfig {
  return LANGUAGE_CONFIGS[language] ?? LANGUAGE_CONFIGS['en'];
}

/**
 * Initialize session language from user profile or defaults
 */
export function initializeSessionLanguage(
  sessionId: string,
  userId?: string,
  preferredLanguage?: SupportedLanguage
): SessionLanguageState {
  // Check user preference cache first
  let language = preferredLanguage;
  if (!language && userId) {
    language = userLanguagePreferences.get(userId);
  }
  language = language ?? 'en';

  const state: SessionLanguageState = {
    currentLanguage: language,
    preferredLanguage: language,
    autoDetected: false,
    utterancesAnalyzed: 0,
    lastUpdated: new Date(),
  };

  sessionLanguageStates.set(sessionId, state);

  log.info(
    { sessionId, userId, language },
    '🌍 Session language initialized'
  );

  return state;
}

/**
 * Set session language explicitly (e.g., from voice command)
 */
export function setSessionLanguage(
  sessionId: string,
  language: SupportedLanguage,
  userId?: string
): LanguageConfig {
  const config = getLanguageConfig(language);

  const state: SessionLanguageState = {
    currentLanguage: language,
    preferredLanguage: language,
    autoDetected: false,
    utterancesAnalyzed: sessionLanguageStates.get(sessionId)?.utterancesAnalyzed ?? 0,
    lastUpdated: new Date(),
  };

  sessionLanguageStates.set(sessionId, state);

  // Cache user preference
  if (userId) {
    userLanguagePreferences.set(userId, language);
  }

  log.info(
    { sessionId, userId, language, displayName: config.displayName },
    '🌍 Session language set'
  );

  return config;
}

/**
 * Update language based on detection
 */
export function updateDetectedLanguage(
  sessionId: string,
  detection: LanguageDetectionResult
): boolean {
  const state = sessionLanguageStates.get(sessionId);
  if (!state) {
    log.warn({ sessionId }, 'No session state for language detection update');
    return false;
  }

  // Only update if confidence is high enough
  if (detection.confidence < 0.7) {
    log.debug(
      { sessionId, confidence: detection.confidence, detected: detection.detectedLanguage },
      'Language detection confidence too low'
    );
    state.utterancesAnalyzed++;
    return false;
  }

  // Only auto-update if we haven't explicitly set a preference
  if (!state.autoDetected && state.utterancesAnalyzed < 3) {
    state.currentLanguage = detection.detectedLanguage;
    state.autoDetected = true;
    state.detectionConfidence = detection.confidence;
    state.utterancesAnalyzed++;
    state.lastUpdated = new Date();

    log.info(
      {
        sessionId,
        detected: detection.detectedLanguage,
        confidence: detection.confidence.toFixed(2),
      },
      '🌍 Language auto-detected'
    );

    return true;
  }

  state.utterancesAnalyzed++;
  return false;
}

/**
 * Clear session language state
 */
export function clearSessionLanguage(sessionId: string): void {
  sessionLanguageStates.delete(sessionId);
}

// ============================================================================
// LANGUAGE DETECTION
// ============================================================================

/**
 * Language detection patterns for common phrases
 */
const LANGUAGE_INDICATORS: Record<string, RegExp[]> = {
  'es': [
    /\b(hola|gracias|por favor|buenos días|qué tal|cómo estás)\b/i,
    /\b(necesito|quiero|puedo|tengo|estoy|vamos)\b/i,
    /[áéíóúüñ¿¡]/,
  ],
  'fr': [
    /\b(bonjour|merci|s'il vous plaît|comment allez-vous|je suis|c'est)\b/i,
    /\b(oui|non|peut-être|d'accord|alors|donc)\b/i,
    /[àâäéèêëïîôùûüÿœæç]/,
  ],
  'de': [
    /\b(hallo|danke|bitte|guten tag|wie geht es|ich bin)\b/i,
    /\b(ja|nein|vielleicht|aber|und|oder|nicht)\b/i,
    /[äöüß]/,
  ],
  'it': [
    /\b(ciao|grazie|prego|buongiorno|come stai|sono)\b/i,
    /\b(sì|no|forse|però|perché|quando)\b/i,
    /[àèéìòù]/,
  ],
  'pt': [
    /\b(olá|obrigado|por favor|bom dia|como vai|eu sou)\b/i,
    /\b(sim|não|talvez|mas|porque|quando)\b/i,
    /[àáâãéêíóôõú]/,
  ],
  'ja': [
    /[\u3040-\u309f\u30a0-\u30ff]/, // Hiragana and Katakana
    /[\u4e00-\u9faf]/, // Kanji
  ],
  'ko': [
    /[\uac00-\ud7af\u1100-\u11ff]/, // Hangul
  ],
  'zh': [
    /[\u4e00-\u9fff]/, // Chinese characters
    /[\u3400-\u4dbf]/, // CJK Extension A
  ],
  'hi': [
    /[\u0900-\u097f]/, // Devanagari
  ],
  'ar': [
    /[\u0600-\u06ff]/, // Arabic
  ],
  'ru': [
    /[\u0400-\u04ff]/, // Cyrillic
    /\b(привет|спасибо|пожалуйста|да|нет)\b/i,
  ],
};

/**
 * Detect language from text using pattern matching
 * This is a lightweight local detection - for production, consider using Gemini's detection
 */
export function detectLanguageFromText(text: string): LanguageDetectionResult {
  const normalized = text.toLowerCase().trim();

  // Score each language
  const scores: Record<string, number> = {};

  for (const [lang, patterns] of Object.entries(LANGUAGE_INDICATORS)) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(normalized)) {
        score += 0.3;
      }
    }
    if (score > 0) {
      scores[lang] = Math.min(score, 1);
    }
  }

  // Default to English if no strong signals
  if (Object.keys(scores).length === 0) {
    return {
      detectedLanguage: 'en',
      confidence: 0.5,
      sampleText: text.slice(0, 50),
    };
  }

  // Sort by score
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topLang, topScore] = sorted[0];

  return {
    detectedLanguage: topLang as SupportedLanguage,
    confidence: topScore,
    alternativeLanguages: sorted.slice(1, 3).map(([lang, score]) => ({
      language: lang as SupportedLanguage,
      confidence: score,
    })),
    sampleText: text.slice(0, 50),
  };
}

/**
 * Accumulate utterances and detect language over multiple turns
 */
const utteranceBuffers = new Map<string, string[]>();

export function accumulateForDetection(sessionId: string, transcript: string): LanguageDetectionResult | null {
  // Get or create buffer
  let buffer = utteranceBuffers.get(sessionId);
  if (!buffer) {
    buffer = [];
    utteranceBuffers.set(sessionId, buffer);
  }

  // Add transcript
  buffer.push(transcript);

  // Only analyze after 2+ utterances for better accuracy
  if (buffer.length < 2) {
    return null;
  }

  // Combine and detect
  const combined = buffer.join(' ');
  const detection = detectLanguageFromText(combined);

  // If confident enough or we have enough samples, finalize
  if (detection.confidence >= 0.7 || buffer.length >= 5) {
    utteranceBuffers.delete(sessionId);
    return detection;
  }

  return null;
}

/**
 * Clear utterance buffer for a session
 */
export function clearUtteranceBuffer(sessionId: string): void {
  utteranceBuffers.delete(sessionId);
}

// ============================================================================
// LANGUAGE NAME PARSING
// ============================================================================

/**
 * Common language names mapped to codes
 */
const LANGUAGE_NAME_MAP: Record<string, SupportedLanguage> = {
  // English
  'english': 'en',
  'american english': 'en-US',
  'british english': 'en-GB',
  'australian english': 'en-AU',
  'indian english': 'en-IN',
  'american': 'en-US',
  'british': 'en-GB',
  'australian': 'en-AU',

  // Spanish
  'spanish': 'es',
  'español': 'es',
  'espanol': 'es',
  'mexican spanish': 'es-MX',
  'castellano': 'es-ES',
  'castilian': 'es-ES',

  // French
  'french': 'fr',
  'français': 'fr',
  'francais': 'fr',

  // German
  'german': 'de',
  'deutsch': 'de',

  // Italian
  'italian': 'it',
  'italiano': 'it',

  // Portuguese
  'portuguese': 'pt',
  'português': 'pt',
  'portugues': 'pt',
  'brazilian portuguese': 'pt-BR',
  'brazilian': 'pt-BR',

  // Japanese
  'japanese': 'ja',
  '日本語': 'ja',

  // Korean
  'korean': 'ko',
  '한국어': 'ko',

  // Chinese
  'chinese': 'zh',
  'mandarin': 'zh',
  '中文': 'zh',
  'simplified chinese': 'zh-CN',

  // Hindi
  'hindi': 'hi',
  'हिन्दी': 'hi',

  // Arabic
  'arabic': 'ar',
  'العربية': 'ar',

  // Russian
  'russian': 'ru',
  'русский': 'ru',

  // Dutch
  'dutch': 'nl',
  'nederlands': 'nl',

  // Polish
  'polish': 'pl',
  'polski': 'pl',

  // Turkish
  'turkish': 'tr',
  'türkçe': 'tr',

  // Swedish
  'swedish': 'sv',
  'svenska': 'sv',
};

/**
 * Parse a language name (from voice command) to language code
 */
export function parseLanguageName(name: string): SupportedLanguage | null {
  const normalized = name.toLowerCase().trim();

  // Direct match
  if (LANGUAGE_NAME_MAP[normalized]) {
    return LANGUAGE_NAME_MAP[normalized];
  }

  // Check if it's already a valid code
  if (LANGUAGE_CONFIGS[normalized]) {
    return normalized as SupportedLanguage;
  }

  // Partial match
  for (const [key, code] of Object.entries(LANGUAGE_NAME_MAP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return code;
    }
  }

  return null;
}

/**
 * Get list of supported languages for voice prompts
 */
export function getSupportedLanguagesList(): Array<{ code: SupportedLanguage; name: string }> {
  return Object.entries(LANGUAGE_CONFIGS)
    .filter(([code]) => !code.includes('-') || code === 'en-US') // Main languages only
    .map(([code, config]) => ({
      code: code as SupportedLanguage,
      name: config.displayName,
    }));
}

// ============================================================================
// PERSISTENCE (Firestore)
// ============================================================================

/**
 * Save user language preference to Firestore
 */
export async function persistUserLanguagePreference(
  userId: string,
  language: SupportedLanguage
): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) {
      log.warn({ userId }, 'Firestore not available for language persistence');
      return;
    }

    await db
      .collection('bogle_users')
      .doc(userId)
      .set(
        {
          preferences: {
            spokenLanguage: language,
            languageUpdatedAt: new Date().toISOString(),
          },
        },
        { merge: true }
      );

    // Update cache
    userLanguagePreferences.set(userId, language);

    log.info({ userId, language }, '💾 User language preference saved');
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to persist language preference');
  }
}

/**
 * Load user language preference from Firestore
 */
export async function loadUserLanguagePreference(
  userId: string
): Promise<SupportedLanguage | null> {
  // Check cache first
  if (userLanguagePreferences.has(userId)) {
    return userLanguagePreferences.get(userId)!;
  }

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();
    if (!db) return null;

    const doc = await db.collection('bogle_users').doc(userId).get();
    const data = doc.data();

    const language = data?.preferences?.spokenLanguage as SupportedLanguage | undefined;
    if (language && LANGUAGE_CONFIGS[language]) {
      userLanguagePreferences.set(userId, language);
      return language;
    }
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to load language preference');
  }

  return null;
}

// ============================================================================
// EXPORTS
// ============================================================================

// ============================================================================
// TTS LANGUAGE HELPERS
// ============================================================================

/**
 * Get the TTS language code for Cartesia from session language
 */
export function getTtsLanguageForSession(sessionId: string): string {
  const lang = getSessionLanguage(sessionId);
  const config = getLanguageConfig(lang);
  return config.ttsLanguage;
}

/**
 * Get the STT language code for Gemini from session language
 */
export function getSttLanguageForSession(sessionId: string): string {
  const lang = getSessionLanguage(sessionId);
  const config = getLanguageConfig(lang);
  return config.sttLanguage;
}

// ============================================================================
// LANGUAGE SERVICE SINGLETON
// Factory function to return singleton methods (lazy instantiation pattern)
// ============================================================================

/**
 * Get the language service singleton.
 * This factory pattern allows lazy imports and testing.
 */
export function languageService() {
  return {
    // ========================================
    // High-level API (for tool calls)
    // ========================================

    /**
     * Set the user's spoken language.
     * High-level API for tool calls - handles both session and persistence.
     */
    async setLanguage(
      userId: string,
      languageCode: string
    ): Promise<{ success: boolean; confirmationMessage?: string; error?: string }> {
      try {
        // Try to parse the language name/code
        const parsed = parseLanguageName(languageCode);
        if (!parsed) {
          const supported = getSupportedLanguagesList()
            .map((l) => l.name)
            .join(', ');
          return {
            success: false,
            error: `I don't support "${languageCode}" yet. I can speak: ${supported}.`,
          };
        }

        // Set for the session (using userId as sessionId for now)
        setSessionLanguage(userId, parsed);

        // Persist to Firestore
        await persistUserLanguagePreference(userId, parsed);

        const config = getLanguageConfig(parsed);
        return {
          success: true,
          confirmationMessage: `Perfect! I'll speak ${config.displayName} now.`,
        };
      } catch (error) {
        log.error({ error: String(error), userId, languageCode }, 'Failed to set language');
        return { success: false, error: 'Something went wrong. Try again?' };
      }
    },

    /**
     * Get list of supported languages.
     * High-level API for tool calls.
     */
    async getSupportedLanguages(): Promise<
      Array<{ code: string; displayName: string; nativeName: string }>
    > {
      return getSupportedLanguagesList().map((lang) => {
        // Get full config to access displayName and nativeName
        const config = getLanguageConfig(lang.code);
        return {
          code: lang.code,
          displayName: config.displayName,
          nativeName: config.nativeName,
        };
      });
    },

    /**
     * Get the user's current language.
     * High-level API for tool calls.
     */
    async getCurrentLanguage(userId: string): Promise<{ code: string; displayName: string }> {
      // Try session first
      const sessionLang = getSessionLanguage(userId);
      if (sessionLang !== 'en-US') {
        const config = getLanguageConfig(sessionLang);
        return { code: sessionLang, displayName: config.displayName };
      }

      // Try Firestore preference
      const persistedLang = await loadUserLanguagePreference(userId);
      if (persistedLang) {
        const config = getLanguageConfig(persistedLang);
        return { code: persistedLang, displayName: config.displayName };
      }

      // Default
      return { code: 'en-US', displayName: 'English' };
    },

    /**
     * Clear language state for a session.
     * Called during session cleanup.
     */
    clearSession(sessionId: string): void {
      clearSessionLanguage(sessionId);
      clearUtteranceBuffer(sessionId);
    },

    // ========================================
    // Low-level session management
    // ========================================
    getSessionLanguage,
    getSessionLanguageState,
    initializeSessionLanguage,
    setSessionLanguage,
    updateDetectedLanguage,
    clearSessionLanguage,

    // ========================================
    // Configuration
    // ========================================
    getLanguageConfig,
    getSupportedLanguagesList,

    // ========================================
    // Detection
    // ========================================
    detectLanguageFromText,
    accumulateForDetection,
    clearUtteranceBuffer,

    // ========================================
    // Parsing
    // ========================================
    parseLanguageName,

    // ========================================
    // Persistence
    // ========================================
    persistUserLanguagePreference,
    loadUserLanguagePreference,

    // ========================================
    // TTS/STT helpers
    // ========================================
    getTtsLanguageForSession,
    getSttLanguageForSession,
  };
}

export default languageService;
