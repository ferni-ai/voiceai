#!/usr/bin/env tsx
/**
 * One-time backfill: give every saved contact (user_contacts) its `phoneKeys`,
 * the E.164 numbers inbound-SMS matching looks up (services/identity/contacts/contact-phone-keys.ts).
 * Contacts saved from now on get them on every save; these 77-odd were saved
 * before.
 *
 *   GOOGLE_CLOUD_PROJECT=<id> pnpm tsx scripts/migrations/backfill-contact-phone-keys.ts
 *       dry run: counts only
 *   GOOGLE_CLOUD_PROJECT=<id> pnpm tsx scripts/migrations/backfill-contact-phone-keys.ts --apply --confirm-project=<id>
 *       writes phoneKeys
 *
 * Counts only: no numbers, names or user ids are printed.
 */
import { pathToFileURL } from 'node:url';
import {
  CONTACTS_COLLECTION,
  phoneKeysOf,
} from '../../src/services/identity/contacts/contact-phone-keys.js';
import { getFirestoreDb } from '../../src/utils/firestore-utils.js';

/** The keys a contact should carry, or null when it already has exactly them. */
export function phoneKeysUpdate(data: Record<string, unknown>): string[] | null {
  const want = phoneKeysOf(data.phones as Array<{ number?: unknown }> | undefined);
  const have = Array.isArray(data.phoneKeys) ? (data.phoneKeys as unknown[]) : null;
  const same = have !== null && have.length === want.length && want.every((k) => have.includes(k));
  return same ? null : want;
}

/** 'apply' only with --apply AND --confirm-project naming the project; else a dry run. */
export function runMode(argv: readonly string[], project: string): 'dry-run' | 'apply' | 'refused' {
  if (!argv.includes('--apply')) return 'dry-run';
  const confirm = argv.find((a) => a.startsWith('--confirm-project='))?.split('=')[1];
  return confirm && confirm === project ? 'apply' : 'refused';
}

export async function backfill(
  db: FirebaseFirestore.Firestore,
  apply: boolean
): Promise<{ scanned: number; needUpdate: number; withoutPhone: number; updated: number }> {
  const counts = { scanned: 0, needUpdate: 0, withoutPhone: 0, updated: 0 };
  let last: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  for (;;) {
    let q = db.collection(CONTACTS_COLLECTION).orderBy('__name__').limit(300);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    let writes = 0;
    for (const doc of snap.docs) {
      counts.scanned++;
      const keys = phoneKeysUpdate(doc.data());
      if (!keys) continue;
      counts.needUpdate++;
      if (keys.length === 0) counts.withoutPhone++;
      if (apply) {
        batch.update(doc.ref, { phoneKeys: keys });
        writes++;
      }
    }
    if (writes > 0) {
      await batch.commit();
      counts.updated += writes;
    }
    last = snap.docs[snap.docs.length - 1];
  }
  return counts;
}

async function main(): Promise<void> {
  const project = process.env.GOOGLE_CLOUD_PROJECT ?? '';
  const mode = runMode(process.argv, project);
  console.log(`Project: ${project || '(unset)'}  mode: ${mode}`);
  if (mode === 'refused') {
    console.log(
      `Not written: --apply needs --confirm-project=${project || '<GOOGLE_CLOUD_PROJECT>'}`
    );
    process.exitCode = 1;
    return;
  }
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore not available');
  console.log(JSON.stringify(await backfill(db, mode === 'apply')));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exitCode = 1;
  });
}
