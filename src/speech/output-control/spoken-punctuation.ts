/**
 * Ellipses and em dashes in text bound for TTS.
 *
 * AGENTS.md bans both in spoken text: Sonic reads a mid-sentence "..." as a
 * 230-790 ms hesitation (dev measurement 2026-10-03) and gives a dash odd
 * prosody. Persona content still carries thousands of them and model output
 * adds more, so this pass rewrites them on the way to TTS (the transcript keeps
 * what was written):
 *
 * - an ellipsis between words becomes `<break time="300ms"/>` (the SSML
 *   processor turns a 200-399 ms break into a comma, so Sonic hears a short,
 *   steady pause); a trailing one at the end of the reply becomes ".";
 * - an em dash, or a spaced " -- ", becomes ", "; at the end of the reply, ".";
 * - next to sentence punctuation, a comma or a closing quote, either is just
 *   dropped (that mark already pauses), and at the start of a reply too;
 * - an ellipsis or dash next to an existing break merges into ONE break, the
 *   longer of the two (stacked breaks make Sonic hallucinate).
 *
 * Left as written: anything inside a tag (attribute values included), URLs,
 * and an unspaced ellipsis or dash between digits ("1...3", "10—12"), which is
 * a range rather than a pause.
 *
 * Streaming: chunks split "..." anywhere ("Just.." + ". talk"), so a trailing
 * run of whitespace, dots, dashes and break tags, or a tag still arriving, is
 * held until the next chunk shows what follows it, or the reply ends.
 *
 * Flag: SPOKEN_PUNCTUATION_NORMALIZE (default off; off passes chunks through
 * untouched).
 *
 * @module speech/output-control/spoken-punctuation
 */
import { TransformStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';

export const ELLIPSIS_BREAK_MS = 300;

const BREAK_TAG = String.raw`<break\b[^>]*>`;
const ELLIPSIS = String.raw`\.{3,}|\.*…[.…]*`;
/** Tags other than breaks, a tag left unclosed at the end, and URLs: never rewritten. */
const PROTECTED = String.raw`<(?!break\b)[^>]*>|<[^>]*$|(?:https?:\/\/|www\.)\S+`;
/** A run of pauses: whitespace, breaks, ellipses, em dashes and spaced "--". */
const CLUSTER = String.raw`(?:\s|${BREAK_TAG}|${ELLIPSIS}|—|(?<=\s)--+(?=\s|$))+`;
const SCAN = new RegExp(`(${PROTECTED})|${CLUSTER}`, 'g');
const BREAKS = new RegExp(BREAK_TAG, 'g');
const HAS_ELLIPSIS = new RegExp(ELLIPSIS);
const HAS_DASH = /—|--/;

/** What a stream must hold back: a trailing pause run, or a tag still arriving. */
const UNSETTLED = new RegExp(
  String.raw`(?:\s|[.…—-]|${BREAK_TAG})*(?:<(?:[a-zA-Z/][^<>]{0,200})?)?$`
);
/** Output kept as look-behind context for the next release. */
const CONTEXT_CHARS = 200;

function breakMs(tag: string): number {
  const m = /time\s*=\s*["']?(\d+(?:\.\d+)?)\s*(ms|s)?/i.exec(tag);
  if (!m) return 0;
  return m[2]?.toLowerCase() === 's' ? Number(m[1]) * 1000 : Number(m[1]);
}

/** One break for the cluster: the existing tag verbatim when it is the longest. */
function mergedBreak(tags: string[], ellipsis: boolean): string {
  let best = '';
  let bestMs = -1;
  for (const tag of tags) {
    const ms = breakMs(tag);
    if (ms > bestMs) [best, bestMs] = [tag, ms];
  }
  if (ellipsis && bestMs < ELLIPSIS_BREAK_MS) return `<break time="${ELLIPSIS_BREAK_MS}ms"/>`;
  return best;
}

const PAUSES_ALREADY = /[.!?,;:]/;
const CLOSES = /[.!?,;:"”)\]]/;

/** What an ellipsis or dash becomes, by where it sits. */
function pauseFor(
  tags: string[],
  ellipsis: boolean,
  prev: string,
  next: string,
  atEnd: boolean
): string {
  const kept = mergedBreak(tags, false);
  if (!prev) return kept; // start of the reply: nothing to pause after
  if (!next && atEnd) return PAUSES_ALREADY.test(prev) ? kept : `.${kept}`;
  if (CLOSES.test(next) || PAUSES_ALREADY.test(prev)) return kept; // that mark already pauses
  if (ellipsis) return mergedBreak(tags, true);
  return kept || ',';
}

function rewriteCluster(cluster: string, prev: string, next: string, atEnd: boolean): string {
  const ellipsis = HAS_ELLIPSIS.test(cluster);
  if (!ellipsis && !HAS_DASH.test(cluster)) return cluster;
  if (/\d/.test(prev) && /\d/.test(next) && !/\s|</.test(cluster)) return cluster; // a range
  const pause = pauseFor(cluster.match(BREAKS) ?? [], ellipsis, prev, next, atEnd);
  // The cluster took the spaces around it: one goes back before a following word.
  const space = next && !CLOSES.test(next) && (prev || pause) ? ' ' : '';
  return pause + space;
}

/**
 * Rewrite the reply's ellipses and dashes. Only matches at or after `from` are
 * rewritten; the text before it is look-behind context. `atEnd` says the text
 * ends where the reply does (a trailing ellipsis becomes ".").
 */
export function normalizeSpokenPunctuation(text: string, from = 0, atEnd = true): string {
  return text.replace(SCAN, (m: string, guarded: string | undefined, at: number) => {
    if (guarded || at < from) return m;
    return rewriteCluster(m, text.charAt(at - 1), text.charAt(at + m.length), atEnd);
  });
}

/** Streaming form for the TTS text stream; identity when the flag is off. */
export function spokenPunctuation(env: Env = process.env): TransformStream<string, string> {
  if (!flagOn('SPOKEN_PUNCTUATION_NORMALIZE', env)) return new TransformStream<string, string>();
  let pending = '';
  let context = '';
  const release = (upTo: number, atEnd: boolean): string => {
    const all = normalizeSpokenPunctuation(context + pending.slice(0, upTo), context.length, atEnd);
    const out = all.slice(context.length);
    pending = pending.slice(upTo);
    context = (context + out).slice(-CONTEXT_CHARS);
    return out;
  };
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      pending += chunk;
      const hold = UNSETTLED.exec(pending)?.index ?? pending.length;
      const out = release(hold, false);
      if (out) controller.enqueue(out);
    },
    flush(controller) {
      const out = release(pending.length, true);
      if (out) controller.enqueue(out);
    },
  });
}
