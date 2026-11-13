/**
 * Which Firestore database this process uses, and so whether it is prod or dev.
 * A leaf module (no imports) so the logger can ask without an import cycle.
 */

/**
 * The Firestore database every client in this process binds to: FIRESTORE_DATABASE,
 * or '(default)' when unset or empty. Production runs on '(default)'; dev sets
 * 'ferni-dev'. getFirestoreDb() and getAdminFirestore() bind to it, and the database
 * pin (utils/firestore-db-pin.ts) reports any client bound elsewhere.
 */
export function getFirestoreDatabase(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  return env.FIRESTORE_DATABASE || '(default)';
}

/**
 * True when this process uses a Firestore database other than prod's '(default)'
 * (the dev agent and PR previews). Prod workers read '(default)', so a process on
 * another database must not hand them work: the Pub/Sub publishers and the graph
 * writer check this and skip.
 */
export function isNonProdDatabase(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return getFirestoreDatabase(env) !== '(default)';
}
