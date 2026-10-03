/**
 * Pause planning and rendering.
 *
 * Planning: every pause point in a segment gets a kind and a human duration
 * from three buckets (spec §4.1: clause 150-300 ms, thought 300-600 ms,
 * pre-reveal 600-900 ms), with deterministic jitter from the text so pauses
 * are not metronomic and tests are repeatable. These become `pause`
 * RustEvents: P1/P2 only log them; P3 can render them as PCM silence.
 *
 * Rendering: punctuation only. Native <break> is not sent until a measured
 * test on the one-context-per-reply path says it is safe (owner ruling;
 * stacked breaks made Sonic hallucinate, and a break splits the generation).
 * Three conservative upgrades, all words preserved:
 *   - a lead-in to the point ("here's the thing,") trails off: "here's the thing..."
 *   - an opening discourse marker gets its comma: "Well I think" → "Well, I think"
 *   - a contrast in a long unpunctuated run gets a comma: "... all of them, but ..."
 *
 * @module speech/tts-gateway/director/pauses
 */

import type { PauseKind, RustEvent } from './types.js';

export const PAUSE_RANGES: Readonly<Record<PauseKind, readonly [number, number]>> = {
  clause: [150, 300],
  thought: [300, 600],
  preReveal: [600, 900],
};

/** FNV-1a: a cheap, stable hash for duration jitter. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pauseDuration(kind: PauseKind, seed: string): number {
  const [lo, hi] = PAUSE_RANGES[kind];
  return lo + (hash(`${kind}:${seed}`) % (hi - lo + 1));
}

/** Pause marks inside a segment, and the kind each one is heard as. */
const INTERNAL_MARK = /(\.\.\.|…|[.!?]|[,;:]|\s[—–-]|—)(?=\s)/g;

function kindOf(mark: string): PauseKind {
  const m = mark.trim();
  if (m === '...' || m === '…') return 'preReveal';
  if (m === ',' || m === ';') return 'clause';
  return 'thought'; // sentence ends, colons, dashes
}

function finalKind(segment: string): PauseKind {
  const t = segment.trimEnd().replace(/["')\]]+$/, '');
  if (/(?:\.\.\.|…)$/.test(t)) return 'preReveal';
  if (/[.!?:]$/.test(t)) return 'thought';
  return 'clause';
}

const wordsBefore = (text: string, index: number): number =>
  text.slice(0, index).split(/\s+/).filter(Boolean).length;

function pauseEvent(kind: PauseKind, anchor: RustEvent['anchor'], seed: string): RustEvent {
  return {
    type: 'pause',
    anchor,
    params: { kind, durationMs: pauseDuration(kind, seed), render: 'punctuation' },
  };
}

/** The pauses a listener hears in this segment, internal ones first. */
export function planPauses(segment: string): RustEvent[] {
  const text = segment.trim();
  const events: RustEvent[] = [];
  INTERNAL_MARK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INTERNAL_MARK.exec(text)) !== null) {
    const at = wordsBefore(text, m.index + m[0].length);
    events.push(pauseEvent(kindOf(m[1]), { atWordIndex: at }, `${text}#${m.index}`));
  }
  if (text) events.push(pauseEvent(finalKind(text), { edge: 'segment-end' }, text));
  return events;
}

const PRE_REVEAL =
  /\b(here's the thing|the thing is|the truth is|guess what|you know what|turns out)\s*,\s+/gi;
const OPENING_MARKER =
  /(^|[.!?]\s+)(well|okay|oh|hmm|honestly|actually|yeah)\s+(?=(?:i|i'm|i've|i'd|i'll|you|you're|we|we're|it|it's|that|that's|this|there|there's|he|she|they|they're|let's)\b)/gi;
const CONTRAST = /([A-Za-z']+)\s+(but|though|although)\s/gi;
/** "nothing ... but sleep", "all but": "but" means "except" there, not a contrast. */
const EXCEPT_SENSE = /\b(?:nothing|anything|everything|none|nobody|no one)\b/i;
const EXCEPT_BEFORE = new Set(['all', 'cannot', 'last']);
const LONG_RUN_CHARS = 40;

/** Punctuation-only pause upgrades. Never adds or removes a word. */
export function renderPauses(segment: string): { text: string; inserted: number } {
  let inserted = 0;
  let text = segment.replace(PRE_REVEAL, (_m, lead: string) => {
    inserted++;
    return `${lead}... `;
  });
  text = text.replace(OPENING_MARKER, (_m, before: string, marker: string) => {
    inserted++;
    return `${before}${marker}, `;
  });
  text = text.replace(
    CONTRAST,
    (match, prev: string, conj: string, offset: number, all: string) => {
      const lastMark = Math.max(
        ...[',', '.', ';', ':', '!', '?'].map((p) => all.lastIndexOf(p, offset))
      );
      const run = all.slice(lastMark + 1, offset + prev.length);
      if (run.length < LONG_RUN_CHARS || EXCEPT_SENSE.test(run)) return match;
      if (EXCEPT_BEFORE.has(prev.toLowerCase())) return match;
      inserted++;
      return `${prev}, ${conj} `;
    }
  );
  return { text, inserted };
}
