import { llm } from '@livekit/agents';
import { describe, expect, it } from 'vitest';

import {
  beatIndex,
  ferniThreadsOn,
  LIFE_THREADS,
  threadDetailFor,
  type LifeThread,
} from '../ferni-life-threads.js';
import { DAY_DETAILS, soundsLow } from '../ferni-self-share.js';
import { ferniStateTurn } from '../ferni-state.js';

const at = (day: string) => new Date(`${day}T15:00:00Z`);
const THREAD: LifeThread = {
  id: 't',
  canon: 'test',
  startsOn: '2026-10-19',
  beats: ['one', 'two', 'three'],
};

describe('beatIndex', () => {
  it('moves one beat a week from the start', () => {
    expect(beatIndex(THREAD, at('2026-10-19'))).toBe(0);
    expect(beatIndex(THREAD, at('2026-10-25'))).toBe(0);
    expect(beatIndex(THREAD, at('2026-10-26'))).toBe(1);
    expect(beatIndex(THREAD, at('2026-11-08'))).toBe(2);
  });

  it('is not running before its start or after its last week', () => {
    expect(beatIndex(THREAD, at('2026-10-18'))).toBe(-1);
    expect(beatIndex(THREAD, at('2026-11-09'))).toBe(-1);
  });
});

describe('threadDetailFor', () => {
  it('keeps one caller on the same thread from week to week', () => {
    const weeks = ['2026-10-20', '2026-10-27', '2026-11-03'].map((d) =>
      threadDetailFor('caller-1', at(d))
    );
    const thread = LIFE_THREADS.find((t) => t.beats.includes(weeks[0] ?? ''));
    expect(thread).toBeDefined();
    expect(weeks).toEqual(thread?.beats.slice(0, 3));
  });

  it('spreads callers over the threads', () => {
    const heard = new Set(
      Array.from({ length: 40 }, (_, i) => threadDetailFor(`caller-${i}`, at('2026-10-20')))
    );
    expect(heard.size).toBe(LIFE_THREADS.length);
  });

  it('keeps a caller on their thread when another thread starts later', () => {
    const later: LifeThread = { ...THREAD, id: 'later', startsOn: '2026-11-02', beats: ['x', 'y'] };
    const pair = [THREAD, later];
    const callers = Array.from({ length: 20 }, (_, i) => `caller-${i}`);
    const before = callers.map((c) => threadDetailFor(c, at('2026-10-27'), pair));
    const after = callers.map((c) => threadDetailFor(c, at('2026-11-03'), pair));
    callers.forEach((_, i) => {
      if (before[i] === 'two') expect(after[i]).toBe('three');
      else expect(before[i]).toBeUndefined();
    });
    expect(before).toContain('two');
  });

  it('is undefined when no thread is running', () => {
    expect(threadDetailFor('caller-1', at('2026-10-01'))).toBeUndefined();
    expect(threadDetailFor('caller-1', at('2027-06-01'))).toBeUndefined();
  });
});

describe('the written threads', () => {
  const beats = LIFE_THREADS.flatMap((t) => t.beats);

  it('every beat is light, with no em dash or ellipsis', () => {
    for (const beat of beats) {
      expect(soundsLow(beat), beat).toBe(false);
      expect(beat, beat).not.toMatch(/—|…|\.\.\./);
    }
  });

  it('every thread names its canon and has distinct ids', () => {
    for (const t of LIFE_THREADS) expect(t.canon.length, t.id).toBeGreaterThan(10);
    expect(new Set(LIFE_THREADS.map((t) => t.id)).size).toBe(LIFE_THREADS.length);
  });

  it('names only his own people and places', () => {
    const canon = [
      'Lyle',
      'Owen',
      'Boyd',
      'Marty',
      'Hollis',
      'Wyoming',
      'Japan',
      'Tokyo',
      'Wasatch',
      'Alps',
      'Utah',
    ];
    const names = beats.join(' ').match(/\b[A-Z][a-z]+\b/g) ?? [];
    expect(names.filter((n) => !canon.includes(n))).toEqual([]);
  });
});

function callOf(...said: string[]): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  for (const s of said) ctx.addMessage({ role: 'user', content: s });
  return ctx;
}

describe('ferniStateTurn with FERNI_THREADS', () => {
  const now = at('2026-10-27');
  const session = (userId?: string) => ({
    userData: { personaId: 'ferni', userId, services: { sessionId: `s-${Math.random()}` } },
  });
  const turn = (env: Record<string, string>, userId?: string) =>
    ferniStateTurn(callOf('What are you up to today?'), session(userId), { now, env }).last;

  it("on, his day is this caller's thread beat", () => {
    const line = turn({ FERNI_STATE: 'on', FERNI_THREADS: 'on' }, 'caller-1');
    expect(line).toContain(threadDetailFor('caller-1', now) ?? 'missing');
  });

  it('off (default), his day is a fixed day detail', () => {
    expect(ferniThreadsOn({})).toBe(false);
    const line = turn({ FERNI_STATE: 'on' }, 'caller-1');
    expect(DAY_DETAILS.some((d) => line.includes(d))).toBe(true);
    expect(LIFE_THREADS.flatMap((t) => t.beats).some((b) => line.includes(b))).toBe(false);
  });
});
