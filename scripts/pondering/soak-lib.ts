/**
 * The safety rails for the pondering soak (soak.ts). Pure: no Firestore, no
 * gcloud, no clock.
 *
 * The soak runs the real pondering pass against real call summaries, so it
 * may only touch callers who agreed to be test subjects: the uids listed in
 * MEMORY_EVAL_ALLOWED_UIDS (set outside the repo; ../lib/allowed-uid.mjs) and
 * the voice-eval seed users. Everyone else is refused before anything is read.
 */
import { EVAL_PREFIX } from '../voice-eval/eval-users.js';
import { REFUSED, isAllowedUid } from '../lib/allowed-uid.mjs';

type Env = Record<string, string | undefined>;

export function isSoakAllowed(uid: string, env: Env = process.env): boolean {
  return isAllowedUid(uid, env) || (uid.startsWith(EVAL_PREFIX) && uid.length > EVAL_PREFIX.length);
}

/** Throws for any id outside the allowlist, without naming it. */
export function assertSoakAllowed(uids: readonly string[], env: Env = process.env): void {
  if (uids.some((u) => !isSoakAllowed(u, env))) throw new Error(REFUSED);
}

export interface SoakArgs {
  uids: string[];
  /** Also take every voice-eval seed user (up to evalLimit). */
  evalUsers: boolean;
  evalLimit: number;
  write: boolean;
  purge: boolean;
  /** Dry-run the scheduled job (ponder-job.ts) over its real cohort. Never writes. */
  job: boolean;
}

export function parseSoakArgs(argv: readonly string[], env: Env = process.env): SoakArgs {
  const args: SoakArgs = {
    uids: [],
    evalUsers: false,
    evalLimit: 10,
    write: false,
    purge: false,
    job: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--uid') args.uids.push(value());
    else if (a === '--eval-users') args.evalUsers = true;
    else if (a === '--eval-limit') args.evalLimit = Number(value());
    else if (a === '--write') args.write = true;
    else if (a === '--purge') args.purge = true;
    else if (a === '--job') args.job = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.write && args.purge) throw new Error('--write and --purge are separate runs');
  if (args.job && (args.write || args.purge)) throw new Error('--job is a dry run only');
  if (args.uids.length === 0 && !args.evalUsers && !args.job) {
    throw new Error(
      'pass --uid <uid> (listed in MEMORY_EVAL_ALLOWED_UIDS), --eval-users, or --job'
    );
  }
  assertSoakAllowed(args.uids, env);
  return args;
}

/**
 * Names of the prod services whose PONDERING setting must be unset before
 * the soak writes. If prod pondered too, the soak's documents would be
 * overwritten or doubled by the real job, and its results would mean nothing.
 */
export const PROD_SERVICES = ['john-bogle-ui', 'ferni-async'] as const;

/** True when a Cloud Run service description (gcloud --format=json) sets PONDERING to anything but off. */
export function serviceHasPondering(description: unknown): boolean {
  const containers =
    (description as { spec?: { template?: { spec?: { containers?: unknown[] } } } })?.spec?.template
      ?.spec?.containers ?? [];
  return containers.some((c) =>
    ((c as { env?: Array<{ name?: string; value?: string }> }).env ?? []).some(
      (e) => e.name === 'PONDERING' && (e.value ?? '') !== 'off'
    )
  );
}
