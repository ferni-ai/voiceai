/**
 * Values that must never appear in a log line, such as a consented clone's voice id
 * (personas/roster). A higher layer registers where the values come from; the app logger
 * (safe-logger.ts) replaces every occurrence in each line it writes, in any field at any
 * depth, in child bindings and in the message, so no call site has to remember to.
 *
 * Sources are read again at most once a second (reading the environment on every line
 * cost about as much as the line itself), so a setting changed at runtime is honoured
 * within a second; the pattern is rebuilt only when the values change.
 *
 * A value matches in any case wherever no letter or digit touches it: " FAKE-SETH-ID ",
 * "preview-fake-seth-id.mp3" and "voice_fake-seth-id" are caught (a file name or key built
 * from the id is still the id), "xfake-seth-idx" is not. Over-masking is the safe side. Blank
 * values are never registered, so an empty setting can't redact everything.
 *
 * @module utils/redacted-log-values
 */

/** What a redacted value is written as. */
const REDACTED_LOG_VALUE = '[consented-clone]';

type Source = () => readonly string[];

/** How long the values read from the sources are reused. */
const REREAD_MS = 1000;

const sources = new Set<Source>();
let cachedKey = '';
let cachedPattern: RegExp | null = null;
let cachedLongest = 0;
let readAt = -Infinity;

/** Registers a source of values to redact from every log line. Registering it again is a no-op. */
export function registerRedactedLogValues(source: Source): void {
  sources.add(source);
  readAt = -Infinity;
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The pattern for the values registered now, or null when there are none. */
function currentPattern(): RegExp | null {
  const now = Date.now();
  if (now - readAt < REREAD_MS) return cachedPattern;
  readAt = now;
  const values: string[] = [];
  for (const source of sources) {
    for (const raw of source()) {
      const value = raw.trim();
      if (value) values.push(value);
    }
  }
  const key = values.join('\n');
  if (key === cachedKey) return cachedPattern;
  cachedKey = key;
  cachedLongest = Math.max(0, ...values.map((v) => v.length));
  cachedPattern =
    values.length === 0
      ? null
      : new RegExp(
          `(?<![A-Za-z0-9])(?:${values.map(escapeRegExp).join('|')})(?![A-Za-z0-9])`,
          'gi'
        );
  return cachedPattern;
}

/** `line` with every registered value replaced by REDACTED_LOG_VALUE. */
export function redactLogValues(line: string): string {
  if (sources.size === 0) return line;
  const pattern = currentPattern();
  return pattern ? line.replace(pattern, REDACTED_LOG_VALUE) : line;
}

/**
 * `cut`, or the nearest point before it, where `text` can be split without splitting a
 * registered value: not inside one, and far enough from the end that one still being
 * written (the text ends partway through it) is on the later side whole. Each side is
 * redacted on its own (log-hold-back.ts), and half a value matches nothing.
 */
export function cutOutsideLogValues(text: string, cut: number): number {
  if (sources.size === 0) return cut;
  const pattern = currentPattern();
  if (!pattern) return cut;
  let safe = Math.max(0, Math.min(cut, text.length - cachedLongest + 1));
  for (;;) {
    const from = Math.max(0, safe - cachedLongest);
    let across: number | undefined;
    for (const m of text.slice(from, safe + cachedLongest).matchAll(pattern)) {
      const start = from + m.index;
      if (start < safe && safe < start + m[0].length) across = start;
    }
    if (across === undefined) return safe;
    safe = across;
  }
}
