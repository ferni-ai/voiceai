import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearAfterCallTasks,
  drainAfterCallTasks,
  registerAfterCallTask,
  registeredAfterCallTasks,
  runAfterCallTasks,
} from '../../../services/session/after-call-tasks.js';
import { installMoveLog, noteMove, noteTurn, takeMoveLog, type ReplyEntry } from '../move-log.js';
import type { TurnShape } from '../turn-shape.js';
import { gatedReply } from '../crisis-gate.js';
import {
  buildMoveOutcomeRecord,
  moveOutcomesTask,
  type MoveOutcomeRecord,
  type MoveOutcomeStore,
} from '../move-outcomes.js';

const PATTERNS_ONLY = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'off' };
const FLAGS = ['MOVE_OUTCOMES', 'LAUGH_ALONG', 'CANDOR'] as const;
const before = Object.fromEntries(FLAGS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  process.env.LAUGH_ALONG = 'on';
  process.env.CANDOR = 'on';
});
afterEach(() => {
  for (const k of FLAGS) {
    if (before[k] === undefined) delete process.env[k];
    else process.env[k] = before[k];
  }
  clearAfterCallTasks();
});

type Handler = (...args: unknown[]) => void;

/** An AgentSession as far as the move log and the reply path read it. */
function fakeSession() {
  const listeners: Array<{ event: string; handler: Handler }> = [];
  const session = {
    userData: undefined,
    on: (event: string, handler: Handler) => listeners.push({ event, handler }),
    /** Ferni's reply committed to the chat, as LiveKit emits it. */
    say(text: string, interrupted = false) {
      for (const l of listeners)
        if (l.event === 'conversation_item_added')
          l.handler({
            item: { type: 'message', role: 'assistant', textContent: text, interrupted },
          });
    },
  };
  return session;
}

const history: Array<['user' | 'assistant', string]> = [];
function request(): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of history) ctx.addMessage({ role, content });
  return ctx;
}

/** One request through the live reply path (llmNode -> gatedReply -> withTurnReminder). */
async function ask(session: ReturnType<typeof fakeSession>, said: string): Promise<void> {
  if (history.at(-1)?.[0] === 'user') history.pop(); // a final request extending the preemptive
  history.push(['user', said]);
  for (const w of said.toLowerCase().match(/[a-z]{4,}/g) ?? []) callerWords.add(w);
  const model = vi.fn(
    async () =>
      new ReadableStream<string>({
        start: (c) => {
          c.enqueue('ok');
          c.close();
        },
      })
  );
  const opener = { wrap: (s: ReadableStream<unknown>) => s };
  await gatedReply(request(), session, model as never, opener as never, { env: PATTERNS_ONLY });
}
function reply(session: ReturnType<typeof fakeSession>, text: string, interrupted = false): void {
  history.push(['assistant', text]);
  session.say(text, interrupted);
}

function storeSpy(): MoveOutcomeStore & { saved: MoveOutcomeRecord[]; uids: string[] } {
  const saved: MoveOutcomeRecord[] = [];
  const uids: string[] = [];
  return {
    saved,
    uids,
    async save(userId, _sessionId, record) {
      uids.push(userId);
      saved.push(record);
    },
  };
}

/** Every word of four or more letters the caller said, across the call. */
const callerWords = new Set<string>();

async function call(sessionId: string, store: MoveOutcomeStore): Promise<void> {
  history.length = 0;
  const session = fakeSession();
  installMoveLog(session, sessionId, session, []);
  // Preemptive then final request for the first turn: one entry.
  await ask(session, 'haha my dog Biscuit');
  await ask(session, 'haha my dog Biscuit ate my sock again');
  reply(session, '[laughter] Again? What is it with Biscuit and socks?');
  noteMove(session, 'backchannel');
  await ask(
    session,
    'Honestly I feel kind of lonely since I moved to Denver, I do not really know anyone here yet and the weekends are long'
  );
  reply(session, 'That is a lot of quiet. Does Biscuit at least get you out walking?', true);
  await ask(session, 'yeah he does, okay I have to go, bye');
  reply(session, 'Bye, talk soon.');
  registerAfterCallTask(
    'move-outcomes',
    moveOutcomesTask(store, () => Date.now())
  );
  runAfterCallTasks({
    userId: 'u1',
    sessionId,
    turns: [],
    startedAt: new Date(Date.now() - 200_000),
  });
  await drainAfterCallTasks(1000);
}

describe('move outcomes (MOVE_OUTCOMES)', () => {
  it('records the moves each reply made and what the caller did next', async () => {
    process.env.MOVE_OUTCOMES = 'on';
    const store = storeSpy();
    await call('s-on', store);

    expect(store.saved).toHaveLength(1);
    expect(store.uids).toEqual(['u1']);
    const rec = store.saved[0];
    expect(rec.turns).toHaveLength(3);
    const [first, second, last] = rec.turns;
    const ids = (t: (typeof rec.turns)[number]) => t.moves.map((m) => m.id);
    // Asked for by the reminder (laugh along), and seen in what he said.
    expect(ids(first)).toEqual(
      expect.arrayContaining(['laugh_along', 'laughed', 'asked', 'backchannel'])
    );
    // Tagged with the STYLE_PROFILE knob each one went through; untagged otherwise.
    expect(first.moves).toEqual(
      expect.arrayContaining([
        { id: 'laugh_along', w3Knob: 'laugh' },
        { id: 'candor', w3Knob: 'pushback' },
        { id: 'asked' },
        { id: 'backchannel' },
      ])
    );
    // TURN_SHAPE=model (the default): the model picks the length.
    expect(rec.turns.map((t) => t.replyLength)).toEqual(['default', 'default', 'default']);
    // Went on longer and opened up; cut off; the call ended.
    expect(rec.turns.map((t) => t.success)).toEqual([1, 0, null]);
    expect(first.bargeIn).toBe(0);
    expect(first.next).toMatchObject({ disclosure: 1, laughed: 0, dropped: 0 });
    expect(first.next!.lenRatio).toBeGreaterThan(2);
    // Biscuit came back from an earlier turn; the caller cut this reply off.
    expect(ids(second)).toContain('callback');
    expect(ids(first)).not.toContain('callback');
    expect(second.bargeIn).toBe(1);
    expect(second.next!.lenRatio).toBeLessThan(1);
    expect(last.next).toBeNull();
    expect(rec.call).toMatchObject({
      callerTurns: 3,
      endedWithGoodbye: true,
      earlyHangup: false,
      calledBackWithin7d: null,
    });
    expect(rec.call.durationSec).toBeGreaterThanOrEqual(199);
  });

  it('never stores the caller’s words', async () => {
    process.env.MOVE_OUTCOMES = 'on';
    const store = storeSpy();
    await call('s-words', store);
    const stored = new Set(
      JSON.stringify(store.saved[0])
        .toLowerCase()
        .match(/[a-z]+/g)
    );
    expect(callerWords.size).toBeGreaterThan(15);
    expect([...callerWords].filter((w) => stored.has(w))).toEqual([]);
  });

  it('keeps a crisis script out of the previous reply’s moves', async () => {
    process.env.MOVE_OUTCOMES = 'on';
    history.length = 0;
    const session = fakeSession();
    installMoveLog(session, 's-crisis', session, []);
    await ask(session, 'long week at work honestly');
    reply(session, 'Long, huh.');
    await ask(session, 'I want to kill myself tonight');
    reply(session, 'I am really glad you told me. Are you safe right now?');
    const moveLog = takeMoveLog('s-crisis')!;
    expect(moveLog.entries).toHaveLength(2);
    expect(moveLog.entries[0].replyWords).toBe(2);
    expect(moveLog.entries[0].moves).not.toContain('asked');
    expect(moveLog.entries[1].moves).toEqual(['asked']);
  });

  it('logs the reply length the shape drew', () => {
    process.env.MOVE_OUTCOMES = 'on';
    const session = fakeSession();
    installMoveLog(session, 's-len', session, []);
    const shaped = (shape: TurnShape['shape']): TurnShape =>
      ({ move: 'share', shape, reminder: '', extras: [] }) as TurnShape;
    const turns: Array<TurnShape | undefined> = [
      shaped('react'),
      shaped('one'),
      shaped('answer'),
      shaped('full'),
      undefined,
    ];
    turns.forEach((turn, i) => {
      noteTurn(session, `turn ${i}`, turn);
      session.say('ok');
    });
    expect(takeMoveLog('s-len')!.entries.map((e) => e.replyLength)).toEqual([
      'short',
      'short',
      'default',
      'long',
      'default',
    ]);
  });

  it('counts a reply a success only when they went on, with no barge-in or drop', () => {
    const turn = (words: number, extra: Partial<ReplyEntry> = {}, dropped = false): ReplyEntry => ({
      moves: [],
      replyLength: 'default',
      caller: { words, disclosure: false, laughed: false, dropped, goodbye: false },
      replied: true,
      bargedIn: false,
      replyWords: 5,
      ...extra,
    });
    const success = (entries: ReplyEntry[]) =>
      buildMoveOutcomeRecord(
        { sessionId: 's', startedAt: 0, entries, last: '', earlier: new Set(), current: new Set() },
        0,
        1000
      ).turns[0].success;
    expect(success([turn(10), turn(12)])).toBe(1);
    expect(success([turn(10), turn(6)])).toBe(0);
    expect(success([turn(10, { bargedIn: true }), turn(12)])).toBe(0);
    expect(success([turn(10), turn(12, {}, true)])).toBe(0);
    expect(success([turn(10)])).toBeNull();
  });

  it('records nothing with the flag off', async () => {
    const store = storeSpy();
    await call('s-off', store);
    expect(store.saved).toHaveLength(0);
    expect(takeMoveLog('s-off')).toBeUndefined();
  });

  it('is registered as an after-call task by the executor’s register file', async () => {
    expect(registeredAfterCallTasks()).not.toContain('move-outcomes');
    vi.resetModules();
    const tasks = await import('../../../services/session/after-call-tasks.js');
    await import('../../after-call-register.js');
    expect(tasks.registeredAfterCallTasks()).toContain('move-outcomes');
  });
});
