// Which Firestore database each eval env reads and writes. The one place the
// harness decides it: run.sh (seed-tier), review-calls.mjs, cleanup-users.ts,
// seed-tier.ts and the nightly sweep all ask here.
//
// Prod is the '(default)' database. Dev is on its own database, 'ferni-dev':
// the dev agent was cut over on 2026-10-23 (FIRESTORE_DATABASE=ferni-dev on its
// secrets, Seth approved), so dev, local and phone runs now seed, read and clean
// up in 'ferni-dev' by default. Before the cutover they used '(default)', which
// after it would have put eval users in prod while the dev agent read ferni-dev.
// EVAL_DEV_DATABASE still switches dev per run (EVAL_DEV_DATABASE='(default)' is
// the rollback if the dev agent is ever pointed back at the prod database).
//
// FIRESTORE_DATABASE is deliberately not read here: a dev .env sets it, and
// review-calls covers prod and dev in one run, so one global value would point
// one of them at the wrong database. Scripts that take --database pass it in as
// the override.

import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PROD_DATABASE = '(default)';
export const DEV_DATABASE = 'ferni-dev';
/** What dev reads when EVAL_DEV_DATABASE is unset: ferni-dev since the 2026-10-23 cutover. */
export const DEV_DATABASE_DEFAULT = DEV_DATABASE;

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

/**
 * The database a Firestore script (cleanup-users, seed-tier) targets, from its argv:
 * --env resolves through evalDatabase (--database overrides it), --database alone
 * names one, and neither gives `fallback`, or throws when there is none, so a
 * script that writes never lands in prod by omission.
 */
export function databaseFromArgs(argv, { fallback, vars = process.env } = {}) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const env = arg('--env');
  const override = arg('--database');
  if (env) return evalDatabase(env, { override, vars });
  if (override) return override;
  if (fallback) return fallback;
  throw new Error('pass --env prod|dev|local|phone or --database ID');
}

/** Firestore REST base for documents in one database. */
export function documentsUrl(project, database) {
  return `https://firestore.googleapis.com/v1/projects/${project}/databases/${encodeURIComponent(database)}/documents`;
}

// `node eval-database.mjs <env>` prints the database, for run.sh and the nightly. Node
// runs the realpath of the script, so compare realpaths: through a symlinked path (a
// linked worktree, macOS /var -> /private/var) a raw compare printed nothing, exit 0.
const invokedAs =
  process.argv[1] && existsSync(process.argv[1]) ? realpathSync(process.argv[1]) : '';
if (invokedAs === fileURLToPath(import.meta.url)) {
  try {
    console.log(evalDatabase(process.argv[2]));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
