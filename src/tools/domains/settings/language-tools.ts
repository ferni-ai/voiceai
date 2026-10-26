/**
 * Language Preference Tools
 *
 * Lets users state a spoken-language preference. Calls are English-only for
 * now (see canSpeakLanguageLive), so non-English requests are remembered,
 * never claimed as a switch.
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
  name: 'Save Language Preference',
  description:
    'Remembers the language the user would like. Calls are English only for now, so this saves the preference and offers help with words and phrases.',
  domain: 'settings',
  tags: ['language', 'preferences', 'multilingual', 'settings'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Remember the language the user would like. Call this when the user says things like:
- "Speak to me in Spanish"
- "Switch to French"  
- "Can we talk in Japanese?"
- "I prefer German"
- "Let's speak in Portuguese"

The language parameter should be the language name (e.g., "Spanish", "French", "Japanese") or code (e.g., "es", "fr", "ja").

Calls are English only for now, so this does not change the language you talk in. Say what the result says and never claim you switched. If they want the app's screens in another language, use setAppLanguage.`,
      parameters: z.object({
        language: z
          .string()
          .describe(
            'The language they would like. A language name (Spanish, French) or code (es, fr)'
          ),
      }),
      execute: async (params) => {
        const { language } = params;

        try {
          // Dynamically import to avoid circular dependencies
          const {
            parseLanguageName,
            setSessionLanguage,
            persistUserLanguagePreference,
            canSpeakLanguageLive,
            languageNotLiveMessage,
          } = await import('../../../services/language/index.js');

          // Parse the language name to a code
          const languageCode = parseLanguageName(language);

          if (!languageCode) {
            log.warn({ userId: ctx.userId, language }, '🌍 Unrecognized language requested');
            return `I'm not sure which language "${language}" refers to. Could you say it another way?`;
          }

          // Get session ID from context (use actual sessionId, with userId as fallback)
          const sessionId = ctx.sessionId || ctx.userId || 'default';

          // Set the session language (also updates userId cache internally)
          const config = setSessionLanguage(sessionId, languageCode, ctx.userId);

          // Persist user preference
          if (ctx.userId) {
            // Fire and forget - don't block on persistence
            persistUserLanguagePreference(ctx.userId, languageCode).catch((err) => {
              log.error(
                { error: String(err), userId: ctx.userId },
                'Failed to persist language preference'
              );
            });
          }

          log.info(
            {
              userId: ctx.userId,
              language: languageCode,
              displayName: config.displayName,
              nativeName: config.nativeName,
            },
            '🌍 Language preference set via tool'
          );

          // Calls are English-only today: keep the preference, but never claim a switch.
          if (!canSpeakLanguageLive(languageCode)) {
            return languageNotLiveMessage(config.displayName);
          }

          return `Language switched to ${config.displayName}. I'll now speak to you in ${config.displayName}.`;
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId, language },
            '🌍 Failed to switch language'
          );
          return `I had trouble saving that. Let's keep going in English for now.`;
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
    'Tells the user which languages Ferni can help with for words and phrases. Calls are English only for now.',
  domain: 'settings',
  tags: ['language', 'preferences', 'multilingual', 'help'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Tell the user which languages you can help with for words and phrases, and that calls are English only for now. Call this when the user asks things like:
- "What languages do you speak?"
- "Can you speak other languages?"
- "What languages are supported?"
- "Do you speak Spanish?"`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const { getSupportedLanguagesList, languageHelpListMessage } =
            await import('../../../services/language/index.js');

          log.info({ userId: ctx.userId }, '🌍 Listing supported languages');

          return languageHelpListMessage(getSupportedLanguagesList());
        } catch (error) {
          log.error({ error: String(error), userId: ctx.userId }, '🌍 Failed to list languages');
          return `I only speak English on calls for now. I can help with words and phrases in Spanish, French, German, Japanese, Chinese, Hindi, and more.`;
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
    'Tells the user which language the call is in and which one they would like. Calls are English only for now.',
  domain: 'settings',
  tags: ['language', 'preferences', 'status'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Say which language this call is in and which one the user would like. Calls are English only for now. Call this when the user asks:
- "What language are we speaking?"
- "What language is this?"
- "What's my language set to?"`,
      parameters: z.object({}),
      execute: async () => {
        try {
          const { getSessionLanguageState, getLanguageConfig, currentCallLanguageMessage } =
            await import('../../../services/language/index.js');

          const sessionId = ctx.userId || 'default';
          const state = getSessionLanguageState(sessionId);

          if (!state) {
            return `We're speaking English.`;
          }

          const config = getLanguageConfig(state.currentLanguage);

          log.info(
            { userId: ctx.userId, language: state.currentLanguage },
            '🌍 Reporting current language'
          );

          return currentCallLanguageMessage(
            state.currentLanguage,
            config.displayName,
            state.autoDetected
          );
        } catch (error) {
          log.error(
            { error: String(error), userId: ctx.userId },
            '🌍 Failed to get current language'
          );
          return `We're speaking English.`;
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
