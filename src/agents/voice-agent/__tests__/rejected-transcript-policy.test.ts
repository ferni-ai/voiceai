import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flagOn } from '../../../config/env-flag.js';
import { validateTranscript } from '../transcript-validator.js';
import {
  decideRejectedTranscriptAction,
  handleRejectedTranscript,
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

/** Runs the real handler and returns how many times it interrupted, after the 100 ms follow-up. */
function interruptsFor(
  transcript: string,
  ctx: { lastAgentUtterance?: string; timeSinceAgentSpoke: number; isAgentSpeaking: boolean },
  input: RejectedTranscriptInput
) {
  const validation = validateTranscript(transcript, { ...ctx, expectedLanguage: 'en' });
  expect(validation.isValid).toBe(false);
  const session = fakeSession();
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
});
