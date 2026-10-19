/**
 * A forgotten topic also closes the open follow-ups about it, so Ferni never
 * texts or asks about something the person asked it to forget.
 *
 * Memory (L3) may not import the follow-through store, so the process that
 * runs forgetTopic installs this port at start-up
 * (services/outreach/forget-follow-ups-adapter.ts). Closing is best effort:
 * the topic is already recorded, and the follow-up delivery job checks the
 * forgotten list before every text (services/outreach/follow-up-texts.ts),
 * so a port that is missing or fails is logged with a fixed reason and the
 * forget still succeeds.
 *
 * @module memory/recall/forget-follow-ups
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'forget-follow-ups' });

export interface ForgetFollowUpsPort {
  /** Closes the person's open follow-ups whose text `about` matches; how many it closed. */
  closeAbout: (userId: string, about: (text: string) => boolean, now: Date) => Promise<number>;
}

let port: ForgetFollowUpsPort | undefined;

export function setForgetFollowUpsPort(next: ForgetFollowUpsPort | undefined): void {
  port = next;
}

/** Close follow-ups `about` matches. Never throws. */
export async function closeForgottenFollowUps(
  userId: string,
  about: (text: string) => boolean,
  now: Date
): Promise<void> {
  if (!port) {
    log.warn({ reason: 'port-not-installed' }, 'Forgotten topic: follow-ups not closed');
    return;
  }
  try {
    const closed = await port.closeAbout(userId, about, now);
    if (closed > 0) log.info({ closed }, 'Forgotten topic: follow-ups closed');
  } catch (error) {
    log.warn(
      { reason: 'close-failed', error: String(error) },
      'Forgotten topic: follow-ups not closed'
    );
  }
}
