/**
 * An error as a log may carry it without the input it choked on. A JSON parse
 * error quotes its input; code that throws on caller text often quotes it too.
 * No quote pairing (unbalanced, mixed or multi-line quotes defeat it): a
 * message is cut at its FIRST quote character of any kind, and a stack keeps
 * only that cut message and its frames.
 *
 * - errorText: for raw stderr writes and message strings.
 * - redactErrorValue: what the safe logger writes for every err/error field
 *   (safe-logger.ts processBindings and its pino serializers): only name,
 *   message, code, stack and cause, each cut and capped; nothing else an
 *   error object carries.
 *
 * @module utils/error-text
 */
import { errorClass } from './error-class.js';

/** Longest message an error keeps in a log. */
export const ERROR_TEXT_MAX = 120;
/** Most stack frames, and characters, an error keeps in a log. */
export const STACK_FRAMES_MAX = 12;
export const STACK_MAX = 2_000;

const QUOTE = /["'`“”‘’«»]/;
export const REDACTED = '…[redacted]';

/** The text up to its first quote character, capped; the rest never logged. */
export function cutAtQuote(text: string, max = ERROR_TEXT_MAX): string {
  const at = text.search(QUOTE);
  const kept = at < 0 ? text : `${text.slice(0, at)}${REDACTED}`;
  return kept.length > max ? `${kept.slice(0, max)}…` : kept;
}

/** An error's class and cut message: never the input it choked on. */
export function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${errorClass(error)}: ${cutAtQuote(message)}`;
}

/** A stack as its cut first line and its frames (`at ...`), each frame cut too. */
function cutStack(stack: string, name: string, message: string): string {
  const frames = stack
    .split('\n')
    .filter((l) => /^\s+at\s/.test(l))
    .slice(0, STACK_FRAMES_MAX)
    .map((l) => cutAtQuote(l, 300));
  return [`${name}: ${message}`, ...frames].join('\n').slice(0, STACK_MAX);
}

/** An err/error log field: its name, cut message, code, frames and cause; nothing else. */
export function redactErrorValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return cutAtQuote(value);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const name = typeof source.name === 'string' ? source.name : errorClass(value);
  const message = cutAtQuote(typeof source.message === 'string' ? source.message : '');
  const out: Record<string, unknown> = { name, message };
  if (typeof source.code === 'string' || typeof source.code === 'number') {
    out.code = typeof source.code === 'string' ? cutAtQuote(source.code, 60) : source.code;
  }
  if (typeof source.stack === 'string') out.stack = cutStack(source.stack, name, message);
  if (source.cause !== undefined && depth < 3)
    out.cause = redactErrorValue(source.cause, depth + 1);
  return out;
}
