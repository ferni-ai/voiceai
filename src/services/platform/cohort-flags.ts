/**
 * Feature flags per caller, LaunchDarkly-style: cohorts ("friends and
 * family") and per-person overrides, kept in Firestore and applied when a
 * call starts.
 *
 * Behaviour switches here are env flags (SEMANTIC_RECALL=on, RECALL_PEOPLE=on,
 * ...), read where they are used, and set on the whole agent, so a feature
 * was either off for everyone or on for everyone. A cohort turns a set of
 * them on for its members only: the people who know Ferni best get the best
 * version first, and prod's defaults stay where they are.
 *
 * At call start, once the caller is known, their flags (every enabled cohort
 * they belong to, then their own overrides) are written into process.env, so
 * every existing check sees them unchanged. That is only safe while a worker
 * process serves one call at a time (AGENT_MAX_JOBS_PER_WORKER=1, the
 * default, or a process per call); otherwise nothing is applied. The next
 * call's start puts the previous caller's flags back to the agent's own
 * values first. After-call work that is still running when the next call
 * starts sees the next caller's flags, so it should not read these switches.
 *
 * A cohort can also take a sample of every known caller (percent, 1 to 100):
 * the same callers stay in it from call to call, and a bigger percent keeps
 * everyone already in. So a feature can go to a named cohort first, then 5%,
 * then 25%, before the agent's own flag goes on for everyone.
 *
 * Work after the call reads the caller's flags with callerEnv(), not
 * process.env.
 *
 * Only flags in COHORT_FLAGS can be set this way: behaviour switches, never
 * infrastructure or secrets. Reading cohorts never holds a call up for more
 * than READ_TIMEOUT_MS. Off unless COHORT_FLAGS=on.
 *
 * @module services/platform/cohort-flags
 */
import { createHash } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';

const log = createLogger({ module: 'cohort-flags' });

/** The switches a cohort or an override may set. */
export const COHORT_FLAGS = [
  'SEMANTIC_RECALL',
  'RECALL_PEOPLE',
  'RECALL_EPISODES',
  'RECALL_RARE_WORDS',
  'FACT_SUPERSESSION',
  'EXTRACTION_CONTEXT',
  'OPENER_FOLLOW_UP',
  'LIVE_SUMMARIES',
  'COACH_FOLLOW_THROUGH',
  'LIFE_MOVES_ON',
  'CANDOR',
  'WORLD_MODEL_TEMPORAL',
  'WORLD_FACTS_IN_CALL',
  'AFTER_CALL_EXTRACTION',
  'POST_CALL_CHECKIN',
  'FOLLOW_THROUGH_TEXTS',
  'OUTREACH_PONDERED_NOTES',
] as const;
export type CohortFlag = (typeof COHORT_FLAGS)[number];
const ALLOWED: ReadonlySet<string> = new Set(COHORT_FLAGS);
/** Values a flag may take: the env flags here are all on/off switches. */
const VALUES: ReadonlySet<string> = new Set(['on', 'off']);

/** A switch that does nothing unless these are on too (the memory stack builds on itself). */
export const COHORT_FLAG_NEEDS: Partial<Record<CohortFlag, CohortFlag[]>> = {
  RECALL_EPISODES: ['SEMANTIC_RECALL'],
  WORLD_MODEL_TEMPORAL: ['AFTER_CALL_EXTRACTION'],
  WORLD_FACTS_IN_CALL: ['WORLD_MODEL_TEMPORAL', 'AFTER_CALL_EXTRACTION'],
};

/** Flags set on whose prerequisites are not: "RECALL_EPISODES needs SEMANTIC_RECALL". */
export function missingPrerequisites(flags: Record<string, string | undefined>): string[] {
  const out: string[] = [];
  for (const [flag, needs] of Object.entries(COHORT_FLAG_NEEDS)) {
    if (flags[flag] !== 'on') continue;
    const missing = (needs ?? []).filter((n) => flags[n] !== 'on');
    if (missing.length > 0) out.push(`${flag} needs ${missing.join(', ')}`);
  }
  return out;
}

export const READ_TIMEOUT_MS = 400;

export function cohortFlagsEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.COHORT_FLAGS === 'on';
}

/** True while each worker process serves one call at a time, so process.env is the caller's alone. */
export function oneCallPerProcess(env: Record<string, string | undefined> = process.env): boolean {
  if (env.AGENT_JOB_EXECUTOR === 'process') return true;
  const raw = env.AGENT_MAX_JOBS_PER_WORKER;
  return raw === undefined || raw.trim() === '' || Number(raw) === 1;
}

export interface Cohort {
  id: string;
  enabled: boolean;
  flags: Record<string, string>;
  /** Also every caller whose sample bucket falls under this (1 to 100); members are always in. */
  percent?: number;
}

export interface CohortStore {
  /** Cohorts the caller is a member of. */
  cohortsFor: (userId: string) => Promise<Cohort[]>;
  /** The caller's own overrides. */
  overridesFor: (userId: string) => Promise<Record<string, string>>;
  /** Cohorts that take a percent of all callers. */
  sampledCohorts?: () => Promise<Cohort[]>;
}

/**
 * The caller's place in a cohort's sample, 0 to 99.99: stable per caller and
 * cohort, and independent between cohorts so two rollouts don't pick the
 * same people.
 */
export function sampleBucket(cohortId: string, userId: string): number {
  const h = createHash('sha256').update(`${cohortId}:${userId}`).digest();
  return (h.readUInt32BE(0) / 2 ** 32) * 100;
}

export function inSample(cohort: Cohort, userId: string): boolean {
  const p = cohort.percent;
  return typeof p === 'number' && p > 0 && sampleBucket(cohort.id, userId) < Math.min(p, 100);
}

/** Keeps only allowed switches with on/off values; anything else is dropped (and logged). */
function allowed(flags: Record<string, unknown>, from: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flags)) {
    if (ALLOWED.has(k) && typeof v === 'string' && VALUES.has(v)) out[k] = v;
    else log.warn({ flag: k, from }, 'Ignored a flag cohorts may not set');
  }
  return out;
}

/** The caller's flags: enabled cohorts (in id order, so it is stable), then their own overrides. */
export async function resolveCallerFlags(
  userId: string,
  store: CohortStore = firestoreCohortStore
): Promise<Record<string, string>> {
  const [members, sampled, overrides] = await Promise.all([
    store.cohortsFor(userId),
    store.sampledCohorts ? store.sampledCohorts() : Promise.resolve([]),
    store.overridesFor(userId),
  ]);
  const cohorts = new Map<string, Cohort>();
  for (const c of sampled) if (inSample(c, userId)) cohorts.set(c.id, c);
  for (const c of members) cohorts.set(c.id, c);
  const flags: Record<string, string> = {};
  for (const c of [...cohorts.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (c.enabled) Object.assign(flags, allowed(c.flags, `cohort ${c.id}`));
  }
  return Object.assign(flags, allowed(overrides, 'override'));
}

/** The agent's own value of each switch, from before any caller's flags were applied. */
const agentValues = new Map<string, string | undefined>();

/** Puts back the agent's own values, then applies these. Returns the switches set. */
export function applyFlags(
  flags: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  for (const [k, v] of agentValues) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  for (const [k, v] of Object.entries(flags)) {
    if (!ALLOWED.has(k)) continue;
    if (!agentValues.has(k)) agentValues.set(k, env[k]);
    env[k] = v;
  }
  return Object.keys(flags).filter((k) => ALLOWED.has(k));
}

/** For tests: forget the remembered agent values. */
export function forgetAgentValues(): void {
  agentValues.clear();
}

/** Work after a call may wait this long for the caller's flags. */
export const AFTER_CALL_READ_TIMEOUT_MS = 2_000;

/**
 * The flags as this caller's call had them, for work after the call: the
 * agent's own values, then the caller's cohort flags read again from the
 * store. By then the next call may have put its caller's flags in
 * process.env. Never throws; on any failure, the agent's own values.
 */
export async function callerEnv(
  userId: string | undefined,
  opts: { store?: CohortStore; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<Record<string, string | undefined>> {
  const env: Record<string, string | undefined> = { ...(opts.env ?? process.env) };
  for (const [k, v] of agentValues) env[k] = v;
  if (!cohortFlagsEnabled(env) || !oneCallPerProcess(env)) return env;
  if (!userId || userId === 'anonymous') return env;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const flags = await Promise.race([
      resolveCallerFlags(userId, opts.store),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), opts.timeoutMs ?? AFTER_CALL_READ_TIMEOUT_MS);
      }),
    ]);
    if (flags === null) {
      log.warn({ userId: userId.slice(0, 8) }, 'Cohort flags not read after the call in time');
      return env;
    }
    return Object.assign(env, flags);
  } catch (error) {
    log.warn({ error: String(error) }, 'Cohort flags not read after the call');
    return env;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * At call start: apply the caller's cohort flags, if this is on and safe.
 * Never throws and never waits longer than READ_TIMEOUT_MS; on any failure
 * the call runs with the agent's own flags.
 */
export async function applyCallerFlags(
  userId: string | undefined,
  opts: { store?: CohortStore; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {}
): Promise<string[]> {
  const env = opts.env ?? process.env;
  if (!cohortFlagsEnabled(env)) return [];
  if (!oneCallPerProcess(env)) {
    log.warn('Cohort flags skipped: a worker can run several calls at once');
    return [];
  }
  // The previous caller's flags go back to the agent's own even if this caller has none.
  if (!userId || userId === 'anonymous') return applyFlags({}, env);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const flags = await Promise.race([
      resolveCallerFlags(userId, opts.store),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), opts.timeoutMs ?? READ_TIMEOUT_MS);
      }),
    ]);
    if (flags === null) {
      log.warn(
        { userId: userId.slice(0, 8) },
        'Cohort flags not read in time; agent defaults apply'
      );
      return applyFlags({}, env);
    }
    const applied = applyFlags(flags, env);
    if (applied.length > 0) log.info({ userId: userId.slice(0, 8), flags }, 'Cohort flags applied');
    return applied;
  } catch (error) {
    log.warn({ error: String(error) }, 'Cohort flags not read; agent defaults apply');
    return applyFlags({}, env);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function toCohort(id: string, x: Record<string, unknown>): Cohort {
  return {
    id,
    enabled: x.enabled !== false,
    flags:
      typeof x.flags === 'object' && x.flags !== null ? (x.flags as Record<string, string>) : {},
    ...(typeof x.percent === 'number' && { percent: x.percent }),
  };
}

/**
 * feature_cohorts/{id}: { name, enabled, members: [uid], flags, percent? };
 * feature_flag_overrides/{uid}: { flags }.
 */
export const firestoreCohortStore: CohortStore = {
  async cohortsFor(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('feature_cohorts')
      .where('members', 'array-contains', userId)
      .get();
    return snap.docs.map((d) => toCohort(d.id, d.data()));
  },
  async sampledCohorts() {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db.collection('feature_cohorts').where('percent', '>=', 1).get();
    return snap.docs.map((d) => toCohort(d.id, d.data()));
  },
  async overridesFor(userId) {
    const db = getFirestoreDb();
    if (!db) return {};
    const doc = await db.collection('feature_flag_overrides').doc(userId).get();
    const flags = doc.exists ? doc.data()?.flags : undefined;
    return flags && typeof flags === 'object' ? (flags as Record<string, string>) : {};
  },
};
