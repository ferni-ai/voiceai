/**
 * Preference tools — setPreference / getPreferences.
 *
 * Both are thin voice adapters over the user preference profile
 * (src/services/user-preferences). The Gemini JSON-workaround path routes the
 * same tool names through agents/shared/tool-executors/preferences-executor.ts,
 * which calls the same service functions.
 *
 * "I prefer shorter answers" · "call me Sam" · "don't bring up my dad"
 * "what do you know about my preferences?" · "forget that I like jazz"
 *
 * @module simple-utilities/preference-tools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  describePreferencesForVoice,
  setPreferenceFromVoice,
  VOICE_PREFERENCE_TYPES,
} from '../../../services/user-preferences/index.js';
import { getLogger } from '../../../utils/safe-logger.js';
import type { Tool, ToolContext, ToolDefinition } from '../../registry/types.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';

const log = getLogger();

const preferenceType = z.enum(VOICE_PREFERENCE_TYPES);

export const setPreferenceDef: ToolDefinition = {
  id: 'setPreference',
  name: 'Set Preference',
  description:
    'Remember or forget how the user likes things: name, answer length, tone, boundaries, coaching style, interests & hobbies, music & shows, likes, units.',
  domain: 'simple-utilities',
  tags: ['preferences', 'settings', 'personalization', 'essentials', 'better-than-human', 'memory'],

  create: (ctx: ToolContext): Tool =>
    llm.tool({
      description: getToolDescription('setPreference'),
      parameters: z.object({
        preferenceType: preferenceType.optional().describe('Type of preference'),
        type: preferenceType.optional().describe('Type of preference (alias for preferenceType)'),
        value: z
          .string()
          .optional()
          .describe('The preference value, e.g. "Sam", "short", "my dad", "jazz"'),
        action: z
          .enum(['set', 'forget'])
          .optional()
          .describe('"forget" removes it (default "set")'),
        category: z
          .enum(['food', 'diet', 'music', 'activity', 'brand', 'place', 'other'])
          .optional()
          .describe('For like/dislike: what kind of thing'),
        detail: z
          .string()
          .optional()
          .describe(
            'interest: a specific ("training for a 10k"); show/book: progress ("season 2"); music-mood: the activity ("working")'
          ),
        status: z
          .enum([
            'want_to',
            'watching',
            'reading',
            'listening',
            'playing',
            'following',
            'finished',
            'dropped',
          ])
          .optional()
          .describe('For show/movie/book/podcast/game'),
        customKey: z.string().optional().describe('Key for custom preferences'),
        statement: z
          .string()
          .optional()
          .describe('The user\'s own words when no type fits, e.g. "I prefer shorter answers"'),
      }),
      execute: async (args) => {
        log.info(
          {
            userId: ctx.userId,
            type: args.preferenceType ?? args.type,
            action: args.action ?? 'set',
          },
          'Setting preference'
        );
        return setPreferenceFromVoice(ctx.userId, args);
      },
    }),
};

export const getPreferencesDef: ToolDefinition = {
  id: 'getPreferences',
  name: 'Get Preferences',
  description: 'Say what Ferni knows about how the user likes things',
  domain: 'simple-utilities',
  tags: ['preferences', 'settings', 'essentials', 'memory'],

  create: (ctx: ToolContext): Tool =>
    llm.tool({
      description: getToolDescription('getPreferences'),
      parameters: z.object({}),
      execute: async () => describePreferencesForVoice(ctx.userId),
    }),
};
