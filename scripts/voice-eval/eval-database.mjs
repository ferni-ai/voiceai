// Which Firestore database each eval env reads and writes. The one place the
// harness decides it: run.sh (seed-tier), review-calls.mjs and cleanup-users.ts
// all ask here.
//
// Prod is the '(default)' database. Dev moves to its own database, 'ferni-dev',
// when the dev agent is cut over (FIRESTORE_DATABASE=ferni-dev on its secrets).
// Until then the dev agent still writes to '(default)', so the harness must read
// '(default)' for dev too. EVAL_DEV_DATABASE switches it per run; at cutover,
// change DEV_DATABASE_DEFAULT below to DEV_DATABASE.
//
// FIRESTORE_DATABASE is deliberately not read here: a dev .env sets it, and
// review-calls covers prod and dev in one run, so one global value would point
// one of them at the wrong database. Scripts that take --database pass it in as
// the override.

export const PROD_DATABASE = '(default)';
export const DEV_DATABASE = 'ferni-dev';
/** What dev reads until the dev agent is cut over to DEV_DATABASE. */
export const DEV_DATABASE_DEFAULT = '(default)';

/** run.sh envs that talk to the dev agent. */
const DEV_ENVS = new Set(['dev', 'local', 'phone']);

/**
 * The Firestore database for an eval env (prod | dev | local | phone).
 * `override` (a --database flag) wins; an unknown env throws rather than guess.
 */
export function evalDatabase(env, { override, vars = process.env } = {}) {
  if (override) return override;
  if (env === 'prod') return PROD_DATABASE;
  if (DEV_ENVS.has(env)) return vars.EVAL_DEV_DATABASE || DEV_DATABASE_DEFAULT;
  throw new Error(`evalDatabase: unknown env ${JSON.stringify(env)} (prod, dev, local, phone)`);
}

/** Firestore REST base for documents in one database. */
export function documentsUrl(project, database) {
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(database)}/documents`;
}

// `node eval-database.mjs <env>` prints the database, for run.sh.
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(evalDatabase(process.argv[2]));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
