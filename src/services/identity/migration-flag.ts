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
 * @module services/identity/migration-flag
 */

export const MIGRATED_TO = '_migratedTo';

type Db = FirebaseFirestore.Firestore;
type Data = Record<string, unknown> | undefined;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** The account a source record's data was moved to, or null when it never was. */
export function migratedToOf(data: Data): string | null {
  const custom = data?.customData as Data;
  return str(data?.[MIGRATED_TO]) ?? str(data?.migratedTo) ?? str(custom?.migratedTo);
}

/** The account bogle_users/{sourceId}'s data was moved to, read from Firestore. */
export async function readMigratedTo(db: Db, sourceId: string): Promise<string | null> {
  const snap = await db.collection('bogle_users').doc(sourceId).get();
  return snap.exists ? migratedToOf(snap.data()) : null;
}

/** Record that every store of sourceId now lives under targetId. */
export async function markMigrated(db: Db, sourceId: string, targetId: string): Promise<void> {
  await db
    .collection('bogle_users')
    .doc(sourceId)
    .set({ [MIGRATED_TO]: targetId, _migratedAt: new Date().toISOString() }, { merge: true });
}
