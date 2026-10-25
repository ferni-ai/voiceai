/**
 * Unlink developer publishers whose Firebase link came from an unverified,
 * empty or different email.
 *
 * Developer-console sign-in used to link a Firebase account to a publisher by
 * email without checking that the email was verified, and anonymous accounts
 * (no email) all linked to one shared publisher. The API now refuses those
 * links on every request; this script clears their `firebaseUid` so the owner
 * can re-link by signing in with a verified email. It also disables their
 * developer API keys, which were minted through the same unsound link.
 *
 * Usage (dry run by default; see scripts/destructive-gate.ts):
 *   npx tsx scripts/unlink-unverified-publishers.ts
 *   npx tsx scripts/unlink-unverified-publishers.ts --apply --confirm-project=johnb-2025
 *
 * Prints publisher ids, key ids, reasons and counts only, never emails or keys.
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { pathToFileURL } from 'node:url';
import { destructiveMode } from './destructive-gate.js';
import {
  accountFromUser,
  linkProblem,
  type LinkedAccount,
} from '../src/api/v1/developers/shared/publisher-link-rules.js';
import { getAdminFirestore } from '../src/utils/firebase-admin-app.js';

export type { LinkedAccount };

/** Why a publisher's link must be cleared, or null when it is sound. */
export function unlinkReason(
  publisherEmail: unknown,
  account: LinkedAccount | null
): string | null {
  if (!account) return 'linked account no longer exists';
  return linkProblem(publisherEmail, account);
}

async function linkedAccount(uid: string): Promise<LinkedAccount | null> {
  try {
    return accountFromUser(await admin.auth().getUser(uid));
  } catch {
    return null;
  }
}

export async function main(argv: readonly string[] = process.argv): Promise<void> {
  const projectId = process.env.GCLOUD_PROJECT || 'johnb-2025';
  // This script's write flag is --apply; the shared gate calls it --execute
  const mode = destructiveMode(
    argv.map((a) => (a === '--apply' ? '--execute' : a)),
    projectId
  );
  if (mode === 'refused') {
    console.error(
      `Refusing to change data: --apply needs --confirm-project=${projectId} ` +
        `(the project this run would change). Run without --apply for a dry run.`
    );
    process.exitCode = 1;
    return;
  }

  if (!admin.apps.length) admin.initializeApp({ projectId });
  const db = getAdminFirestore();
  const snapshot = await db.collection('publishers').get();

  const toUnlink: Array<{ id: string; reason: string; ref: admin.firestore.DocumentReference }> =
    [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    const uid = data.firebaseUid;
    if (typeof uid !== 'string' || !uid) continue;
    const reason = unlinkReason(data.email, await linkedAccount(uid));
    if (reason) toUnlink.push({ id: doc.id, reason, ref: doc.ref });
  }

  const keys: Array<{ id: string; ref: admin.firestore.DocumentReference }> = [];
  const prefix = mode === 'dry-run' ? '[dry run] ' : '';
  console.log(`${prefix}${toUnlink.length} publisher(s) to unlink`);
  for (const p of toUnlink) {
    console.log(`  - ${p.id}: ${p.reason}`);
    const snap = await db.collection('developer_api_keys').where('publisherId', '==', p.id).get();
    for (const k of snap.docs) {
      if (k.data().enabled === false) continue;
      keys.push({ id: k.id, ref: k.ref });
      console.log(`      key ${k.id}`);
    }
  }
  console.log(`${prefix}${keys.length} API key(s) to disable`);
  if (mode === 'dry-run' || toUnlink.length === 0) return;

  for (const p of toUnlink) {
    await p.ref.update({ firebaseUid: admin.firestore.FieldValue.delete() });
  }
  for (const k of keys) {
    await k.ref.update({ enabled: false, revokedReason: 'publisher-unlinked' });
  }
  console.log(
    `Unlinked ${toUnlink.length} publisher(s), disabled ${keys.length} key(s) in ${projectId}`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Unlink failed:', String(err));
    process.exit(1);
  });
}
