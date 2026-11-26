/**
 * #4152: the "no participant" silence blocker read `size ? size > 0 : true`, so an empty
 * participant map (size 0, falsy) counted as a room with someone in it, and the blocker never
 * held. SILENCE_EMPTY_ROOM_HOLD=on reads an empty map as an empty room. Off is as before.
 *
 * The blocker is checked on its own, then through its two live callers in the real session-state
 * handler: the long-silence remark and quiet presence's check (LISTEN_FIRST). Speech is stubbed at
 * safeGenerateReply; fake clock; Riley Test's call, invented lines only.
 */
import { EventEmitter } from 'node:events';

import { voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { safeGenerateReply } = vi.hoisted(() => ({
  safeGenerateReply: vi.fn(async () => ({ success: true, usedFallback: false })),
}));
vi.mock('../../shared/safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/safe-generate-reply.js')>()),
  safeGenerateReply,
}));

import { AWAY_MS, QUIET_WAIT_MS } from '../quiet-presence.js';
import { silenceResponseBlocked } from '../silence-response-blockers.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

const ON = 'on';
const sid = () => `empty-room-${Math.random().toString(36).slice(2)}`;
const roomWith = (people: string[]) =>
  Object.assign(new EventEmitter(), {
    remoteParticipants: new Map<string, unknown>(people.map((p) => [p, { identity: p }])),
  });
/** Short, tired turns: quiet presence holds back until its one late check. */
const TIRED = ['Long day.', 'Yeah.', 'Mm.', 'Still here.'];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('silenceResponseBlocked: an empty room', () => {
  it('on: an empty participant map holds a silence response back', () => {
    vi.stubEnv('SILENCE_EMPTY_ROOM_HOLD', ON);
    expect(silenceResponseBlocked(sid(), roomWith([]), 20)).toBe(true);
  });

  it('on: one caller, no room, or a room with no participant map still allows it', () => {
    vi.stubEnv('SILENCE_EMPTY_ROOM_HOLD', ON);
    expect(silenceResponseBlocked(sid(), roomWith(['riley-test']), 20)).toBe(false);
    expect(silenceResponseBlocked(sid(), undefined, 20)).toBe(false);
    expect(silenceResponseBlocked(sid(), {}, 20)).toBe(false);
  });

  it('off (the default): an empty map allows it, as before', () => {
    vi.stubEnv('SILENCE_EMPTY_ROOM_HOLD', 'off');
    expect(silenceResponseBlocked(sid(), roomWith([]), 20)).toBe(false);
  });
});

/** The real session-state handler on a quiet call in `room`. */
function call(room: ReturnType<typeof roomWith>) {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const session = {
    agentState: 'listening',
    userState: 'listening',
    history: {
      items: TIRED.flatMap((t) => [
        { type: 'message', role: 'user', textContent: t },
        { type: 'message', role: 'assistant', textContent: 'Mm, yeah.' },
      ]),
    },
    on: (evt: string, h: (e: unknown) => void) => {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt)?.add(h);
    },
    off: (evt: string, h: (e: unknown) => void) => handlers.get(evt)?.delete(h),
    interrupt: () => undefined,
  };
  const userState = (newState: string) => {
    for (const h of [...(handlers.get(voice.AgentSessionEventTypes.UserStateChanged) ?? [])]) {
      try {
        h({ newState, oldState: 'listening' });
      } catch {
        // Later, unrelated work in the handler may need a live session; not under test.
      }
    }
  };
  const result = setupSessionStateHandlers({
    session,
    sessionPersona: { id: 'ferni', name: 'Ferni' },
    conversationManager: {
      isAgentSpeaking: () => false,
      handleUserStartedSpeaking: () => undefined,
      handleUserFinishedSpeaking: () => undefined,
    },
    userData: { callerTimezone: 'America/New_York' },
    sessionId: sid(),
    room,
  } as unknown as SessionStateContext);
  /** Riley says something short, then the call goes quiet for `quietMs`. */
  const quietFor = async (quietMs: number) => {
    userState('speaking');
    await vi.advanceTimersByTimeAsync(1_000);
    userState('listening');
    await vi.advanceTimersByTimeAsync(AWAY_MS);
    userState('away');
    await vi.advanceTimersByTimeAsync(Math.max(0, quietMs - AWAY_MS));
    await vi.dynamicImportSettled();
    result.clearTimers();
  };
  return { quietFor };
}

describe('SILENCE_EMPTY_ROOM_HOLD through the live callers (session-state-handler.ts)', () => {
  beforeAll(async () => {
    // Modules the handler imports lazily, so the fake clock doesn't run past them.
    await import('../../shared/session-closing-tracker.js');
  });
  beforeEach(() => {
    vi.stubEnv('PROMPT_MODE', 'character');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T07:47:00Z')); // 3:47 am in New York
    safeGenerateReply.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** How many silence responses each room got, for these flags. */
  async function spokenInto(env: Record<string, string>, quietMs: number): Promise<number[]> {
    const counts: number[] = [];
    for (const people of [[], ['riley-test']]) {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      safeGenerateReply.mockClear();
      await call(roomWith(people)).quietFor(quietMs); // eslint-disable-line no-await-in-loop
      counts.push(safeGenerateReply.mock.calls.length);
    }
    return counts; // [empty room, one caller]
  }

  it('the long-silence remark: on, none into an empty room; a caller still gets one', async () => {
    const [empty, caller] = await spokenInto({ SILENCE_EMPTY_ROOM_HOLD: ON }, 20_000);
    expect([empty, caller]).toEqual([0, 1]);
  });

  it('the long-silence remark: off, the empty room gets one too, as before', async () => {
    expect(await spokenInto({ SILENCE_EMPTY_ROOM_HOLD: 'off' }, 20_000)).toEqual([1, 1]);
  });

  it("quiet presence's check (LISTEN_FIRST): on, none into an empty room; off, as before", async () => {
    const quiet = QUIET_WAIT_MS + 1_000;
    const on = await spokenInto({ LISTEN_FIRST: ON, SILENCE_EMPTY_ROOM_HOLD: ON }, quiet);
    const off = await spokenInto({ LISTEN_FIRST: ON, SILENCE_EMPTY_ROOM_HOLD: 'off' }, quiet);
    expect({ on, off }).toEqual({ on: [0, 1], off: [1, 1] });
  });
});
