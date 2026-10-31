/**
 * Feature flags per caller, LaunchDarkly-style: cohorts ("friends and family") and per-person
 * overrides, kept in Firestore and applied when a call starts.
 *
 * Behaviour switches here are env flags (SEMANTIC_RECALL=on, RECALL_PEOPLE=on, ...), read where
 * they are used, and set on the whole agent, so a feature was either off for everyone or on for
 * everyone. A cohort turns a set of them on for its members only: the people who know Ferni best
 * get the best version first, and prod's defaults stay where they are.
 *
 * At call start, once the caller is known, their flags (every enabled cohort they belong to, then
 * their own overrides) are written into process.env, so every existing check sees them unchanged.
 * That is only safe while a worker process serves one call at a time (AGENT_MAX_JOBS_PER_WORKER=1,
 * the default, or a process per call); otherwise nothing is applied. The next call's start puts the
 * previous caller's flags back to the agent's own values first. After-call work that is still
 * running when the next call starts sees the next caller's flags, so it reads them with
 * envForCaller.
 *
 * A cohort can also take a sample of every known caller (percent, 1 to 100): the same callers stay
 * in it from call to call, and a bigger percent keeps everyone already in. So a feature can go to a
 * named cohort first, then 5%, then 25%, before the agent's own flag goes on for everyone.
 *
 * Only flags in COHORT_FLAGS can be set this way: behaviour switches, never infrastructure or
 * secrets. Reading cohorts never holds a call up for more than READ_TIMEOUT_MS. Off unless
 * COHORT_FLAGS=on.
 *
 * Servers that act for many users in one process (the UI server's scheduled jobs) must never
 * write process.env; they ask per person instead, with flagForUser and usersWithFlag below.
 *
 * @module services/platform/cohort-flags
 */
import { createHash } from 'node:crypto';
import { createLogger } from '../../utils/safe-logger.js';
import { isMemberIdentity } from '../identity/member-identity.js';
import {
  firestoreCohortStore,
  firestoreFlagHolders,
  type Cohort,
  type CohortStore,
  type FlagHolderStore,
} from './cohort-firestore.js';

export { firestoreCohortStore, firestoreFlagHolders };
export type { Cohort, CohortStore, FlagHolderStore };

const log = createLogger({ module: 'cohort-flags' });

/** The switches a cohort or an override may set. */
export const COHORT_FLAGS = [
  'SEMANTIC_RECALL',
  'RECALL_PEOPLE',
  'RECALL_EPISODES',
  'RECALL_RARE_WORDS',
  // Recall hook build, after applyCallerFlags. The fact writer may read the next caller's
  // value, which only decides whether a fact is stored with its vector (fact-embeddings.ts).
  'RECALL_VECTOR_INDEX',
  'FACT_SUPERSESSION',
  'EXTRACTION_CONTEXT',
  'OPENER_FOLLOW_UP',
  'LIVE_SUMMARIES', // asked per person: readCallSummaries (call-summaries.ts) via personFlagOn
  'COACH_FOLLOW_THROUGH',
  'LIFE_MOVES_ON',
  'CANDOR',
  // Read only when searchWeb runs mid-call (information/web-search.ts), never at boot.
  'WEB_SEARCH',
  'WORLD_MODEL_TEMPORAL',
  // Read when the call session is built, after applyCallerFlags (in-call-load.ts).
  'WORLD_FACTS_IN_CALL',
  'POST_CALL_CHECKIN',
  'IOS_PUSH', // per person by the web server's push service: flagForUser (services/ios-push.ts)
  'FOLLOW_THROUGH_TEXTS',
  // Read when the recall hook and live-call behaviors are built, after applyCallerFlags.
  'FOLLOW_THROUGH_OPENER',
  'OUTREACH_PONDERED_NOTES',
  // Read at setup, a turn or a handoff, after applyCallerFlags (docs/runbooks/cohort-rollout.md).
  'CALL_WRAP_UP',
  'WRAP_UP',
  'SHORT_GOODBYE',
  'PHONE_GOODBYE',
  'HAPPY_EXITS',
  'HANDOFF_TALK_THROUGH',
  'FAMILY_TABLE',
  // Read once the greeting's handlers are wired (greeting-wiring.ts), after applyCallerFlags.
  'HANDOFF_FIRST_FIX',
  'NAME_CORRECTION',
  'ROOM_GUESTS',
  'BARGE_IN_ACK_WORDS',
  'FRIEND_FOLLOWUPS',
  'INSIDE_JOKES',
  'OPEN_LOOPS_IN_CONTEXT',
  'FIRST_CALL_INTRO', // read at the hello and each turn (greeting-direction, first-call-rapport)
  // Read on each turn and each quiet-window sound, never at boot (named-tune-note.ts, tune-state.ts).
  'NAMED_TUNE',
  // Persona flags, read at agent build, a handoff, a turn or a TTS reply, never cached
  // across calls. The system prompt (FERNI_PERSONA_SLIP_GUARD) loads after
  // applyCallerFlags: loadCallerPrompt (voice-agent-entry/persona-builder.ts).
  'HANDOFF_FULL_TOOLS',
  // Read at agent build, a tool update and each turn's request, never at boot (same-turn-tools-config.ts).
  'TOOLS_SAME_TURN',
  'TEAM_VOICES',
  'GOOD_NEWS_BIGGER',
  'FERNI_PERSONA_SLIP_GUARD',
  'DIRECTOR_PERSONA_AWARE',
  // Read on each turn's request (withTurnReminder, turn-request.ts), never at boot: how
  // each persona sounds, and reply length and roughness drawn from friends' turns.
  'PERSONA_VOICE',
  'TURN_LENGTH',
  'TURN_TEXTURE',
  // Read per call at agent build, a handoff, a turn and an unlock check (alex-chief-of-staff-flag.ts).
  'ALEX_CHIEF_OF_STAFF',
  'SPECIALIST_TOOLS', // read at each agent build (multi-agent/specialist-tool-sets.ts)
  'CUSTOM_AGENT_LIVE', // read once the caller is known, at STEP 4 (agents/shared/custom-agent-live.ts)
  // Latency A/Bs, one arm per eval caller. Each reply's guard (action-claim-guard.ts:242)
  // and each preemptive turn's hold (preempt-stable-context.ts) read process.env.
  'ACTION_CLAIM_STREAM',
  'PREEMPT_STABLE_CONTEXT',
  // The warm after the greeting (after-greeting.ts) and at each handoff (handoff-cache-warm.ts).
  'CACHE_WARM_PRIMARY',
  'HANDOFF_CACHE_WARM',
  // Read after the call, through envForCaller, never process.env as applied.
  'DATES_THAT_MATTER',
  'PROACTIVE_CHANNELS',
  'WEEKLY_PREDICTION',
  'WELLBEING_AFTER_CALL',
  // Read each time callUser or forgetMemory runs mid-call, per person (telephony/index.ts, recall/forget.ts).
  'TOOLS_REAL_CALL_USER',
  'FORGET_DELETES',
  'COACH_WINS', // greeting (winFor); wins.ts records a win via personFlagOn on any server
  'FRIEND_CELEBRATIONS', // greeting: anniversaryFor (friendship-anniversary.ts)
  'REVIVED_INTELLIGENCE', // turn hook built at setup, then each turn (revived-intelligence.ts)
  'CALL_JOURNAL', // tool build + per turn (call-journal.ts); needs the agent's JOURNAL_ONE_STORE=on
  'FOLLOW_THROUGH_IMPORT', // after the call, through envForCaller (follow-through-import.ts)
  'PONDERING', // greeting (ponderFor); the hourly ponder-job.ts ponders usersWithFlag too
  'MORNING_BRIEF', // UI server's briefing job only, never a call: usersWithFlag (brief-job.ts)
  // Read per call, never at boot: as applied mid-call, envForCaller after it, flagForUser on the UI server.
  'COMMITMENT_SINGLE_WRITER',
  // Read on each caller final and each gated outbound tool call (outreach-confirm.ts), never cached.
  'OUTREACH_SERVER_CONFIRM',
  // The UI server's deliver-reminders job reads both per person, through flagForUser
  // (outreach/reminder-reach.ts); setReminder reads REMINDER_SMS_DEFAULT after applyCallerFlags.
  'REMINDER_SMS_DEFAULT',
  'REMINDER_IN_APP_PUSH',
  'WEB_PUSH_DELIVERY', // web server, per person (flagForUser): pushes, after-call ask
  'FOCUS_HOLD', // web server, per person (personFlagOn): POST /api/me/focus (api/routes/focus.ts)
  // Crisis lane, owner first (Seth signed off 2026-10-30): read per turn by the crisis classifier
  // after applyCallerFlags, so one person can try it before the agent's own flag goes on.
  'CRISIS_IMMINENT_NEEDS_AGREEMENT',
] as const;
export type CohortFlag = (typeof COHORT_FLAGS)[number];
const ALLOWED: ReadonlySet<string> = new Set(COHORT_FLAGS);
const ON_OFF: readonly string[] = ['on', 'off'];
/** The flags that are not on/off switches, and the values they may take. */
const MODES: Partial<Record<CohortFlag, readonly string[]>> = {
  TURN_LENGTH: ['learned', 'off'],
  TURN_TEXTURE: ['learned', 'off'],
  PREEMPT_STABLE_CONTEXT: ['on', 'defer', 'off'],
};

/** Values a cohort or override may give this flag: on/off, or the flag's own modes. */
export function cohortFlagValues(flag: string): readonly string[] {
  return MODES[flag as CohortFlag] ?? ON_OFF;
}

/**
 * A switch that does nothing unless these are on too (the memory stack
 * builds on itself). WORLD_MODEL_TEMPORAL also needs AFTER_CALL_EXTRACTION,
 * which is the agent's own (it is read after the call and feeds commitments).
 */
export const COHORT_FLAG_NEEDS: Partial<Record<CohortFlag, CohortFlag[]>> = {
  RECALL_EPISODES: ['SEMANTIC_RECALL'],
  RECALL_VECTOR_INDEX: ['SEMANTIC_RECALL'],
  WORLD_FACTS_IN_CALL: ['WORLD_MODEL_TEMPORAL'],
  FOLLOW_THROUGH_TEXTS: ['FOLLOW_THROUGH_IMPORT'], // texts send follow-ups the import wrote
  OUTREACH_PONDERED_NOTES: ['PONDERING'], // notes send what pondering wrote
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

/** Keeps only allowed switches with values they take; anything else is dropped (and logged). */
function allowed(flags: Record<string, unknown>, from: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(flags)) {
    if (ALLOWED.has(k) && typeof v === 'string' && cohortFlagValues(k).includes(v)) out[k] = v;
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
  const [members, sampled, overrides] = await Promise.all([
    store.cohortsFor(userId),
    store.sampledCohorts ? store.sampledCohorts() : Promise.resolve([]),
    store.overridesFor(userId),
  ]);
  const cohorts = new Map<string, Cohort>();
  for (const c of sampled) if (inSample(c, userId)) cohorts.set(c.id, c);
  for (const c of members) cohorts.set(c.id, c);
  const flags: Record<string, string> = {};
  const ids: string[] = [];
  for (const c of [...cohorts.values()].sort((a, b) => a.id.localeCompare(b.id))) {
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
  if (!cohortFlagsEnabled(env) || !isMemberIdentity(userId)) return own;
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
  if (!isMemberIdentity(userId)) return applyFlags({}, env);
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

/** How long a per-user or per-flag read is reused. The scheduled jobs run every minute. */
export const FLAG_CACHE_TTL_MS = 60_000;
/**
 * The longest a cached value stands in for a failed read. After that the
 * lookup fails closed (no value, no users), so a Firestore outage can't keep
 * a flag on indefinitely.
 */
export const FLAG_STALE_MAX_MS = 5 * 60_000;
const MAX_CACHED_USERS = 1000;
const userCache = new Map<string, { at: number; flags: Record<string, string> }>();
const holderCache = new Map<string, { at: number; users: string[] }>();

/** For tests: forget cached per-user and per-flag reads. */
export function forgetFlagCache(): void {
  userCache.clear();
  holderCache.clear();
}

export interface FlagLookupOptions {
  store?: CohortStore;
  holders?: FlagHolderStore;
  env?: Record<string, string | undefined>;
  now?: () => number;
}

const isCohortFlag = (flag: string): flag is CohortFlag => ALLOWED.has(flag);

/**
 * The person's resolved flags: from the cache while younger than
 * FLAG_CACHE_TTL_MS (unless `fresh`), else read. A failed read reuses a
 * cached value younger than FLAG_STALE_MAX_MS, else none.
 */
async function userFlags(
  userId: string,
  opts: FlagLookupOptions,
  now: number,
  fresh: boolean
): Promise<Record<string, string>> {
  const cached = userCache.get(userId);
  if (!fresh && cached && now - cached.at < FLAG_CACHE_TTL_MS) return cached.flags;
  try {
    const flags = await resolveCallerFlags(userId, opts.store);
    if (userCache.size >= MAX_CACHED_USERS) userCache.clear();
    userCache.set(userId, { at: now, flags });
    return flags;
  } catch (error) {
    log.warn({ error: String(error), userId: userId.slice(0, 8) }, 'Cohort flags not read');
    return cached && now - cached.at < FLAG_STALE_MAX_MS ? cached.flags : {};
  }
}

/**
 * This person's own value of `flag` from their cohorts and override (the
 * override wins), for servers that serve many users at once. Read-only:
 * never touches process.env. Undefined when COHORT_FLAGS is not on, the flag
 * is not one cohorts may set, the person has no value, or the read failed
 * (a failed read reuses a value up to FLAG_STALE_MAX_MS old). Cached for
 * FLAG_CACHE_TTL_MS. Never throws.
 */
export async function flagForUser(
  userId: string,
  flag: string,
  opts: FlagLookupOptions = {}
): Promise<'on' | 'off' | undefined> {
  if (!cohortFlagsEnabled(opts.env) || !isCohortFlag(flag)) return undefined;
  const value = (await userFlags(userId, opts, (opts.now ?? Date.now)(), false))[flag];
  return value === 'on' || value === 'off' ? value : undefined;
}

/**
 * Everyone whose own flags turn `flag` on: cohort members and overrides set
 * to 'on' (a cohort's percent sample can't be listed, so it isn't here), each person's flags re-read (not taken from the per-user cache, so
 * an override turned 'off' drops them within one FLAG_CACHE_TTL_MS), so an
 * override 'off' beats a cohort 'on' and cohort order matches the call-start
 * resolution. Empty unless COHORT_FLAGS=on. Read-only, cached for
 * FLAG_CACHE_TTL_MS, never throws (a failed read reuses a list up to
 * FLAG_STALE_MAX_MS old, else none).
 */
export async function usersWithFlag(flag: string, opts: FlagLookupOptions = {}): Promise<string[]> {
  if (!cohortFlagsEnabled(opts.env) || !isCohortFlag(flag)) return [];
  const now = (opts.now ?? Date.now)();
  const cached = holderCache.get(flag);
  if (cached && now - cached.at < FLAG_CACHE_TTL_MS) return cached.users;
  try {
    const candidates = [
      ...new Set(await (opts.holders ?? firestoreFlagHolders).candidatesFor(flag)),
    ];
    const flags = await Promise.all(candidates.map(async (u) => userFlags(u, opts, now, true)));
    const users = candidates.filter((_, i) => flags[i][flag] === 'on').sort();
    holderCache.set(flag, { at: now, users });
    return users;
  } catch (error) {
    log.warn({ error: String(error), flag }, 'Cohort flag holders not read');
    return cached && now - cached.at < FLAG_STALE_MAX_MS ? cached.users : [];
  }
}
