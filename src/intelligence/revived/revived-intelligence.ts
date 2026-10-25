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
import { createLogger } from '../../utils/safe-logger.js';
import {
  REVIVED_BUILDER_NAMES,
  REVIVED_BUILDERS,
  type RevivedBuilderName,
  type RevivedLine,
  type SummaryDoc,
} from './revived-builders.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'RevivedIntelligence' });

type Env = Record<string, string | undefined>;

const DEFAULT_TOKENS = 150;
const MAX_TOKENS = 400;
const CHARS_PER_TOKEN = 4;
const REFRESH_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_SESSIONS = 500;

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

/**
 * What revived intelligence needs from storage. The Firestore adapter (L1,
 * memory/storage/revived-store.ts) implements it; turn-intelligence.ts hands it in.
 */
export interface RevivedStore {
  /** The user's session summaries, newest first. */
  summaries: (userId: string) => Promise<SummaryDoc[]>;
}

/** Is this text about a topic the caller asked Ferni to forget (memory/recall/forget.ts)? */
export type IsForgotten = (text: string) => boolean;

/** Past this, forgotten topics count as unreadable and nothing is offered (as call-summaries.ts). */
export const FORGOTTEN_WAIT_MS = 5000;

/** Every string in a summary, so it is checked whole against forgotten topics. */
function wordsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(wordsOf);
  if (value && typeof value === 'object') return Object.values(value).flatMap(wordsOf);
  return [];
}

/**
 * The summaries Ferni may use, failing closed as call-summaries.ts does: one
 * marked forgottenAt goes, and so does the whole summary when any of its text
 * is about a forgotten topic. Unreadable forgotten topics: none at all.
 */
export function rememberable(summaries: SummaryDoc[], forgotten: IsForgotten | null): SummaryDoc[] {
  if (!forgotten) return [];
  return summaries.filter((s) => {
    const marked = (s as { forgottenAt?: unknown }).forgottenAt;
    return (marked === undefined || marked === null) && !forgotten(wholeText(s));
  });
}

/** All the words a summary says, without its id and date. */
function wholeText(s: SummaryDoc): string {
  const { sessionId: _id, timestamp: _at, ...said } = s;
  return wordsOf(said).join('\n');
}

export interface RevivedStart {
  sessionId: string;
  userId?: string;
  userName?: string;
  lastContact?: unknown;
  lastConversationSummary?: string;
  store: RevivedStore;
  /**
   * What the caller asked Ferni to forget, as stored, or null when it can't be
   * read (or takes past FORGOTTEN_WAIT_MS): then nothing from earlier calls is offered.
   */
  forgotten: () => Promise<IsForgotten | null>;
  /** What they asked to forget during this call (forget.ts forgottenInProcess), checked every turn. */
  forgottenNow: () => IsForgotten;
  now?: () => Date;
  env?: Env;
}

interface Entry {
  start: RevivedStart;
  createdAt: number;
  computedAt?: number;
  lines: RevivedLine[];
  /** The whole text of each summary the lines came from, rechecked every turn. */
  sources: string[];
  loading?: Promise<void>;
}

function within<T>(read: Promise<T | null>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([read, late]).finally(() => clearTimeout(timer));
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
  const clock = start.now ?? (() => new Date());
  const began = Date.now();
  const forgotten = within(start.forgotten(), FORGOTTEN_WAIT_MS).catch((error: unknown) => {
    log.warn({ error: String(error) }, 'Revived intelligence: forgotten topics unreadable');
    return null;
  });
  entry.loading = Promise.all([
    start.store.summaries(start.userId as string).catch((error: unknown) => {
      log.warn({ error: String(error) }, 'Revived intelligence: summaries unavailable');
      return [] as SummaryDoc[];
    }),
    forgotten,
  ])
    .then(([all, stored]) => {
      const now = start.forgottenNow();
      const isForgotten = stored && ((t: string) => stored(t) || now(t));
      if (!isForgotten) log.warn('Revived intelligence: forgotten topics unreadable; none offered');
      const summaries = rememberable(all, isForgotten);
      entry.sources = summaries.map(wholeText);
      const input = {
        sessionId: start.sessionId,
        userName: start.userName,
        summaries,
        lastContact: start.lastContact,
        lastConversationSummary: start.lastConversationSummary,
        now: clock(),
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
  if (!isMemberIdentity(start.userId) || !start.sessionId) return Promise.resolve();
  const existing = sessions.get(start.sessionId);
  if (existing) return existing.loading ?? Promise.resolve();
  evict(Date.now());
  const entry: Entry = { start, createdAt: Date.now(), lines: [], sources: [] };
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
  // Forgotten during this call: nothing until it is rebuilt without that summary.
  const forgottenNow = entry.start.forgottenNow();
  if (entry.sources.some((text) => forgottenNow(text))) {
    entry.lines = [];
    entry.sources = [];
    void load(entry).catch(() => undefined);
    return null;
  }
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
