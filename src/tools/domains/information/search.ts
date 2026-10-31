/**
 * Web Search Tools
 *
 * Domain: General web search and information lookup.
 * Single responsibility: Fetching information from the web.
 *
 * APIs used:
 * - Vertex Gemini grounded in Google Search for searchWeb, with WEB_SEARCH=on (web-search.ts)
 * - DuckDuckGo Instant Answer API (free, no key required)
 * - Wikipedia API (free, no key required)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { flagOn } from '../../../config/env-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
import { runWebSearch, searchPrincipal, webSearchEnabled } from './web-search.js';
// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Said with an empty search: "Let me share what I know from experience
 * instead" came back for a ball score, a taco place and a drive time, and
 * the model answered them from memory (local lookups calls, 2026-10-09).
 */
const NO_GUESS =
  "If they asked about something live (a score, a price, opening hours, a travel time, a place nearby), say you couldn't find it rather than guess.";

/**
 * NO_INVENTED_INTERNALS=on: a failed search says so in a shape the model can't
 * read as an answer, with what to say next. On #2223's call a "No results"
 * was followed by two minutes of made-up backend (no-invented-internals.ts).
 */
const NO_FILL_IN =
  "Tell them in your own words that it didn't work and offer another way; don't guess at why, or describe how your search works.";
function searchFailed(status: 'no_results' | 'error' | 'unconfigured', text: string): string {
  const internals = flagOn('NO_INVENTED_INTERNALS');
  // unconfigured is always typed: it is the one the model read as "nothing exists".
  if (!internals && status !== 'unconfigured') return text;
  return `[status: ${status}] ${text}${internals ? ` ${NO_FILL_IN}` : ''}`;
}

/**
 * WEB_SEARCH_HONEST_FALLBACK=on. With WEB_SEARCH off there is no web search, only
 * DuckDuckGo's Instant Answers (encyclopedia abstracts). On the 2026-10-30 dev
 * sweep it said "No results" 6 of 6 times (a drive time, a Thai place, a fare, a
 * movie, Mars weather), and after one the model gave "usually forty-five
 * minutes to an hour" anyway. An empty instant answer proves nothing doesn't
 * exist, so it says the search isn't available and that it doesn't know.
 */
export const NO_ESTIMATE =
  "Don't guess or estimate: no time, distance, price, score or 'usually about' figure from memory.";
export const CANT_SEARCH = `I can't search the web right now, so I couldn't find that and I don't know. Say so plainly. ${NO_ESTIMATE}`;
const honestFallback = (): boolean => flagOn('WEB_SEARCH_HONEST_FALLBACK');

/**
 * Search the web using DuckDuckGo Instant Answer API
 */
export async function searchWeb(query: string): Promise<string> {
  try {
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      if (honestFallback()) return searchFailed('unconfigured', CANT_SEARCH);
      return searchFailed('error', `I couldn't search for that right now.`);
    }

    const data = (await response.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      RelatedTopics?: Array<{ Text?: string }>;
      Heading?: string;
    };

    const abstract = data.AbstractText?.trim();
    if (abstract) {
      const source = data.AbstractSource ? ` (via ${data.AbstractSource})` : '';
      return abstract.slice(0, 600) + source;
    }

    const related = data.RelatedTopics?.[0]?.Text?.trim();
    if (related) {
      return related.slice(0, 600);
    }

    if (honestFallback()) return searchFailed('unconfigured', CANT_SEARCH);
    return searchFailed('no_results', `No results for "${query}". ${NO_GUESS}`);
  } catch (error) {
    getLogger().warn(`Web search error: ${error}`);
    if (honestFallback()) return searchFailed('unconfigured', CANT_SEARCH);
    return searchFailed('error', `The search didn't work just now. ${NO_GUESS}`);
  }
}

/**
 * Search Wikipedia for information
 */
export async function searchWikipedia(query: string): Promise<string> {
  try {
    // First, search for the article
    const searchUrl =
      `https://en.wikipedia.org/w/api.php?` +
      `action=query&list=search&srsearch=${encodeURIComponent(query)}` +
      `&srlimit=1&format=json&origin=*`;

    const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) });

    if (!searchResponse.ok) {
      return `I couldn't search Wikipedia right now.`;
    }

    const searchData = (await searchResponse.json()) as {
      query?: { search?: Array<{ title?: string; pageid?: number }> };
    };

    const results = searchData.query?.search;
    if (!results || results.length === 0) {
      return `I couldn't find a Wikipedia article about "${query}".`;
    }

    // Get the article extract
    const { title } = results[0];
    const extractUrl =
      `https://en.wikipedia.org/w/api.php?` +
      `action=query&titles=${encodeURIComponent(title || '')}` +
      `&prop=extracts&exintro=1&explaintext=1&format=json&origin=*`;

    const extractResponse = await fetch(extractUrl, { signal: AbortSignal.timeout(8000) });

    if (!extractResponse.ok) {
      return `Found "${title}" but couldn't get the content.`;
    }

    const extractData = (await extractResponse.json()) as {
      query?: { pages?: Record<string, { extract?: string }> };
    };

    const pages = extractData.query?.pages;
    if (!pages) {
      return `I found "${title}" but couldn't read it.`;
    }

    const pageContent = Object.values(pages)[0];
    const extract = pageContent?.extract;

    if (extract) {
      // Truncate and clean up
      const cleaned = extract.slice(0, 800).replace(/\n+/g, ' ').trim();
      return `From Wikipedia: ${cleaned}...`;
    }

    return `I found "${title}" but the article was empty.`;
  } catch (error) {
    getLogger().warn(`Wikipedia search error: ${error}`);
    return `I had trouble searching Wikipedia.`;
  }
}

/**
 * Define a term or concept
 */
export async function defineTerm(term: string): Promise<string> {
  // Try DuckDuckGo first for definitions
  const ddgResult = await searchWeb(`define ${term}`);

  if (ddgResult && !ddgResult.includes("couldn't find")) {
    return ddgResult;
  }

  // Fall back to Wikipedia
  return searchWikipedia(term);
}

/**
 * Search for recipes using DuckDuckGo
 */
export async function searchRecipes(dish: string): Promise<string> {
  try {
    // Use DuckDuckGo to search for recipes
    const response = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(`${dish} recipe`)}&format=json&no_html=1&skip_disambig=1`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      return `I couldn't search for recipes right now.`;
    }

    const data = (await response.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    // If we have a direct recipe result
    if (data.AbstractText && data.AbstractText.length > 50) {
      const source = data.AbstractSource ? ` (via ${data.AbstractSource})` : '';
      return `Here's a recipe for ${dish}:\n\n${data.AbstractText.slice(0, 1000)}${source}`;
    }

    // Try to find recipe from related topics
    const recipeTopics = data.RelatedTopics?.filter(
      (topic: { Text?: string }) =>
        Boolean(topic.Text) &&
        (topic.Text?.toLowerCase().includes('recipe') ||
          topic.Text?.toLowerCase().includes('ingredient'))
    );

    if (Array.isArray(recipeTopics) && recipeTopics.length > 0) {
      const recipes = recipeTopics
        .slice(0, 3)
        .map((t) => `• ${t.Text}`)
        .join('\n');
      return `Here are some ${dish} recipes:\n\n${recipes}`;
    }

    // Fall back to general search results
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const first = data.RelatedTopics[0];
      if (first.Text) {
        return `Here's what I found about ${dish}: ${first.Text.slice(0, 500)}`;
      }
    }

    // Ultimate fallback - suggest searching
    return `I couldn't find a specific recipe for "${dish}". Try asking for ingredients or cooking instructions instead?`;
  } catch (error) {
    getLogger().warn(`Recipe search error: ${error}`);
    return `I had trouble searching for that recipe. Try a different dish name?`;
  }
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSearchTools() {
  return {
    searchWeb: llm.tool({
      description:
        "Search the web for information. IMPORTANT: If the user's request requires specific info you don't have (like their location, dates, or preferences), ASK them first before searching. Do NOT use placeholders like '[user location]' - either ask or search without that detail. For travel/flights, ask departure city first. Share results naturally without announcing the search.",
      parameters: z.object({
        query: z
          .string()
          .describe(
            'The search query - must contain REAL values, no placeholders like [user location]'
          ),
      }),
      execute: async ({ query }, opts) => {
        // Reject queries with placeholder patterns
        if (/\[.*\]/.test(query)) {
          getLogger().warn(`Search query contains placeholder: ${query}`);
          return `I need more information to search for that. Could you tell me the specific details?`;
        }
        getLogger().info(`Searching web for: ${query}`);
        // WEB_SEARCH=on: Google Search grounding instead of DuckDuckGo's Instant Answers.
        if (webSearchEnabled()) return runWebSearch(query, searchPrincipal(opts));
        return searchWeb(query);
      },
    }),

    searchWikipedia: llm.tool({
      description: getToolDescription('searchWikipedia'),
      parameters: z.object({
        query: z.string().describe('What to look up on Wikipedia'),
      }),
      execute: async ({ query }) => {
        getLogger().info(`Searching Wikipedia for: ${query}`);
        return searchWikipedia(query);
      },
    }),

    defineTerm: llm.tool({
      description: getToolDescription('defineTerm'),
      parameters: z.object({
        term: z.string().describe('The term to define'),
      }),
      execute: async ({ term }) => {
        getLogger().info(`Defining: ${term}`);
        return defineTerm(term);
      },
    }),

    searchRecipes: llm.tool({
      description: 'Search for recipes and cooking instructions for a dish',
      parameters: z.object({
        dish: z.string().describe('The dish or food to find a recipe for'),
      }),
      execute: async ({ dish }) => {
        getLogger().info(`Searching recipes for: ${dish}`);
        return searchRecipes(dish);
      },
    }),
  };
}

export default createSearchTools;
