/**
 * Human Signal Persistence
 *
 * Persists extracted human signals (dreams, fears, values, important dates)
 * to Firestore for long-term memory.
 *
 * CRITICAL: This is the #1 BTH blocker - without this, Ferni forgets
 * the user's deepest revelations.
 *
 * @module HumanSignalPersistence
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getLogger } from '../utils/safe-logger.js';
import type {
  ImportantDate,
  CoreValue,
  Dream,
  Fear,
  GrowthMarker,
  ChallengeProgress,
  ComfortPattern,
  StressTrigger,
  RecurringAvoidance,
  InsideJoke,
} from '../types/human-memory.js';

const log = getLogger().child({ module: 'HumanSignalPersistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface HumanSignals {
  importantDates: ImportantDate[];
  values: CoreValue[];
  dreams: Dream[];
  fears: Fear[];
  growthMarkers: GrowthMarker[];
  challenges: ChallengeProgress[];
  comfortPatterns: ComfortPattern[];
  stressTriggers: StressTrigger[];
  avoidances: RecurringAvoidance[];
  insideJokes: InsideJoke[];
}

export interface PersistenceResult {
  success: boolean;
  persisted: {
    dates: number;
    values: number;
    dreams: number;
    fears: number;
    growthMarkers: number;
    challenges: number;
    comfortPatterns: number;
    stressTriggers: number;
    avoidances: number;
    insideJokes: number;
  };
  errors: string[];
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Persist human signals to Firestore
 *
 * Writes to the user's human_signals subcollection with deduplication.
 * Each signal type is stored in a separate document for efficient querying.
 */
export async function persistHumanSignals(
  userId: string,
  signals: Partial<HumanSignals>,
  options?: {
    sessionId?: string;
    personaId?: string;
  }
): Promise<PersistenceResult> {
  const db = getFirestore();
  const result: PersistenceResult = {
    success: false,
    persisted: {
      dates: 0,
      values: 0,
      dreams: 0,
      fears: 0,
      growthMarkers: 0,
      challenges: 0,
      comfortPatterns: 0,
      stressTriggers: 0,
      avoidances: 0,
      insideJokes: 0,
    },
    errors: [],
  };

  try {
    const batch = db.batch();
    const userRef = db.collection('bogle_users').doc(userId);
    const signalsRef = userRef.collection('human_signals');
    const now = Timestamp.now();

    // Persist each signal type
    if (signals.importantDates?.length) {
      const datesDoc = signalsRef.doc('important_dates');
      batch.set(
        datesDoc,
        {
          items: FieldValue.arrayUnion(...signals.importantDates),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.dates = signals.importantDates.length;
    }

    if (signals.values?.length) {
      const valuesDoc = signalsRef.doc('values');
      batch.set(
        valuesDoc,
        {
          items: FieldValue.arrayUnion(...signals.values),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.values = signals.values.length;
    }

    if (signals.dreams?.length) {
      const dreamsDoc = signalsRef.doc('dreams');
      batch.set(
        dreamsDoc,
        {
          items: FieldValue.arrayUnion(...signals.dreams),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.dreams = signals.dreams.length;
    }

    if (signals.fears?.length) {
      const fearsDoc = signalsRef.doc('fears');
      batch.set(
        fearsDoc,
        {
          items: FieldValue.arrayUnion(...signals.fears),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.fears = signals.fears.length;
    }

    if (signals.growthMarkers?.length) {
      const growthDoc = signalsRef.doc('growth_markers');
      batch.set(
        growthDoc,
        {
          items: FieldValue.arrayUnion(...signals.growthMarkers),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.growthMarkers = signals.growthMarkers.length;
    }

    if (signals.challenges?.length) {
      const challengesDoc = signalsRef.doc('challenges');
      batch.set(
        challengesDoc,
        {
          items: FieldValue.arrayUnion(...signals.challenges),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.challenges = signals.challenges.length;
    }

    if (signals.comfortPatterns?.length) {
      const comfortDoc = signalsRef.doc('comfort_patterns');
      batch.set(
        comfortDoc,
        {
          items: FieldValue.arrayUnion(...signals.comfortPatterns),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.comfortPatterns = signals.comfortPatterns.length;
    }

    if (signals.stressTriggers?.length) {
      const stressDoc = signalsRef.doc('stress_triggers');
      batch.set(
        stressDoc,
        {
          items: FieldValue.arrayUnion(...signals.stressTriggers),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.stressTriggers = signals.stressTriggers.length;
    }

    if (signals.avoidances?.length) {
      const avoidancesDoc = signalsRef.doc('avoidances');
      batch.set(
        avoidancesDoc,
        {
          items: FieldValue.arrayUnion(...signals.avoidances),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.avoidances = signals.avoidances.length;
    }

    if (signals.insideJokes?.length) {
      const jokesDoc = signalsRef.doc('inside_jokes');
      batch.set(
        jokesDoc,
        {
          items: FieldValue.arrayUnion(...signals.insideJokes),
          lastUpdated: now,
          sessionId: options?.sessionId,
        },
        { merge: true }
      );
      result.persisted.insideJokes = signals.insideJokes.length;
    }

    // Commit batch
    await batch.commit();

    result.success = true;

    const totalPersisted = Object.values(result.persisted).reduce((a, b) => a + b, 0);
    if (totalPersisted > 0) {
      log.info(
        {
          userId,
          ...result.persisted,
          total: totalPersisted,
        },
        '💾 Human signals persisted'
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(errorMessage);
    log.error({ userId, error: errorMessage }, 'Failed to persist human signals');
  }

  return result;
}

/**
 * Retrieve persisted human signals for a user
 */
export async function getPersistedHumanSignals(userId: string): Promise<Partial<HumanSignals>> {
  const db = getFirestore();
  const signalsRef = db.collection('bogle_users').doc(userId).collection('human_signals');

  try {
    const [
      datesDoc,
      valuesDoc,
      dreamsDoc,
      fearsDoc,
      growthDoc,
      challengesDoc,
      comfortDoc,
      stressDoc,
      avoidancesDoc,
      jokesDoc,
    ] = await Promise.all([
      signalsRef.doc('important_dates').get(),
      signalsRef.doc('values').get(),
      signalsRef.doc('dreams').get(),
      signalsRef.doc('fears').get(),
      signalsRef.doc('growth_markers').get(),
      signalsRef.doc('challenges').get(),
      signalsRef.doc('comfort_patterns').get(),
      signalsRef.doc('stress_triggers').get(),
      signalsRef.doc('avoidances').get(),
      signalsRef.doc('inside_jokes').get(),
    ]);

    return {
      importantDates: (datesDoc.data()?.items as ImportantDate[]) ?? [],
      values: (valuesDoc.data()?.items as CoreValue[]) ?? [],
      dreams: (dreamsDoc.data()?.items as Dream[]) ?? [],
      fears: (fearsDoc.data()?.items as Fear[]) ?? [],
      growthMarkers: (growthDoc.data()?.items as GrowthMarker[]) ?? [],
      challenges: (challengesDoc.data()?.items as ChallengeProgress[]) ?? [],
      comfortPatterns: (comfortDoc.data()?.items as ComfortPattern[]) ?? [],
      stressTriggers: (stressDoc.data()?.items as StressTrigger[]) ?? [],
      avoidances: (avoidancesDoc.data()?.items as RecurringAvoidance[]) ?? [],
      insideJokes: (jokesDoc.data()?.items as InsideJoke[]) ?? [],
    };
  } catch (error) {
    log.error({ userId, error: String(error) }, 'Failed to retrieve human signals');
    return {};
  }
}

/**
 * Check if user has any persisted human signals
 */
export async function hasPersistedSignals(userId: string): Promise<boolean> {
  const db = getFirestore();
  const signalsRef = db.collection('bogle_users').doc(userId).collection('human_signals');

  try {
    const snapshot = await signalsRef.limit(1).get();
    return !snapshot.empty;
  } catch {
    return false;
  }
}

export default {
  persistHumanSignals,
  getPersistedHumanSignals,
  hasPersistedSignals,
};
