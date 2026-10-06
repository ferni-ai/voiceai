/**
 * The early dead-air check-in fires at a jittered 0.75x to 1.25x of its base
 * wait so it doesn't feel robotic. Its "has it really been that long?" gate
 * must agree with that jittered due time. When the gate compared against the
 * unjittered base wait, every check-in whose jitter came out early fired and
 * then silently did nothing, so Ferni stayed quiet instead of gently checking
 * in. These tests drive the real handler with fake timers across the whole
 * jitter range and count the check-ins that actually happen.
 */
import { voice } from '@livekit/agents';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { generateReplyWithContext } = vi.hoisted(() => ({ generateReplyWithContext: vi.fn() }));

vi.mock('../../shared/safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/safe-generate-reply.js')>()),
  generateReplyWithContext,
}));

import { SILENCE_THRESHOLDS } from '../../shared/constants.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

const BASE_MS = SILENCE_THRESHOLDS.EARLY_ACKNOWLEDGMENT_SECONDS * 1000;
const SILENCES = 40;

interface FakeSession {
  agentState: string;
  userState: string;
  on: (evt: string, h: (e: unknown) => void) => void;
  off: (evt: string, h: (e: unknown) => void) => void;
  interrupt: () => void;
}

function setup(opts: { agentSpeaking?: boolean } = {}) {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const session: FakeSession = {
    agentState: 'listening',
    userState: 'listening',
    on: (evt, h) => {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt)?.add(h);
    },
    off: (evt, h) => handlers.get(evt)?.delete(h),
    interrupt: () => undefined,
  };
  const emit = (evt: string, e: unknown) => {
    for (const h of [...(handlers.get(evt) ?? [])]) {
      try {
        h(e);
      } catch {
        // Unrelated work further down the handler may need a live session; not under test.
      }
    }
  };
  const result = setupSessionStateHandlers({
    session,
    sessionPersona: { id: 'ferni', name: 'Ferni' },
    conversationManager: {
      isAgentSpeaking: () => opts.agentSpeaking ?? false,
      handleUserFinishedSpeaking: () => undefined,
    },
    userData: {},
    sessionId: `dead-air-jitter-${Math.random().toString(36).slice(2)}`,
  } as unknown as SessionStateContext);
  const userStops = () =>
    emit(voice.AgentSessionEventTypes.UserStateChanged, {
      newState: 'listening',
      oldState: 'speaking',
    });
  const userSpeaks = () =>
    emit(voice.AgentSessionEventTypes.UserStateChanged, {
      newState: 'speaking',
      oldState: 'listening',
    });
  return { result, userStops, userSpeaks };
}

const checkIns = () =>
  generateReplyWithContext.mock.calls.filter(
    ([, o]) => (o as { logContext?: string }).logContext === 'early-dead-air-checkin'
  ).length;

/** One silence: the user stops, and the clock runs to just past the check-in's due time. */
async function oneSilence(jitter: number, opts: { agentSpeaking?: boolean } = {}) {
  vi.spyOn(Math, 'random').mockReturnValue(jitter);
  const { result, userStops } = setup(opts);
  userStops();
  const dueMs = BASE_MS * (0.75 + jitter * 0.5);
  await vi.advanceTimersByTimeAsync(Math.ceil(dueMs) + 1);
  await vi.dynamicImportSettled();
  result.clearTimers();
  vi.mocked(Math.random).mockRestore();
}

describe('early dead-air check-in: jittered timer and its gate agree', () => {
  const prevTurnKeeper = process.env.TURN_KEEPER;

  beforeAll(async () => {
    // The turn keeper owns hanging turns when on; this path runs with it off.
    process.env.TURN_KEEPER = 'off';
    // Load the module the timer imports lazily, so the fake clock doesn't run past it.
    await import('../../shared/session-closing-tracker.js');
  });
  afterAll(() => {
    if (prevTurnKeeper === undefined) delete process.env.TURN_KEEPER;
    else process.env.TURN_KEEPER = prevTurnKeeper;
  });
  beforeEach(() => {
    vi.useFakeTimers();
    generateReplyWithContext.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it(`every one of ${SILENCES} silences across the jitter range gets its check-in`, async () => {
    for (let i = 0; i < SILENCES; i++) {
      // eslint-disable-next-line no-await-in-loop -- silences share one fake clock and one Math.random spy
      await oneSilence(i / SILENCES);
    }
    expect(checkIns()).toBe(SILENCES);
  });

  it('an early-jittered check-in (0.75x) speaks', async () => {
    await oneSilence(0);
    expect(checkIns()).toBe(1);
  });

  it('a late-jittered check-in (~1.25x) speaks once, not early', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    const { result, userStops } = setup();
    userStops();
    await vi.advanceTimersByTimeAsync(BASE_MS);
    await vi.dynamicImportSettled();
    expect(checkIns()).toBe(0);
    await vi.advanceTimersByTimeAsync(BASE_MS * 0.25 + 10);
    await vi.dynamicImportSettled();
    expect(checkIns()).toBe(1);
    result.clearTimers();
    vi.mocked(Math.random).mockRestore();
  });

  it('keeps the guard: no check-in while the agent is speaking', async () => {
    await oneSilence(0, { agentSpeaking: true });
    await oneSilence(0.9, { agentSpeaking: true });
    expect(checkIns()).toBe(0);
  });

  it('keeps the guard: the user talking again cancels the check-in', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { result, userStops, userSpeaks } = setup();
    userStops();
    await vi.advanceTimersByTimeAsync(BASE_MS * 0.5);
    userSpeaks();
    await vi.advanceTimersByTimeAsync(BASE_MS * 2);
    await vi.dynamicImportSettled();
    expect(checkIns()).toBe(0);
    result.clearTimers();
    vi.mocked(Math.random).mockRestore();
  });
});
