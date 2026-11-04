/**
 * CRISIS_READ_JOINED_TURN: the reply gate's classifier reads the caller's whole sentence,
 * not a fragment the unfinished-turn hold is still waiting on (crisis-read-joined-turn.ts).
 *
 * Each call here is driven the way LiveKit drives a live one: a preemptive request per
 * final transcript, each through the real reply gate (gatedReply), and the commit as a
 * conversation_item_added on the session. The classifier stand-in reads the bare
 * fragment as crisis, the way it did in prod, and the joined sentence as none. All lines
 * are fictional.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { unfinishedTurnHoldMs } from '../../multi-agent/unfinished-turn.js';
import { CRISIS_GATE_SIGNAL } from '../../safety/crisis-gate-signal.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';
import { CEILING_MS } from '../crisis-read-joined-turn.js';
import { OpenerGate } from '../opener-gate.js';

const OFF = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...OFF, CRISIS_READ_JOINED_TURN: 'on' };
/** The gate rows also run with the turn's reads weighed together (turnVerdicts). */
const ROWS = { ...ON, CRISIS_AGREEMENT_GATE: 'on' };

const FRAGMENT = 'Can I cut my';
const JOINED = 'Can I cut my hair shorter or is that weird?';
const CRISIS = '{"risk":"crisis","subject":"self"}';
const NONE = '{"risk":"none","subject":"self"}';
const RISKY = [/^can i cut my$/i, /wrists/i, /hide the marks/i, /want to die/i];

let calls = 0;
/** A live call: the session LiveKit hands the gate, with the hold installed. */
class Call extends EventEmitter {
  readonly userData = { services: { sessionId: `joined-turn-${++calls}` } };
  readonly history = llm.ChatContext.empty();
  unfinishedTurnHoldMs?: (transcript: string) => number = unfinishedTurnHoldMs;
  /** Every caller line the classifier was asked about, in order. */
  readonly reads: string[] = [];
  /** Every crisis decision the gate signalled, pattern or classifier. */
  readonly alarms: string[] = [];

  constructor() {
    super();
    this.on(CRISIS_GATE_SIGNAL, (ev: { action: string }) => this.alarms.push(ev.action));
  }

  /** The classifier: crisis for the bare fragment or a risky line in reach, none otherwise. */
  readonly generate: CrisisGenerateFn = async (_prompt, content) => {
    const { latest, earlier = [] } = JSON.parse(content) as { latest: string; earlier?: string[] };
    this.reads.push(latest);
    return [latest, ...earlier].some((line) => RISKY.some((re) => re.test(line))) ? CRISIS : NONE;
  };

  /** LiveKit commits the turn: the caller's words join the history. */
  commit(text: string): void {
    const item = this.history.addMessage({ role: 'user', content: text });
    this.emit('conversation_item_added', { item });
  }

  /** Ferni answered. */
  answer(text: string): void {
    this.history.addMessage({ role: 'assistant', content: text });
  }

  /** A request for `latest`: preemptive while uncommitted, the turn's own once committed. */
  ask(latest: string, env: Record<string, string>): Promise<ReadableStream<unknown> | null> {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    for (const item of this.history.items) {
      const m = item as llm.ChatMessage;
      if (m.textContent !== undefined) ctx.addMessage({ role: m.role, content: m.textContent });
    }
    const last = ctx.items.at(-1) as llm.ChatMessage | undefined;
    if (last?.role !== 'user' || last.textContent !== latest) {
      ctx.addMessage({ role: 'user', content: latest });
    }
    const model = async () => textStream('Sure.');
    return gatedReply(ctx, this, model as never, new OpenerGate(3), {
      env,
      generate: this.generate,
    });
  }
}

function textStream(text: string): ReadableStream<unknown> {
  return new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

async function said(reply: Promise<ReadableStream<unknown> | null>): Promise<string> {
  let out = '';
  const stream = await reply;
  for await (const chunk of stream as unknown as AsyncIterable<unknown>) out += String(chunk);
  return out;
}

/** Let every pending read and decision run. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
});
afterEach(() => vi.useRealTimers());

describe('CRISIS_READ_JOINED_TURN on: a fragment the hold is waiting on', () => {
  it('is read once, as the joined sentence, when the caller goes on (no alarm)', async () => {
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON); // preemptive reply on the first final
    await settle();
    expect(call.reads).toEqual([]);
    const joined = call.ask(JOINED, ON); // the next final joins it: a new preemptive reply
    call.commit(JOINED);
    expect(await said(joined)).toBe('Sure.');
    expect(await said(fragment)).toBe('Sure.'); // dropped by LiveKit; settles with no read
    expect(call.reads).toEqual([JOINED]);
    expect(call.alarms).toEqual([]);
  });

  it('is never read once a newer request carries more words, even before the commit', async () => {
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    const joined = call.ask(JOINED, ON); // LiveKit drops the fragment's preemptive reply
    expect(await said(fragment)).toBe('Sure.'); // settled with no commit yet
    expect(call.reads).toEqual([JOINED]); // the finished joined line, read at once
    call.commit(JOINED);
    await said(joined);
    expect(call.reads).toEqual([JOINED]);
  });

  it('is never read when the joined turn is committed before its own request', async () => {
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    call.commit(JOINED);
    expect(await said(call.ask(JOINED, ON))).toBe('Sure.');
    await said(fragment);
    expect(call.reads).toEqual([JOINED]);
    expect(call.alarms).toEqual([]);
  });

  it('is read as it is at the hold-end commit when the caller goes quiet: recall kept', async () => {
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    expect(call.reads).toEqual([]);
    call.commit(FRAGMENT); // the hold ran out; LiveKit keeps the preemptive reply
    await said(fragment);
    expect(call.reads).toEqual([FRAGMENT]);
    expect(call.alarms).toEqual(['guide']);
  });

  it('is read as it is when nothing settles within the ceiling (fail closed)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    await vi.advanceTimersByTimeAsync(CEILING_MS - 1);
    expect(call.reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(CEILING_MS).toBeLessThanOrEqual(3000); // a held reply never waits longer than 3 s
    await said(fragment);
    expect(call.reads).toEqual([FRAGMENT]);
    expect(call.alarms).toEqual(['guide']);
  });
});

describe('CRISIS_READ_JOINED_TURN on: what never waits', () => {
  /** What the gate did before any commit and before any timer ran. */
  async function atOnce(line: string, env: Record<string, string>, prep?: (c: Call) => void) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    resetCrisisClassifierCache(); // each line is read afresh, flag on and off
    const call = new Call();
    prep?.(call);
    void call.ask(line, env);
    await settle();
    return { reads: [...call.reads], alarms: [...call.alarms] };
  }

  it('an unfinished line the patterns flag acts at once', async () => {
    expect(await atOnce('I want to kill myself and', ON)).toEqual({
      reads: [],
      alarms: ['replace'],
    });
    const guided = "I hope I don't wake up tomorrow and";
    expect(await atOnce(guided, ON)).toEqual({ reads: [guided], alarms: ['guide'] });
  });

  it('the gate asks to wait only once its patterns pass', () => {
    const call = new Call();
    const readAfter = vi.fn(() => new Promise<boolean>(() => {})); // never settles
    const gate = (line: string) => {
      const ctx = llm.ChatContext.empty();
      ctx.addMessage({ role: 'user', content: line });
      const options = { env: ON, generate: call.generate, readAfter };
      return startCrisisGate(ctx, { services: { sessionId: 'gate-only' } }, options);
    };
    const guided = "I hope I don't wake up tomorrow and";
    expect(gate(guided)?.decision.action).toBe('guide');
    expect(gate('I just overdosed and')?.decision.action).toBe('replace');
    expect(readAfter).not.toHaveBeenCalled();
    expect(call.reads).toEqual([guided]);
    expect(gate(FRAGMENT)?.decision.action).toBe('pass');
    expect(readAfter).toHaveBeenCalledTimes(1);
    expect(call.reads).toEqual([guided]);
  });

  it('an imminent line acts at once', async () => {
    expect(await atOnce('I just overdosed and', ON)).toEqual({ reads: [], alarms: ['replace'] });
  });

  it('a finished line is read at once, as with the flag off', async () => {
    for (const line of ['I want to die.', 'Can I cut my hair?']) {
      expect(await atOnce(line, ON)).toEqual(await atOnce(line, OFF));
    }
    expect((await atOnce('Can I cut my hair?', ON)).reads).toEqual(['Can I cut my hair?']);
  });

  it('a held line on a call with risk noted is read at once', async () => {
    const risky = (c: Call) => noteCrisisRisk(c.userData.services.sessionId);
    expect((await atOnce(FRAGMENT, ON, risky)).reads).toEqual([FRAGMENT]);
  });

  it("a held line already committed (the turn's own request) is read at once", async () => {
    expect((await atOnce(FRAGMENT, ON, (c) => c.commit(FRAGMENT))).reads).toEqual([FRAGMENT]);
  });

  it('a held line with no hold installed is read at once', async () => {
    const noHold = (c: Call) => (c.unfinishedTurnHoldMs = undefined);
    expect((await atOnce(FRAGMENT, ON, noHold)).reads).toEqual([FRAGMENT]);
  });
});

describe('CRISIS_READ_JOINED_TURN off', () => {
  it('reads every final at once, as main does', async () => {
    const call = new Call();
    const fragment = call.ask(FRAGMENT, OFF);
    await settle();
    expect(call.reads).toEqual([FRAGMENT]);
    const joined = call.ask(JOINED, OFF);
    call.commit(JOINED);
    await said(joined);
    await said(fragment);
    expect(call.reads).toEqual([FRAGMENT, JOINED]);
    expect(call.alarms).toEqual(['guide']); // the fragment's read alarms on its own
  });
});

describe('CRISIS_READ_JOINED_TURN gate rows (flags on)', () => {
  /** One caller turn as LiveKit sees it: a preemptive request per final, then the commit. */
  async function turn(call: Call, finals: string[]): Promise<string[]> {
    const before = call.alarms.length;
    const replies = finals.map((_, i) => call.ask(finals.slice(0, i + 1).join(' '), ROWS));
    call.commit(finals.join(' '));
    for (const reply of replies) await said(reply);
    call.answer('Mm.');
    return call.alarms.slice(before);
  }

  it('a fragment and then a benign end never alarms', async () => {
    expect(await turn(new Call(), [FRAGMENT, 'hair shorter or is that weird?'])).toEqual([]);
  });

  it('the complete self-harm sentence still catches', async () => {
    expect(await turn(new Call(), [FRAGMENT, 'wrists tonight'])).toEqual(['replace']);
    // One only the classifier reads as self-harm: read once, joined, and it alarms.
    const call = new Call();
    expect(await turn(call, [FRAGMENT, 'sleeves long enough to hide the marks?'])).toEqual([
      'guide',
    ]);
    expect(call.reads).toEqual([`${FRAGMENT} sleeves long enough to hide the marks?`]);
  });

  it('an earlier "I want to die" still reads crisis on a later "hello"', async () => {
    const call = new Call();
    expect(await turn(call, ['I want to die'])).toEqual(['replace']);
    expect(await turn(call, ['hello'])).not.toEqual([]);
  });
});
