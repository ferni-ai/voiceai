/**
 * Which logger calls carry conversation text or memory-record content: the shapes the
 * log-text ratchet (log-text-ratchet.test.ts) fails on. Split out so the ratchet's
 * lists stay readable and the shapes can be read without vitest.
 *
 * #2689 caught a slice of a named text (`text.slice(0, 40)`) and a content key logged
 * whole (`{ transcript }`). #3215 found what that missed, all of it in use:
 * - memory records built from the conversation: a commitment's description, a goal's
 *   title, an action, a topic, an entity's name; sliced, logged whole under any key,
 *   mapped into a list (`entities.map((e) => e.name)`), or a `{ name }` bound from one;
 * - a slice behind a call or a fallback: `(text || '').slice(...)`, `text.trim().slice(...)`;
 * - a text value under a key that doesn't say so (`{ preview: userText }`) or
 *   interpolated into a message (`${userText}`).
 * Lengths, counts, ids and yes/no stay allowed (log-guard's SHAPE).
 */
import {
  CALL,
  closing,
  type Logged,
  logged,
  SHAPE,
} from '../../agents/voice-agent-entry/__tests__/log-guard.js';

/** Names that hold what someone said, what Ferni says back, or a record made of it. */
export const TEXT_NAME =
  /content|text|transcript|utterance|message|reply|response|said|speech|spoken|greeting|goodbye|opener|query|question|answer|summary|phrase|chunk|thought|input|advice|normalized|trimmed|cleaned|starter|reflection|observation|complaint|intention|guidance|statement|banter|callerline|callback|insight|sentence|belief|resolution|memory|lower|description|title|subject|struggle|commitment|goal|topic/i;
/** Words that name text only as a word of their own: not extraction, nobody or items. */
const WORD_NAME = /^actions?$|Actions?$|^actions?[A-Z]|^body$|Body$|^item$/;
/** Names that look like text but hold an id, a key, a URL, a kind, a count or an error. */
export const NOT_WORDS =
  /^(?:err|error)|(?:Id|Ids|Url|Key|Hash|Token|Type|Kind|Count|Ms|Len|Length)$/;
/** A key or name that holds the words themselves. */
export const WHOLE_KEY =
  /^(?:text|content|utterance|transcript|speech|starter|reflection)$|(?:Text|Content|Utterance|Transcript|Speech|Starter|Reflection|UserMessage|CallerMessage)$/;

/** A field of a memory record that is the record's words, whatever holds it. */
const RECORD_TEXT = /^(?:description|summary|struggle|utterance|transcript|topic|topics)$/;
/** A field that is the record's words when it belongs to a memory record. */
const RECORD_FIELD =
  /^(?:title|name|names|canonicalName|fullName|firstName|lastName|nickname|action|content|text|note|notes|fact|facts|detail|details|story|quote)$/;
/** What a memory record built from the conversation is called (not a persona or an identity). */
const RECORD =
  /commitment|goal|(?<!id)entit|person(?!a)|people|contact|relationship|milestone|struggle|promise|follow-?up|insight|memor|fact|thread|moment|story|habit|intention|cross-?persona/i;

/** Methods a slice's receiver may pass through; their names say nothing about the value. */
const METHOD =
  /^(?:trim|trimStart|trimEnd|toLowerCase|toUpperCase|toLocaleLowerCase|toString|replace|replaceAll|normalize|String|join|split|map|filter|flat|at)$/;

const isText = (name: string): boolean =>
  (TEXT_NAME.test(name) || WORD_NAME.test(name)) && !NOT_WORDS.test(name);

/** The index just before the bracket group that closes at `i` (`(...)` or `[...]`). */
function beforeGroup(src: string, i: number): number {
  const shut = src.charAt(i);
  const open = shut === ')' ? '(' : '[';
  let depth = 0;
  for (; i >= 0; i--) {
    if (src.charAt(i) === shut) depth++;
    else if (src.charAt(i) === open && --depth === 0) break;
  }
  return i - 1;
}

/** The receiver of the `.slice(` (or substring/substr) whose dot is at `dot`: `(a || b).trim()`. */
function receiverBefore(src: string, dot: number): string {
  let i = dot - 1;
  for (;;) {
    while (i >= 0 && /\s/.test(src.charAt(i))) i--;
    if (src.charAt(i) === '?') i--; // optional chaining: `a?.slice`
    if (src.charAt(i) === ')' || src.charAt(i) === ']') {
      i = beforeGroup(src, i);
      continue;
    }
    if (!/[\w$]/.test(src.charAt(i))) break;
    while (i >= 0 && /[\w$]/.test(src.charAt(i))) i--;
    if (src.charAt(i) === '.') i--;
    else if (src.charAt(i) === '?' && src.charAt(i + 1) === '.') i -= 1;
    else break;
  }
  return src.slice(i + 1, dot);
}

const SLICE_AT = /\??\.(?:slice|substring|substr)\(/g;
const CHAIN = /[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*/g;

/**
 * A slice of text, through any call chain or `(a || '')` fallback: the value each
 * member chain in the receiver ends on is what gets sliced, so `input.userId` is an
 * id and `extraction.topics` is topics.
 */
export function slicedText(call: string): string | null {
  for (const m of call.matchAll(SLICE_AT)) {
    const at = m.index ?? 0;
    const receiver = receiverBefore(call, at);
    const bare = receiver.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '');
    for (const chain of bare.match(CHAIN) ?? []) {
      const names = chain.split(/\??\./).filter((n) => !METHOD.test(n));
      const last = names[names.length - 1];
      if (last && isText(last)) return `${receiver.trim()}${m[0]}`;
    }
  }
  return null;
}

const isRecordWords = (owner: string, field: string): boolean =>
  RECORD_TEXT.test(field) || (RECORD_FIELD.test(field) && RECORD.test(owner));

/** The record's words in `expr`: `goal.title`, `c.description`, `entities.map((e) => e.name)`. */
export function recordText(expr: string): boolean {
  for (const part of expr.split(/\?\?|\|\|/)) {
    const p = part.trim();
    const mapped = /([\w$.?]+)\.map\(\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\2\??\.([\w$]+)\s*\)/.exec(p);
    if (mapped) {
      const [, list = '', , field = ''] = mapped;
      if (isRecordWords(list, field)) return true;
    }
    const member = /^([\w$]+(?:\??\.[\w$]+)*)\??\.([\w$]+)$/.exec(p);
    if (member) {
      const [, owner = '', field = ''] = member;
      if (isRecordWords(owner, field)) return true;
    }
  }
  return false;
}

/** How a logged value reads in a report: `key: value`, or `${value}` when interpolated. */
function shown(v: Logged): string {
  const value = v.value.trim();
  if (v.kind === 'interpolation') return `\${${value}}`;
  return v.key ? `${v.key}: ${value}` : value;
}

/** Whether one logged value is text: under a content key, a text name, or a record's words. */
function isTextValue(v: Logged): boolean {
  const value = v.value.trim();
  if (SHAPE.test(value) || v.kind === 'spread' || (v.key && /^err/i.test(v.key))) return false;
  if (v.kind !== 'bare' && v.key && WHOLE_KEY.test(v.key)) return true;
  const last = /([\w$]+)$/.exec(value)?.[1] ?? '';
  // `{ preview: userText }`, `${userText}`: a plain name or member, not a call's result
  if (/^[\w$.?]+$/.test(value) && WHOLE_KEY.test(last)) return true;
  return recordText(value);
}

/** A text value logged whole: under a content key, under any key, or interpolated. */
export function wholeText(call: string): string | null {
  const v = logged(call).find(isTextValue);
  return v ? shown(v) : null;
}

export interface Leak {
  /** 1-based line of the logger call. */
  line: number;
  /** What the call logs, as written: `title: goal.title`, `c.description.slice(`. A stable key. */
  what: string;
}

/** Where a name was last bound before a call: `const name = x`, `{ name } = x`, `{ name } of x`. */
const NAME_BINDING =
  /\{[^{}]*\bnames?\b[^{}]*\}\s*(?:=(?!=)|\bof\b)\s*([^;\n]+)|(?<![\w$.])names?\s*=(?!=)\s*([^;\n]+)/g;
/** What a person's name is pulled from when it isn't a record: names found in the turn. */
const FROM_TURN = /extracted|mention/i;

/**
 * A bare `{ name }` (or `{ names }`) whose last binding before the call is a person or
 * entity record, or names extracted from the turn:
 * `for (const { name } of turn.extractedNames) { log.warn({ name }) }`.
 */
function boundRecordName(source: string, open: number, call: string): string | null {
  // a shorthand `{ name }` is a field whose key is its value
  const bare = logged(call).find(
    (v) => v.kind === 'field' && v.key === v.value && /^names?$/.test(v.key)
  );
  if (!bare) return null;
  const bindings = [...source.slice(0, open).matchAll(NAME_BINDING)];
  const last = bindings[bindings.length - 1];
  const from = last?.[1] ?? last?.[2] ?? '';
  return RECORD.test(from) || FROM_TURN.test(from) ? bare.value : null;
}

/** The logger calls in `source` that carry conversation text or a memory record's words. */
export function textLeaksInLogs(source: string): Leak[] {
  const leaks: Leak[] = [];
  for (const m of source.matchAll(CALL)) {
    const open = (m.index ?? 0) + m[0].length - 1;
    const call = source.slice(open, closing(source, open) + 1);
    const what = slicedText(call) ?? wholeText(call) ?? boundRecordName(source, open, call);
    if (what) leaks.push({ line: source.slice(0, open).split('\n').length, what: squash(what) });
  }
  return leaks;
}

const squash = (s: string): string => s.replace(/\s+/g, ' ');
