/**
 * Where cohort flags are kept: Firestore's feature_cohorts and
 * feature_flag_overrides collections, read for cohort-flags.ts.
 *
 * @module services/platform/cohort-firestore
 */
import { getFirestoreDb } from '../../utils/firestore-utils.js';

export interface Cohort {
  id: string;
  enabled: boolean;
  flags: Record<string, string>;
  /** Also every caller whose sample bucket falls under this (1 to 100); members are always in. */
  percent?: number;
}

export interface CohortStore {
  /** Cohorts the caller is a member of. */
  cohortsFor: (userId: string) => Promise<Cohort[]>;
  /** The caller's own overrides. */
  overridesFor: (userId: string) => Promise<Record<string, string>>;
  /** Cohorts that take a percent of all callers. */
  sampledCohorts?: () => Promise<Cohort[]>;
}

function toCohort(id: string, x: Record<string, unknown>): Cohort {
  return {
    id,
    enabled: x.enabled !== false,
    flags:
      typeof x.flags === 'object' && x.flags !== null ? (x.flags as Record<string, string>) : {},
    ...(typeof x.percent === 'number' && { percent: x.percent }),
  };
}

/**
 * feature_cohorts/{id}: { name, enabled, members: [uid], flags, percent? };
 * feature_flag_overrides/{uid}: { flags }.
 */
export const firestoreCohortStore: CohortStore = {
  async cohortsFor(userId) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db
      .collection('feature_cohorts')
      .where('members', 'array-contains', userId)
      .get();
    return snap.docs.map((d) => toCohort(d.id, d.data()));
  },
  async sampledCohorts() {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await db.collection('feature_cohorts').where('percent', '>=', 1).get();
    return snap.docs.map((d) => toCohort(d.id, d.data()));
  },
  async overridesFor(userId) {
    const db = getFirestoreDb();
    if (!db) return {};
    const doc = await db.collection('feature_flag_overrides').doc(userId).get();
    const flags = doc.exists ? doc.data()?.flags : undefined;
    return flags && typeof flags === 'object' ? (flags as Record<string, string>) : {};
  },
};

/** Finds who might have a flag on, without reading every caller. */
export interface FlagHolderStore {
  /** Members of cohorts setting `flag` to 'on', and callers whose own override sets it 'on'. */
  candidatesFor: (flag: string) => Promise<string[]>;
}

const FLAG_NAME = /^[A-Z][A-Z0-9_]*$/;

export const firestoreFlagHolders: FlagHolderStore = {
  async candidatesFor(flag) {
    const db = getFirestoreDb();
    // Callers pass a COHORT_FLAGS name; anything else could change the field path.
    if (!db || !FLAG_NAME.test(flag)) return [];
    const [cohorts, overrides] = await Promise.all([
      db.collection('feature_cohorts').where(`flags.${flag}`, '==', 'on').get(),
      db.collection('feature_flag_overrides').where(`flags.${flag}`, '==', 'on').get(),
    ]);
    const members = cohorts.docs.flatMap((d) => {
      const x = d.data();
      if (x.enabled === false || !Array.isArray(x.members)) return [];
      return (x.members as unknown[]).filter((m): m is string => typeof m === 'string');
    });
    return [...members, ...overrides.docs.map((d) => d.id)];
  },
};
