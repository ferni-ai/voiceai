/**
 * The profile a persona's setup builds "Who You're Talking To" from.
 *
 * On the multi-agent fast path the profile loads after setup starts (deferred-profile.ts).
 * Read at once, a profile that lands later is missed and the call has no awareness block.
 * The first persona waits for the load, up to a cap; a handoff finds it settled and does not.
 *
 * @module agents/multi-agent/setup-profile
 */

import * as forgotten from '../../memory/recall/forget-every-reader.js';
import { deferredProfileSettled } from '../../services/session/deferred-profile.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

/**
 * How long setup waits for the deferred profile. 1200 ms: on dev the profile attaches a median
 * ~0.4 s and a p90 ~1 s after setup starts (attach p90 1.13 s from deferral, setup starts ~0.15 s
 * later). Past the cap the call starts without the block rather than wait on a slow store.
 */
const PROFILE_ATTACH_WAIT_MS = 1200;

/**
 * Start waiting now (beside the prompt loads); the returned read waits out the rest, warns once
 * past the cap (session id and attach state only), and reads through the forget scrub.
 */
export function setupProfileReader<P extends object>(
  services: { userId?: string | null; userProfile?: P | null },
  sessionId: string
): () => Promise<P | null> {
  const settled = deferredProfileSettled(services, PROFILE_ATTACH_WAIT_MS);
  return async () => {
    if (!(await settled)) {
      log.warn(
        { sessionId, attach: 'pending' },
        'Profile not attached in time: no awareness block'
      );
    }
    return forgotten.profileForPrompt(services);
  };
}
