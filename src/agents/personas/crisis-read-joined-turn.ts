/**
 * CRISIS_READ_JOINED_TURN (off by default): the crisis classifier reads the caller's
 * whole sentence, not a fragment the unfinished-turn hold is still waiting on.
 *
 * Prod, 2026-11: speech-to-text gave a final that stopped mid-sentence, with no end
 * punctuation. The hold (multi-agent/unfinished-turn.ts) kept the turn open for the
 * rest of it, but LiveKit had already started a preemptive reply on the fragment
 * (agent_activity.js onPreemptiveGeneration), and that request went through the reply
 * gate (crisis-gate.ts). The classifier read the fragment alone, found risk where no
 * pattern did, and the read counted even though that reply was never meant to be
 * spoken: for the call (crisis-call-risk.ts) and among the joined turn's own reads
 * (crisis-classifier.ts turnVerdicts, whose loose key matches a fragment of a line).
 *
 * With the flag on, a request whose caller line the hold holds, on a call with no risk
 * noted and with no pattern hit, starts its classifier read only once that line settles:
 * - committed as it is (the caller went quiet and the hold ran out): read it then.
 *   Nothing is dropped, only delayed by at most the hold.
 * - committed, or asked again, with more words after it: no read. LiveKit drops a
 *   preemptive reply whose transcript changed, so it is never spoken; the joined
 *   turn's own request reads the whole sentence once.
 * - committed as anything else, or nothing settles within CEILING_MS: read it then
 *   (fail closed).
 * The patterns, imminent detection and any call with risk noted act at once, as on
 * main. Logs carry the reason and the wait, never the caller's words.
 *
 * @module agents/personas/crisis-read-joined-turn
 */

import type { llm } from '@livekit/agents';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { resolveCrisisClassifierMode } from '../../services/safety/crisis-classifier.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { TURN_KEEPER_GRACE_MS } from '../multi-agent/turn-keeper.js';
import { unfinishedness, type UnfinishedTurnHoldSession } from '../multi-agent/unfinished-turn.js';
import type { CrisisGateOptions } from './crisis-gate.js';
import { sessionScope } from './crisis-gate-words.js';

const log = createLogger({ module: 'CrisisReadJoinedTurn' });

/** The hold ends before the turn keeper's grace (unfinished-turn.ts); a commit follows it. */
export const CEILING_MS = TURN_KEEPER_GRACE_MS + 500;

const COMMIT_EVENT = 'conversation_item_added';

interface CommitSession extends UnfinishedTurnHoldSession {
  userData?: unknown;
  history?: llm.ChatContext;
  on?: (event: string, handler: (ev: unknown) => void) => unknown;
  off?: (event: string, handler: (ev: unknown) => void) => unknown;
}

interface Waiting {
  line: string[];
  settle: (read: boolean, reason: 'commit' | 'joined' | 'ceiling') => void;
}

const waitingBy = new WeakMap<object, Set<Waiting>>();

function crisisReadJoinedTurnOn(env: Record<string, string | undefined>): boolean {
  return env.CRISIS_READ_JOINED_TURN === 'on';
}

/** Words for comparing two transcripts of one turn: letters and digits in any script. */
const wordsOf = (text: string): string[] =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const same = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((w, i) => w === b[i]);

/** `longer` is `shorter` with more words after it: the caller went on. */
const goesOn = (longer: string[], shorter: string[]): boolean =>
  shorter.length > 0 && longer.length > shorter.length && shorter.every((w, i) => w === longer[i]);

interface ItemView {
  type?: string;
  role?: string;
  textContent?: string;
}

/** The last caller message in a request or a history, past any pushed context note. */
function lastCallerLine(items: readonly unknown[] | undefined): string | undefined {
  for (let i = (items?.length ?? 0) - 1; i >= 0; i--) {
    const item = items?.[i] as ItemView;
    const text = item?.textContent?.trim();
    if (item?.role !== 'user' || !text || text.startsWith(TURN_CONTEXT_HEADER)) continue;
    return text;
  }
  return undefined;
}

/**
 * The gate's options with CRISIS_READ_JOINED_TURN's wait for this request (gatedReply);
 * an option the caller passes wins.
 */
export function withHeldRead(
  session: unknown,
  chatCtx: llm.ChatContext,
  options: CrisisGateOptions
): CrisisGateOptions {
  const readAfter = (): Promise<boolean> | null =>
    joinedTurnRead(session, chatCtx, options.env ?? process.env);
  return { readAfter, ...options };
}

/** A live session with the hold installed, while the flag and the live classifier are on. */
function heldSession(
  session: unknown,
  env: Record<string, string | undefined>
): CommitSession | null {
  if (!crisisReadJoinedTurnOn(env) || resolveCrisisClassifierMode(env) !== 'live') return null;
  const s = session as CommitSession | null;
  const live = !!s?.on && !!s.off && typeof s.unfinishedTurnHoldMs === 'function';
  return live ? s : null;
}

/**
 * For the reply gate, once its patterns pass: when this request's classifier read
 * waits for its caller line to settle, the wait (true: read now, false: never read).
 * Null reads at once, as on main.
 */
function joinedTurnRead(
  session: unknown,
  chatCtx: llm.ChatContext,
  env: Record<string, string | undefined> = process.env
): Promise<boolean> | null {
  const s = heldSession(session, env);
  const text = s ? lastCallerLine(chatCtx.items) : undefined;
  if (!s || !text) return null;
  const line = wordsOf(text);
  const waiting = waitingBy.get(s) ?? new Set<Waiting>();
  waitingBy.set(s, waiting);
  // A newer request on longer words: LiveKit dropped the older preemptive reply.
  for (const w of [...waiting]) if (goesOn(line, w.line)) w.settle(false, 'joined');
  if (unfinishedness(text, env) === 'finished') return null;
  const call = sessionScope(s.userData);
  if (call && crisisRiskThisCall(call)) return null;
  const committed = lastCallerLine(s.history?.items);
  if (committed !== undefined && same(wordsOf(committed), line)) return null;
  return waitForLine(s, waiting, line);
}

async function waitForLine(
  s: CommitSession,
  waiting: Set<Waiting>,
  line: string[]
): Promise<boolean> {
  const startedAt = Date.now();
  return new Promise<boolean>((resolve) => {
    const onCommit = (ev: unknown): void => {
      const item = (ev as { item?: ItemView } | undefined)?.item;
      const text = item?.role === 'user' ? item.textContent?.trim() : undefined;
      if (!text || text.startsWith(TURN_CONTEXT_HEADER)) return;
      const joined = goesOn(wordsOf(text), line);
      entry.settle(!joined, joined ? 'joined' : 'commit');
    };
    const timer = setTimeout(() => entry.settle(true, 'ceiling'), CEILING_MS);
    timer.unref?.();
    const entry: Waiting = {
      line,
      settle: (read, reason) => {
        if (!waiting.delete(entry)) return;
        clearTimeout(timer);
        s.off?.(COMMIT_EVENT, onCommit);
        const heldMs = Date.now() - startedAt;
        log.info({ heldMs, joined: !read, reason }, 'CRISIS_READ_DEFERRED');
        resolve(read);
      },
    };
    waiting.add(entry);
    s.on?.(COMMIT_EVENT, onCommit);
  });
}
