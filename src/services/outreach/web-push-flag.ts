/**
 * WEB_PUSH_DELIVERY for one person.
 *
 * Read per person from their cohorts and override (flagForUser), never from
 * process.env: the web server sends and answers for many people at once, so a
 * process-wide value would turn it on for everyone. Off unless COHORT_FLAGS=on
 * and the person's cohort or override sets it. A full rollout is a 100% cohort.
 *
 * @module services/outreach/web-push-flag
 */
import { flagForUser, type FlagLookupOptions } from '../platform/cohort-flags.js';

export async function webPushDeliveryOn(
  userId: string,
  opts: FlagLookupOptions = {}
): Promise<boolean> {
  return (await flagForUser(userId, 'WEB_PUSH_DELIVERY', opts)) === 'on';
}
