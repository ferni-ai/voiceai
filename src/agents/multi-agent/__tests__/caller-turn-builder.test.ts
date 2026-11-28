/**
 * The caller turn the pusher builds (caller-turn-builder.ts), and the live path that ties the
 * reply gate's read to it under CRISIS_HOLD_FOLLOWS_REPLY: session transcript events ->
 * attachTurnContextPusher -> createTurnIntelligenceHook (the handler's userData.callerTurnKey),
 * and the same name -> utils/crisis-memory-hold.ts callerTurnNoter -> the real startCrisisGate's
 * note (noteReplyGateTurn) -> replyGateTurnSettled. Only the turn handler is a spy. All lines
 * fictional.
 */
import { llm } from '@livekit/agents';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CRISIS_READ_WAIT,
  noteReplyGateTurn,
  replyGateTurnSettled,
} from '../../../utils/crisis-memory-hold.js';
import { startCrisisGate } from '../../personas/crisis-gate.js';
import { callerTurnKeyOf } from '../../shared/caller-turn-count.js';
import { callerTurnBuilder } from '../caller-turn-builder.js';
import {
  attachTurnContextPusher,
  createTurnIntelligenceHook,
  type TurnIntelligenceDeps,
} from '../turn-intelligence.js';

const ON = { CRISIS_HOLD_FOLLOWS_REPLY: 'on' };
const WAIT = { ...CRISIS_READ_WAIT };
let n = 0;

afterEach(() => void Object.assign(CRISIS_READ_WAIT, WAIT));

describe('callerTurnBuilder', () => {
  it('flag off: a turn opens at its first final, as before it; an interim opens nothing', () => {
    const turn = callerTurnBuilder(`builder-${++n}`, {});
    turn.heard();
    const first = turn.add('the bus was late');
    const second = turn.add(' again today ');
    expect(second).toEqual({ text: 'the bus was late again today', key: first.key });
    turn.end();
    turn.heard();
    const next = turn.add('anyway');
    expect(next.text).toBe('anyway');
    expect(next.key).not.toBe(first.key);
  });

  it("flag on: the turn's first interim opens and notes its name; every segment keeps it", async () => {
    Object.assign(CRISIS_READ_WAIT, { startMs: 200, settleMs: 200 });
    const sessionId = `builder-${++n}`;
    const turn = callerTurnBuilder(sessionId, ON);
    turn.heard(); // a preflight: the gate may read the turn now, before any final
    noteReplyGateTurn(sessionId, 'the bus was late', { escalation: null }, ON);
    turn.heard();
    const { key } = turn.add('the bus was late');
    expect(await replyGateTurnSettled(sessionId, key, 'the bus was late')).toBe(true);
    expect(turn.add('again').key).toBe(key);
    turn.end();
    const next = turn.add('the bus was late').key;
    expect(next).not.toBe(key);
    expect(await replyGateTurnSettled(sessionId, next, 'the bus was late')).toBe(false);
  });

  it('flag off: no name is noted, so no gate read counts for the turn', async () => {
    Object.assign(CRISIS_READ_WAIT, { startMs: 200, settleMs: 200 });
    const sessionId = `builder-${++n}`;
    const turn = callerTurnBuilder(sessionId, {});
    const { key } = turn.add('the bus was late');
    noteReplyGateTurn(sessionId, 'the bus was late', { escalation: null }, ON);
    expect(await replyGateTurnSettled(sessionId, key, 'the bus was late')).toBe(false);
  });
});

/** A session that emits LiveKit's events to the handlers the pusher attaches. */
function fakeSession() {
  const handlers = new Map<string, Array<(ev: unknown) => void>>();
  return {
    on: (event: string, handler: (ev: unknown) => void) =>
      void handlers.set(event, [...(handlers.get(event) ?? []), handler]),
    off: () => undefined,
    emit: (event: string, ev: unknown) => handlers.get(event)?.forEach((h) => h(ev)),
  };
}

const agent = {
  chatCtx: { copy: () => ({ items: [], addMessage: () => ({ id: 'note' }) }) },
  updateChatCtx: async () => undefined,
};

/**
 * The live path for one caller turn: a preflight segment, then the reply gate reads the line
 * (LiveKit's preemptive reply), then the final segment reaches the hook. Returns the name the
 * handler got and whether the gate's read of that turn settles clean for it.
 */
async function liveTurn(flag: 'on' | 'off') {
  Object.assign(CRISIS_READ_WAIT, { startMs: 300, settleMs: 300 });
  const sessionId = `live-turn-${++n}`;
  const env = { CRISIS_HOLD_FOLLOWS_REPLY: flag };
  const handled: Array<{ userData: object }> = [];
  const hook = createTurnIntelligenceHook({
    persona: { id: 'ferni', name: 'Ferni', displayName: 'Ferni' },
    services: { sessionId, userId: 'user-riley-test' },
    userData: { turnCount: 1 },
    handle: async (ctx: { userData: object }) => void handled.push(ctx),
  } as unknown as TurnIntelligenceDeps);
  const session = fakeSession();
  attachTurnContextPusher(hook, agent, session, { env, userData: { services: { sessionId } } });
  const line = 'the garden had a slow week';
  session.emit('user_input_transcribed', { transcript: line, isFinal: false });
  const chat = llm.ChatContext.empty();
  chat.addMessage({ role: 'user', content: line });
  const gate = startCrisisGate(
    chat,
    { services: { sessionId } },
    {
      env: { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live', ...env },
      generate: async () => '{"risk":"none","subject":"self"}',
    }
  );
  await gate?.escalation;
  session.emit('user_input_transcribed', { transcript: line, isFinal: true });
  await vi.waitFor(() => expect(handled).toHaveLength(1));
  const key = callerTurnKeyOf(handled[0].userData);
  const settled = await replyGateTurnSettled(sessionId, key, line);
  // The next caller turn: Ferni replied, a new final; the earlier read is not its read.
  session.emit('agent_state_changed', { newState: 'speaking' });
  session.emit('agent_state_changed', { newState: 'listening' });
  session.emit('user_input_transcribed', { transcript: line, isFinal: true });
  await vi.waitFor(() => expect(handled).toHaveLength(2));
  const nextKey = callerTurnKeyOf(handled[1].userData);
  const nextSettled = await replyGateTurnSettled(sessionId, nextKey, line);
  return { key, settled, nextKey, nextSettled };
}

describe('the live path names the turn on both sides (CRISIS_HOLD_FOLLOWS_REPLY)', () => {
  it("flag on: the gate's read before the first final counts for that turn, never the next", async () => {
    const t = await liveTurn('on');
    expect(t.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.settled).toBe(true);
    expect(t.nextKey).not.toBe(t.key);
    expect(t.nextSettled).toBe(false); // the same words, an earlier turn: held (fail closed)
  });

  it('flag off: the hook still names the turn, and the gate notes nothing for it', async () => {
    const t = await liveTurn('off');
    expect(t.key).toMatch(/^[0-9a-f-]{36}$/);
    expect(t.settled).toBe(false);
  });
});
