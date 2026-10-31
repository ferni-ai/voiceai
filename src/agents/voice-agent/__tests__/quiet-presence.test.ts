/**
 * LISTEN_FIRST=on: at most one presence check a call, and later and softer
 * when the caller is tired or it's the middle of the night (quiet-presence.ts).
 *
 * Modelled on a prod call (2026-10-11, 3:47 am for the caller), paraphrased:
 * short, tired answers and long gaps, and "Mm? You still there?" after each
 * gap. These drive the real session-state handler with a fake session and
 * fake timers through four such gaps and count the silence replies it asks for.
 */
import { voice } from '@livekit/agents';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { safeGenerateReply } = vi.hoisted(() => ({
  safeGenerateReply: vi.fn(async () => ({ success: true, usedFallback: false })),
}));
vi.mock('../../shared/safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/safe-generate-reply.js')>()),
  safeGenerateReply,
}));

import {
  AWAY_MS,
  NIGHT_NOTE,
  QUIET_WAIT_MS,
  QuietPresence,
  quietDecision,
} from '../quiet-presence.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';
import { createLogger } from '../../../utils/safe-logger.js';

/** quiet-presence.ts's own logger (safe-logger is mocked for every test, src/tests/setup.ts),
 *  taken before any beforeEach clears the mock's results. */
const quietLog = (() => {
  const m = vi.mocked(createLogger).mock;
  const i = m.calls.findIndex(([b]) => (b as { module?: string })?.module === 'QuietPresence');
  return m.results[i]?.value as { info: ReturnType<typeof vi.fn> } | undefined;
})();

/** The call's turns so far, paraphrased: tired, two or three words each. */
const TIRED = ['Just hanging out.', 'You did?', "That's cute.", 'Yep, still here.'];
const TALKATIVE = [
  'So I finally booked the flights for the reunion in March.',
  'My sister is flying in from Denver and bringing the kids too.',
  "We haven't all been in one place since the wedding, it's been years.",
];

function history(turns: string[]) {
  return {
    items: turns.flatMap((t) => [
      { type: 'message', role: 'user', textContent: t },
      { type: 'message', role: 'assistant', textContent: 'Mm, yeah.' },
    ]),
  };
}

function setup(turns: string[], callerTimezone?: string, accountTimezone?: string) {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const session = {
    agentState: 'listening',
    userState: 'listening',
    history: history(turns),
    on: (evt: string, h: (e: unknown) => void) => {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt)?.add(h);
    },
    off: (evt: string, h: (e: unknown) => void) => handlers.get(evt)?.delete(h),
    interrupt: () => undefined,
  };
  const emit = (newState: string) => {
    for (const h of [...(handlers.get(voice.AgentSessionEventTypes.UserStateChanged) ?? [])]) {
      try {
        h({ newState, oldState: 'listening' });
      } catch {
        // Unrelated work further down the handler may need a live session; not under test.
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
    userData: {
      callerTimezone,
      services: { userProfile: { contactInfo: { timezone: accountTimezone } } },
    },
    sessionId: `quiet-presence-${Math.random().toString(36).slice(2)}`,
  } as unknown as SessionStateContext);
  return { result, emit };
}

/** One gap: the caller says something short, then both go quiet for `quietMs`. */
async function gap(emit: (s: string) => void, quietMs: number) {
  emit('speaking');
  await vi.advanceTimersByTimeAsync(1_000);
  emit('listening');
  await vi.advanceTimersByTimeAsync(AWAY_MS);
  emit('away'); // LiveKit's userAwayTimeout
  await vi.advanceTimersByTimeAsync(Math.max(0, quietMs - AWAY_MS));
  await vi.dynamicImportSettled();
}

/** The prod call's gaps, in ms of quiet: 20, 19, 21, 25. */
const GAPS = [20_000, 19_000, 21_000, 25_000];

const saved = { LISTEN_FIRST: process.env.LISTEN_FIRST, PROMPT_MODE: process.env.PROMPT_MODE };
beforeAll(async () => {
  // Modules the handler imports lazily, so the fake clock doesn't run past them.
  await import('../../shared/session-closing-tracker.js');
});
beforeEach(() => {
  process.env.PROMPT_MODE = 'character'; // as in prod: the silence reply is the model's, from a note
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T07:47:00Z')); // 3:47 am in New York
  safeGenerateReply.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('quietDecision', () => {
  const tired = { lowEnergy: true, lateNight: false };
  const night = { lowEnergy: true, lateNight: true };
  const usual = { lowEnergy: false, lateNight: false };

  it('one check a call, whatever the caller', () => {
    expect(quietDecision(60_000, night, 1)).toEqual({ action: 'none' });
    expect(quietDecision(60_000, usual, 1)).toEqual({ action: 'none' });
  });

  it('late at night: waits to 45 s of quiet, then offers company or sleep', () => {
    expect(quietDecision(15_000, night, 0)).toEqual({ action: 'wait', ms: QUIET_WAIT_MS - 15_000 });
    expect(quietDecision(QUIET_WAIT_MS, night, 0)).toEqual({
      action: 'speak',
      instructions: NIGHT_NOTE,
    });
    expect(NIGHT_NOTE).toMatch(/call it a night/);
  });

  it('a tired caller in the daytime gets quiet; a talkative one the usual response', () => {
    expect(quietDecision(60_000, tired, 0)).toEqual({ action: 'none' });
    expect(quietDecision(20_000, usual, 0)).toEqual({ action: 'usual' });
  });

  it('a caller who speaks during the wait ends it', async () => {
    let spokeAt = Date.now();
    const speak = vi.fn();
    const quiet = new QuietPresence({
      cues: () => ({ lowEnergy: true, lateNight: true }),
      lastSpokeAt: () => spokeAt,
      canSpeak: () => true,
      speak,
    });
    expect(quiet.onQuiet()).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    spokeAt = Date.now();
    await vi.advanceTimersByTimeAsync(QUIET_WAIT_MS);
    expect(speak).not.toHaveBeenCalled();
  });
});

describe('QuietPresence reports each silence it holds (QUIET_HOLD, #3164)', () => {
  it('the late-night wait, then nothing once the caller spoke; not the usual response', async () => {
    const onHold = vi.fn();
    let spokeAt = Date.now();
    const quiet = new QuietPresence({
      cues: () => ({ lowEnergy: false, lateNight: true }),
      lastSpokeAt: () => spokeAt,
      canSpeak: () => true,
      speak: vi.fn(),
      onHold,
    });
    expect(quiet.onQuiet()).toBe(true);
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(onHold).toHaveBeenCalledWith({
      action: 'wait',
      waitMs: QUIET_WAIT_MS - AWAY_MS,
      quietMs: AWAY_MS,
      checks: 0,
      lowEnergy: false,
      lateNight: true,
    });
    spokeAt = Date.now() + 1;
    await vi.advanceTimersByTimeAsync(QUIET_WAIT_MS);
    expect(onHold).toHaveBeenCalledTimes(1);
    const usual = new QuietPresence({
      cues: () => ({ lowEnergy: false, lateNight: false }),
      lastSpokeAt: () => spokeAt,
      canSpeak: () => true,
      speak: vi.fn(),
      onHold,
    });
    expect(usual.onQuiet()).toBe(false);
    expect(onHold).toHaveBeenCalledTimes(1);
  });
  it('a tired caller in the daytime: held with no wait', () => {
    const onHold = vi.fn();
    const quiet = new QuietPresence({
      cues: () => ({ lowEnergy: true, lateNight: false }),
      lastSpokeAt: () => Date.now(),
      canSpeak: () => true,
      speak: vi.fn(),
      onHold,
    });
    expect(quiet.onQuiet()).toBe(true);
    expect(onHold).toHaveBeenCalledWith(expect.objectContaining({ action: 'none', waitMs: 0 }));
  });
});

describe('the silence path, through the real handler', () => {
  it('off: every gap gets its own check-in (the prod call)', async () => {
    delete process.env.LISTEN_FIRST;
    const { result, emit } = setup(TIRED, 'America/New_York');
    for (const ms of GAPS) await gap(emit, ms); // eslint-disable-line no-await-in-loop
    result.clearTimers();
    expect(safeGenerateReply).toHaveBeenCalledTimes(GAPS.length);
  });

  it('on, late at night: nothing in the short gaps, one soft check after 45 s, then no more', async () => {
    process.env.LISTEN_FIRST = 'on';
    const { result, emit } = setup(TIRED, 'America/New_York');
    for (const ms of GAPS) await gap(emit, ms); // eslint-disable-line no-await-in-loop
    expect(safeGenerateReply).not.toHaveBeenCalled();
    await gap(emit, QUIET_WAIT_MS + 1_000);
    expect(safeGenerateReply).toHaveBeenCalledTimes(1);
    expect(safeGenerateReply.mock.calls[0]).toEqual([
      expect.anything(),
      expect.objectContaining({ instructions: NIGHT_NOTE }),
    ]);
    for (const ms of [...GAPS, 60_000]) await gap(emit, ms); // eslint-disable-line no-await-in-loop
    result.clearTimers();
    expect(safeGenerateReply).toHaveBeenCalledTimes(1);
  });

  it('on, late at night: the held silence is logged as QUIET_HOLD for this session', async () => {
    process.env.LISTEN_FIRST = 'on';
    const { result, emit } = setup(TIRED, 'America/New_York');
    await gap(emit, GAPS[0]);
    result.clearTimers();
    expect(quietLog?.info).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'wait', lateNight: true, sessionId: expect.any(String) }),
      'QUIET_HOLD'
    );
  });

  it('on, a phone call with only an account zone in the profile: never read as night', async () => {
    // The account's zone reaches a call only through phone-parity.ts (callerTimezone).
    process.env.LISTEN_FIRST = 'on';
    const { result, emit } = setup(TIRED, undefined, 'America/New_York');
    for (const ms of GAPS) await gap(emit, ms); // eslint-disable-line no-await-in-loop
    await gap(emit, QUIET_WAIT_MS + 1_000);
    result.clearTimers();
    expect(safeGenerateReply).not.toHaveBeenCalled();
  });

  it('on, a tired caller in the daytime: no spoken check-ins at all', async () => {
    process.env.LISTEN_FIRST = 'on';
    const { result, emit } = setup(TIRED, 'Asia/Tokyo'); // 4:47 pm
    for (const ms of [...GAPS, 60_000]) await gap(emit, ms); // eslint-disable-line no-await-in-loop
    result.clearTimers();
    expect(safeGenerateReply).not.toHaveBeenCalled();
  });

  it('on, a talkative caller: the usual check-in, once a call', async () => {
    process.env.LISTEN_FIRST = 'on';
    const { result, emit } = setup(TALKATIVE, 'Asia/Tokyo');
    for (const ms of GAPS) await gap(emit, ms); // eslint-disable-line no-await-in-loop
    result.clearTimers();
    expect(safeGenerateReply).toHaveBeenCalledTimes(1);
  });
});
