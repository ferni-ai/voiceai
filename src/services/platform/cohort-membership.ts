/**
 * Cohort membership by name, for code that gates on who someone is rather than on a flag
 * (the friends-and-family owner's consent attestation, messaging/consent-grants.ts).
 *
 * @module services/platform/cohort-membership
 */
import { firestoreCohortStore, type CohortStore } from './cohort-flags.js';

/** True when the user is a named member of the enabled cohort `cohortId` (samples don't count). */
export async function isCohortMember(
  userId: string,
  cohortId: string,
  store: CohortStore = firestoreCohortStore
): Promise<boolean> {
  return (await store.cohortsFor(userId)).some((c) => c.id === cohortId && c.enabled);
}
