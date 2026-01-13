/**
 * Trust Systems Persistence
 *
 * Persists trust profiles to Firestore so they survive across sessions.
 * This is critical - without persistence, trust resets every server restart.
 *
 * Storage Strategy:
 * - Each trust system stores in a subcollection under the user
 * - bogle_users/{userId}/trust_profiles/{systemName}
 * - Automatic sync on session start/end
 *
 * @module TrustPersistence
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { removeUndefined } from '../../utils/firestore-utils.js';
// Trust system imports
import { exportBoundaries, importBoundaries } from './boundary-memory.js';
import { exportGrowthProfile, importGrowthProfile, } from './growth-reflection.js';
import { exportInsideJokesProfile, importInsideJokesProfile, } from './inside-jokes.js';
import { exportSmallWinsProfile, importSmallWinsProfile, } from './small-wins.js';
import { exportThinkingOfYouProfile, importThinkingOfYouProfile, } from './thinking-of-you.js';
import { exportUnsaidProfile, importUnsaidProfile, } from './reading-between-lines.js';
// Phase 12-17, 24-29: New trust system imports for persistence
import { getHealthScore } from './relationship-health.js';
import { getMomentumProfile } from './celebration-momentum.js';
import { getTimeline } from './sentiment-timeline.js';
import { getBaseline } from './voice-prosody-learning.js';
import { getJournalingPatterns } from './journaling-prompts.js';
import { getSeasonalProfile } from './seasonal-awareness.js';
import { getLearningProfile } from './learning-style.js';
import { getMediaPreferences } from './media-suggestions.js';
import { getReportHistory } from './relationship-insights.js';
const log = createLogger({ module: 'TrustPersistence' });
// ============================================================================
// CONSTANTS
// ============================================================================
const TRUST_COLLECTION = 'trust_profiles';
const CURRENT_VERSION = 1;
// System names for subcollections
const SYSTEM_NAMES = {
    // Core systems
    boundaries: 'boundaries',
    growth: 'growth',
    insideJokes: 'inside_jokes',
    smallWins: 'small_wins',
    thinkingOfYou: 'thinking_of_you',
    unsaid: 'unsaid',
    // Phase 12-17: Advanced trust systems
    relationshipHealth: 'relationship_health',
    celebrationMomentum: 'celebration_momentum',
    sentimentTimeline: 'sentiment_timeline',
    // Phase 24-29: Personalization systems
    voiceProsody: 'voice_prosody',
    journaling: 'journaling',
    seasonal: 'seasonal',
    learningStyle: 'learning_style',
    mediaPreferences: 'media_preferences',
    insightsReports: 'insights_reports',
};
// ============================================================================
// FIRESTORE ACCESS
// ============================================================================
let db = null;
function getDb() {
    if (!db) {
        try {
            db = getFirestore();
        }
        catch (error) {
            log.warn({ error }, 'Firestore not initialized, using memory-only mode');
            throw new Error('Firestore not available');
        }
    }
    return db;
}
/**
 * Get trust profile document reference
 */
function getTrustDoc(userId, systemName) {
    return getDb().collection('bogle_users').doc(userId).collection(TRUST_COLLECTION).doc(systemName);
}
// ============================================================================
// SAVE FUNCTIONS
// ============================================================================
/**
 * Save a single trust system profile
 */
async function saveSystemProfile(userId, systemName, profile) {
    if (!profile)
        return false;
    try {
        const doc = {
            data: JSON.stringify(profile),
            updatedAt: FieldValue.serverTimestamp(),
            version: CURRENT_VERSION,
        };
        await getTrustDoc(userId, systemName).set(removeUndefined(doc), { merge: true });
        log.debug({ userId, systemName }, 'Trust profile saved');
        return true;
    }
    catch (error) {
        log.error({ error, userId, systemName }, 'Failed to save trust profile');
        return false;
    }
}
/**
 * Save all trust profiles for a user
 */
export async function saveTrustProfiles(userId) {
    const saved = [];
    const failed = [];
    // ============================================================================
    // CORE SYSTEMS
    // ============================================================================
    // Boundaries
    const boundaries = exportBoundaries(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.boundaries, boundaries)) {
        saved.push('boundaries');
    }
    else if (boundaries) {
        failed.push('boundaries');
    }
    // Growth
    const growth = exportGrowthProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.growth, growth)) {
        saved.push('growth');
    }
    else if (growth) {
        failed.push('growth');
    }
    // Inside Jokes
    const insideJokes = exportInsideJokesProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.insideJokes, insideJokes)) {
        saved.push('insideJokes');
    }
    else if (insideJokes) {
        failed.push('insideJokes');
    }
    // Small Wins
    const smallWins = exportSmallWinsProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.smallWins, smallWins)) {
        saved.push('smallWins');
    }
    else if (smallWins) {
        failed.push('smallWins');
    }
    // Thinking of You
    const thinkingOfYou = exportThinkingOfYouProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.thinkingOfYou, thinkingOfYou)) {
        saved.push('thinkingOfYou');
    }
    else if (thinkingOfYou) {
        failed.push('thinkingOfYou');
    }
    // ============================================================================
    // PHASE 12-17: ADVANCED TRUST SYSTEMS
    // ============================================================================
    // Relationship Health (Phase 12)
    const relationshipHealth = getHealthScore(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.relationshipHealth, relationshipHealth)) {
        saved.push('relationshipHealth');
    }
    else if (relationshipHealth) {
        failed.push('relationshipHealth');
    }
    // Celebration Momentum (Phase 16)
    const celebrationMomentum = getMomentumProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.celebrationMomentum, celebrationMomentum)) {
        saved.push('celebrationMomentum');
    }
    else if (celebrationMomentum) {
        failed.push('celebrationMomentum');
    }
    // Sentiment Timeline (Phase 17)
    const sentimentTimeline = getTimeline(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.sentimentTimeline, sentimentTimeline)) {
        saved.push('sentimentTimeline');
    }
    else if (sentimentTimeline) {
        failed.push('sentimentTimeline');
    }
    // ============================================================================
    // PHASE 24-29: PERSONALIZATION SYSTEMS
    // ============================================================================
    // Voice Prosody (Phase 24)
    const voiceProsody = getBaseline(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.voiceProsody, voiceProsody)) {
        saved.push('voiceProsody');
    }
    else if (voiceProsody) {
        failed.push('voiceProsody');
    }
    // Journaling (Phase 25)
    const journaling = getJournalingPatterns(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.journaling, journaling)) {
        saved.push('journaling');
    }
    else if (journaling) {
        failed.push('journaling');
    }
    // Seasonal (Phase 26)
    const seasonal = getSeasonalProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.seasonal, seasonal)) {
        saved.push('seasonal');
    }
    else if (seasonal) {
        failed.push('seasonal');
    }
    // Learning Style (Phase 27)
    const learningStyle = getLearningProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.learningStyle, learningStyle)) {
        saved.push('learningStyle');
    }
    else if (learningStyle) {
        failed.push('learningStyle');
    }
    // Media Preferences (Phase 29)
    const mediaPreferences = getMediaPreferences(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.mediaPreferences, mediaPreferences)) {
        saved.push('mediaPreferences');
    }
    else if (mediaPreferences) {
        failed.push('mediaPreferences');
    }
    // Insights Reports (Phase 28)
    const insightsReports = getReportHistory(userId);
    if (insightsReports.length > 0) {
        if (await saveSystemProfile(userId, SYSTEM_NAMES.insightsReports, insightsReports)) {
            saved.push('insightsReports');
        }
        else {
            failed.push('insightsReports');
        }
    }
    log.info({ userId, saved: saved.length, failed: failed.length }, '💾 Trust profiles saved');
    return { saved, failed };
}
// ============================================================================
// LOAD FUNCTIONS
// ============================================================================
/**
 * Load a single trust system profile
 */
async function loadSystemProfile(userId, systemName) {
    try {
        const doc = await getTrustDoc(userId, systemName).get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        return JSON.parse(data.data);
    }
    catch (error) {
        log.warn({ error, userId, systemName }, 'Failed to load trust profile');
        return null;
    }
}
/**
 * Load all trust profiles for a user and import them into memory
 */
export async function loadTrustProfiles(userId) {
    const loaded = [];
    const notFound = [];
    // Boundaries
    const boundaries = await loadSystemProfile(userId, SYSTEM_NAMES.boundaries);
    if (boundaries) {
        importBoundaries(boundaries);
        loaded.push('boundaries');
    }
    else {
        notFound.push('boundaries');
    }
    // Growth
    const growth = await loadSystemProfile(userId, SYSTEM_NAMES.growth);
    if (growth) {
        importGrowthProfile(growth);
        loaded.push('growth');
    }
    else {
        notFound.push('growth');
    }
    // Inside Jokes
    const insideJokes = await loadSystemProfile(userId, SYSTEM_NAMES.insideJokes);
    if (insideJokes) {
        importInsideJokesProfile(insideJokes);
        loaded.push('insideJokes');
    }
    else {
        notFound.push('insideJokes');
    }
    // Small Wins
    const smallWins = await loadSystemProfile(userId, SYSTEM_NAMES.smallWins);
    if (smallWins) {
        importSmallWinsProfile(smallWins);
        loaded.push('smallWins');
    }
    else {
        notFound.push('smallWins');
    }
    // Thinking of You
    const thinkingOfYou = await loadSystemProfile(userId, SYSTEM_NAMES.thinkingOfYou);
    if (thinkingOfYou) {
        importThinkingOfYouProfile(thinkingOfYou);
        loaded.push('thinkingOfYou');
    }
    else {
        notFound.push('thinkingOfYou');
    }
    log.info({ userId, loaded: loaded.length, notFound: notFound.length }, '📂 Trust profiles loaded');
    return { loaded, notFound };
}
// ============================================================================
// SESSION HOOKS
// ============================================================================
/**
 * Call at session start to load trust profiles
 */
export async function onSessionStart(userId) {
    try {
        await loadTrustProfiles(userId);
    }
    catch (error) {
        log.warn({ error, userId }, 'Trust profile load failed, starting fresh');
    }
}
/**
 * Call at session end to save trust profiles
 */
export async function onSessionEnd(userId) {
    try {
        await saveTrustProfiles(userId);
    }
    catch (error) {
        log.error({ error, userId }, 'Trust profile save failed');
    }
}
/**
 * Periodic sync during long sessions (every 5 minutes)
 */
export async function periodicSync(userId) {
    try {
        const { saved, failed } = await saveTrustProfiles(userId);
        if (failed.length > 0) {
            log.warn({ userId, failed }, 'Some trust profiles failed to sync');
        }
    }
    catch (error) {
        log.warn({ error, userId }, 'Periodic trust sync failed');
    }
}
// ============================================================================
// BUNDLE OPERATIONS
// ============================================================================
/**
 * Export all trust profiles as a single bundle
 */
export function exportTrustBundle(userId) {
    return {
        userId,
        boundaries: exportBoundaries(userId) || undefined,
        growth: exportGrowthProfile(userId) || undefined,
        insideJokes: exportInsideJokesProfile(userId) || undefined,
        smallWins: exportSmallWinsProfile(userId) || undefined,
        thinkingOfYou: exportThinkingOfYouProfile(userId) || undefined,
        unsaid: exportUnsaidProfile(userId) || undefined,
        lastSynced: new Date(),
        version: CURRENT_VERSION,
    };
}
/**
 * Import a trust bundle into memory
 */
export function importTrustBundle(bundle) {
    if (bundle.boundaries) {
        importBoundaries(bundle.boundaries);
    }
    if (bundle.growth) {
        importGrowthProfile(bundle.growth);
    }
    if (bundle.insideJokes) {
        importInsideJokesProfile(bundle.insideJokes);
    }
    if (bundle.smallWins) {
        importSmallWinsProfile(bundle.smallWins);
    }
    if (bundle.thinkingOfYou) {
        importThinkingOfYouProfile(bundle.thinkingOfYou);
    }
    // P4 FIX: Import unsaid profile for cross-session deflection tracking
    if (bundle.unsaid) {
        importUnsaidProfile(bundle.unsaid);
    }
    log.info({ userId: bundle.userId }, '📦 Trust bundle imported');
}
// ============================================================================
// MIGRATION
// ============================================================================
/**
 * Migrate trust data from old storage format (if needed)
 */
export async function migrateTrustData(userId) {
    // Future: Handle version migrations
    log.debug({ userId }, 'Trust data migration check (no migration needed)');
}
// ============================================================================
// CLEANUP
// ============================================================================
/** Firestore batch write limit */
const FIRESTORE_BATCH_LIMIT = 500;
/**
 * Delete all trust profiles for a user (for GDPR deletion)
 */
export async function deleteTrustProfiles(userId) {
    try {
        const db = getDb();
        const trustCollection = db.collection('bogle_users').doc(userId).collection(TRUST_COLLECTION);
        const docs = await trustCollection.listDocuments();
        if (docs.length === 0) {
            log.info({ userId }, '🗑️ No trust profiles to delete');
            return;
        }
        // Process in batches to respect Firestore's 500-operation limit
        let deleted = 0;
        for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
            const chunk = docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
            const batch = db.batch();
            for (const doc of chunk) {
                batch.delete(doc);
            }
            await batch.commit();
            deleted += chunk.length;
        }
        log.info({ userId, deleted }, '🗑️ Trust profiles deleted');
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to delete trust profiles');
        throw error;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    saveTrustProfiles,
    loadTrustProfiles,
    onSessionStart,
    onSessionEnd,
    periodicSync,
    exportTrustBundle,
    importTrustBundle,
    deleteTrustProfiles,
};
//# sourceMappingURL=persistence.js.map