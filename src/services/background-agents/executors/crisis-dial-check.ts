/**
 * CRISIS_DIAL_HOLD (off by default, #4187), the background half: a call queued on a call checks
 * that call's crisis risk right before it dials. A call that noted risk since the call was
 * confirmed never dials, and neither does one with no originating call id. The deferred half is
 * services/outreach/crisis-dial-hold.ts. Logs counts and enums only.
 *
 * @module services/background-agents/executors/crisis-dial-check
 */
import { flagOn } from '../../../config/env-flag.js';
import { crisisRiskNoted } from '../../safety/index.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'CrisisDialCheck' });

/** Right before a background call dials: held when its call noted risk or has no call id. */
export function dialHeld(
  sessionId: string | undefined,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (!flagOn('CRISIS_DIAL_HOLD', env)) return false;
  if (sessionId && !crisisRiskNoted(sessionId)) return false;
  const outcome = sessionId ? 'crisis_hold_at_dial' : 'no_origin_call';
  log.info({ outcome, at: 'background' }, 'CRISIS_DIAL_HOLD');
  return true;
}
