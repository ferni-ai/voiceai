/**
 * Firestore adapter for the one journal store (port: services/journal/journal-ports.ts):
 * `bogle_users/{uid}/journal`, one document per entry. Never falls back to RAM.
 *
 * Entries saved before JOURNAL_ONE_STORE still sit in the agents'
 * `memories.journalEntries` arrays, so reads merge those in (deduped by id)
 * until a one-time migration has copied them over (keeping their ids).
 *
 * Owner-only: every read and write names the verified uid's own collection,
 * and firestore.rules denies the path to browsers.
 *
 * @module services/stores/journal-store
 */

import type { CustomAgent } from '../../types/custom-agent-api.js';
import { cleanForFirestore, getFirestoreDb } from '../../utils/firestore-utils.js';
import { listCustomAgents } from '../custom-agent/custom-agent-persistence-service.js';
import {
  toStoredEntry,
  type JournalEntryStore,
  type NewJournalEntry,
  type StoredJournalEntry,
} from '../journal/journal-ports.js';

/** The most entries one read returns. */
export const JOURNAL_READ_LIMIT = 500;

export function journalCollectionPath(uid: string): string {
  return `bogle_users/${uid}/journal`;
}

function journalCollection(uid: string) {
  const db = getFirestoreDb();
  if (!db) throw new Error('Journal store unavailable: Firestore is not connected');
  return db.collection(journalCollectionPath(uid));
}

export async function addJournalEntry(
  uid: string,
  entry: NewJournalEntry
): Promise<StoredJournalEntry> {
  const id = entry.id ?? `journal_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const createdAt = entry.createdAt ?? new Date();
  const stored: StoredJournalEntry = { ...entry, id, createdAt, updatedAt: createdAt };
  const doc: Record<string, unknown> = { ...stored };
  delete doc.id;
  await journalCollection(uid).doc(id).set(cleanForFirestore(doc));
  return stored;
}

/** Newest first, at most JOURNAL_READ_LIMIT. */
export async function listJournalEntries(uid: string): Promise<StoredJournalEntry[]> {
  const snap = await journalCollection(uid)
    .orderBy('createdAt', 'desc')
    .limit(JOURNAL_READ_LIMIT)
    .get();
  return snap.docs.map((doc) => toStoredEntry(doc.id, doc.data() ?? {}));
}

/** True when the entry existed in the store. */
export async function deleteJournalEntry(uid: string, id: string): Promise<boolean> {
  const ref = journalCollection(uid).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}

/** Entries still in an agent's old `memories.journalEntries` array, tagged with that agent. */
export function legacyArrayEntries(agent: CustomAgent): StoredJournalEntry[] {
  const items = (agent.memories?.journalEntries ?? []) as unknown as Array<Record<string, unknown>>;
  return items
    .filter((item) => typeof item?.id === 'string')
    .map((item) => ({ ...toStoredEntry(item.id as string, item), agentId: agent.id }));
}

/** Store entries win over array copies with the same id; newest first. */
export function mergeJournalEntries(...lists: StoredJournalEntry[][]): StoredJournalEntry[] {
  const byId = new Map<string, StoredJournalEntry>();
  for (const entry of lists.flat()) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * What one agent's journal shows: entries written with it, plus (for a twin,
 * the person's own past self) entries written with no agent. Never entries
 * written with a different agent.
 */
async function listForAgent(uid: string, agent: CustomAgent): Promise<StoredJournalEntry[]> {
  const mine = (e: StoredJournalEntry) =>
    e.agentId === agent.id || (agent.type === 'twin' && !e.agentId);
  return mergeJournalEntries(
    (await listJournalEntries(uid)).filter(mine),
    legacyArrayEntries(agent)
  );
}

/** The person's whole journal: the store plus every twin's old array. */
async function listForPerson(uid: string): Promise<StoredJournalEntry[]> {
  const twins = (await listCustomAgents(uid)).filter((agent) => agent.type === 'twin');
  return mergeJournalEntries(await listJournalEntries(uid), ...twins.map(legacyArrayEntries));
}

export const firestoreJournalStore: JournalEntryStore = {
  add: addJournalEntry,
  listForPerson,
  listForAgent,
  remove: deleteJournalEntry,
};
