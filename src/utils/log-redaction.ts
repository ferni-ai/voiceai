/**
 * Keeps callers' phone numbers out of the process's log output.
 *
 * A phone caller joins the room as a participant named `sip_+1…`, and that identity
 * reached the agent log in full from our own lines ("Participant ready", "Participant
 * left") and from the LiveKit SDK's (room_io `participantValue`), along with the
 * numbers in job metadata for calls made on someone's behalf. Fixing call sites can't
 * reach the SDK, so this sits under all of them: it rewrites what is written to
 * process.stdout and process.stderr, and what the SDK's logger writes (its pretty
 * printer writes to fd 1 directly, past process.stdout).
 *
 * A log line is full of digit runs that are not phone numbers (epoch ms, durations,
 * dates, IP addresses), so a run found by error-scrub's PHONE_LIKE is masked only when
 * it looks like a phone number: it starts with "+", it is laid out like a North
 * American number (555-123-4567, (555) 123-4567), or it follows sip_, tel: or a
 * phone-like key. The last four digits stay, for debugging.
 *
 * LOG_PHONE_REDACTION=off turns it off.
 *
 * @module utils/log-redaction
 */

import { PHONE_LIKE } from './error-scrub.js';

const NANP_LAYOUT = /^\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}$/;
const PHONE_CONTEXT = /(?:sip[_:]|tel:|(?:phone|caller|callee|recipient|msisdn)\w*["'\s:=]{0,4})$/i;
const KEEP_DIGITS = 4;

/** Masks phone numbers in free text, keeping their last four digits. */
export function redactPhoneNumbers(text: string): string {
  return text.replace(PHONE_LIKE, (match: string, offset: number) => {
    const digits = match.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) return match;
    const looksLikePhone =
      match.startsWith('+') ||
      NANP_LAYOUT.test(match) ||
      PHONE_CONTEXT.test(text.slice(Math.max(0, offset - 24), offset));
    return looksLikePhone ? `***${digits.slice(-KEEP_DIGITS)}` : match;
  });
}

function redactChunk(chunk: unknown): unknown {
  if (typeof chunk === 'string') return redactPhoneNumbers(chunk);
  if (chunk instanceof Uint8Array) {
    const text = Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).toString('utf8');
    const redacted = redactPhoneNumbers(text);
    return redacted === text ? chunk : Buffer.from(redacted, 'utf8');
  }
  return chunk;
}

const REDACTING = Symbol.for('ferni.logPhoneRedaction');
interface Marked {
  write: (chunk: unknown, ...rest: unknown[]) => unknown;
  [REDACTING]?: true;
}

/** Wraps `target.write` so every chunk is redacted first. Idempotent per target. */
export function redactWrites(target: unknown): void {
  const t = target as Marked | null | undefined;
  if (!t || typeof t.write !== 'function' || t[REDACTING] === true) return;
  const { write } = t;
  t.write = function redactedWrite(this: unknown, chunk: unknown, ...rest: unknown[]) {
    return write.call(this, redactChunk(chunk), ...rest);
  };
  t[REDACTING] = true;
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

/** Installs the redaction for this process. Call before anything logs (instrument.ts). */
export function installLogPhoneRedaction(): void {
  if (process.env['LOG_PHONE_REDACTION'] === 'off') return;
  const g = globalThis as Record<symbol, unknown>;
  if (g[REDACTING] === true) return;
  g[REDACTING] = true;
  redactWrites(process.stdout);
  redactWrites(process.stderr);
  redactSdkLogger();
}
