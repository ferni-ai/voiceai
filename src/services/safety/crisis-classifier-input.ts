/**
 * What the crisis classifier reads of a turn (normalizeInput), split out of
 * crisis-classifier.ts, which re-exports it.
 *
 * @module CrisisClassifierInput
 */

import { stripSSML } from '../../utils/text-utils.js';
import type { CrisisClassifierInput } from './crisis-classifier.js';

const MAX_EARLIER_MESSAGES = 5;

/** The companion's line is context, not the subject: its end is what LATEST answers. */
const MAX_COMPANION_CHARS = 400;

/** What the classifier actually sees: trimmed, latest not repeated in earlier, last 5 earlier. */
export function normalizeInput(input: CrisisClassifierInput): {
  latest: string;
  earlier: string[];
  companion?: string;
} {
  const latest = input.latest.trim();
  const earlier = input.earlier
    .map((m) => m.trim())
    .filter((m) => m.length > 0 && m !== latest)
    .slice(-MAX_EARLIER_MESSAGES);
  // Stripped of SSML so the gate (chat context) and the turn pipeline (recorded
  // reply) key the same line alike and share one call.
  const companion = stripSSML(input.companion ?? '')
    .trim()
    .slice(-MAX_COMPANION_CHARS);
  return companion ? { latest, earlier, companion } : { latest, earlier };
}
