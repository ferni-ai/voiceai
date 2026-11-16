/**
 * The reply never-lower grid, shared by its four test files: the calls placed through the real
 * gate, the guards on what a reply may reach (model clients, network, fetch), the counted reads
 * (environment, clock, session) and the readings compared. crisis-reply-never-lower.test.ts holds
 * the header that says what the grid reads, what counts as lowered and what it does not cover.
 *
 * Split from that one file for CI time: vitest shards by file, and under coverage the whole grid
 * ran ~17 min in one shard, against a 25-min job limit. The rows are unchanged; each file calls
 * installGrid() and carries the gemini-config stub (a vi.mock factory, which cannot be shared).
 * A file that misses either is refused: no reading without installGrid(), no run without the stub.
 */
import { llm } from '@livekit/agents';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import {
  MEMORY_ONLY,
  NOT_YET_COVERED,
} from '../../../services/safety/__tests__/crisis-flag-homes.js';
import {
  CRISIS_FLAGS,
  RUNNER_MARKERS,
} from '../../../services/safety/__tests__/crisis-lane-flags.js';
import { resetCrisisAdjudicatorCache } from '../../../services/safety/crisis-adjudicator.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetClassifierBlocked } from '../../../services/safety/crisis-classifier-blocked.js';
import { resetEasingReads } from '../../../services/safety/crisis-classifier-only-live.js';
import {
  type CrisisGenerateFn,
  resetCrisisClassifierCache,
} from '../../../services/safety/crisis-classifier.js';
import { resetConfirmedCallRisk } from '../../../services/safety/crisis-confirmed-risk.js';
import { resetGradedResponse } from '../../../services/safety/crisis-graded-shadow.js';
import { resetGroundedRelease } from '../../../services/safety/crisis-grounded-release.js';
import { resetGroundedScreen } from '../../../services/safety/crisis-grounded-screen.js';
import { resetImminentAgreement } from '../../../services/safety/crisis-imminent-agreement.js';
import { CRISIS_LINE_SPOKEN } from '../../../services/safety/crisis-line-speech.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { resetSecondReadTurns } from '../../../services/safety/crisis-second-read-turn.js';
import { resetWhoReads } from '../../../services/safety/crisis-who.js';
import { EMERGENCY_NUMBER } from '../../../services/safety/emergency-number.js';
import { gatedReply } from '../crisis-gate.js';
import { reached, STUBBED_CLIENT } from './crisis-reply-never-lower.reach.js';
import {
  type Answer,
  ANSWERS,
  CALLS,
  CLOCK_READ_BY,
  type Floor,
  LOWERS_A_REPLY,
  NEVER_HEARD,
  type ReplyCall,
  SESSION_FIELDS_READ,
} from './crisis-reply.never-lower.js';

export type FlagValues = Readonly<Record<string, string>>;
export const NO_NETWORK = 'the never-lower grid reaches no network';
export const realConnect = net.Socket.prototype.connect;
export const realFetch = globalThis.fetch;
net.Socket.prototype.connect = function (this: net.Socket): net.Socket {
  reached.connections += 1;
  globalThis.queueMicrotask(() => this.destroy(new Error(NO_NETWORK)));
  return this;
} as typeof realConnect;
globalThis.fetch = (async () => {
  reached.fetches += 1;
  throw new Error(NO_NETWORK);
}) as typeof realFetch;
/** Set while a reply is being made, so a background timer's own clock reads are not counted. */
export const inReply = new AsyncLocalStorage<true>();
/**
 * Copies of the environment made while a reply is being made, and the function that made each.
 * A spread, Object.assign, keys, entries and JSON.stringify all list its names, and that is
 * what is counted. A flag read off a copy is not a read of the environment, so nothing here
 * would ever set it.
 */
export const copies = { made: 0, by: new Set<string>() };
export const realEnv = process.env;
process.env = new Proxy(realEnv, {
  ownKeys: (target) => {
    if (inReply.getStore()) {
      copies.made += 1;
      const frames = (new Error().stack ?? '').split('\n').slice(1);
      const frame = frames.find((line) => line.includes('/') && !line.includes(__filename)) ?? '';
      const [, by, file] = /at (\S+) \(.*?(src\/[^:)?]+)/.exec(frame) ?? [];
      copies.by.add(by ? `${by} in ${file}` : frame.trim());
    }
    return Reflect.ownKeys(target);
  },
  // Written to the real one directly: process.env refuses the write a proxy would forward.
  set: (target, key, value) => Reflect.set(target, key, value),
});
/**
 * The ways a Date gives up its hour, weekday, date or timezone. Each still answers; the asking
 * is counted while a reply is being made. Not the instant (getTime, valueOf, toISOString),
 * which timestamps need.
 */
export const CLOCK_READS = [
  ...['Hours', 'Minutes', 'Day', 'Date', 'Month', 'FullYear'].flatMap((part) => [
    `get${part}`,
    `getUTC${part}`,
  ]),
  'getTimezoneOffset',
  'toLocaleTimeString',
  'toLocaleDateString',
  'toLocaleString',
  'toTimeString',
  'toDateString',
  'toUTCString',
  'toString',
] as Array<keyof Date & string>;
export const onDate = (name: string, value: unknown): void =>
  void Object.defineProperty(Date.prototype, name, { value, writable: true, configurable: true });
export const realClockReads = CLOCK_READS.map(
  (name) => [name, Date.prototype[name] as (...args: unknown[]) => unknown] as const
);
/** Clock reads made inside replies: how many, and through which readers. */
export const clock = { reads: 0, asked: new Set<string>() };
export const clockRead = (name: string): void => {
  if (!inReply.getStore()) return;
  clock.reads += 1;
  clock.asked.add(name);
};
for (const [name, real] of realClockReads)
  onDate(name, function (this: Date, ...args: unknown[]): unknown {
    clockRead(name);
    return real.apply(this, args);
  });
// Intl.DateTimeFormat is how code gets an hour in the caller's own timezone.
export const INTL_READS = ['format', 'formatToParts', 'formatRange', 'formatRangeToParts'] as const;
/** The parts of a date a formatter can be made to give; the red names the ones asked for. */
export const DATE_PARTS = new Set(
  'weekday era year month day dayPeriod hour minute second dateStyle timeStyle'.split(' ')
);
export const realIntlReads = INTL_READS.map(
  (name) => [name, Object.getOwnPropertyDescriptor(Intl.DateTimeFormat.prototype, name)!] as const
);
for (const [name, real] of realIntlReads) {
  const counted = (inner: unknown) =>
    function (this: Intl.DateTimeFormat, ...args: unknown[]): unknown {
      const asked = Object.keys(this.resolvedOptions()).filter((part) => DATE_PARTS.has(part));
      clockRead(`Intl.DateTimeFormat.${name}(${asked})`);
      return (inner as (...a: unknown[]) => unknown).apply(this, args);
    };
  // `format` is a getter that hands out a bound function; the rest are plain methods.
  Object.defineProperty(
    Intl.DateTimeFormat.prototype,
    name,
    real.get ? { ...real, get: counted(real.get) } : { ...real, value: counted(real.value) }
  );
}

/**
 * Every field of the session the gate reads, as a dotted path, recorded as the env names are.
 * A reply can be keyed on a field worked out elsewhere; one the calls never set is never varied.
 */
export const sessionRead = new Set<string>();
export const recorders = new WeakMap<object, object>();
export function recorded<T extends object>(target: T, path = ''): T {
  let proxy = recorders.get(target);
  if (!proxy) {
    const at = (key: string): string => (path ? `${path}.${key}` : key);
    proxy = new Proxy(target, {
      get(inner, key, receiver) {
        const value: unknown = Reflect.get(inner, key, receiver);
        if (typeof key !== 'string') return value;
        sessionRead.add(at(key));
        return value !== null && typeof value === 'object' ? recorded(value, at(key)) : value;
      },
      has: (inner, key) => (typeof key === 'string' && sessionRead.add(at(key)), key in inner),
    });
    recorders.set(target, proxy);
  }
  return proxy as T;
}

export const MODEL_SAYS = 'MODEL-WORDS.';
/**
 * Time here is fake and only moves when the test moves it. A reply's first words are late after
 * FIRST_WORDS_MS (the classifier gets 10 ms, a held line's hold 8), and a reply still not ended
 * after BOUND_MS never came.
 */
export const FIRST_WORDS_MS = 100;
export const BOUND_MS = 60_000;
export const FAKED: Parameters<typeof vi.useFakeTimers>[0] = {
  toFake: ['setTimeout', 'clearTimeout', 'Date'],
};
/** How long a held line's hold lasts here. */
export const HOLD_MS = 8;
/**
 * The guard and the classifier live, as production runs them; not manifest flags, so no case
 * below sets them. The classifier's time limit is NOT production's: 10 ms here, 1000 ms by
 * default there. A lowering keyed on the limit's value, or on the classifier model's name, is
 * not seen here.
 */
export const MODES = {
  CRISIS_GUARD_MODE: 'live',
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_TIMEOUT_MS: '10',
};

export let classifierCalls = 0;
export const verdict =
  (risk: string, subject: string): CrisisGenerateFn =>
  async () => (classifierCalls++, JSON.stringify({ risk, subject }));
export const CLASSIFIER: Record<Answer, CrisisGenerateFn> = {
  none: verdict('none', 'self'),
  crisis: verdict('crisis', 'self'),
  imminent: verdict('imminent', 'self'),
  other: verdict('imminent', 'other'),
  throws: async () => {
    classifierCalls++;
    throw new Error('provider down');
  },
  never: async (_prompt, _content, signal) => {
    classifierCalls++;
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });
  },
};

/**
 * The adjudicator gives no answer, as with no key; its asks are counted (see the last test).
 * The grounded release gets no stub: no call here reaches it. One that does would build its
 * own model calls, and the no-model guard fails the test that did it.
 */
export let adjudicatorAsks = 0;
export const ADJUDICATOR: CrisisGenerateFn = async () => (adjudicatorAsks++, '');

/** One turn as the caller got it. */
export interface Heard {
  came: boolean;
  /** Fake milliseconds from the request to the reply's first words; -1 when none came. */
  firstWordsMs: number;
  spoken: string;
  /** The last thing the model read on its last request; empty when it was never asked. */
  asked: string;
  /** How often the gate asked the session's hold about the line (CRISIS_READ_JOINED_TURN). */
  holdAsked: number;
}

export const streamOf = (text: string): ReadableStream<unknown> =>
  new ReadableStream<unknown>({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });

export let sessions = 0;
/** The instant the last place() set, before any turn ran. */
export let placedAt = Number.NaN;
/** Set once the grid has loaded; from then on a reading needs installGrid() in its file. */
let gridLoaded = false;
/** Set by installGrid(), which each grid file calls at its top. */
let installed = false;
/**
 * What the crisis modules remember about calls, emptied before each call here. No call sees an
 * earlier one, and the run does not slow as calls pile up: the clock here never reaches the
 * hours after which the modules drop a call themselves.
 */
export const FORGET_CALLS = [
  resetCrisisClassifierCache,
  resetCrisisAdjudicatorCache,
  resetCrisisCallRisk,
  resetClassifierBlocked,
  resetEasingReads,
  resetConfirmedCallRisk,
  resetGradedResponse,
  resetGroundedRelease,
  resetGroundedScreen,
  resetImminentAgreement,
  resetCallRiskSnapshots,
  resetSecondReadTurns,
  resetWhoReads,
];

/** Another moment for every call. What is left out stays as the call has it. */
export interface At {
  /**
   * The date and time on the wall clock of the moment's zone (Ferni's home zone when it has
   * none, or one Intl does not know); the calls' own is June 10, 2026 at their hour, on the hour.
   */
  month?: number;
  day?: number;
  hour?: number;
  minute?: number;
  /** The caller's timezone, as the session carries it. */
  zone?: string;
  /** Ferni's clock as an eval call sets it. */
  evalLocalTime?: { hour: number; minute: number };
  /** How long the call had run before its first line here, in minutes. */
  callMinutes?: number;
}

/**
 * Moments are built on a zone's wall clock, not the process's: a Mac in New York and CI in UTC
 * put "3:00" at two different Denver hours, and a row held on one and failed on the other
 * (11-15). Built from Intl alone, never from the clock code under test.
 */
export const HOME_ZONE = 'America/Denver';
export const knownZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};
export const zoneOf = (at?: At): string => (at?.zone && knownZone(at.zone) ? at.zone : HOME_ZONE);
/** [year, month (0-11), day, hour, minute] on `zone`'s wall clock at `ms`. */
export const wallClock = (ms: number, zone: string): number[] => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(ms);
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  return [part('year'), part('month') - 1, part('day'), part('hour') % 24, part('minute')];
};
export const asUtc = (f: readonly number[]): number => Date.UTC(f[0], f[1], f[2], f[3], f[4]);
/** The instant `zone`'s wall clock reads `fields` (the offset found twice, for a date near a change). */
export function instantIn(zone: string, fields: readonly number[]): number {
  let at = asUtc(fields);
  for (let pass = 0; pass < 2; pass++) at = asUtc(fields) - (asUtc(wallClock(at, zone)) - at);
  return at;
}
export const fieldsOf = (hour: number, at?: At): number[] => [
  2026,
  at?.month ?? 5,
  at?.day ?? 10,
  at?.hour ?? hour,
  at?.minute ?? 0,
];
export const instantOf = (hour: number, at?: At): number =>
  instantIn(zoneOf(at), fieldsOf(hour, at));

/** One call through the real gate, turn by turn, on one session, at its own hour or at `at`. */
export async function place(call: ReplyCall, answer: Answer, at?: At): Promise<Heard[]> {
  if (gridLoaded && !installed)
    throw new Error('this file reads the grid without installGrid(): call it at its top');
  for (const forget of FORGET_CALLS) forget();
  vi.setSystemTime(instantOf(call.hour ?? 12, at));
  placedAt = Date.now();
  let holdAsked = 0;
  const session = recorded({
    userData: {
      services: {
        sessionId: `never-lower-${++sessions}`,
        ...(at?.callMinutes && { sessionStartTime: Date.now() - at.callMinutes * 60_000 }),
      },
      ...(at?.zone !== undefined && { callerTimezone: at.zone }),
      ...(at?.evalLocalTime && { evalLocalTime: at.evalLocalTime }),
    },
    // A live session with the hold installed, as crisis-read-joined-turn.ts looks for one.
    ...(call.held && {
      on: () => undefined,
      off: () => undefined,
      unfinishedTurnHoldMs: () => (holdAsked++, HOLD_MS),
    }),
  });
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
    void inReply.run(true, async (): Promise<void> => {
      const stream = await gatedReply(ctx.copy(), session, model as never, opener as never, {
        env: process.env as Record<string, string>,
        generate: CLASSIFIER[answer],
        adjudicate: ADJUDICATOR,
      });
      if (stream)
        for await (const chunk of stream as unknown as AsyncIterable<string>) {
          if (firstWordsMs < 0 && chunk) firstWordsMs = Date.now() - askedAt;
          spoken += chunk;
        }
      came = true;
    });
    // Time moves in growing steps until the reply ends or the bound passes.
    for (let step = 0; !came && Date.now() - askedAt < BOUND_MS; step = Math.min(250, step * 2 + 1))
      await vi.advanceTimersByTimeAsync(step);
    if (!came) vi.clearAllTimers();
    heard.push({ came, firstWordsMs, spoken, asked, holdAsked });
    ctx.addMessage({ role: 'assistant', content: spoken });
  }
  return heard;
}

export type Readings = Map<string, Heard[]>;

/**
 * Every call under every classifier answer, keyed `call/answer`, with the env as it stands.
 * `backwards` places the same calls last to first: a reading must not depend on its place.
 * `at` places every call at that moment.
 */
export async function placeAll(backwards = false, at?: At): Promise<Readings> {
  // The turn reminder picks its style lines at random: the same picks on every turn compared.
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.42);
  const out: Readings = new Map();
  const pairs = CALLS.flatMap((call) => ANSWERS.map((answer) => [call, answer] as const));
  const [readsBefore, copiesBefore] = [clock.reads, copies.made];
  try {
    for (const [call, answer] of backwards ? pairs.reverse() : pairs)
      out.set(`${call.name}/${answer}`, await place(call, answer, at));
  } finally {
    random.mockRestore();
  }
  clockReadsIn.set(out, clock.reads - readsBefore);
  copiesIn.set(out, copies.made - copiesBefore);
  return out;
}
/** How often the replies of one reading asked the clock, and copied the environment. */
export const clockReadsIn = new WeakMap<Readings, number>();
export const copiesIn = new WeakMap<Readings, number>();

export const isFlag = (name: string): boolean => name in FLAG_MANIFEST && !(name in RUNNER_MARKERS);

/**
 * `env`, with every name looked up on it added to `seen`. A whole-object copy ({ ...env })
 * lists the names and then takes each once: that is not a look-up of each name.
 */
export function noting<T extends object>(env: T, seen: Set<string>): T {
  const listed = new Set<string | symbol>();
  const copying = new Set<string | symbol>();
  return new Proxy(env, {
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
}

/**
 * Every manifest flag the gate reads on the calls, recorded by a process.env that notes each
 * name looked up. A whole-object copy ({ ...env }) is not a read of each name it copies; the
 * copies are counted (`copies`, ENV_COPIED).
 */
export async function flagsTheGateReads(): Promise<string[]> {
  const seen = new Set<string>();
  const pass = async (on: readonly string[]): Promise<void> => {
    for (const name of new Set([...CRISIS_FLAGS, ...seen])) vi.stubEnv(name, undefined);
    for (const name of on) vi.stubEnv(name, 'on');
    for (const [name, value] of Object.entries(MODES)) vi.stubEnv(name, value);
    const real = process.env;
    process.env = noting(real, seen);
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

export const says = (text: string, number: string): number =>
  text.search(new RegExp(`(?<![0-9])${number}(?![0-9])`));
export const at988 = (text: string): number =>
  Math.max(says(text, '988'), text.toLowerCase().indexOf(CRISIS_LINE_SPOKEN));
export const sentences = (text: string): string[] =>
  text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

/** What a turn's reply gives the caller: each may turn true under a flag, never false. */
export function gives(turn: Heard) {
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
export type Gives = ReturnType<typeof gives>;

/** Both turns are code's words of one kind, so the second can be read against the first. */
export const sameScript = (had: Gives, has: Gives): boolean =>
  had["code's words"] && has["code's words"] && had['911 first'] === has['911 first'];
/** The sentences code itself speaks on a turn: the reply without the model's line. */
export const codeSays = (turn: Heard): string[] => sentences(turn.spoken.replace(MODEL_SAYS, ' '));

/** Every way `on` gives less than `off` on one turn; empty when it never does. */
export function lower(off: Heard, on: Heard): string[] {
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
  if (sameScript(had, has))
    for (const sentence of sentences(off.spoken))
      if (!on.spoken.includes(sentence)) out.push(`script sentence "${sentence.slice(0, 48)}"`);
  return out;
}

export const MEETS: Record<Floor, (g: Gives) => boolean> = {
  emergency: (g) => g["code's words"] && g['911 first'],
  'crisis line': (g) => g["code's words"] && g['988 spoken'],
  '988 spoken': (g) => g['988 spoken'],
  guided: (g) => g['988 spoken'] || g['988 asked of the model'],
  none: () => true,
};

/** Every turn that misses its floor, never came, or carries words no reply may. */
export function under(readings: Readings): string[] {
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
export const READ_BY_GATE = await flagsTheGateReads();
gridLoaded = true;
/** Unset (manifest default) unless a case sets it. */
export const STUBBED = [...new Set([...CRISIS_FLAGS, ...READ_BY_GATE])];

/** Every call's turns with these flags set and every other stubbed flag unset. */
export const readings = new Map<string, Readings>();
export async function readUnder(flags: FlagValues): Promise<Readings> {
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

/** Every turn that gives less in `on` than in `off`, and every floor `on` breaks. */
export function lostIn(off: Readings, on: Readings): string[] {
  const out = under(on);
  for (const [key, turns] of off)
    turns.forEach((turn, i) => {
      const lost = lower(turn, on.get(key)![i]);
      if (lost.length) out.push(`${key} turn ${i + 1} :: ${lost.join(', ')}`);
    });
  return out;
}

/** Every turn that gives less with `flags` than with `base`, and every floor `flags` breaks. */
export async function losses(base: FlagValues, flags: FlagValues, keep = true): Promise<string[]> {
  // An on-top reading is used once: read it fresh, so the cache holds only what is read twice.
  return lostIn(await readUnder(base), keep ? await readUnder(flags) : await placeAllUnder(flags));
}

/** The `call/answer` keys a flag setting changes anything on: words, the model's request, a wait. */
export async function moved(flags: FlagValues): Promise<string[]> {
  const [off, on] = [await readUnder({}), await readUnder(flags)];
  return [...off.keys()].filter(
    (key) => JSON.stringify(off.get(key)) !== JSON.stringify(on.get(key))
  );
}

export const defaultOf = (name: string): string =>
  FLAG_MANIFEST[name as keyof typeof FLAG_MANIFEST].default;
export const allBut = (name: string, value: string): FlagValues =>
  Object.fromEntries(READ_BY_GATE.filter((o) => o !== name).map((o) => [o, value]));
/**
 * Every word a flag is set to: empty (a real deploy state), the four mode words, the older
 * spellings the shared flag reader also takes (config/env-flag.ts: true, 1, false, 0), and one
 * that is misspelt. Every check below walks this one list, so a new mode word is added here
 * only. OTHER_WORDS keeps the list honest: a word a reader on the gate's path knows, and
 * this list lacks, reads differently from the misspelt one and fails.
 */
export const MISSPELT = 'onn';
export const WORDS = [
  '',
  'off',
  'shadow',
  'on',
  'live',
  'true',
  '1',
  'false',
  '0',
  MISSPELT,
] as const;
/** Words some flag reader somewhere might know. Each must read as the misspelt word does. */
export const OTHER_WORDS = [
  ...['all', 'yes', 'no', 'enabled', 'disabled', 'full', 'strict', 'guide', 'guided', 'soft'],
  ...['block', 'report', 'refuse', 'dev', 'test', 'auto', 'none', 'both', 'hard', 'lite', 'v2'],
] as const;
/** The words that leave a flag at its default: these must change no reply at all. */
export const inertFor = (name: string): readonly string[] =>
  defaultOf(name) === 'off'
    ? ['', 'off', 'false', '0', 'shadow', MISSPELT]
    : ['', 'on', 'true', '1', MISSPELT];
/** What every other flag is set to when a word is tried on top of them. */
export const BASES = ['on', 'live'] as const;
export const shown = (word: string): string => word || "''";
export const knownToLower = (name: string, value: string): boolean =>
  LOWERS_A_REPLY[name]?.value === value;
export const CASES = READ_BY_GATE.flatMap((name) =>
  WORDS.map((word) => [name, shown(word), word] as const)
).filter(([name, , word]) => !knownToLower(name, word));
export const ON_TOP = CASES.flatMap(([name, label, word]) =>
  BASES.map((base) => [name, label, base, word] as const)
);
/** ON_TOP by base, one test file each, so the two halves run on different CI shards. */
export const ON_TOP_ON = ON_TOP.filter(([, , base]) => base === 'on');
export const ON_TOP_LIVE = ON_TOP.filter(([, , base]) => base === 'live');
/** Every flag at once: unset, then each base word. */
export const EVERY_FLAG: ReadonlyArray<readonly [string, FlagValues]> = [
  ['at its default', {}],
  ...BASES.map((base) => [`set to ${base}`, allBut('', base)] as const),
];
/** What a red on the adjudicator's hold tells the one who lifted it. */
export const LIFT_FIRST =
  'the grid gives the adjudicator no answers; add adjudicator answers to the grid before lifting this';
export const LIFTER = 'allowCrisisAdjudicatorLiveForTests';
export const SRC = join(__dirname, '../../..');
export const HOLD_FOLDERS = ['services/safety', 'agents/personas'];
/** Every exported `...ForTests` in the two crisis folders, as `file: name`. One: the lifter. */
export const TEST_ONLY_EXPORTS = [`services/safety/crisis-adjudicator.ts: ${LIFTER}`];
/** What a red on a live word held in code tells the one who changed what it resolves to. */
export const HELD_IN_CODE =
  'this live word is held back in code; read what it changes in this grid before letting it through';
/** What a red on a new module-level variable asks of the one who added it. */
export const NEW_VARIABLE =
  'a new module-level variable in the crisis folder: if a reply can depend on it, pin it in the test above; if not, add its name here';
/**
 * Every module-level `let` under services/safety, as `file: name`, sorted, one to a line.
 * Only liveAllowed is a hold a reply depends on; the rest are clients and handles made once,
 * and warnings said once. agents/personas is not listed: see the header.
 */
export const SAFETY_VARIABLES = [
  'services/safety/crisis-adjudicator.ts: defaultGenerate',
  'services/safety/crisis-adjudicator.ts: liveAllowed',
  'services/safety/crisis-classifier-only-live.ts: defaultGenerate',
  'services/safety/crisis-classifier.ts: defaultGenerate',
  'services/safety/crisis-graded-shadow.ts: liveWarned',
  'services/safety/crisis-grounded-release.ts: defaultGenerates',
  'services/safety/crisis-grounded-release.ts: warnedNotLive',
  'services/safety/crisis-who.ts: defaultGenerate',
  'services/safety/index.ts: firestoreInitAttempted',
  'services/safety/index.ts: firestoreInstance',
];
/** The production files under a folder of src: no test folder, no test file, no typings. */
export const NOT_PRODUCTION = /^(?:__tests__|__mocks__|tests)$/;
export const productionFiles = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return NOT_PRODUCTION.test(entry.name) ? [] : productionFiles(path);
    return /(?<!\.test|\.d)\.ts$/.test(entry.name) ? [path] : [];
  });
export const sourceOf = (file: string): string => readFileSync(join(SRC, file), 'utf8');
/** `file: name` for each name the expression finds at the start of a line. */
export const declaredIn = (files: readonly string[], finds: RegExp): string[] =>
  files.flatMap((file) => [...sourceOf(file).matchAll(finds)].map((m) => `${file}: ${m[1]}`));
/**
 * Flag states that give the crisis read a scope (crisis-gate.ts), read with no other flag set.
 * A deploy may be running this one: the agreement gate on beside the adjudicator in shadow.
 */
export const SCOPED: ReadonlyArray<readonly [string, FlagValues]> = [
  [
    'the agreement gate on and the adjudicator in shadow',
    { CRISIS_AGREEMENT_GATE: 'on', CRISIS_ADJUDICATOR: 'shadow' },
  ],
];
export const INERT = READ_BY_GATE.flatMap((name) =>
  inertFor(name).map((word) => [name, shown(word), word] as const)
);
/**
 * Crisis-lane flags the gate reads that no call shows yet, or that by design change no reply
 * (MEMORY_ONLY): no word of one may change a reply.
 */
export const NO_ROW = [...NOT_YET_COVERED, ...Object.keys(MEMORY_ONLY)]
  .filter((name) => READ_BY_GATE.includes(name))
  .flatMap((name) => WORDS.map((word) => [name, shown(word), word] as const));
/** A timezone for the caller, so the code that works out the caller's own time runs. */
export const ZONE = 'America/Denver';
export const upTo = (count: number): number[] => Array.from({ length: count }, (_, i) => i);
/**
 * The moments each clock-reading flag is read at. The two flags ask a formatter for the hour
 * and minute, and for the weekday, month and day, so each of those is walked through; then
 * the caller's timezone, and the two session fields that stand in for the clock.
 */
export const MOMENTS: Readonly<Record<string, At>> = {
  ...Object.fromEntries(upTo(24).map((hour) => [`${hour}:00`, { hour, zone: ZONE }])),
  // The minutes on each side of where the hour is rounded (ferni-state.ts), and the last. No
  // reply here turns on the minute today, so nothing in REACHES shows these readings bite.
  ...Object.fromEntries(
    [14, 15, 39, 40, 59].map((minute) => [`15:${minute}`, { hour: 15, minute, zone: ZONE }])
  ),
  // June 7, 2026 is a Sunday: the seven weekdays.
  ...Object.fromEntries(upTo(7).map((i) => [`June ${7 + i}`, { day: 7 + i, zone: ZONE }])),
  ...Object.fromEntries(
    upTo(12).map((month) => [`the 15th of month ${month + 1}`, { month, day: 15, zone: ZONE }])
  ),
  'a half-hour timezone': { zone: 'Asia/Kolkata' },
  'a timezone far behind': { hour: 3, zone: 'Pacific/Pago_Pago' },
  'a timezone far ahead': { hour: 21, zone: 'Pacific/Kiritimati' },
  'a timezone that does not exist': { zone: 'Not/AZone' },
  'an empty timezone': { zone: '' },
  'the eval clock at night': { zone: ZONE, evalLocalTime: { hour: 2, minute: 30 } },
  'two hours into the call': { zone: ZONE, callMinutes: 120 },
};
export const AT_MOMENTS = CLOCK_READ_BY.flatMap((name) =>
  Object.keys(MOMENTS).map((moment) => [name, moment] as const)
);
/** Each part walked through reaches a reply: under the flag, the two moments read differently. */
export const REACHES: ReadonlyArray<readonly [string, string, string]> = [
  ['FERNI_STATE', '3:00', '15:00'],
  ['FERNI_STATE', '15:00', 'the eval clock at night'],
  ['FERNI_STATE', '15:00', 'two hours into the call'],
  ['WORLD_NOW', '3:00', '15:00'],
  ['WORLD_NOW', 'June 7', 'June 8'],
  ['WORLD_NOW', 'the 15th of month 1', 'the 15th of month 7'],
  ['WORLD_NOW', '12:00', 'a half-hour timezone'],
];

/** Zeroes the classifier's call count (a test file can't assign an imported binding). */
export function resetClassifierCalls(): void {
  classifierCalls = 0;
}

/**
 * Installs, in the calling test file, the fake clock, the per-test check that nothing was
 * reached and no unlisted session field read, and the restore after the file. Refuses a file
 * whose gemini-config stub is missing (the network guard alone would still let a real client
 * be built).
 */
export function installGrid(): void {
  installed = true;
  beforeAll(async () => {
    const { getGeminiClient } = await import('../../../config/gemini-config.js');
    if (!(STUBBED_CLIENT in getGeminiClient))
      throw new Error('this grid file has no gemini-config stub: copy the vi.mock block');
  });
  beforeAll(() => void vi.useFakeTimers(FAKED));
  // Per test, so the red names the test that reached out, in any order the tests run in. The first
  // test to run also answers for what the file reached while it was loading.
  let reachedBefore = { ...reached };
  afterEach(({ task }) => {
    const before = reachedBefore;
    reachedBefore = { ...reached };
    expect(reached, `reached out during "${task.name}"`).toEqual(before);
    expect(
      [...sessionRead].filter((field) => !SESSION_FIELDS_READ.includes(field)),
      `a session field read by "${task.name}" or before it, and not listed`
    ).toEqual([]);
  });
  afterAll(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    process.env = realEnv;
    net.Socket.prototype.connect = realConnect;
    globalThis.fetch = realFetch;
    for (const [name, real] of realClockReads) onDate(name, real);
    for (const [name, real] of realIntlReads)
      Object.defineProperty(Intl.DateTimeFormat.prototype, name, real);
  });
}

/** The calls with only these flags set, read fresh (never from the cache). */
export async function placeAllUnder(
  flags: FlagValues,
  backwards = false,
  at?: At
): Promise<Readings> {
  for (const name of STUBBED) vi.stubEnv(name, flags[name]);
  for (const [name, value] of Object.entries(MODES)) vi.stubEnv(name, value);
  try {
    return await placeAll(backwards, at);
  } finally {
    vi.unstubAllEnvs();
  }
}
