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

const { safeGenerateReply, quietLog } = vi.hoisted(() => {
  const quietLog: Record<string, unknown> = {};
  for (const level of ['debug', 'info', 'warn', 'error', 'trace', 'fatal'])
    quietLog[level] = vi.fn();
  quietLog.child = () => quietLog;
  return {
    safeGenerateReply: vi.fn(async () => ({ success: true, usedFallback: false })),
    quietLog: quietLog as { info: ReturnType<typeof vi.fn> },
  };
});
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
  createLogger: () => quietLog,
}));
vi.mock('../../shared/safe-generate-reply.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/safe-generate-reply.js')>()),
  safeGenerateReply,
}));

import {
  askedQuestion,
  AWAY_MS,
  NIGHT_NOTE,
  QUESTION_NOTE,
  QUESTION_WAIT_MS,
  QUIET_WAIT_MS,
  QuietPresence,
  quietDecision,
} from '../quiet-presence.js';
import { noteCrisisRisk, resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { setupSessionStateHandlers, type SessionStateContext } from '../session-state-handler.js';

/** The call's turns so far, paraphrased: tired, two or three words each. */
const TIRED = ['Just hanging out.', 'You did?', "That's cute.", 'Yep, still here.'];
const TALKATIVE = [
  'So I finally booked the flights for the reunion in March.',
  'My sister is flying in from Denver and bringing the kids too.',
  "We haven't all been in one place since the wedding, it's been years.",
];

function history(turns: string[], lastFerni = 'Mm, yeah.') {
  return {
    items: turns.flatMap((t, i) => [
      { type: 'message', role: 'user', textContent: t },
      {
        type: 'message',
        role: 'assistant',
        textContent: i === turns.length - 1 ? lastFerni : 'Mm, yeah.',
      },
    ]),
  };
}

function setup(
  turns: string[],
  callerTimezone?: string,
  accountTimezone?: string,
  lastFerni?: string
) {
  const handlers = new Map<string, Set<(e: unknown) => void>>();
  const session = {
    agentState: 'listening',
    userState: 'listening',
    history: history(turns, lastFerni),
    on: (evt: string, h: (e: unknown) => void) => {
      if (!handlers.has(evt)) handlers.set(evt, new Set());
      handlers.get(evt)?.add(h);
    },
    off: (evt: string, h: (e: unknown) => void) => handlers.get(evt)?.delete(h),
    interrupt: () => undefined,
  };
  const fire = (evt: string, e: unknown) => {
    for (const h of [...(handlers.get(evt) ?? [])]) {
      try {
        h(e);
      } catch {
        // Unrelated work further down the handler may need a live session; not under test.
      }
    }
  };
  const emit = (newState: string) =>
    fire(voice.AgentSessionEventTypes.UserStateChanged, { newState, oldState: 'listening' });
  /** Ferni finishes a line: speaking, then listening. */
  const agentDone = () => {
    fire(voice.AgentSessionEventTypes.AgentStateChanged, {
      newState: 'speaking',
      oldState: 'listening',
    });
    fire(voice.AgentSessionEventTypes.AgentStateChanged, {
      newState: 'listening',
      oldState: 'speaking',
    });
  };
  const sessionId = `quiet-presence-${Math.random().toString(36).slice(2)}`;
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
    sessionId,
  } as unknown as SessionStateContext);
  return { result, emit, agentDone, sessionId };
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

const saved = {
  LISTEN_FIRST: process.env.LISTEN_FIRST,
  PROMPT_MODE: process.env.PROMPT_MODE,
  QUIET_AFTER_QUESTION: process.env.QUIET_AFTER_QUESTION,
};
beforeAll(async () => {
  // Modules the handler imports lazily, so the fake clock doesn't run past them.
  await import('../../shared/session-closing-tracker.js');
});
beforeEach(() => {
  process.env.PROMPT_MODE = 'character'; // as in prod: the silence reply is the model's, from a note
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-11T07:47:00Z')); // 3:47 am in New York
  safeGenerateReply.mockClear();
  quietLog.info.mockClear();
  resetCrisisCallRisk();
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
    expect(quietLog.info).toHaveBeenCalledWith(
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

describe('QUIET_AFTER_QUESTION: the night hold after a question, and on a crisis call', () => {
  const night = { lowEnergy: true, lateNight: true };
  const asked = { ...night, askedQuestion: true };
  const tiredDay = { lowEnergy: true, lateNight: false };
  const talkativeDay = { lowEnergy: false, lateNight: false };

  it('off: a question and a crisis signal change nothing', () => {
    for (const ms of [0, AWAY_MS, QUESTION_WAIT_MS, QUIET_WAIT_MS]) {
      const plain = quietDecision(ms, night, 0);
      expect(quietDecision(ms, { ...night, askedQuestion: true, crisis: true }, 0)).toEqual(plain);
      expect(quietDecision(ms, { ...night, askedQuestion: true, crisis: true }, 0, false)).toEqual(
        plain
      );
    }
    expect(quietDecision(AWAY_MS, asked, 0)).toEqual({
      action: 'wait',
      ms: QUIET_WAIT_MS - AWAY_MS,
    });
  });

  it('on, late at night after a question: about 9 s, not 45', () => {
    // Pre: the same quiet without the flag holds to 45 s.
    expect(quietDecision(0, asked, 0)).toEqual({ action: 'wait', ms: QUIET_WAIT_MS });
    expect(QUESTION_WAIT_MS).toBeGreaterThanOrEqual(8_000);
    expect(QUESTION_WAIT_MS).toBeLessThanOrEqual(10_000);
    expect(quietDecision(0, asked, 0, true)).toEqual({ action: 'wait', ms: QUESTION_WAIT_MS });
    expect(quietDecision(QUESTION_WAIT_MS, asked, 0, true)).toEqual({
      action: 'speak',
      instructions: QUESTION_NOTE,
    });
    expect(QUESTION_NOTE).not.toEqual(NIGHT_NOTE);
    expect(quietDecision(QUESTION_WAIT_MS, asked, 1, true)).toEqual({ action: 'none' });
  });

  it('on, late at night with plain silence: still the 45 s hold', () => {
    expect(quietDecision(AWAY_MS, night, 0, true)).toEqual({
      action: 'wait',
      ms: QUIET_WAIT_MS - AWAY_MS,
    });
    expect(quietDecision(QUIET_WAIT_MS, night, 0, true)).toEqual({
      action: 'speak',
      instructions: NIGHT_NOTE,
    });
  });

  it('on, a crisis signal on the call: the usual short response, question or not', () => {
    for (const cues of [night, asked, tiredDay, talkativeDay]) {
      expect(quietDecision(AWAY_MS, { ...cues, crisis: true }, 0, true)).toEqual({
        action: 'usual',
      });
    }
    // Pre: without the crisis signal, the same night quiet is held.
    expect(quietDecision(AWAY_MS, night, 0, true).action).toBe('wait');
  });

  it('on, daytime: unchanged, question or not', () => {
    for (const cues of [tiredDay, talkativeDay]) {
      for (const ms of [0, QUESTION_WAIT_MS, AWAY_MS, QUIET_WAIT_MS]) {
        expect(quietDecision(ms, { ...cues, askedQuestion: true }, 0, true)).toEqual(
          quietDecision(ms, cues, 0)
        );
      }
    }
  });

  it('reads a question past emoji, quotes, a stage direction and "?,"', () => {
    for (const line of [
      'How did it go?',
      'Did you sleep at all? 😴',
      'You okay?”',
      'Want to talk about it? [softly]',
      'You doing alright?,',
      'Mm. Was it the call with your sister?)',
    ]) {
      expect(askedQuestion(line)).toBe(true);
    }
    for (const line of [
      undefined,
      '',
      'Mm, yeah.',
      'How was it? Glad you went.',
      'Sleep well 🌙',
    ]) {
      expect(askedQuestion(line)).toBe(false);
    }
  });

  it('logs a long hold with its reason and wait, and no words', () => {
    const quiet = new QuietPresence({
      cues: () => night,
      lastSpokeAt: () => 0,
      canSpeak: () => true,
      speak: vi.fn(),
    });
    expect(quietLog.info).not.toHaveBeenCalled();
    quiet.onQuiet();
    expect(quietLog.info).toHaveBeenCalledWith(
      { reason: 'late_night', waitMs: QUIET_WAIT_MS - AWAY_MS },
      'Quiet presence holding'
    );
    quiet.cancel();
  });

  describe('through the real handler, late at night', () => {
    const QUESTION = 'Did you get any sleep last night? 😴';

    it('off: a question gets the 45 s hold, nothing at 9 s', async () => {
      process.env.LISTEN_FIRST = 'on';
      delete process.env.QUIET_AFTER_QUESTION;
      const { result, emit, agentDone } = setup(TIRED, 'America/New_York', undefined, QUESTION);
      agentDone();
      await vi.advanceTimersByTimeAsync(QUESTION_WAIT_MS + 1_000);
      expect(safeGenerateReply).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(AWAY_MS - QUESTION_WAIT_MS - 1_000);
      emit('away');
      await vi.advanceTimersByTimeAsync(10_000);
      await vi.dynamicImportSettled();
      result.clearTimers();
      expect(safeGenerateReply).not.toHaveBeenCalled();
    });

    it('on: one soft check-in about 9 s after the question', async () => {
      process.env.LISTEN_FIRST = 'on';
      process.env.QUIET_AFTER_QUESTION = 'on';
      const { result, agentDone } = setup(TIRED, 'America/New_York', undefined, QUESTION);
      agentDone();
      await vi.advanceTimersByTimeAsync(QUESTION_WAIT_MS - 500);
      expect(safeGenerateReply).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.dynamicImportSettled();
      result.clearTimers();
      expect(safeGenerateReply).toHaveBeenCalledTimes(1);
      expect(safeGenerateReply.mock.calls[0]).toEqual([
        expect.anything(),
        expect.objectContaining({ instructions: QUESTION_NOTE }),
      ]);
    });

    it('on, plain silence: still nothing in the short gaps, one check after 45 s', async () => {
      process.env.LISTEN_FIRST = 'on';
      process.env.QUIET_AFTER_QUESTION = 'on';
      const { result, emit, agentDone } = setup(TIRED, 'America/New_York');
      agentDone();
      for (const ms of GAPS) await gap(emit, ms); // eslint-disable-line no-await-in-loop
      expect(safeGenerateReply).not.toHaveBeenCalled();
      await gap(emit, QUIET_WAIT_MS + 1_000);
      result.clearTimers();
      expect(safeGenerateReply).toHaveBeenCalledTimes(1);
      expect(safeGenerateReply.mock.calls[0]).toEqual([
        expect.anything(),
        expect.objectContaining({ instructions: NIGHT_NOTE }),
      ]);
    });

    it('on, a crisis signal on the call: the usual response in a short gap, no night hold', async () => {
      process.env.LISTEN_FIRST = 'on';
      process.env.QUIET_AFTER_QUESTION = 'on';
      const { result, emit, sessionId } = setup(TIRED, 'America/New_York', undefined, QUESTION);
      noteCrisisRisk(sessionId);
      await gap(emit, GAPS[3]);
      result.clearTimers();
      expect(safeGenerateReply).toHaveBeenCalledTimes(1);
      expect(safeGenerateReply.mock.calls[0]).not.toEqual([
        expect.anything(),
        expect.objectContaining({ instructions: QUESTION_NOTE }),
      ]);
    });

    it('off, the same crisis call: held as before (pre-condition for the test above)', async () => {
      process.env.LISTEN_FIRST = 'on';
      delete process.env.QUIET_AFTER_QUESTION;
      const { result, emit, sessionId } = setup(TIRED, 'America/New_York', undefined, QUESTION);
      noteCrisisRisk(sessionId);
      await gap(emit, GAPS[3]);
      result.clearTimers();
      expect(safeGenerateReply).not.toHaveBeenCalled();
    });
  });
});
