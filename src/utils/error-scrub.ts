/**
 * Privacy scrubber for error reports (Sentry beforeSend / beforeBreadcrumb).
 *
 * Ferni hears intimate conversations, so an error report keeps only what
 * debugging needs: the error type, the stack, a scrubbed message, the runtime
 * and host. Everything else is dropped rather than filtered: user, extras,
 * request headers/body/query, unknown contexts and tags, and every breadcrumb
 * but outgoing HTTP calls (method, status, URL without its query).
 *
 * Messages are scrubbed by pattern, so the rules lean toward removing too much:
 * quoted text with spaces, anything after "transcript:"/"said" and similar
 * markers, runs of six or more plain words (prose), phone numbers, emails,
 * tokens, long opaque ids and URL query strings.
 *
 * @module utils/error-scrub
 */

import type { Breadcrumb, Event } from '@sentry/node';

const REDACTED = '[redacted]';
const MAX_STRING = 500;

/** Contexts that describe the host and runtime, never the caller. */
const SAFE_CONTEXTS = new Set([
  'app',
  'cloud_resource',
  'culture',
  'device',
  'log',
  'os',
  'runtime',
  'trace',
]);
/** Tags this codebase sets; values are still scrubbed. */
const SAFE_TAGS = new Set(['level', 'mechanism', 'process', 'source']);

const STRING_RULES: Array<[RegExp, string]> = [
  // Credentials
  [/\b(Bearer|Basic|Token)\s+[\w.~+/=-]+/gi, `$1 ${REDACTED}`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, REDACTED],
  [
    /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|passwd|authorization|auth|cookie|signature|sig)\b(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi,
    `$1$2${REDACTED}`,
  ],
  // URLs keep scheme, host and path; query strings and fragments go
  [/(\bhttps?:\/\/[^\s?#"'<>]+)[?#][^\s"'<>]*/gi, '$1?[redacted]'],
  [/\bsips?:[^\s"'<>]+/gi, `sip:${REDACTED}`],
  [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '[email]'],
  // Long opaque strings with letters and digits: keys, uids, hashes
  [/\b(?=[\w-]*\d)(?=[\w-]*[A-Za-z])[\w-]{24,}\b/g, REDACTED],
  // Quoted text with a space in it is almost always someone's words
  [/"[^"\n]*\s[^"\n]*"/g, `"${REDACTED}"`],
  [/'[^'\n]*\s[^'\n]*'/g, `'${REDACTED}'`],
  [/`[^`\n]*\s[^`\n]*`/g, `\`${REDACTED}\``],
  [/[“‘][^”’\n]*[”’]/g, `“${REDACTED}”`],
  // Whatever follows a marker of spoken or written content
  [
    /\b(transcript|transcription|utterance|text|message|msg|content|prompt|query|input|reply|response|body|speech|caption)([^:=\n]{0,12}[:=]\s*)\S.*$/gim,
    `$1$2${REDACTED}`,
  ],
  [/\b(said|says|asked|told me|wrote|typed)\b\s+\S.*$/gim, `$1 ${REDACTED}`],
];

/**
 * Phone- and card-like runs: 7+ digits of any script, with any dash, slash,
 * underscore or backslash between them too. No upper bound: wider separators
 * can join two numbers into one run, and a report loses nothing it needs.
 */
const PHONE_LIKE =
  /\+?\p{Nd}[\p{Nd}\s()._/\\\-\u2010-\u2015\u2212\uFE58\uFE63\uFF08\uFF09\uFF0D]{5,}\p{Nd}/gu;
/** Six or more plain words in a row reads as prose, not as code. */
const PROSE_RUN = /[A-Za-z][A-Za-z']*(?:[ ,]+[A-Za-z][A-Za-z']*){5,}/g;

/** Removes personal data and secrets from free text. */
export function scrubString(input: string): string {
  let out = input;
  for (const [pattern, replacement] of STRING_RULES) out = out.replace(pattern, replacement);
  out = out.replace(PHONE_LIKE, (match) => {
    const digits = match.replace(/\P{Nd}/gu, '').length;
    return digits >= 7 ? '[number]' : match;
  });
  out = out.replace(PROSE_RUN, '[text]');
  return out.length > MAX_STRING ? `${out.slice(0, MAX_STRING)}…` : out;
}

const SENSITIVE_KEY =
  /authorization|cookie|token|secret|password|key|phone|email|transcript|text|message|content|body|prompt|query|input|reply|response|speech|caller|address/i;

/** Scrubs strings in a plain value and drops fields whose names suggest personal data. */
function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (typeof value !== 'object' || value === null) return value;
  if (depth >= 4) return REDACTED;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrubValue(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) && key !== 'message' ? REDACTED : scrubValue(v, depth + 1);
  }
  return out;
}

function scrubUrl(url: unknown): string | undefined {
  return typeof url === 'string' ? scrubString(url.split(/[?#]/)[0] ?? '') : undefined;
}

/** Keeps outgoing HTTP breadcrumbs (method, status, URL without query); drops all others. */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category !== 'http') return null;
  const data: Record<string, unknown> = crumb.data ?? {};
  return {
    category: 'http',
    type: crumb.type,
    level: crumb.level,
    timestamp: crumb.timestamp,
    data: { method: data['method'], status_code: data['status_code'], url: scrubUrl(data['url']) },
  };
}

type Exception = NonNullable<NonNullable<Event['exception']>['values']>[number];

function scrubException(ex: Exception): void {
  if (ex.value) ex.value = scrubString(ex.value);
  if (ex.mechanism) delete ex.mechanism.data;
  for (const frame of ex.stacktrace?.frames ?? []) {
    delete frame.vars;
    // Source lines are our code, but literals in them can still be numbers or keys.
    if (frame.context_line) frame.context_line = scrubString(frame.context_line);
    frame.pre_context = frame.pre_context?.map(scrubString);
    frame.post_context = frame.post_context?.map(scrubString);
  }
}

/** Keeps the allowed keys of a record, scrubbing each value. */
function keepOnly<T>(record: Record<string, T>, allowed: Set<string>): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [k, v] of Object.entries(record)) {
    if (allowed.has(k) && v !== undefined && v !== null) out[k] = scrubValue(v) as T;
  }
  return out;
}

/** Scrubs an error or transaction event in place and returns it. */
export function scrubEvent<E extends Event>(event: E): E {
  delete event.user;
  delete event.extra;
  if (event.request) {
    event.request = { method: event.request.method, url: scrubUrl(event.request.url) };
  }
  if (event.message) event.message = scrubString(event.message);
  if (event.logentry) event.logentry = { message: scrubString(event.logentry.message ?? '') };
  if (event.transaction) event.transaction = scrubString(event.transaction);
  event.fingerprint = event.fingerprint?.map(scrubString);
  for (const t of event.threads?.values ?? []) delete t.name;
  event.exception?.values?.forEach(scrubException);
  if (event.tags) event.tags = keepOnly(event.tags, SAFE_TAGS);
  if (event.contexts) event.contexts = keepOnly(event.contexts, SAFE_CONTEXTS);
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb).filter((b) => b !== null);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubString(span.description);
    span.data = {};
  }
  return event;
}
