/**
 * Where a device, anon: or phone profile's data went, kept on the source record
 * itself (bogle_users/{source}._migratedTo), so it survives a restart and both
 * movers read the same answer: user-migration.ts (POST /api/auth/migrate and
 * sign-in auto-migration) and identity-linking.ts (autoLinkOnAuth).
 *
 * The movers used to mark it three ways: an in-memory Map (gone on restart),
 * customData.migratedTo, and _migrated / migratedTo. Only _migratedTo is written
 * now; the old marks are still read, so a pair linked before this change is
 * never moved again on its own.
 *
 * _migrationIncomplete: true sits beside it while some stores failed to copy.
 * The device stays claimed (no second account can take it), and both movers
 * retry the copy while the flag is set; a full copy clears it.
 *
 * @module services/identity/migration-flag
 */

export const MIGRATED_TO = '_migratedTo';
export const INCOMPLETE = '_migrationIncomplete';

type Db = FirebaseFirestore.Firestore;
type Data = Record<string, unknown> | undefined;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The account a source record's data was moved to, or null when it never was. */
export function migratedToOf(data: Data): string | null {
  const custom = data?.customData as Data;
  return str(data?.[MIGRATED_TO]) ?? str(data?.migratedTo) ?? str(custom?.migratedTo);
}

/** True while a migration claimed the record but some stores still failed to copy. */
export function migrationIncomplete(data: Data): boolean {
  return data?.[INCOMPLETE] === true;
}

/** Where bogle_users/{sourceId}'s data went, and whether the copy still needs a retry. */
export async function readMigration(
  db: Db,
  sourceId: string
): Promise<{ to: string | null; incomplete: boolean }> {
  const snap = await db.collection('bogle_users').doc(sourceId).get();
  const data = snap.exists ? snap.data() : undefined;
  return { to: migratedToOf(data), incomplete: migrationIncomplete(data) };
}

/** The account bogle_users/{sourceId}'s data was moved to, read from Firestore. */
export async function readMigratedTo(db: Db, sourceId: string): Promise<string | null> {
  return (await readMigration(db, sourceId)).to;
}

/**
 * Claim sourceId for targetId. `complete` false marks the copy for a retry;
 * true clears that mark.
 */
export async function markMigrated(
  db: Db,
  sourceId: string,
  targetId: string,
  complete = true
): Promise<void> {
  await db
    .collection('bogle_users')
    .doc(sourceId)
    .set(
      { [MIGRATED_TO]: targetId, [INCOMPLETE]: !complete, _migratedAt: new Date().toISOString() },
      { merge: true }
    );
}
