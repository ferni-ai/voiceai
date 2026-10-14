/**
 * Keeps callers' phone numbers out of the process's log output.
 *
 * A phone caller joins the room as a participant named `sip_+1…`, and that identity
 * reached the agent log in full from our own lines ("Participant ready", "Participant
 * left") and from the LiveKit SDK's (room_io `participantValue`), along with the
 * numbers in job metadata for calls made on someone's behalf. Fixing call sites can't
 * reach the SDK, so this sits under all of them, in two passes:
 *
 * 1. Structured, while a log call's object is still an object (log-object-redaction.ts):
 *    on our pino sink (safe-logger) and the LiveKit SDK's pino logger, the `log`
 *    formatter and every child's bindings are walked once, and any value under a phone
 *    key is masked, at any depth, in arrays, nested arrays and csv strings.
 * 2. Text, as a backstop for what isn't an object (messages, console, the SDK's pretty
 *    printer, raw writes): everything written to process.stdout, process.stderr, the
 *    SDK logger's destination and our fd-2 SonicBoom is scanned once, linearly.
 *
 * What the text pass masks. A log line is full of digit runs that are not phone numbers
 * (epoch ms, durations, sizes, dates, IPs, UUIDs), so a run of digits joined by single
 * separators (space, dot, dash, parens) is masked only when one of these holds:
 * - it starts with "+" or "%2B" and has 8 to 15 digits (E.164; 7 with a phone context);
 * - it follows sip_, sip:, tel:, whatsapp:, <Dial>, a URL path segment such as
 *   /by-phone/ or /phones/, a phrase (phone, phone number, phone #, dialing, calling,
 *   SMS from, mobile), or a phone key (the keys log-object-redaction.ts names, also
 *   URL-encoded as phoneNumber%3D), and has 7 to 15 digits;
 * - it follows a weak word or key (to, from, at, number) and is a valid phone number:
 *   NANP (10 digits, or 11 starting with 1, area code and exchange starting 2-9) or a
 *   10-11 digit national number starting with 0, so `"from":1791797261` is left alone;
 * - it continues a list under such a context: the next element of a flat or nested
 *   JSON array ("phones":["…","…"]) or of a csv value ("4155550123,4155550198");
 * - it is laid out like one: (415) 555-0123, 415-555-0123, 415.555.0123, 1-415-555-0123,
 *   1 415 555 0123 (valid NANP only), or a national number starting with 0 in 2 to 5
 *   groups totalling 10-11 digits (020 7946 0958, 01 23 45 67 89).
 * Bare unformatted digits with no context are never masked (4155550123 alone could be a
 * size or an id), and neither is "415 555 0123" without the leading 1 (it reads the same
 * as three buffer sizes). A run that joins several numbers is read group by group, so a
 * phone number inside a longer run is still found, and a number never takes more than
 * 15 digits. Some ids are masked too (orderNumber: 12345678, "called 12345678 times"):
 * over-masking is the safe side. The last four digits stay, for debugging. Mixed
 * arrays in text ([{"n":"…"},"…"]) are left to the structured pass.
 *
 * Writes are redacted line by line: text after the last newline is held (at most a few
 * hundred chars, and only until the next write or 20 ms) so a number or its key split
 * across two writes is still seen whole, and bytes are decoded with a streaming decoder
 * so a multibyte character split across writes is not mangled.
 *
 * What this does not cover: a child process with inherited stdio writes to the fd
 * directly, so it has to install this itself (the per-call job child imports
 * instrument.ts first; the voice worker, tool service, persona service, outreach
 * worker and Pub/Sub worker install it first thing). A worker thread's console goes
 * through the main thread's process.stdout and is covered; a worker thread that opens
 * its own fd destination is not (none does today). Native code writing to fd 1/2 is
 * not covered.
 *
 * LOG_PHONE_REDACTION=off turns it off. It is read on every write and log call, so it
 * can also be set in .env, which loads after the redaction is installed.
 *
 * @module utils/log-redaction
 */

import { StringDecoder } from 'node:string_decoder';

import {
  maskDigits,
  NO_CONTEXT,
  type PhoneContext,
  redactLogObject,
  STRONG,
  validWeak,
  WEAK,
} from './log-object-redaction.js';

const MAX_DIGITS = 15;
const GROUP = /\d+/g;

/** Digit groups joined by one separator; a "+" (or its URL encoding) may start it. */
const RUN = String.raw`(?:\+|%2B)?\(?\d+(?:(?:[ .-]\(?|\)[ .-]?|\()\d+)*`;
/** Between a key and its value: a quote (maybe escaped), ":" or "=" (or %3D), array "["s. */
const KEY_TAIL = String.raw`(?:\\?["'])?[ \t]{0,3}(?:[:=]|%3D)[ \t]{0,3}(?:\[[ \t]{0,3}){0,3}(?:\\?["'])?`;
/** Phone keys, matched from their phone word so a camelCase prefix needs no scan (see log-object-redaction.ts). */
const PHONE_KEY = String.raw`(?:(?:phone|mobile|msisdn|e164|digits|caller|callee|recipient|destination|called|forwardedfrom|calledfrom|callto|callfrom|whatsapp|telephone)(?:s|_?numbers?|_?nums?|_?nos?|_?ids?|_?values?)?|(?<![a-z])(?:dest|tel|cell)|[a-z0-9]_?numbers?)`;
const PHRASE = String.raw`(?<![a-z])(?:phone(?:[ \t]{1,3}(?:number|num|no\.?))?|dial(?:s|ed|ing)?|call(?:s|ed|ing)?|text(?:s|ed|ing)?|sms|fax|mobile|cell|whatsapp)(?:[ \t]{1,3}(?:to|from|on|at))?(?:[ \t]{0,3}#[ \t]{0,2}|:[ \t]{0,2}|[ \t]{1,3})`;
const STRONG_PREFIX = String.raw`sip[_:]|tel:|whatsapp:|<(?:dial|number|sms)>|/(?:by-)?(?:phones?|numbers?|msisdn|tel|callers?|callees?|recipients?|contacts?)/|${PHONE_KEY}${KEY_TAIL}|${PHRASE}`;
const WEAK_PREFIX = String.raw`(?<![a-z])(?:(?:to|from|number|num)${KEY_TAIL}|(?:to|at|from)[ \t]{1,3})`;
/**
 * One linear scan for runs. A run shorter than 7 chars can't hold a phone number and is
 * skipped by the first lookahead, unless it opens an array (it may start a list of
 * phone numbers); the context is a lookbehind with only bounded quantifiers, tried only
 * where a run starts.
 */
const TEXT = new RegExp(
  // A run starts here; it is long enough or opens an array; a context ends in one of
  // these chars, so the context lookbehinds run only then. An empty last alternative,
  // not "?": a quantified group may not match empty, so its captures would never be set.
  `(?=[+%(\\d])(?:(?=.[\\d+%().\\- Bb]{6})|(?<=\\[[ \\t]{0,3}(?:\\\\?["'])?))` +
    `(?:(?<=[_:"'=\\s>/#[Dd])(?:(?<=(${STRONG_PREFIX}))|(?<=(${WEAK_PREFIX})))|)(${RUN})`,
  'gi'
);

// Layouts, matched in place in the run (sticky) so a long run is never re-sliced
const NANP_PAREN = /\(\d{3}\) ?\d{3}[ .-]\d{4}(?!\d)/y;
const NANP_SEP = /\d{3}[.-]\d{3}[.-]\d{4}(?!\d)/y;
const NANP_CC = /1[ .-]?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}(?!\d)/y;
const NATIONAL = /0\d{1,4}(?:[ -]\d{2,6}){1,4}(?!\d)/y;

function matchAt(re: RegExp, run: string, at: number): string | undefined {
  re.lastIndex = at;
  return run.match(re)?.[0];
}

function validNanpLayout(digits: string): boolean {
  return validWeak(digits, false) && digits[0] !== '0';
}

interface Group {
  start: number;
  end: number;
  digits: string;
}

/** Where group i starts in the run, taking in a "(" just before it. */
function groupStart(run: string, groups: Group[], i: number): number {
  if (i === 0) return 0;
  const s = groups[i].start;
  return run[s - 1] === '(' ? s - 1 : s;
}

/**
 * How many groups from i make one number: at most 15 digits; a contiguous run of 7+
 * digits or a +1 NANP number stands alone; a "(" after 10 digits starts something new.
 */
function takeNumber(run: string, groups: Group[], i: number): number {
  let digits = 0;
  let count = 0;
  for (let j = i; j < groups.length; j++) {
    const g = groups[j].digits;
    if (count > 0) {
      if (digits + g.length > MAX_DIGITS) break;
      if (count === 1 && digits >= 7) break;
      if (digits >= 10 && run.slice(groups[j - 1].end, groups[j].start).includes('(')) break;
      if (digits === 11 && groups[i].digits === '1') break;
    }
    digits += g.length;
    count++;
  }
  return count;
}

/** Whether group i can start a layout at all: "(", "1", a leading 0, or ddd then "." or "-". */
function mayStartLayout(run: string, groups: Group[], i: number): boolean {
  const g = groups[i];
  const next = run[g.end];
  return (
    run[g.start - 1] === '(' ||
    g.digits === '1' ||
    g.digits[0] === '0' ||
    (g.digits.length === 3 && (next === '.' || next === '-'))
  );
}

/** How many groups from i form a number laid out like a phone number (0 if none). */
function shapedNumber(run: string, groups: Group[], i: number): number {
  if (!mayStartLayout(run, groups, i)) return 0;
  const at = groupStart(run, groups, i);
  const m =
    matchAt(NANP_PAREN, run, at) ??
    matchAt(NANP_SEP, run, at) ??
    matchAt(NATIONAL, run, at) ??
    matchAt(NANP_CC, run, at);
  if (m === undefined) return 0;
  const digits = m.replace(/\D/g, '');
  if (m.startsWith('0') && digits.length !== 10 && digits.length !== 11) return 0;
  if (m.startsWith('1') && matchAt(NANP_SEP, run, at) === undefined && !validNanpLayout(digits)) {
    return 0;
  }
  return m.match(GROUP)?.length ?? 0;
}

function digitsOf(groups: Group[], i: number, count: number): string {
  let d = '';
  for (let j = i; j < i + count; j++) d += groups[j].digits;
  return d;
}

/** How many groups at the start of the run are a number, given its context. */
function leadingNumber(
  run: string,
  groups: Group[],
  ctx: PhoneContext,
  afterWord: boolean
): number {
  const plus = run[0] === '+' || run[0] === '%';
  if (plus || ctx !== NO_CONTEXT) {
    const count = takeNumber(run, groups, 0);
    const digits = digitsOf(groups, 0, count);
    const min = plus && ctx === NO_CONTEXT ? 8 : 7;
    const ok =
      digits.length <= MAX_DIGITS &&
      (ctx === WEAK ? validWeak(digits, plus) : digits.length >= min);
    if (ok) return count;
  }
  if (plus || afterWord) return 0;
  return shapedNumber(run, groups, 0);
}

/** Redacts one run of digit groups. */
function redactRun(run: string, ctx: PhoneContext, afterWord: boolean): string {
  // %2B is a URL-encoded "+": its 2 isn't a digit of the number
  const groups: Group[] = [];
  let start = run[0] === '%' ? 3 : 0;
  for (let k = start; k <= run.length; k++) {
    const digit = k < run.length && run.charCodeAt(k) >= 48 && run.charCodeAt(k) <= 57;
    if (digit && start < 0) start = k;
    else if (!digit && start >= 0) {
      if (k > start) groups.push({ start, end: k, digits: run.slice(start, k) });
      start = -1;
    }
  }
  let out = '';
  let cursor = 0;
  let i = 0;
  while (i < groups.length) {
    const count =
      i === 0 ? leadingNumber(run, groups, ctx, afterWord) : shapedNumber(run, groups, i);
    if (count === 0) {
      i++;
      continue;
    }
    out += run.slice(cursor, groupStart(run, groups, i)) + maskDigits(digitsOf(groups, i, count));
    cursor = groups[i + count - 1].end;
    i += count;
  }
  return cursor === 0 ? run : out + run.slice(cursor);
}

/** A context that carries to the next run while only list punctuation lies between them. */
interface Carry {
  ctx: PhoneContext;
  /** How many arrays deep the run is; 0 for a scalar (a csv string). */
  depth: number;
  array: boolean;
}

const MAX_GAP = 64;
/** What may lie between two elements of a list, short elements ("123") included. */
const GAP_CHARS = new Set(' \t"\'\\0123456789.-+');

/** Whether the text between two runs keeps `carry` going: the next element of the same list. */
function continues(carry: Carry, text: string, from: number, to: number): boolean {
  if (to - from > MAX_GAP || to === from) return false;
  let comma = false;
  for (let i = from; i < to; i++) {
    const c = text[i];
    if (c === ',' || c === ';') comma = true;
    else if (c === '[') carry.depth++;
    else if (c === ']') {
      carry.depth--;
      if (!carry.array || carry.depth <= 0) return false;
    } else if (!GAP_CHARS.has(c)) return false;
  }
  return comma;
}

function countBrackets(prefix: string): number {
  let n = 0;
  for (const c of prefix) if (c === '[') n++;
  return n;
}

/** Masks phone numbers in free text, keeping their last four digits. One linear scan. */
export function redactPhoneNumbers(text: string): string {
  let carry: Carry | undefined;
  let lastEnd = -1;
  return text.replace(TEXT, (run: string, strong?: string, weak?: string, ...rest: unknown[]) => {
    const offset = rest[1] as number;
    const prefix = strong ?? weak;
    let ctx: PhoneContext = strong !== undefined ? STRONG : weak !== undefined ? WEAK : NO_CONTEXT;
    if (prefix !== undefined) {
      const depth = countBrackets(prefix);
      carry = { ctx, depth, array: depth > 0 };
    } else if (carry && continues(carry, text, lastEnd, offset)) {
      ({ ctx } = carry);
    } else {
      carry = undefined;
    }
    lastEnd = offset + run.length;
    const before = text[offset - 1];
    return redactRun(run, ctx, before !== undefined && /\w/.test(before));
  });
}

function redactionOff(): boolean {
  return process.env['LOG_PHONE_REDACTION'] === 'off';
}

/** A line longer than this with no newline yet is written out, keeping only its end. */
const HOLD_MAX = 512;
const HOLD_TAIL = 64;
const HOLD_MS = 20;
const RUN_CHARS = new Set('0123456789+%(). \t-');

/** Where the part of `text` to hold back for the next write starts. */
function holdFrom(text: string): number {
  if (text.endsWith('\n')) return text.length;
  const lineStart = text.lastIndexOf('\n') + 1;
  if (text.length - lineStart <= HOLD_MAX) return lineStart;
  let runStart = text.length;
  while (runStart > lineStart && RUN_CHARS.has(text[runStart - 1])) runStart--;
  return Math.max(lineStart, runStart - HOLD_TAIL);
}

const flushers = new Set<() => void>();
let exitHooked = false;

const REDACTING = Symbol.for('ferni.logPhoneRedaction');
type WriteFn = (chunk: unknown, ...rest: unknown[]) => unknown;
interface Marked {
  write: WriteFn;
  [REDACTING]?: true;
}

/** The text of a write, or undefined for one this can't read (another encoding, an object). */
function chunkText(chunk: unknown, encoding: unknown, decoder: StringDecoder): string | undefined {
  if (chunk instanceof Uint8Array) {
    return decoder.write(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
  }
  if (typeof chunk !== 'string') return undefined;
  if (typeof encoding === 'string' && !/^utf-?8$/i.test(encoding)) return undefined;
  // Bytes a Buffer write left mid-character can't be completed by a string: keep them (as U+FFFD)
  return decoder.end() + chunk;
}

/** Whether a write is complete lines and its text is exactly the chunk (nothing held before or after). */
function wholeLines(chunk: unknown, text: string): boolean {
  if (!text.endsWith('\n')) return false;
  if (typeof chunk === 'string') return text === chunk;
  return Buffer.byteLength(text) === (chunk as Uint8Array).byteLength;
}

function callbackOf(rest: unknown[]): (() => void) | undefined {
  const cb = rest[rest.length - 1];
  return typeof cb === 'function' ? (cb as () => void) : undefined;
}

/** Wraps `target.write` so every chunk is redacted first. Idempotent per target. */
export function redactWrites(target: unknown): void {
  const t = target as Marked | null | undefined;
  if (!t || typeof t.write !== 'function' || t[REDACTING] === true) return;
  const { write } = t;
  const decoder = new StringDecoder('utf8');
  let pending = '';
  let timer: NodeJS.Timeout | undefined;

  const flush = (): void => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (pending === '') return;
    const text = pending;
    pending = '';
    write.call(t, redactionOff() ? text : redactPhoneNumbers(text));
  };
  flushers.add(flush);
  if (!exitHooked) {
    exitHooked = true;
    process.once('exit', () => flushers.forEach((f) => f()));
  }

  t.write = function redactedWrite(this: unknown, chunk: unknown, ...rest: unknown[]) {
    const text = redactionOff() ? undefined : chunkText(chunk, rest[0], decoder);
    if (text === undefined) {
      flush();
      return write.call(this, chunk, ...rest);
    }
    const asChunk = (s: string): unknown =>
      typeof chunk === 'string' ? s : Buffer.from(s, 'utf8');
    if (pending === '' && wholeLines(chunk, text)) {
      const redacted = redactPhoneNumbers(text);
      return write.call(this, redacted === text ? chunk : asChunk(redacted), ...rest);
    }
    const all = pending + text;
    const cut = holdFrom(all);
    pending = all.slice(cut);
    if (timer) clearTimeout(timer);
    timer = pending === '' ? undefined : setTimeout(flush, HOLD_MS).unref();
    if (cut === 0) {
      const cb = callbackOf(rest);
      if (cb) process.nextTick(cb);
      return true;
    }
    return write.call(this, asChunk(redactPhoneNumbers(all.slice(0, cut))), ...rest);
  };
  t[REDACTING] = true;
}

/** Redacts a log destination (safe-logger's fd-2 SonicBoom) once this process installed the redaction. */
export function redactLogDestination<T>(stream: T): T {
  if (installed()) redactWrites(stream);
  return stream;
}

/** The destination a pino logger writes every line to (a multistream, for the SDK's). */
function pinoDestination(logger: unknown): unknown {
  if (typeof logger !== 'object' || logger === null) return undefined;
  const key = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream');
  return key ? (logger as Record<symbol, unknown>)[key] : undefined;
}

function installed(): boolean {
  return (globalThis as Record<symbol, unknown>)[REDACTING] === true;
}

function pinoSymbol(logger: object, description: string): symbol | undefined {
  return Object.getOwnPropertySymbols(logger).find((s) => s.description === description);
}

type LogFormatter = (obj: Record<string, unknown>) => Record<string, unknown>;
interface PinoLike {
  child: (bindings: Record<string, unknown>, options?: unknown) => unknown;
  [key: symbol]: unknown;
}

/**
 * Masks phone numbers in a pino logger's log objects and child bindings, where they are
 * still objects (log-object-redaction.ts), once this process installed the redaction.
 * Its `log` formatter is wrapped, which children inherit; children reset the bindings
 * formatter, so `child` is wrapped instead, on the root, where children find it too.
 */
export function redactPinoLogger<T>(logger: T): T {
  if (!installed() || typeof logger !== 'object' || logger === null) return logger;
  const l = logger as unknown as PinoLike;
  const key = pinoSymbol(l, 'pino.formatters');
  if (!key || l[REDACTING] === true || typeof l.child !== 'function') return logger;
  const formatters = l[key] as { log?: LogFormatter };
  const { log } = formatters;
  l[key] = {
    ...formatters,
    log: (obj: Record<string, unknown>) => {
      const out = log ? log(obj) : obj;
      return redactionOff() ? out : redactLogObject(out);
    },
  };
  const { child } = l;
  l.child = function redactedChild(this: unknown, bindings, options) {
    return child.call(this, redactionOff() ? bindings : redactLogObject(bindings), options);
  };
  l[REDACTING] = true;
  return logger;
}

const SDK_LOGGER = Symbol.for('@livekit/agents:logger');

/** Redacts the SDK logger now and every time initializeLogger replaces it. */
function redactSdkLogger(): void {
  const g = globalThis as Record<symbol, unknown>;
  let current = g[SDK_LOGGER];
  redactWrites(pinoDestination(current));
  redactPinoLogger(current);
  Object.defineProperty(g, SDK_LOGGER, {
    configurable: true,
    enumerable: false,
    get: () => current,
    set: (logger: unknown) => {
      current = logger;
      redactWrites(pinoDestination(logger));
      redactPinoLogger(logger);
    },
  });
}

/** Installs the redaction for this process. Call before anything logs (log-redaction-install.ts). */
export function installLogPhoneRedaction(): void {
  if (redactionOff()) return;
  const g = globalThis as Record<symbol, unknown>;
  if (g[REDACTING] === true) return;
  g[REDACTING] = true;
  redactWrites(process.stdout);
  redactWrites(process.stderr);
  redactSdkLogger();
}
