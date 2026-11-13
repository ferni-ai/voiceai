/**
 * A flag may ADD to what a caller in crisis hears; it may never take any of it away.
 *
 * The seventh reader of the never-lower registry (crisis-all-flags-never-lower.test.ts): the
 * reply itself, through the real gatedReply. Fictional calls (crisis-reply.never-lower.ts) run
 * with the crisis classifier stubbed to answer none, crisis, imminent, imminent for someone
 * else, to throw, and to never answer. The model is a stub that says MODEL_SAYS, so a reply
 * is code's words exactly when the stub's are not in it.
 *
 * Which flags are checked is measured, not listed: the calls run behind a process.env that
 * records each name read, at the defaults and with every flag found so far on, until no new
 * name turns up. Every flag the gate reads is then set alone and last, as 'on' and 'live';
 * 'shadow' must change nothing; a flag that defaults on must lower nothing when turned off.
 *
 * Lowered means, turn by turn: the reply never came; code's words became the model's; 988 or
 * 911 left the reply; 911 stopped coming first; 988 or 911 left the last thing the model was
 * asked (unless code now says it); or a script kept its kind and lost one of its sentences.
 * Each turn also has a floor that holds under every setting, the defaults included, so a
 * change that lowers a reply with the flag on AND off is red too.
 *
 * Not seen here, each a way a flag could still lower a reply:
 * - the model's own words: the stub says one fixed line, so only what the model is ASKED is read;
 * - how long a reply takes, short of FIRST_WORDS_MS to its first words and BOUND_MS to its end;
 * - the text (SMS) reply path, and everything after gatedReply (988 spoken as digits, speech);
 * - what a flag does outside the reply: records, alerts, transfers, follow-up texts, recorder holds;
 * - a caller the account says is under 18, a try-first caller, a persona other than Ferni;
 * - a flag read only off a copy of the environment ({ ...env }): one site today, the
 *   classifier's plain-read prompt, which the same turn also builds from the real one;
 * - "call 911" said so that it means the opposite, beyond the NEVER_HEARD phrases;
 * - any call no line here resembles. NOT_YET_COVERED (services/safety/__tests__/
 *   crisis-flag-homes.ts) names the crisis-lane flags no call shows yet.
 */
import { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import { NOT_YET_COVERED } from '../../../services/safety/__tests__/crisis-flag-homes.js';
import {
  CRISIS_FLAGS,
  RUNNER_MARKERS,
} from '../../../services/safety/__tests__/crisis-lane-flags.js';
import {
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { CRISIS_LINE_SPOKEN } from '../../../services/safety/crisis-line-speech.js';
import { EMERGENCY_NUMBER } from '../../../services/safety/emergency-number.js';
import { gatedReply } from '../crisis-gate.js';
import {
  ANSWERS,
  CALLS,
  LOWERS_A_REPLY,
  NEVER_HEARD,
  SHOWN_ON,
  type Answer,
  type Floor,
  type ReplyCall,
} from './crisis-reply.never-lower.js';

type FlagValues = Readonly<Record<string, string>>;

const MODEL_SAYS = 'MODEL-WORDS.';
/**
 * Time here is fake and only moves when the test moves it. A reply's first words are late after
 * FIRST_WORDS_MS (the classifier gets 10 ms, a held line's hold 8), and a reply still not ended
 * after BOUND_MS never came.
 */
const FIRST_WORDS_MS = 100;
const BOUND_MS = 60_000;
const FAKED: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'Date'],
};
/** How long a held line's hold lasts here. */
const HOLD_MS = 8;
/** How production runs the gate; not manifest flags, so no case below sets them. */
const MODES = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '10',
};

let classifierCalls = 0;
const verdict =
  (risk: string, subject: string): CrisisGenerateFn =>
  async () => (classifierCalls++, JSON.stringify({ risk, subject }));
const CLASSIFIER: Record<Answer, CrisisGenerateFn> = {
  none: verdict('none', 'self'),
  crisis: verdict('crisis', 'self'),
  imminent: verdict('imminent', 'self'),
  other: verdict('imminent', 'other'),
  throws: async () => {
    classifierCalls++;
    throw new Error('provider down');
  },
  never: (_prompt, _content, signal) => {
    classifierCalls++;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  },
};

/** One turn as the caller got it. */
interface Heard {
  came: boolean;
  /** Fake milliseconds from the request to the reply's first words; -1 when none came. */
  firstWordsMs: number;
  spoken: string;
  /** The last thing the model read on its last request; empty when it was never asked. */
  asked: string;
  /** How often the gate asked the session's hold about the line (CRISIS_READ_JOINED_TURN). */
  holdAsked: number;
}

const streamOf = (text: string): ReadableStream<unknown> =>
  new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });

let sessions = 0;

/** One call through the real gate, turn by turn, on one session. */
async function place(call: ReplyCall, answer: Answer): Promise<Heard[]> {
  resetCrisisClassifierCache();
  vi.setSystemTime(new Date(2026, 5, 10, call.hour ?? 12));
  let holdAsked = 0;
  const session = {
    userData: { services: { sessionId: `never-lower-${++sessions}` } },
    // A live session with the hold installed, as crisis-read-joined-turn.ts looks for one.
    ...(call.held && {
      on: () => undefined,
      off: () => undefined,
      unfinishedTurnHoldMs: () => (holdAsked++, HOLD_MS),
    }),
  };
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  const heard: Heard[] = [];
  for (const line of call.says) {
    ctx.addMessage({ role: 'user', content: line });
    holdAsked = 0;
    let asked = '';
    const model = async (sent: llm.ChatContext): Promise<ReadableStream<unknown>> => {
      asked = (sent.items.at(-1) as llm.ChatMessage).textContent ?? '';
      return streamOf(MODEL_SAYS);
    };
    const opener = { wrap: (stream: ReadableStream<unknown>) => stream };
    const askedAt = Date.now();
    let firstWordsMs = -1;
    let spoken = '';
    let came = false;
    void (async (): Promise<void> => {
      const stream = await gatedReply(ctx.copy(), session, model as never, opener as never, {
        env: process.env as Record<string, string>,
        generate: CLASSIFIER[answer],
      });
      if (stream)
        for await (const chunk of stream as unknown as AsyncIterable<string>) {
          if (firstWordsMs < 0 && chunk) firstWordsMs = Date.now() - askedAt;
          spoken += chunk;
        }
      came = true;
    })();
    // Time moves in growing steps until the reply ends or the bound passes.
    for (let step = 0; !came && Date.now() - askedAt < BOUND_MS; step = Math.min(250, step * 2 + 1))
      await vi.advanceTimersByTimeAsync(step);
    if (!came) vi.clearAllTimers();
    heard.push({ came, firstWordsMs, spoken, asked, holdAsked });
    ctx.addMessage({ role: 'assistant', content: spoken });
  }
  return heard;
}

type Readings = Map<string, Heard[]>;

/** Every call under every classifier answer, keyed `call/answer`, with the env as it stands. */
async function placeAll(): Promise<Readings> {
  // The turn reminder picks its style lines at random: the same picks on every turn compared.
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const out: Readings = new Map();
  try {
    for (const call of CALLS)
      for (const answer of ANSWERS) out.set(`${call.name}/${answer}`, await place(call, answer));
  } finally {
    random.mockRestore();
  }
  return out;
}

const isFlag = (name: string): boolean => name in FLAG_MANIFEST && !(name in RUNNER_MARKERS);

/**
 * Every manifest flag the gate reads on the calls, recorded by a process.env that notes each
 * name looked up. A whole-object copy ({ ...env }) is not a read of each name it copies.
 */
async function flagsTheGateReads(): Promise<string[]> {
  const seen = new Set<string>();
  const pass = async (on: readonly string[]): Promise<void> => {
    for (const name of new Set([...CRISIS_FLAGS, ...seen])) vi.stubEnv(name, undefined);
    for (const name of on) vi.stubEnv(name, 'on');
    for (const [name, value] of Object.entries(MODES)) vi.stubEnv(name, value);
    const listed = new Set<string | symbol>();
    const copying = new Set<string | symbol>();
    const real = process.env;
    process.env = new Proxy(real, {
      get: (target, key) => {
        if (typeof key === 'string' && !copying.delete(key)) seen.add(key);
        return Reflect.get(target, key);
      },
      has: (target, key) => (typeof key === 'string' && seen.add(key), Reflect.has(target, key)),
      ownKeys: (target) => {
        const keys = Reflect.ownKeys(target);
        for (const key of keys) listed.add(key);
        return keys;
      },
      getOwnPropertyDescriptor: (target, key) => {
        if (listed.delete(key)) copying.add(key);
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    });
    try {
      await placeAll();
    } finally {
      process.env = real;
      vi.unstubAllEnvs();
    }
  };
  await pass([]);
  for (let size = -1, round = 0; size !== seen.size && round < 6; round++) {
    size = seen.size;
    await pass([...new Set([...CRISIS_FLAGS, ...[...seen].filter(isFlag)])]);
  }
  return [...seen].filter(isFlag).sort();
}

const says = (text: string, number: string): number =>
  text.search(new RegExp(`(?<![0-9])${number}(?![0-9])`));
const at988 = (text: string): number =>
  Math.max(says(text, '988'), text.toLowerCase().indexOf(CRISIS_LINE_SPOKEN));
const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** What a turn's reply gives the caller: each may turn true under a flag, never false. */
function gives(turn: Heard) {
  const line = at988(turn.spoken);
  const emergency = says(turn.spoken, EMERGENCY_NUMBER);
  return {
    'the reply came': turn.came,
    'first words in time': turn.firstWordsMs >= 0 && turn.firstWordsMs <= FIRST_WORDS_MS,
    "code's words": turn.came && !turn.spoken.includes(MODEL_SAYS),
    '988 spoken': line >= 0,
    '911 spoken': emergency >= 0,
    '911 first': emergency >= 0 && (line < 0 || emergency < line),
    '988 asked of the model': at988(turn.asked) >= 0,
    '911 asked of the model': says(turn.asked, EMERGENCY_NUMBER) >= 0,
  };
}
type Gives = ReturnType<typeof gives>;

/** Every way `on` gives less than `off` on one turn; empty when it never does. */
function lower(off: Heard, on: Heard): string[] {
  const [had, has] = [gives(off), gives(on)];
  const out: string[] = [];
  for (const what of Object.keys(had) as Array<keyof Gives>) {
    if (!had[what] || has[what]) continue;
    // Code saying the number itself is more than the model being asked to.
    if (what === '988 asked of the model' && has['988 spoken']) continue;
    if (what === '911 asked of the model' && has['911 spoken']) continue;
    out.push(what);
  }
  // The same kind of script: it may gain a sentence, never lose one.
  if (had["code's words"] && has["code's words"] && had['911 first'] === has['911 first'])
    for (const sentence of sentences(off.spoken))
      if (!on.spoken.includes(sentence)) out.push(`script sentence "${sentence.slice(0, 48)}"`);
  return out;
}

const MEETS: Record<Floor, (g: Gives) => boolean> = {
  emergency: (g) => g["code's words"] && g['911 first'],
  'crisis line': (g) => g["code's words"] && g['988 spoken'],
  guided: (g) => g['988 spoken'] || g['988 asked of the model'],
  none: () => true,
};

/** Every turn that misses its floor, never came, or carries words no reply may. */
function under(readings: Readings): string[] {
  const out: string[] = [];
  for (const call of CALLS)
    for (const answer of ANSWERS) {
      const key = `${call.name}/${answer}`;
      readings.get(key)!.forEach((turn, i) => {
        const set = call.floors[i];
        const floor = typeof set === 'string' ? set : set[answer];
        const given = gives(turn);
        if (!turn.came) out.push(`${key} turn ${i + 1} :: the reply never came`);
        else if (!given['first words in time'])
          out.push(`${key} turn ${i + 1} :: first words late`);
        else if (!MEETS[floor](given)) out.push(`${key} turn ${i + 1} :: below ${floor}`);
        for (const words of NEVER_HEARD)
          if (turn.spoken.toLowerCase().includes(words)) out.push(`${key} :: says "${words}"`);
      });
    }
  return out;
}

vi.useFakeTimers(FAKED);
/** The flags the gate reads, measured, so the set can't drift from what it does. */
const READ_BY_GATE = await flagsTheGateReads();
/** Unset (manifest default) unless a case sets it. */
const STUBBED = [...new Set([...CRISIS_FLAGS, ...READ_BY_GATE])];

/** Every call's turns with these flags set and every other stubbed flag unset. */
const readings = new Map<string, Readings>();
async function readUnder(flags: FlagValues): Promise<Readings> {
  const key = JSON.stringify(Object.entries(flags).sort());
  let found = readings.get(key);
  if (!found) {
    for (const name of STUBBED) vi.stubEnv(name, flags[name]);
    for (const [name, value] of Object.entries(MODES)) vi.stubEnv(name, value);
    found = await placeAll();
    vi.unstubAllEnvs();
    readings.set(key, found);
  }
  return found;
}

/** Every turn that gives less with `flags` than with `base`, and every floor `flags` breaks. */
async function losses(base: FlagValues, flags: FlagValues): Promise<string[]> {
  const off = await readUnder(base);
  const on = await readUnder(flags);
  const out = under(on);
  for (const [key, turns] of off)
    turns.forEach((turn, i) => {
      const lost = lower(turn, on.get(key)![i]);
      if (lost.length) out.push(`${key} turn ${i + 1} :: ${lost.join(', ')}`);
    });
  return out;
}

/** The `call/answer` keys a flag setting changes anything on: words, the model's request, a wait. */
async function moved(flags: FlagValues): Promise<string[]> {
  const [off, on] = [await readUnder({}), await readUnder(flags)];
  return [...off.keys()].filter(
    (key) => JSON.stringify(off.get(key)) !== JSON.stringify(on.get(key))
  );
}

const defaultOf = (name: string): string =>
  FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST].default;
const allBut = (name: string, value: string): FlagValues =>
  Object.fromEntries(READ_BY_GATE.filter((o) => o !== name).map((o) => [o, value]));
const ON_VALUES = ['on', 'live'] as const;
const knownToLower = (name: string, value: string): boolean =>
  LOWERS_A_REPLY[name]?.value === value;
const CASES = READ_BY_GATE.flatMap((name) =>
  ON_VALUES.map((value) => [name, value] as const)
).filter(([name, value]) => !knownToLower(name, value));
const DEFAULT_OFF = READ_BY_GATE.filter((name) => defaultOf(name) === 'off');
const DEFAULT_ON = READ_BY_GATE.filter((name) => defaultOf(name) !== 'off');

beforeAll(() => void vi.useFakeTimers(FAKED));
afterAll(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('no flag lowers what a caller in crisis hears', () => {
  it('reads real replies: every kind of floor, a called classifier, the same twice', async () => {
    classifierCalls = 0;
    const defaults = await placeAllUnder({});
    // The classifier stub decided turns: a grid of pattern-only lines would never call it.
    expect(classifierCalls).toBeGreaterThan(CALLS.length * 3);
    expect(defaults).toEqual(await placeAllUnder({}));
    expect(under(defaults)).toEqual([]);
    const kinds = [...defaults.values()].flat().map(gives);
    // Each check below bites only where main gives the thing it guards.
    expect(kinds.filter((g) => g["code's words"] && g['911 first']).length).toBeGreaterThan(20);
    expect(kinds.filter((g) => g["code's words"] && g['988 spoken']).length).toBeGreaterThan(40);
    expect(kinds.filter((g) => g['988 asked of the model']).length).toBeGreaterThan(8);
    expect(kinds.filter((g) => g['911 asked of the model']).length).toBeGreaterThan(3);
    expect(kinds.filter((g) => !g["code's words"]).length).toBeGreaterThan(20);
  });

  it('checks every crisis-lane flag it says it does, and no flag it says it does not', async () => {
    const defaults = await readUnder({});
    for (const [name, { call, raises }] of Object.entries(SHOWN_ON)) {
      expect(READ_BY_GATE, `${name}: the gate no longer reads it`).toContain(name);
      expect(CRISIS_FLAGS, `${name} is no longer a crisis-lane flag`).toContain(name);
      const keys = await moved({ [name]: 'on' });
      expect(
        keys.some((key) => key.startsWith(`${call}/`)),
        `${name}=on changes no turn of "${call}"`
      ).toBe(true);
      if (!raises) continue;
      const [answer, floor] = raises;
      const turn = (r: Readings): Gives => gives(r.get(`${call}/${answer}`)![0]);
      expect(MEETS[floor](turn(defaults)), `${call}/${answer} is ${floor} without ${name}`).toBe(
        false
      );
      expect(MEETS[floor](turn(await readUnder({ [name]: 'on' }))), `${name}=on: ${floor}`).toBe(
        true
      );
    }
    // A flag that changes a reply here is checked here: give it a SHOWN_ON row.
    for (const name of NOT_YET_COVERED.filter((n) => READ_BY_GATE.includes(n)))
      for (const value of [...ON_VALUES, 'off'])
        expect(await moved({ [name]: value }), `${name}=${value} changes a reply`).toEqual([]);
  });

  it.each(CASES)('%s=%s alone lowers no reply', async (name, value) => {
    expect(await losses({}, { [name]: value })).toEqual([]);
  });

  it.each(CASES)(
    '%s=%s on top of every other flag the gate reads lowers no reply',
    async (name, value) => {
      const base = allBut(name, value);
      expect(await losses(base, { ...base, [name]: value })).toEqual([]);
    }
  );

  it.each(DEFAULT_ON)('%s=off lowers no reply', async (name) => {
    expect(await losses({}, { [name]: 'off' })).toEqual([]);
  });

  it.each(DEFAULT_OFF)('%s=shadow changes no reply', async (name) => {
    expect(await moved({ [name]: 'shadow' })).toEqual([]);
  });

  it.each(Object.entries(LOWERS_A_REPLY))(
    '%s is off by default and still lowers',
    async (name, known) => {
      expect(defaultOf(name)).toBe('off');
      // Fixed? Delete the LOWERS_A_REPLY row and give the flag a SHOWN_ON row.
      expect(await losses({}, { [name]: known.value })).toEqual(known.lost);
    }
  );
});

/** The calls with only these flags set, read fresh (never from the cache). */
async function placeAllUnder(flags: FlagValues): Promise<Readings> {
  for (const name of STUBBED) vi.stubEnv(name, flags[name]);
  for (const [name, value] of Object.entries(MODES)) vi.stubEnv(name, value);
  try {
    return await placeAll();
  } finally {
    vi.unstubAllEnvs();
  }
}
