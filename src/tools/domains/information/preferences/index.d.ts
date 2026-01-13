/**
 * User Information Preferences Tools
 *
 * Tools for managing personalized information delivery.
 * Enables "Better Than Human" features like zero-param tools:
 * - "How are my teams doing?" → Gets scores for YOUR teams
 * - "What's my commute?" → Gets traffic for YOUR route
 * - "How's the market?" → Gets YOUR watchlist performance
 *
 * TOOLS:
 *   addFavoriteTeam     - Remember a favorite sports team
 *   removeFavoriteTeam  - Forget a favorite team
 *   getMyTeams          - Get scores for all favorite teams
 *   addToWatchlist      - Add a stock to watchlist
 *   removeFromWatchlist - Remove a stock from watchlist
 *   getMyWatchlist      - Get watchlist performance
 *   saveMyLocation      - Save home/work/other location
 *   setMyAllergies      - Remember allergy information
 *   setNewsPreferences  - Configure news interests
 */
import type { ToolDefinition } from '../../../registry/types.js';
export * from './types.js';
export * from './storage.js';
export declare const preferencesToolDefinitions: ToolDefinition[];
/**
 * Get preference tool definitions
 */
export declare function getPreferencesToolDefinitions(): ToolDefinition[];
//# sourceMappingURL=index.d.ts.map