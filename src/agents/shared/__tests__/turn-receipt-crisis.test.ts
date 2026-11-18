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
import { decisionFor, gatedReply } from '../../personas/crisis-gate.js';
import { startTurnCrisis } from '../../processors/turn-processor/turn-crisis.js';
import { crisisKindOf } from '../../safety/crisis-event-record.js';
import type { TurnReceipt } from '../turn-receipt.js';
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

  /** One caller turn: committed, read by the pipeline if asked, replied through the gate. */
  async function turn(
    said: string,
    env: Record<string, string>,
    o: { generate?: CrisisGenerateFn; pipeline?: boolean; requests?: number; cut?: boolean } = {}
  ): Promise<string> {
    session.emit('metrics_collected', {
      metrics: { type: 'eou_metrics', endOfUtteranceDelayMs: 300, lastSpeakingTimeMs: Date.now() },
    });
    const generate = o.generate ?? READS_CRISIS;
    if (o.pipeline) await startTurnCrisis(said, undefined, { sessionId, env, generate }).summary();
    const ctx = llm.ChatContext.empty();
    ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
    ctx.addMessage({ role: 'user', content: said });
    const model = async () => streamOf(MODEL_SAYS);
    const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
    let spoken = '';
    for (let i = 0; i < (o.requests ?? 1); i++) {
      spoken = '';
      const reply = await gatedReply(ctx, session, model as never, opener as never, {
        env,
        generate,
      });
      if (reply)
        for await (const chunk of reply as unknown as AsyncIterable<string>) spoken += chunk;
    }
    state('speaking', 'thinking');
    session.emit('conversation_item_added', {
      item: llm.ChatMessage.create({ role: 'assistant', content: spoken, interrupted: !!o.cut }),
    });
    state('listening', 'speaking');
    return spoken;
  }
  return { sessionId, turn };
}

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
    const spoken = await c.turn(SCRIPT_LINE, PATTERNS);
    expect(names988(spoken) || names911(spoken)).toBe(true); // the script was spoken
    const field = receipts()[0]!.crisis;
    expect(field).toMatchObject({
      engine: 'gate',
      tier: 'block',
      reply: names911(spoken) ? 'script911' : 'script988',
      said988: names988(spoken),
      said911: names911(spoken),
      delivered: 'full',
    });
    expect(field.kind).toEqual(crisisKindOf(detectCrisis(SCRIPT_LINE))); // enums, never words
  });

  it('a script cut by the caller is delivered "cut"', async () => {
    const c = openCall();
    await c.turn(SCRIPT_LINE, PATTERNS, { cut: true });
    expect(receipts()[0]!.crisis.delivered).toBe('cut');
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
