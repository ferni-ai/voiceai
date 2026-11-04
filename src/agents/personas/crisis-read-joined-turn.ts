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
 * With the flag on, a request whose caller line the session's hold holds, on a call with
 * no risk noted and with no pattern hit, starts its classifier read only once that line
 * settles. Every way it settles reads something, except one: a newer request on longer
 * words. LiveKit drops the older preemptive reply then, and the newer request reads.
 * - the hold runs out (timed from this request, at most CEILING_MS): read the fragment.
 *   The read starts at about the commit, so the reply waits at most one classifier read
 *   (bounded by its own timeout, as on main) after it.
 * - committed with more words after it: LiveKit asks the LLM for a line before it adds it,
 *   so this joined line had no request and gets no reply (the call closed, or the turn was
 *   skipped). The gate reads the joined line here, patterns and classifier, as a reply's
 *   gate would.
 * - committed as anything else: read the fragment.
 * The patterns, imminent detection and any call with risk noted act at once, as on
 * main. Logs carry the reason and the wait, never the caller's words.
 *
 * @module agents/personas/crisis-read-joined-turn
 */

import { llm } from '@livekit/agents';
import { crisisRiskThisCall } from '../../services/safety/crisis-call-risk.js';
import { resolveCrisisClassifierMode } from '../../services/safety/crisis-classifier.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { TURN_KEEPER_GRACE_MS } from '../multi-agent/turn-keeper.js';
import type { UnfinishedTurnHoldSession } from '../multi-agent/unfinished-turn.js';
import { signalGateDecisions } from '../safety/crisis-gate-signal.js';
import type { CrisisGateOptions, CrisisGateTurn } from './crisis-gate.js';
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

/** startCrisisGate, handed in by the gate so this module never imports it. */
type StartGate = (
  chatCtx: llm.ChatContext,
  userData: unknown,
  options?: CrisisGateOptions
) => CrisisGateTurn | null;

type Reason = 'joined' | 'joined-commit' | 'commit' | 'hold' | 'ceiling';

interface Waiting {
  line: string[];
  settle: (read: boolean, reason: Reason) => void;
}

const waitingBy = new WeakMap<object, Set<Waiting>>();
/** Joined lines already read at their commit: one read per line, however many waits saw it. */
const readCommits = new WeakSet<object>();

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

/** A caller message's words, or undefined for anything else (a pushed context note too). */
function callerText(item: unknown): string | undefined {
  const view = item as ItemView | undefined;
  const text = view?.role === 'user' ? view.textContent?.trim() : undefined;
  return text && !text.startsWith(TURN_CONTEXT_HEADER) ? text : undefined;
}

/** Where the last caller message sits in a request or a history; -1 when there is none. */
function lastCallerAt(items: readonly unknown[] | undefined): number {
  for (let i = (items?.length ?? 0) - 1; i >= 0; i--) if (callerText(items?.[i])) return i;
  return -1;
}

const lastCallerLine = (items: readonly unknown[] | undefined): string | undefined =>
  callerText(items?.[lastCallerAt(items)]);

/**
 * The gate's options with CRISIS_READ_JOINED_TURN's wait for this request (gatedReply);
 * an option the caller passes wins.
 */
export function withHeldRead(
  session: unknown,
  chatCtx: llm.ChatContext,
  options: CrisisGateOptions,
  startGate: StartGate
): CrisisGateOptions {
  const request = heldRequest(session, chatCtx, options.env ?? process.env);
  const readJoined = (item: llm.ChatItem): void =>
    gateCommittedLine(session, chatCtx, item, options, startGate);
  const readAfter = (): Promise<boolean> | null =>
    request ? joinedTurnRead(request, readJoined) : null;
  return { readAfter, ...options };
}

/**
 * A joined line committed with no request of its own: this request's context with the
 * committed line in place of the fragment, through the gate, decisions signalled as
 * gatedReply signals them. There is no reply to hold.
 */
function gateCommittedLine(
  session: unknown,
  request: llm.ChatContext,
  item: llm.ChatItem,
  options: CrisisGateOptions,
  startGate: StartGate
): void {
  const at = lastCallerAt(request.items);
  const items = request.items.map((x, i) => (i === at ? item : x));
  const ctx = new llm.ChatContext(at < 0 ? [...items, item] : items);
  const userData = (session as CommitSession | null)?.userData;
  signalGateDecisions(session, startGate(ctx, userData, options));
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

interface HeldRequest {
  s: CommitSession;
  text: string;
  line: string[];
  waiting: Set<Waiting>;
}

/**
 * Every request, whatever the gate then decides: a newer request on longer words ends the
 * waits it continues, since LiveKit dropped those preemptive replies and this one reads.
 */
function heldRequest(
  session: unknown,
  chatCtx: llm.ChatContext,
  env: Record<string, string | undefined>
): HeldRequest | null {
  const s = heldSession(session, env);
  const text = s ? lastCallerLine(chatCtx.items) : undefined;
  if (!s || !text) return null;
  const line = wordsOf(text);
  const waiting = waitingBy.get(s) ?? new Set<Waiting>();
  waitingBy.set(s, waiting);
  for (const w of [...waiting]) if (goesOn(line, w.line)) w.settle(false, 'joined');
  return { s, text, line, waiting };
}

/**
 * For the reply gate, once its patterns pass: when this request's classifier read
 * waits for its caller line to settle, the wait (true: read now, false: no read here).
 * Null reads at once, as on main.
 */
function joinedTurnRead(
  { s, text, line, waiting }: HeldRequest,
  readJoined: (item: llm.ChatItem) => void
): Promise<boolean> | null {
  const holdMs = s.unfinishedTurnHoldMs?.(text) ?? 0;
  if (!(holdMs > 0)) return null; // the hold answers this line at once
  const call = sessionScope(s.userData);
  if (call && crisisRiskThisCall(call)) return null;
  const committed = lastCallerLine(s.history?.items);
  if (committed !== undefined && same(wordsOf(committed), line)) return null;
  return waitForLine(s, waiting, { line, holdMs, readJoined });
}

async function waitForLine(
  s: CommitSession,
  waiting: Set<Waiting>,
  held: { line: string[]; holdMs: number; readJoined: (item: llm.ChatItem) => void }
): Promise<boolean> {
  const startedAt = Date.now();
  return new Promise<boolean>((resolve) => {
    const onCommit = (ev: unknown): void => {
      const item = (ev as { item?: llm.ChatItem } | undefined)?.item;
      const text = callerText(item);
      if (!item || !text) return;
      if (!goesOn(wordsOf(text), held.line)) return entry.settle(true, 'commit');
      entry.settle(false, 'joined-commit');
      if (readCommits.has(item)) return;
      readCommits.add(item);
      held.readJoined(item);
    };
    const capped = held.holdMs > CEILING_MS;
    const timer = setTimeout(
      () => entry.settle(true, capped ? 'ceiling' : 'hold'),
      capped ? CEILING_MS : held.holdMs
    );
    timer.unref?.();
    const entry: Waiting = {
      line: held.line,
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
