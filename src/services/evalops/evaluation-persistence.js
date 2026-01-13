/**
 * EvalOps Evaluation Persistence
 *
 * Persists evaluations so EvalOps is not "in-memory only".
 *
 * Design goals:
 * - Non-blocking: persistence failures must not break conversations
 * - Optional: works even when Firebase isn't configured (dev/local)
 * - Queryable: admin dashboard/API can fetch recent/flagged evaluations
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'EvalOpsPersistence' });
function isFirestoreEnabled() {
    return process.env.EVALOPS_FIRESTORE_ENABLED === 'true';
}
export async function persistEvaluation(evaluation) {
    if (!isFirestoreEnabled())
        return;
    try {
        const db = getFirestore();
        const ref = db.collection('evalops_evaluations').doc(evaluation.id);
        await ref.set(cleanForFirestore({
            ...evaluation,
            // Normalize Date for consistent ordering/queries
            timestampMs: evaluation.timestamp.getTime(),
            createdAt: FieldValue.serverTimestamp(),
        }), { merge: true });
    }
    catch (error) {
        log.warn({ error, evaluationId: evaluation.id }, 'Failed to persist EvalOps evaluation');
    }
}
export async function fetchRecentEvaluations(limit, filters) {
    if (!isFirestoreEnabled())
        return [];
    try {
        const db = getFirestore();
        // Start with collection, then apply filters (which returns Query)
        const collection = db.collection('evalops_evaluations');
        // Build query with filters - using type assertion since Query is a superset
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let query = collection;
        if (filters?.personaId) {
            query = query.where('personaId', '==', filters.personaId);
        }
        if (filters?.flagged !== undefined) {
            query = query.where('flagged', '==', filters.flagged);
        }
        // Use timestampMs for ordering (stable even if serverTimestamp isn't present yet)
        const snapshot = await query.orderBy('timestampMs', 'desc').limit(limit).get();
        return snapshot.docs
            .map((d) => d.data())
            .map((raw) => ({
            ...raw,
            timestamp: raw.timestamp instanceof Date
                ? raw.timestamp
                : new Date(raw.timestampMs ?? 0),
        }));
    }
    catch (error) {
        log.warn({ error }, 'Failed to fetch EvalOps evaluations from Firestore');
        return [];
    }
}
//# sourceMappingURL=evaluation-persistence.js.map