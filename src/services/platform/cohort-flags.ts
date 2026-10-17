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
 * starts sees the next caller's flags, so it reads them with envForCaller.
 *
 * Only flags in COHORT_FLAGS can be set this way: behaviour switches, never
 * infrastructure or secrets. Reading cohorts never holds a call up for more
 * than READ_TIMEOUT_MS. Off unless COHORT_FLAGS=on.
 *
 * @module services/platform/cohort-flags
 */
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
  'POST_CALL_CHECKIN',
  'FOLLOW_THROUGH_TEXTS',
  'OUTREACH_PONDERED_NOTES',
  // Read once the agent is set up, on a turn or at a handoff: after applyCallerFlags
  // (docs/runbooks/cohort-rollout.md has the read sites).
  'CALL_WRAP_UP',
  'WRAP_UP',
  'SHORT_GOODBYE',
  'PHONE_GOODBYE',
  'HAPPY_EXITS',
  'HANDOFF_TALK_THROUGH',
  'NAME_CORRECTION',
  'ROOM_GUESTS',
  'BARGE_IN_ACK_WORDS',
  'FRIEND_FOLLOWUPS',
  'INSIDE_JOKES',
  // Persona flags, read at agent build, a handoff, a turn or a TTS reply, never cached
  // across calls. The system prompt (FERNI_PERSONA_SLIP_GUARD) loads after
  // applyCallerFlags: loadCallerPrompt (voice-agent-entry/persona-builder.ts).
  'HANDOFF_FULL_TOOLS',
  'TEAM_VOICES',
  'FERNI_PERSONA_SLIP_GUARD',
  'DIRECTOR_PERSONA_AWARE',
  // Read after the call, through envForCaller, never process.env as applied.
  'DATES_THAT_MATTER',
] as const;
export type CohortFlag = (typeof COHORT_FLAGS)[number];
const ALLOWED: ReadonlySet<string> = new Set(COHORT_FLAGS);
/** Values a flag may take: the env flags here are all on/off switches. */
const VALUES: ReadonlySet<string> = new Set(['on', 'off']);

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
}

export interface CohortStore {
  /** Cohorts the caller is a member of. */
  cohortsFor: (userId: string) => Promise<Cohort[]>;
  /** The caller's own overrides. */
  overridesFor: (userId: string) => Promise<Record<string, string>>;
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

export interface CallerFlags {
  flags: Record<string, string>;
  /** The enabled cohorts the caller is in, by id: audiences, never who is in them. */
  cohorts: string[];
  /** Whether the caller's own overrides set anything. */
  overridden: boolean;
}

/** The caller's flags: enabled cohorts (in id order, so it is stable), then their own overrides. */
export async function resolveCaller(
  userId: string,
  store: CohortStore = firestoreCohortStore
): Promise<CallerFlags> {
  const [cohorts, overrides] = await Promise.all([
    store.cohortsFor(userId),
    store.overridesFor(userId),
  ]);
  const flags: Record<string, string> = {};
  const ids: string[] = [];
  for (const c of [...cohorts].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!c.enabled) continue;
    ids.push(c.id);
    Object.assign(flags, allowed(c.flags, `cohort ${c.id}`));
  }
  const own = allowed(overrides, 'override');
  return {
    flags: Object.assign(flags, own),
    cohorts: ids,
    overridden: Object.keys(own).length > 0,
  };
}

export async function resolveCallerFlags(
  userId: string,
  store: CohortStore = firestoreCohortStore
): Promise<Record<string, string>> {
  return (await resolveCaller(userId, store)).flags;
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

/**
 * The env as this caller's call saw it, for work that runs after the call
 * (after-call tasks). By then the next call may have started and put its
 * caller's flags in process.env, so this starts from the agent's own values
 * and adds the caller's cohorts and overrides (with COHORT_FLAGS=on), read
 * again. Never throws; on a failed read the agent's own values apply.
 */
export async function envForCaller(
  userId: string,
  opts: { store?: CohortStore; env?: NodeJS.ProcessEnv } = {}
): Promise<Record<string, string | undefined>> {
  const env = opts.env ?? process.env;
  const own: Record<string, string | undefined> = { ...env };
  for (const [k, v] of agentValues) own[k] = v;
  if (!cohortFlagsEnabled(env) || !userId || userId === 'anonymous') return own;
  try {
    return { ...own, ...(await resolveCallerFlags(userId, opts.store)) };
  } catch (error) {
    log.warn({ error: String(error) }, 'Cohort flags not read after the call; agent values apply');
    return own;
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
    const caller = await Promise.race([
      resolveCaller(userId, opts.store),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), opts.timeoutMs ?? READ_TIMEOUT_MS);
      }),
    ]);
    if (caller === null) {
      log.warn(
        { userId: userId.slice(0, 8) },
        'Cohort flags not read in time; agent defaults apply'
      );
      return applyFlags({}, env);
    }
    const { flags, cohorts, overridden } = caller;
    const applied = applyFlags(flags, env);
    // Cohort ids name the audience (seth, friends-and-family), never a member.
    if (applied.length > 0)
      log.info({ userId: userId.slice(0, 8), cohorts, overridden, flags }, 'Cohort flags applied');
    return applied;
  } catch (error) {
    log.warn({ error: String(error) }, 'Cohort flags not read; agent defaults apply');
    return applyFlags({}, env);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** feature_cohorts/{id}: { name, enabled, members: [uid], flags }; feature_flag_overrides/{uid}: { flags }. */
export const firestoreCohortStore: CohortStore = {
  async cohortsFor(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('feature_cohorts')
      .where('members', 'array-contains', userId)
      .get();
    return snap.docs.map((d) => {
      const x = d.data();
      return {
        id: d.id,
        enabled: x.enabled !== false,
        flags: x.flags && typeof x.flags === 'object' ? (x.flags as Record<string, string>) : {},
      };
    });
  },
  async overridesFor(userId) {
    const db = getFirestoreDb();
    if (!db) return {};
    const doc = await db.collection('feature_flag_overrides').doc(userId).get();
    const flags = doc.exists ? doc.data()?.flags : undefined;
    return flags && typeof flags === 'object' ? (flags as Record<string, string>) : {};
  },
};
