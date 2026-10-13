import { ReadableStream } from 'node:stream/web';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dj = vi.hoisted(() => ({ active: false }));
vi.mock('../../../audio/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../audio/index.js')>()),
  getDJController: () => ({ isMusicActive: () => dj.active, getState: () => ({}) }),
}));

import {
  armSilenceReply,
  createPresenceCap,
  filterSilenceReply,
  isBarePresenceCheck,
} from '../presence-check.js';
import { silenceResponseBlocked } from '../silence-response-blockers.js';
import {
  musicIsPlaying,
  remarkTooSoon,
  SILENCE_REMARK_MIN_GAP_MS,
} from '../silence-remark-guard.js';

/** Every unprompted line Ferni said on Seth's prod call, 2026-10-12. */
const BARE_FROM_THE_CALL = ['Mm?', 'Yeah?', 'You there?', 'Yeah? You there?'];
const NOT_BARE_FROM_THE_CALL = [
  'You still there, or did the music put you to sleep too?',
  'I am just, uh, sipping some cold coffee and watching the light change. it is quiet.',
  "You, uh, called me Freddy. [laughter] Who's Freddy?",
];

describe('isBarePresenceCheck', () => {
  it('is true for the bare checks from the 2026-10-12 call and their kin', () => {
    for (const t of [
      ...BARE_FROM_THE_CALL,
      'Mm? You still there?',
      'Still with me?',
      'Hello?',
      'Hmm?',
      'Mhm?',
      '<emotion value="curious"/>Mm?',
      'Hey, you there?',
      'Uh, can you hear me?',
    ])
      expect(isBarePresenceCheck(t), t).toBe(true);
  });

  it('is false when the line says anything more, or is not a question', () => {
    for (const t of [
      ...NOT_BARE_FROM_THE_CALL,
      'Want me to turn it off?',
      'Mm, Sunday is good for that.',
      'Mm.',
      'Yeah.',
      'Hanging in there.',
      'Are you there yet?',
      '',
      '   ',
    ])
      expect(isBarePresenceCheck(t), t).toBe(false);
  });

  it('is word-bounded: words that start like a filler are content', () => {
    expect(isBarePresenceCheck('Okra?')).toBe(false);
    expect(isBarePresenceCheck('Sorry?')).toBe(false);
    expect(isBarePresenceCheck('Oh, hello there, mmhmm, history?')).toBe(false);
  });
});

describe('remarkTooSoon', () => {
  it('holds a remark for a minute after the last one', () => {
    expect(SILENCE_REMARK_MIN_GAP_MS).toBe(60_000);
    expect(remarkTooSoon(undefined, 1_000_000)).toBe(false);
    expect(remarkTooSoon(1_000_000, 1_000_000 + 22_000)).toBe(true); // 09:52:33 → 09:52:55
    expect(remarkTooSoon(1_000_000, 1_000_000 + 59_999)).toBe(true);
    expect(remarkTooSoon(1_000_000, 1_000_000 + 60_000)).toBe(false);
  });
});

describe('silenceResponseBlocked: music', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    dj.active = false;
    delete process.env.SILENCE_REMARK_GUARD;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const sid = () => `guard-${Math.random().toString(36).slice(2)}`;

  it('reads the DJ controller', () => {
    expect(musicIsPlaying()).toBe(false);
    dj.active = true;
    expect(musicIsPlaying()).toBe(true);
  });

  it('flag on: no remark while the music the caller asked for is playing', () => {
    process.env.SILENCE_REMARK_GUARD = 'on';
    dj.active = true;
    expect(silenceResponseBlocked(sid(), undefined, 20)).toBe(true);
    dj.active = false;
    expect(silenceResponseBlocked(sid(), undefined, 20)).toBe(false);
  });

  it('flag off: music does not block (unchanged)', () => {
    dj.active = true;
    expect(silenceResponseBlocked(sid(), undefined, 20)).toBe(false);
  });
});

async function spoken(session: object, says: string): Promise<string> {
  const reply = new ReadableStream<object>({
    start(c) {
      c.enqueue({ id: 'c', delta: { role: 'assistant', content: says } });
      c.close();
    },
  });
  let text = '';
  for await (const c of filterSilenceReply(session, reply) as unknown as AsyncIterable<{
    delta?: { content?: string };
  }>)
    text += c.delta?.content ?? '';
  return text;
}

describe('filterSilenceReply: bare checks', () => {
  it('drops a bare check armed with dropBare, keeps a remark with content', async () => {
    for (const says of BARE_FROM_THE_CALL) {
      const s = {};
      armSilenceReply(s, true, Date.now(), true);
      expect(await spoken(s, says), says).toBe('');
    }
    for (const says of NOT_BARE_FROM_THE_CALL) {
      const s = {};
      armSilenceReply(s, true, Date.now(), true);
      expect(await spoken(s, says), says).toBe(says);
    }
  });

  it('without dropBare (flag off, or the audio dropped) a bare check goes out', async () => {
    const s = {};
    armSilenceReply(s, true, Date.now(), false);
    expect(await spoken(s, 'You there?')).toBe('You there?');
  });

  it('a reply to the caller (nothing armed) is never touched', async () => {
    expect(await spoken({}, 'Mm?')).toBe('Mm?');
  });
});

describe('createPresenceCap with SILENCE_REMARK_GUARD', () => {
  it('flag off: never holds, never arms', async () => {
    const s = {};
    const cap = createPresenceCap(s, undefined, {});
    cap.cap({ instructions: 'say something' });
    expect(cap.held()).toBe(false);
    expect(await spoken(s, 'Mm?')).toBe('Mm?');
  });

  it('flag on: holds the next remark for a minute and drops a bare check', async () => {
    vi.useFakeTimers();
    try {
      const s = {};
      const cap = createPresenceCap(s, undefined, { SILENCE_REMARK_GUARD: 'on' });
      expect(cap.held()).toBe(false);
      cap.cap({ instructions: 'say something' });
      expect(await spoken(s, 'Mm?')).toBe('');
      cap.callerSpoke(); // a caller turn does not reset the minute
      vi.advanceTimersByTime(30_000);
      expect(cap.held()).toBe(true);
      vi.advanceTimersByTime(30_000);
      expect(cap.held()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
