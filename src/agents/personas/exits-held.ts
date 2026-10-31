/**
 * Turns where no note may send the caller off, keep the goodbye short or bar a
 * question (turn-request.ts): a reply with crisis guidance, or any turn of a
 * call with crisis risk noted (crisis-call-risk.ts).
 *
 * Found 2026-10-31 by an independent verifier: on a first call, "I should go,
 * I can't do this anymore" got crisis guidance AND FIRST_GOODBYE_NOTE ("They're
 * heading off ... No question"), so the request told Ferni to check on them and
 * to let them go without asking anything. A goodbye after risk on the call may
 * be the moment a safety check matters most, so the later turns the gate passes
 * (no guidance) are held too, as QUESTION_PACE already does (question-pace.ts).
 *
 * Fails closed: when the call's risk can't be read (no call id to read it by,
 * or a risk check that throws), the notes are held.
 *
 * @module agents/personas/exits-held
 */
import { crisisRiskNoted } from '../../services/safety/crisis-call-risk.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ExitsHeld' });

/** True when this turn's request must carry no goodbye, wrap-up or no-question note. */
export function exitsHeld(sessionId: string | undefined, crisis: boolean): boolean {
  if (crisis || !sessionId) return true;
  try {
    return crisisRiskNoted(sessionId);
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, 'EXITS_HELD: risk check failed, notes held');
    return true;
  }
}
