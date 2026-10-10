import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachTurnOpeningSound,
  earlyOpeningClip,
  earlyOpeningWaitMs,
  turnOpenedSince,
  turnOpeningClip,
  turnOpeningSoundEnabled,
} from '../turn-opening-sound.js';

const base = {
  transcript: 'My manager moved the deadline up.',
  playedLastTurn: false,
  sinceLastClipMs: 60_000,
};

describe('turnOpeningSoundEnabled', () => {
  it('is off unless TURN_OPENING_SOUND=on: replies land on top of the clip', () => {
    // dev call 2026-10-04: the reply was ready 20-250 ms after every "Mm", so
    // the clip collided with the start of Ferni's own sentence
    expect(turnOpeningSoundEnabled({})).toBe(false);
    expect(turnOpeningSoundEnabled({ TURN_OPENING_SOUND: 'off' })).toBe(false);
    expect(turnOpeningSoundEnabled({ TURN_OPENING_SOUND: 'yes' })).toBe(false);
    expect(turnOpeningSoundEnabled({ TURN_OPENING_SOUND: 'on' })).toBe(true);
  });
});

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

  it('never plays over the caller: they kept talking after a pause', () => {
    const { session, played } = setup();
    // ink's early end-of-turn starts a preemptive reply at a thinking pause...
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(300);
    // ...but the caller was only pausing
    session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
  });

  it('does not fire while the caller is speaking, even if thinking began then', () => {
    const { session, played } = setup();
    session.emit('user_state_changed', { newState: 'speaking' });
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(1000);
    expect(played).toEqual([]);
    // once they stop and the agent is still thinking, the next wait may play
    session.emit('user_state_changed', { newState: 'listening' });
    session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(700);
    expect(played).toEqual(['Mm']);
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

describe('early mode (TURN_OPENING_SOUND=early)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('is on only when asked, with a 120 ms default wait', () => {
    expect(earlyOpeningWaitMs({})).toBeNull();
    expect(earlyOpeningWaitMs({ TURN_OPENING_SOUND: 'on' })).toBeNull();
    expect(earlyOpeningWaitMs({ TURN_OPENING_SOUND: 'early' })).toBe(120);
    expect(earlyOpeningWaitMs({ TURN_OPENING_SOUND: 'early', TURN_OPENING_EARLY_MS: '80' })).toBe(
      80
    );
    expect(turnOpeningSoundEnabled({ TURN_OPENING_SOUND: 'early' })).toBe(true);
  });

  it('picks the clip from what the caller said', () => {
    expect(earlyOpeningClip('My grandmother died last night.', null)).toBe('Mm');
    expect(earlyOpeningClip('Guess what, I got the job!', null)).toBe('Oh');
    expect(earlyOpeningClip('Work was rough, I am exhausted.', null)).toBe('Oof');
    expect(earlyOpeningClip('Should I push back on my manager about it?', null)).toBe('Hmm');
    expect(earlyOpeningClip('We went hiking on Saturday.', null)).toBe('Mm');
  });

  it('stays quiet for a laugh, a short turn, a quick question, or a repeat of the last clip', () => {
    expect(earlyOpeningClip('haha that is so you', null)).toBeNull();
    expect(earlyOpeningClip('Okay.', null)).toBeNull();
    expect(earlyOpeningClip('How are you?', null)).toBeNull();
    expect(earlyOpeningClip('My grandmother died last night.', 'Mm')).toBeNull();
    // "unhappy"-style substrings never read as a category word
    expect(earlyOpeningClip('We sadly missed the train today.', null)).toBe('Mm');
    expect(earlyOpeningClip('We went hiking on Saturday.', 'Mm')).toBe('Yeah');
  });

  interface Rig {
    session: EventEmitter;
    played: string[];
    holds: number[];
    setReplyTextAt(t: number): void;
    say(text: string): void;
  }

  function rig(): Rig {
    vi.useFakeTimers({ now: 10_000 });
    const session = new EventEmitter();
    const played: string[] = [];
    const holds: number[] = [];
    let replyTextAt = 0;
    let transcript = 'Work was rough, I am exhausted.';
    attachTurnOpeningSound(
      session,
      { playClip: (t) => (played.push(t), true), lastPlayedAt: () => 0 },
      () => transcript,
      () => false,
      {
        waitMs: 120,
        replyTextSince: (since) => replyTextAt >= since,
        clipMs: () => 450,
        holdReply: (ms) => holds.push(ms),
      }
    );
    return {
      session,
      played,
      holds,
      setReplyTextAt: (t) => (replyTextAt = t),
      say: (text) => {
        transcript = text;
        session.emit('user_state_changed', { newState: 'speaking' });
        vi.advanceTimersByTime(1500);
        session.emit('user_state_changed', { newState: 'listening' });
        vi.advanceTimersByTime(400);
      },
    };
  }

  it('plays 120 ms after the commit and holds the reply until the clip ends', () => {
    const r = rig();
    r.say('Work was rough, I am exhausted.');
    r.session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(110);
    expect(r.played).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(r.played).toEqual(['Oof']);
    expect(r.holds).toEqual([450]);
    expect(turnOpenedSince(r.session, 10_000)).toBe(true);
  });

  it('stays quiet when the reply words already reached TTS', () => {
    const r = rig();
    r.say('Work was rough, I am exhausted.');
    r.session.emit('agent_state_changed', { newState: 'thinking' });
    r.setReplyTextAt(Date.now() + 50);
    vi.advanceTimersByTime(200);
    expect(r.played).toEqual([]);
    expect(r.holds).toEqual([]);
  });

  it('never on two caller turns in a row, nor twice in one turn', () => {
    const r = rig();
    const turns = [
      'Work was rough, I am exhausted.',
      'We went hiking on Saturday.',
      'We went hiking on Sunday too.',
    ];
    for (const text of turns) {
      r.say(text);
      r.session.emit('agent_state_changed', { newState: 'thinking' });
      vi.advanceTimersByTime(200);
      r.session.emit('agent_state_changed', { newState: 'speaking' });
      // a tool call puts the agent back to thinking in the same turn
      r.session.emit('agent_state_changed', { newState: 'thinking' });
      vi.advanceTimersByTime(200);
      r.session.emit('agent_state_changed', { newState: 'speaking' });
    }
    expect(r.played).toEqual(['Oof', 'Mm']);
  });

  it('never over the caller: they carried on after the commit', () => {
    const r = rig();
    r.say('Work was rough, I am exhausted.');
    r.session.emit('agent_state_changed', { newState: 'thinking' });
    vi.advanceTimersByTime(60);
    r.session.emit('user_state_changed', { newState: 'speaking' });
    vi.advanceTimersByTime(500);
    expect(r.played).toEqual([]);
  });
});
