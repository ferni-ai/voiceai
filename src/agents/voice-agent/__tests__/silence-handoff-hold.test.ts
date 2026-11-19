/**
 * #4156: silenceResponseBlocked holds a silence response back while a persona handoff is in
 * progress (shouldSkipGenerateReply), so Ferni doesn't speak over the handoff. Nothing on main
 * tested it. One row per live caller in the real session-state handler: the long-silence remark
 * and quiet presence's check (LISTEN_FIRST). During the handoff nothing is spoken; once it has
 * completed, the next quiet gets its usual response. One more row covers the drain half
 * (isSessionDraining): a quiet that turns "away" inside the 3 s after a handoff completes gets
 * no remark; the same quiet turning "away" just past it does.
 *
 * Speech is stubbed at safeGenerateReply; fake clock; Riley Test's call, invented lines only.
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

import { markHandoffCompleted, markHandoffStarted } from '../../../handoff/unified-state.js';
import { AWAY_MS, QUIET_WAIT_MS } from '../quiet-presence.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

/** Short, tired turns: quiet presence holds back until its one late check. */
const TIRED = ['Long day.', 'Yeah.', 'Mm.', 'Still here.'];
/** The window after a handoff completes in which the old session is still draining (unified-state.ts). */
const DRAIN_MS = 3_000;
/** Past the drain window. */
const PAST_DRAIN_MS = 5_000;

/** The real session-state handler on Riley Test's quiet call, with one caller in the room. */
function call() {
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
  const sessionId = `handoff-hold-${Math.random().toString(36).slice(2)}`;
  const result = setupSessionStateHandlers({
    session,
    sessionPersona: { id: 'ferni', name: 'Ferni' },
    conversationManager: {
      isAgentSpeaking: () => false,
      handleUserStartedSpeaking: () => undefined,
      handleUserFinishedSpeaking: () => undefined,
    },
    userData: { callerTimezone: 'America/New_York' },
    sessionId,
    room: Object.assign(new EventEmitter(), {
      remoteParticipants: new Map<string, unknown>([['riley-test', { identity: 'riley-test' }]]),
    }),
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
  };
  return { sessionId, userState, quietFor, end: () => result.clearTimers() };
}

/** Silence responses spoken in a quiet gap during a handoff, then in one after it completed. */
async function duringThenAfter(quietMs: number): Promise<{ during: number; after: number }> {
  const c = call();
  markHandoffStarted(c.sessionId, 'peter');
  await c.quietFor(quietMs);
  const during = safeGenerateReply.mock.calls.length;
  markHandoffCompleted(c.sessionId, true);
  await vi.advanceTimersByTimeAsync(PAST_DRAIN_MS);
  safeGenerateReply.mockClear();
  await c.quietFor(quietMs);
  const after = safeGenerateReply.mock.calls.length;
  c.end();
  return { during, after };
}

/**
 * Long-silence remarks when Riley goes quiet during a handoff and the quiet turns "away" (the
 * moment the handler decides on a remark) `msAfterDone` after the handoff completed.
 */
async function remarksWhenAwayLands(msAfterDone: number): Promise<number> {
  const c = call();
  safeGenerateReply.mockClear();
  markHandoffStarted(c.sessionId, 'peter');
  c.userState('speaking');
  await vi.advanceTimersByTimeAsync(1_000);
  c.userState('listening');
  await vi.advanceTimersByTimeAsync(AWAY_MS - msAfterDone);
  markHandoffCompleted(c.sessionId, true);
  await vi.advanceTimersByTimeAsync(msAfterDone);
  c.userState('away');
  await vi.advanceTimersByTimeAsync(5_000);
  await vi.dynamicImportSettled();
  const remarks = safeGenerateReply.mock.calls.length;
  c.end();
  return remarks;
}

describe('the handoff blocker through the live callers (session-state-handler.ts)', () => {
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
    vi.unstubAllEnvs();
  });

  it('the long-silence remark: none during a handoff, the usual one after it', async () => {
    expect(await duringThenAfter(20_000)).toEqual({ during: 0, after: 1 });
  });

  it("quiet presence's check (LISTEN_FIRST): none during a handoff, the usual one after it", async () => {
    vi.stubEnv('LISTEN_FIRST', 'on');
    expect(await duringThenAfter(QUIET_WAIT_MS + 1_000)).toEqual({ during: 0, after: 1 });
  });

  it('the long-silence remark right after a handoff: none while the old session drains, the usual one just past it', async () => {
    expect({
      insideDrain: await remarksWhenAwayLands(DRAIN_MS - 500),
      pastDrain: await remarksWhenAwayLands(DRAIN_MS + 500),
    }).toEqual({ insideDrain: 0, pastDrain: 1 });
  });
});
