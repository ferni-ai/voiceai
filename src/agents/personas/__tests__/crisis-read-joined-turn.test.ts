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
import {
  crisisRiskThisCall,
  noteCrisisRisk,
  resetCrisisCallRisk,
} from '../../../services/safety/crisis-call-risk.js';
import {
  DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS,
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
/** A classifier with no fragment false alarm: risk only where the words carry it. */
const HONEST = [/wrists/i, /hide the marks/i, /want to die/i, /giving away my things/i];
/** A held line the classifier alone reads as risk (no pattern), then a joined one. */
const MARKS = `${FRAGMENT} sleeves long enough to hide the marks?`;
/** How long the session's hold holds the fragment (it ends on a dangling word). */
const HOLD_MS = unfinishedTurnHoldMs(FRAGMENT);

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

  constructor(
    readonly risky: readonly RegExp[] = RISKY,
    /** How long the classifier takes; Infinity never answers (its timeout decides). */
    readonly readMs = 0
  ) {
    super();
    this.on(CRISIS_GATE_SIGNAL, (ev: { action: string }) => this.alarms.push(ev.action));
  }

  /** The classifier: crisis for the bare fragment or a risky line in reach, none otherwise. */
  readonly generate: CrisisGenerateFn = async (_prompt, content) => {
    const { latest, earlier = [] } = JSON.parse(content) as { latest: string; earlier?: string[] };
    this.reads.push(latest);
    const risk = [latest, ...earlier].some((line) => this.risky.some((re) => re.test(line)));
    if (this.readMs === Infinity) return new Promise<string>(() => {});
    if (this.readMs > 0) {
      await new Promise<void>((r) => {
        setTimeout(r, this.readMs);
      });
    }
    return risk ? CRISIS : NONE;
  };

  /** Crisis risk noted for this call (crisis-call-risk.ts). */
  get risk(): boolean {
    return crisisRiskThisCall(this.userData.services.sessionId);
  }

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

  it('is read whole when the joined line is committed with no request (the call closed)', async () => {
    // LiveKit asks the LLM before it adds a line; a joined commit with no request has no reply.
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    call.commit(MARKS);
    await said(fragment);
    await settle();
    expect(call.reads).toEqual([MARKS]);
    expect(call.alarms).toEqual(['guide']);
    expect(call.risk).toBe(true);
  });

  it('is read whole, patterns first, when a pattern ends the closing line', async () => {
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    call.commit(`${FRAGMENT} wrists tonight`);
    await said(fragment);
    await settle();
    expect(call.alarms).toEqual(['replace']);
    expect(call.risk).toBe(true);
  });

  it('is read when the next final is longer but does not go on from it', async () => {
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    const revised = 'Could I cut my hair shorter?'; // speech-to-text revised the words
    const next = call.ask(revised, ON);
    call.commit(revised);
    await said(next);
    await said(fragment);
    expect(call.reads).toEqual([revised, FRAGMENT]);
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

  it('is read as it is once the hold runs out, before any commit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const call = new Call();
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    await vi.advanceTimersByTimeAsync(HOLD_MS - 1);
    expect(call.reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await said(fragment);
    expect(call.reads).toEqual([FRAGMENT]);
    expect(call.alarms).toEqual(['guide']);
  });

  it('never waits past the ceiling, however long the hold (fail closed)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const call = new Call();
    call.unfinishedTurnHoldMs = () => 60_000;
    const fragment = call.ask(FRAGMENT, ON);
    await settle();
    await vi.advanceTimersByTimeAsync(CEILING_MS - 1);
    expect(call.reads).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(CEILING_MS).toBeLessThanOrEqual(3000); // a held reply never waits longer than 3 s
    await said(fragment);
    expect(call.reads).toEqual([FRAGMENT]);
  });

  it('holds the reply after the commit no longer than the classifier timeout, as main', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const released = async (env: Record<string, string>) => {
      resetCrisisClassifierCache();
      const call = new Call(RISKY, Infinity); // the classifier never answers
      const reply = said(call.ask(FRAGMENT, env)).then(() => Date.now());
      await vi.advanceTimersByTimeAsync(HOLD_MS); // the hold runs out
      const committedAt = Date.now();
      call.commit(FRAGMENT);
      await vi.advanceTimersByTimeAsync(CEILING_MS);
      const after = Math.max(0, (await reply) - committedAt);
      return { after, alarms: call.alarms, risk: call.risk };
    };
    const off = await released(OFF);
    const on = await released(ON);
    expect(off.after).toBe(0); // main's read timed out before the commit
    expect(on.after).toBe(DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS);
    expect({ ...on, after: 0 }).toEqual({ ...off, after: 0 }); // the same timeout outcome
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

  it('a line the session hold answers at once is read at once', async () => {
    const noWait = (c: Call) => (c.unfinishedTurnHoldMs = () => 0);
    expect((await atOnce(FRAGMENT, ON, noWait)).reads).toEqual([FRAGMENT]);
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

/**
 * Never lower than off (crisis-all-flags-never-lower.test.ts points here): with a classifier
 * that has no fragment false alarm, every way a held line can settle notes call risk and a
 * decision at least as strong as off, and a line that gets no reply is read as often.
 * Model-free: the classifier is a stub.
 */
describe('CRISIS_READ_JOINED_TURN never lowers a crisis read', () => {
  const RANK = ['pass', 'guide', 'replace'];
  const strongest = (alarms: string[]) => Math.max(0, ...alarms.map((a) => RANK.indexOf(a)));

  /** One caller turn, step by step: 'ask' a final, 'commit' a line, or let the hold run out. */
  type Step = ['ask' | 'commit', string] | ['hold'];
  async function run(steps: Step[], env: Record<string, string>, risky = HONEST) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    resetCrisisClassifierCache();
    const call = new Call(risky);
    const replies: Promise<string>[] = [];
    let asked = '';
    for (const step of steps) {
      if (step[0] === 'ask') replies.push(said(call.ask((asked = step[1]), env)));
      else if (step[0] === 'commit') call.commit(step[1]);
      else await vi.advanceTimersByTimeAsync(unfinishedTurnHoldMs(asked));
      await settle();
    }
    await vi.advanceTimersByTimeAsync(CEILING_MS);
    await Promise.all(replies);
    await settle();
    return { reads: call.reads.length, strongest: strongest(call.alarms), risk: call.risk };
  }

  const ROWS: Record<string, Step[]> = {
    'joined commit with no request (classifier only)': [
      ['ask', FRAGMENT],
      ['commit', MARKS],
    ],
    'joined commit with no request (pattern)': [
      ['ask', FRAGMENT],
      ['commit', `${FRAGMENT} wrists tonight`],
    ],
    'joined request, then its commit': [
      ['ask', FRAGMENT],
      ['ask', MARKS],
      ['commit', MARKS],
    ],
    'risky held line, hold runs out': [
      ['ask', "I've been giving away my things"],
      ['hold'],
      ['commit', "I've been giving away my things"],
    ],
    'risky held line, caller goes on': [
      ['ask', "I've been giving away my things"],
      ['ask', "I've been giving away my things to friends lately"],
      ['commit', "I've been giving away my things to friends lately"],
    ],
    'benign held line, hold runs out': [['ask', FRAGMENT], ['hold'], ['commit', FRAGMENT]],
  };

  // Both classifiers: one with no fragment false alarm, and one like prod's, which has it.
  const STUBS = { honest: HONEST, 'fragment alarm': RISKY };
  for (const [name, steps] of Object.entries(ROWS)) {
    for (const [stub, risky] of Object.entries(STUBS)) {
      it(`${name} (${stub})`, async () => {
        const off = await run(steps, OFF, risky);
        const on = await run(steps, ON, risky);
        expect(Number(on.risk)).toBeGreaterThanOrEqual(Number(off.risk));
        expect(on.strongest).toBeGreaterThanOrEqual(off.strongest);
      });
    }
  }

  it('reads the closing joined line as often as off, with equal risk', async () => {
    const steps: Step[] = [
      ['ask', FRAGMENT],
      ['commit', MARKS],
    ];
    // The prod classifier: the fragment alone and the joined line both read as crisis.
    expect(await run(steps, OFF, RISKY)).toEqual({ reads: 1, strongest: 1, risk: true });
    expect(await run(steps, ON, RISKY)).toEqual({ reads: 1, strongest: 1, risk: true });
    // With no fragment false alarm, off never reads the joined line at all; on does.
    expect(await run(steps, OFF)).toEqual({ reads: 1, strongest: 0, risk: false });
    expect(await run(steps, ON)).toEqual({ reads: 1, strongest: 1, risk: true });
  });
});
