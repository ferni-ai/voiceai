/**
 * Remember or forget the caller's city for "near me" searches.
 *
 * Both are registered only while PLACES_LOCATION is on (see getToolDefinitions
 * in index.ts). Saving needs the caller's yes in this call: execute refuses
 * without callerSaidYes, so a model that skips the question writes nothing.
 *
 * @module tools/domains/local-search/caller-city-tools
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import type { ToolDefinition, Tool } from '../../registry/types.js';
import { callerUserId, forgetCallerCity, saveCallerCity } from './caller-city.js';

const rememberCallerCityDef: ToolDefinition = {
  id: 'rememberCallerCity',
  name: 'Remember Caller City',
  description: 'Remember the city the caller is in, so "near me" searches work next time',
  domain: 'local-search',
  tags: ['location', 'city', 'remember', 'near me'],

  create: (): Tool => {
    return llm.tool({
      description:
        'Remember the caller\'s city for "near me" searches, until they ask you to forget it. Offer first ("Want me to remember you\'re in Philly for next time?"). ' +
        'Call this only after they say yes. City or region only, never a street, postcode or coordinates. The name is checked with Places, and the caller\'s own words are what is kept.',
      parameters: z.object({
        city: z.string().describe('The city or town, e.g. "Philadelphia"'),
        region: z.string().optional().describe('The state or region, e.g. "PA"'),
        callerSaidYes: z
          .boolean()
          .describe('True only when the caller has just agreed to be remembered'),
      }),
      execute: async ({ city, region, callerSaidYes }, opts) => {
        if (!callerSaidYes) {
          return "I haven't saved that. Ask whether they want me to remember their city first.";
        }
        const userId = callerUserId(opts);
        if (!userId) return "I can't save a city on this call.";

        const result = await saveCallerCity(userId, city, region);
        if (result.status === 'not-a-city') {
          return "I couldn't find a city by that name. Which city is it in?";
        }
        if (result.status === 'lookup-failed') {
          return "I couldn't check that place just now. Let's try again in a moment.";
        }
        if (result.status === 'failed') return "I couldn't save that just now. Let's try again later.";
        return `Saved ${result.name}. Say it back to the caller so they can correct it. I'll use that city for 'near me' searches until they ask me to forget it.`;
      },
    });
  },
};

const forgetCallerCityDef: ToolDefinition = {
  id: 'forgetCallerCity',
  name: 'Forget Caller City',
  description: 'Forget the city the caller asked Ferni to remember',
  domain: 'local-search',
  tags: ['location', 'city', 'forget', 'privacy'],

  create: (): Tool => {
    return llm.tool({
      description:
        'Forget the city the caller asked you to remember ("forget where I live", "forget my city").',
      parameters: z.object({}),
      execute: async (_args, opts) => {
        const userId = callerUserId(opts);
        if (!userId) return "I can't change saved places on this call.";

        const forgotten = await forgetCallerCity(userId);
        return forgotten
          ? "Done, I've forgotten the city you asked me to remember. I may still go by the city your phone shows."
          : "I couldn't forget it just now. Let's try again in a moment.";
      },
    });
  },
};

/** Offered only while PLACES_LOCATION and REQUIRE_FIX_MEMORY are on (callerCityMemoryOn). */
export const callerCityTools: ToolDefinition[] = [rememberCallerCityDef, forgetCallerCityDef];
