/**
 * What the single-agent greeting may say back about the caller, less what they asked Ferni to
 * forget (FORGET_EVERY_READER, #3682; with it off, exactly what it read before).
 *
 * The profile goes through the same scrub as the system prompt's (profileForCaller: last call
 * summary, goals, concerns, life events). The intentions the caller stated are their own words,
 * so they are read with the passage check (any distinctive word of a topic). Both use the shared
 * topics read, one per caller, so a greeting costs no read per item.
 *
 * @module voice-agent/greeting-remembered
 */

import { forgottenPassageCheck, profileForCaller, remembered } from '../../memory/index.js';
import type { SessionServices } from '../../services/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'greeting-remembered' });

export interface GreetingIntention {
  intention: string;
  statedAt: Date;
  targetTime?: Date;
}

/** The caller's profile as the greeting reads it; null without one. */
export async function greetingProfile(
  services: SessionServices
): Promise<SessionServices['userProfile']> {
  const profile = services.userProfile;
  return profile && profileForCaller(services.userId, profile, 'greeting');
}

/** The intentions the caller stated and hasn't followed up on, less any about a forgotten topic. */
export async function greetingIntentions(
  userId: string | null | undefined
): Promise<GreetingIntention[]> {
  if (!userId) return [];
  try {
    const { getPendingIntentions } = await import('../../services/trust-systems/small-wins.js');
    const pending = getPendingIntentions(userId).map((i) => ({
      intention: i.intention,
      statedAt: i.statedAt,
      targetTime: i.targetTime,
    }));
    if (pending.length === 0) return pending;
    const said = await forgottenPassageCheck(userId, 'greeting');
    return remembered(pending, said, (i) => i.intention);
  } catch (error) {
    log.debug({ error: String(error) }, 'Pending intentions not read: greeting goes on without');
    return [];
  }
}
