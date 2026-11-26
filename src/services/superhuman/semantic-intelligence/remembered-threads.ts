/**
 * The semantic threads less any about a topic the caller asked Ferni to forget (#3682), with
 * FORGET_EVERY_READER on; with it off, every thread is read as before.
 *
 * A thread's moments are the caller's own words, and its theme and insight are drawn from them,
 * so the passage matcher reads all of it (forgottenPassageCheck: any distinctive word of a topic)
 * and a thread goes whole, never left half-quoted. Same shared topics read and fallback as the
 * open loops (remembered-loops.ts).
 *
 * @module services/superhuman/semantic-intelligence/remembered-threads
 */

import type { SemanticThread } from './types.js';

/** The threads not about a forgotten topic (all of them with the flag off). */
export async function rememberedThreads(
  userId: string,
  threads: SemanticThread[]
): Promise<SemanticThread[]> {
  if (threads.length === 0) return threads;
  // Loaded lazily, as remembered-loops.ts does: the memory context is large.
  const { forgottenPassageCheck, remembered } = await import('../../../memory/index.js');
  return remembered(threads, await forgottenPassageCheck(userId, 'semantic-threads'), threadText);
}

const threadText = (t: SemanticThread): string =>
  [t.theme, t.connectionInsight, ...t.moments.map((m) => m.content)].join(' ');
