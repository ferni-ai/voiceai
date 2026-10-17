/**
 * Masks phone numbers in a log call's object before pino serialises it, where the keys
 * still say what a value is. log-redaction.ts installs it on our pino sink and on the
 * LiveKit SDK's logger, and runs a text pass over the written line as a backstop.
 *
 * A value is masked when it sits under a phone key at any depth: in the key's own
 * string or number, in every element of its arrays (nested ones too), and in every
 * value of objects inside it (Google's {"phoneNumbers":[{"value":"…"}]}). A phone key,
 * compared without case or punctuation, ends in phone, mobile, msisdn, e164, digits,
 * caller, callee, recipient, destination, called, forwardedFrom, calledFrom, callTo,
 * callFrom, whatsapp or telephone (optionally plural, or followed by number, num, no,
 * id or value), is dest, tel or cell, or ends in number(s) after something else
 * (fromNumber, toNumbers). callerLatencyMs is not one. Some *Number keys that hold ids
 * are masked too (orderNumber: 12345678); that over-masking is the safe side.
 * to, from, number and num are weak keys: their values are masked only when they are
 * a valid phone number (see validWeak), so epoch seconds under "from" stay.
 *
 * Under a phone key, every run of 7 or more digits in a string is masked (a csv of
 * numbers, "+1 (415) 555-0123", "sip:+1…@host"), and an integer of 7 to 15 digits
 * becomes a masked string. A string outside any phone key that holds JSON (job
 * metadata) is parsed, walked and re-serialised if anything in it changed.
 *
 * The walk is one pass over the object: depth-capped (cycles end there), node-capped,
 * copy-on-write (the caller's object is never changed), and it only descends into
 * plain objects and arrays, so an Error still reaches pino's serializer as an Error.
 * What it does not reach is left to the text pass.
 *
 * @module utils/log-object-redaction
 */

const KEEP_DIGITS = 4;
const MAX_DEPTH = 10;
const MAX_NODES = 100_000;
const MAX_JSON_STRING = 65_536;
const MAX_KEY = 80;

/** How strongly a key marks its value as a phone number: none, weak (to/from) or strong. */
export type PhoneContext = 0 | 1 | 2;
export const NO_CONTEXT = 0;
export const WEAK = 1;
export const STRONG = 2;

const STRONG_KEY =
  /(?:phone|mobile|msisdn|e164|digits|caller|callee|recipient|destination|called|forwardedfrom|calledfrom|callto|callfrom|whatsapp|telephone)(?:s|numbers?|nums?|nos?|ids?|values?)?$|^(?:dest|tel|cell)$|.numbers?$/;
const WEAK_KEY = /^(?:to|from|number|num)$/;

export function keyContext(key: string): PhoneContext {
  if (key.length > MAX_KEY) return NO_CONTEXT;
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (WEAK_KEY.test(k)) return WEAK;
  return STRONG_KEY.test(k) ? STRONG : NO_CONTEXT;
}

function validNanp(digits: string): boolean {
  const d = digits.length === 11 && digits[0] === '1' ? digits.slice(1) : digits;
  return d.length === 10 && d[0] >= '2' && d[3] >= '2';
}

/** Whether digits under a weak key (to/from/number, which also hold timestamps) are a phone number. */
export function validWeak(digits: string, plus: boolean): boolean {
  if (plus) return digits.length >= 7 && digits.length <= 15;
  if (digits[0] === '0') return digits.length === 10 || digits.length === 11;
  return validNanp(digits);
}

export function maskDigits(digits: string): string {
  return `***${digits.slice(-KEEP_DIGITS)}`;
}

/** Digit runs in a value under a phone key: digits joined by single separators. */
const VALUE_RUN = /(?:\+|%2[Bb])?\(?\d(?:[\d().-]| (?=[\d(]))*/g;

/** Masks the phone numbers in a string that sits under a phone key. */
export function maskPhoneValue(value: string, ctx: PhoneContext): string {
  return value.replace(VALUE_RUN, (run) => {
    const plus = run[0] === '+' || run[0] === '%';
    // %2B is a URL-encoded "+": its 2 isn't a digit of the number
    const d = (run[0] === '%' ? run.slice(3) : run).replace(/\D/g, '');
    if (d.length < 7) return run;
    if (ctx === WEAK && !validWeak(d, plus)) return run;
    return maskDigits(d);
  });
}

interface Walk {
  nodes: number;
}

function walkString(value: string, ctx: PhoneContext, depth: number, w: Walk): string {
  if (ctx !== NO_CONTEXT) return maskPhoneValue(value, ctx);
  const first = value[0];
  if ((first !== '{' && first !== '[') || value.length > MAX_JSON_STRING) return value;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return value; // not JSON; the text pass still sees it
  }
  const walked = walk(parsed, NO_CONTEXT, depth + 1, w);
  return walked === parsed ? value : JSON.stringify(walked);
}

function walkNumber(value: number, ctx: PhoneContext): number | string {
  if (ctx === NO_CONTEXT || !Number.isSafeInteger(value) || value < 0) return value;
  const digits = String(value);
  if (digits.length < 7 || digits.length > 15) return value;
  if (ctx === WEAK && !validWeak(digits, false)) return value;
  return maskDigits(digits);
}

function walkArray(value: unknown[], ctx: PhoneContext, depth: number, w: Walk): unknown[] {
  let out: unknown[] | undefined;
  for (let i = 0; i < value.length; i++) {
    const v = walk(value[i], ctx, depth + 1, w);
    if (v !== value[i]) {
      out ??= value.slice();
      out[i] = v;
    }
  }
  return out ?? value;
}

function walkObject(
  value: Record<string, unknown>,
  ctx: PhoneContext,
  depth: number,
  w: Walk
): Record<string, unknown> {
  let out: Record<string, unknown> | undefined;
  for (const key of Object.keys(value)) {
    const own = keyContext(key);
    const v = walk(value[key], own > ctx ? own : ctx, depth + 1, w);
    if (v !== value[key]) {
      out ??= { ...value };
      out[key] = v;
    }
  }
  return out ?? value;
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function walk(value: unknown, ctx: PhoneContext, depth: number, w: Walk): unknown {
  if (++w.nodes > MAX_NODES || depth > MAX_DEPTH) return value;
  if (typeof value === 'string') return walkString(value, ctx, depth, w);
  if (typeof value === 'number') return walkNumber(value, ctx);
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return walkArray(value, ctx, depth, w);
  return isPlainObject(value) ? walkObject(value, ctx, depth, w) : value;
}

/** A copy of a log object with phone numbers under phone keys masked (the same object if none). */
export function redactLogObject<T>(value: T): T {
  return walk(value, NO_CONTEXT, 0, { nodes: 0 }) as T;
}
