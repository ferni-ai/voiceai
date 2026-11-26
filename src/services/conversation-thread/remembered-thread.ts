/**
 * A conversation thread as an agent's context shows it (buildAgentContext: the text thread's
 * history, and the voice session's thread note), less the messages and topic tags about a topic
 * the caller asked Ferni to forget (FORGET_EVERY_READER on; off, the thread as read). A message
 * is the caller's or an agent's own words, so it reads as a passage (forgottenPassageCheck): one
 * forgotten word in it and it goes. The stored thread and its messages are not changed.
 *
 * @module services/conversation-thread/remembered-thread
 */

import type { ConversationThread, ThreadMessage } from './types.js';

export interface ShownThread {
  thread: ConversationThread;
  messages: ThreadMessage[];
}

/** The thread and messages to show, a copy with forgotten ones left out (the same with the flag off). */
export async function rememberedThread(
  thread: ConversationThread,
  messages: ThreadMessage[]
): Promise<ShownThread> {
  const { forgottenPassageCheck, remembered } = await import('../../memory/index.js');
  const forgotten = await forgottenPassageCheck(thread.userId, 'conversation-thread');
  if (!forgotten) return { thread, messages };
  return {
    thread: { ...thread, topicTags: remembered(thread.topicTags, forgotten, (t) => t) },
    messages: remembered(messages, forgotten, (m) => m.content),
  };
}
