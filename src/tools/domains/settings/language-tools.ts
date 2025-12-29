/**
 * Language Preference Tools
 *
 * Allows users to set and switch spoken languages via voice commands.
 *
 * Examples:
 * - "Can you speak to me in Spanish?"
 * - "Switch to French"
 * - "I'd like to speak in Japanese"
 * - "What languages do you support?"
 *
 * @module tools/domains/settings/language-tools
 */

import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// SET SPOKEN LANGUAGE TOOL
// ============================================================================

const setSpokenLanguageDef: ToolDefinition = {
  id: 'setSpokenLanguage',
  name: 'Set Spoken Language',
  description:
    'Changes the spoken language for the conversation. Call this when the user asks to speak in a different language.',
  domain: 'settings',
  tags: ['language', 'preferences', 'multilingual', 'settings'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Set the spoken language for this conversation. Call this when the user says things like:
- "Speak to me in Spanish"
- "Switch to French"  
- "Can we talk in Japanese?"
- "I prefer German"
- "Let's speak in Portuguese"

The language parameter should be the language name (e.g., "Spanish", "French", "Japanese") or code (e.g., "es", "fr", "ja").

After calling this tool, you should respond in the new language to confirm the switch.`,
      parameters: z.object({
        language: z
          .string()
          .describe(
            'The language to switch to. Can be a language name (Spanish, French) or code (es, fr)'
          ),
      }),
      execute: async (params) => {
        const { language } = params;

        try {
          // Dynamically import to avoid circular dependencies
          const {
            parseLanguageName,
            setSessionLanguage,
            getLanguageConfig,
            persistUserLanguagePreference,
          } = await import('../../../services/language/index.js');

          // Parse the language name to a code
          const languageCode = parseLanguageName(language);

          if (!languageCode) {
            log.warn(
              { userId: ctx.userId, language },
              '🌍 Unrecognized language requested'
            );
            return `I'm not sure which language "${language}" refers to. I support languages like English, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, Hindi, and many more. Could you try again?`;
          }

          // Get session ID from context (use userId as fallback)
          const sessionId = ctx.userId || 'default';

          // Set the session language
          const config = setSessionLanguage(sessionId, languageCode, ctx.userId);

          // Persist user preference
          if (ctx.userId) {
            // Fire and forget - don't block on persistence
            persistUserLanguagePreference(ctx.userId, languageCode).catch((err) => {
              log.error({ error: String(err), userId: ctx.userId }, 'Failed to persist language preference');
            });
          }

          log.info(
            {
              userId: ctx.userId,
              language: languageCode,
              displayName: config.displayName,
              nativeName: config.nativeName,
            },
            '🌍 Language switched via tool'
          );

          // Return confirmation with native name
          const confirmation = config.fullySupported
            ? `Language switched to ${config.displayName} (${config.nativeName}). I'll now speak to you in ${config.displayName}.`
            : `Language switched to ${config.displayName} (${config.nativeName}). Note: This language has limited support, so some features may work better in English.`;

          return confirmation;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, language },
            '🌍 Failed to switch language'
          );
          return `I had trouble switching languages. Let's continue in English for now, and you can try again later.`;
        }
      },
    });
  },
};

// ============================================================================
// LIST SUPPORTED LANGUAGES TOOL
// ============================================================================

const listSupportedLanguagesDef: ToolDefinition = {
  id: 'listSupportedLanguages',
  name: 'List Supported Languages',
  description:
    'Lists all languages supported by Ferni. Call this when the user asks what languages you can speak.',
  domain: 'settings',
  tags: ['language', 'preferences', 'multilingual', 'help'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `List the languages Ferni can speak. Call this when the user asks:
- "What languages do you speak?"
- "Can you speak other languages?"
- "What languages are supported?"
- "Do you speak Spanish?"`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const { getSupportedLanguagesList } = await import(
            '../../../services/language/index.js'
          );

          const languages = getSupportedLanguagesList();

          const languageList = languages.map((l) => l.name).join(', ');

          log.info({ userId: ctx.userId }, '🌍 Listing supported languages');

          return `I can speak many languages! Here are the main ones: ${languageList}. Just say "speak to me in [language]" and I'll switch. For example, "speak to me in Spanish" or "switch to French".`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId },
            '🌍 Failed to list languages'
          );
          return `I can speak many languages including English, Spanish, French, German, Italian, Portuguese, Japanese, Korean, Chinese, Hindi, and more. Just tell me which language you'd prefer!`;
        }
      },
    });
  },
};

// ============================================================================
// GET CURRENT LANGUAGE TOOL
// ============================================================================

const getCurrentLanguageDef: ToolDefinition = {
  id: 'getCurrentLanguage',
  name: 'Get Current Language',
  description:
    'Gets the current spoken language for the conversation. Call this when the user asks what language you are speaking.',
  domain: 'settings',
  tags: ['language', 'preferences', 'status'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Get the current language setting. Call this when the user asks:
- "What language are we speaking?"
- "What language is this?"
- "What's my language set to?"`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const { getSessionLanguageState, getLanguageConfig } = await import(
            '../../../services/language/index.js'
          );

          const sessionId = ctx.userId || 'default';
          const state = getSessionLanguageState(sessionId);

          if (!state) {
            return `We're currently speaking in English. Would you like to switch to another language?`;
          }

          const config = getLanguageConfig(state.currentLanguage);
          const autoDetectedNote = state.autoDetected
            ? ` (I detected this from how you were speaking)`
            : '';

          log.info(
            { userId: ctx.userId, language: state.currentLanguage },
            '🌍 Reporting current language'
          );

          return `We're currently speaking in ${config.displayName}${autoDetectedNote}. Would you like to switch to a different language?`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId },
            '🌍 Failed to get current language'
          );
          return `We're speaking in English. Would you like to switch to another language?`;
        }
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const languageToolDefinitions = [
  setSpokenLanguageDef,
  listSupportedLanguagesDef,
  getCurrentLanguageDef,
];

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'settings',
  languageToolDefinitions
);
