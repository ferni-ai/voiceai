/**
 * FORGET_EVERY_READER for group outreach (group-outreach.ts): a group message
 * (a team celebration, a planning or support check-in) about a topic the
 * caller asked Ferni to forget is never sent or stored, nor any while their
 * forget list can't be read. Thrown, so the sender's own failure path
 * returns it unsent; the error names no topic.
 *
 * @module services/conversation-thread/group-outreach-forget
 */
import { forgottenCheck } from '../../memory/index.js';

export class ForgottenTopicError extends Error {
  constructor() {
    super('group message about a forgotten topic: not sent');
    this.name = 'ForgottenTopicError';
  }
}

interface GroupAbout {
  userId: string;
  topic?: string;
  reason?: string;
  context?: Record<string, unknown>;
}

/** The message `write` makes, unless it, its topic, reason or context is about a forgotten topic. */
export async function rememberedGroupMessage<O extends GroupAbout>(
  options: O,
  write: (options: O) => string
): Promise<string> {
  const message = write(options);
  const forgotten = await forgottenCheck(options.userId, 'group-outreach');
  if (!forgotten) return message;
  const about = [message, options.topic, options.reason, Object.values(options.context ?? {})];
  const text = about
    .flat(2)
    .filter((x) => typeof x === 'string')
    .join(' ');
  if (forgotten(text)) throw new ForgottenTopicError();
  return message;
}
