/**
 * Pending outreach, found and cancelled only inside its owner's own list.
 *
 * The engine's getTrigger/cancelTrigger search every user's triggers by id, so
 * DELETE /api/outreach/pending/:id and POST /api/outreach/reschedule let any
 * signed-in user cancel or reschedule someone else's outreach by guessing its id.
 * The routes pass the verified caller here; an id that isn't theirs is "not found".
 *
 * @module services/outreach/owned-outreach
 */
import { getOutreachDecisionEngine, type OutreachTrigger } from './decision-engine.js';

/** The caller's pending trigger with this id, or undefined if it isn't theirs. */
export function findOwnedOutreach(ownerId: string, triggerId: string): OutreachTrigger | undefined {
  return getOutreachDecisionEngine()
    .getPendingTriggers(ownerId)
    .find((t) => t.id === triggerId);
}

/** Cancel the caller's pending trigger. False (nothing changed) if it isn't theirs. */
export function cancelOwnedOutreach(ownerId: string, triggerId: string): boolean {
  if (!findOwnedOutreach(ownerId, triggerId)) return false;
  return getOutreachDecisionEngine().cancelTrigger(triggerId);
}
