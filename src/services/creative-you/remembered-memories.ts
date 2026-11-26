/**
 * The call summaries and key moments Creative You reads ("you first mentioned this 3 weeks
 * ago"), less any about a topic the caller asked Ferni to forget (FORGET_EVERY_READER on; off,
 * every one as read). A summary or moment holds the caller's words, so its whole text reads as a
 * passage (forgottenPassageCheck), as recall reads call summaries: one forgotten word in it and
 * it goes. The stored summaries are not changed.
 *
 * @module services/creative-you/remembered-memories
 */

import type { ConversationSummary, KeyMoment } from '../../types/user-profile.js';

type Memories = [ConversationSummary[], KeyMoment[]];

/** Every field of a summary the copy can say back, or match a topic on. */
const summaryText = (s: ConversationSummary): string =>
  [
    ...s.mainTopics,
    ...s.keyPoints,
    s.emotionalArc,
    ...(s.decisionsReached ?? []),
    ...(s.questionsRemaining ?? []),
    ...(s.followUpItems ?? []),
  ].join(' ');

const momentText = (m: KeyMoment): string => [m.summary, ...m.topics].join(' ');

/** The summaries and moments not about a forgotten topic (all of them with the flag off). */
export async function rememberedMemories(
  userId: string,
  [summaries, moments]: Memories
): Promise<Memories> {
  if (summaries.length === 0 && moments.length === 0) return [summaries, moments];
  const { forgottenPassageCheck, remembered } = await import('../../memory/index.js');
  const forgotten = await forgottenPassageCheck(userId, 'creative-you');
  return [
    remembered(summaries, forgotten, summaryText),
    remembered(moments, forgotten, momentText),
  ];
}
