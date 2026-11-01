/**
 * AI_NOTICE_SPOKEN, the repeat: in a call still going 3 hours after the last notice, the
 * persona says it again at the next turn boundary (its reply finished, the caller quiet),
 * never on a crisis turn, never over the caller. Recorded only when it played in full.
 */
import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installAiNotice } from '../ai-notice-wiring.js';
import {
  openingNotice,
  REPEAT_NOTICE,
  resetAiNotices,
  type NoticeRecord,
  type NoticeStore,
} from '../../shared/ai-notice.js';
import { CRISIS_GATE_SIGNAL, noteCrisisVerdictPending } from '../../safety/crisis-gate-signal.js';

const EV = voice.AgentSessionEventTypes;
const HOUR = 60 * 60 * 1000;
const ON = { AI_NOTICE_SPOKEN: 'on' };

class FakeSession extends EventEmitter {
  said: string[] = [];
  interruptNext = false;
  say(text: string) {
    this.said.push(text);
    const interrupted = this.interruptNext;
    this.interruptNext = false;
    return { interrupted, waitForPlayout: () => Promise.resolve() };
  }
}

let clock = 0;
let records: NoticeRecord[] = [];
const store: NoticeStore = {
  lastNoticeAt: async () => null,
  record: async (_userId, notice) => void records.push(notice),
};
const flush = () =>
  new Promise((r) => {
    setTimeout(r, 0);
  });

async function startCall(env: Record<string, string> = ON) {
  const session = new FakeSession();
  const sessionId = `session-repeat-${Math.random()}`;
  const deps = { env, store, now: () => clock, setTimer: (fn: () => void) => fn() };
  const withNotice = await openingNotice(sessionId, { userId: 'user-1', personaId: 'maya' }, deps);
  withNotice('Hey Sam, how was the hike?'); // the opening, at clock 0
  const cleanupFunctions: Array<() => void> = [];
  installAiNotice({ session, sessionId, cleanupFunctions }, deps);
  return { session, sessionId, cleanupFunctions };
}

/** One of the persona's replies finishing at `at`; `crisis` signals the crisis gate during it. */
async function reply(session: FakeSession, at: number, crisis = false) {
  clock = at - 1000;
  session.emit(EV.AgentStateChanged, { newState: 'thinking' });
  if (crisis) session.emit(CRISIS_GATE_SIGNAL, { action: 'replace' });
  session.emit(EV.AgentStateChanged, { newState: 'speaking' });
  clock = at;
  session.emit(EV.AgentStateChanged, { newState: 'listening' });
  await flush();
}

beforeEach(() => {
  clock = 0;
  records = [];
  resetAiNotices();
});
afterEach(() => resetAiNotices());

describe('AI notice repeat (AI_NOTICE_SPOKEN=on)', () => {
  it('a call 3 hours on gets the notice again at the next turn boundary, once, and it is recorded', async () => {
    const { session } = await startCall();
    records = []; // the opening's record
    await reply(session, 1 * HOUR);
    await reply(session, 2 * HOUR + 59 * 60_000);
    expect(session.said).toEqual([]);

    await reply(session, 3 * HOUR + 60_000);
    expect(session.said).toEqual([REPEAT_NOTICE]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: 'repeat', personaId: 'maya' });

    await reply(session, 3 * HOUR + 5 * 60_000);
    expect(session.said).toEqual([REPEAT_NOTICE]); // the 3 h clock restarted
    await reply(session, 6 * HOUR + 2 * 60_000);
    expect(session.said).toEqual([REPEAT_NOTICE, REPEAT_NOTICE]);
  });

  it('a crisis turn defers it to the next normal turn', async () => {
    const { session } = await startCall();
    await reply(session, 3 * HOUR + 60_000, true);
    expect(session.said).toEqual([]);
    await reply(session, 3 * HOUR + 2 * 60_000);
    expect(session.said).toEqual([REPEAT_NOTICE]);
  });

  it('a crisis read still pending defers it', async () => {
    const { session } = await startCall();
    noteCrisisVerdictPending(session, new Promise<void>(() => {}));
    await reply(session, 3 * HOUR + 60_000);
    expect(session.said).toEqual([]);
  });

  it('the caller already talking: not said over them', async () => {
    const { session } = await startCall();
    clock = 3 * HOUR;
    session.emit(EV.AgentStateChanged, { newState: 'speaking' });
    session.emit(EV.UserStateChanged, { newState: 'speaking' });
    session.emit(EV.AgentStateChanged, { newState: 'listening' });
    await flush();
    expect(session.said).toEqual([]);
  });

  it('talked over: not counted, said again at the next boundary', async () => {
    const { session } = await startCall();
    records = [];
    session.interruptNext = true;
    await reply(session, 3 * HOUR + 60_000);
    expect(session.said).toEqual([REPEAT_NOTICE]);
    expect(records).toHaveLength(0);
    await reply(session, 3 * HOUR + 2 * 60_000);
    expect(session.said).toEqual([REPEAT_NOTICE, REPEAT_NOTICE]);
    expect(records).toHaveLength(1);
  });

  it('a call whose opening did not run here (a call placed for someone else): never', async () => {
    const session = new FakeSession();
    const deps = { env: ON, store, now: () => clock, setTimer: (fn: () => void) => fn() };
    installAiNotice({ session, sessionId: 'session-onbehalf', cleanupFunctions: [] }, deps);
    await reply(session, 4 * HOUR);
    expect(session.said).toEqual([]);
  });
});

describe('AI notice repeat off (default)', () => {
  it('says nothing however long the call runs', async () => {
    const { session } = await startCall({});
    await reply(session, 3 * HOUR + 60_000);
    await reply(session, 7 * HOUR);
    expect(session.said).toEqual([]);
    expect(session.listenerCount(EV.AgentStateChanged)).toBe(0);
  });
});
