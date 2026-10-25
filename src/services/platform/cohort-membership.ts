import { firestoreCohortStore, type CohortStore } from './cohort-flags.js';

/** One definition of membership: listed in `members` AND enabled, so disabling a cohort is the fast kill. */
export async function isCohortMember(
  cohortId: string,
  userId: string,
  store: Pick<CohortStore, 'cohortsFor'> = firestoreCohortStore
): Promise<boolean> {
  return (await store.cohortsFor(userId)).some((c) => c.id === cohortId && c.enabled);
}
