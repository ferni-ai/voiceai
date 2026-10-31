/**
 * Stray commas and periods left behind when pause tags and cues are stripped.
 *
 * A pause tag turned into a comma can land right after sentence punctuation
 * ("Talk to me., Mm.,"); the sentence end already pauses, so the comma goes.
 * With HELD_BREAK_PUNCTUATION=on the cleanup also looks past held native
 * breaks: "mind?<break 500ms/>[soft breath]<break 200ms/>" became
 * "mind?⦃BREAK500⦄, " and played "mind?," (#3165). It also collapses the
 * spaced ", , " two short breaks leave around a stripped cue.
 *
 * @module speech/tts-gateway/ssml/stuck-punctuation
 */

import { flagOn, type Env } from '../../../config/env-flag.js';
import { HELD_BREAKS } from './native-breaks.js';

/** Sentence punctuation, any held breaks, then a stray comma or period. */
const STUCK_COMMA = new RegExp(`([.!?])(${HELD_BREAKS})\\s*,`, 'g');
const STUCK_PERIOD = new RegExp(`([!?])(${HELD_BREAKS})\\s*\\.(?!\\.)`, 'g');

/** Drop commas and periods stuck to sentence punctuation (run before space-before-punctuation fixes). */
export function fixStuckPunctuation(text: string, env: Env = process.env): string {
  if (!flagOn('HELD_BREAK_PUNCTUATION', env)) {
    return text
      .replace(/,+/g, ',')
      .replace(/([.!?])\s*,/g, '$1')
      .replace(/([!?])\s*\.(?!\.)/g, '$1');
  }
  return text
    .replace(/,(?:\s*,)+/g, ',')
    .replace(STUCK_COMMA, '$1$2')
    .replace(STUCK_PERIOD, '$1$2');
}
