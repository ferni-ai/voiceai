/**
 * The open loops less any about a topic the caller asked Ferni to forget (#3995).
 *
 * Every reader of the open-loops store (the web panels, Story So Far, the semantic context, the
 * call's open-loops note) reads through open-loops.ts's three getters, and they all pass here.
 * Not covered: the copies of a loop's text written when it is saved, into the insight broker
 * (source 'open_loop') and the coaching semantic index (`open_loop_<id>`); their readers are
 * #3995 part 2. A loop holds the caller's raw words, so the passage matcher reads it (any
 * distinctive word of a topic). When the list can't be read, nothing is shown: a privacy
 * request fails closed.
 *
 * @module services/superhuman/semantic-intelligence/remembered-loops
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { OpenLoop } from './open-loops.js';

const log = createLogger({ module: 'remembered-loops' });

/** The loops not about a forgotten topic; none when the forgotten list can't be read. */
export async function rememberedLoops(userId: string, loops: OpenLoop[]): Promise<OpenLoop[]> {
  if (loops.length === 0) return loops;
  // Loaded lazily: the web app's test build reads open-loops through open-loop-read and
  // can't resolve the memory context.
  const { forgottenPassageFilter } = await import('../../../memory/index.js');
  const forgotten = await forgottenPassageFilter(userId);
  if (!forgotten) {
    log.warn({ userId, count: loops.length }, 'Forgotten topics unreadable: open loops held');
    return [];
  }
  return loops.filter((l) => !forgotten([l.content, l.context, l.description].join(' ')));
}
