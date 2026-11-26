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
  forgetEveryReaderEnabled,
  forgetFreshReadEnabled,
  forgottenPassageCheck,
  forgottenPassageWithin,
  profileForCaller,
  remembered,
  type ForgottenCheck,
} from '../../memory/index.js';
import type { SessionServices } from '../../services/index.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';
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
  return (
    profile && profileForCaller(services.userId, profile, 'greeting', forgetFreshReadEnabled())
  );
}

/** FORGET_FRESH_READ's check for the intentions: the store itself, and all left out when unread. */
async function freshIntentionsCheck(userId: string): Promise<ForgottenCheck | null> {
  if (!forgetEveryReaderEnabled() || !isMemberIdentity(userId)) return null; // no check: as off
  return (await forgottenPassageWithin(userId, 'greeting', process.env, true)) ?? (() => true);
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
    const said = forgetFreshReadEnabled()
      ? await freshIntentionsCheck(userId)
      : await forgottenPassageCheck(userId, 'greeting');
    return remembered(pending, said, (i) => i.intention);
  } catch (error) {
    log.debug({ error: String(error) }, 'Pending intentions not read: greeting goes on without');
    return [];
  }
}
