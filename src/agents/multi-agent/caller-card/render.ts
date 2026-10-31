/**
 * The caller card as prompt lines (spec §5.4.3). Pure. The guards run here, in code: each line
 * goes through the person model's line guard (forgotten, sensitive, contact data) after its
 * markup is stripped, and the card is capped at MAX_CARD_CHARS by dropping whole lines from
 * the lowest priority up (Coming up, Recent calls, People, Home).
 *
 * @module agents/multi-agent/caller-card/render
 */
import { lineIsSafe, oneLine } from '../../../intelligence/person-model/index.js';
import type { CallerCard } from './types.js';

const MAX_CARD_CHARS = 1200;

const HEADER = 'What you know about them (private; never read it out):';
const CLOSING =
  'Use this like a friend would. Do not raise any of it unless they do or your hello already did.';

interface CardRenderOptions {
  /** memory_state/forgotten, re-read at this persona's setup; null when that read missed its time. */
  forgottenTopics: string[] | null;
}

const assemble = (lines: string[]): string =>
  lines.length === 0 ? '' : [HEADER, ...lines, CLOSING].join('\n');

/** The card's lines, or '' when nothing is left to say. */
export function renderCallerCard(card: CallerCard, opts: CardRenderOptions): string {
  // A null read can't name what was forgotten: People and Coming up (which can) will be
  // dropped whole once they exist; Home and Recent calls are checked against nothing.
  const forgottenTopics = opts.forgottenTopics ?? [];
  const fit = (text: string): string | null => {
    const s = oneLine(text);
    return s && lineIsSafe(s, { forgottenTopics }) ? s : null;
  };
  const place = card.home && fit(card.home.value.place);
  // Forgotten as recall matches a fact (subject, key, value), the key also in words ("where I live").
  const home = place && fit(`User home where they live ${place}`) ? place : null;
  // In priority order: the last line is dropped first when the card is too long.
  const lines = [home ? `- Home: ${home}.` : null].filter((l): l is string => l !== null);
  while (lines.length > 0 && assemble(lines).length > MAX_CARD_CHARS) lines.pop();
  return assemble(lines);
}
