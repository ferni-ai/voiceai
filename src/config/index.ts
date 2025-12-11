/**
 * Configuration Module
 *
 * Central configuration management for the Voice AI application.
 */

export {
  detectEnvironment,
  getConfig,
  isGoogleCloud,
  loadConfig,
  printConfigSummary,
  resetConfig,
  validateConfig,
  type AppConfig,
  type Environment,
} from './environment.js';

// Voice accent configuration for international users
export {
  ACCENT_DESCRIPTIONS,
  ACCENT_DISPLAY_NAMES,
  ACCENT_TO_DIALECT,
  DEFAULT_ACCENT,
  SUPPORTED_ACCENTS,
  createDefaultVoicePreference,
  detectAccentFromLocale,
  detectAccentFromLocales,
  getDialectCode,
  isValidAccent,
  logAccentSelection,
  mergeVoicePreference,
  requiresLocalization,
  type CartesiaDialect,
  type EnglishAccent,
  type LocaleDetectionResult,
  type VoicePreference,
} from './voice-accents.js';

export { default } from './environment.js';
