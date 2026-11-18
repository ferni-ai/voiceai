/**
 * The TURN_RECEIPT's words-free `crisis` field, through the real reply gate (gatedReply),
 * turn pipeline (startTurnCrisis) and receipt recorder; the CRISIS_CLASSIFIER line and the
 * crisis override line carry the call and its turn. Every logger call is captured, and no
 * caller or reply words may reach any of them. All people and lines are fictional.
 */
import { EventEmitter } from 'node:events';
import { ReadableStream } from 'node:stream/web';
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { detectCrisis, guardFromDetection } from '../../../services/safety/crisis-guard.js';
import { names911, names988 } from '../../../services/safety/crisis-line-speech.js';
import {
  GROUNDED_LIGHT_TOUCH,
  SCREEN_GENTLE_OFFER,
  SOFT_CRISIS_CHECK,
  TIMEOUT_CHECKIN,
} from '../../../services/safety/index.js';
import { decisionFor, gatedReply } from '../../personas/crisis-gate.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { crisisKindOf } from '../../safety/crisis-event-record.js';
import { noteGateDecision } from '../../safety/crisis-turn-note.js';
import type { TurnReceipt } from '../turn-receipt.js';
import { noteCrisisTurn } from '../turn-receipt-crisis.js';
import { attachTurnReceipts } from '../turn-receipt-session.js';

const { logged } = vi.hoisted(() => ({ logged: [] as unknown[][] }));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/safe-logger.js')>();
  const record = (...args: unknown[]): void => void logged.push(args);
  const logger = { debug: record, info: record, warn: record, error: record, child: () => logger };
  return {
    ...actual,
    createLogger: () => logger,
    getLogger: () => logger,
    safeLog: () => logger,
    default: () => logger,
  };
});

// Planted, invented words: neither may appear in any captured log line.
const CALLER_MARK = 'marmalade lighthouse';
const REPLY_MARK = 'zebra quartz harbor';
const GUIDE_LINE = `riley test here by the ${CALLER_MARK}, i wish i could just disappear and never wake up`;
const SCRIPT_LINE = `by the ${CALLER_MARK} i'm going to kill myself tonight`;
const COLLAPSE_LINE = `my friend just collapsed by the ${CALLER_MARK} and isn't breathing`;
const ORDINARY_LINE = `what should I cook tonight at the ${CALLER_MARK}?`;
const MODEL_SAYS = `Try the ${REPLY_MARK} pasta.`;

const PATTERNS = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };
const READS_CRISIS: CrisisGenerateFn = async () => '{"risk":"crisis","subject":"self"}';
const READS_NONE: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';

let calls = 0;
beforeEach(() => {
  logged.length = 0;
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});

const streamOf = (text: string): ReadableStream<unknown> =>
  new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });

/** A session double carrying its call id, with the real receipt recorder attached. */
function openCall() {
  const sessionId = `RM_crisis_receipt_${++calls}`;
  const session = Object.assign(new EventEmitter(), { userData: { services: { sessionId } } });
  attachTurnReceipts(session as never, {
    sessionId,
    userId: 'u-riley-test',
    persona: () => 'ferni',
    env: {},
  });
  const state = (newState: string, oldState?: string) =>
    session.emit('agent_state_changed', { oldState, newState });

  /** The caller's turn ends (end of utterance). */
  const commit = () =>
    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 300, lastSpeakingTimeMs: Date.now() },
    });
  /** The gate's reply to `said`: the held stream, unread. */
  const ask = (said: string, env: Record<string, string>, generate: CrisisGenerateFn) => {
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'user', content: said });
    const model = async () => streamOf(MODEL_SAYS);
    const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
    return gatedReply(ctx, session, model as never, opener as never, { env, generate });
  };
  /** The reply reaches the history and the agent listens again: the turn's receipt. */
  const finish = (spoken: string, cut = false) => {
    state('speaking', 'thinking');
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'assistant', content: spoken, interrupted: cut }),
    });
    state('listening', 'speaking');
  };

  /** One caller turn: committed, read by the pipeline if asked, replied through the gate. */
  async function turn(
    said: string,
    env: Record<string, string>,
    o: { generate?: CrisisGenerateFn; pipeline?: boolean; requests?: number; cut?: boolean } = {}
  ): Promise<string> {
    commit();
    const generate = o.generate ?? READS_CRISIS;
    if (o.pipeline) await startTurnCrisis(said, undefined, { sessionId, env, generate }).summary();
    let spoken = '';
    for (let i = 0; i < (o.requests ?? 1); i++) spoken = await read(await ask(said, env, generate));
    finish(spoken, o.cut);
    return spoken;
  }
  return { sessionId, session, turn, commit, ask, finish };
}

const read = async (reply: ReadableStream<unknown> | null): Promise<string> => {
  let spoken = '';
  if (reply) for await (const chunk of reply as unknown as AsyncIterable<string>) spoken += chunk;
  return spoken;
};

const records = (msg: string) =>
  logged.filter((args) => args[1] === msg).map((args) => args[0] as Record<string, unknown>);
const receipts = () => records('TURN_RECEIPT') as unknown as TurnReceipt[];
const overrides = () => records('🚨 CRISIS DETECTED - Overriding response');

describe('the fictional lines read as each test needs (preconditions)', () => {
  it('patterns guide GUIDE_LINE, replace SCRIPT_LINE and pass ORDINARY_LINE', () => {
    expect(decisionFor(detectCrisis(GUIDE_LINE), GUIDE_LINE).action).toBe('guide');
    expect(decisionFor(detectCrisis(SCRIPT_LINE), SCRIPT_LINE).action).toBe('replace');
    expect(decisionFor(detectCrisis(ORDINARY_LINE), ORDINARY_LINE).action).toBe('pass');
  });

  it('the 988 script names 988 only; the third-person collapse script names 911 only', () => {
    const scriptOf = (line: string) =>
      (decisionFor(detectCrisis(line), line) as { script?: string }).script ?? '';
    expect([names988(scriptOf(SCRIPT_LINE)), names911(scriptOf(SCRIPT_LINE))]).toEqual([
      true,
      false,
    ]);
    expect([names988(scriptOf(COLLAPSE_LINE)), names911(scriptOf(COLLAPSE_LINE))]).toEqual([
      false,
      true,
    ]);
  });
});

describe('TURN_RECEIPT crisis field', () => {
  it('an ordinary turn: no engine, an ordinary reply, no line named', async () => {
    const c = openCall();
    await c.turn(ORDINARY_LINE, PATTERNS, { pipeline: true });
    expect(receipts()[0]).toMatchObject({ sessionId: c.sessionId, turn: 1 });
    expect(receipts()[0]!.crisis).toEqual({
      engine: 'none',
      tier: 'none',
      reply: 'ordinary',
      kind: null,
      said988: false,
      said911: false,
      delivered: null,
    });
  });

  it('a guidance turn: both engines read it, the gate guided the reply, delivered', async () => {
    const c = openCall();
    const spoken = await c.turn(GUIDE_LINE, PATTERNS, { pipeline: true });
    expect(receipts()[0]!.crisis).toEqual({
      engine: 'both',
      tier: 'crisis',
      reply: 'guidance',
      kind: null,
      said988: names988(spoken),
      said911: names911(spoken),
      delivered: 'full',
    });
  });

  it('a script turn: the gate replaced the reply; its kind and the lines it named', async () => {
    const c = openCall();
    await c.turn(SCRIPT_LINE, PATTERNS);
    const field = receipts()[0]!.crisis;
    expect(field).toMatchObject({
      engine: 'gate',
      tier: 'block',
      reply: 'script988',
      said988: true,
      said911: false,
      delivered: 'full',
    });
    expect(field.kind).toEqual(crisisKindOf(detectCrisis(SCRIPT_LINE))); // enums, never words
  });

  it('a third-person collapse: the 911 script, counted as 911 and never as 988', async () => {
    const c = openCall();
    await c.turn(COLLAPSE_LINE, PATTERNS);
    expect(receipts()[0]!.crisis).toMatchObject({
      engine: 'gate',
      tier: 'block',
      reply: 'script911',
      said911: true,
      said988: false,
      delivered: 'full',
    });
  });

  it.each([
    [SOFT_CRISIS_CHECK, 'softCheck'],
    [GROUNDED_LIGHT_TOUCH, 'directCheck'],
    [SCREEN_GENTLE_OFFER, 'gentleOffer'],
    [TIMEOUT_CHECKIN, 'checkin'],
    ['[SAFETY] crisis guidance of its own', 'guidance'],
  ])('check-in guidance %# gets its own reply class', (guidance, replyClass) => {
    const c = openCall();
    c.commit();
    noteGateDecision(c.session, { action: 'guide', guidance }, 'pattern');
    c.finish('Okay.');
    expect(receipts()[0]!.crisis).toMatchObject({
      engine: 'gate',
      tier: 'crisis',
      reply: replyClass,
    });
  });

  it('a classifier read that settles after the next commit stays on its own turn', async () => {
    const c = openCall();
    let answer: (verdict: string) => void = () => undefined;
    const pending = new Promise<string>((resolve) => {
      answer = resolve;
    });
    c.commit();
    const held = await c.ask(ORDINARY_LINE, LIVE, () => pending); // the reply waits on the read
    c.finish(''); // the caller barged in: turn 1's receipt; turn 2 is open
    answer('{"risk":"crisis","subject":"self"}');
    await read(held);
    await c.turn('thanks, see you', PATTERNS);
    const reads = records('CRISIS_CLASSIFIER');
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(r).toMatchObject({ sessionId: c.sessionId, turn: 1 });
    expect(receipts().map((r) => [r.turn, r.crisis.engine, r.crisis.reply])).toEqual([
      [1, 'none', 'ordinary'],
      [2, 'none', 'ordinary'],
    ]);
  });

  it('a script cut by the caller is delivered "cut"', async () => {
    const c = openCall();
    await c.turn(SCRIPT_LINE, PATTERNS, { cut: true });
    expect(receipts()[0]!.crisis.delivered).toBe('cut');
  });

  it('a read that settles after the next commit is not credited to the new turn', async () => {
    const c = openCall();
    await c.turn('hello there', PATTERNS); // turn 1 done; turn 2 is open
    noteCrisisTurn(c.sessionId, 1, { engine: 'pipeline', tier: 'block' }); // turn 1's, late
    noteCrisisTurn(c.sessionId, 2, { engine: 'pipeline', tier: 'crisis' }); // turn 2's own
    await c.turn('thanks, see you', PATTERNS);
    expect(receipts()[1]).toMatchObject({
      turn: 2,
      crisis: { engine: 'pipeline', tier: 'crisis' },
    });
  });

  it('a classifier escalation guides the reply; a later turn starts clean', async () => {
    const c = openCall();
    await c.turn(ORDINARY_LINE, LIVE, { generate: READS_CRISIS });
    await c.turn('thanks, see you', PATTERNS);
    expect(receipts().map((r) => [r.turn, r.crisis.engine, r.crisis.reply])).toEqual([
      [1, 'gate', 'guidance'],
      [2, 'none', 'ordinary'],
    ]);
  });
});

describe('CRISIS_CLASSIFIER, CRISIS_HOLD and the override line join their turn', () => {
  it('each classifier read carries the call and the turn of its receipt', async () => {
    const c = openCall();
    await c.turn('hello there', PATTERNS);
    await c.turn(ORDINARY_LINE, LIVE, { generate: READS_CRISIS });
    const reads = records('CRISIS_CLASSIFIER');
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read).toMatchObject({ sessionId: c.sessionId, turn: 2 });
  });

  it('a held reply released by the classifier logs CRISIS_HOLD with the call and turn', async () => {
    const c = openCall();
    await c.turn('hello there', PATTERNS);
    await c.turn(ORDINARY_LINE, LIVE, { generate: READS_NONE });
    const holds = records('CRISIS_HOLD');
    expect(holds).toHaveLength(1);
    expect(holds[0]).toEqual({ sessionId: c.sessionId, turn: 2, delayedMs: expect.any(Number) });
  });

  it('logs once per replaced turn, however many requests the turn gated', async () => {
    const c = openCall();
    await c.turn(SCRIPT_LINE, PATTERNS, { requests: 2 }); // a preemptive request, then the final
    await c.turn(GUIDE_LINE, PATTERNS); // guided, not replaced
    await c.turn(SCRIPT_LINE, PATTERNS);
    expect(overrides().map((o) => [o.sessionId, o.turn, o.reader])).toEqual([
      [c.sessionId, 1, 'pattern'],
      [c.sessionId, 3, 'pattern'],
    ]);
  });

  it('asking whether a detection replaces the reply logs nothing', () => {
    expect(guardFromDetection(detectCrisis(SCRIPT_LINE)).shouldBlock).toBe(true);
    expect(overrides()).toEqual([]);
  });
});

describe('no words reach the log', () => {
  it('neither the caller nor the reply words appear in any captured line', async () => {
    const c = openCall();
    await c.turn(ORDINARY_LINE, PATTERNS, { pipeline: true });
    await c.turn(GUIDE_LINE, LIVE, { pipeline: true });
    await c.turn(SCRIPT_LINE, LIVE, { pipeline: true });
    await c.turn(ORDINARY_LINE, LIVE, { generate: READS_CRISIS });
    await c.turn(ORDINARY_LINE, LIVE, { generate: READS_NONE });
    const all = JSON.stringify(logged);
    // The capture is not empty: every line this file adds was written.
    expect(receipts().length).toBe(5);
    expect(records('CRISIS_HOLD').length).toBe(1);
    expect(records('CRISIS_CLASSIFIER').length).toBeGreaterThan(0);
    expect(overrides().length).toBe(1);
    expect(all).not.toContain(CALLER_MARK);
    expect(all).not.toContain(REPLY_MARK);
  });
});
