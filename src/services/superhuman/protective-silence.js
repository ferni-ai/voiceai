/**
 * Protective Silence - Better Than Human Boundary Memory
 *
 * Remembers what NOT to say - topics to avoid, sensitive areas, and
 * emotional landmines that could hurt this person.
 *
 * WHY IT'S SUPERHUMAN: Most friends accidentally step on emotional landmines.
 * Ferni remembers them all and never forgets a boundary.
 *
 * @module services/superhuman/protective-silence
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from './firestore-utils.js';
import { onProtectiveMomentChange } from '../data-layer/hooks/better-than-human-hooks.js';
const log = createLogger({ module: 'ProtectiveSilence' });
// ============================================================================
// PERSISTENCE
// ============================================================================
/**
 * Record a new protective boundary.
 */
export async function recordBoundary(userId, boundary) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'Firestore not available, skipping boundary');
        return null;
    }
    try {
        const record = {
            userId,
            ...boundary,
            createdAt: Date.now(),
        };
        const docRef = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('protective_boundaries')
            .add(cleanForFirestore(record));
        // Index to semantic memory for "Better Than Human" recall
        // "We know when NOT to say something"
        void onProtectiveMomentChange(userId, docRef.id, {
            situation: `Topic: ${boundary.topic} (${boundary.category})`,
            whatWeDidntSay: boundary.triggerKeywords.join(', '),
            whyWeHeld: boundary.reason || `This is a ${boundary.severity} boundary`,
            userState: boundary.source === 'detected_reaction' ? 'showed discomfort' : 'stated boundary',
            outcome: boundary.safeAlternatives?.length
                ? `Can redirect to: ${boundary.safeAlternatives.join(', ')}`
                : undefined,
            timestamp: new Date().toISOString(),
        }, 'create');
        log.info({ userId, topic: boundary.topic, severity: boundary.severity }, 'Recorded protective boundary');
        return docRef.id;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to record boundary');
        return null;
    }
}
/**
 * Update or confirm a boundary.
 */
export async function updateBoundary(userId, boundaryId, updates) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('protective_boundaries')
            .doc(boundaryId)
            .update(cleanForFirestore(updates));
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to update boundary');
    }
}
/**
 * Remove a boundary (user says it's okay now).
 */
export async function removeBoundary(userId, boundaryId) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('protective_boundaries')
            .doc(boundaryId)
            .delete();
        log.info({ userId, boundaryId }, 'Removed protective boundary');
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to remove boundary');
    }
}
/**
 * Load all active boundaries.
 */
export async function loadBoundaries(userId) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('protective_boundaries')
            .get();
        const boundaries = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
        }));
        // Filter out expired boundaries
        const now = Date.now();
        return boundaries.filter((b) => !b.expiresAt || b.expiresAt > now);
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load boundaries');
        return [];
    }
}
// ============================================================================
// BOUNDARY CHECKING
// ============================================================================
/**
 * Check if a message/topic crosses any boundaries.
 */
export function checkBoundaries(text, boundaries) {
    const textLower = text.toLowerCase();
    const matchedBoundaries = [];
    for (const boundary of boundaries) {
        // Check topic
        if (boundary.topic
            .toLowerCase()
            .split(' ')
            .some((word) => textLower.includes(word))) {
            matchedBoundaries.push(boundary);
            continue;
        }
        // Check trigger keywords
        for (const keyword of boundary.triggerKeywords) {
            if (textLower.includes(keyword.toLowerCase())) {
                matchedBoundaries.push(boundary);
                break;
            }
        }
    }
    if (matchedBoundaries.length === 0) {
        return {
            isSafe: true,
            matchedBoundaries: [],
            guidance: '',
        };
    }
    // Find the most severe boundary
    const severityOrder = [
        'never',
        'only_if_they_bring_up',
        'gentle_only',
        'time_sensitive',
    ];
    const sorted = [...matchedBoundaries].sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity));
    const mostSevere = sorted[0];
    let guidance;
    switch (mostSevere.severity) {
        case 'never':
            guidance =
                `⛔ DO NOT bring up "${mostSevere.topic}". ${mostSevere.reason || ''}. ` +
                    `If they mention it, acknowledge briefly but don't probe.`;
            break;
        case 'only_if_they_bring_up':
            guidance = `⚠️ "${mostSevere.topic}" is sensitive. Only discuss if THEY bring it up first. ${mostSevere.reason || ''}`;
            break;
        case 'gentle_only':
            guidance = `🤏 Be extra gentle around "${mostSevere.topic}". ${mostSevere.reason || ''}`;
            break;
        case 'time_sensitive':
            guidance = `⏰ "${mostSevere.topic}" is temporarily sensitive. ${mostSevere.reason || ''}`;
            break;
    }
    // Collect alternatives
    const alternatives = matchedBoundaries
        .flatMap((b) => b.safeAlternatives || [])
        .filter((a, i, arr) => arr.indexOf(a) === i);
    return {
        isSafe: mostSevere.severity === 'gentle_only' || mostSevere.severity === 'time_sensitive',
        matchedBoundaries,
        guidance,
        alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
}
/**
 * Detect boundaries from conversation patterns.
 * Call this when user shows signs of discomfort.
 */
export async function inferBoundaryFromReaction(userId, topic, reactionType, context) {
    // Map reaction to suggested severity
    const severityMap = {
        deflected: 'gentle_only',
        went_silent: 'only_if_they_bring_up',
        changed_subject: 'only_if_they_bring_up',
        showed_distress: 'never',
    };
    // Check if boundary already exists
    const existing = await loadBoundaries(userId);
    const existingBoundary = existing.find((b) => b.topic.toLowerCase() === topic.toLowerCase());
    if (existingBoundary) {
        // Potentially escalate severity if reaction was more severe
        const currentIndex = [
            'gentle_only',
            'time_sensitive',
            'only_if_they_bring_up',
            'never',
        ].indexOf(existingBoundary.severity);
        const newIndex = ['gentle_only', 'time_sensitive', 'only_if_they_bring_up', 'never'].indexOf(severityMap[reactionType]);
        if (newIndex > currentIndex && existingBoundary.id) {
            await updateBoundary(userId, existingBoundary.id, {
                severity: severityMap[reactionType],
                lastConfirmed: Date.now(),
            });
        }
        return;
    }
    // Create new inferred boundary
    await recordBoundary(userId, {
        topic,
        severity: severityMap[reactionType],
        category: 'other',
        reason: context
            ? `Inferred from reaction: ${context}`
            : `User ${reactionType} when this came up`,
        triggerKeywords: topic
            .toLowerCase()
            .split(' ')
            .filter((w) => w.length > 3),
        source: 'detected_reaction',
    });
}
// ============================================================================
// CONTEXT BUILDING
// ============================================================================
/**
 * Build context for LLM injection.
 */
export async function buildProtectiveSilenceContext(userId) {
    const boundaries = await loadBoundaries(userId);
    if (boundaries.length === 0) {
        return '';
    }
    const sections = [];
    sections.push('[PROTECTIVE SILENCE - What NOT to Say]');
    sections.push('You remember sensitive topics that could hurt this person.\n');
    // Group by severity
    const never = boundaries.filter((b) => b.severity === 'never');
    const onlyIfThey = boundaries.filter((b) => b.severity === 'only_if_they_bring_up');
    const gentle = boundaries.filter((b) => b.severity === 'gentle_only');
    const timeSensitive = boundaries.filter((b) => b.severity === 'time_sensitive');
    if (never.length > 0) {
        sections.push('⛔ NEVER bring up:');
        for (const b of never) {
            sections.push(`  • ${b.topic}${b.reason ? ` (${b.reason})` : ''}`);
        }
    }
    if (onlyIfThey.length > 0) {
        sections.push('\n⚠️ Only discuss if THEY bring it up first:');
        for (const b of onlyIfThey) {
            sections.push(`  • ${b.topic}`);
        }
    }
    if (gentle.length > 0) {
        sections.push('\n🤏 Tread gently around:');
        for (const b of gentle) {
            sections.push(`  • ${b.topic}`);
        }
    }
    if (timeSensitive.length > 0) {
        sections.push('\n⏰ Currently sensitive (may change):');
        for (const b of timeSensitive) {
            const daysRemaining = b.expiresAt
                ? Math.ceil((b.expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
                : '?';
            sections.push(`  • ${b.topic} (${daysRemaining} days remaining)`);
        }
    }
    return sections.join('\n');
}
/**
 * Quick check if a response would cross boundaries.
 */
export async function checkResponseSafety(userId, proposedResponse) {
    const boundaries = await loadBoundaries(userId);
    return checkBoundaries(proposedResponse, boundaries);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const protectiveSilence = {
    record: recordBoundary,
    update: updateBoundary,
    remove: removeBoundary,
    load: loadBoundaries,
    check: checkBoundaries,
    inferFromReaction: inferBoundaryFromReaction,
    checkResponseSafety,
    buildContext: buildProtectiveSilenceContext,
};
//# sourceMappingURL=protective-silence.js.map