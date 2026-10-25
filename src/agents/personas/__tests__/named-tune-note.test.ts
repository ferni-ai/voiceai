/**
 * NAMED_TUNE: the caller notices Ferni's whistle, he asks them to name it,
 * the name is kept per caller with the tune it was, "stop whistling" turns
 * the sounds off for them, and the name comes up again only rarely, on a
 * light turn. Off, nothing changes and nothing is read or written.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** NAMED_TUNE_NOTE lines, captured from the module logger. */
const logged = vi.hoisted(() => [] as Array<[Record<string, unknown>, string]>);
vi.mock('../../../utils/safe-logger.js', async (orig) => {
  const real = await orig<Record<string, unknown>>();
  const logger = (): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === 'info'
            ? (fields: Record<string, unknown>, msg: string) => logged.push([fields, msg])
            : prop === 'child'
              ? logger
              : () => undefined,
      }
    );
  return { ...real, createLogger: logger };
});
import {
  asksToStopTune,
  MENTION_EVERY,
  namedTuneNote,
  remarksOnTune,
  tuneNameFrom,
  type TuneTurn,
} from '../named-tune-note.js';
import {
  forgetTuneCalls,
  namedTuneFor,
  presenceSoundsHeld,
  tunePlayed,
  type TuneRecord,
  type TuneStore,
} from '../../../services/session/tune-state.js';

const ON = { NAMED_TUNE: 'on' };
const TUNE = 'whistle:people-whistling-39089__1.wav';

/** An in-memory store, one record per user, that counts its reads and writes. */
function memoryStore(seed: Record<string, TuneRecord> = {}) {
  const records = new Map(Object.entries(seed));
  const calls = { load: 0, save: 0 };
  const store: TuneStore = {
    load: async (userId) => {
      calls.load++;
      return records.get(userId) ?? null;
    },
    save: async (userId, patch) => {
      calls.save++;
      records.set(userId, { ...records.get(userId), ...patch });
    },
  };
  return { store, records, calls };
}

/** Let the record read (a few promise hops) settle. */
const flush = (): Promise<unknown> =>
  [1, 2, 3, 4, 5].reduce<Promise<unknown>>((p) => p.then(), Promise.resolve());

const turn = (sessionId: string, words: string, extra: Partial<TuneTurn> = {}): TuneTurn => ({
  sessionId,
  userId: 'u1',
  words,
  careful: false,
  verified: true,
  priorCalls: 10,
  ...extra,
});

/** A call: its first turn reads the caller's record; then the tune plays. */
async function call(sessionId: string, store: TuneStore, env: Record<string, string> = ON) {
  const note = (words: string, extra: Partial<TuneTurn> = {}) =>
    namedTuneNote(turn(sessionId, words, extra), store, env);
  note('hey, how are you');
  await flush();
  return { note, whistle: (id = TUNE) => tunePlayed(sessionId, id, 'whistle', env) };
}

beforeEach(() => {
  forgetTuneCalls();
  logged.length = 0;
});
const tuneLog = () => logged.filter(([, msg]) => msg === 'NAMED_TUNE_NOTE').map(([f]) => f);
afterEach(() => vi.restoreAllMocks());

describe('noticing the whistle', () => {
  it.each([
    'were you whistling?',
    'Were you just whistling?',
    'are you humming?',
    'was that you whistling',
    "what's that tune?",
    "you're whistling again",
    'did you just hum?',
    'nice whistling',
    "who's humming",
  ])('"%s" is a remark on his tune', (words) => {
    expect(remarksOnTune(words)).toBe(true);
  });

  it.each([
    'I was whistling in the shower',
    'my boss is a whistle blower',
    'she was a whistleblower at the bank',
    'a hummingbird was at the feeder',
    'are you humming bird fans?',
    'it has all the bells and whistles',
    'clean as a whistle',
    'my son hums all day',
    'being human is hard',
    "what's that song on the radio",
  ])('"%s" is not', (words) => {
    expect(remarksOnTune(words)).toBe(false);
  });
});

describe('asking him to stop', () => {
  it.each(['stop whistling', "please don't hum", 'can you quit humming?', 'no more whistling'])(
    '"%s" is a stop',
    (words) => expect(asksToStopTune(words)).toBe(true)
  );
  it.each([
    "I can't stop humming that song",
    "I don't hum",
    "we don't whistle at work",
    'the whistle blower',
  ])('"%s" is not', (words) => expect(asksToStopTune(words)).toBe(false));
});

describe('the name in their answer', () => {
  it.each([
    ['Pharmacy Line Blues', 'Pharmacy Line Blues'],
    ["Let's call it Pharmacy Line Blues.", 'Pharmacy Line Blues'],
    ['Sure, how about "Tuesday Shuffle"!', 'Tuesday Shuffle'],
    ['ha, name it Gary', 'Gary'],
  ])('"%s" names it %s', (words, name) => expect(tuneNameFrom(words)).toBe(name));

  it('keeps at most 40 characters of their words', () => {
    const name = tuneNameFrom('Supercalifragilisticexpialidocious Extraordinary Tune') ?? '';
    expect(name.length).toBeLessThanOrEqual(40);
    expect(name.startsWith('Supercalifragilisticexpialidocious')).toBe(true);
  });

  it('a bare yes leaves the question open; a no or a change of subject names nothing', () => {
    expect(tuneNameFrom('yeah!')).toBe('');
    expect(tuneNameFrom('nah')).toBeNull();
    expect(tuneNameFrom('why would I name it?')).toBeNull();
    expect(tuneNameFrom('anyway my mom called today about the doctor appointment')).toBeNull();
  });
});

describe('naming flow, flag on', () => {
  it('asks to name it, stores the name with the tune, and the next call plays that tune', async () => {
    const { store, records } = memoryStore();
    const first = await call('s1', store);
    first.whistle();
    expect(first.note('were you just whistling?')).toContain('Want to name it?');
    const named = first.note("let's call it Pharmacy Line Blues");
    expect(named).toContain('"Pharmacy Line Blues"');
    await flush();
    expect(records.get('u1')).toMatchObject({ tuneId: TUNE, name: 'Pharmacy Line Blues' });

    expect(namedTuneFor('s2', ON)).toBeNull(); // nothing read yet on the next call
    await call('s2', store);
    expect(namedTuneFor('s2', ON)).toBe(TUNE);
  });

  it('a bare yes waits for the name on the next turn', async () => {
    const { store, records } = memoryStore();
    const c = await call('s1', store);
    c.whistle();
    c.note('was that you whistling');
    expect(c.note('yes!')).toBe('');
    expect(c.note('Tuesday Shuffle')).toContain('"Tuesday Shuffle"');
    await flush();
    expect(records.get('u1')?.name).toBe('Tuesday Shuffle');
  });

  it('a remark with no whistle this call asks nothing (music, someone else)', async () => {
    const { store } = memoryStore();
    const c = await call('s1', store);
    expect(c.note("what's that tune?")).toBe('');
  });

  it('a named tune he is caught whistling again is owned by its name, not re-named', async () => {
    const { store } = memoryStore({ u1: { tuneId: TUNE, name: 'Pharmacy Line Blues' } });
    const c = await call('s1', store);
    c.whistle();
    const note = c.note('were you whistling?');
    expect(note).toContain('"Pharmacy Line Blues"');
    expect(note).not.toContain('name it');
  });
});

describe('the ask, the name, and no made-up past', () => {
  it('owning it asks them to name it, ends on the question, and forbids an origin', async () => {
    const { store } = memoryStore();
    const c = await call('s1', store);
    c.whistle();
    const note = c.note("Okay, I'm back. Wait, were you just whistling? What's that tune?");
    expect(note).toContain('Want to name it?');
    expect(note).toContain('end your reply on that question');
    expect(note).toContain(
      'never give it a history, an origin, or a memory of anyone whistling it'
    );
  });

  it('their name is the name: kept as they said it, said back, never replaced with a history', async () => {
    const { store, records } = memoryStore();
    const c = await call('s1', store);
    c.whistle();
    c.note('were you just whistling?');
    const named = c.note("Let's call it the sock song.");
    expect(named).toContain('"the sock song"');
    expect(named).toContain('Take their name as is');
    expect(named).toContain("Don't rename it or correct them");
    expect(named).toContain('never give it a history, an origin');
    await flush();
    expect(records.get('u1')).toMatchObject({ tuneId: TUNE, name: 'the sock song' });
  });

  it('caught whistling the named tune again: owned by their name, still no origin', async () => {
    const { store } = memoryStore({ u1: { tuneId: TUNE, name: 'the sock song' } });
    const c = await call('s1', store);
    c.whistle();
    const note = c.note('were you whistling?');
    expect(note).toContain('"the sock song", the tune they named');
    expect(note).toContain('never give it a history');
  });
});

describe('decision log (NAMED_TUNE_NOTE)', () => {
  it('logs the step for each note, and why a remark got none, never their words', async () => {
    const { store } = memoryStore();
    const c = await call('s1', store);
    expect(tuneLog()).toEqual([]); // "hey, how are you": no note, no remark, no line
    expect(c.note("what's that tune?")).toBe('');
    c.whistle();
    c.note('were you just whistling?');
    c.note("let's call it Pharmacy Line Blues");
    namedTuneNote(turn('s7', 'were you whistling?', { verified: false }), store, ON);
    expect(tuneLog()).toEqual([
      { sessionId: 's1', step: 'skip:nothing_played' },
      { sessionId: 's1', step: 'remark' },
      { sessionId: 's1', step: 'named' },
      { sessionId: 's7', step: 'skip:not_verified_owner' },
    ]);
    expect(JSON.stringify(logged)).not.toMatch(/Pharmacy|whistling\?|tune\?/);
  });

  it('logs nothing with the flag off', async () => {
    const { store } = memoryStore();
    const c = await call('s1', store, {});
    c.whistle();
    expect(c.note('were you whistling?')).toBe('');
    expect(tuneLog()).toEqual([]);
  });
});

describe('opt-out', () => {
  it('"stop whistling" turns the sounds off for that caller, kept for the next call', async () => {
    const { store, records } = memoryStore();
    const c = await call('s1', store);
    c.whistle();
    expect(presenceSoundsHeld('s1', ON)).toBe(false);
    expect(c.note('can you stop whistling')).toContain('stop the whistling');
    expect(presenceSoundsHeld('s1', ON)).toBe(true);
    await flush();
    expect(records.get('u1')?.soundsOff).toBe(true);

    await call('s2', store);
    expect(presenceSoundsHeld('s2', ON)).toBe(true);
  });
});

describe('mentioning the name', () => {
  const seeded = (mentionedAtCall: number) =>
    memoryStore({ u1: { tuneId: TUNE, name: 'Pharmacy Line Blues', mentionedAtCall } });

  it('on a light turn after his tune, once every few calls', async () => {
    const { store, records } = seeded(10 - MENTION_EVERY);
    const c = await call('s1', store);
    c.whistle();
    expect(c.note('ha, okay, so then we went to the beach')).toContain(
      'whistling Pharmacy Line Blues again'
    );
    expect(c.note('and the water was great')).toBe(''); // once a call
    await flush();
    expect(records.get('u1')?.mentionedAtCall).toBe(10);
  });

  it('not when it came up in the last few calls', async () => {
    const { store } = seeded(9);
    const c = await call('s1', store);
    c.whistle();
    expect(c.note('so then we went to the beach')).toBe('');
  });

  it('never on a crisis turn, a heavy voice or hard words', async () => {
    const { store } = seeded(0);
    const c = await call('s1', store);
    c.whistle();
    expect(c.note('I want to end it all', { careful: true })).toBe('');
    expect(c.note('so then we went to the beach', { mood: 'sad' })).toBe('');
    expect(c.note("I'm so stressed and exhausted")).toBe('');
    // A crisis turn asks nothing about the tune either.
    expect(c.note('were you whistling?', { careful: true })).toBe('');
  });

  it('only after the named tune itself played', async () => {
    const { store } = seeded(0);
    const c = await call('s1', store);
    c.whistle('take:sung-hum:0');
    expect(c.note('so then we went to the beach')).toBe('');
  });
});

describe('who it is for', () => {
  it('an unverified caller gets nothing, and nothing is read or kept', async () => {
    const { store, calls } = memoryStore();
    const c = await call('s1', store);
    c.whistle();
    expect(c.note('were you whistling?', { verified: false })).toBe('');
    const other = memoryStore();
    namedTuneNote(turn('s9', 'hey', { verified: false }), other.store, ON);
    tunePlayed('s9', TUNE, 'whistle', ON);
    expect(
      namedTuneNote(turn('s9', 'were you whistling?', { verified: false }), other.store, ON)
    ).toBe('');
    expect(namedTuneNote(turn('s9', 'stop whistling', { verified: false }), other.store, ON)).toBe(
      ''
    );
    expect(other.calls).toEqual({ load: 0, save: 0 });
    expect(calls.save).toBe(0);
  });

  it('a session whose memory is held (MINOR_CARE) gets nothing', async () => {
    const { store, calls } = memoryStore();
    namedTuneNote(turn('s1', 'hey', { memoryHeld: true }), store, ON);
    tunePlayed('s1', TUNE, 'whistle', ON);
    expect(namedTuneNote(turn('s1', 'were you whistling?', { memoryHeld: true }), store, ON)).toBe(
      ''
    );
    expect(calls).toEqual({ load: 0, save: 0 });
  });
});

describe('flag off', () => {
  it('no note, no read, no write, no held sounds, no named tune', async () => {
    const { store, calls } = memoryStore({ u1: { tuneId: TUNE, name: 'X', soundsOff: true } });
    const c = await call('s1', store, {});
    c.whistle();
    expect(c.note('were you whistling?')).toBe('');
    expect(c.note('stop whistling')).toBe('');
    expect(calls).toEqual({ load: 0, save: 0 });
    expect(presenceSoundsHeld('s1', {})).toBe(false);
    expect(namedTuneFor('s1', {})).toBeNull();
  });
});
