/**
 * Markup the SSML processor keeps or tidies before it parses a chunk.
 *
 * Split out of processor.ts (over the quality ratchet's line limit). From
 * Cartesia's docs (checked 2026-10-03):
 * - `<spell>TEXT</spell>` reads codes and IDs character by character. It is
 *   passed through (the processor's catch-all would strip it as an unknown
 *   tag), and never next to a `<break>`: Cartesia says not to chain them, so a
 *   break touching a spell element is dropped.
 * - Consecutive `<break>` tags make Sonic hallucinate. A run of breaks with
 *   nothing spoken between them becomes one break at the run's longest
 *   duration.
 * - Asterisk stage directions are never spoken (../stage-directions.ts).
 *
 * @module speech/tts-gateway/ssml/speech-markup
 */

import { rewriteAsteriskSpans } from '../stage-directions.js';

const BREAK = String.raw`<break\b[^>]*>`;
const BREAK_RUN = new RegExp(`${BREAK}(?:\\s*${BREAK})+`, 'gi');
const BREAK_TIME = /<break\s+time=["']?(\d+)(ms|s)?["']?\s*\/?>/gi;
const BREAK_BEFORE_SPELL = new RegExp(`${BREAK}\\s*(?=<spell>)`, 'gi');
const BREAK_AFTER_SPELL = new RegExp(`(</spell>)(\\s*)${BREAK}`, 'gi');
const SPELL = /<spell>([\s\S]*?)<\/spell>/gi;
/** Private-use placeholder: no cleanup rule matches these characters. */
const PLACEHOLDER = /(\d+)/g;

function breakMs(tag: string): number {
  BREAK_TIME.lastIndex = 0;
  const m = BREAK_TIME.exec(tag);
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 's' ? 1000 : 1);
}

/** One break per run of breaks with nothing spoken between, at the longest duration. */
export function collapseBreaks(text: string): string {
  return text.replace(BREAK_RUN, (run) => {
    const longest = Math.max(...(run.match(new RegExp(BREAK, 'gi')) ?? []).map(breakMs));
    return `<break time="${longest}ms"/>`;
  });
}

/** Drop a break directly before `<spell>` or directly after `</spell>`. */
export function dropBreaksBesideSpell(text: string): string {
  return text.replace(BREAK_BEFORE_SPELL, '').replace(BREAK_AFTER_SPELL, '$1$2');
}

/** Swap spell elements for placeholders so later passes can't touch them. */
export function protectSpell(text: string): { text: string; restore: (out: string) => string } {
  const kept: string[] = [];
  const masked = text.replace(SPELL, (_m, inner: string) => {
    kept.push(`<spell>${inner}</spell>`);
    return `${kept.length - 1}`;
  });
  return {
    text: masked,
    restore: (out) =>
      kept.length === 0 ? out : out.replace(PLACEHOLDER, (m, i: string) => kept[Number(i)] ?? m),
  };
}

/**
 * Everything the processor does before parsing: drop stage directions,
 * collapse break runs, drop breaks beside spell, and protect spell elements.
 */
export function prepareSpeechMarkup(text: string): {
  text: string;
  restore: (out: string) => string;
} {
  const directed = rewriteAsteriskSpans(text, false).text;
  return protectSpell(dropBreaksBesideSpell(collapseBreaks(directed)));
}
