/**
 * Tool arguments the model writes as text, cut from the words sent to TTS.
 *
 * Prod call 2026-10-17: mid-reply, Gemini wrote a softTeamIntro call as text
 * instead of calling it, and Ferni spoke it: "<template-call:default_api:
 * softTeamIntro{ context: <its reasoning about the caller>, teammate_specialty:
 * habits }". The per-chunk patterns in tts-wrapper's JSON leak filter look for
 * quoted JSON and edit formats, not this.
 *
 * Speech has no braces and no snake_case keys. A cut starts at
 * "<template-call", an opening brace or a snake_case key before ":" or "=",
 * and runs to the closing brace, across chunks. A cut that starts at a key
 * with no brace open ends with its chunk. At most MAX_CUT characters go, so a
 * brace that never closes can't silence the rest of the reply. A chunk ending
 * in the start of "<template-call" holds those characters for the next one,
 * since the model's chunks split words ("teamm" + "ate_specialty").
 * TOOL_ARGS_GUARD=off turns the cut off.
 *
 * @module agents/shared/tts-tool-args-filter
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'tts-tool-args-filter' });
const START = /<template-call\b|\{|\b[a-z]+(?:_[a-z]+)+\s*[:=]/i;
const MARKER = '<template-call';
export const MAX_CUT = 300;

export function toolArgsGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TOOL_ARGS_GUARD !== 'off';
}

/** What one chunk keeps for TTS, and what was cut from it. */
export interface Cut {
  kept: string;
  cut: string;
}

/** How much of the text's end could be the start of the marker ("<", "<te", ...). */
function markerTail(text: string): number {
  for (let n = Math.min(MARKER.length - 1, text.length); n > 0; n--) {
    if (MARKER.startsWith(text.slice(-n).toLowerCase())) return n;
  }
  return 0;
}

/** Cuts one reply's chunks, in order (it remembers a brace left open); flush() at the end. */
export interface ToolArgsCutter {
  (chunk: string): Cut;
  /**
   * At the end of the reply, what was held back: a lone "<" goes out; "<t" and longer are a
   * marker the reply was cut off in (speech never has them, and SSML is added after this).
   */
  flush: () => string;
}

export function toolArgsCutter(): ToolArgsCutter {
  let open = false; // inside a brace opened by an earlier chunk
  let used = 0; // characters cut since that brace opened
  let held = ''; // a possible "<template-call" start from the end of the last chunk
  const cutter = (chunk: string): Cut => {
    let kept = '';
    let cut = '';
    let rest = held + chunk;
    held = '';
    while (rest) {
      if (!open) {
        const m = START.exec(rest);
        if (!m) {
          kept += rest;
          break;
        }
        kept += rest.slice(0, m.index);
        rest = rest.slice(m.index);
        if (!m[0].startsWith('{') && !m[0].startsWith('<')) {
          // A key with no brace: to a closing brace in this chunk, else to its end.
          const close = rest.indexOf('}');
          cut += close >= 0 ? rest.slice(0, close + 1) : rest;
          rest = close >= 0 ? rest.slice(close + 1) : '';
          continue;
        }
        open = true;
        used = 0;
      }
      const room = MAX_CUT - used;
      const close = rest.indexOf('}');
      const end = close >= 0 && close < room ? close + 1 : Math.min(rest.length, room);
      cut += rest.slice(0, end);
      used += end;
      rest = rest.slice(end);
      if ((close >= 0 && close < room) || used >= MAX_CUT) open = false;
    }
    const tail = open ? 0 : markerTail(kept);
    if (tail) {
      held = kept.slice(-tail);
      kept = kept.slice(0, -tail);
    }
    return { kept, cut };
  };
  return Object.assign(cutter, {
    flush: () => {
      const rest = held;
      held = '';
      return rest.length === 1 ? rest : '';
    },
  });
}

/**
 * The TTS stage for one reply: each chunk's kept text, and at the end what was held. Cuts are
 * logged by length only, since they can carry the model's reasoning about the caller.
 */
export function toolArgsStage(
  sessionId?: string,
  env: NodeJS.ProcessEnv = process.env
): { cut: (chunk: string) => string; flush: () => string } {
  if (!toolArgsGuardEnabled(env)) return { cut: (chunk) => chunk, flush: () => '' };
  const cutter = toolArgsCutter();
  return {
    cut: (chunk) => {
      const { kept, cut } = cutter(chunk);
      if (cut) {
        log.warn(
          { cutLength: cut.length, sessionId },
          '🚨 [TOOL-ARGS-FILTER] Tool arguments written as text - cut from TTS'
        );
      }
      return kept;
    },
    flush: cutter.flush,
  };
}
