/**
 * Revived intelligence: what Ferni knows from earlier calls, added to the
 * per-turn context note without the reply ever waiting on it.
 *
 * REVIVED_INTELLIGENCE=on (default off) turns it on. REVIVED_BUILDERS=a,b
 * picks builders (default: all of revived-builders.ts). REVIVED_TOKEN_BUDGET
 * caps the block (default 150 tokens, never more than 400).
 *
 * The builders' data is loaded once when the call starts (turn-intelligence.ts)
 * and again in the background when it is older than ten minutes. A turn only
 * reads what is already loaded: a slow or failed store means the turn goes
 * without it, never that the turn waits.
 *
 * @module intelligence/revived/revived-intelligence
 */

import type { ContextInjection } from '../../types/context-injection-types.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  REVIVED_BUILDER_NAMES,
  REVIVED_BUILDERS,
  type RevivedBuilderName,
  type RevivedLine,
  type SummaryDoc,
} from './revived-builders.js';

const log = createLogger({ module: 'RevivedIntelligence' });

type Env = Record<string, string | undefined>;

const DEFAULT_TOKENS = 150;
const MAX_TOKENS = 400;
const CHARS_PER_TOKEN = 4;
const REFRESH_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;
const SUMMARIES = 6;

export const REVIVED_CATEGORY = 'revived_intelligence';
export const REVIVED_HEADER = 'From earlier calls (what you know, not a topic to raise):';

export interface RevivedConfig {
  on: boolean;
  builders: ReadonlySet<RevivedBuilderName>;
  budgetChars: number;
}

export function revivedIntelligenceConfig(env: Env = process.env): RevivedConfig {
  const asked = (env.REVIVED_BUILDERS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const known = asked.filter((n): n is RevivedBuilderName =>
    (REVIVED_BUILDER_NAMES as readonly string[]).includes(n)
  );
  const tokens = Number.parseInt(env.REVIVED_TOKEN_BUDGET ?? '', 10);
  return {
    on: env.REVIVED_INTELLIGENCE === 'on',
    builders: new Set(asked.length > 0 ? known : REVIVED_BUILDER_NAMES),
    budgetChars: Math.min(MAX_TOKENS, tokens > 0 ? tokens : DEFAULT_TOKENS) * CHARS_PER_TOKEN,
  };
}

export interface RevivedStore {
  /** The user's session summaries, newest first. */
  summaries: (userId: string) => Promise<SummaryDoc[]>;
}

/** The same summaries query memory recall uses (single-field order, no composite index). */
export const firestoreRevivedStore: RevivedStore = {
  async summaries(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('summaries')
      .orderBy('timestamp', 'desc')
      .limit(SUMMARIES)
      .get();
    return snap.docs.map((d) => d.data() as SummaryDoc);
  },
};

export interface RevivedStart {
  sessionId: string;
  userId?: string;
  userName?: string;
  lastContact?: unknown;
  lastConversationSummary?: string;
  store?: RevivedStore;
  now?: () => Date;
  env?: Env;
}

interface Entry {
  start: RevivedStart;
  createdAt: number;
  computedAt?: number;
  lines: RevivedLine[];
  loading?: Promise<void>;
}

const sessions = new Map<string, Entry>();

function evict(now: number): void {
  for (const [id, e] of sessions) {
    if (now - e.createdAt > SESSION_TTL_MS) sessions.delete(id);
  }
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

async function load(entry: Entry): Promise<void> {
  if (entry.loading) return entry.loading;
  const { start } = entry;
  const now = start.now ?? (() => new Date());
  const began = Date.now();
  entry.loading = (start.store ?? firestoreRevivedStore)
    .summaries(start.userId as string)
    .catch((error: unknown) => {
      log.warn({ error: String(error) }, 'Revived intelligence: summaries unavailable');
      return [] as SummaryDoc[];
    })
    .then((summaries) => {
      const input = {
        sessionId: start.sessionId,
        userName: start.userName,
        summaries,
        lastContact: start.lastContact,
        lastConversationSummary: start.lastConversationSummary,
        now: now(),
      };
      entry.lines = REVIVED_BUILDER_NAMES.flatMap((name) => REVIVED_BUILDERS[name](input));
      entry.computedAt = Date.now();
      log.info(
        { lines: entry.lines.length, ms: entry.computedAt - began },
        'REVIVED_INTELLIGENCE_LOADED'
      );
    })
    .finally(() => {
      entry.loading = undefined;
    });
  return entry.loading;
}

/**
 * Start loading at the start of a call. Idempotent per session (a handoff
 * builds a new agent for the same call). Returns when loaded, for tests and
 * logging; callers on the live path don't await it.
 */
export async function startRevivedIntelligence(start: RevivedStart): Promise<void> {
  if (!revivedIntelligenceConfig(start.env).on) return Promise.resolve();
  if (!start.userId || start.userId === 'anonymous' || !start.sessionId) return Promise.resolve();
  const existing = sessions.get(start.sessionId);
  if (existing) return existing.loading ?? Promise.resolve();
  evict(Date.now());
  const entry: Entry = { start, createdAt: Date.now(), lines: [] };
  sessions.set(start.sessionId, entry);
  return load(entry);
}

export function endRevivedIntelligence(sessionId: string): void {
  sessions.delete(sessionId);
}

/**
 * This turn's block, from what is already loaded. Never waits: a load still
 * in flight, or a store that never answers, gives null.
 *
 * @param turn the call's turn number; each line has a turn it stops at.
 * @param maxChars room left in the note; lines that don't fit are dropped whole.
 */
export function revivedInjection(
  sessionId: string,
  turn: number,
  maxChars = Number.POSITIVE_INFINITY,
  env: Env = process.env
): ContextInjection | null {
  const config = revivedIntelligenceConfig(env);
  if (!config.on) return null;
  const entry = sessions.get(sessionId);
  if (!entry) return null;
  if (entry.computedAt !== undefined && Date.now() - entry.computedAt > REFRESH_MS) {
    void load(entry).catch(() => undefined);
  }
  const room = Math.min(config.budgetChars, maxChars) - REVIVED_HEADER.length;
  const picked: RevivedLine[] = [];
  let used = 0;
  for (const line of [...entry.lines].sort((a, b) => b.priority - a.priority)) {
    if (!config.builders.has(line.builder) || turn >= line.untilTurn) continue;
    const cost = line.text.length + 3; // "\n- "
    if (used + cost > room) continue;
    picked.push(line);
    used += cost;
  }
  if (picked.length === 0) return null;
  return {
    category: REVIVED_CATEGORY,
    content: [REVIVED_HEADER, ...picked.map((l) => `- ${l.text}`)].join('\n'),
    priority: picked[0].priority,
  };
}

/** Injections whose turn is about the caller's safety: nothing is added beside them. */
const SAFETY_CATEGORIES = new Set(['safety', 'crisis_response']);

/**
 * The turn's injections with the revived block placed by priority. The others
 * keep their order and content; a crisis turn is returned untouched.
 *
 * @param maxChars the size the note is cut to (turn-intelligence.ts), so the
 *   block is never what pushes higher-priority context past the cut.
 */
export function withRevivedIntelligence(
  injections: ContextInjection[],
  opts: { sessionId?: string; turn?: number; crisis?: boolean; maxChars?: number },
  env: Env = process.env
): ContextInjection[] {
  if (!opts.sessionId || !revivedIntelligenceConfig(env).on) return injections;
  if (opts.crisis || injections.some((i) => SAFETY_CATEGORIES.has(i.category))) return injections;
  const probe = revivedInjection(opts.sessionId, opts.turn ?? 0, Number.POSITIVE_INFINITY, env);
  if (!probe) return injections;
  let at = injections.findIndex((i) => i.priority < probe.priority);
  if (at < 0) at = injections.length;
  const before = injections.slice(0, at).reduce((n, i) => n + i.content.length + 2, 0);
  const room = (opts.maxChars ?? Number.POSITIVE_INFINITY) - before - 2;
  const block = revivedInjection(opts.sessionId, opts.turn ?? 0, room, env);
  if (!block) {
    log.info({ room }, 'REVIVED_INTELLIGENCE_NO_ROOM');
    return injections;
  }
  return [...injections.slice(0, at), block, ...injections.slice(at)];
}
