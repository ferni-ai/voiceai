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
 * brace that never closes can't silence the rest of the reply.
 * TOOL_ARGS_GUARD=off turns the cut off.
 *
 * @module agents/shared/tts-tool-args-filter
 */

const START = /<template-call\b|\{|\b[a-z]+(?:_[a-z]+)+\s*[:=]/i;
export const MAX_CUT = 300;

export function toolArgsGuardEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TOOL_ARGS_GUARD !== 'off';
}

/** What one chunk keeps for TTS, and what was cut from it. */
export interface Cut {
  kept: string;
  cut: string;
}

/** A cutter for one reply's chunks, in order: it remembers a brace left open. */
export function toolArgsCutter(): (chunk: string) => Cut {
  let open = false; // inside a brace opened by an earlier chunk
  let used = 0; // characters cut since that brace opened
  return (chunk) => {
    let kept = '';
    let cut = '';
    let rest = chunk;
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
    return { kept, cut };
  };
}
