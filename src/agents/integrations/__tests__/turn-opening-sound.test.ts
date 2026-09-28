import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachTurnOpeningSound, turnOpeningClip } from '../turn-opening-sound.js';

const base = {
  transcript: 'My manager moved the deadline up.',
  playedLastTurn: false,
  sinceLastClipMs: 60_000,
};

describe('turnOpeningClip', () => {
  it('says "Mm" to news and "Hmm" to a question', () => {
    expect(turnOpeningClip(base, () => 0)).toBe('Mm');
    expect(turnOpeningClip({ ...base, transcript: 'Should I push back on it? ' }, () => 0)).toBe(
      'Hmm'
    );
  });

  it('never on two turns in a row, right after a backchannel, or when the coin says no', () => {
    expect(turnOpeningClip({ ...base, playedLastTurn: true }, () => 0)).toBeNull();
    expect(turnOpeningClip({ ...base, sinceLastClipMs: 800 }, () => 0)).toBeNull();
    expect(turnOpeningClip(base, () => 0.9)).toBeNull();
  });
});

describe('attachTurnOpeningSound', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup(): { session: EventEmitter; played: string[] } {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const session = new EventEmitter();
    const played: string[] = [];
    attachTurnOpeningSound(
      session,
      {
        playClip: (t) => {
          played.push(t);
          return true;
        },
        lastPlayedAt: () => 0,
      },
      () => 'It has been a long day.'
    );
    return { session, played };
  }

  it('plays when the agent is still thinking after the wait', () => {
    const { session, played } = setup();
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(700);
    expect(played).toEqual(['Mm']);
  });

  it('stays quiet when the reply starts quickly', () => {
    const { session, played } = setup();
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(300);
    session.emit('agent_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
  });

  it('skips the turn after one that had a sound, then may play again', () => {
    const { session, played } = setup();
    for (let turn = 0; turn < 3; turn++) {
      session.emit('agent_state_changed', { newState: 'thinking' });
      vi.advanceTimersByTime(700);
      session.emit('agent_state_changed', { newState: 'speaking' });
    }
    expect(played).toEqual(['Mm', 'Mm']);
  });
});

describe('attachTurnOpeningSound with reply audio', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stays quiet when the reply audio already exists, even before the speaking state', () => {
    vi.useFakeTimers({ now: 10_000 });
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const session = new EventEmitter();
    const played: string[] = [];
    let replyAudioAt = 0;
    attachTurnOpeningSound(
      session,
      { playClip: (t) => (played.push(t), true), lastPlayedAt: () => 0 },
      () => 'It has been a long day.',
      (since) => replyAudioAt >= since
    );
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(3000);
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(600);
    replyAudioAt = Date.now(); // TTS produced the first frame at 600 ms
    vi.advanceTimersByTime(100);
    expect(played).toEqual([]);
  });
});
