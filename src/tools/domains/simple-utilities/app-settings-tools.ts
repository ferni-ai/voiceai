/**
 * App Settings Tools
 *
 * Tools for voice-controlled app settings.
 * These enable Ferni to change app behavior on behalf of the user.
 *
 * DOMAIN: simple-utilities
 *
 * Capabilities:
 * - setAppLanguage: Change the app's display language
 *
 * BETTER THAN HUMAN: A friend would help you navigate settings.
 * Ferni just does it for you.
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger().child({ module: 'app-settings-tools' });

// ============================================================================
// SUPPORTED LANGUAGES
// ============================================================================

/**
 * Supported locale codes for the app.
 * Must match SUPPORTED_LOCALES in apps/web/src/i18n/index.ts
 */
export const SUPPORTED_LOCALES = [
  'en-US',
  'en-GB',
  'es',
  'fr',
  'de',
  'ja',
  'ko',
  'zh-Hans',
  'zh-Hant',
  'ar',
  'he',
] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Human-readable language names for Ferni to speak
 */
const LANGUAGE_NAMES: Record<SupportedLocale, string> = {
  'en-US': 'English',
  'en-GB': 'British English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  'zh-Hans': 'Simplified Chinese',
  'zh-Hant': 'Traditional Chinese',
  ar: 'Arabic',
  he: 'Hebrew',
};

/**
 * Keywords that map to locales (for natural language matching)
 */
const LANGUAGE_KEYWORDS: Record<string, SupportedLocale> = {
  // English variants
  english: 'en-US',
  american: 'en-US',
  'us english': 'en-US',
  british: 'en-GB',
  'uk english': 'en-GB',

  // Spanish
  spanish: 'es',
  español: 'es',
  espanol: 'es',

  // French
  french: 'fr',
  français: 'fr',
  francais: 'fr',

  // German
  german: 'de',
  deutsch: 'de',

  // Japanese
  japanese: 'ja',
  日本語: 'ja',
  nihongo: 'ja',

  // Korean
  korean: 'ko',
  한국어: 'ko',
  hangugeo: 'ko',

  // Chinese
  chinese: 'zh-Hans',
  mandarin: 'zh-Hans',
  'simplified chinese': 'zh-Hans',
  简体中文: 'zh-Hans',
  'traditional chinese': 'zh-Hant',
  繁體中文: 'zh-Hant',

  // Arabic
  arabic: 'ar',
  العربية: 'ar',

  // Hebrew
  hebrew: 'he',
  עברית: 'he',
};

// ============================================================================
// SET APP LANGUAGE TOOL
// ============================================================================

/**
 * Resolve a language name/code to a supported locale
 */
function resolveLanguage(input: string): SupportedLocale | null {
  const normalized = input.toLowerCase().trim();

  // Check if it's already a valid locale code (case-insensitive)
  // SUPPORTED_LOCALES has mixed case like 'en-US', so we compare lowercase
  const matchedLocale = SUPPORTED_LOCALES.find((code) => code.toLowerCase() === normalized);
  if (matchedLocale) {
    return matchedLocale;
  }

  // Check keywords (already lowercase)
  if (LANGUAGE_KEYWORDS[normalized]) {
    return LANGUAGE_KEYWORDS[normalized];
  }

  // Fuzzy match - check if any keyword is contained in the input
  // Only match if the keyword is a substantial part of the input
  for (const [keyword, locale] of Object.entries(LANGUAGE_KEYWORDS)) {
    // Require exact word match or the keyword is most of the input
    if (normalized === keyword || (normalized.includes(keyword) && keyword.length >= 4)) {
      return locale;
    }
  }

  return null;
}

/**
 * Tool Definition: Set App Language
 *
 * Enables Ferni to change the app's display language via voice command.
 * The change happens WITHOUT disconnecting the voice call.
 *
 * Example voice commands:
 * - "Change the language to Spanish"
 * - "Switch to French"
 * - "Put everything in Japanese"
 * - "I want to use the app in German"
 */
export const setAppLanguageDef: ToolDefinition = {
  id: 'setAppLanguage',
  name: 'Set App Language',
  description: 'Change the app display language when the user requests it',
  domain: 'simple-utilities',
  tags: ['settings', 'language', 'i18n', 'accessibility'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Change the app's display language. Use when the user asks to switch languages, change language, or use the app in a different language. Supported: English, Spanish, French, German, Japanese, Korean, Chinese (Simplified/Traditional), Arabic, Hebrew.`,

      parameters: z.object({
        language: z
          .string()
          .describe(
            'The language to switch to. Can be a language name (e.g., "Spanish", "French") or locale code (e.g., "es", "fr")'
          ),
      }),

      execute: async (params): Promise<string> => {
        const { language } = params;

        log.info({ userId: ctx.userId, language }, 'Changing app language');

        // Resolve the language to a locale code
        const locale = resolveLanguage(language);

        if (!locale) {
          const supported = Object.keys(LANGUAGE_NAMES)
            .map((code) => LANGUAGE_NAMES[code as SupportedLocale])
            .join(', ');

          log.warn({ language }, 'Unsupported language requested');
          return `I don't support "${language}" yet. I can switch to: ${supported}.`;
        }

        const languageName = LANGUAGE_NAMES[locale];

        // Send data message to frontend to change language
        // The frontend handler will call setLocale() with reload: false,
        // dispatching 'ferni:locale-changed' event instead of reloading.
        // This keeps the LiveKit connection alive!
        try {
          const { getFrontendPublisher } =
            await import('../../../agents/realtime/frontend-publisher.js');
          const publisher = getFrontendPublisher();

          if (publisher.isConnected()) {
            await publisher.sendSetLanguage(locale);
            log.info({ locale, languageName }, 'Language change message sent to frontend');
          } else {
            log.warn({ locale }, 'Cannot send language change: not connected to room');
            return `I'll switch to ${languageName}, but the connection isn't ready yet. Try again in a moment.`;
          }
        } catch (error) {
          log.error({ error: String(error), locale }, 'Failed to send language change');
          return `I tried to switch to ${languageName}, but something went wrong. Try again?`;
        }

        // Return confirmation for Ferni to speak
        return `Switching to ${languageName}. The app will update in just a moment.`;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * All app settings tool definitions
 */
export const appSettingsToolDefinitions: ToolDefinition[] = [setAppLanguageDef];

export default appSettingsToolDefinitions;
