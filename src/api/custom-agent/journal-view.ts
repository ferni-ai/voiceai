/**
 * The journal as agent routes show it while JOURNAL_ONE_STORE is on.
 *
 * The twin card's entry count and streak (digital-twin.ui.ts) and the agent
 * editor read `memories.journalEntries` off the agent, but with the flag on
 * new entries live in the journal store, not that array. So GET (and PUT's
 * reply) fill the field from the store's merged, deduped read, the same one
 * the panel lists (GET /memories?type=journalEntry). A client that sends that
 * list back in an update (character-sheet spreads `memories`) must not write
 * it into the old array, so updates drop it.
 *
 * @module api/custom-agent/journal-view
 */

import { getJournalService } from '../../services/journal/index.js';
import { journalOneStoreOn } from '../../services/journal/journal-ports.js';
import { firestoreJournalStore } from '../../services/stores/journal-store.js';
import type { CustomAgent, CustomAgentMemory } from '../../types/custom-agent-api.js';

/** The agent with `memories.journalEntries` from the store's merged read (unchanged with the flag off). */
export async function withStoreJournal(userId: string, agent: CustomAgent): Promise<CustomAgent> {
  if (!journalOneStoreOn()) return agent;
  const entries = await firestoreJournalStore.listForAgent(userId, agent);
  const journalEntries = entries as unknown as CustomAgentMemory[];
  return { ...agent, memories: { ...agent.memories, journalEntries } };
}

/** An update body without `memories.journalEntries` (unchanged with the flag off). */
export function withoutJournalEcho(body: Partial<CustomAgent>): Partial<CustomAgent> {
  if (!journalOneStoreOn() || !body.memories?.journalEntries) return body;
  const { journalEntries: _echoed, ...memories } = body.memories;
  return { ...body, memories: memories as CustomAgent['memories'] };
}

/**
 * After a write to the store outside JournalService: its per-instance cache
 * (60 s) would otherwise keep serving the Chronicle the list from before.
 */
export function journalChanged(userId: string): void {
  getJournalService().invalidateCache(userId);
}
