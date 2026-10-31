import { voice } from '@livekit/agents';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flagOn } from '../../../config/env-flag.js';
import { validateTranscript } from '../transcript-validator.js';
import {
  decideRejectedTranscriptAction,
  cancelRepliesQueuedSince,
  handleRejectedTranscript,
  recordCreatedSpeech,
  trackSession,
  type RejectedTranscriptInput,
} from '../rejected-transcript-policy.js';

// Ferni's reply started at T, the caller's utterance at T+1500.
const T = 1_000_000;
const SPEAKING_SINCE_BEFORE_CALLER: Omit<RejectedTranscriptInput, 'keepsSpeechFlag'> = {
  isAgentSpeaking: true,
  agentSpeechStartedAt: T,
  userSpeechStartedAt: T + 1500,
};

function fakeSession() {
  return { interrupt: vi.fn() };
}

/** A SpeechHandle stand-in; started resolves its authorization (it became the current speech). */
function fakeHandle(id: string, { started }: { started: boolean }) {
  return {
    id,
    interrupted: false,
    done: () => false,
    interrupt: vi.fn(),
    _waitForAuthorization: () => (started ? Promise.resolve() : new Promise<void>(() => {})),
  };
}

// Lets the authorization .then in recordCreatedSpeech run (the SDK's wait is a few awaits deep).
const flushMicrotasks = (): Promise<void> =>
  Array.from({ length: 10 }).reduce<Promise<void>>(
    (p) => p.then(() => undefined),
    Promise.resolve()
  );

/** Runs the real handler and returns how many times it interrupted, after the 100 ms follow-up. */
function interruptsFor(
  transcript: string,
  ctx: { lastAgentUtterance?: string; timeSinceAgentSpoke: number; isAgentSpeaking: boolean },
  input: RejectedTranscriptInput
) {
  const validation = validateTranscript(transcript, { ...ctx, expectedLanguage: 'en' });
  expect(validation.isValid).toBe(false);
  const session = fakeSession();
  trackSession(session);
  const action = handleRejectedTranscript(session, validation.reason, input);
  vi.advanceTimersByTime(150);
  return { action, reason: validation.reason, count: session.interrupt.mock.calls.length };
}

describe('rejected transcript policy', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('REJECTED_TRANSCRIPT_KEEPS_SPEECH is off by default', () => {
    expect(flagOn('REJECTED_TRANSCRIPT_KEEPS_SPEECH', {})).toBe(false);
  });

  it('flag off: every rejection double-interrupts, even mid-reply', () => {
    const shapes: RejectedTranscriptInput[] = [
      { keepsSpeechFlag: false, ...SPEAKING_SINCE_BEFORE_CALLER },
      { keepsSpeechFlag: false, isAgentSpeaking: false },
      {
        keepsSpeechFlag: false,
        isAgentSpeaking: true,
        agentSpeechStartedAt: T + 2000,
        userSpeechStartedAt: T,
      },
    ];
    for (const input of shapes) {
      const session = fakeSession();
      expect(handleRejectedTranscript(session, 'too_short', input)).toBe('interrupt');
      expect(session.interrupt).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(100);
      expect(session.interrupt).toHaveBeenCalledTimes(2);
    }
  });

  it('flag on: "Right." rejected as too short while Ferni speaks since before it does not interrupt', () => {
    const result = interruptsFor(
      'Right.',
      { timeSinceAgentSpoke: 60_000, isAgentSpeaking: true },
      { keepsSpeechFlag: true, ...SPEAKING_SINCE_BEFORE_CALLER }
    );
    expect(result).toEqual({ action: 'keep_speech', reason: 'too_short', count: 0 });
  });

  it("flag on: Ferni's own echo during his ongoing reply does not interrupt", () => {
    const said = 'I think that sounds like a really lovely plan for the weekend';
    const result = interruptsFor(
      'that sounds like a really lovely plan for the weekend',
      { lastAgentUtterance: said, timeSinceAgentSpoke: 500, isAgentSpeaking: true },
      { keepsSpeechFlag: true, ...SPEAKING_SINCE_BEFORE_CALLER }
    );
    expect(result).toEqual({ action: 'keep_speech', reason: 'echo_detected', count: 0 });
  });

  it('flag on: foreign-character noise whose reply began after the caller spoke is interrupted twice', () => {
    const result = interruptsFor(
      '你好你好',
      { timeSinceAgentSpoke: 60_000, isAgentSpeaking: true },
      {
        keepsSpeechFlag: true,
        isAgentSpeaking: true,
        agentSpeechStartedAt: T + 800,
        userSpeechStartedAt: T,
      }
    );
    expect(result).toEqual({ action: 'interrupt', reason: 'foreign_chars', count: 2 });
  });

  it('flag on: Ferni thinking (no audio yet) is interrupted twice', () => {
    const result = interruptsFor(
      '你好',
      { timeSinceAgentSpoke: 1000, isAgentSpeaking: false },
      {
        keepsSpeechFlag: true,
        isAgentSpeaking: false,
        agentSpeechStartedAt: T,
        userSpeechStartedAt: T + 1500,
      }
    );
    expect(result.action).toBe('interrupt');
    expect(result.count).toBe(2);
  });

  it('flag on: unknown speech order keeps the original protection', () => {
    expect(
      decideRejectedTranscriptAction({
        keepsSpeechFlag: true,
        isAgentSpeaking: true,
        agentSpeechStartedAt: T,
      })
    ).toBe('interrupt');
    expect(
      decideRejectedTranscriptAction({
        keepsSpeechFlag: true,
        isAgentSpeaking: true,
        userSpeechStartedAt: T,
      })
    ).toBe('interrupt');
  });

  describe('replies queued behind the kept reply (realtime path)', () => {
    const KEEP: RejectedTranscriptInput = {
      keepsSpeechFlag: true,
      ...SPEAKING_SINCE_BEFORE_CALLER,
    };

    /** Ferni's reply (created before the caller, playing) plus one generated after the caller began. */
    async function sessionWithQueuedReply() {
      const session = fakeSession();
      trackSession(session);
      const playing = fakeHandle('ferni-reply', { started: true });
      const queued = fakeHandle('garbage-reply', { started: false });
      recordCreatedSpeech(session, playing, T - 200);
      recordCreatedSpeech(session, queued, T + 1600);
      await flushMicrotasks();
      return { session, playing, queued };
    }

    it('(a) cancels a reply created after the caller began that has not started, not the session', async () => {
      const { session, queued } = await sessionWithQueuedReply();
      expect(handleRejectedTranscript(session, 'too_short', KEEP)).toBe('keep_speech');
      vi.advanceTimersByTime(150);
      expect(queued.interrupt).toHaveBeenCalledTimes(1);
      expect(session.interrupt).not.toHaveBeenCalled();
    });

    it('(b) leaves a reply created before the caller began untouched', async () => {
      const session = fakeSession();
      trackSession(session);
      const earlier = fakeHandle('earlier-queued', { started: false });
      recordCreatedSpeech(session, earlier, T + 1000);
      await flushMicrotasks();
      expect(handleRejectedTranscript(session, 'echo_detected', KEEP)).toBe('keep_speech');
      expect(earlier.interrupt).not.toHaveBeenCalled();
      expect(session.interrupt).not.toHaveBeenCalled();
    });

    it('(c) never interrupts the playing reply', async () => {
      const { session, playing } = await sessionWithQueuedReply();
      handleRejectedTranscript(session, 'too_short', KEEP);
      vi.advanceTimersByTime(150);
      expect(playing.interrupt).not.toHaveBeenCalled();
    });

    it('(d) with no tracker it falls back to the double interrupt', () => {
      const session = fakeSession();
      expect(handleRejectedTranscript(session, 'too_short', KEEP)).toBe('interrupt');
      vi.advanceTimersByTime(150);
      expect(session.interrupt).toHaveBeenCalledTimes(2);
    });

    it('(d) a reply from after the caller that already started, or of unknown state, falls back', async () => {
      const cases = [
        fakeHandle('late-started', { started: true }),
        { ...fakeHandle('late-unknown', { started: false }), _waitForAuthorization: undefined },
      ].map((handle) => {
        const session = fakeSession();
        trackSession(session);
        recordCreatedSpeech(session, handle, T + 1600);
        return { session, handle };
      });
      await flushMicrotasks();
      for (const { session, handle } of cases) {
        expect(handleRejectedTranscript(session, 'too_short', KEEP)).toBe('interrupt');
        vi.advanceTimersByTime(150);
        expect(session.interrupt).toHaveBeenCalledTimes(2);
        expect(handle.interrupt).not.toHaveBeenCalled();
      }
    });

    it('(e) flag off: double interrupt as before, queued handles left to session.interrupt', async () => {
      const { session, playing, queued } = await sessionWithQueuedReply();
      const off = { ...KEEP, keepsSpeechFlag: false };
      expect(handleRejectedTranscript(session, 'too_short', off)).toBe('interrupt');
      vi.advanceTimersByTime(150);
      expect(session.interrupt).toHaveBeenCalledTimes(2);
      expect(queued.interrupt).not.toHaveBeenCalled();
      expect(playing.interrupt).not.toHaveBeenCalled();
    });

    it('reads a real SDK SpeechHandle: queued is cancelled, authorized (current) falls back', async () => {
      const session = fakeSession();
      trackSession(session);
      const queued = voice.SpeechHandle.create({ allowInterruptions: true });
      recordCreatedSpeech(session, queued, T + 1600);
      await flushMicrotasks();
      expect(cancelRepliesQueuedSince(session, T + 1500)).toBe(1);
      expect(queued.interrupted).toBe(true);

      const current = voice.SpeechHandle.create({ allowInterruptions: true });
      recordCreatedSpeech(session, current, T + 1700);
      current._authorizeGeneration();
      await flushMicrotasks();
      expect(cancelRepliesQueuedSince(session, T + 1500)).toBeNull();
      expect(current.interrupted).toBe(false);
    });
  });
});
