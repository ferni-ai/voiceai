/**
 * Shared laughs: the moments a caller actually laughed, remembered and
 * called back.
 *
 * An inside joke is not a template ("you and your coffee!"); it is a moment
 * two people laughed at together, brought back later when something echoes
 * it. The live call already hears the caller laugh. The line Ferni had just
 * said is what they laughed at, and what they had been talking about is the
 * context. A later call can bring it back once, lightly, when the caller's
 * words echo it: never explained, never forced.
 *
 * Pure: capture, matching and wording. Storage lives with the recall store.
 *
 * @module memory/recall/shared-laughs
 */

import { contentWords } from './session-recall.js';

export interface SharedLaugh {
  id: string;
  /** What made them laugh (Ferni's line, or the joke's reference). */
  moment: string;
  /** What they had been talking about. */
  context: string;
  /** Epoch ms. */
  at: number;
  source: 'laugh' | 'inside_joke';
}

const MAX_TEXT = 160;

const clip = (text: string | undefined): string => {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > MAX_TEXT ? `${t.slice(0, MAX_TEXT - 1).trimEnd()}…` : t;
};

export interface LaughCaptureInput {
  /** What Ferni said just before the laugh. */
  agentLine: string | undefined;
  /** What the caller had said before that. */
  userLine: string | undefined;
  at: number;
}

/** A shared laugh worth remembering, or null when there is nothing to anchor it to. */
export function captureLaugh({ agentLine, userLine, at }: LaughCaptureInput): SharedLaugh | null {
  const moment = clip(agentLine);
  if (contentWords(moment).size < 2) return null;
  return { id: `laugh_${at}`, moment, context: clip(userLine), at, source: 'laugh' };
}

/** An inside joke found by the end-of-call extractor, as a shared laugh. */
export function fromInsideJoke(joke: Record<string, unknown>): SharedLaugh | null {
  const moment = clip(String(joke.reference ?? ''));
  if (!moment) return null;
  const when = joke.originatedAt as { toMillis?: () => number } | string | number | undefined;
  const at =
    typeof when === 'object' && when?.toMillis
      ? when.toMillis()
      : new Date((when as string | number | undefined) ?? 0).getTime();
  return {
    id: String(joke.id ?? `joke_${moment}`),
    moment,
    context: clip(String(joke.origin ?? '')),
    at: Number.isFinite(at) ? at : 0,
    source: 'inside_joke',
  };
}

/** A stored shared-laugh document back into a SharedLaugh, or null if malformed. */
export function fromStoredLaugh(doc: Record<string, unknown>): SharedLaugh | null {
  const moment = clip(String(doc.moment ?? ''));
  if (!moment) return null;
  return {
    id: String(doc.id ?? `laugh_${String(doc.at)}`),
    moment,
    context: clip(String(doc.context ?? '')),
    at: typeof doc.at === 'number' ? doc.at : 0,
    source: doc.source === 'inside_joke' ? 'inside_joke' : 'laugh',
  };
}

/** Words shared with the moment before a callback fits; one word is a coincidence. */
const MIN_OVERLAP = 2;

/**
 * The shared laugh this turn echoes, best first, or null. It needs a real
 * echo (at least two content words in common) and skips ones already called
 * back this session.
 */
export function callbackForTurn(
  laughs: readonly SharedLaugh[],
  userText: string,
  surfaced: ReadonlySet<string> = new Set()
): SharedLaugh | null {
  const words = contentWords(userText);
  let best: { laugh: SharedLaugh; score: number } | null = null;
  for (const laugh of laughs) {
    if (surfaced.has(laugh.id)) continue;
    let overlap = 0;
    for (const w of contentWords(`${laugh.moment} ${laugh.context}`)) {
      if (words.has(w)) overlap++;
    }
    if (overlap < MIN_OVERLAP) continue;
    // Prefer the stronger echo, then the more recent moment.
    const score = overlap + laugh.at / 1e15;
    if (!best || score > best.score) best = { laugh, score };
  }
  return best?.laugh ?? null;
}

/** The context note for a callback. */
export function formatCallback(laugh: SharedLaugh, userName?: string): string {
  const who = userName || 'they';
  const what =
    laugh.source === 'laugh'
      ? `${who} laughed when you said: "${laugh.moment}"`
      : `you share a joke about: "${laugh.moment}"`;
  const about = laugh.context ? ` (you had been talking about: "${laugh.context}")` : '';
  return [
    '[A LAUGH YOU SHARED]',
    `Some time ago ${what}${about}.`,
    'What they just said echoes it. If it genuinely fits and they are not upset, a light callback can land: a brief nod to it, never explained, never forced. Otherwise let it go.',
  ].join('\n');
}
