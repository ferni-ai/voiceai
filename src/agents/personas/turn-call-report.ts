/**
 * The call report on a turn's request (CALL_REPORT_REACHES_YOU, #3080): it never rides a request
 * with any safety signal, and any other request marks it delivered once its reply is released.
 *
 * One check, at the one place every model request passes (withTurnReminder), decided from the
 * signals themselves rather than from each crisis path: a crisis-shaped request, any safety
 * guidance in it (a marked note, a pushed note holding some, or a safety tool's call or output),
 * or crisis risk noted on the call. Each crisis path found its own way past a per-path strip (#3080 r1-r7); a new path is
 * covered as long as it marks its guidance, which the injection filter and pusher already do.
 *
 * @module agents/personas/turn-call-report
 */
import { llm } from '@livekit/agents';
import {
  confirmCallReportReached,
  REPORT_HEADER,
  withoutCallReport,
} from '../../intelligence/context-builders/external/call-report.js';
import { crisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { reachesHelp } from '../../services/safety/index.js';
import { TURN_CONTEXT_SAFETY } from '../multi-agent/pushed-notes.js';
import { carriesSafety } from '../processors/turn-processor/safety-note.js';
import { PROTECTED_TOOL_NAMES } from '../../tools/orchestrator/persona-tool-policy.js';

/** How deep a decoded tool output is walked for its text; deeper holds the report. */
const MAX_DEPTH = 8;
/**
 * reachesHelp reads one sentence at a time and is slower than linear on some long text (128 KB
 * of "bus 112 leaves at gate 999 then route 111 to 000 dock" took 620 ms), so tool output is
 * read in windows that overlap by more than any line's name. Text longer than MAX_WINDOWS
 * windows holds the report.
 */
const WINDOW = 2048;
const OVERLAP = 128;
const MAX_WINDOWS = 64;

/**
 * Every text part of a tool's output, or null when it nests deeper than MAX_DEPTH. LiveKit keeps
 * the output JSON-encoded, so "\n988" reads as "n988" until it is decoded; numbers count as
 * text ("911" decodes to 911).
 */
function textParts(output: unknown): string[] | null {
  let value = output;
  if (typeof output === 'string') {
    try {
      value = JSON.parse(output);
    } catch {
      return [output];
    }
  }
  const parts: string[] = [];
  let tooDeep = false;
  const walk = (v: unknown, depth: number): void => {
    if (typeof v === 'string' || typeof v === 'number') parts.push(String(v));
    else if (v && typeof v === 'object') {
      if (depth >= MAX_DEPTH) tooDeep = true;
      else for (const inner of Object.values(v)) walk(inner, depth + 1);
    }
  };
  walk(value, 0);
  return tooDeep ? null : parts;
}

/**
 * The check this file used before #3157, kept as a floor so nothing it held now rides: it reads
 * "crisis text" and "#988", which reachesHelp does not. Only an amount ("$988") is let through.
 */
const FORMER_CHECK = /(?<![$€£])\b988\b|lifeline|crisis[\s-]+(?:line|text)/i;

const windowHelps = (text: string): boolean => FORMER_CHECK.test(text) || reachesHelp(text);

/** Help read over bounded windows; text too long to read in MAX_WINDOWS holds (fails safe). */
function readsHelp(text: string): boolean {
  if (text.length <= WINDOW) return windowHelps(text);
  const step = WINDOW - OVERLAP;
  if (Math.ceil((text.length - OVERLAP) / step) > MAX_WINDOWS) return true;
  for (let at = 0; at < text.length - OVERLAP; at += step) {
    if (windowHelps(text.slice(at, at + WINDOW))) return true;
  }
  return false;
}

/**
 * Help named anywhere in a tool's output (#3157): job-loss and new-parent tools name 988 too
 * (#3080 r8), and reachesHelp is the one reader of help lines in any form. The parts are read
 * joined by a space and by nothing, for a name split across parts ("Crisis Life" + "line"), and
 * the output as stored is read too, so a line written as an object key is not missed.
 */
function namesHelp(output: unknown): boolean {
  const parts = textParts(output);
  if (parts === null) return true;
  const raw = typeof output === 'string' ? output : JSON.stringify(output ?? '');
  return [...new Set([raw, parts.join(' '), parts.join('')])].some(readsHelp);
}

/** What each tool output named, read once: an item's output never changes, and history keeps it. */
const helpByItem = new WeakMap<object, boolean>();

/** A safety tool's call or output, or any tool output naming help: unmarked guidance. */
function safetyTool(item: unknown): boolean {
  const { type, name, output } = item as { type?: string; name?: string; output?: unknown };
  if (type !== 'function_call' && type !== 'function_call_output') return false;
  if (PROTECTED_TOOL_NAMES.has(name ?? '')) return true;
  const known = helpByItem.get(item as object);
  if (known !== undefined) return known;
  const named = namesHelp(output);
  helpByItem.set(item as object, named);
  return named;
}

/** Any safety signal on this request or call. Fails safe: an error holds the report. */
function reportMustWait(
  chatCtx: llm.ChatContext,
  sessionId: string | undefined,
  crisis: boolean
): boolean {
  try {
    if (crisis || (sessionId !== undefined && crisisRiskNoted(sessionId))) return true;
    return chatCtx.items.some((item) => {
      const extra = (item as { extra?: Record<string, unknown> }).extra;
      return carriesSafety({ extra }) || Boolean(extra?.[TURN_CONTEXT_SAFETY]) || safetyTool(item);
    });
  } catch {
    return true;
  }
}

/** The request, without the call report when any safety signal is on it, and whether it waits. */
export function turnRequestFor(
  chatCtx: llm.ChatContext,
  sessionId: string | undefined,
  crisis: boolean
): [request: llm.ChatContext, waits: boolean] {
  const waits = reportMustWait(chatCtx, sessionId, crisis);
  return [waits ? stripped(chatCtx) : chatCtx, waits];
}

/** The request for a speaker who can't be verified: the report is the owner's news (#3091). */
export const withoutReport = (chatCtx: llm.ChatContext): llm.ChatContext => stripped(chatCtx);

/** An item that holds the report, or can't be read (then it is treated as holding it). */
function holdsReport(item: unknown): boolean {
  try {
    return String((item as { textContent?: unknown }).textContent ?? '').includes(REPORT_HEADER);
  } catch {
    return true;
  }
}

/** Without the report; if the strip could not take it out, without any item that holds it. */
function stripped(chatCtx: llm.ChatContext): llm.ChatContext {
  const out = withoutCallReport(chatCtx);
  if (!out.items.some(holdsReport)) return out;
  const ctx = llm.ChatContext.empty();
  ctx.items = chatCtx.items.filter((item) => !holdsReport(item));
  return ctx;
}

/** A report this request carries is delivered once its reply is released (crisis-gate.ts). */
export function noteCallReportReached(
  sessionId: string | undefined,
  chatCtx: llm.ChatContext,
  turn: { latest: string; held?: PromiseLike<unknown> | null; crisis: boolean }
): void {
  if (!turn.crisis) void confirmCallReportReached(sessionId, chatCtx.items, turn);
}
