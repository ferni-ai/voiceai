#!/usr/bin/env tsx
/**
 * One-time migration for JOURNAL_ONE_STORE: copies the journal entries still in
 * each agent's `memories.journalEntries` array into bogle_users/{uid}/journal
 * (src/services/stores/journal-migration.ts says how). Dry run by default.
 *
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/migrate-journal-one-store.ts          # dry run: counts
 *   GOOGLE_CLOUD_PROJECT=<project> pnpm tsx scripts/migrate-journal-one-store.ts --apply  # writes (asks for the project id)
 *
 * Counts only: no content, no user ids.
 */
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { getFirestoreDb } from '../src/utils/firestore-utils.js';
import {
  runJournalMigration,
  type AgentJournalSource,
} from '../src/services/stores/journal-migration.js';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '(unset)';
  console.log(`Project: ${project}  mode: ${apply ? 'apply' : 'dry run'}`);
  if (apply) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const typed = await rl.question(
      `This WRITES to bogle_users/*/journal in "${project}". Type the project id to continue: `
    );
    rl.close();
    if (typed.trim() !== project) {
      console.log('Not confirmed: nothing written.');
      return;
    }
  }
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  const snap = await db.collectionGroup('custom_agents').get();
  const agents: AgentJournalSource[] = [];
  for (const doc of snap.docs) {
    const uid = doc.ref.parent.parent?.id;
    if (uid) agents.push({ uid, agentId: doc.id, data: doc.data() });
  }
  console.log(JSON.stringify(await runJournalMigration(db, agents, apply)));
}

// Run only when invoked as a script.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
