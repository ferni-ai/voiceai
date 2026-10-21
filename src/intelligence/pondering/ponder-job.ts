/**
 * The scheduled pondering job: Cloud Scheduler posts /api/jobs/pondering
 * every hour, and each poll ponders the cohort's callers whose night slot
 * (ponder-schedule.ts) has come and who have called since their last pass.
 *
 * Who: dev and prod share one Firestore and nothing on a call or summary
 * says which agent served it, so the cohort is explicit: members of
 * feature_cohorts/friends-and-family (while that cohort is enabled) plus the
 * uids in PONDERING_USERS. Nobody outside it is ever read. Within it, a
 * caller is skipped when their record is gone (erased), when they turned
 * proactive check-ins off, or when they haven't called in ACTIVE_DAYS.
 * Topics they asked Ferni to forget or avoid never reach the model.
 *
 * Cost: at most MAX_PER_POLL callers per poll, one model call each, only
 * after a new call, each bounded by PER_USER_TIMEOUT_MS; the poll stops
 * starting callers after POLL_BUDGET_MS and the rest wait for the next poll.
 *
 * Off unless PONDERING=on; off, it reads nothing. Even then, it ponders the
 * people whose own cohort flags turn PONDERING on (`holders`, from
 * cohort-flags.ts usersWithFlag), and only them.
 *
 * @module intelligence/pondering/ponder-job
 */
import type { Firestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { isPonderingOn, type PonderLlm, type Pondering } from './pondering.js';
import { ponderUser, readRecentCalls, type RecentCalls } from './ponder-user.js';
import { MAX_PER_POLL, pickDue, ponderDueAt, type DueEntry } from './ponder-schedule.js';

export const COHORT_ID = 'friends-and-family';
/** A caller with no call in this long is not pondered. */
export const ACTIVE_DAYS = 14;
export const PER_USER_TIMEOUT_MS = 45_000;
export const POLL_BUDGET_MS = 150_000;
/** Most callers the cohort may name; anything past this is ignored. */
export const MAX_COHORT = 200;
/** Callers' zone when their record has none (Ferni's callers are in the US). */
export const DEFAULT_ZONE = 'America/New_York';
const DAY_MS = 86_400_000;
const log = createLogger({ module: 'ponder-job' });

const validUid = (u: string): boolean =>
  u.length > 0 && !u.includes('/') && u !== '.' && u !== '..';

/** The uids in PONDERING_USERS (comma or space separated). */
export function allowlisted(env: Record<string, string | undefined>): string[] {
  return (env.PONDERING_USERS ?? '').split(/[\s,]+/).filter(validUid);
}

/** PONDERING_USERS plus the enabled friends-and-family cohort's members, deduped. */
export async function ponderingCohort(
  db: Firestore,
  env: Record<string, string | undefined>
): Promise<string[]> {
  const ids = new Set(allowlisted(env));
  const cohort = await db.collection('feature_cohorts').doc(COHORT_ID).get();
  const data = cohort.exists ? cohort.data() : undefined;
  if (data && data.enabled !== false && Array.isArray(data.members)) {
    for (const m of data.members) if (typeof m === 'string' && validUid(m)) ids.add(m);
  }
  return [...ids].slice(0, MAX_COHORT);
}

const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.trim() !== '') : [];

function instantOf(x: unknown): Date | undefined {
  return typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? new Date(x) : undefined;
}

export type SkipReason = 'no-record' | 'opted-out' | 'inactive';

interface Candidate {
  entry: DueEntry;
  recent: RecentCalls;
  avoid: string[];
}

/** What the job needs to know about one cohort member, or why they are skipped. */
async function candidate(
  db: Firestore,
  uid: string,
  now: Date
): Promise<Candidate | { skip: SkipReason }> {
  const user = db.collection('bogle_users').doc(uid);
  const profile = await user.get();
  if (!profile.exists) return { skip: 'no-record' };
  const data = profile.data() ?? {};
  const prefs = (data.preferences ?? {}) as Record<string, unknown>;
  if (prefs.proactiveOutreach === false || prefs.wantsProactiveAdvice === false)
    return { skip: 'opted-out' };
  const recent = await readRecentCalls(db, uid);
  const lastCallEnd = recent.callEnds[0];
  if (lastCallEnd === undefined || now.getTime() - lastCallEnd.getTime() > ACTIVE_DAYS * DAY_MS)
    return { skip: 'inactive' };
  const [pondered, forgotten] = await Promise.all([
    user.collection('predictive_intelligence').doc('pondering').get(),
    user.collection('memory_state').doc('forgotten').get(),
  ]);
  const p = pondered.exists ? (pondered.data() ?? {}) : {};
  const zone = [prefs.timezone, data.timezone].find((z) => typeof z === 'string') as
    string | undefined;
  const entry: DueEntry = {
    uid,
    lastCallEnd,
    lastPonderedAt: instantOf(p.ponderedAt) ?? instantOf(p.generatedAt),
    dueAt: ponderDueAt({
      lastCallEnd,
      recentCallEnds: recent.callEnds,
      timeZone: zone ?? DEFAULT_ZONE,
      uid,
    }),
  };
  const avoid = [
    ...strings(forgotten.exists ? forgotten.data()?.topics : undefined),
    ...strings(prefs.topicsToAvoid),
    ...strings(data.avoidTopics),
  ];
  return { entry, recent, avoid };
}

function bounded(llm: PonderLlm, ms: number): PonderLlm {
  return async (prompt) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        llm(prompt),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
}

export interface PonderJobOptions {
  now?: Date;
  env?: Record<string, string | undefined>;
  /** Ponder and report, writing nothing. */
  dryRun?: boolean;
  /** Treat every eligible caller as due (dry runs only). */
  ignoreDue?: boolean;
  perUserTimeoutMs?: number;
  budgetMs?: number;
  /** Who has PONDERING on through their own cohort flags; injected by the job route. */
  holders?: () => Promise<string[]>;
}

export interface PonderJobResult {
  status: 'off' | 'ran';
  cohort: number;
  skipped: Record<SkipReason, number>;
  due: number;
  stored: number;
  nothing: number;
  errors: number;
  /** Per caller, what the pass produced (dry runs keep it for review). */
  results: Array<{ uid: string; status: string; pondering?: Pondering }>;
}

function emptyResult(): PonderJobResult {
  return {
    status: 'off',
    cohort: 0,
    skipped: { 'no-record': 0, 'opted-out': 0, inactive: 0 },
    due: 0,
    stored: 0,
    nothing: 0,
    errors: 0,
    results: [],
  };
}

interface Poll {
  db: Firestore;
  now: Date;
  result: PonderJobResult;
}

/** Each cohort member's schedule entry, or the reason they are skipped. */
async function gather(
  { db, now, result }: Poll,
  cohort: readonly string[]
): Promise<Map<string, Candidate>> {
  const ready = new Map<string, Candidate>();
  // One caller at a time: a few small reads each, and the poll stays gentle on Firestore.
  for (const uid of cohort) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const c = await candidate(db, uid, now);
      if ('skip' in c) result.skipped[c.skip]++;
      else ready.set(uid, c);
    } catch (error) {
      result.errors++;
      log.warn({ userId: uid.slice(0, 8), error: String(error) }, 'Pondering: caller not read');
    }
  }
  return ready;
}

interface PassOptions {
  llm: PonderLlm;
  /** The env the pass reads for this caller. */
  envFor: (uid: string) => Record<string, string | undefined>;
  dryRun: boolean;
  /** No caller is started after this (epoch ms). */
  deadline: number;
}

async function ponderDue(
  { db, now, result }: Poll,
  due: readonly DueEntry[],
  ready: ReadonlyMap<string, Candidate>,
  { llm, envFor, dryRun, deadline }: PassOptions
): Promise<void> {
  // One model call at a time, so the poll's cost and duration stay bounded.
  for (const { uid } of due) {
    const c = ready.get(uid);
    if (!c || Date.now() > deadline) break;
    try {
      // eslint-disable-next-line no-await-in-loop
      const out = await ponderUser(db, uid, llm, {
        now,
        env: envFor(uid),
        avoid: c.avoid,
        recent: c.recent,
        dryRun,
      });
      if (out.status === 'stored') result.stored++;
      if (out.status === 'nothing') result.nothing++;
      result.results.push({ uid, status: out.status, pondering: out.pondering });
    } catch (error) {
      result.errors++;
      log.warn({ userId: uid.slice(0, 8), error: String(error) }, 'Pondering: pass failed');
    }
  }
}

export async function runPonderingJob(
  db: Firestore,
  llm: PonderLlm,
  {
    now = new Date(),
    env = process.env,
    dryRun = false,
    ignoreDue = false,
    perUserTimeoutMs = PER_USER_TIMEOUT_MS,
    budgetMs = POLL_BUDGET_MS,
    holders,
  }: PonderJobOptions = {}
): Promise<PonderJobResult> {
  const result = emptyResult();
  const own = new Set((holders ? await holders() : []).filter(validUid));
  const serverOn = isPonderingOn(env);
  if (!serverOn && own.size === 0) return result;
  result.status = 'ran';
  const started = Date.now();
  const cohort = serverOn
    ? [...new Set([...(await ponderingCohort(db, env)), ...own])].slice(0, MAX_COHORT)
    : [...own].slice(0, MAX_COHORT);
  result.cohort = cohort.length;
  const ready = await gather({ db, now, result }, cohort);
  const entries = [...ready.values()].map((c) => c.entry);
  const due = ignoreDue ? entries.slice(0, MAX_PER_POLL) : pickDue(entries, now);
  result.due = due.length;

  const think = bounded(llm, perUserTimeoutMs);
  const deadline = started + budgetMs;
  const envFor = (uid: string): typeof env => (own.has(uid) ? { ...env, PONDERING: 'on' } : env);
  await ponderDue({ db, now, result }, due, ready, { llm: think, envFor, dryRun, deadline });
  return result;
}
