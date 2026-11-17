/**
 * CRISIS_GATE_TURN_READS: the reply gate weighs every classifier read of its turn, not only its
 * own. Through the real reply gate (startCrisisGate, gatedReply) and the real turn pipeline
 * (startTurnCrisis) on one call, with a stub classifier. All caller and Ferni lines are
 * fictional.
 *
 * Dev and prod logs, 2026-11-04..16: on one turn the gate's own read said none and the
 * pipeline's read of the same turn said imminent or crisis within half a second; the gate never
 * looked at the pipeline's read (it consults the turn's reads only once its own read escalates),
 * so the caller heard an ordinary reply with no crisis line. Two reads of a turn run as two
 * classifier calls whenever their inputs differ: a different Ferni line, a split turn, or a
 * different deadline.
 */
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { detectCrisis } from '../../../services/safety/crisis-guard.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { resetMinorCare } from '../../../utils/minor-care.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { gatedReply, startCrisisGate } from '../crisis-gate.js';
import { withTurnReads } from '../crisis-gate-turn-reads.js';

/**
 * The turn's other reads as the last describe sets them; unset, the real turnVerdicts. Only
 * that describe sets them, so every other row reads the turn's real kept reads.
 */
const others = vi.hoisted(() => ({
  reads: undefined as
    Array<import('../../../services/safety/index.js').CrisisVerdict | null> | undefined,
}));
vi.mock('../../../services/safety/index.js', async (orig) => {
  const real = await orig<typeof import('../../../services/safety/index.js')>();
  return {
    ...real,
    turnVerdicts: (...args: Parameters<typeof real.turnVerdicts>) =>
      others.reads ? Promise.resolve(others.reads) : real.turnVerdicts(...args),
  };
});

const R = (risk: string, subject = 'self') => JSON.stringify({ risk, subject });
const NONE = R('none');
const CRISIS = R('crisis');
const IMMINENT = R('imminent');
const FAILED = 'not json';

/** Main as in prod: the agreement gate keeps each turn's reads (turnVerdicts). */
const PROD = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
};
const ON = { ...PROD, CRISIS_GATE_TURN_READS: 'on' };
/** The flag with no agreement gate and no adjudicator: only the flag keeps the turn's reads. */
const ON_ALONE = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_GATE_TURN_READS: 'on',
};

const EARLIER = ['Hey Ferni.', 'Not much, a long week at work.'];
const FERNI = 'That sounds like a lot. What has been the hardest part?';
const RESUMED = 'Long weeks can pile up on you.';
/** No pattern reads these; only a classifier could. */
const EVERYDAY = 'Okay, I should head to bed soon';
const HALF_A = 'Honestly the hardest part is the nights';
const HALF_B = 'and I keep thinking about the bridge';
/** A check-in word the patterns do not read (crisis-timeout-checkin.ts). */
const RISK_ADJACENT = 'Some nights I feel unsafe in my own head';
/** Risk only a classifier reads, said before Ferni's paused reply; then words that carry none. */
const FIRST_RISK = 'I keep thinking about the bridge tonight';
const THEN = 'sorry, go on';
const PAUSED = 'Nights can feel so long.';
/** A line the patterns read as a plain crisis (the only one these rows use). */
const PATTERN_RISK = 'i want to kill myself';
const CUT_LINES = ['one', 'two', 'three', 'four', 'five', 'six'].map((w) => `line ${w}`);

let n = 0;
beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
  resetCallRiskSnapshots();
  resetMinorCare();
});
afterEach(() => vi.unstubAllEnvs());

const settle = () =>
  new Promise<void>((r) => {
    setTimeout(r, 5);
  });

interface Turn {
  /** The caller's words as the pipeline gets them (the whole turn). */
  words?: string;
  /** The request the gate reads; default: earlier, Ferni's line, the words. */
  ctx?: llm.ChatContext;
  /** The gate's read, then the pipeline's. */
  reads: [string, string];
  /** Delay before the pipeline's read answers. */
  pipelineMs?: number;
  env?: Record<string, string>;
}

/** How a reply of Ferni's ended: cut off, or still playing until `untilMs` after it started. */
interface Ended {
  interrupted?: boolean;
  untilMs?: number;
}
type Line = ['user' | 'assistant', string] | ['assistant', string, Ended];

/**
 * A request as LiveKit builds it: each message carries when it started (a caller line, when they
 * started speaking; a reply, when Ferni did) and is placed by that time. One line a second.
 */
function request(lines: readonly Line[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  const base = Date.now() - 60_000;
  ctx.addMessage({ role: 'system', content: 'You are Ferni.', createdAt: base });
  lines.forEach(([role, content, ended], i) => {
    const createdAt = base + (i + 1) * 1000;
    const stoppedSpeakingAt = ended?.untilMs ? (createdAt + ended.untilMs) / 1000 : undefined;
    ctx.addMessage({
      role,
      content,
      createdAt,
      interrupted: ended?.interrupted ?? false,
      ...(stoppedSpeakingAt
        ? { metrics: { startedSpeakingAt: createdAt / 1000, stoppedSpeakingAt } }
        : {}),
    } as Parameters<llm.ChatContext['addMessage']>[0]);
  });
  return ctx;
}
const before = (): Line[] => [...EARLIER.map((l): Line => ['user', l]), ['assistant', FERNI]];

/** What a read was given to classify (crisis-classifier.ts sends the normalized input as JSON). */
interface Seen {
  latest: string;
  earlier: string[];
  companion?: string;
}

/**
 * The gate alone on a turn (no pipeline read at all). Like the real prompt, its read judges the
 * LATEST words only: imminent when they hold the risk, none otherwise (EARLIER is context).
 */
async function gateAlone(ctx: llm.ChatContext, env: Record<string, string>) {
  const sent: Seen[] = [];
  const generate: CrisisGenerateFn = async (_prompt, content) => {
    const seen = JSON.parse(content) as Seen;
    sent.push(seen);
    return seen.latest.includes('bridge') ? IMMINENT : NONE;
  };
  const call = `turn-reads-alone-${++n}`;
  const gate = startCrisisGate(ctx, { services: { sessionId: call } }, { env, generate });
  const escalation = await gate?.escalation;
  return { decision: escalation ?? gate?.decision ?? null, sent };
}

const plain = (words: string) => request([...before(), ['user', words]]);

/** One caller turn through the real gate and the real pipeline, on one call. */
async function turn(t: Turn) {
  const words = t.words ?? EVERYDAY;
  const env = t.env ?? ON;
  const call = `turn-reads-${++n}`;
  const sent = { gate: [] as string[], pipeline: [] as string[] };
  const stub =
    (side: 'gate' | 'pipeline', r: string, ms = 0): CrisisGenerateFn =>
    async (_prompt, content) => {
      sent[side].push(content);
      if (ms) {
        await new Promise<void>((res) => {
          setTimeout(res, ms);
        });
      }
      return r;
    };
  const ctx = t.ctx ?? plain(words);
  const userData = { services: { sessionId: call } };
  const pipe = startTurnCrisis(
    words.toLowerCase(), // a transcript may differ in case: the two runs never share a call
    { recentTranscripts: [...EARLIER, words.toLowerCase()], lastAgentResponse: FERNI },
    { sessionId: call, env, generate: stub('pipeline', t.reads[1], t.pipelineMs) }
  );
  const gate = startCrisisGate(ctx, userData, { env, generate: stub('gate', t.reads[0]) });
  const [escalation] = await Promise.all([gate?.escalation, pipe.summary()]);
  await settle();
  return { decision: escalation ?? gate?.decision ?? null, sent, call, ctx, userData };
}

describe('CRISIS_GATE_TURN_READS: preconditions', () => {
  it('no pattern reads any line these rows use', () => {
    const lines = [EVERYDAY, HALF_A, HALF_B, `${HALF_A} ${HALF_B}`, RISK_ADJACENT];
    for (const line of [...lines, FIRST_RISK, THEN, PAUSED, ...CUT_LINES]) {
      expect(detectCrisis(line, undefined, { recentMessages: EARLIER }).isCrisis, line).toBe(false);
    }
    expect(detectCrisis(PATTERN_RISK, undefined, { recentMessages: EARLIER }).isCrisis).toBe(true);
  });
});

describe('CRISIS_GATE_TURN_READS: the gate weighs the pipeline read of its turn', () => {
  it('(a) gate none, pipeline imminent: on, the gate replaces; off, it passes as main', async () => {
    const off = await turn({ reads: [NONE, IMMINENT], env: PROD });
    expect(off.sent.gate).toHaveLength(1); // two calls: the rig got two reads
    expect(off.sent.pipeline).toHaveLength(1);
    expect(off.decision).toMatchObject({ action: 'pass' });
    const on = await turn({ reads: [NONE, IMMINENT] });
    expect(on.decision).toMatchObject({ action: 'replace' });
  });

  it('(a) gate none, pipeline crisis: on, the gate guides', async () => {
    const on = await turn({ reads: [NONE, CRISIS] });
    expect(on.decision).toMatchObject({ action: 'guide' });
  });

  it('(a) what the caller hears: the imminent script, with 988 and 911', async () => {
    vi.stubEnv('CRISIS_GATE_TURN_READS', 'on');
    const call = `turn-reads-heard-${++n}`;
    const gen =
      (r: string): CrisisGenerateFn =>
      async () =>
        r;
    startTurnCrisis(
      EVERYDAY.toLowerCase(),
      { recentTranscripts: [...EARLIER, EVERYDAY.toLowerCase()], lastAgentResponse: FERNI },
      { sessionId: call, env: ON, generate: gen(IMMINENT) }
    );
    const model = async () =>
      new ReadableStream<unknown>({
        start(c) {
          c.enqueue('Sleep well.');
          c.close();
        },
      });
    const out = await gatedReply(
      plain(EVERYDAY),
      { userData: { services: { sessionId: call } } } as never,
      model as never,
      { wrap: (s: ReadableStream<unknown>) => s } as never,
      { env: ON, generate: gen(NONE) as never }
    );
    let said = '';
    for await (const chunk of out as unknown as AsyncIterable<unknown>) said += String(chunk);
    expect(said).toMatch(/\b988\b/);
    expect(said).toMatch(/\b911\b/);
    expect(said).not.toContain('Sleep well.');
  });

  it("(b) a reply resumed inside the caller's turn: what each path sends, and on, the gate still replaces", async () => {
    // The gate's request as a paused reply leaves it: Ferni's resumed line committed between the
    // caller's two halves. The pipeline gets the whole turn.
    const ctx = request([...before(), ['user', HALF_A], ['assistant', RESUMED], ['user', HALF_B]]);
    const words = `${HALF_A} ${HALF_B}`;
    const off = await turn({ words, ctx, reads: [NONE, IMMINENT], env: PROD });
    const [gateSent] = off.sent.gate;
    const [pipeSent] = off.sent.pipeline;
    // Which side drops what: the gate reads only the half after Ferni's resumed line, answering
    // that line; the pipeline reads the whole turn, answering the line before it.
    expect(gateSent).toContain(HALF_B);
    expect(gateSent).toContain(RESUMED);
    expect(pipeSent).toContain(HALF_A.toLowerCase());
    expect(pipeSent).toContain(HALF_B.toLowerCase());
    expect(off.decision).toMatchObject({ action: 'pass' });
    const on = await turn({ words, ctx, reads: [NONE, IMMINENT] });
    expect(on.decision).toMatchObject({ action: 'replace' });
  });

  it('(a) the flag alone, no agreement gate or adjudicator: the pipeline read is kept and weighed', async () => {
    const off = await turn({
      reads: [NONE, IMMINENT],
      env: { ...ON_ALONE, CRISIS_GATE_TURN_READS: 'off' },
    });
    expect(off.decision).toMatchObject({ action: 'pass' });
    const on = await turn({ reads: [NONE, IMMINENT], env: ON_ALONE });
    expect(on.decision).toMatchObject({ action: 'replace' });
  });

  it('(c) the pipeline read answers after the gate read: on, the gate still replaces', async () => {
    const on = await turn({ reads: [NONE, IMMINENT], pipelineMs: 40 });
    expect(on.decision).toMatchObject({ action: 'replace' });
  });

  it('(d) the pipeline read fails, risk-adjacent words: the gentle check-in with 988, not a script', async () => {
    const env = { ...ON, CRISIS_TIMEOUT_CHECKIN: 'on' };
    const on = await turn({ words: RISK_ADJACENT, reads: [NONE, FAILED], env });
    expect(on.decision).toMatchObject({ action: 'guide' });
    const guidance = (on.decision as { guidance?: string }).guidance ?? '';
    expect(guidance).toContain('[SAFETY - CHECK-IN]');
    expect(guidance).toMatch(/\b988\b/);
  });

  it("(d) the pipeline read fails, everyday words: the gate's own decision stands (pass)", async () => {
    const env = { ...ON, CRISIS_TIMEOUT_CHECKIN: 'on' };
    const on = await turn({ words: EVERYDAY, reads: [NONE, FAILED], env });
    expect(on.decision).toMatchObject({ action: 'pass' });
  });

  it('off: every row decides as main', async () => {
    for (const reads of [
      [NONE, IMMINENT],
      [NONE, CRISIS],
      [NONE, FAILED],
      [NONE, NONE],
    ] as Array<[string, string]>) {
      const off = await turn({ reads, env: PROD });
      expect(off.decision).toMatchObject({ action: 'pass' });
    }
  });

  it('(e) no pipeline read, the risk before a paused reply: on, the gate alone reads it and replaces', async () => {
    // Ferni's reply to the first half was still playing when the caller went on.
    const ctx = request([
      ...before(),
      ['user', FIRST_RISK],
      ['assistant', PAUSED, { untilMs: 4000 }],
      ['user', THEN],
    ]);
    const off = await gateAlone(ctx, PROD);
    expect(off.sent).toHaveLength(1);
    // Main: the first half is only context, and the words answer the paused reply.
    expect(off.sent[0]).toMatchObject({ latest: THEN, companion: PAUSED });
    expect(off.sent[0].earlier).toContain(FIRST_RISK);
    expect(off.decision).toMatchObject({ action: 'pass' });
    const on = await gateAlone(ctx, ON);
    expect(on.sent[0]).toMatchObject({ latest: `${FIRST_RISK} ${THEN}`, companion: FERNI });
    expect(on.decision).toMatchObject({ action: 'replace' });
  });

  it('(e) no pipeline read, the risk before a reply the caller cut off: on, the gate replaces', async () => {
    const ctx = request([
      ...before(),
      ['user', FIRST_RISK],
      ['assistant', PAUSED, { interrupted: true }],
      ['user', THEN],
    ]);
    expect((await gateAlone(ctx, PROD)).decision).toMatchObject({ action: 'pass' });
    expect((await gateAlone(ctx, ON)).decision).toMatchObject({ action: 'replace' });
  });

  it('(e) a reply that finished before the caller went on still ends the turn, on and off', async () => {
    const ctx = request([
      ...before(),
      ['user', FIRST_RISK],
      ['assistant', PAUSED, { untilMs: 500 }],
      ['user', THEN],
    ]);
    for (const env of [PROD, ON]) {
      // Identical input on another call shares one classifier run (the run cache keys no call
      // unless CRISIS_IMMINENT_NEEDS_AGREEMENT is on): forget it, so each pass is read.
      resetCrisisClassifierCache();
      const read = await gateAlone(ctx, env);
      expect(read.sent[0]).toMatchObject({ latest: THEN, companion: PAUSED });
      expect(read.decision).toMatchObject({ action: 'pass' });
    }
  });

  it('(e) a long run of cut replies: on, the newest five caller lines, the risk in the newest', async () => {
    const lines = CUT_LINES;
    const ctx = request([
      ...before(),
      ...lines.flatMap((l): Line[] => [
        ['user', l],
        ['assistant', PAUSED, { interrupted: true }],
      ]),
      ['user', FIRST_RISK],
    ]);
    const on = await gateAlone(ctx, ON);
    expect(on.sent[0].latest).toBe([...lines.slice(-4), FIRST_RISK].join(' '));
    expect(on.sent[0].earlier).toContain(lines[1]); // older lines stay as context
    expect(on.sent[0].companion).toBeUndefined(); // the line they answered is not known
    expect(on.decision).toMatchObject({ action: 'replace' });
  });

  it('on: a turn every read calls none still passes', async () => {
    const on = await turn({ reads: [NONE, NONE] });
    expect(on.decision).toMatchObject({ action: 'pass' });
  });
});

describe('CRISIS_GATE_TURN_READS: patterns keep the latest line', () => {
  // Patterns read each line on its own turn already. Fed the whole turn, a cut-off crisis line
  // turned the next line into a crisis-line replace, which skips the classifier read, so an
  // imminent read lost 911 (the reply never-lower grid, "said, then cut off").
  it('across a cut-off crisis line, the pattern decision and what the caller hears are byte-equal off and on', async () => {
    const ctx = request([
      ...before(),
      ['user', PATTERN_RISK],
      ['assistant', PAUSED, { interrupted: true }],
      ['user', THEN],
    ]);
    for (const answer of [NONE, CRISIS, IMMINENT, FAILED]) {
      const gateOf = (env: Record<string, string>) => {
        resetCrisisClassifierCache();
        const call = `turn-reads-patterns-${++n}`;
        const generate: CrisisGenerateFn = async () => answer;
        return startCrisisGate(ctx, { services: { sessionId: call } }, { env, generate });
      };
      const off = gateOf(PROD);
      const offEscalation = await off?.escalation;
      const on = gateOf(ON);
      const onEscalation = await on?.escalation;
      expect(JSON.stringify(on?.decision), answer).toBe(JSON.stringify(off?.decision));
      expect(off?.decision.action, answer).toBe('pass'); // the latest line alone reads nothing
      // Every read here gets one answer, so on hears exactly what off hears: an emergency and a
      // crisis line are both a replace, so a rank check would miss a lost 911.
      expect(JSON.stringify(onEscalation ?? on?.decision), answer).toBe(
        JSON.stringify(offEscalation ?? off?.decision)
      );
    }
  });
});

describe('CRISIS_GATE_TURN_READS: the read the gate acts on', () => {
  const v = (risk: 'none' | 'crisis' | 'imminent', subject: 'self' | 'third_party' = 'self') =>
    ({ risk, subject }) as never;
  const INPUT = { latest: 'A fictional line.', earlier: [], companion: undefined } as never;
  /** What the gate acts on when its own read is `own` and the turn's other reads are `reads`. */
  const acted = (own: unknown, reads: unknown[]) => {
    others.reads = reads as never;
    return withTurnReads(Promise.resolve(own as never), 'call-strongest', INPUT, {});
  };
  afterEach(() => {
    others.reads = undefined;
  });
  it('the strongest risk wins, whichever read it is', async () => {
    expect(await acted(v('none'), [v('imminent')])).toEqual(v('imminent'));
    expect(await acted(v('crisis'), [v('none'), v('imminent')])).toEqual(v('imminent'));
    expect(await acted(v('imminent'), [v('crisis')])).toEqual(v('imminent'));
    expect(await acted(v('none'), [v('crisis'), null])).toEqual(v('crisis'));
  });
  it("imminent for someone else ranks with crisis, below the caller's own imminent", async () => {
    expect(await acted(v('imminent', 'third_party'), [v('imminent')])).toEqual(v('imminent'));
    const own = v('crisis');
    expect(await acted(own, [v('imminent', 'third_party')])).toBe(own);
  });
  it('no risk read, one failed: null (the timeout check-in decides), never a risk', async () => {
    expect(await acted(v('none'), [null])).toBeNull();
    expect(await acted(null, [v('none')])).toBeNull();
  });
  it("every read none: the gate's own read", async () => {
    const own = v('none');
    expect(await acted(own, [v('none')])).toBe(own);
    expect(await acted(own, [])).toBe(own);
  });
  it('no call scope, or no live read: the other reads are not consulted', async () => {
    others.reads = [v('imminent')];
    const own = v('none');
    expect(await withTurnReads(Promise.resolve(own), undefined, INPUT, {})).toBe(own);
    expect(await withTurnReads(Promise.resolve(undefined), 'call-strongest', INPUT, {})).toBe(
      undefined
    );
  });
});
