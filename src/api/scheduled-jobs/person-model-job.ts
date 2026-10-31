/**
 * POST /api/jobs/person-model (?dryRun=true; nightly once scheduled): builds each call sheet
 * from that person's own stores and stores it (person-model-store.ts). Call-sheet plan, M2.
 *
 * Who: nobody unless this server has PERSON_MODEL=on, then only people whose own cohort
 * flag turns it on (usersWithFlag), each re-checked with flagForUser ('off' wins).
 * Bounded: MAX_PER_RUN people, PER_USER_TIMEOUT_MS each, none started after
 * RUN_BUDGET_MS; the oldest sheets go first, so 'deferred' people lead the next run.
 * Idempotent: inputs are hashed with the build's version and the UTC day, so a same-day
 * rerun writes nothing ('unchanged') and the next day rebuilds ("in 2 days" stays true).
 * No LLM yet (M4). The answer and the log carry 8-character id prefixes and counts only.
 *
 * @module api/scheduled-jobs/person-model-job
 */
import { createHash } from 'crypto';
import type { IncomingMessage, ServerResponse } from 'http';
import { flagOn, type Env } from '../../config/env-flag.js';
import {
  buildPersonModel,
  PERSON_MODEL_VERSION,
  renderPersonModel,
  type PersonModel,
  type PersonModelInputs,
} from '../../intelligence/person-model/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
import type { StoredPersonModel } from '../../services/stores/person-model-store.js';
import { TimeoutError, withTimeout } from '../../utils/async.js';
import { countReason, logJobRun } from '../../utils/job-run.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';

const log = createLogger({ module: 'person-model-job' });

const MAX_PER_RUN = 25;
const PER_USER_TIMEOUT_MS = 20_000;
const RUN_BUDGET_MS = 120_000;

type Gate = 'flag-off' | 'not-member' | 'no-record' | 'no-calls' | 'forgotten-unreadable';
type SkipReason = Gate | 'unchanged' | 'deferred' | 'timeout' | 'error';

interface UserOutcome {
  user: string;
  outcome: 'built' | 'skipped';
  reason: SkipReason | 'written' | 'dry-run';
  chars?: number;
  people?: number;
  openItems?: number;
}

interface PersonModelJobResult {
  status: 'off' | 'ran';
  dryRun: boolean;
  candidates: number;
  built: number;
  written: number;
  skipped: Record<string, number>; // by SkipReason
  users: UserOutcome[];
}

export interface PersonModelJobDeps {
  /** Who has PERSON_MODEL on through their own cohort flags (usersWithFlag). */
  holders: () => Promise<string[]>;
  /** One person's own value (flagForUser). */
  ownFlag: (uid: string) => Promise<'on' | 'off' | undefined>;
  read: (uid: string) => Promise<StoredPersonModel | null>;
  load: (uid: string) => Promise<PersonModelInputs | null>;
  save: (uid: string, model: PersonModel, inputHash: string) => Promise<'written' | 'unchanged'>;
}

interface PersonModelJobOptions {
  dryRun?: boolean;
  env?: Env;
  now?: Date;
  perUserTimeoutMs?: number;
  budgetMs?: number;
}

/** JSON with sorted keys; Timestamps by their sortable valueOf, references by path. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (!v || typeof v !== 'object') return v;
  const proto = Object.getPrototypeOf(v) as unknown;
  if (proto !== Object.prototype && proto !== null) {
    const prim = (v as { valueOf: () => unknown }).valueOf();
    if (prim !== v) return canonical(prim);
    const path = (v as { path?: unknown }).path;
    if (typeof path === 'string') return path;
  }
  const o = v as Record<string, unknown>;
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonical(o[k])])); // prettier-ignore
}

/** The idempotency key: the inputs, the build's version and the UTC day. */
function personModelInputHash(inputs: PersonModelInputs, now: Date): string {
  const key = { v: PERSON_MODEL_VERSION, day: now.toISOString().slice(0, 10), inputs };
  return createHash('sha256').update(JSON.stringify(canonical(key))).digest('hex'); // prettier-ignore
}

const short = (uid: string): string => uid.slice(0, 8);

/** One person: build, render, compare, and (unless dry) store. */
async function buildOne(
  deps: PersonModelJobDeps,
  uid: string,
  stored: StoredPersonModel | null,
  now: Date,
  dryRun: boolean,
  late: () => boolean
): Promise<Omit<UserOutcome, 'user'>> {
  const skip = (reason: SkipReason) => ({ outcome: 'skipped' as const, reason });
  if (!isMemberIdentity(uid)) return skip('not-member');
  if ((await deps.ownFlag(uid)) !== 'on') return skip('flag-off');
  const inputs = await deps.load(uid);
  if (!inputs) return skip('no-record');
  if (inputs.summaries.length === 0) return skip('no-calls');
  // Unreadable forgotten topics: the build keeps no text, so keep the stored sheet instead.
  if (inputs.forgotten === null) return skip('forgotten-unreadable');
  const inputHash = personModelInputHash(inputs, now);
  if (stored?.inputHash === inputHash) return skip('unchanged');
  const model = buildPersonModel(inputs, now);
  model.rendered = renderPersonModel(model, { now, forgottenTopics: inputs.forgotten });
  const { people, unfinished, rendered } = model;
  const counts = { chars: rendered.length, people: people.value.length, openItems: unfinished.value.openLoops.length }; // prettier-ignore
  if (dryRun) return { outcome: 'built', reason: 'dry-run', ...counts };
  if (late()) return skip('timeout');
  const saved = await deps.save(uid, model, inputHash);
  return saved === 'written' ? { outcome: 'built', reason: 'written', ...counts } : skip('unchanged'); // prettier-ignore
}

/** `getDeps` is called only when the flag is on: off, the run reads nothing. */
export async function runPersonModelJob(
  getDeps: () => Promise<PersonModelJobDeps>,
  opts: PersonModelJobOptions = {}
): Promise<PersonModelJobResult> {
  const { dryRun = false, env = process.env, now = new Date() } = opts;
  const result: PersonModelJobResult = {
    ...{ status: 'off', dryRun, candidates: 0, built: 0, written: 0 },
    ...{ skipped: {}, users: [] },
  };
  if (!flagOn('PERSON_MODEL', env)) return result;
  result.status = 'ran';
  const deps = await getDeps();
  const deadline = Date.now() + (opts.budgetMs ?? RUN_BUDGET_MS);
  const uids = [...new Set(await deps.holders())];
  result.candidates = uids.length;
  const stored = await Promise.all(uids.map((u) => deps.read(u).catch(() => null)));
  const order = uids
    .map((uid, i) => ({ uid, stored: stored[i] ?? null }))
    .sort((a, b) => (a.stored?.builtAt ?? '').localeCompare(b.stored?.builtAt ?? ''));
  let started = 0;
  for (const { uid, stored: prior } of order) {
    let out: Omit<UserOutcome, 'user'>;
    if (started >= MAX_PER_RUN || Date.now() > deadline)
      out = { outcome: 'skipped', reason: 'deferred' };
    else {
      started++;
      let late = false; // the run gave up on this person: their build must not write after
      const work = buildOne(deps, uid, prior, now, dryRun, () => late);
      try {
        // eslint-disable-next-line no-await-in-loop -- one person at a time keeps Firestore load flat
        out = await withTimeout(work, opts.perUserTimeoutMs ?? PER_USER_TIMEOUT_MS);
      } catch (error) {
        late = error instanceof TimeoutError;
        if (!late) log.warn({ userId: short(uid), error: String(error) }, 'Person model not built');
        out = { outcome: 'skipped', reason: late ? 'timeout' : 'error' };
      }
    }
    if (out.outcome === 'built') result.built++;
    if (out.reason === 'written') result.written++;
    if (out.outcome === 'skipped') countReason(result.skipped, out.reason);
    result.users.push({ user: short(uid), ...out });
  }
  return result;
}

async function defaultDeps(): Promise<PersonModelJobDeps> {
  const [{ getFirestoreDb }, store, { flagForUser, usersWithFlag }] = await Promise.all([
    import('../../utils/firestore-utils.js'),
    import('../../services/stores/person-model-store.js'),
    import('../../services/platform/cohort-flags.js'),
  ]);
  const db = getFirestoreDb();
  if (!db) throw new Error('Firestore is not available');
  return {
    holders: () => usersWithFlag('PERSON_MODEL'),
    ownFlag: (uid) => flagForUser(uid, 'PERSON_MODEL'),
    read: (uid) => store.readPersonModel(db, uid),
    load: (uid) => store.loadPersonModelInputs(db, uid),
    save: (uid, model, hash) => store.savePersonModel(db, uid, model, hash),
  };
}

export async function handlePersonModel(
  req: IncomingMessage,
  res: ServerResponse,
  deps?: () => Promise<PersonModelJobDeps>
): Promise<void> {
  const dryRun = ['true', '1'].includes(new URL(req.url ?? '/', 'http://x').searchParams.get('dryRun') ?? ''); // prettier-ignore
  try {
    const result = await runPersonModelJob(deps ?? defaultDeps, { dryRun });
    const { candidates, built, written, skipped } = result;
    logJobRun(log, 'PERSON_MODEL', { considered: candidates, eligible: built, sent: written, skippedBy: skipped }, { dryRun }); // prettier-ignore
    sendJson(res, 200, { success: true, job: 'person-model', ...result });
  } catch (error) {
    log.error({ error: String(error) }, 'Person model run failed');
    sendJson(res, 500, { success: false, job: 'person-model', error: String(error) });
  }
}
