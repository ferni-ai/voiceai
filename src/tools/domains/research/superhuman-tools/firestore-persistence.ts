/**
 * Firestore Persistence for Superhuman Tools
 *
 * Integrates with the existing Firestore infrastructure for production.
 * Falls back to in-memory storage when Firestore is unavailable.
 *
 * Schema:
 * - bogle_users/{userId}/superhuman/decisions          → DecisionRecord[]
 * - bogle_users/{userId}/superhuman/sleep              → SleepData[]
 * - bogle_users/{userId}/superhuman/energy             → EnergyData[]
 * - bogle_users/{userId}/superhuman/performance        → PeakPerformanceProfile
 * - bogle_users/{userId}/superhuman/claims             → VerifiedClaim[]
 * - bogle_users/{userId}/superhuman/goals              → GoalProgress[]
 * - bogle_users/{userId}/superhuman/habits             → HabitRecord[]
 * - bogle_users/{userId}/superhuman/experiments        → PersonalExperiment[]
 * - bogle_users/{userId}/superhuman/beliefs            → BeliefTracker[]
 * - bogle_users/{userId}/superhuman/hypotheses         → Hypothesis[]
 * - bogle_users/{userId}/superhuman/spending           → SpendingRecord[]
 * - bogle_users/{userId}/superhuman/relationships      → Relationship[]
 * - bogle_users/{userId}/superhuman/interactions       → Interaction[]
 *
 * @module tools/domains/research/superhuman-tools/firestore-persistence
 */

import { getLogger } from '../../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../../utils/firestore-utils.js';
import { getFirestoreDb } from '../../../../services/superhuman/firestore-utils.js';
import type { Firestore } from '@google-cloud/firestore';
import type {
  DecisionRecord,
  PeakPerformanceProfile,
  GoalProgress,
  PersonalExperiment,
  BeliefTracker,
  Hypothesis,
  SpendingRecord,
  Relationship,
  Interaction,
} from './types.js';

const log = getLogger();

// ============================================================================
// FIRESTORE SINGLETON
// ============================================================================

interface FirestoreDocument {
  [key: string]: unknown;
}

interface FirestoreDB {
  collection: (path: string) => {
    doc: (id: string) => {
      get: () => Promise<{ exists: boolean; data: () => FirestoreDocument | undefined }>;
      set: (data: FirestoreDocument, options?: { merge?: boolean }) => Promise<void>;
      update: (data: Partial<FirestoreDocument>) => Promise<void>;
      delete: () => Promise<void>;
      collection: (subPath: string) => {
        doc: (subId: string) => {
          get: () => Promise<{ exists: boolean; data: () => FirestoreDocument | undefined }>;
          set: (data: FirestoreDocument, options?: { merge?: boolean }) => Promise<void>;
        };
        get: () => Promise<{
          docs: Array<{ id: string; data: () => FirestoreDocument }>;
        }>;
        add: (data: FirestoreDocument) => Promise<{ id: string }>;
      };
    };
    where: (
      field: string,
      op: string,
      value: unknown
    ) => {
      orderBy: (
        field: string,
        dir?: 'asc' | 'desc'
      ) => {
        limit: (n: number) => {
          get: () => Promise<{
            docs: Array<{ id: string; data: () => FirestoreDocument }>;
          }>;
        };
        get: () => Promise<{
          docs: Array<{ id: string; data: () => FirestoreDocument }>;
        }>;
      };
      get: () => Promise<{
        docs: Array<{ id: string; data: () => FirestoreDocument }>;
      }>;
    };
    get: () => Promise<{
      docs: Array<{ id: string; data: () => FirestoreDocument }>;
    }>;
    add: (data: FirestoreDocument) => Promise<{ id: string }>;
  };
}

let firestoreInstance: FirestoreDB | null = null;
let useRealFirestore = false;

/**
 * Get the Firestore instance (real or in-memory fallback).
 * Prefers real Firestore when available.
 */
async function getFirestore(): Promise<FirestoreDB> {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  // Try to use real Firestore first
  const realDb = getFirestoreDb();
  if (realDb) {
    log.info('Using real Firestore for superhuman tools');
    useRealFirestore = true;
    firestoreInstance = wrapRealFirestore(realDb);
    return firestoreInstance;
  }

  // Fall back to in-memory storage
  log.debug('Firestore not available, using in-memory storage for superhuman tools');
  useRealFirestore = false;
  firestoreInstance = createInMemoryFallback();
  return firestoreInstance;
}

/**
 * Wrap the real Firestore instance with our interface
 */
function wrapRealFirestore(db: Firestore): FirestoreDB {
  return {
    collection: (path: string) => {
      const collRef = db.collection(path);
      return {
        doc: (id: string) => {
          const docRef = collRef.doc(id);
          return {
            get: async () => {
              const snap = await docRef.get();
              return {
                exists: snap.exists,
                data: () => snap.data() as FirestoreDocument | undefined,
              };
            },
            set: async (data: FirestoreDocument, options?: { merge?: boolean }) => {
              if (options) {
                await docRef.set(cleanForFirestore(data), options);
              } else {
                await docRef.set(cleanForFirestore(data));
              }
            },
            update: async (data: Partial<FirestoreDocument>) => {
              await docRef.update(cleanForFirestore(data));
            },
            delete: async () => {
              await docRef.delete();
            },
            collection: (subPath: string) => {
              const subCollRef = docRef.collection(subPath);
              return {
                doc: (subId: string) => {
                  const subDocRef = subCollRef.doc(subId);
                  return {
                    get: async () => {
                      const snap = await subDocRef.get();
                      return {
                        exists: snap.exists,
                        data: () => snap.data() as FirestoreDocument | undefined,
                      };
                    },
                    set: async (data: FirestoreDocument, options?: { merge?: boolean }) => {
                      if (options) {
                        await subDocRef.set(cleanForFirestore(data), options);
                      } else {
                        await subDocRef.set(cleanForFirestore(data));
                      }
                    },
                  };
                },
                get: async () => {
                  const snap = await subCollRef.get();
                  return {
                    docs: snap.docs.map((d) => ({
                      id: d.id,
                      data: () => d.data() as FirestoreDocument,
                    })),
                  };
                },
                add: async (data: FirestoreDocument) => {
                  const docRef = await subCollRef.add(cleanForFirestore(data));
                  return { id: docRef.id };
                },
              };
            },
          };
        },
        where: (field: string, op: string, value: unknown) => {
          const query = collRef.where(field, op as FirebaseFirestore.WhereFilterOp, value);
          return {
            orderBy: (orderField: string, dir?: 'asc' | 'desc') => {
              const ordered = query.orderBy(orderField, dir);
              return {
                limit: (n: number) => {
                  const limited = ordered.limit(n);
                  return {
                    get: async () => {
                      const snap = await limited.get();
                      return {
                        docs: snap.docs.map((d) => ({
                          id: d.id,
                          data: () => d.data() as FirestoreDocument,
                        })),
                      };
                    },
                  };
                },
                get: async () => {
                  const snap = await ordered.get();
                  return {
                    docs: snap.docs.map((d) => ({
                      id: d.id,
                      data: () => d.data() as FirestoreDocument,
                    })),
                  };
                },
              };
            },
            get: async () => {
              const snap = await query.get();
              return {
                docs: snap.docs.map((d) => ({
                  id: d.id,
                  data: () => d.data() as FirestoreDocument,
                })),
              };
            },
          };
        },
        get: async () => {
          const snap = await collRef.get();
          return {
            docs: snap.docs.map((d) => ({
              id: d.id,
              data: () => d.data() as FirestoreDocument,
            })),
          };
        },
        add: async (data: FirestoreDocument) => {
          const docRef = await collRef.add(cleanForFirestore(data));
          return { id: docRef.id };
        },
      };
    },
  };
}

// ============================================================================
// IN-MEMORY FALLBACK (for testing and development)
// ============================================================================

function createInMemoryFallback(): FirestoreDB {
  const store = new Map<string, Map<string, FirestoreDocument>>();

  function getOrCreateCollection(path: string): Map<string, FirestoreDocument> {
    if (!store.has(path)) {
      store.set(path, new Map());
    }
    return store.get(path)!;
  }

  const createDocRef = (
    collPath: string,
    docId: string
  ): ReturnType<ReturnType<FirestoreDB['collection']>['doc']> => ({
    get: async () => {
      const coll = getOrCreateCollection(collPath);
      const doc = coll.get(docId);
      return {
        exists: !!doc,
        data: () => doc,
      };
    },
    set: async (data: FirestoreDocument, options?: { merge?: boolean }) => {
      const coll = getOrCreateCollection(collPath);
      if (options?.merge) {
        const existing = coll.get(docId) || {};
        coll.set(docId, { ...existing, ...data });
      } else {
        coll.set(docId, data);
      }
    },
    update: async (data: Partial<FirestoreDocument>) => {
      const coll = getOrCreateCollection(collPath);
      const existing = coll.get(docId) || {};
      coll.set(docId, { ...existing, ...data });
    },
    delete: async () => {
      const coll = getOrCreateCollection(collPath);
      coll.delete(docId);
    },
    collection: (subPath: string) => createCollectionRef(`${collPath}/${docId}/${subPath}`),
  });

  const createCollectionRef = (
    path: string
  ): ReturnType<FirestoreDB['collection']>['doc'] extends (id: string) => infer R
    ? { doc: (id: string) => R } & Omit<ReturnType<FirestoreDB['collection']>, 'doc'>
    : never => {
    const collRef = {
      doc: (id: string) => createDocRef(path, id),
      where: (_field: string, _op: string, _value: unknown) => ({
        orderBy: (_orderField: string, _dir?: 'asc' | 'desc') => ({
          limit: (_n: number) => ({
            get: async () => {
              const coll = getOrCreateCollection(path);
              return {
                docs: Array.from(coll.entries()).map(([id, data]) => ({
                  id,
                  data: () => data,
                })),
              };
            },
          }),
          get: async () => {
            const coll = getOrCreateCollection(path);
            return {
              docs: Array.from(coll.entries()).map(([id, data]) => ({
                id,
                data: () => data,
              })),
            };
          },
        }),
        get: async () => {
          const coll = getOrCreateCollection(path);
          return {
            docs: Array.from(coll.entries()).map(([id, data]) => ({
              id,
              data: () => data,
            })),
          };
        },
      }),
      get: async () => {
        const coll = getOrCreateCollection(path);
        return {
          docs: Array.from(coll.entries()).map(([id, data]) => ({
            id,
            data: () => data,
          })),
        };
      },
      add: async (data: FirestoreDocument) => {
        const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const coll = getOrCreateCollection(path);
        coll.set(id, { ...data, id });
        return { id };
      },
    };
    return collRef as ReturnType<typeof createCollectionRef>;
  };

  return {
    collection: (path: string) =>
      createCollectionRef(path) as unknown as ReturnType<FirestoreDB['collection']>,
  };
}

// ============================================================================
// N=1 ANALYTICS PERSISTENCE
// ============================================================================

export async function saveDecision(userId: string, decision: DecisionRecord): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('n1_analytics')
    .doc('decisions');
  const snapshot = await docRef.get();
  const existing: DecisionRecord[] = snapshot.exists
    ? (snapshot.data()?.records as DecisionRecord[]) || []
    : [];
  existing.push(cleanForFirestore(decision) as unknown as DecisionRecord);
  await docRef.set({ records: existing, updatedAt: new Date() });
}

export async function loadDecisions(userId: string): Promise<DecisionRecord[]> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('n1_analytics')
    .doc('decisions');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as DecisionRecord[]) || [];
}

export async function updateDecision(
  userId: string,
  decisionId: string,
  update: Partial<DecisionRecord>
): Promise<void> {
  const decisions = await loadDecisions(userId);
  const index = decisions.findIndex((d) => d.id === decisionId);
  if (index >= 0) {
    decisions[index] = { ...decisions[index], ...update };
    const db = await getFirestore();
    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('n1_analytics')
      .doc('decisions');
    await docRef.set({ records: decisions, updatedAt: new Date() });
  }
}

export interface SleepData {
  date: Date;
  hours: number;
  quality: number;
}

export async function saveSleepData(userId: string, data: SleepData): Promise<void> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('sleep');
  const snapshot = await docRef.get();
  const existing: SleepData[] = snapshot.exists
    ? (snapshot.data()?.records as SleepData[]) || []
    : [];
  existing.push(cleanForFirestore(data) as unknown as SleepData);
  // Keep last 365 days
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const filtered = existing.filter((s) => new Date(s.date) > oneYearAgo);
  await docRef.set({ records: filtered, updatedAt: new Date() });
}

export async function loadSleepData(userId: string): Promise<SleepData[]> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('sleep');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as SleepData[]) || [];
}

export interface EnergyData {
  date: Date;
  hour: number;
  level: number;
}

export async function saveEnergyData(userId: string, data: EnergyData): Promise<void> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('energy');
  const snapshot = await docRef.get();
  const existing: EnergyData[] = snapshot.exists
    ? (snapshot.data()?.records as EnergyData[]) || []
    : [];
  existing.push(cleanForFirestore(data) as unknown as EnergyData);
  // Keep last 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const filtered = existing.filter((e) => new Date(e.date) > ninetyDaysAgo);
  await docRef.set({ records: filtered, updatedAt: new Date() });
}

export async function loadEnergyData(userId: string): Promise<EnergyData[]> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('energy');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as EnergyData[]) || [];
}

export async function savePerformanceProfile(
  userId: string,
  profile: PeakPerformanceProfile
): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('n1_analytics')
    .doc('performance');
  await docRef.set(cleanForFirestore({ ...profile, updatedAt: new Date() }) as FirestoreDocument);
}

export async function loadPerformanceProfile(
  userId: string
): Promise<PeakPerformanceProfile | null> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('n1_analytics')
    .doc('performance');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return null;
  return snapshot.data() as unknown as PeakPerformanceProfile;
}

// ============================================================================
// PREDICTIVE MODELING PERSISTENCE
// ============================================================================

export async function saveGoalProgress(userId: string, goal: GoalProgress): Promise<void> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('goals');
  const snapshot = await docRef.get();
  const existing: GoalProgress[] = snapshot.exists
    ? (snapshot.data()?.records as GoalProgress[]) || []
    : [];
  const index = existing.findIndex((g) => g.goalId === goal.goalId);
  if (index >= 0) {
    existing[index] = goal;
  } else {
    existing.push(goal);
  }
  await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}

export async function loadGoalProgress(userId: string, goalId?: string): Promise<GoalProgress[]> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('goals');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  const records = (snapshot.data()?.records as GoalProgress[]) || [];
  return goalId ? records.filter((g) => g.goalId === goalId) : records;
}

export interface HabitRecord {
  id: string;
  name: string;
  type: string;
  startDate: Date;
  streak: number;
  longestStreak: number;
  completions: Date[];
  breaks: { date: Date; reason?: string }[];
  status: 'active' | 'abandoned' | 'completed';
}

export async function saveHabit(userId: string, habit: HabitRecord): Promise<void> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('habits');
  const snapshot = await docRef.get();
  const existing: HabitRecord[] = snapshot.exists
    ? (snapshot.data()?.records as HabitRecord[]) || []
    : [];
  const index = existing.findIndex((h) => h.id === habit.id);
  if (index >= 0) {
    existing[index] = habit;
  } else {
    existing.push(habit);
  }
  await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}

export async function loadHabits(userId: string): Promise<HabitRecord[]> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('habits');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as HabitRecord[]) || [];
}

// ============================================================================
// EXPERIMENTATION PERSISTENCE
// ============================================================================

export async function saveExperiment(
  userId: string,
  experiment: PersonalExperiment
): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('experimentation')
    .doc('experiments');
  const snapshot = await docRef.get();
  const existing: PersonalExperiment[] = snapshot.exists
    ? (snapshot.data()?.records as PersonalExperiment[]) || []
    : [];
  const index = existing.findIndex((e) => e.id === experiment.id);
  if (index >= 0) {
    existing[index] = experiment;
  } else {
    existing.push(experiment);
  }
  await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}

export async function loadExperiments(userId: string): Promise<PersonalExperiment[]> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('experimentation')
    .doc('experiments');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as PersonalExperiment[]) || [];
}

export async function saveBelief(userId: string, belief: BeliefTracker): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('experimentation')
    .doc('beliefs');
  const snapshot = await docRef.get();
  const existing: BeliefTracker[] = snapshot.exists
    ? (snapshot.data()?.records as BeliefTracker[]) || []
    : [];
  const index = existing.findIndex((b) => b.beliefId === belief.beliefId);
  if (index >= 0) {
    existing[index] = belief;
  } else {
    existing.push(belief);
  }
  await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}

export async function loadBeliefs(userId: string): Promise<BeliefTracker[]> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('experimentation')
    .doc('beliefs');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as BeliefTracker[]) || [];
}

export async function saveHypothesis(userId: string, hypothesis: Hypothesis): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('experimentation')
    .doc('hypotheses');
  const snapshot = await docRef.get();
  const existing: Hypothesis[] = snapshot.exists
    ? (snapshot.data()?.records as Hypothesis[]) || []
    : [];
  const index = existing.findIndex((h) => h.id === hypothesis.id);
  if (index >= 0) {
    existing[index] = hypothesis;
  } else {
    existing.push(hypothesis);
  }
  await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}

export async function loadHypotheses(userId: string): Promise<Hypothesis[]> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('experimentation')
    .doc('hypotheses');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as Hypothesis[]) || [];
}

// ============================================================================
// EXTERNAL DATA PERSISTENCE
// ============================================================================

export async function saveSpendingRecord(userId: string, record: SpendingRecord): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('external_data')
    .doc('spending');
  const snapshot = await docRef.get();
  const existing: SpendingRecord[] = snapshot.exists
    ? (snapshot.data()?.records as SpendingRecord[]) || []
    : [];
  existing.push(cleanForFirestore(record) as unknown as SpendingRecord);
  // Keep last 2 years
  const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
  const filtered = existing.filter((s) => new Date(s.date) > twoYearsAgo);
  await docRef.set({ records: filtered, updatedAt: new Date() });
}

export async function loadSpendingRecords(userId: string): Promise<SpendingRecord[]> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('external_data')
    .doc('spending');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as SpendingRecord[]) || [];
}

// ============================================================================
// NETWORK ANALYTICS PERSISTENCE
// ============================================================================

export async function saveRelationship(userId: string, relationship: Relationship): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('network')
    .doc('relationships');
  const snapshot = await docRef.get();
  const existing: Relationship[] = snapshot.exists
    ? (snapshot.data()?.records as Relationship[]) || []
    : [];
  const index = existing.findIndex((r) => r.id === relationship.id);
  if (index >= 0) {
    existing[index] = relationship;
  } else {
    existing.push(relationship);
  }
  await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}

export async function loadRelationships(userId: string): Promise<Relationship[]> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('network')
    .doc('relationships');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as Relationship[]) || [];
}

export async function saveInteraction(userId: string, interaction: Interaction): Promise<void> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('network').doc('interactions');
  const snapshot = await docRef.get();
  const existing: Interaction[] = snapshot.exists
    ? (snapshot.data()?.records as Interaction[]) || []
    : [];
  existing.push(cleanForFirestore(interaction) as unknown as Interaction);
  // Keep last year of interactions
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  const filtered = existing.filter((i) => new Date(i.date) > oneYearAgo);
  await docRef.set({ records: filtered, updatedAt: new Date() });
}

export async function loadInteractions(userId: string): Promise<Interaction[]> {
  const db = await getFirestore();
  const docRef = db.collection('bogle_users').doc(userId).collection('network').doc('interactions');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as Interaction[]) || [];
}

// ============================================================================
// RESEARCH CLAIMS PERSISTENCE
// ============================================================================

export interface VerifiedClaim {
  claim: string;
  verdict: 'verified' | 'partially_true' | 'misleading' | 'false' | 'unverifiable';
  confidence: number;
  verifiedAt: Date;
  sources: string[];
}

export async function saveVerifiedClaim(userId: string, claim: VerifiedClaim): Promise<void> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('research_synthesis')
    .doc('claims');
  const snapshot = await docRef.get();
  const existing: VerifiedClaim[] = snapshot.exists
    ? (snapshot.data()?.records as VerifiedClaim[]) || []
    : [];
  existing.push(cleanForFirestore(claim) as unknown as VerifiedClaim);
  // Keep last 100 claims
  const limited = existing.slice(-100);
  await docRef.set({ records: limited, updatedAt: new Date() });
}

export async function loadVerifiedClaims(userId: string): Promise<VerifiedClaim[]> {
  const db = await getFirestore();
  const docRef = db
    .collection('bogle_users')
    .doc(userId)
    .collection('research_synthesis')
    .doc('claims');
  const snapshot = await docRef.get();
  if (!snapshot.exists) return [];
  return (snapshot.data()?.records as VerifiedClaim[]) || [];
}

// ============================================================================
// CONTEXT HELPER (Production-Ready)
// ============================================================================

/**
 * Extract userId from LiveKit agent context
 *
 * The context structure in LiveKit agents:
 * - ctx.session.userData.userId - Primary location
 * - ctx.room.name - Fallback (room name often contains userId)
 * - ctx.userId - Direct property (from ToolContext)
 */
export function getUserIdFromContext(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== 'object') return null;

  const ctxObj = ctx as Record<string, unknown>;

  // Check direct userId property (ToolContext pattern)
  if ('userId' in ctxObj && typeof ctxObj.userId === 'string' && ctxObj.userId) {
    return ctxObj.userId;
  }

  // Check session.userData.userId (LiveKit Agent pattern)
  if ('session' in ctxObj && ctxObj.session && typeof ctxObj.session === 'object') {
    const session = ctxObj.session as Record<string, unknown>;
    if ('userData' in session && session.userData && typeof session.userData === 'object') {
      const userData = session.userData as Record<string, unknown>;
      if ('userId' in userData && typeof userData.userId === 'string' && userData.userId) {
        return userData.userId;
      }
    }
  }

  // Check room.name as fallback
  if ('room' in ctxObj && ctxObj.room && typeof ctxObj.room === 'object') {
    const room = ctxObj.room as Record<string, unknown>;
    if ('name' in room && typeof room.name === 'string' && room.name) {
      return room.name;
    }
  }

  return null;
}

/**
 * Get sessionId from context
 */
export function getSessionIdFromContext(ctx: unknown): string | null {
  if (!ctx || typeof ctx !== 'object') return null;

  const ctxObj = ctx as Record<string, unknown>;

  // Check direct sessionId property
  if ('sessionId' in ctxObj && typeof ctxObj.sessionId === 'string') {
    return ctxObj.sessionId;
  }

  // Check session.userData.services.sessionId
  if ('session' in ctxObj && ctxObj.session && typeof ctxObj.session === 'object') {
    const session = ctxObj.session as Record<string, unknown>;
    if ('userData' in session && session.userData && typeof session.userData === 'object') {
      const userData = session.userData as Record<string, unknown>;
      if ('services' in userData && userData.services && typeof userData.services === 'object') {
        const services = userData.services as Record<string, unknown>;
        if ('sessionId' in services && typeof services.sessionId === 'string') {
          return services.sessionId;
        }
      }
    }
  }

  return null;
}
