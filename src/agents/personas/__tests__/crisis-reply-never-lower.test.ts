/**
 * A flag may ADD to what a caller in crisis hears; it may never take any of it away.
 *
 * The seventh reader of the never-lower registry (crisis-all-flags-never-lower.test.ts): the
 * reply itself, through the real gatedReply. Fictional calls (crisis-reply.never-lower.ts) run
 * with the crisis classifier stubbed to answer none, crisis, imminent, imminent for someone
 * else, to throw, and to never answer. The model is a stub that says MODEL_SAYS, so a reply
 * is code's words exactly when the stub's are not in it.
 *
 * The gate takes three model calls as options: generate (the classifier), adjudicate and
 * groundedReads. The classifier has the six answers above. The adjudicator has one value here:
 * no answer, which is what a machine with no model key gets. So a flag that acts on a second
 * model's answer changes nothing in this grid yet. The grounded release is given nothing: no
 * call here reaches it, and one that did would build its own model calls. No model can be
 * reached from this file: a test fails if a model client was asked for, a connection was
 * opened or fetch was called while it ran, and the last test checks the total.
 *
 * Which flags are checked is measured, not listed: the calls run behind a process.env that
 * records each name read, at the defaults and with every flag found so far on, until no new
 * name turns up. Every flag the gate reads then gets every word in WORDS, whatever its default;
 * the default only decides which words are the inert ones, and an inert word must change
 * nothing at all. Every word is tried alone, and on top of every other flag set to on and to
 * live.
 *
 * The calls happen at 12:00, two at 0:00, on one date, on Ferni's home clock (America/Denver,
 * the zone FERNI_STATE reads; WORLD_NOW reads a call with no zone in UTC), whatever zone the
 * process runs in, with no timezone for the caller. That is
 * enough only for a reply that does not depend on the time of day, and three things keep it so:
 * - asking the clock inside a reply is counted. Reading the hour, the minute, the weekday, the
 *   date or the timezone off a Date (CLOCK_READS), or formatting one with Intl.DateTimeFormat,
 *   is allowed only with a flag listed in CLOCK_READ_BY set; any other is red;
 * - each listed flag is read at the moments in MOMENTS: every hour, the minutes where the
 *   hour is rounded, each weekday, each month, five timezones for the caller (one that does
 *   not exist, one empty), the eval clock and a long call. Alone and on top of every other
 *   flag, on and live, against the same setting without it at the same moment;
 * - every field of the session the gate reads is recorded and must be listed in
 *   SESSION_FIELDS_READ, so a reply keyed on a time worked out elsewhere and left on the
 *   session (a late-night mark, say) fails until the calls set that field.
 * Not seen: a reply keyed on one timezone by name, on one date (a holiday), or on the year; a
 * time kept in a module rather than on the session; arithmetic on the instant itself; a clock
 * read made directly inside a timer's callback. Every other flag is read at the calls' own
 * moments only, which is sound while it reads no clock and no unlisted session field.
 *
 * The prompt is not assembled here: the test hands the gate a bare chat. Notes that depend on
 * the hour (late night) are added there, and the rule that the crisis note stays the last one
 * whatever follows it is pinned in processors/turn-processor/__tests__/safety-note.test.ts.
 *
 * Calls must not see each other. FORGET_CALLS empties what the crisis modules remember before
 * each call; the list is kept by hand, so the calls are also placed last to first and must read
 * the same.
 *
 * Lowered means, turn by turn: the reply never came; code's words became the model's; 988 or
 * 911 left the reply; 911 stopped coming first; 988 or 911 left the last thing the model was
 * asked (unless code now says it); or a script kept its kind and lost one of its sentences.
 * Each turn also has a floor that holds under every setting, the defaults included. The floor
 * reads who speaks, 911, 988 and their order, and nothing else.
 *
 * So the wording itself is NOT read, and WORDING_NOT_READ counts how much (a test keeps the
 * counts true):
 * - a script sentence lost with the flag on and off alike is not seen by this file. A script
 *   is compared with itself at the defaults, and the floor reads only the numbers;
 * - a sentence that code speaks only with a flag set (a whole script, or a line added to one
 *   or after the model's reply) has no counterpart at the defaults, so dropping it is a
 *   lowering brought by a flag setting that this file does not see. Those flags are named in
 *   WORDING_NOT_READ.onlyWithFlag: what they add is read for the numbers and their order only;
 * - on a turn the model speaks, only the numbers in what it is asked are read: that they are
 *   asked for, not that the rest of the ask leaves them standing.
 * A hand-kept copy of each script's words, checked on every reading, closes the first two.
 *
 * Also not seen here, each a way a flag could still lower a reply:
 * - the model's own words: the stub says one fixed line, so only what the model is ASKED is read;
 * - how long a reply takes, short of FIRST_WORDS_MS to its first words and BOUND_MS to its end;
 * - the text (SMS) reply path, and everything after gatedReply (988 spoken as digits, speech);
 * - what a flag does outside the reply: records, alerts, transfers, follow-up texts, recorder holds;
 * - a caller the account says is under 18, a try-first caller, a persona other than Ferni;
 * - a flag read only off a copy of the environment, which nothing here would ever set. Two
 *   places copy it while a reply is made (ENV_COPIED). startCrisisClassifier, for the
 *   classifier's plain prompt, on a line with risk words while CRISIS_CLASSIFIER_EVERYDAY_RULES
 *   is on: that copy goes to crisisClassifierPrompt only. And the scripted turn's read
 *   (CRISIS_SCRIPT_IMMINENT_READ on or shadow), which gives startCrisisClassifier a copy with
 *   its own deadline: that copy goes there only, and what is read off it is recorded on the
 *   calls themselves. Each name read off either copy must also be read off the environment
 *   itself. Another copy, a copy under another flag, from another function, or handed
 *   anywhere else is red. Not counted: a reference to process.env kept from when a module
 *   loaded, a flag read once at import, and a flag the classifier reads off the scripted
 *   read's copy only on a line or under a pair of flags the calls do not have;
 * - what the classifier is asked. Its answers are given here, so a flag that changes its
 *   prompt (the everyday rules, the agreement gate) is not seen to change a read. A change to
 *   the classifier's prompt is covered by a held-out run by its holder, never by this grid;
 * - a lowering that needs two flags set and the others unset. Each word of a flag is tried
 *   alone, and on top of EVERY other flag on and live; no pair is tried by itself, but for
 *   the one in SCOPED;
 * - the crisis read's scope. The agreement gate on, or the adjudicator in shadow or live, has
 *   the gate gather the turn's crisis reads under the call. Each of those words is tried like
 *   any other, and SCOPED reads the two together with nothing else set. But the scope holds
 *   one read here: only gatedReply runs, so the turn pipeline's own read of the same turn
 *   never joins it. Two reads of one turn that disagree, a second read joining the first's
 *   (rememberRead in crisis-classifier.ts), and the lines the agreement gate eases (a bare
 *   "still here", a call of Ferni's name, a short question back about Ferni's own words)
 *   are not walked;
 * - a second model's answer changing a reply. The adjudicator gives no answer here, so a
 *   check-in it would hand a caller in place of crisis guidance is not seen. Production
 *   holds that off (liveAllowed in crisis-adjudicator.ts): CRISIS_ADJUDICATOR=live and
 *   CRISIS_CLASSIFIER_ONLY_CHECKIN=live both run held. "the holds this grid leans on" pins
 *   the hold and searches for others like it; lifting it is red until the adjudicator's
 *   answers are in this grid. The search is by name (an exported ...ForTests in either
 *   crisis folder) and by declaration (a module-level `let` under services/safety only). A
 *   hold kept in a module-level variable under agents/personas, or in a constant, an
 *   object's field or a flag of its own, and a lifter reached by a name built at run time,
 *   are seen by review only;
 * - the floors, the calls, the raises and NEVER_HEARD are pinned by a second copy
 *   (crisis-reply.never-lower.pin.ts): the data file may add, never take away. Lowering both
 *   files together is seen by review only;
 * - "call 911" said so that it means the opposite, beyond the NEVER_HEARD phrases;
 * - a flag that acts on a second model's answer (the adjudicator, the grounded release, the
 *   confirmed-risk read): those give no answer here, so the flags that soften a crisis reply
 *   change nothing. NOT_YET_COVERED never means the gate ignores a flag;
 * - a setting that is a number or a name (a time limit, a model), and any mode word other
 *   than those in WORDS. One misspelt word is tried (MISSPELT) and the empty one; a reply
 *   keyed on any other exact string, or on another case or spacing of a word, is not seen;
 * - any call no line here resembles. NOT_YET_COVERED (services/safety/__tests__/
 *   crisis-flag-homes.ts) names the crisis-lane flags no call shows yet.
 */
import { llm } from '@livekit/agents';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readdirSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { join } from 'node:path';
import { ReadableStream } from 'node:stream/web';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import { NOT_YET_COVERED } from '../../../services/safety/__tests__/crisis-flag-homes.js';
import {
  CRISIS_FLAGS,
  RUNNER_MARKERS,
} from '../../../services/safety/__tests__/crisis-lane-flags.js';
import {
  adjudicatorCheckinsMayChangeReplies,
  resetCrisisAdjudicatorCache,
  resolveCrisisAdjudicatorMode,
} from '../../../services/safety/crisis-adjudicator.js';
import { resetCrisisCallRisk } from '../../../services/safety/crisis-call-risk.js';
import { resetClassifierBlocked } from '../../../services/safety/crisis-classifier-blocked.js';
import {
  resetEasingReads,
  resolveEasingMode,
} from '../../../services/safety/crisis-classifier-only-live.js';
import {
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  type CrisisGenerateFn,
} from '../../../services/safety/crisis-classifier.js';
import { resetConfirmedCallRisk } from '../../../services/safety/crisis-confirmed-risk.js';
import {
  resetGradedResponse,
  resolveGradedResponseMode,
} from '../../../services/safety/crisis-graded-shadow.js';
import {
  resetGroundedRelease,
  resolveGroundedReleaseMode,
} from '../../../services/safety/crisis-grounded-release.js';
import { resetGroundedScreen } from '../../../services/safety/crisis-grounded-screen.js';
import { resetImminentAgreement } from '../../../services/safety/crisis-imminent-agreement.js';
import { resetCallRiskSnapshots } from '../../../services/safety/crisis-lone-imminent.js';
import { resetSecondReadTurns } from '../../../services/safety/crisis-second-read-turn.js';
import { resetWhoReads } from '../../../services/safety/crisis-who.js';
import { CRISIS_LINE_SPOKEN } from '../../../services/safety/crisis-line-speech.js';
import { FERNI_HOME_TZ } from '../ferni-state.js';
import { EMERGENCY_NUMBER } from '../../../services/safety/emergency-number.js';
import { gatedReply } from '../crisis-gate.js';
import {
  PINNED_CALLS,
  PINNED_LOWERS_A_REPLY,
  PINNED_NEVER_HEARD,
  PINNED_SAYS,
  PINNED_SHOWN_ON,
} from './crisis-reply.never-lower.pin.js';
import {
  ANSWERS,
  CALLS,
  CLOCK_READ_BY,
  ENV_COPIED,
  LOWERS_A_REPLY,
  NEVER_HEARD,
  SESSION_FIELDS_READ,
  SHOWN_ON,
  WORDING_NOT_READ,
  type Answer,
  type Floor,
  type ReplyCall,
} from './crisis-reply.never-lower.js';

type FlagValues = Readonly<Record<string, string>>;

/**
 * What this file reached and must not: a model client, a network connection, fetch. The client
 * is replaced with none, as on a machine with no model key, so the grid reads the same where a
 * key is set. Patched by hand, not spied, so no mock reset between tests can lift the guard.
 */
const reached = vi.hoisted(() => ({
  'model clients': 0,
  connections: 0,
  fetches: 0,
}));
vi.mock('../../../config/gemini-config.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../config/gemini-config.js')>()),
  getGeminiClient: async () => ((reached['model clients'] += 1), null),
}));
const NO_NETWORK = 'the never-lower grid reaches no network';
const realConnect = net.Socket.prototype.connect;
const realFetch = globalThis.fetch;
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
const inReply = new AsyncLocalStorage<true>();
/**
 * Copies of the environment made while a reply is being made, and the function that made each.
 * A spread, Object.assign, keys, entries and JSON.stringify all list its names, and that is
 * what is counted. A flag read off a copy is not a read of the environment, so nothing here
 * would ever set it.
 */
const copies = { made: 0, by: new Set<string>() };
const realEnv = process.env;
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
const CLOCK_READS = [
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
const onDate = (name: string, value: unknown): void =>
  void Object.defineProperty(Date.prototype, name, { value, writable: true, configurable: true });
const realClockReads = CLOCK_READS.map(
  (name) => [name, Date.prototype[name] as (...args: unknown[]) => unknown] as const
);
/** Clock reads made inside replies: how many, and through which readers. */
const clock = { reads: 0, asked: new Set<string>() };
const clockRead = (name: string): void => {
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
const INTL_READS = ['format', 'formatToParts', 'formatRange', 'formatRangeToParts'] as const;
/** The parts of a date a formatter can be made to give; the red names the ones asked for. */
const DATE_PARTS = new Set(
  'weekday era year month day dayPeriod hour minute second dateStyle timeStyle'.split(' ')
);
const realIntlReads = INTL_READS.map(
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
const sessionRead = new Set<string>();
const recorders = new WeakMap<object, object>();
function recorded<T extends object>(target: T, path = ''): T {
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
/**
 * The guard and the classifier live, as production runs them; not manifest flags, so no case
 * below sets them. The classifier's time limit is NOT production's: 10 ms here, 1000 ms by
 * default there. A lowering keyed on the limit's value, or on the classifier model's name, is
 * not seen here.
 */
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

/**
 * The adjudicator gives no answer, as with no key; its asks are counted (see the last test).
 * The grounded release gets no stub: no call here reaches it. One that does would build its
 * own model calls, and the no-model guard fails the test that did it.
 */
let adjudicatorAsks = 0;
const ADJUDICATOR: CrisisGenerateFn = async () => (adjudicatorAsks++, '');

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
/** The instant the last place() set, before any turn ran. */
let placedAt = Number.NaN;
/**
 * What the crisis modules remember about calls, emptied before each call here. No call sees an
 * earlier one, and the run does not slow as calls pile up: the clock here never reaches the
 * hours after which the modules drop a call themselves.
 */
const FORGET_CALLS = [
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
interface At {
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
const HOME_ZONE = 'America/Denver';
const knownZone = (zone: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};
const zoneOf = (at?: At): string => (at?.zone && knownZone(at.zone) ? at.zone : HOME_ZONE);
/** [year, month (0-11), day, hour, minute] on `zone`'s wall clock at `ms`. */
const wallClock = (ms: number, zone: string): number[] => {
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
const asUtc = (f: readonly number[]): number => Date.UTC(f[0], f[1], f[2], f[3], f[4]);
/** The instant `zone`'s wall clock reads `fields` (the offset found twice, for a date near a change). */
function instantIn(zone: string, fields: readonly number[]): number {
  let at = asUtc(fields);
  for (let pass = 0; pass < 2; pass++) at = asUtc(fields) - (asUtc(wallClock(at, zone)) - at);
  return at;
}
const fieldsOf = (hour: number, at?: At): number[] => [
  2026,
  at?.month ?? 5,
  at?.day ?? 10,
  at?.hour ?? hour,
  at?.minute ?? 0,
];
const instantOf = (hour: number, at?: At): number => instantIn(zoneOf(at), fieldsOf(hour, at));

/** One call through the real gate, turn by turn, on one session, at its own hour or at `at`. */
async function place(call: ReplyCall, answer: Answer, at?: At): Promise<Heard[]> {
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

type Readings = Map<string, Heard[]>;

/**
 * Every call under every classifier answer, keyed `call/answer`, with the env as it stands.
 * `backwards` places the same calls last to first: a reading must not depend on its place.
 * `at` places every call at that moment.
 */
async function placeAll(backwards = false, at?: At): Promise<Readings> {
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
const clockReadsIn = new WeakMap<Readings, number>();
const copiesIn = new WeakMap<Readings, number>();

const isFlag = (name: string): boolean => name in FLAG_MANIFEST && !(name in RUNNER_MARKERS);

/**
 * `env`, with every name looked up on it added to `seen`. A whole-object copy ({ ...env })
 * lists the names and then takes each once: that is not a look-up of each name.
 */
function noting<T extends object>(env: T, seen: Set<string>): T {
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
async function flagsTheGateReads(): Promise<string[]> {
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

/** Both turns are code's words of one kind, so the second can be read against the first. */
const sameScript = (had: Gives, has: Gives): boolean =>
  had["code's words"] && has["code's words"] && had['911 first'] === has['911 first'];
/** The sentences code itself speaks on a turn: the reply without the model's line. */
const codeSays = (turn: Heard): string[] => sentences(turn.spoken.replace(MODEL_SAYS, ' '));

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
  if (sameScript(had, has))
    for (const sentence of sentences(off.spoken))
      if (!on.spoken.includes(sentence)) out.push(`script sentence "${sentence.slice(0, 48)}"`);
  return out;
}

const MEETS: Record<Floor, (g: Gives) => boolean> = {
  emergency: (g) => g["code's words"] && g['911 first'],
  'crisis line': (g) => g["code's words"] && g['988 spoken'],
  '988 spoken': (g) => g['988 spoken'],
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

/** Every turn that gives less in `on` than in `off`, and every floor `on` breaks. */
function lostIn(off: Readings, on: Readings): string[] {
  const out = under(on);
  for (const [key, turns] of off)
    turns.forEach((turn, i) => {
      const lost = lower(turn, on.get(key)![i]);
      if (lost.length) out.push(`${key} turn ${i + 1} :: ${lost.join(', ')}`);
    });
  return out;
}

/** Every turn that gives less with `flags` than with `base`, and every floor `flags` breaks. */
async function losses(base: FlagValues, flags: FlagValues, keep = true): Promise<string[]> {
  // An on-top reading is used once: read it fresh, so the cache holds only what is read twice.
  return lostIn(await readUnder(base), keep ? await readUnder(flags) : await placeAllUnder(flags));
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
/**
 * Every word a flag is set to: empty (a real deploy state), the four mode words, the older
 * spellings the shared flag reader also takes (config/env-flag.ts: true, 1, false, 0), and one
 * that is misspelt. Every check below walks this one list, so a new mode word is added here
 * only. OTHER_WORDS keeps the list honest: a word a reader on the gate's path knows, and
 * this list lacks, reads differently from the misspelt one and fails.
 */
const MISSPELT = 'onn';
const WORDS = ['', 'off', 'shadow', 'on', 'live', 'true', '1', 'false', '0', MISSPELT] as const;
/** Words some flag reader somewhere might know. Each must read as the misspelt word does. */
const OTHER_WORDS = [
  ...['all', 'yes', 'no', 'enabled', 'disabled', 'full', 'strict', 'guide', 'guided', 'soft'],
  ...['block', 'report', 'refuse', 'dev', 'test', 'auto', 'none', 'both', 'hard', 'lite', 'v2'],
] as const;
/** The words that leave a flag at its default: these must change no reply at all. */
const inertFor = (name: string): readonly string[] =>
  defaultOf(name) === 'off'
    ? ['', 'off', 'false', '0', 'shadow', MISSPELT]
    : ['', 'on', 'true', '1', MISSPELT];
/** What every other flag is set to when a word is tried on top of them. */
const BASES = ['on', 'live'] as const;
const shown = (word: string): string => word || "''";
const knownToLower = (name: string, value: string): boolean =>
  LOWERS_A_REPLY[name]?.value === value;
const CASES = READ_BY_GATE.flatMap((name) =>
  WORDS.map((word) => [name, shown(word), word] as const)
).filter(([name, , word]) => !knownToLower(name, word));
const ON_TOP = CASES.flatMap(([name, label, word]) =>
  BASES.map((base) => [name, label, base, word] as const)
);
/** Every flag at once: unset, then each base word. */
const EVERY_FLAG: readonly (readonly [string, FlagValues])[] = [
  ['at its default', {}],
  ...BASES.map((base) => [`set to ${base}`, allBut('', base)] as const),
];
/** What a red on the adjudicator's hold tells the one who lifted it. */
const LIFT_FIRST =
  'the grid gives the adjudicator no answers; add adjudicator answers to the grid before lifting this';
const LIFTER = 'allowCrisisAdjudicatorLiveForTests';
const SRC = join(__dirname, '../../..');
const HOLD_FOLDERS = ['services/safety', 'agents/personas'];
/** Every exported `...ForTests` in the two crisis folders, as `file: name`. One: the lifter. */
const TEST_ONLY_EXPORTS = [`services/safety/crisis-adjudicator.ts: ${LIFTER}`];
/** What a red on a live word held in code tells the one who changed what it resolves to. */
const HELD_IN_CODE =
  'this live word is held back in code; read what it changes in this grid before letting it through';
/** What a red on a new module-level variable asks of the one who added it. */
const NEW_VARIABLE =
  'a new module-level variable in the crisis folder: if a reply can depend on it, pin it in the test above; if not, add its name here';
/**
 * Every module-level `let` under services/safety, as `file: name`, sorted, one to a line.
 * Only liveAllowed is a hold a reply depends on; the rest are clients and handles made once,
 * and warnings said once. agents/personas is not listed: see the header.
 */
const SAFETY_VARIABLES = [
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
const NOT_PRODUCTION = /^(?:__tests__|__mocks__|tests)$/;
const productionFiles = (dir: string): string[] =>
  readdirSync(join(SRC, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return NOT_PRODUCTION.test(entry.name) ? [] : productionFiles(path);
    return /(?<!\.test|\.d)\.ts$/.test(entry.name) ? [path] : [];
  });
const sourceOf = (file: string): string => readFileSync(join(SRC, file), 'utf8');
/** `file: name` for each name the expression finds at the start of a line. */
const declaredIn = (files: readonly string[], finds: RegExp): string[] =>
  files.flatMap((file) => [...sourceOf(file).matchAll(finds)].map((m) => `${file}: ${m[1]}`));
/**
 * Flag states that give the crisis read a scope (crisis-gate.ts), read with no other flag set.
 * A deploy may be running this one: the agreement gate on beside the adjudicator in shadow.
 */
const SCOPED: readonly (readonly [string, FlagValues])[] = [
  [
    'the agreement gate on and the adjudicator in shadow',
    { CRISIS_AGREEMENT_GATE: 'on', CRISIS_ADJUDICATOR: 'shadow' },
  ],
];
const INERT = READ_BY_GATE.flatMap((name) =>
  inertFor(name).map((word) => [name, shown(word), word] as const)
);
/** Crisis-lane flags the gate reads that no call shows yet: no word of one may change a reply. */
const NO_ROW = NOT_YET_COVERED.filter((name) => READ_BY_GATE.includes(name)).flatMap((name) =>
  WORDS.map((word) => [name, shown(word), word] as const)
);
/** A timezone for the caller, so the code that works out the caller's own time runs. */
const ZONE = 'America/Denver';
const upTo = (count: number): number[] => Array.from({ length: count }, (_, i) => i);
/**
 * The moments each clock-reading flag is read at. The two flags ask a formatter for the hour
 * and minute, and for the weekday, month and day, so each of those is walked through; then
 * the caller's timezone, and the two session fields that stand in for the clock.
 */
const MOMENTS: Readonly<Record<string, At>> = {
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
const AT_MOMENTS = CLOCK_READ_BY.flatMap((name) =>
  Object.keys(MOMENTS).map((moment) => [name, moment] as const)
);
/** Each part walked through reaches a reply: under the flag, the two moments read differently. */
const REACHES: readonly (readonly [string, string, string])[] = [
  ['FERNI_STATE', '3:00', '15:00'],
  ['FERNI_STATE', '15:00', 'the eval clock at night'],
  ['FERNI_STATE', '15:00', 'two hours into the call'],
  ['WORLD_NOW', '3:00', '15:00'],
  ['WORLD_NOW', 'June 7', 'June 8'],
  ['WORLD_NOW', 'the 15th of month 1', 'the 15th of month 7'],
  ['WORLD_NOW', '12:00', 'a half-hour timezone'],
];

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

  // FORGET_CALLS is kept by hand. A module that remembers a call and is missing from it shows
  // here: placed last to first, every call follows a different one.
  it.each(EVERY_FLAG)(
    'reads every call the same placed last to first, every flag %s',
    async (_label, flags) => {
      const forwards = await readUnder(flags);
      const backwards = await placeAllUnder(flags, true);
      expect(Object.fromEntries(backwards)).toEqual(Object.fromEntries(forwards));
    }
  );

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
  });

  // A flag that changes a reply here is checked here: give it a SHOWN_ON row.
  it.each(NO_ROW)('%s=%s changes no reply, so the flag needs no row', async (name, _l, word) => {
    expect(await moved({ [name]: word })).toEqual([]);
  });

  // The scope flags together and nothing else: the one pair read by itself. Every reply must be
  // exactly as at the defaults, so a change that has this state move a reply is red here.
  it.each(SCOPED)('%s, no other flag set: every reply as at the defaults', async (_l, flags) => {
    expect(READ_BY_GATE).toEqual(expect.arrayContaining(Object.keys(flags)));
    expect(await moved(flags)).toEqual([]);
    expect(await losses({}, flags)).toEqual([]);
  });

  it.each(CASES)('%s=%s alone lowers no reply', async (name, _label, word) => {
    expect(await losses({}, { [name]: word })).toEqual([]);
  });

  it.each(ON_TOP)(
    '%s=%s on top of every other flag set to %s lowers no reply',
    async (name, _label, base, word) => {
      const others = allBut(name, base);
      // Every flag at the same word is one reading for all of them: that one is kept.
      expect(await losses(others, { ...others, [name]: word }, word === base)).toEqual([]);
    }
  );

  // A word the grid lacks is harmless only while no flag reader knows it. With every flag set
  // to it at once, the calls must read exactly as with every flag misspelt.
  it.each(OTHER_WORDS)('no flag reader knows the word %s', async (word) => {
    const [unknown, tried] = [
      await readUnder(allBut('', MISSPELT)),
      await readUnder(allBut('', word)),
    ];
    expect(Object.fromEntries(tried)).toEqual(Object.fromEntries(unknown));
  });

  // The data file's own floors, calls and rows could be lowered by editing it. A second copy
  // (crisis-reply.never-lower.pin.ts) says the least it may say; the data may add, never take.
  it('says no less than its pinned copy: calls, lines, hours, floors, phrases, rows', () => {
    const byName = new Map(CALLS.map((call) => [call.name, call]));
    for (const [name, pinned] of Object.entries(PINNED_CALLS)) {
      const call = byName.get(name);
      expect(
        call && {
          says: call.says,
          hour: call.hour ?? 12,
          held: call.held ?? false,
          floors: call.floors.map((set) =>
            ANSWERS.map((answer) => (typeof set === 'string' ? set : set[answer]))
          ),
        },
        name
      ).toEqual(pinned);
    }
    expect(PINNED_NEVER_HEARD.filter((words) => !NEVER_HEARD.includes(words))).toEqual([]);
    for (const [flag, row] of Object.entries(PINNED_SHOWN_ON))
      expect(SHOWN_ON[flag], flag).toEqual(row);
    expect(
      Object.keys(LOWERS_A_REPLY).filter((flag) => !PINNED_LOWERS_A_REPLY.includes(flag))
    ).toEqual([]);
    for (const [flag, says] of Object.entries(PINNED_SAYS))
      expect(WORDING_NOT_READ.onlyWithFlag[flag]?.says, flag).toEqual(
        expect.arrayContaining([...says])
      );
  });

  it.each(INERT)('%s=%s is its default and changes no reply', async (name, _label, word) => {
    expect(await moved({ [name]: word })).toEqual([]);
  });

  // The copy guard can fail: each way of copying is counted inside a reply, and only there.
  it('counts a copy of the environment made while a reply is being made, and no other', async () => {
    const copy = (): unknown => [
      { ...process.env },
      // eslint-disable-next-line prefer-object-spread -- the other way to copy, on purpose
      Object.assign({}, process.env),
      Object.keys(process.env),
      Object.entries(process.env),
      JSON.stringify(process.env),
    ];
    const [made, by] = [copies.made, [...copies.by]];
    copy();
    expect(copies.made).toBe(made);
    await inReply.run(true, async () => {
      await Promise.resolve();
      copy();
    });
    expect(copies.made).toBe(made + 5);
    copies.made = made;
    copies.by = new Set(by);
  });

  // A flag read off a copy of the environment is not recorded as read, so it is never set here.
  // So: where the copies are made, under which flag alone, and how many, are all listed.
  it('copies the environment where listed and as often as listed, and no more', async () => {
    expect(copiesIn.get(await readUnder({}))).toBe(ENV_COPIED.atDefaults);
    expect(copiesIn.get(await readUnder(allBut('', 'on')))).toBe(ENV_COPIED.everyFlagOn);
    expect(copiesIn.get(await readUnder(allBut('', 'live')))).toBe(ENV_COPIED.everyFlagLive);
    expect([...copies.by].sort()).toEqual(ENV_COPIED.by);
  });

  it.each(READ_BY_GATE)(
    '%s alone has a reply copy the environment exactly if it is listed',
    async (name) => {
      let made = 0;
      for (const word of WORDS) made += copiesIn.get(await readUnder({ [name]: word })) ?? NaN;
      expect(made > 0, `${made} copies`).toBe(ENV_COPIED.byFlagAlone.includes(name));
    }
  );

  // The classifier's copy is handed to its prompt and to nothing else (the line is pinned).
  // Every name read off it there must also be read off the environment itself, where every
  // word of the flag is tried: then no flag can act through the copy alone.
  it('reads off the copy no flag it does not also read off the environment', () => {
    const linesOf = (file: string): string[] =>
      readFileSync(join(__dirname, '../../../..', file), 'utf8')
        .split('\n')
        .map((line) => line.trim());
    for (const [file, lines] of Object.entries(ENV_COPIED.lines))
      expect(
        linesOf(file).filter((line) => /\.\.\.[\w.]*\benv\b/i.test(line)),
        file
      ).toEqual(lines);
    // A copy kept under a name goes where these lines send it, and nowhere else.
    for (const [file, { names, lines }] of Object.entries(ENV_COPIED.kept)) {
      const named = new RegExp(`\\b(${names.join('|')})\\b`);
      expect(
        linesOf(file).filter((line) => named.test(line)),
        file
      ).toEqual(lines);
      expect(Object.keys(ENV_COPIED.lines), file).toContain(file);
    }
    expect(ENV_COPIED.by.map((site) => site.split(' in ')[1])).toEqual(
      Object.keys(ENV_COPIED.lines)
    );
    const read = new Set<string>();
    let copiedOn = 0;
    for (const flags of [{}, allBut('', 'on'), allBut('', 'live')]) {
      const copy = new Proxy<Record<string, string | undefined>>(
        { ...flags, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' },
        {
          get: (target, key) => (
            typeof key === 'string' && read.add(key),
            Reflect.get(target, key)
          ),
          has: (target, key) => (
            typeof key === 'string' && read.add(key),
            Reflect.has(target, key)
          ),
          ownKeys: (target) => ((copiedOn += 1), Reflect.ownKeys(target)),
        }
      );
      crisisClassifierPrompt(copy);
    }
    expect(copiedOn).toBe(0);
    expect([...read].sort()).toEqual(ENV_COPIED.readOffTheCopy);
    expect([...read].filter((name) => !READ_BY_GATE.includes(name))).toEqual([]);
  });

  // The scripted turn's read keeps its copy and hands it to startCrisisClassifier (the lines
  // are pinned above): the function the gate gives the environment itself on every turn the
  // patterns leave to the model. What it reads off the copy is recorded on the calls
  // themselves, with the flag alone and with every flag on and live: every flag in it must be
  // one the gate reads off the environment too, so every word of it is tried.
  it("reads off the scripted read's copy no flag it does not also read off the environment", async () => {
    const classifier = await import('../../../services/safety/crisis-classifier.js');
    const start = classifier.startCrisisClassifier;
    const read = new Set<string>();
    let handed = 0;
    const watched = vi
      .spyOn(classifier, 'startCrisisClassifier')
      .mockImplementation((input, options) => {
        if (!options.readBlocked) return start(input, options);
        handed += 1;
        return start(input, { ...options, env: noting(options.env ?? {}, read) });
      });
    try {
      for (const flags of [
        { CRISIS_SCRIPT_IMMINENT_READ: 'on' },
        allBut('', 'on'),
        allBut('', 'live'),
      ])
        await placeAllUnder(flags);
    } finally {
      watched.mockRestore();
    }
    // Not watched, this row would read nothing and pass: the copy must have been handed over.
    expect(handed).toBeGreaterThan(0);
    const flagsRead = [...read].filter(isFlag).sort();
    expect(flagsRead).toEqual(ENV_COPIED.readOffTheScriptedCopy);
    expect(flagsRead.filter((name) => !READ_BY_GATE.includes(name))).toEqual([]);
  });

  // A reply keyed on a session field the calls never set is never varied: list the field, and
  // give the calls its values, in the PR that makes the gate read it.

  // A key written twice in a table is not an error: the later row silently wins.
  // So the flag names written in each table's text are counted against the rows it ends up with.
  it('writes no row of its tables twice', () => {
    const text = readFileSync(join(__dirname, 'crisis-reply.never-lower.ts'), 'utf8');
    const written = (table: string): string[] => {
      const declared = text.indexOf(`export const ${table}`);
      const from = declared + text.slice(declared).search(/ =\s/);
      const next = text.indexOf('\n/**', from);
      const code = text
        .slice(from, next < 0 ? text.length : next)
        .split('\n')
        .filter((line) => !/^\s*\/\//.test(line))
        .join('\n');
      return [...code.matchAll(/\b([A-Z][A-Z0-9_]{2,}):/g)].map((match) => match[1]);
    };
    expect(written('SHOWN_ON')).toEqual(Object.keys(SHOWN_ON));
    expect(written('LOWERS_A_REPLY')).toEqual(Object.keys(LOWERS_A_REPLY));
    expect(written('WORDING_NOT_READ')).toEqual(Object.keys(WORDING_NOT_READ.onlyWithFlag));
    expect(new Set(CALLS.map((call) => call.name)).size).toBe(CALLS.length);
  });

  it('reads every listed field of the session, and no other', async () => {
    // The file has read the calls at the defaults and with every flag on by now; the eval
    // clock's own two fields are read only when a call carries one.
    await placeAllUnder({ FERNI_STATE: 'on' }, false, MOMENTS['the eval clock at night']);
    expect([...sessionRead].sort()).toEqual([...SESSION_FIELDS_READ].sort());
  });

  // The clock guard can fail: each kind of read is counted inside a reply, and only there.
  it('counts a clock read made while a reply is being made, and no other', async () => {
    const zoned = new Intl.DateTimeFormat('en-US', { hour: 'numeric', timeZone: ZONE });
    const ask = (): unknown => [
      new Date().getHours(),
      new Date().getUTCDay(),
      zoned.format(0),
      zoned.formatToParts(0),
    ];
    const [reads, asked] = [clock.reads, [...clock.asked]];
    clock.asked.clear();
    ask();
    expect(clock.reads).toBe(reads);
    await inReply.run(true, async () => {
      await Promise.resolve();
      ask();
    });
    expect(clock.reads).toBe(reads + 4);
    expect([...clock.asked]).toEqual([
      'getHours',
      'getUTCDay',
      'Intl.DateTimeFormat.format(hour)',
      'Intl.DateTimeFormat.formatToParts(hour)',
    ]);
    clock.reads = reads;
    clock.asked = new Set(asked);
  });

  it.each(READ_BY_GATE)('%s has a reply read the clock exactly if it is listed', async (name) => {
    let reads = 0;
    for (const word of WORDS) reads += clockReadsIn.get(await readUnder({ [name]: word })) ?? NaN;
    expect(reads > 0, `${reads} reads through ${[...clock.asked]}`).toBe(
      CLOCK_READ_BY.includes(name)
    );
  });

  it('no reply reads the clock unless a listed flag is set', async () => {
    expect(clockReadsIn.get(await readUnder({}))).toBe(0);
    for (const base of BASES) {
      const others = Object.fromEntries(
        Object.entries(allBut('', base)).filter(([name]) => !CLOCK_READ_BY.includes(name))
      );
      expect(clockReadsIn.get(await readUnder(others)), `every other flag ${base}`).toBe(0);
    }
  });

  it('places each moment at the wall clock it names, in its zone, on a day with no clock change', async () => {
    expect(FERNI_HOME_TZ).toBe(HOME_ZONE);
    const hours = [...new Set([12, ...CALLS.map((call) => call.hour ?? 12)])];
    for (const [moment, at] of Object.entries(MOMENTS)) {
      for (const hour of hours) {
        const [zone, want] = [zoneOf(at), fieldsOf(hour, at)];
        const named = `${moment}, a call at ${hour}:00, in ${zone}`;
        expect(wallClock(instantOf(hour, at), zone), named).toEqual(want);
        const offset = (h: number, m: number): number => {
          const ms = instantIn(zone, [want[0], want[1], want[2], h, m]);
          return asUtc(wallClock(ms, zone)) - ms;
        };
        expect(offset(0, 0), `${named}: the clock changes that day`).toBe(offset(23, 59));
      }
    }
    expect(wallClock(instantOf(0), 'America/Denver')).toEqual([2026, 5, 10, 0, 0]);
    expect(wallClock(instantOf(12, MOMENTS['a timezone far ahead']), 'Pacific/Kiritimati')).toEqual(
      [2026, 5, 10, 21, 0]
    );
    expect(zoneOf(MOMENTS['a timezone that does not exist'])).toBe(HOME_ZONE);
    // And place() sets that instant, so no reading sits on the process's own clock.
    const [call, answer] = [CALLS[0], ANSWERS[0]];
    for (const [moment, at] of Object.entries(MOMENTS)) {
      await place(call, answer, at);
      expect(placedAt, `${moment}: the clock place() set`).toBe(instantOf(call.hour ?? 12, at));
    }
  });

  // The readings below read something: with the flag on, the two moments are not asked alike.
  it.each(REACHES)('%s: %s and %s do not read the same', async (name, one, other) => {
    // Two moments that set the hour are two hours on Ferni's home clock, which FERNI_STATE
    // reads, so the comparison below cannot pass on two equal clocks.
    const homeHour = (moment: string): number | string =>
      MOMENTS[moment].hour === undefined
        ? moment
        : wallClock(instantOf(12, MOMENTS[moment]), HOME_ZONE)[3];
    expect(homeHour(one)).not.toBe(homeHour(other));
    const at = (moment: string): Promise<Readings> =>
      placeAllUnder({ [name]: 'on' }, false, MOMENTS[moment]);
    expect(Object.fromEntries(await at(one))).not.toEqual(Object.fromEntries(await at(other)));
  });

  it.each(AT_MOMENTS)(
    '%s lowers no reply at %s, alone or on top of every other flag',
    async (name, moment) => {
      const read = (flags: FlagValues): Promise<Readings> =>
        placeAllUnder(flags, false, MOMENTS[moment]);
      for (const word of BASES) {
        expect(lostIn(await read({}), await read({ [name]: word })), `${word} alone`).toEqual([]);
        const others = allBut(name, word);
        expect(
          lostIn(await read(others), await read({ ...others, [name]: word })),
          `${word} on top`
        ).toEqual([]);
      }
    }
  );

  // The header's limits, counted. A new call or script changes a count here, and the limit
  // is then restated by hand in WORDING_NOT_READ.
  it('says how many turns it reads for the numbers only', async () => {
    const turns = [...(await readUnder({})).values()].flat().map(gives);
    expect({
      scripted: turns.filter((g) => g["code's words"]).length,
      guided: turns.filter((g) => !g["code's words"] && g['988 asked of the model']).length,
      unguided: turns.filter((g) => !g["code's words"] && !g['988 asked of the model']).length,
    }).toEqual(WORDING_NOT_READ.atDefaults);
  });

  it.each(READ_BY_GATE)('%s: a sentence only it brings is named as not read', async (name) => {
    const defaults = await readUnder({});
    const brought = new Set<string>();
    for (const word of WORDS) {
      const on = await readUnder({ [name]: word });
      for (const [key, off] of defaults)
        off.forEach((turn, i) => {
          for (const sentence of codeSays(on.get(key)![i]))
            if (!turn.spoken.includes(sentence)) brought.add(sentence);
        });
    }
    const row = WORDING_NOT_READ.onlyWithFlag[name];
    expect(brought.size, [...brought].join(' | ')).toBe(row?.sentences ?? 0);
    // The number the flag's sentences are there to give is in them.
    const carries = (number: string): boolean =>
      [...brought].some((s) => (number === '988' ? at988(s) : says(s, number)) >= 0);
    expect((row?.says ?? []).filter((number) => !carries(number))).toEqual([]);
  });

  it.each(Object.entries(LOWERS_A_REPLY))(
    '%s is off by default and still lowers',
    async (name, known) => {
      expect(defaultOf(name)).toBe('off');
      // Fixed? Delete the LOWERS_A_REPLY row and give the flag a SHOWN_ON row.
      expect(await losses({}, { [name]: known.value })).toEqual(known.lost);
    }
  );

  // Each loss a flag adds on top of THIRD_PARTY_SELF_HARM=live is red in that flag's own on-top row;
  // this pins the known lowering's own loss on the every-flag-live base, under its own name.
  it.each(Object.entries(LOWERS_A_REPLY))(
    '%s on top of every other flag set to live loses only what it loses alone',
    async (name, known) => {
      const base = allBut(name, 'live');
      expect(await losses(base, { ...base, [name]: known.value })).toEqual(known.lost);
    }
  );

  describe('the holds this grid leans on', () => {
    // The grid gives the adjudicator no answer, so it cannot see a check-in the adjudicator
    // would hand a caller in place of crisis guidance. That is sound only while production
    // holds both live modes back. Lifting the hold is red here, by this message.
    it('the adjudicator and the easing read set to live are held, and change no reply', async () => {
      expect(adjudicatorCheckinsMayChangeReplies(), LIFT_FIRST).toBe(false);
      expect(resolveCrisisAdjudicatorMode({ CRISIS_ADJUDICATOR: 'live' }), LIFT_FIRST).toBe(
        'shadow'
      );
      expect(resolveEasingMode({ CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' }), LIFT_FIRST).toBe(
        'held'
      );
      // Two live words held with no lifter. The grid reads each word; this pins what it is.
      expect(resolveGradedResponseMode({ CRISIS_GRADED_RESPONSE: 'live' }), HELD_IN_CODE).toBe(
        'shadow'
      );
      // The grounded release is live only beside the reply gate set to the word live, in lower
      // case, space around it aside (MODES: how this grid runs it, with no answer from its
      // reads). Unset, or any other gate word, holds it.
      for (const guard of ['live', ' live\n'])
        expect(
          resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: guard })
        ).toBe('live');
      for (const guard of [undefined, '', 'shadow', 'off', 'Live', 'LIVE'])
        expect(
          resolveGroundedReleaseMode({ CRISIS_GROUNDED_RELEASE: 'live', CRISIS_GUARD_MODE: guard }),
          `the reply gate set to ${JSON.stringify(guard)}. ${HELD_IN_CODE}`
        ).toBe('shadow');
      for (const name of ['CRISIS_ADJUDICATOR', 'CRISIS_CLASSIFIER_ONLY_CHECKIN'])
        expect(await moved({ [name]: 'live' }), `${name}=live. ${LIFT_FIRST}`).toEqual([]);
      expect(
        await moved({ CRISIS_ADJUDICATOR: 'live', CRISIS_CLASSIFIER_ONLY_CHECKIN: 'live' }),
        LIFT_FIRST
      ).toEqual([]);
    });

    // Only a test may lift it: a production file that names the lifter could lift it in a
    // deploy, where no test of this file runs.
    it('no production file but its own names the lifter', () => {
      const naming = productionFiles('.').filter((file) => sourceOf(file).includes(LIFTER));
      expect(naming).toEqual(['./services/safety/crisis-adjudicator.ts']);
    });

    // A hold of the same kind, added later, is one more thing this grid cannot see.
    it('the crisis folders have no test-only lifter but the one pinned here', () => {
      const files = HOLD_FOLDERS.flatMap(productionFiles);
      expect(
        declaredIn(files, /^export (?:async )?(?:function|const) (\w+ForTests?)\b/gm),
        LIFT_FIRST
      ).toEqual(TEST_ONLY_EXPORTS);
    });

    it('services/safety has no module-level variable but those read and listed here', () => {
      const declared = declaredIn(
        productionFiles('services/safety'),
        /^(?:export )?(?:let|var) (\w+)/gm
      );
      expect(declared.sort(), NEW_VARIABLE).toEqual(SAFETY_VARIABLES);
    });
  });

  // The total, in whatever order the tests ran. A reader with its own model call shows up here.
  it('reaches no model: the second models are asked through the stub and nowhere else', async () => {
    await readUnder({ CRISIS_ADJUDICATOR: 'shadow' });
    expect(reached).toEqual({ 'model clients': 0, connections: 0, fetches: 0 });
    expect(adjudicatorAsks).toBeGreaterThan(0);
  });
});

/** The calls with only these flags set, read fresh (never from the cache). */
async function placeAllUnder(flags: FlagValues, backwards = false, at?: At): Promise<Readings> {
  for (const name of STUBBED) vi.stubEnv(name, flags[name]);
  for (const [name, value] of Object.entries(MODES)) vi.stubEnv(name, value);
  try {
    return await placeAll(backwards, at);
  } finally {
    vi.unstubAllEnvs();
  }
}
