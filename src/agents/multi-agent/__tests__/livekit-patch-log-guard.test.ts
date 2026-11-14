/**
 * No line our @livekit/agents patch adds logs what the caller said or what Ferni
 * says back. A caller's words do not go into logs outside a dev environment, and
 * the SDK patch has no dev exception of its own: its log lines hold lengths, counts
 * and fixed labels (livekit-patch-log-lengths.test.ts drives each one).
 *
 * The guard reads the patch file, joins each run of added lines, finds every logger
 * or console call in it (log-guard.ts's reader), and fails a call whose arguments
 * still name a text-bearing value once every `<expr>.length` is set aside.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CALL, closing } from '../../voice-agent-entry/__tests__/log-guard.js';

const PATCH = join(__dirname, '..', '..', '..', '..', 'patches', '@livekit__agents@1.9.3.patch');

/**
 * Values that hold words: an STT alternative's `.text`, the SDK's transcript fields
 * (newTranscript, audioTranscript, preflight, rawTextContent), chat content, and the
 * same names written bare or as a key's shorthand.
 */
const TEXT_VALUE =
  /\.(?:text|newTranscript|audioTranscript|audioPreflightTranscript|currentTranscript|transcript|rawTextContent|textContent|content)\b|\b(?:text|transcript|newTranscript|audioTranscript|rawTextContent|content|user_input|userInput|said|utterance)\b(?!\s*:)/;

/** `source` with every `<expr>.length` replaced by LEN, so only text not reduced to a length is left. */
function withoutLengths(source: string): string {
  let out = source;
  for (let at = out.indexOf('.length'); at >= 0; at = out.indexOf('.length')) {
    let start = at;
    while (start > 0) {
      const c = out.charAt(start - 1);
      if (c === ')' || c === ']') {
        const open = c === ')' ? '(' : '[';
        let depth = 0;
        let i = start - 1;
        for (; i >= 0; i--) {
          if (out[i] === c) depth++;
          else if (out[i] === open && --depth === 0) break;
        }
        start = i;
      } else if (/[\w$.?]/.test(c)) {
        start--;
      } else {
        break;
      }
    }
    out = `${out.slice(0, start)}LEN${out.slice(at + '.length'.length)}`;
  }
  return out;
}

/** Where each logger or console call in `source` that carries text starts, with its text. */
function textLogging(source: string): Array<{ at: number; call: string }> {
  const found: Array<{ at: number; call: string }> = [];
  for (const m of source.matchAll(CALL)) {
    const at = m.index ?? 0;
    const open = at + m[0].length - 1;
    const close = closing(source, open);
    if (TEXT_VALUE.test(withoutLengths(source.slice(open + 1, close)))) {
      found.push({ at, call: source.slice(at, close + 1) });
    }
  }
  return found;
}

/** The logger and console calls in `source` whose arguments carry text. */
function textLoggingCalls(source: string): string[] {
  return textLogging(source).map((f) => f.call);
}

/** Each run of consecutive added lines in a unified diff, joined, with the patch line it starts on. */
function addedRuns(patch: string): Array<{ line: number; source: string }> {
  const runs: Array<{ line: number; source: string }> = [];
  let current: { line: number; lines: string[] } | undefined;
  patch.split('\n').forEach((row, i) => {
    if (row.startsWith('+') && !row.startsWith('+++ ')) {
      current ??= { line: i + 1, lines: [] };
      current.lines.push(row.slice(1));
    } else if (current) {
      runs.push({ line: current.line, source: current.lines.join('\n') });
      current = undefined;
    }
  });
  if (current) runs.push({ line: current.line, source: current.lines.join('\n') });
  return runs;
}

/** Patch lines (1-based) of added log calls that carry text. */
function textLoggingLinesInPatch(patch: string): number[] {
  return addedRuns(patch).flatMap(({ line, source }) =>
    textLogging(source).map(({ at }) => line + source.slice(0, at).split('\n').length - 1)
  );
}

describe('textLoggingCalls', () => {
  it.each([
    // the lines the patch carried until 2026-11-13
    'this.logger.info({ user_input: ev.alternatives[0].text }, "BACKCHANNEL_KEEPS_PAUSE");',
    'this.logger.info({ user_input: info.newTranscript }, "BACKCHANNEL_NOT_A_TURN");',
    'this.logger.info({ user_input: info.newTranscript, holdMs: __holdMs }, "UNFINISHED_TURN_HELD");',
    "this.logger.info({ used: a, leadMs: 3, preflight: String(preemptive.info.newTranscript).slice(0, 60), final: String(userMessage == null ? void 0 : userMessage.rawTextContent).slice(0, 60) }, 'PREEMPTIVE_DECISION');",
    'this.logger.info({ dropped: d.map((e) => { var _a; return `${e.type}:${String(((_a = e.alternatives) == null ? void 0 : _a[0]) == null ? "" : e.alternatives[0].text).slice(0, 40)}`; }), audioTranscript: String(this.audioTranscript).slice(0, 60) }, "HELD_STT_DROPPED");',
    'this.logger.info({ transcript: this.audioTranscript.slice(0, 60), agentSpeaking: this.isAgentSpeaking }, "END_OF_SPEECH_PASSTHROUGH");',
    // other shapes: a planted leak, console, a template, a shorthand key, a level below info
    'this.logger.info({ user_input: x.text }, "X");',
    'console.log("heard", transcript);',
    'this.logger.warn(`heard ${ev.alternatives[0].text}`);',
    'this.logger.debug({ transcript }, "shorthand");',
    'this.logger.info({ said: info.newTranscript.slice(0, 20) }, "slice");',
    'this.logger.info({ reply: msg.content }, "reply");',
    'this.logger.info({ n: text.length, words: text }, "length beside the words");',
  ])('flags %s', (code) => {
    expect(textLoggingCalls(code)).toHaveLength(1);
  });

  it.each([
    // the same lines since 2026-11-13
    'this.logger.info({ user_input_len: String(ev.alternatives[0].text ?? "").length }, "BACKCHANNEL_KEEPS_PAUSE");',
    'this.logger.info({ user_input_len: String(info.newTranscript ?? "").length, holdMs: __holdMs }, "UNFINISHED_TURN_HELD");',
    'this.logger.info({ used: a, sameTranscript: __pSameText, leadMs: 3, preflight_len: String(preemptive.info.newTranscript ?? "").length, final_len: String((userMessage == null ? void 0 : userMessage.rawTextContent) ?? "").length }, \'PREEMPTIVE_DECISION\');',
    'this.logger.info({ dropped: d.map((e) => { var _a; return `${e.type}:${String((((_a = e.alternatives) == null ? void 0 : _a[0]) == null ? "" : e.alternatives[0].text) ?? "").length}`; }), audioTranscript_len: String(this.audioTranscript ?? "").length }, "HELD_STT_DROPPED");',
    'this.logger.info({ transcript_len: String(this.audioTranscript).length, agentSpeaking: this.isAgentSpeaking }, "END_OF_SPEECH_PASSTHROUGH");',
    // the patch's other log lines: ids, timings, labels
    'this.logger.info({ heldMs, speechId: speechHandle.id, cause, capped: Boolean(settling) }, cause === "launch" ? "A" : "B");',
    'this.logger.info({ queuedMs: Math.round(queuedDuration) }, "BARGE_IN_FAST_STOP_CLEAR");',
    'this.logger.trace({ event: ev.type }, "holding STT event during agent speech");',
    'this.logger.info({ textLen: info.newTranscript?.length ?? 0 }, "optional chain");',
    // text that is used, not logged
    'if (__ferniIsBackchannel(ev.alternatives[0].text)) return;',
  ])('leaves %s alone', (code) => {
    expect(textLoggingCalls(code)).toEqual([]);
  });

  it('reports the patch line of a call, in a run of added lines', () => {
    const patch = [
      '@@ -1,2 +1,4 @@',
      ' const a = 1;',
      '+const b = 2;',
      '+this.logger.info({ user_input: x.text }, "X");',
      ' const c = 3;',
    ].join('\n');
    expect(textLoggingLinesInPatch(patch)).toEqual([4]);
  });
});

describe('patches/@livekit__agents@1.9.3.patch', () => {
  it('adds no log line that carries what was said', () => {
    expect(textLoggingLinesInPatch(readFileSync(PATCH, 'utf8'))).toEqual([]);
  });

  it('still adds its marker log lines, so the guard has calls to read', () => {
    const added = addedRuns(readFileSync(PATCH, 'utf8'))
      .map((r) => r.source)
      .join('\n');
    const calls = [...added.matchAll(CALL)].length;
    expect(calls).toBeGreaterThanOrEqual(16);
  });
});
