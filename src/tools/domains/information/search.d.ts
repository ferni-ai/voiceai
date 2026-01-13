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
/**
 * Search the web using DuckDuckGo Instant Answer API
 */
export declare function searchWeb(query: string): Promise<string>;
/**
 * Search Wikipedia for information
 */
export declare function searchWikipedia(query: string): Promise<string>;
/**
 * Define a term or concept
 */
export declare function defineTerm(term: string): Promise<string>;
/**
 * Search for recipes using DuckDuckGo
 */
export declare function searchRecipes(dish: string): Promise<string>;
export declare function createSearchTools(): {
    searchWeb: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    searchWikipedia: llm.FunctionTool<{
        query: string;
    }, unknown, string>;
    defineTerm: llm.FunctionTool<{
        term: string;
    }, unknown, string>;
    searchRecipes: llm.FunctionTool<{
        dish: string;
    }, unknown, string>;
};
export default createSearchTools;
//# sourceMappingURL=search.d.ts.map