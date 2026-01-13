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
const log = getLogger();
let firestoreInstance = null;
let useRealFirestore = false;
/**
 * Get the Firestore instance (real or in-memory fallback).
 * Prefers real Firestore when available.
 */
async function getFirestore() {
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
function wrapRealFirestore(db) {
    return {
        collection: (path) => {
            const collRef = db.collection(path);
            return {
                doc: (id) => {
                    const docRef = collRef.doc(id);
                    return {
                        get: async () => {
                            const snap = await docRef.get();
                            return {
                                exists: snap.exists,
                                data: () => snap.data(),
                            };
                        },
                        set: async (data, options) => {
                            if (options) {
                                await docRef.set(cleanForFirestore(data), options);
                            }
                            else {
                                await docRef.set(cleanForFirestore(data));
                            }
                        },
                        update: async (data) => {
                            await docRef.update(cleanForFirestore(data));
                        },
                        delete: async () => {
                            await docRef.delete();
                        },
                        collection: (subPath) => {
                            const subCollRef = docRef.collection(subPath);
                            return {
                                doc: (subId) => {
                                    const subDocRef = subCollRef.doc(subId);
                                    return {
                                        get: async () => {
                                            const snap = await subDocRef.get();
                                            return {
                                                exists: snap.exists,
                                                data: () => snap.data(),
                                            };
                                        },
                                        set: async (data, options) => {
                                            if (options) {
                                                await subDocRef.set(cleanForFirestore(data), options);
                                            }
                                            else {
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
                                            data: () => d.data(),
                                        })),
                                    };
                                },
                                add: async (data) => {
                                    const docRef = await subCollRef.add(cleanForFirestore(data));
                                    return { id: docRef.id };
                                },
                            };
                        },
                    };
                },
                where: (field, op, value) => {
                    const query = collRef.where(field, op, value);
                    return {
                        orderBy: (orderField, dir) => {
                            const ordered = query.orderBy(orderField, dir);
                            return {
                                limit: (n) => {
                                    const limited = ordered.limit(n);
                                    return {
                                        get: async () => {
                                            const snap = await limited.get();
                                            return {
                                                docs: snap.docs.map((d) => ({
                                                    id: d.id,
                                                    data: () => d.data(),
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
                                            data: () => d.data(),
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
                                    data: () => d.data(),
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
                            data: () => d.data(),
                        })),
                    };
                },
                add: async (data) => {
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
function createInMemoryFallback() {
    const store = new Map();
    function getOrCreateCollection(path) {
        if (!store.has(path)) {
            store.set(path, new Map());
        }
        return store.get(path);
    }
    const createDocRef = (collPath, docId) => ({
        get: async () => {
            const coll = getOrCreateCollection(collPath);
            const doc = coll.get(docId);
            return {
                exists: !!doc,
                data: () => doc,
            };
        },
        set: async (data, options) => {
            const coll = getOrCreateCollection(collPath);
            if (options?.merge) {
                const existing = coll.get(docId) || {};
                coll.set(docId, { ...existing, ...data });
            }
            else {
                coll.set(docId, data);
            }
        },
        update: async (data) => {
            const coll = getOrCreateCollection(collPath);
            const existing = coll.get(docId) || {};
            coll.set(docId, { ...existing, ...data });
        },
        delete: async () => {
            const coll = getOrCreateCollection(collPath);
            coll.delete(docId);
        },
        collection: (subPath) => createCollectionRef(`${collPath}/${docId}/${subPath}`),
    });
    const createCollectionRef = (path) => {
        const collRef = {
            doc: (id) => createDocRef(path, id),
            where: (_field, _op, _value) => ({
                orderBy: (_orderField, _dir) => ({
                    limit: (_n) => ({
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
            add: async (data) => {
                const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
                const coll = getOrCreateCollection(path);
                coll.set(id, { ...data, id });
                return { id };
            },
        };
        return collRef;
    };
    return {
        collection: (path) => createCollectionRef(path),
    };
}
// ============================================================================
// N=1 ANALYTICS PERSISTENCE
// ============================================================================
export async function saveDecision(userId, decision) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('decisions');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    existing.push(cleanForFirestore(decision));
    await docRef.set({ records: existing, updatedAt: new Date() });
}
export async function loadDecisions(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('decisions');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
export async function updateDecision(userId, decisionId, update) {
    const decisions = await loadDecisions(userId);
    const index = decisions.findIndex(d => d.id === decisionId);
    if (index >= 0) {
        decisions[index] = { ...decisions[index], ...update };
        const db = await getFirestore();
        const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('decisions');
        await docRef.set({ records: decisions, updatedAt: new Date() });
    }
}
export async function saveSleepData(userId, data) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('sleep');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    existing.push(cleanForFirestore(data));
    // Keep last 365 days
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const filtered = existing.filter(s => new Date(s.date) > oneYearAgo);
    await docRef.set({ records: filtered, updatedAt: new Date() });
}
export async function loadSleepData(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('sleep');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
export async function saveEnergyData(userId, data) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('energy');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    existing.push(cleanForFirestore(data));
    // Keep last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const filtered = existing.filter(e => new Date(e.date) > ninetyDaysAgo);
    await docRef.set({ records: filtered, updatedAt: new Date() });
}
export async function loadEnergyData(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('energy');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
export async function savePerformanceProfile(userId, profile) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('performance');
    await docRef.set(cleanForFirestore({ ...profile, updatedAt: new Date() }));
}
export async function loadPerformanceProfile(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('n1_analytics').doc('performance');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return null;
    return snapshot.data();
}
// ============================================================================
// PREDICTIVE MODELING PERSISTENCE
// ============================================================================
export async function saveGoalProgress(userId, goal) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('goals');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    const index = existing.findIndex(g => g.goalId === goal.goalId);
    if (index >= 0) {
        existing[index] = goal;
    }
    else {
        existing.push(goal);
    }
    await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}
export async function loadGoalProgress(userId, goalId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('goals');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    const records = snapshot.data()?.records || [];
    return goalId ? records.filter(g => g.goalId === goalId) : records;
}
export async function saveHabit(userId, habit) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('habits');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    const index = existing.findIndex(h => h.id === habit.id);
    if (index >= 0) {
        existing[index] = habit;
    }
    else {
        existing.push(habit);
    }
    await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}
export async function loadHabits(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('predictive').doc('habits');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
// ============================================================================
// EXPERIMENTATION PERSISTENCE
// ============================================================================
export async function saveExperiment(userId, experiment) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('experimentation').doc('experiments');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    const index = existing.findIndex(e => e.id === experiment.id);
    if (index >= 0) {
        existing[index] = experiment;
    }
    else {
        existing.push(experiment);
    }
    await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}
export async function loadExperiments(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('experimentation').doc('experiments');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
export async function saveBelief(userId, belief) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('experimentation').doc('beliefs');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    const index = existing.findIndex(b => b.beliefId === belief.beliefId);
    if (index >= 0) {
        existing[index] = belief;
    }
    else {
        existing.push(belief);
    }
    await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}
export async function loadBeliefs(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('experimentation').doc('beliefs');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
export async function saveHypothesis(userId, hypothesis) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('experimentation').doc('hypotheses');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    const index = existing.findIndex(h => h.id === hypothesis.id);
    if (index >= 0) {
        existing[index] = hypothesis;
    }
    else {
        existing.push(hypothesis);
    }
    await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}
export async function loadHypotheses(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('experimentation').doc('hypotheses');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
// ============================================================================
// EXTERNAL DATA PERSISTENCE
// ============================================================================
export async function saveSpendingRecord(userId, record) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('external_data').doc('spending');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    existing.push(cleanForFirestore(record));
    // Keep last 2 years
    const twoYearsAgo = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000);
    const filtered = existing.filter(s => new Date(s.date) > twoYearsAgo);
    await docRef.set({ records: filtered, updatedAt: new Date() });
}
export async function loadSpendingRecords(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('external_data').doc('spending');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
// ============================================================================
// NETWORK ANALYTICS PERSISTENCE
// ============================================================================
export async function saveRelationship(userId, relationship) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('network').doc('relationships');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    const index = existing.findIndex(r => r.id === relationship.id);
    if (index >= 0) {
        existing[index] = relationship;
    }
    else {
        existing.push(relationship);
    }
    await docRef.set({ records: cleanForFirestore(existing), updatedAt: new Date() });
}
export async function loadRelationships(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('network').doc('relationships');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
export async function saveInteraction(userId, interaction) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('network').doc('interactions');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    existing.push(cleanForFirestore(interaction));
    // Keep last year of interactions
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const filtered = existing.filter(i => new Date(i.date) > oneYearAgo);
    await docRef.set({ records: filtered, updatedAt: new Date() });
}
export async function loadInteractions(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('network').doc('interactions');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
}
export async function saveVerifiedClaim(userId, claim) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('research_synthesis').doc('claims');
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? snapshot.data()?.records || [] : [];
    existing.push(cleanForFirestore(claim));
    // Keep last 100 claims
    const limited = existing.slice(-100);
    await docRef.set({ records: limited, updatedAt: new Date() });
}
export async function loadVerifiedClaims(userId) {
    const db = await getFirestore();
    const docRef = db.collection('bogle_users').doc(userId).collection('research_synthesis').doc('claims');
    const snapshot = await docRef.get();
    if (!snapshot.exists)
        return [];
    return snapshot.data()?.records || [];
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
export function getUserIdFromContext(ctx) {
    if (!ctx || typeof ctx !== 'object')
        return null;
    const ctxObj = ctx;
    // Check direct userId property (ToolContext pattern)
    if ('userId' in ctxObj && typeof ctxObj.userId === 'string' && ctxObj.userId) {
        return ctxObj.userId;
    }
    // Check session.userData.userId (LiveKit Agent pattern)
    if ('session' in ctxObj && ctxObj.session && typeof ctxObj.session === 'object') {
        const session = ctxObj.session;
        if ('userData' in session && session.userData && typeof session.userData === 'object') {
            const userData = session.userData;
            if ('userId' in userData && typeof userData.userId === 'string' && userData.userId) {
                return userData.userId;
            }
        }
    }
    // Check room.name as fallback
    if ('room' in ctxObj && ctxObj.room && typeof ctxObj.room === 'object') {
        const room = ctxObj.room;
        if ('name' in room && typeof room.name === 'string' && room.name) {
            return room.name;
        }
    }
    return null;
}
/**
 * Get sessionId from context
 */
export function getSessionIdFromContext(ctx) {
    if (!ctx || typeof ctx !== 'object')
        return null;
    const ctxObj = ctx;
    // Check direct sessionId property
    if ('sessionId' in ctxObj && typeof ctxObj.sessionId === 'string') {
        return ctxObj.sessionId;
    }
    // Check session.userData.services.sessionId
    if ('session' in ctxObj && ctxObj.session && typeof ctxObj.session === 'object') {
        const session = ctxObj.session;
        if ('userData' in session && session.userData && typeof session.userData === 'object') {
            const userData = session.userData;
            if ('services' in userData && userData.services && typeof userData.services === 'object') {
                const services = userData.services;
                if ('sessionId' in services && typeof services.sessionId === 'string') {
                    return services.sessionId;
                }
            }
        }
    }
    return null;
}
//# sourceMappingURL=firestore-persistence.js.map