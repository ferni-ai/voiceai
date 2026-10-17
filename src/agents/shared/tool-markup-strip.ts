/**
 * Tool-call markup is never spoken. With native function calling the model still
 * sometimes writes a call as text (prod 2026-10-17: Gemini wrote
 * `<template-call:default_api:softTeamIntro{ context: … }</template-call:…>` and the
 * caller heard it). This removes, whole or split across stream chunks, tags
 * (`<template-call:…>`, `<tool_call>`), `default_api.x(…)` / `print(…)` calls, JSON
 * `{"fn": …}` calls, `name{ key: value }` / `name(key="v")` calls, ```tool_code```
 * fences and a "Stafford 3000:" label opening a reply, and keeps the words around
 * them. Text that could still become a call is held until it resolves (HOLD_CAP).
 * Each strip logs TOOL_MARKUP_STRIPPED with the tool name, never the words.
 * Applied to every reply in PersonaVoiceAgent.llmNode (speech, captions and the
 * saved turn) and again in the TTS wrapper.
 *
 * @module agents/shared/tool-markup-strip
 */

import { ReadableStream, TransformStream } from 'node:stream/web';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ToolMarkup' });

export type CallForm = 'tag' | 'fence' | 'json' | 'api' | 'call' | 'label';
export interface StrippedCall {
  readonly tool: string;
  readonly form: CallForm;
}

type Parse =
  | { kind: 'call'; end: number; tool: string; form: CallForm }
  | { kind: 'text' }
  | { kind: 'pending' };
const TEXT: Parse = { kind: 'text' };
const PENDING: Parse = { kind: 'pending' };

/** Held text longer than this is resolved as if the reply had ended. */
const HOLD_CAP = 1200;

/** `<template-call:…`, `<tool_call>`, `<function-call>`, `<tool_code>`, `<fn_call>`, either separator. */
const TAG_OPENERS = ['template', 'tool', 'function', 'fn']
  .flatMap((w) => [`<${w}-call`, `<${w}_call`, `<${w}call`])
  .concat(['<tool_code', '<tool-code']);
const TAG_CLOSE =
  /<\/\s*(?:template[-_]?call|tool[-_]?calls?|function[-_]?calls?|tool[-_]?code|fn[-_]?call)[^>]*>/i;
/** Where a call could begin. */
const CANDIDATE =
  /<|`|\{|\bprint\s*\(|\bdefault_api\b|\b(?:(?:functions|tools?|api)[.:])?[A-Za-z_]\w*\s?[({]/g;
/** `print(` `default_api.` `name` then the bracket that opens the arguments. */
const CALL_HEAD =
  /^(print\s*\(\s*)?(default_api\s*[.:]\s*)?((?:(?:functions|tools?|api)[.:])?[A-Za-z_]\w*)?(\s?)([({])/;
/** A head still being written: `default_ap`, `print(default_api.soft`. */
const HEAD_SO_FAR = /^(?:print\s*\(?\s*)?(?:default_api\s*[.:]?\s*)?[\w.:]*\s?$/;
/**
 * A label opening a reply, "Stafford 3000: I can do that" (prod 2026-10-16, right
 * after a tool call; in no tool output, prompt or code). Never speech; only at the start.
 */
const LEAD_LABEL = /^\s*[A-Z][a-z]{3,} \d{3,}:[ \t]*/;
const LEAD_LABEL_SO_FAR = /^\s*(?:[A-Z][A-Za-z]*(?: \d*)?)?$/;

/** camelCase, snake_case or namespaced: a function name, not a word. */
const CODE_IDENT = /[a-z][A-Z]|_|[.:]/;

function call(end: number, tool: string, form: CallForm): Parse {
  return { kind: 'call', end, tool, form };
}

/** The tool a call body names: `{"fn": "playMusic"`, `default_api.softTeamIntro(`. */
function nameIn(text: string): string | undefined {
  const named = /"(?:fn|name|tool|tool_name|function)"\s*:\s*"([\w.:-]+)"/.exec(text);
  return named?.[1] ?? /default_api\s*[.:]\s*([A-Za-z_]\w*)/.exec(text)?.[1];
}

/** Index just past the bracket that closes the one at `open`, or -1. */
function balancedEnd(s: string, open: number): number {
  let depth = 0;
  let inString = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '(' || c === '[') depth++;
    else if (c === '}' || c === ')' || c === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function parseTag(rest: string, final: boolean): Parse {
  const lower = rest.toLowerCase();
  const opener = TAG_OPENERS.find((o) => lower.startsWith(o));
  if (!opener) return !final && TAG_OPENERS.some((o) => o.startsWith(lower)) ? PENDING : TEXT;
  const body = rest.slice(opener.length);
  const tool = nameIn(body) ?? /^[:\s>]*([A-Za-z_]\w*)/.exec(body)?.[1] ?? 'unknown';
  const close = TAG_CLOSE.exec(body);
  if (close) return call(opener.length + close.index + close[0].length, tool, 'tag');
  if (!final) return PENDING;
  // Never closed: drop through its arguments, or everything if those never closed either.
  const open = rest.search(/[{(]/);
  const end = open >= 0 ? balancedEnd(rest, open) : -1;
  return call(end >= 0 ? end : rest.length, tool, 'tag');
}

function parseFence(rest: string, final: boolean): Parse {
  if (!rest.startsWith('```')) return !final && /^`{1,2}$/.test(rest) ? PENDING : TEXT;
  const lang = /^```[ \t]*([\w-]*)/.exec(rest)?.[1] ?? '';
  const tool = nameIn(rest) ?? (lang || 'code');
  const close = rest.indexOf('```', 3);
  if (close >= 0) return call(close + 3, tool, 'fence');
  return final ? call(rest.length, tool, 'fence') : PENDING;
}

function parseBracketCall(rest: string, final: boolean): Parse {
  if (!final && HEAD_SO_FAR.test(rest)) return PENDING;
  const m = CALL_HEAD.exec(rest);
  if (!m) return TEXT;
  const [head, print, api, ident = '', space, bracket] = m;
  const open = head.length - 1;
  const inner = rest.slice(open + 1);
  const isApi = Boolean(print || api) || ident.startsWith('default_api');
  const short = !final && inner.length < 40;
  if (bracket === '(') {
    if (space || !ident || !(isApi || CODE_IDENT.test(ident))) return TEXT;
    const args = /^\s*(?:\)|[A-Za-z_]\w*\s*[=:]|["'{[])/.test(inner);
    if (!args && !isApi) return short && /^\s*\w*$/.test(inner) ? PENDING : TEXT;
  } else {
    const keys = /^\s*(?:"[^"]*"|'[^']*'|[A-Za-z_][\w ]*?)\s*:|^\s*\}/.test(inner);
    if (!keys && !isApi) return short && /^\s*(?:["']?[\w ]*["']?)?$/.test(inner) ? PENDING : TEXT;
  }
  const tool =
    nameIn(inner) ??
    (ident
      .replace(/^default_api[.:]/, '')
      .split(/[.:]/)
      .pop() ||
      (bracket === '{' ? 'json' : 'call'));
  const form: CallForm = isApi ? 'api' : bracket === '{' && !ident ? 'json' : 'call';
  let end = balancedEnd(rest, open);
  if (end < 0) return final ? call(rest.length, tool, form) : PENDING;
  if (print) {
    const close = /^\s*\)/.exec(rest.slice(end));
    if (close) end += close[0].length;
    else if (!final && !rest.slice(end).trim()) return PENDING; // print( still open
  }
  return call(end, tool, form);
}

function parseAt(s: string, i: number, final: boolean): Parse {
  const rest = s.slice(i);
  if (rest[0] === '<') return parseTag(rest, final);
  if (rest[0] === '`') return parseFence(rest, final);
  return parseBracketCall(rest, final);
}

/**
 * Removes tool-call markup from text that arrives in pieces. push() returns
 * what is safe to say now; flush() returns the rest when the reply ends.
 */
export class ToolMarkupStripper {
  private buf = '';
  private said = '';
  private gap = false; // a call was just removed: join the words on either side
  private started = false; // past the point where a leading label could be
  readonly stripped: StrippedCall[] = [];

  constructor(private readonly onStrip?: (call: StrippedCall) => void) {}

  push(text: string): string {
    this.buf += text;
    return this.drain(false);
  }

  flush(): string {
    return this.drain(true);
  }

  private drain(final: boolean): string {
    if (!this.started) {
      const label = LEAD_LABEL.exec(this.buf);
      if (!label && !final && LEAD_LABEL_SO_FAR.test(this.buf)) return '';
      this.started = true;
      if (label) {
        this.buf = this.buf.slice(label[0].length);
        this.gap = true;
        this.strip({ tool: 'label', form: 'label' });
      }
    }
    let out = '';
    const say = (piece: string): void => {
      let text = piece;
      if (this.gap) {
        text = text.trimStart();
        if (!text) return;
        const before = this.said + out;
        if (before && !/\s$/.test(before)) text = ` ${text}`;
        this.gap = false;
      }
      out += text;
    };
    let from = 0;
    for (;;) {
      CANDIDATE.lastIndex = from;
      const m = CANDIDATE.exec(this.buf);
      if (!m) break;
      const i = m.index;
      let r = parseAt(this.buf, i, final);
      if (r.kind === 'pending' && this.buf.length - i > HOLD_CAP) r = parseAt(this.buf, i, true);
      if (r.kind === 'text') {
        from = i + 1;
        continue;
      }
      say(this.buf.slice(0, i));
      if (r.kind === 'pending') {
        this.buf = this.buf.slice(i);
        return this.done(out);
      }
      this.buf = this.buf.slice(i + r.end);
      this.gap = true;
      from = 0;
      this.strip({ tool: r.tool, form: r.form });
    }
    // A trailing word could still become `name{` or `name(`: hold it for the next piece.
    const hold = final ? this.buf.length : this.buf.search(/[A-Za-z_]\w*$/);
    const cut = hold < 0 ? this.buf.length : hold;
    say(this.buf.slice(0, cut));
    this.buf = this.buf.slice(cut);
    return this.done(out);
  }

  private strip(call: StrippedCall): void {
    this.stripped.push(call);
    this.onStrip?.(call);
  }

  private done(out: string): string {
    this.said = (this.said + out).slice(-1);
    return out;
  }
}

/** Remove every tool call written as text from a whole string. */
export function stripToolMarkup(text: string): { text: string; stripped: StrippedCall[] } {
  const s = new ToolMarkupStripper();
  const out = s.push(text) + s.flush();
  return { text: out, stripped: s.stripped };
}

/** The TOOL_MARKUP_STRIPPED log for one removed call: the tool's name, never the words. */
export function logToolMarkup(where: 'llm' | 'tts', sessionId?: string) {
  return (c: StrippedCall): void =>
    log.warn(
      { event: 'TOOL_MARKUP_STRIPPED', tool: c.tool, form: c.form, where, sessionId },
      'TOOL_MARKUP_STRIPPED'
    );
}

/** A text stream with tool-call markup removed (TTS wrapper). */
export function toolMarkupTransform(
  onStrip?: (call: StrippedCall) => void
): TransformStream<string, string> {
  const s = new ToolMarkupStripper(onStrip);
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      const out = s.push(chunk);
      if (out) controller.enqueue(out);
    },
    flush(controller) {
      const out = s.flush();
      if (out) controller.enqueue(out);
    },
  });
}

type ReplyChunk = { id?: string; delta?: { role?: string; content?: string } };

/**
 * A model reply (strings or ChatChunks) with tool-call markup removed from its
 * text. Real tool calls, usage and everything else pass through unchanged.
 */
export async function withToolMarkupStrip<T>(
  reply: Promise<T> | T,
  onStrip?: (call: StrippedCall) => void
): Promise<T> {
  const stream = await reply;
  if (stream === null || stream === undefined) return stream;
  const reader = (stream as unknown as ReadableStream<string | ReplyChunk>).getReader();
  const s = new ToolMarkupStripper(onStrip);
  let id = '';
  let strings = true;
  return new ReadableStream<string | ReplyChunk>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        const rest = s.flush();
        if (rest)
          controller.enqueue(strings ? rest : { id, delta: { role: 'assistant', content: rest } });
        controller.close();
        return;
      }
      if (typeof value === 'string') {
        const out = s.push(value);
        if (out) controller.enqueue(out);
        return;
      }
      strings = false;
      id = value.id ?? id;
      const content = value.delta?.content;
      if (!content) {
        controller.enqueue(value);
        return;
      }
      controller.enqueue({ ...value, delta: { ...value.delta, content: s.push(content) } });
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  }) as unknown as T;
}
