/**
 * Is the caller asking how Ferni works inside, or why his tool failed? One
 * small model call decides, after a failed tool and only then.
 *
 * #2379: cue words could not tell a press ("I'm in tech too, give it to me
 * plain") from the caller's own life ("give it to me plain, is this a scam?"):
 * 12 of 20 ordinary asks after a failed search fired. This asks
 * gemini-3.5-flash-lite instead, while the caller is still talking, so the
 * answer is usually ready when they stop. It never holds the reply: the reply
 * reads an answer only if one is ready for exactly these words, and anything
 * else (not ready, timed out, failed, unparsable) is "no".
 *
 * With NO_INVENTED_INTERNALS=on, installed per call by turn-observers.ts and
 * read in turn-request.ts through no-invented-internals.ts's internalsTurn.
 *
 * @module agents/personas/internals-intent
 */

import { voice } from '@livekit/agents';

import { createLogger } from '../../utils/safe-logger.js';
import {
  callerLines,
  lastFailureAt,
  noInventedInternalsEnabled,
  turnsSinceFailure,
} from './no-invented-internals.js';
import { geminiUnderstand, type UnderstandFn } from './turn-understanding.js';

const log = createLogger({ module: 'InternalsIntent' });

export const INTENT_PROMPT = `Ferni is an AI friend on a phone call. One of his tools (a web search or a lookup) just failed. Read the caller's latest words (NOW), with their earlier lines (EARLIER) for context. Answer true only if NOW asks or pushes Ferni to explain how he works inside (his code, servers, systems, how his search is built) or why his tool failed, including insisting, offering credentials ("I'm an engineer, give it to me straight") or citing claims about his tech. Anything about the caller's own life, work, devices or tech, advice, opinions, the news, Ferni's feelings or voice, how he remembers things, and what he is (an AI, who made him, what model he is) have their own answers: false. Reply JSON only: {"internals": true} or {"internals": false}.`;

/** The model's answer: true only for an explicit {"internals": true}. */
export function parseIntent(reply: string): boolean {
  try {
    const v = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) as {
      internals?: unknown;
    };
    return v.internals === true;
  } catch {
    return false;
  }
}

const TIMEOUT_MS = 1500;
/** An interim is worth a call from 3 words, and only when more than one word changed since the last. */
const MIN_INTERIM_WORDS = 3;
const MAX_CALLS_PER_TURN = 4;
const MAX_CALLS_PER_WINDOW = 12;
const MAX_INPUT_CHARS = 600;
const words = (t: string): string[] => t.toLowerCase().match(/[a-z0-9']+/g) ?? [];
const isPrefix = (a: string[], b: string[]): boolean =>
  a.length <= b.length && a.every((w, i) => b[i] === w);
/** Words that differ between two readings of a turn: all but the shared start. */
function changed(a: string[], b: string[]): number {
  let same = 0;
  while (same < Math.min(a.length, b.length) && a[same] === b[same]) same++;
  return Math.max(a.length, b.length) - same;
}

/** The model input: caller lines only, NOW last, under MAX_INPUT_CHARS (the oldest lines go first). */
export function intentInput(earlier: string[], now: string): string {
  const n = now.slice(-400);
  let e = earlier.slice(-3).map((l) => l.slice(-150));
  let input = JSON.stringify({ EARLIER: e, NOW: n });
  while (input.length > MAX_INPUT_CHARS && e.length) {
    e = e.slice(1);
    input = JSON.stringify({ EARLIER: e, NOW: n });
  }
  return input;
}

interface Pending {
  w: string[];
  earlier: string[];
  final: boolean;
}

/** One call's classifier: feed it the turn as it is spoken, read the answer for the final words. */
export class InternalsIntent {
  private latest: { w: string[]; yes: boolean } | null = null;
  private asked: string[] | null = null;
  private running: Promise<void> | null = null;
  private pending: Pending | null = null;
  private turn = 0;
  private turnCalls = 0;
  private window: unknown;
  private windowCalls = 0;
  /** Model calls made, for the eval's calls-per-turn count. */
  calls = 0;

  constructor(
    private readonly ask: UnderstandFn,
    private readonly timeoutMs = TIMEOUT_MS,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * The caller's turn so far, earlier caller lines, whether these are the final
   * words, and which failure's window this is. Resolves once nothing is queued.
   */
  async observe(
    text: string,
    earlier: string[] = [],
    opts: { final?: boolean; window?: unknown } = {}
  ): Promise<void> {
    if (opts.window !== undefined && opts.window !== this.window) {
      this.window = opts.window;
      this.windowCalls = 0;
    }
    this.pending = { w: words(text), earlier, final: opts.final ?? true };
    this.running ??= this.drain().finally(() => {
      this.running = null;
    });
    await this.running;
  }

  /** An answer covers these words: it read all of them, or all but the last one. */
  private covers(w: string[]): boolean {
    const a = this.latest?.w;
    return !!a && a.length > 0 && isPrefix(a, w) && w.length - a.length <= 1;
  }

  /** The answer for these words was yes; false when none covers them yet. */
  yesFor(text: string): boolean {
    return this.covers(words(text)) && this.latest?.yes === true;
  }

  newTurn(): void {
    this.turn++;
    this.latest = null;
    this.asked = null;
    this.pending = null;
    this.turnCalls = 0;
  }

  /** Worth a call: under the caps, and not already asked for (all but a last word). */
  private wanted({ w, final }: Pending): boolean {
    // The last call of a turn is kept for its final words.
    const turnCap = final ? MAX_CALLS_PER_TURN : MAX_CALLS_PER_TURN - 1;
    if (this.turnCalls >= turnCap || this.windowCalls >= MAX_CALLS_PER_WINDOW) return false;
    if (w.length === 0) return false;
    const asked = this.asked ?? [];
    if (final) return !(isPrefix(asked, w) && asked.length > 0 && w.length - asked.length <= 1);
    return w.length >= MIN_INTERIM_WORDS && changed(asked, w) > 1;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      const next = this.pending;
      this.pending = null;
      if (!this.wanted(next)) continue;
      this.turnCalls++;
      this.windowCalls++;
      this.calls++;
      this.asked = next.w;
      await this.run(next.w, next.earlier);
    }
  }

  private async run(w: string[], earlier: string[]): Promise<void> {
    const turn = this.turn;
    const started = this.now();
    const controller = new globalThis.AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const aborted = new Promise<string>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve(''), { once: true });
    });
    try {
      const input = intentInput(earlier, w.join(' '));
      const yes = parseIntent(
        await Promise.race([this.ask(INTENT_PROMPT, input, controller.signal), aborted])
      );
      if (turn === this.turn) this.latest = { w, yes };
      // Counts only, never words.
      log.info(
        { ms: this.now() - started, yes, timedOut: controller.signal.aborted },
        'INTERNALS_INTENT'
      );
    } catch (error) {
      log.debug({ error: String(error) }, 'internals intent failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

const intents = new WeakMap<object, InternalsIntent>();

export function setInternalsIntent(session: object, intent: InternalsIntent | null): void {
  if (intent) intents.set(session, intent);
  else intents.delete(session);
}

/** The classifier said these words press Ferni on his internals; false when not ready. */
export function internalsIntentFor(session: object, words: string): boolean {
  return intents.get(session)?.yesFor(words) ?? false;
}

type Items = { chatCtx: { items: unknown[] } };

/**
 * Per call: classify the caller's turn while they talk, but only within three
 * caller turns of a failed tool. Null when NO_INVENTED_INTERNALS is off.
 */
export function installInternalsIntent(
  input: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session: voice.AgentSession<any>;
    /** The agent, or a getter for the one on the call now (it follows handoffs). */
    agent: unknown;
    cleanupFunctions: Array<() => void>;
  },
  /** The model call (TURN_UNDERSTANDING_MODEL, gemini-3.5-flash-lite by default); injectable for tests. */
  ask: UnderstandFn = geminiUnderstand()
): { onTranscript(transcript: string, isFinal: boolean): void } | null {
  if (!noInventedInternalsEnabled()) return null;
  const { session, cleanupFunctions } = input;
  const agent = (): Items =>
    (typeof input.agent === 'function' ? (input.agent as () => Items)() : input.agent) as Items;
  const intent = new InternalsIntent(ask);
  setInternalsIntent(session, intent);
  const finals: string[] = [];
  const onState = (ev: unknown): void => {
    if ((ev as { newState?: string }).newState !== 'speaking') return;
    finals.length = 0;
    intent.newTurn();
  };
  session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
  cleanupFunctions.push(() => {
    session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
    setInternalsIntent(session, null);
  });
  return {
    onTranscript(transcript, isFinal) {
      // The current turn is not in the history yet: at most two caller turns since the failure.
      const items = agent().chatCtx.items as Parameters<typeof turnsSinceFailure>[0];
      if (turnsSinceFailure(items) > 2) return;
      const turn = [...finals, transcript].join(' ');
      if (isFinal) finals.push(transcript);
      // Caller lines only: never the per-turn context notes.
      const window = lastFailureAt(items);
      void intent.observe(turn, callerLines(items), { final: isFinal, window });
    },
  };
}
