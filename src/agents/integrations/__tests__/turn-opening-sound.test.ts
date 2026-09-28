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
