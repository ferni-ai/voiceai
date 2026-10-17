/**
 * The JOURNAL_ONE_STORE migration (run by scripts/migrate-journal-one-store.ts):
 * copies the entries still kept in each agent's `memories.journalEntries` array
 * into bogle_users/{uid}/journal/{entryId}, tagged with the agent's id.
 *
 * The entry keeps its id, so reads (which merge the arrays in, deduped by id)
 * never show it twice, and a second run writes nothing. Placeholders
 * ("[Transcription unavailable]") are not the person's words and are skipped.
 * The arrays are left alone; removing them is a later, separate step.
 *
 * @module services/stores/journal-migration
 */
import { isJournalPlaceholder } from '../custom-agent/journal-placeholder.js';
import { toStoredEntry } from '../journal/journal-ports.js';
import { journalCollectionPath } from './journal-store.js';

export interface AgentJournalSource {
  uid: string;
  agentId: string;
  data: Record<string, unknown>;
}

export interface PlannedCopy {
  uid: string;
  entryId: string;
  doc: Record<string, unknown>;
}

/** The store documents the arrays would become. Pure: reads nothing, writes nothing. */
export function planJournalMigration(agents: AgentJournalSource[]): PlannedCopy[] {
  const plan: PlannedCopy[] = [];
  for (const { uid, agentId, data } of agents) {
    const memories = data.memories as { journalEntries?: unknown } | undefined;
    const items = Array.isArray(memories?.journalEntries) ? memories.journalEntries : [];
    for (const item of items as Array<Record<string, unknown>>) {
      if (typeof item?.id !== 'string') continue;
      const entry = toStoredEntry(item.id, item);
      if (isJournalPlaceholder(entry.content)) continue;
      const doc: Record<string, unknown> = {
        ...entry,
        agentId,
        source: entry.source ?? 'digital_twin',
      };
      delete doc.id;
      plan.push({ uid, entryId: item.id, doc });
    }
  }
  return plan;
}

interface MigrationDb {
  collection(path: string): {
    doc(id: string): {
      get(): Promise<{ exists: boolean }>;
      set(data: Record<string, unknown>): Promise<unknown>;
    };
  };
}

/** Dry run counts what would be written; apply writes only entries the store doesn't have yet. */
export async function runJournalMigration(
  db: MigrationDb,
  agents: AgentJournalSource[],
  apply: boolean
): Promise<{ agents: number; planned: number; alreadyThere: number; written: number }> {
  const plan = planJournalMigration(agents);
  let alreadyThere = 0;
  let written = 0;
  for (const copy of plan) {
    const ref = db.collection(journalCollectionPath(copy.uid)).doc(copy.entryId);
    if ((await ref.get()).exists) {
      alreadyThere++;
      continue;
    }
    if (!apply) continue;
    await ref.set(copy.doc);
    written++;
  }
  return { agents: agents.length, planned: plan.length, alreadyThere, written };
}
