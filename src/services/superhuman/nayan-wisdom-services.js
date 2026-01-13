/**
 * Nayan's Superhuman Wisdom Services
 *
 * "Better Than Human" persistence layer for Nayan's wisdom capabilities.
 * These services provide the superhuman memory that makes Nayan's wisdom transcendent.
 *
 * SERVICES:
 *   1. Paradox Keeper - Track contradictions without resolution
 *   2. Enough Tracker - Remember "enough" declarations
 *   3. Wisdom Incubation - Track things needing time to ripen
 *   4. Wisdom Synthesis - Pattern recognition across wisdom-seeking
 *   5. Legacy Echo - Track stated legacy/meaning goals
 *   6. Cyclical Wisdom - Seasonal/cyclical pattern tracking
 *   7. Life Chapter Narrator - Life as chapters with themes
 *
 * FIRESTORE COLLECTIONS:
 *   bogle_users/{userId}/paradoxes
 *   bogle_users/{userId}/enough_statements
 *   bogle_users/{userId}/wisdom_incubation
 *   bogle_users/{userId}/wisdom_patterns
 *   bogle_users/{userId}/legacy_statements
 *   bogle_users/{userId}/cyclical_patterns
 *   bogle_users/{userId}/life_chapters
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from './firestore-utils.js';
const log = createLogger({ module: 'superhuman:nayan-wisdom' });
// ============================================================================
// PARADOX KEEPER SERVICE
// ============================================================================
export async function recordParadox(userId, paradox) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'No Firestore - skipping paradox recording');
        return;
    }
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('paradoxes')
            .add({
            ...paradox,
            status: paradox.status || 'active',
        });
        log.info({ userId, desire1: paradox.desire1, desire2: paradox.desire2 }, 'Paradox recorded');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to record paradox');
    }
}
export async function getParadoxes(userId, status = 'all') {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db.collection('bogle_users').doc(userId).collection('paradoxes');
        if (status !== 'all') {
            query = query.where('status', '==', status);
        }
        const snapshot = await query.orderBy('recordedAt', 'desc').limit(20).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to get paradoxes');
        return [];
    }
}
export async function updateParadoxStatus(userId, paradoxId, status, notes) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db.collection('bogle_users').doc(userId).collection('paradoxes').doc(paradoxId).update({
            status,
            resolutionNotes: notes,
        });
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to update paradox status');
    }
}
// ============================================================================
// ENOUGH TRACKER SERVICE
// ============================================================================
export async function recordEnoughStatement(userId, statement) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'No Firestore - skipping enough recording');
        return;
    }
    try {
        await db.collection('bogle_users').doc(userId).collection('enough_statements').add(statement);
        log.info({ userId, domain: statement.domain }, 'Enough statement recorded');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to record enough statement');
    }
}
export async function getEnoughStatements(userId, domain) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db.collection('bogle_users').doc(userId).collection('enough_statements');
        if (domain) {
            query = query.where('domain', '==', domain);
        }
        const snapshot = await query.orderBy('recordedAt', 'desc').limit(20).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to get enough statements');
        return [];
    }
}
export async function markEnoughReached(userId, statementId, wasItEnough, notes) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('enough_statements')
            .doc(statementId)
            .update({
            reachedAt: new Date().toISOString(),
            wasItEnough,
            notes,
        });
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to mark enough reached');
    }
}
// ============================================================================
// WISDOM INCUBATION SERVICE
// ============================================================================
export async function recordIncubatingWisdom(userId, item) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'No Firestore - skipping incubation recording');
        return;
    }
    try {
        await db.collection('bogle_users').doc(userId).collection('wisdom_incubation').add(item);
        log.info({ userId, question: item.question.substring(0, 50) }, 'Wisdom incubation recorded');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to record wisdom incubation');
    }
}
export async function getIncubatingWisdom(userId, status = 'incubating') {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db.collection('bogle_users').doc(userId).collection('wisdom_incubation');
        if (status !== 'all') {
            query = query.where('status', '==', status);
        }
        const snapshot = await query.orderBy('recordedAt', 'desc').limit(20).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to get incubating wisdom');
        return [];
    }
}
export async function markIncubationReady(userId, itemId, insight) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('wisdom_incubation')
            .doc(itemId)
            .update({
            status: 'ready',
            insight,
        });
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to mark incubation ready');
    }
}
// ============================================================================
// WISDOM SYNTHESIS SERVICE (Pattern Recognition)
// ============================================================================
export async function recordWisdomPattern(userId, pattern) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'No Firestore - skipping pattern recording');
        return;
    }
    try {
        // Check if pattern already exists
        const existing = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('wisdom_patterns')
            .where('theme', '==', pattern.theme)
            .limit(1)
            .get();
        if (!existing.empty) {
            // Update existing pattern
            const doc = existing.docs[0];
            const existingData = doc.data();
            await doc.ref.update({
                occurrences: existingData.occurrences + 1,
                contexts: [...(existingData.contexts || []), ...pattern.contexts].slice(-10),
                lastSeen: pattern.lastSeen,
                insight: pattern.insight || existingData.insight,
            });
        }
        else {
            // Create new pattern
            await db.collection('bogle_users').doc(userId).collection('wisdom_patterns').add(pattern);
        }
        log.info({ userId, theme: pattern.theme }, 'Wisdom pattern recorded');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to record wisdom pattern');
    }
}
export async function getWisdomPatterns(userId, patternType) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db.collection('bogle_users').doc(userId).collection('wisdom_patterns');
        if (patternType) {
            query = query.where('patternType', '==', patternType);
        }
        const snapshot = await query.orderBy('occurrences', 'desc').limit(20).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to get wisdom patterns');
        return [];
    }
}
// ============================================================================
// LEGACY ECHO SERVICE
// ============================================================================
export async function recordLegacyStatement(userId, statement) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'No Firestore - skipping legacy recording');
        return;
    }
    try {
        await db.collection('bogle_users').doc(userId).collection('legacy_statements').add(statement);
        log.info({ userId, domain: statement.domain }, 'Legacy statement recorded');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to record legacy statement');
    }
}
export async function getLegacyStatements(userId, importance) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db.collection('bogle_users').doc(userId).collection('legacy_statements');
        if (importance) {
            query = query.where('importance', '==', importance);
        }
        const snapshot = await query.orderBy('recordedAt', 'desc').limit(20).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to get legacy statements');
        return [];
    }
}
// ============================================================================
// CYCLICAL WISDOM SERVICE
// ============================================================================
export async function recordCyclicalPattern(userId, pattern, observation) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'No Firestore - skipping cyclical pattern recording');
        return;
    }
    try {
        // Check if pattern already exists
        const existing = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('cyclical_patterns')
            .where('pattern', '==', pattern.pattern)
            .limit(1)
            .get();
        if (!existing.empty) {
            // Update existing pattern
            const doc = existing.docs[0];
            const existingData = doc.data();
            await doc.ref.update({
                observations: [...(existingData.observations || []), observation].slice(-20),
                lastObserved: observation.date,
                insight: pattern.insight || existingData.insight,
            });
        }
        else {
            // Create new pattern
            await db
                .collection('bogle_users')
                .doc(userId)
                .collection('cyclical_patterns')
                .add({
                ...pattern,
                observations: [observation],
                firstObserved: observation.date,
                lastObserved: observation.date,
            });
        }
        log.info({ userId, pattern: pattern.pattern, cycle: pattern.cycle }, 'Cyclical pattern recorded');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to record cyclical pattern');
    }
}
export async function getCyclicalPatterns(userId, cycle) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db.collection('bogle_users').doc(userId).collection('cyclical_patterns');
        if (cycle) {
            query = query.where('cycle', '==', cycle);
        }
        const snapshot = await query.limit(20).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to get cyclical patterns');
        return [];
    }
}
// ============================================================================
// LIFE CHAPTER NARRATOR SERVICE
// ============================================================================
export async function recordLifeChapter(userId, chapter) {
    const db = getFirestoreDb();
    if (!db) {
        log.debug({ userId }, 'No Firestore - skipping chapter recording');
        return;
    }
    try {
        await db.collection('bogle_users').doc(userId).collection('life_chapters').add(chapter);
        log.info({ userId, title: chapter.title, status: chapter.status }, 'Life chapter recorded');
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to record life chapter');
    }
}
export async function getLifeChapters(userId, status) {
    const db = getFirestoreDb();
    if (!db)
        return [];
    try {
        let query = db.collection('bogle_users').doc(userId).collection('life_chapters');
        if (status) {
            query = query.where('status', '==', status);
        }
        const snapshot = await query.orderBy('startDate', 'desc').limit(10).get();
        return snapshot.docs.map((doc) => doc.data());
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to get life chapters');
        return [];
    }
}
export async function updateLifeChapter(userId, chapterId, updates) {
    const db = getFirestoreDb();
    if (!db)
        return;
    try {
        await db
            .collection('bogle_users')
            .doc(userId)
            .collection('life_chapters')
            .doc(chapterId)
            .update(updates);
    }
    catch (error) {
        log.debug({ error, userId }, 'Failed to update life chapter');
    }
}
// ============================================================================
// CONTEXT BUILDER FOR NAYAN
// ============================================================================
/**
 * Build comprehensive wisdom context for Nayan
 * This aggregates all wisdom services into a context injection
 */
export async function buildNayanWisdomContext(userId) {
    const [paradoxes, enoughStatements, incubating, patterns, legacyStatements, cyclicalPatterns, chapters] = await Promise.all([
        getParadoxes(userId, 'active'),
        getEnoughStatements(userId),
        getIncubatingWisdom(userId, 'incubating'),
        getWisdomPatterns(userId),
        getLegacyStatements(userId, 'core'),
        getCyclicalPatterns(userId),
        getLifeChapters(userId, 'current'),
    ]);
    const lines = ['[NAYAN WISDOM MEMORY - Better Than Human]'];
    // Paradoxes they're holding
    if (paradoxes.length > 0) {
        lines.push('\n**Active Paradoxes:**');
        for (const p of paradoxes.slice(0, 3)) {
            lines.push(`• "${p.desire1}" AND "${p.desire2}"`);
        }
        lines.push("(Don't try to resolve these—honor both)");
    }
    // Enough statements
    if (enoughStatements.length > 0) {
        lines.push('\n**"Enough" Markers:**');
        for (const s of enoughStatements.slice(0, 3)) {
            const monthsAgo = Math.floor((Date.now() - new Date(s.recordedAt).getTime()) / (1000 * 60 * 60 * 24 * 30));
            lines.push(`• ${s.domain}: "${s.statement}" (${monthsAgo}mo ago)`);
            if (s.reachedAt && s.wasItEnough !== undefined) {
                lines.push(`  → Reached. Was it enough? ${s.wasItEnough ? 'Yes' : 'No'}`);
            }
        }
    }
    // Things incubating
    if (incubating.length > 0) {
        lines.push('\n**Incubating (Do Not Rush):**');
        for (const i of incubating.slice(0, 3)) {
            const daysAgo = Math.floor((Date.now() - new Date(i.recordedAt).getTime()) / (1000 * 60 * 60 * 24));
            lines.push(`• "${i.question.substring(0, 60)}..." (${daysAgo} days)`);
        }
    }
    // Recurring wisdom patterns
    if (patterns.length > 0) {
        const recurring = patterns.filter((p) => p.occurrences >= 2);
        if (recurring.length > 0) {
            lines.push('\n**Recurring Themes (Surface Gently):**');
            for (const p of recurring.slice(0, 3)) {
                lines.push(`• "${p.theme}" (asked ${p.occurrences}x)`);
                if (p.insight)
                    lines.push(`  Insight: ${p.insight}`);
            }
        }
    }
    // Core legacy statements
    if (legacyStatements.length > 0) {
        lines.push('\n**Legacy Anchors (What Matters Most):**');
        for (const l of legacyStatements.slice(0, 3)) {
            lines.push(`• "${l.statement}"`);
        }
        lines.push('(Reference when caught in short-term thinking)');
    }
    // Cyclical patterns
    if (cyclicalPatterns.length > 0) {
        lines.push('\n**Cyclical Patterns (Normalize, Don\'t Pathologize):**');
        for (const c of cyclicalPatterns.slice(0, 2)) {
            lines.push(`• ${c.pattern} (${c.cycle})`);
            if (c.insight)
                lines.push(`  "${c.insight}"`);
        }
    }
    // Current life chapter
    if (chapters.length > 0) {
        const current = chapters[0];
        lines.push(`\n**Current Life Chapter:** "${current.title}" (${current.theme})`);
        if (current.lessonsLearned.length > 0) {
            lines.push(`Lessons emerging: ${current.lessonsLearned.slice(0, 2).join(', ')}`);
        }
    }
    return lines.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    // Paradox
    recordParadox,
    getParadoxes,
    updateParadoxStatus,
    // Enough
    recordEnoughStatement,
    getEnoughStatements,
    markEnoughReached,
    // Incubation
    recordIncubatingWisdom,
    getIncubatingWisdom,
    markIncubationReady,
    // Patterns
    recordWisdomPattern,
    getWisdomPatterns,
    // Legacy
    recordLegacyStatement,
    getLegacyStatements,
    // Cyclical
    recordCyclicalPattern,
    getCyclicalPatterns,
    // Chapters
    recordLifeChapter,
    getLifeChapters,
    updateLifeChapter,
    // Context
    buildNayanWisdomContext,
};
//# sourceMappingURL=nayan-wisdom-services.js.map