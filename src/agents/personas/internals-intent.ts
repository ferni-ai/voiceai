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
import { noInventedInternalsEnabled, turnsSinceFailure } from './no-invented-internals.js';
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
const norm = (t: string): string => (t.toLowerCase().match(/[a-z0-9']+/g) ?? []).join(' ');

/** One call's classifier: feed it the turn as it is spoken, read the answer for the final words. */
export class InternalsIntent {
  private latest: { text: string; yes: boolean } | null = null;
  private running: Promise<void> | null = null;
  private pending: { text: string; earlier: string[] } | null = null;
  private turn = 0;

  constructor(
    private readonly ask: UnderstandFn,
    private readonly timeoutMs = TIMEOUT_MS,
    private readonly now: () => number = Date.now
  ) {}

  /** The caller's turn so far; earlier caller lines for context. Returns when this text is classified. */
  async observe(text: string, earlier: string[] = []): Promise<void> {
    const t = norm(text);
    if (!t || t === this.latest?.text) return;
    this.pending = { text: t, earlier };
    while (this.running) await this.running;
    const next = this.pending;
    this.pending = null;
    if (!next || next.text === this.latest?.text) return;
    this.running = this.run(next.text, next.earlier);
    await this.running;
    this.running = null;
  }

  /** True only when the answer for exactly these words was yes. */
  yesFor(text: string): boolean {
    return this.latest?.text === norm(text) && this.latest.yes;
  }

  newTurn(): void {
    this.turn++;
    this.latest = null;
    this.pending = null;
  }

  private async run(text: string, earlier: string[]): Promise<void> {
    const turn = this.turn;
    const started = this.now();
    const controller = new globalThis.AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const aborted = new Promise<string>((resolve) =>
      controller.signal.addEventListener('abort', () => resolve(''), { once: true })
    );
    try {
      const input = JSON.stringify({ EARLIER: earlier.slice(-3), NOW: text });
      const yes = parseIntent(
        await Promise.race([this.ask(INTENT_PROMPT, input, controller.signal), aborted])
      );
      if (turn === this.turn) this.latest = { text, yes };
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: voice.AgentSession<any>,
  agent: () => Items,
  cleanupFunctions: Array<() => void>,
  /** The model call (TURN_UNDERSTANDING_MODEL, gemini-3.5-flash-lite by default); injectable for tests. */
  ask: UnderstandFn = geminiUnderstand()
): { onTranscript(transcript: string, isFinal: boolean): void } | null {
  if (!noInventedInternalsEnabled()) return null;
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
      const earlier = items
        .filter((i) => i.type === 'message' && i.role === 'user')
        .map((i) => i.textContent ?? '');
      void intent.observe(turn, earlier);
    },
  };
}
