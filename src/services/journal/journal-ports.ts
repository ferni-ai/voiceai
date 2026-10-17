/**
 * The one journal store's port: what the journal needs from storage, the
 * entry shape, and the JOURNAL_ONE_STORE switch.
 *
 * Journal audit 2026-10-13: seven surfaces wrote seven stores and none met.
 * The Voice Journal panel (and so talk-to-twin, which reads what it lists)
 * used an array on the twin's agent doc; the Chronicle read a memories
 * subcollection and wrote one UI instance's RAM. Behind JOURNAL_ONE_STORE
 * (off by default) they all read and write `bogle_users/{uid}/journal`, one
 * document per entry, through the Firestore adapter in
 * services/stores/journal-store.ts (wired in by api/journal-routes.ts). An
 * entry carries an optional `agentId`: the agent it was written with, or none
 * for the person's own journal.
 *
 * @module services/journal/journal-ports
 */

import { flagOn } from '../../config/env-flag.js';
import type { CustomAgent } from '../../types/custom-agent-api.js';
import { getMoodLabel, normalizeMood } from './mood-conversion.js';
import type { JournalSource, UnifiedJournalEntry } from './index.js';

const SOURCES: readonly JournalSource[] = [
  'digital_twin',
  'productivity',
  'auto_capture',
  'quick_note',
  'trust_analytics',
];
const TEXT_FIELDS = [
  'agentId',
  'mood',
  'title',
  'audioUrl',
  'transcript',
  'promptId',
  'promptText',
  'source',
  'momentType',
  'conversationId',
  'personaId',
] as const;
const LIST_FIELDS = ['themes', 'emotions', 'keywords'] as const;
const NUMBER_FIELDS = ['durationSeconds', 'intensity'] as const;

type TextField = (typeof TEXT_FIELDS)[number];
type ListField = (typeof LIST_FIELDS)[number];
type NumberField = (typeof NUMBER_FIELDS)[number];

export type StoredJournalEntry = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
} & Partial<Record<TextField, string>> &
  Partial<Record<ListField, string[]>> &
  Partial<Record<NumberField, number>>;

export type NewJournalEntry = Omit<StoredJournalEntry, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
  createdAt?: Date;
};

export interface JournalEntryStore {
  add: (uid: string, entry: NewJournalEntry) => Promise<StoredJournalEntry>;
  /** The person's whole journal, newest first, including entries still in old twin arrays. */
  listForPerson: (uid: string) => Promise<StoredJournalEntry[]>;
  /** What one agent's journal shows (see the adapter for which entries). */
  listForAgent: (uid: string, agent: CustomAgent) => Promise<StoredJournalEntry[]>;
  /** True when the entry existed in the store. */
  remove: (uid: string, id: string) => Promise<boolean>;
}

let wired: JournalEntryStore | null = null;

/** Called once by the composition root (api/journal-routes.ts) with the Firestore adapter. */
export function useJournalEntryStore(store: JournalEntryStore): void {
  wired = store;
}

function journalEntryStore(): JournalEntryStore {
  if (!wired) throw new Error('JOURNAL_ONE_STORE is on but no journal store is wired');
  return wired;
}

export function journalOneStoreOn(): boolean {
  return flagOn('JOURNAL_ONE_STORE');
}

/** A Firestore Timestamp, Date, ISO string or millis as a Date (epoch 0 when unreadable). */
export function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  const ts = value as { toDate?: () => Date } | null | undefined;
  if (typeof ts?.toDate === 'function') return ts.toDate();
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date(0);
}

/** A stored document (or a legacy array item) as an entry. Older tool writes kept the text in `entry`. */
export function toStoredEntry(id: string, data: Record<string, unknown>): StoredJournalEntry {
  const text = [data.content, data.entry].find((v): v is string => typeof v === 'string') ?? '';
  const entry: StoredJournalEntry = {
    id,
    content: text,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt ?? data.createdAt),
  };
  for (const key of TEXT_FIELDS) if (typeof data[key] === 'string') entry[key] = data[key];
  for (const key of NUMBER_FIELDS) if (typeof data[key] === 'number') entry[key] = data[key];
  for (const key of LIST_FIELDS) {
    const list = data[key];
    if (Array.isArray(list)) entry[key] = list.filter((v): v is string => typeof v === 'string');
  }
  return entry;
}

export function toUnifiedEntry(uid: string, entry: StoredJournalEntry): UnifiedJournalEntry {
  const mood = entry.mood ? normalizeMood(entry.mood) : undefined;
  const source = SOURCES.find((s) => s === entry.source) ?? 'digital_twin';
  return {
    ...entry,
    userId: uid,
    source,
    mood: mood ? { id: mood.id, score: mood.score, label: getMoodLabel(mood.id) } : undefined,
  };
}

/** Keeps only the stored fields (no userId: the path names the owner). */
export function fromUnifiedEntry(entry: UnifiedJournalEntry): NewJournalEntry {
  return toStoredEntry(entry.id, { ...entry, mood: entry.mood?.id });
}

/** The Chronicle's write path with the flag on. */
export async function addUnifiedEntry(uid: string, entry: UnifiedJournalEntry): Promise<void> {
  await journalEntryStore().add(uid, fromUnifiedEntry(entry));
}

/**
 * What the Chronicle shows from the store (empty while JOURNAL_ONE_STORE is
 * off): the whole journal, optionally narrowed to one agent's entries.
 */
export async function readChronicleJournal(
  uid: string,
  agentId?: string
): Promise<UnifiedJournalEntry[]> {
  if (!journalOneStoreOn()) return [];
  const entries = await journalEntryStore().listForPerson(uid);
  return entries
    .filter((entry) => !agentId || entry.agentId === agentId)
    .map((entry) => toUnifiedEntry(uid, entry));
}
