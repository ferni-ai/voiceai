/**
 * Extended Domain Indexers
 *
 * Index additional data sources for comprehensive semantic search:
 * - Voice journals
 * - Custom agents
 * - Contact notes
 * - Habits
 *
 * @module memory/user-memory-indexer/extended-indexers
 */
import { type AnyVectorStore } from './types.js';
import type { JournalEntry, CustomAgent } from '../../types/custom-agent.js';
import type { EnhancedContact } from '../../types/contacts.js';
import type { EnhancedHabit } from '../../tools/habit-coaching/types.js';
/**
 * Index voice journal entries for semantic search.
 * Enables queries like "What did I write about feeling overwhelmed?"
 */
export declare function indexVoiceJournals(userId: string, journals: JournalEntry[], store: AnyVectorStore): Promise<number>;
/**
 * Index custom agent descriptions and personality for similarity search.
 * Enables finding agents similar to user descriptions.
 */
export declare function indexCustomAgents(userId: string, agents: CustomAgent[], store: AnyVectorStore): Promise<number>;
/**
 * Index contact notes and relationship context for queries like:
 * "Who did I talk to about hiking?" or "What do I know about Sarah's interests?"
 */
export declare function indexContactNotes(userId: string, contacts: EnhancedContact[], store: AnyVectorStore): Promise<number>;
/**
 * Index habit descriptions for semantic queries like:
 * "What habits do I have related to exercise?" or "Show me my morning habits"
 */
export declare function indexHabits(userId: string, habits: EnhancedHabit[], store: AnyVectorStore): Promise<number>;
//# sourceMappingURL=extended-indexers.d.ts.map