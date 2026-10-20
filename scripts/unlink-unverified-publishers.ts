/**
 * Unlink developer publishers whose Firebase link came from an unverified,
 * empty or different email.
 *
 * Developer-console sign-in used to link a Firebase account to a publisher by
 * email without checking that the email was verified, and anonymous accounts
 * (no email) all linked to one shared publisher. The API now refuses those
 * links on every request; this script clears their `firebaseUid` so the owner
 * can re-link by signing in with a verified email.
 *
 * Usage (dry run by default; see scripts/destructive-gate.ts):
 *   npx tsx scripts/unlink-unverified-publishers.ts
 *   npx tsx scripts/unlink-unverified-publishers.ts --apply --confirm-project=johnb-2025
 *
 * Prints publisher ids and the reason only, never emails.
 */

import 'dotenv/config';
import admin from 'firebase-admin';
import { pathToFileURL } from 'node:url';
import { destructiveMode } from './destructive-gate.js';

export interface LinkedAccount {
  email?: string;
  emailVerified: boolean;
  anonymous: boolean;
}

/** Why a publisher's link must be cleared, or null when it is sound. */
export function unlinkReason(
  publisherEmail: unknown,
  account: LinkedAccount | null
): string | null {
  if (!account) return 'linked account no longer exists';
  if (account.anonymous) return 'linked account is anonymous';
  if (!account.email) return 'linked account has no email';
  if (!account.emailVerified) return 'linked account email is not verified';
  if (
    typeof publisherEmail !== 'string' ||
    publisherEmail.toLowerCase() !== account.email.toLowerCase()
  ) {
    return 'linked account email differs from the publisher record';
  }
  return null;
}

async function linkedAccount(uid: string): Promise<LinkedAccount | null> {
  try {
    const user = await admin.auth().getUser(uid);
    return {
      email: user.email,
      emailVerified: user.emailVerified === true,
      anonymous: user.providerData.length === 0,
    };
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
  const db = admin.firestore();
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

  console.log(`${mode === 'dry-run' ? '[dry run] ' : ''}${toUnlink.length} publisher(s) to unlink`);
  for (const p of toUnlink) console.log(`  - ${p.id}: ${p.reason}`);
  if (mode === 'dry-run' || toUnlink.length === 0) return;

  for (const p of toUnlink) {
    await p.ref.update({ firebaseUid: admin.firestore.FieldValue.delete() });
  }
  console.log(`Unlinked ${toUnlink.length} publisher(s) in ${projectId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Unlink failed:', String(err));
    process.exit(1);
  });
}
