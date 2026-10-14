/**
 * Keeps callers' phone numbers out of the process's log output.
 *
 * A phone caller joins the room as a participant named `sip_+1…`, and that identity
 * reached the agent log in full from our own lines ("Participant ready", "Participant
 * left") and from the LiveKit SDK's (room_io `participantValue`), along with the
 * numbers in job metadata for calls made on someone's behalf. Fixing call sites can't
 * reach the SDK, so this sits under all of them: it rewrites what is written to
 * process.stdout and process.stderr, what the SDK's logger writes (its pretty printer
 * writes to fd 1 directly, past process.stdout), and our app sink's fd-2 SonicBoom
 * (safe-logger passes it through redactLogDestination).
 *
 * What counts as a phone number. A log line is full of digit runs that are not phone
 * numbers (epoch ms, durations, sizes, dates, IPs, UUIDs), so a run of digits joined by
 * single separators (space, dot, dash, parens) is masked only when one of these holds:
 * - it starts with "+" or "%2B" and has 8 to 15 digits (E.164; 7 with a phone context);
 * - it follows sip_, sip:, tel:, <Dial>, a dialling word ("dialing", "calling", "SMS
 *   from", "phone"), or a phone key, and has 7 to 15 digits. A phone key ends in phone,
 *   mobile, msisdn, e164, digits or number (contactPhone, user_phone, phones, Digits,
 *   fromNumber, to_number) or is caller/callee/recipient/destination/dest/tel and their
 *   Id/_number forms; callerLatencyMs is not one, and turnNumber: 3 is too short;
 * - it follows a to/from/number key and is a valid North American number (10 digits, or
 *   11 starting with 1, area code and exchange starting 2-9) or a 10-11 digit national
 *   number starting with 0, so `"from":1791797261` (epoch seconds) is left alone;
 * - it is laid out like one: (415) 555-0123, 415-555-0123, 415.555.0123, 1-415-555-0123,
 *   1 415 555 0123 (valid NANP only), or a national number starting with 0 in 2 to 5
 *   groups totalling 10-11 digits (020 7946 0958, 01 23 45 67 89).
 * Bare unformatted digits with no context are never masked (4155550123 alone could be a
 * size or an id), and neither is "415 555 0123" without the leading 1 (it reads the same
 * as three buffer sizes). A run that joins several numbers is read group by group, so a
 * phone number inside a longer run is still found, and a number never takes more than
 * 15 digits. The last four digits stay, for debugging.
 *
 * Writes are redacted line by line: text after the last newline is held (at most a few
 * hundred chars, and only until the next write or 20 ms) so a number or its key split
 * across two writes is still seen whole, and bytes are decoded with a streaming decoder
 * so a multibyte character split across writes is not mangled.
 *
 * What this does not cover: a child process with inherited stdio writes to the fd
 * directly, so it has to install this itself (the per-call job child imports
 * instrument.ts first; the voice worker, tool service, persona service, outreach
 * worker and Pub/Sub worker install it first thing). A worker thread's console goes through the main
 * thread's process.stdout and is covered; a worker thread that opens its own fd
 * destination is not (none does today). Native code writing to fd 1/2 is not covered.
 *
 * LOG_PHONE_REDACTION=off turns it off. It is read on every write, so it can also be
 * set in .env, which loads after the redaction is installed.
 *
 * @module utils/log-redaction
 */

import { StringDecoder } from 'node:string_decoder';

const KEEP_DIGITS = 4;
const MAX_DIGITS = 15;

/** Digit groups joined by one separator; a "+" (or its URL encoding) may start it. */
const RUN = /(?:\+|%2[Bb])?\(?\d+(?:(?:[ .-]\(?|\)[ .-]?|\()\d+)*/g;
const GROUP = /\d+/g;

/** Between a key and its value: a quote (maybe escaped), ":" or "=", an array's "[". */
const KEY_TAIL = String.raw`(?:\\?["'])?\s*[:=]\s*\[?\s*(?:\\?["'])?`;
/**
 * Phone keys: any key ending in phone/mobile/msisdn/e164/digits (contactPhone,
 * user_phone, phones, Digits), or in number (fromNumber, to_number; "number" alone is
 * a weak key), plus caller/callee/recipient/destination and their _number/Id forms.
 * callerLatencyMs is not one. Only runs of 7+ digits are ever masked, so turnNumber: 3
 * stays.
 */
const PHONE_KEY = String.raw`(?:\w*?(?:phone|mobile|msisdn|e164|digits)(?:_?(?:number|num|no|id)|s)?|\w+?_?number|(?:caller|callee|recipient|destination)(?:_?(?:num|no|id))?|dest|tel|telephone|cell)`;
const STRONG_CONTEXT = new RegExp(
  String.raw`(?:sip[_:]|tel:|<(?:dial|number|sms)>|(?<!\w)(?:dial(?:s|ed|ing)?|call(?:s|ed|ing)?|text(?:s|ed|ing)?|sms|fax|phone|mobile)\s+(?:(?:to|from|on|at)\s+)?` +
    String.raw`|(?<!\w)${PHONE_KEY}${KEY_TAIL})$`,
  'i'
);
const WEAK_CONTEXT = new RegExp(String.raw`(?<!\w)(?:to|from|number|num)${KEY_TAIL}$`, 'i');
/** A context ends in one of these, so most runs skip the context regexes. */
const CONTEXT_END = /[_:"'=\s[>]$/;

const NANP_PAREN = /^\(\d{3}\) ?\d{3}[ .-]\d{4}(?!\d)/;
const NANP_SEP = /^\d{3}[.-]\d{3}[.-]\d{4}(?!\d)/;
const NANP_CC = /^1[ .-]?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}(?!\d)/;
const NATIONAL = /^0\d{1,4}(?:[ -]\d{2,6}){1,4}(?!\d)/;

function validNanp(digits: string): boolean {
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  return d.length === 10 && d[0] >= '2' && d[3] >= '2';
}

/** Under a to/from/number key, which also hold timestamps and counts. */
function validWeak(digits: string, plus: boolean): boolean {
  if (plus) return digits.length >= 7;
  if (digits[0] === '0') return digits.length === 10 || digits.length === 11;
  return validNanp(digits);
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

/** How many groups from i form a number laid out like a phone number (0 if none). */
function shapedNumber(run: string, groups: Group[], i: number): number {
  const rest = run.slice(groupStart(run, groups, i));
  const m =
    rest.match(NANP_PAREN) ?? rest.match(NANP_SEP) ?? rest.match(NATIONAL) ?? rest.match(NANP_CC);
  if (!m) return 0;
  const digits = m[0].replace(/\D/g, '');
  if (m[0].startsWith('0') && digits.length !== 10 && digits.length !== 11) return 0;
  if (m[0].startsWith('1') && !NANP_SEP.test(rest) && !validNanp(digits)) return 0;
  return m[0].match(GROUP)?.length ?? 0;
}

function digitsOf(groups: Group[], i: number, count: number): string {
  let d = '';
  for (let j = i; j < i + count; j++) d += groups[j].digits;
  return d;
}

/** How many groups at the start of the run are a number, given what precedes it. */
function leadingNumber(text: string, run: string, offset: number, groups: Group[]): number {
  const plus = run[0] === '+' || run[0] === '%';
  const before = text.slice(Math.max(0, offset - 40), offset);
  const ctx = CONTEXT_END.test(before);
  const strong = ctx && STRONG_CONTEXT.test(before);
  const weak = !strong && ctx && WEAK_CONTEXT.test(before);
  if (plus || strong || weak) {
    const count = takeNumber(run, groups, 0);
    const digits = digitsOf(groups, 0, count);
    const ok =
      digits.length <= MAX_DIGITS &&
      (weak ? validWeak(digits, plus) : digits.length >= (plus && !strong ? 8 : 7));
    if (ok) return count;
  }
  if (plus || /\w$/.test(before)) return 0;
  return shapedNumber(run, groups, 0);
}

/** Redacts one run of digit groups found at `offset` in `text`. */
function redactRun(text: string, run: string, offset: number): string {
  const groups: Group[] = [];
  for (const g of run.matchAll(GROUP)) {
    groups.push({ start: g.index, end: g.index + g[0].length, digits: g[0] });
  }
  let out = '';
  let cursor = 0;
  let i = 0;
  while (i < groups.length) {
    const count = i === 0 ? leadingNumber(text, run, offset, groups) : shapedNumber(run, groups, i);
    if (count === 0) {
      i++;
      continue;
    }
    const digits = digitsOf(groups, i, count);
    out += `${run.slice(cursor, groupStart(run, groups, i))}***${digits.slice(-KEEP_DIGITS)}`;
    cursor = groups[i + count - 1].end;
    i += count;
  }
  return cursor === 0 ? run : out + run.slice(cursor);
}

/** Masks phone numbers in free text, keeping their last four digits. */
export function redactPhoneNumbers(text: string): string {
  // A phone number has at least 7 digits, so a shorter run can't hold one
  return text.replace(RUN, (run: string, offset: number) =>
    run.length < 7 ? run : redactRun(text, run, offset)
  );
}

function redactionOff(): boolean {
  return process.env['LOG_PHONE_REDACTION'] === 'off';
}

/** A line longer than this with no newline yet is written out, keeping only its end. */
const HOLD_MAX = 512;
const HOLD_TAIL = 64;
const HOLD_MS = 20;
const TRAILING_RUN = /[\d+%().\s-]*$/;

/** Where the part of `text` to hold back for the next write starts. */
function holdFrom(text: string): number {
  if (text.endsWith('\n')) return text.length;
  const lineStart = text.lastIndexOf('\n') + 1;
  if (text.length - lineStart <= HOLD_MAX) return lineStart;
  const run = text.match(TRAILING_RUN)?.[0].length ?? 0;
  return Math.max(lineStart, text.length - run - HOLD_TAIL);
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
  if ((globalThis as Record<symbol, unknown>)[REDACTING] === true) redactWrites(stream);
  return stream;
}

/** The destination a pino logger writes every line to (a multistream, for the SDK's). */
function pinoDestination(logger: unknown): unknown {
  if (typeof logger !== 'object' || logger === null) return undefined;
  const key = Object.getOwnPropertySymbols(logger).find((s) => s.description === 'pino.stream');
  return key ? (logger as Record<symbol, unknown>)[key] : undefined;
}

const SDK_LOGGER = Symbol.for('@livekit/agents:logger');

/** Redacts the SDK logger now and every time initializeLogger replaces it. */
function redactSdkLogger(): void {
  const g = globalThis as Record<symbol, unknown>;
  let current = g[SDK_LOGGER];
  redactWrites(pinoDestination(current));
  Object.defineProperty(g, SDK_LOGGER, {
    configurable: true,
    enumerable: false,
    get: () => current,
    set: (logger: unknown) => {
      current = logger;
      redactWrites(pinoDestination(logger));
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
