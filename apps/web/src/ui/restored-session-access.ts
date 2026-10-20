/**
 * A remembered sign-in is checked too, so a reload can't skip the waitlist.
 * Approved continues; a failed check also continues, because the server
 * refuses a voice session to anyone not admitted (src/api/admission.ts), so
 * this screen is the explanation, not the lock. Anything else shows the gate,
 * which checks again and explains why.
 */
import { checkAccess } from '../services/access-check.js';
import { createLogger } from '../utils/logger.js';
import { showSignInGate } from './sign-in-gate.ui.js';

const log = createLogger('RestoredSessionAccess');

export async function requireAccessForRestoredSession(check = checkAccess): Promise<void> {
  const outcome = await check();
  log.info('Restored-session access check', { outcome: outcome.kind });
  if (outcome.kind === 'approved' || outcome.kind === 'unavailable') return;
  await showSignInGate();
}
