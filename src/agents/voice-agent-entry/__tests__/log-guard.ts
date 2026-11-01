/**
 * The call-log guard's reader (call-log-surface-guard.test.ts): finds every
 * logger call in a source file and says which logged values may carry caller
 * or contact content. It works on shape classes, not names on a list:
 *
 * - any logger: a log-named receiver (log, logger, childLog, this.logger, lg,
 *   this.l), optional-chained or bracket-accessed (`log['info']`), at any
 *   level (fatal included), its `.child()` bindings, diag's channels,
 *   console (log, dir, table, ...), and raw stdout/stderr writes, destructured
 *   or not;
 * - any value: object values and keys, spreads, template interpolations,
 *   tagged templates, arguments written as-is, values nested in objects;
 * - names that carry content into a log: a variable assigned from content
 *   (`const t = event.transcript`, a template built from it) is content too;
 * - error text that bypasses the safe logger's serializer (which redacts
 *   quoted spans in err/error fields, utils/error-class.ts): error text in a
 *   message string, a raw write, console, or any other field.
 *
 * Allowed: lengths, counts, keys, yes/no, kinds, ids, and the helpers that
 * reduce a value to those (SHAPE).
 */
import { readFileSync } from 'node:fs';

const LEVELS = 'info|warn|error|debug|trace|fatal';
const DIAG =
  'user|session|entry|prewarm|stt|tts|tool|state|memory|perf|health|handoff|processing|filler|music';
const CONSOLE = 'log|info|warn|error|debug|trace|dir|table|dirxml';
const LOGGISH = String.raw`[\w$]*(?:log|Log|LOG)[\w$]*|lg|l|logger`;
const RECEIVER = String.raw`(?:this\.)?(?:${LOGGISH})(?:\(\))?(?:\??\.[\w$]+(?:\(\))?)*?`;
/** Every way this codebase (or a planted leak) calls a logger. */
export const CALL = new RegExp(
  [
    String.raw`\b${RECEIVER}\??\.(?:${LEVELS}|log|child)\s*\(`,
    String.raw`\b${RECEIVER}(?:\?\.)?\[\s*['"](?:${LEVELS}|log)['"]\s*\]\s*\(`,
    String.raw`\bdiag\??\.(?:${LEVELS}|${DIAG})\s*\(`,
    String.raw`\bconsole\??\.(?:${CONSOLE})\s*\(`,
    String.raw`\b(?:process\.)?std(?:err|out)\??\.write\s*\(`,
  ].join('|'),
  'g'
);

/** What a logged value may not be: caller or contact content, a slice of text, a whole object of it. */
export const CONTENT = new RegExp(
  [
    String.raw`(?:user|contact|recipient|caller|metadata|profile|expected|confirmed|matched|from|member|participant|preferred)_?names?\b`,
    String.raw`(?:profile|contact|caller|recipient|participant|member|person(?!a)|user)\w*\??\.(?:name|\w*Name)\b`,
    String.raw`\bgeo\??\.(?:name|admin1|country|latitude|longitude)\b`,
    String.raw`\bmetadata\b(?!\??\.)`,
    String.raw`\b(?:purpose|triggerReason|handoffReason|script|notes?|objective|quote|payload|identity|arguments|\w*args|city|cityOnly|location|effectiveLocation|locationName|latitude|longitude|locales?|facts?|phone\w*|text|query|utterance|content|textContent|interests?|prediction|memoryToSurface|connectionReason|originalFact|updatedFact)\b`,
    String.raw`\w*(?:transcript|summary|accent|userText|userInput|userMessage|originalMessage|assessment|topics|email|address)\w*`,
    String.raw`\b\w*[cC]ontext\b(?!\??\.)|\bctx\b(?!\??\.)|\bmacOS\w*`,
    String.raw`\bpref(?:erence)?s?\??\.value\b`,
    String.raw`\benriched(?:Message|Text|Purpose|Content)?\b(?!\??\.(?:metadata|primary|mismatch|confidence))`,
    String.raw`\b(?:region|country)(?:Code)?\b`,
    String.raw`\brequest\??\.reason\b`,
    String.raw`\.(?:slice|substring|substr|join)\(`,
    String.raw`JSON\.stringify\(`,
    String.raw`new \w*Error\(\s*\``,
  ].join('|'),
  'i'
);

/** Error text: safe only in an err/error field of a logger on the safe serializer. */
const ERROR_TEXT =
  /\bString\(\s*(?:e|err|error|ex|exc|\w+Err(?:or)?)\s*\)|\b(?:e|err|error|ex|exc|\w+Err(?:or)?)\??\.(?:message|stack)\b|^(?:e|err|error|ex|exc)$/;

/** A value that says only whether, how many, how long or which kind; or a helper that reduces it so. */
export const SHAPE =
  /^!|^[^'`]*\?\s*'[^']*'\s*:\s*(?:[^'`]*\?\s*'[^']*'\s*:\s*)*'[^']*'$|^Boolean\(|\.length\b|Object\.keys\(|\.size\b|\? '(?:yes|YES)'|^(?:participantKind|errorClass|errorText|jobMetadataLine|toolCallText|identityDiagnosticsText|awarenessKind|maskPhone|redactPhone)\(|^-?\d+(?:\.\d+)?$|^(?:true|false|null|undefined)$|^Date\.now\(\)/;

export interface Exemptions {
  /** Whole calls left as they are, by exact source text: [file suffix, exact argument text]. */
  pending: ReadonlyArray<readonly [string, string]>;
  /** [file suffix, key, exact value]: a value that matches CONTENT but isn't caller content. */
  values: ReadonlyArray<readonly [string, string, string]>;
  /** [file suffix, exact expression]: an object logged whole, or spread, that holds no caller content. */
  whole: ReadonlyArray<readonly [string, string]>;
}

const NONE: Exemptions = { pending: [], values: [], whole: [] };

/** Skip a quoted string or template literal starting at i; returns the index after it. */
function skipQuoted(src: string, i: number): number {
  const q = src[i];
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (q === '`' && src[j] === '$' && src[j + 1] === '{') j = closing(src, j + 1);
    else if (src[j] === q) return j + 1;
  }
  return src.length;
}

/** Past a comment starting at i (`//` or `/*`), else i. */
function skipComment(src: string, i: number): number {
  if (src[i] !== '/') return i;
  if (src[i + 1] === '/') {
    const end = src.indexOf('\n', i);
    return end < 0 ? src.length : end;
  }
  if (src[i + 1] === '*') {
    const end = src.indexOf('*/', i + 2);
    return end < 0 ? src.length : end + 2;
  }
  return i;
}

/** The index of the bracket closing the one at `at`, skipping strings and comments. */
export function closing(src: string, at: number): number {
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    const past = skipComment(src, i);
    if (past !== i) {
      i = past - 1;
      continue;
    }
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      i = skipQuoted(src, i) - 1;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if ((c === ')' || c === '}' || c === ']') && --depth === 0) return i;
  }
  return src.length - 1;
}

/** Split on top-level commas (or another separator), skipping strings and brackets. */
function splitTop(text: string, sep = ','): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const past = skipComment(text, i);
    if (past !== i) i = past - 1;
    else if (c === '"' || c === "'" || c === '`') i = skipQuoted(text, i) - 1;
    else if (c === '(' || c === '{' || c === '[') i = closing(text, i);
    else if (c === sep) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out.filter(Boolean);
}

/** The `${...}` expressions of every template literal in an expression. */
function interpolations(expr: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '"' || c === "'") i = skipQuoted(expr, i) - 1;
    else if (c === '`') {
      for (let j = i + 1; j < expr.length; j++) {
        if (expr[j] === '\\') j++;
        else if (expr[j] === '$' && expr[j + 1] === '{') {
          const end = closing(expr, j + 1);
          const inner = expr.slice(j + 2, end).trim();
          out.push(inner, ...interpolations(inner));
          j = end;
        } else if (expr[j] === '`') {
          i = j;
          break;
        }
      }
    }
  }
  return out;
}

/** The text without its comments (strings kept). */
function stripComments(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const past = skipComment(text, i);
    if (past !== i) {
      i = past - 1;
      continue;
    }
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const end = skipQuoted(text, i);
      out += text.slice(i, end);
      i = end - 1;
    } else out += c;
  }
  return out;
}

export interface Logged {
  key?: string;
  value: string;
  kind: 'field' | 'spread' | 'bare' | 'interpolation';
}

/** Every value a logger call's arguments carry. */
export function logged(args: string): Logged[] {
  const out: Logged[] = [];
  const visit = (expr: string, kind: Logged['kind'], key?: string): void => {
    const e = stripComments(expr).trim();
    if (!e) return;
    if (e.startsWith('{') && closing(e, 0) === e.length - 1) {
      for (const entry of splitTop(e.slice(1, -1))) {
        if (entry.startsWith('...')) {
          out.push({ value: entry.slice(3).trim(), kind: 'spread' });
          continue;
        }
        const colon = splitTop(entry, ':');
        if (colon.length >= 2) {
          const k = colon[0].replace(/^['"]|['"]$/g, '');
          visit(entry.slice(entry.indexOf(colon[1], colon[0].length)), 'field', k);
        } else out.push({ key: entry, value: entry, kind: 'field' });
      }
      return;
    }
    for (const inner of interpolations(e)) out.push({ value: inner, kind: 'interpolation', key });
    if (/^(['"])[\s\S]*\1$/.test(e) || /^`[\s\S]*`$/.test(e)) return; // a string; its interpolations are above
    out.push({ key, value: e, kind });
  };
  for (const arg of splitTop(args.slice(1, -1))) visit(arg, 'bare');
  return out;
}

/**
 * Names assigned from content in this file, to a fixed point: a member chain
 * of it (`const t = event.transcript`), a slice or case of it, a template
 * built from it, or `a || b` of those. A call's result (`createAgent(ctx)`)
 * is not assumed to carry its arguments.
 */
function taintedNames(src: string): RegExp | null {
  const decls: Array<[string, string]> = [];
  for (const m of src.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*([^;\n]+)/g
  )) {
    decls.push([m[1], m[2].trim()]);
  }
  const VALUE =
    /^[\w$.?]+(?:\.(?:slice|substring|substr|trim|toLowerCase|toUpperCase|replace)\([^)]*\))*$/;
  const tainted = new Set<string>();
  for (let changed = true; changed;) {
    changed = false;
    const re = tainted.size ? new RegExp(`\\b(?:${[...tainted].join('|')})\\b`) : null;
    const carries = (part: string): boolean => {
      const p = part.trim();
      if (SHAPE.test(p)) return false;
      if (p.startsWith('`')) return interpolations(p).some(carries);
      return VALUE.test(p) && (CONTENT.test(p) || !!re?.test(p));
    };
    for (const [name, expr] of decls) {
      if (tainted.has(name) || !splitTop(expr, '|').some(carries)) continue;
      tainted.add(name);
      changed = true;
    }
  }
  return tainted.size
    ? new RegExp(`(?<![\\w$.])(?:${[...tainted].join('|')})\\b(?!\\??\\.length)`)
    : null;
}

/** Loggers this file takes from LiveKit (`import { log } from '@livekit/agents'`): not on the safe serializer. */
function liveKitLoggers(src: string): RegExp | null {
  const names: string[] = [];
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@livekit\/agents'/g)) {
    for (const part of m[1].split(',')) {
      const [name, alias] = part.trim().split(/\s+as\s+/);
      if (name === 'log') names.push(alias ?? name);
    }
  }
  return names.length ? new RegExp(`^(?:${names.join('|')})\\b`) : null;
}

/**
 * Whether the safe logger still cuts err/error fields (error-text.ts wired into
 * processBindings for both keys): the exemption below holds only while it does.
 */
export function serializerWired(src = readFileSync('src/utils/safe-logger.ts', 'utf8')): boolean {
  return (
    /withErrors\.error = redactErrorValue\(withErrors\.error\)/.test(src) &&
    /withErrors\.err = redactErrorValue\(withErrors\.err\)/.test(src)
  );
}
const WIRED = serializerWired();

/** An err/error field of a logger on the safe serializer (safe-logger.ts), which redacts it. */
function onSafeSerializer(
  call: string,
  key: string | undefined,
  liveKit: RegExp | null,
  wired: boolean
): boolean {
  if (!wired || !key || !/^(?:err|error)$/i.test(key)) return false;
  return !/^(?:console|process|std)/.test(call) && !liveKit?.test(call);
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

export interface Offence {
  line: number;
  key: string;
  value: string;
  why: string;
}

/** Every logged value in `src` that may carry caller or contact content, as `path:line: value`. */
export function offences(
  path: string,
  src = readFileSync(path, 'utf8'),
  ex: Exemptions = NONE,
  wired = WIRED
): string[] {
  return offenceItems(path, src, ex, wired).map((o) => `${path}:${o.line}: ${o.why.slice(0, 90)}`);
}

/** The same, with each value whole (for writing an exemption). */
export function offenceItems(
  path: string,
  src = readFileSync(path, 'utf8'),
  ex: Exemptions = NONE,
  wired = WIRED
): Offence[] {
  const found: Offence[] = [];
  const tainted = taintedNames(src);
  const liveKit = liveKitLoggers(src);
  const exempt = <T extends readonly string[]>(
    list: ReadonlyArray<T>,
    match: (row: T) => boolean
  ) => list.some((row) => path.endsWith(row[0]) && match(row));
  for (const m of src.matchAll(CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const args = src.slice(open, closing(src, open) + 1);
    if (exempt(ex.pending, (row) => norm(row[1]) === norm(args))) continue;
    const line = src.slice(0, m.index).split('\n').length;
    for (const { key, value, kind } of logged(args)) {
      const report = (why: string) => found.push({ line, key: key ?? '', value, why });
      if (exempt(ex.values, (row) => row[1] === (key ?? '') && norm(row[2]) === norm(value)))
        continue;
      if (ERROR_TEXT.test(value)) {
        if (!(kind === 'field' && onSafeSerializer(m[0], key, liveKit, wired)))
          report(`error text outside err/error: ${value}`);
        continue;
      }
      if (kind === 'spread' || kind === 'bare') {
        if (SHAPE.test(value) || exempt(ex.whole, (row) => norm(row[1]) === norm(value))) continue;
        if (kind === 'bare' && /^['"`]/.test(value)) continue;
        report(`${kind === 'spread' ? 'spread' : 'written as-is'}: ${value}`);
        continue;
      }
      if (SHAPE.test(value)) continue;
      if (
        CONTENT.test(value) ||
        tainted?.test(value) ||
        (key !== undefined && key !== value && CONTENT.test(key))
      ) {
        report(key && key !== value ? `${key}: ${value}` : value);
      }
    }
  }
  return found;
}
