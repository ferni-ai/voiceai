/**
 * The open loops less any about a topic the caller asked Ferni to forget (#3995), with
 * FORGET_EVERY_READER on (off in prod); with it off, every loop is read as before.
 *
 * Every reader of the open-loops store (the web panels, Story So Far, the semantic context, the
 * call's open-loops note) reads through open-loops.ts's three getters, and they all pass here.
 * The loop's copies elsewhere have their own checks: the insight broker (#4056) and the coaching
 * semantic index (#4074). A loop holds the caller's raw words, so the passage matcher reads all
 * its text (forgottenPassageCheck: any distinctive word of a topic). The topics are the shared
 * read, or the last ones read when it is late or fails, so a database hiccup doesn't empty the
 * panels; with no topics ever read, nothing is shown (a privacy request fails closed).
 *
 * @module services/superhuman/semantic-intelligence/remembered-loops
 */

import type { OpenLoop } from './open-loops.js';

/** The loops not about a forgotten topic (all of them with the flag off). */
export async function rememberedLoops(userId: string, loops: OpenLoop[]): Promise<OpenLoop[]> {
  if (loops.length === 0) return loops;
  // Loaded lazily: the web app's test build reads open-loops through open-loop-read and
  // can't resolve the memory context.
  const { forgottenPassageCheck, remembered } = await import('../../../memory/index.js');
  return remembered(loops, await forgottenPassageCheck(userId, 'open-loops'), loopText);
}

/**
 * Every field of a loop a reader can show: its words, and the person and topic it is about,
 * which can name what its words don't ("call him tomorrow" about Kessler; #4048 review).
 */
const loopText = (l: OpenLoop): string =>
  [l.content, l.context, l.description, l.resolution, l.relatedPerson, l.relatedTopic].join(' ');
