/**
 * What the single-agent greeting may say back about the caller, less what they asked Ferni to
 * forget (FORGET_EVERY_READER, #3682; with it off, exactly what it read before).
 *
 * The profile goes through the same scrub as the system prompt's (profileForCaller: last call
 * summary, goals, concerns, life events). The intentions the caller stated are their own words,
 * so they are read with the passage check (any distinctive word of a topic). Both use the shared
 * topics read, one per caller, so a greeting costs no read per item. With FORGET_FRESH_READ each
 * reads the store itself instead (#2755), so a forget stored by another pod or the web app just
 * before the call counts: the profile falls back to the last known topics when that read is late,
 * the intentions are left out.
 *
 * @module voice-agent/greeting-remembered
 */

import {
  callStartPassageCheck,
  forgetFreshReadEnabled,
  profileForCaller,
  remembered,
} from '../../memory/index.js';
import type { SessionServices } from '../../services/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'greeting-remembered' });

export interface GreetingIntention {
  intention: string;
  statedAt: Date;
  targetTime?: Date;
}

/** The caller's profile as the greeting reads it; null without one. */
async function greetingProfile(services: SessionServices): Promise<SessionServices['userProfile']> {
  const profile = services.userProfile;
  return (
    profile && profileForCaller(services.userId, profile, 'greeting', forgetFreshReadEnabled())
  );
}

/** The intentions the caller stated and hasn't followed up on, less any about a forgotten topic. */
async function greetingIntentions(userId: string | null | undefined): Promise<GreetingIntention[]> {
  if (!userId) return [];
  try {
    const { getPendingIntentions } = await import('../../services/trust-systems/small-wins.js');
    const pending = getPendingIntentions(userId).map((i) => ({
      intention: i.intention,
      statedAt: i.statedAt,
      targetTime: i.targetTime,
    }));
    if (pending.length === 0) return pending;
    const said = await callStartPassageCheck(userId, 'greeting');
    return remembered(pending, said, (i) => i.intention);
  } catch (error) {
    log.debug({ error: String(error) }, 'Pending intentions not read: greeting goes on without');
    return [];
  }
}

/** Both, read together: with FORGET_FRESH_READ each is a store read, so neither waits on the other. */
export async function greetingRemembered(services: SessionServices): Promise<{
  profile: SessionServices['userProfile'];
  pendingIntentions: GreetingIntention[];
}> {
  const [profile, pendingIntentions] = await Promise.all([
    greetingProfile(services),
    greetingIntentions(services.userId),
  ]);
  return { profile, pendingIntentions };
}
