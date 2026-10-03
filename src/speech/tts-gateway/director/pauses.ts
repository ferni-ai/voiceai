/**
 * Pause planning and rendering.
 *
 * Planning: every pause point in a segment gets a kind and a human duration
 * from three buckets (spec §4.1: clause 150-300 ms, thought 300-600 ms,
 * pre-reveal 600-900 ms), with deterministic jitter from the text so pauses
 * are not metronomic and tests are repeatable. These become `pause`
 * RustEvents: P1/P2 only log them; P3 can render them as PCM silence.
 *
 * Rendering adds no pauses. Native <break> is not sent until a measured test
 * on the one-context-per-reply path says it is safe (owner ruling; stacked
 * breaks made Sonic hallucinate, and a break splits the generation), and
 * extra punctuation would add pauses: Sonic pauses ~310 ms at a comma and
 * 230-790 ms at a mid-sentence "..." (dev measurement 2026-10-03,
 * ferni-breaks-measured.md). What rendering does is remove the one pause the
 * listener hears as a break: the LLM's mid-sentence ellipsis. Removing it took
 * the pause out in every offline render; a comma in its place did not.
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

/**
 * An ellipsis with more of the sentence after it (a lowercase word, perhaps
 * past a tag): "that's just... huge", "window...reminds", "drop... [laughter] just".
 */
const MID_SENTENCE_ELLIPSIS = /\s*(?:\.\.\.|…)((?:\s|<[^>]*>|\[[^\]]*\])*)(?=[a-z])/g;

/**
 * Drop mid-sentence ellipses; keep a trailing-off one at the end of a
 * sentence or turn. Words and markup are kept, joined by single spaces.
 */
export function removeMidSentenceEllipses(text: string): { text: string; removed: number } {
  let removed = 0;
  const out = text.replace(MID_SENTENCE_ELLIPSIS, (_m, between: string, offset: number) => {
    removed++;
    const kept = between.trim();
    if (offset === 0) return kept ? `${kept} ` : '';
    return kept ? ` ${kept} ` : ' ';
  });
  return { text: out, removed };
}

/** Commas per 100 words: Sonic pauses ~310 ms at each (logged for a later lever). */
export function commaDensity(text: string): { commas: number; words: number } {
  return {
    commas: (text.match(/,/g) ?? []).length,
    words: text.split(/\s+/).filter(Boolean).length,
  };
}
