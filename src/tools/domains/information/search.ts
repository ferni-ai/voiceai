/**
 * Web Search Tools
 *
 * Domain: General web search and information lookup.
 * Single responsibility: Fetching information from the web.
 *
 * APIs used:
 * - DuckDuckGo Instant Answer API (free, no key required)
 * - Wikipedia API (free, no key required)
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

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
      return `I couldn't search for that right now.`;
    }

    const data = (await response.json()) as {
      AbstractText?: string;
      AbstractSource?: string;
      RelatedTopics?: Array<{ Text?: string }>;
      Heading?: string;
    };

    if (data.AbstractText) {
      const source = data.AbstractSource ? ` (via ${data.AbstractSource})` : '';
      return data.AbstractText.slice(0, 600) + source;
    }

    if (data.RelatedTopics?.[0]?.Text) {
      return data.RelatedTopics[0].Text.slice(0, 600);
    }

    return `I couldn't find specific information about "${query}". Let me share what I know from experience instead.`;
  } catch (error) {
    getLogger().warn(`Web search error: ${error}`);
    return `I had trouble searching for that. Let me share what I know instead.`;
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
      execute: async ({ query }) => {
        // Reject queries with placeholder patterns
        if (/\[.*\]/.test(query)) {
          getLogger().warn(`Search query contains placeholder: ${query}`);
          return `I need more information to search for that. Could you tell me the specific details?`;
        }
        getLogger().info(`Searching web for: ${query}`);
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
