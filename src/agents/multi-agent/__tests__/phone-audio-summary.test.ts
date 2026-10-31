/**
 * PHONE_AUDIO_SUMMARY: one line per phone call when the session closes, with
 * the experiment arms and the pause / interruption counts the A/B compares.
 */
import { EventEmitter } from 'node:events';
import { voice } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.fn();
vi.mock('../../../utils/safe-logger.js', () => ({
  getLogger: () => ({ info, warn: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

const { notePhoneNoiseCancel, watchPhoneAudio } = await import('../phone-audio-summary.js');

const E = voice.AgentSessionEventTypes;

function call(sessionId: string, tuning: boolean) {
  const session = new EventEmitter();
  watchPhoneAudio(session as never, sessionId, tuning);
  return session;
}

const summaries = () => info.mock.calls.filter(([, msg]) => msg === 'PHONE_AUDIO_SUMMARY');

describe('watchPhoneAudio', () => {
  beforeEach(() => info.mockClear());

  it('counts false pauses, resumes and model interruptions, then logs once at close', () => {
    notePhoneNoiseCancel('s-nc');
    const session = call('s-nc', true);
    session.emit(E.AgentFalseInterruption, { resumed: true });
    session.emit(E.AgentFalseInterruption, { resumed: false });
    session.emit(E.AgentFalseInterruption, { resumed: true });
    session.emit(E.OverlappingSpeech, { isInterruption: true });
    session.emit(E.OverlappingSpeech, { isInterruption: false });
    expect(summaries()).toHaveLength(0);
    session.emit(E.Close, {});
    session.emit(E.Close, {});
    expect(summaries()).toEqual([
      [
        {
          sessionId: 's-nc',
          nc: 'on',
          tuning: 'on',
          falsePauses: 3,
          resumed: 2,
          interruptions: 1,
        },
        'PHONE_AUDIO_SUMMARY',
      ],
    ]);
  });

  it('reports nc and tuning off with zero counts for an untouched call', () => {
    call('s-plain', false).emit(E.Close, {});
    expect(summaries()[0]?.[0]).toEqual({
      sessionId: 's-plain',
      nc: 'off',
      tuning: 'off',
      falsePauses: 0,
      resumed: 0,
      interruptions: 0,
    });
  });

  it('forgets the noise cancellation mark when the call ends', () => {
    notePhoneNoiseCancel('s-again');
    call('s-again', false).emit(E.Close, {});
    call('s-again', false).emit(E.Close, {});
    expect(summaries().map(([fields]) => (fields as { nc: string }).nc)).toEqual(['on', 'off']);
  });
});
