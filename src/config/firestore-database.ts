/**
 * Which Firestore database this process uses, and so whether it is prod or dev.
 * A leaf module (no imports) so the logger can ask without an import cycle.
 */

/** Dev's database: the dev agent, PR previews and a local run against dev all set it. */
const DEV_FIRESTORE_DATABASE = 'ferni-dev';

/**
 * The Firestore database every client in this process binds to: FIRESTORE_DATABASE as
 * written, or '(default)' when unset or empty. Production runs on '(default)'; dev sets
 * DEV_FIRESTORE_DATABASE. getFirestoreDb() and getAdminFirestore() bind to it, and the
 * database pin (utils/firestore-db-pin.ts) reports any client bound elsewhere.
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
 * writer check this and skip. Only for skipping prod work: a misspelt name counts as
 * non-prod here. For what only dev may do, ask isKnownDevDatabase().
 */
export function isNonProdDatabase(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return getFirestoreDatabase(env) !== '(default)';
}

/**
 * True only on dev's database, by its exact name as written: another case, a misspelling or
 * space around it is not dev's. For what dev may do and prod never may, such as words in a
 * log line.
 *
 * isNonProdDatabase() is the wrong question for that: it answers true for any name that is
 * not '(default)', so a prod process whose FIRESTORE_DATABASE is misspelt would log what
 * callers say. An unknown name is not prod's (prod work is skipped) and not dev's (prod
 * privacy is kept): each question fails to its own safe side.
 */
export function isKnownDevDatabase(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return getFirestoreDatabase(env) === DEV_FIRESTORE_DATABASE;
}
