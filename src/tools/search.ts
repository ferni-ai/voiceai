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

import { llm, log } from '@livekit/agents';
import { z } from 'zod';

const getLogger = () => log();

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
    const title = results[0].title;
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

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createSearchTools() {
  return {
    searchWeb: llm.tool({
      description:
        "Search the web for current information. Use sparingly—only when you genuinely don't know something or need current data.",
      parameters: z.object({
        query: z.string().describe('The search query'),
      }),
      execute: async ({ query }) => {
        getLogger().info(`Searching web for: ${query}`);
        return searchWeb(query);
      },
    }),

    searchWikipedia: llm.tool({
      description:
        'Search Wikipedia for factual information about a topic, person, event, or concept.',
      parameters: z.object({
        query: z.string().describe('What to look up on Wikipedia'),
      }),
      execute: async ({ query }) => {
        getLogger().info(`Searching Wikipedia for: ${query}`);
        return searchWikipedia(query);
      },
    }),

    defineTerm: llm.tool({
      description: 'Get the definition of a term, word, or concept.',
      parameters: z.object({
        term: z.string().describe('The term to define'),
      }),
      execute: async ({ term }) => {
        getLogger().info(`Defining: ${term}`);
        return defineTerm(term);
      },
    }),
  };
}

export default createSearchTools;
