/**
 * Books Domain Tools
 *
 * Tools for book discovery and reading list management.
 * Uses Google Books API for discovery and Firestore for reading lists.
 *
 * DOMAIN: books
 * TOOLS:
 *   Discovery: searchBooks, getBookRecommendations, getBookDetails
 *   Reading Lists: addToReadingList, getReadingList, markBookRead, removeFromReadingList
 *   Stats: getReadingStats
 */
import type { ToolDefinition } from '../../registry/types.js';
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map