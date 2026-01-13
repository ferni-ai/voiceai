/**
 * Deep Understanding Systems Persistence
 *
 * Persists deep understanding profiles to Firestore so they survive across sessions.
 * This is critical - without persistence, understanding resets every server restart.
 *
 * Storage Strategy:
 * - Each system stores in a subcollection under the user
 * - bogle_users/{userId}/deep_understanding/{systemName}
 * - Automatic sync on session start/end
 *
 * @module DeepUnderstandingPersistence
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
// Import all deep understanding systems
import { getSilencePattern, importSilencePattern, } from './silence.js';
import { getLifeRhythmProfile, importLifeRhythmProfile, } from './life-rhythm.js';
import { getRelationalNetwork, importRelationalNetwork, } from './relationships.js';
import { getResistanceProfile, importResistanceProfile, } from './resistance.js';
import { getEnergyPattern, importEnergyPattern } from './energy.js';
import { getSubconsciousProfile, importSubconsciousProfile, } from './subconscious.js';
import { getFlowProfile, importFlowProfile } from './flow.js';
import { getRepairProfile, importRepairProfile, } from './repair.js';
import { getHopeProfile, importHopeProfile } from './hope.js';
import { getChapterProfile, importChapterProfile } from './life-chapter.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'DeepUnderstandingPersistence' });
// ============================================================================
// CONSTANTS
// ============================================================================
const COLLECTION_NAME = 'deep_understanding';
const CURRENT_VERSION = 1;
// System names for subcollections
const SYSTEM_NAMES = {
    silencePattern: 'silence_pattern',
    lifeRhythm: 'life_rhythm',
    relationalNetwork: 'relational_network',
    resistance: 'resistance',
    energy: 'energy',
    subconscious: 'subconscious',
    conversationalFlow: 'conversational_flow',
    repair: 'repair',
    hope: 'hope',
    lifeChapter: 'life_chapter',
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
 * Get deep understanding document reference
 */
function getDoc(userId, systemName) {
    return getDb().collection('bogle_users').doc(userId).collection(COLLECTION_NAME).doc(systemName);
}
// ============================================================================
// SAVE FUNCTIONS
// ============================================================================
/**
 * Save a single system profile
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
        await getDoc(userId, systemName).set(cleanForFirestore(doc), { merge: true });
        log.debug({ userId, systemName }, 'Deep understanding profile saved');
        return true;
    }
    catch (error) {
        log.error({ error, userId, systemName }, 'Failed to save deep understanding profile');
        return false;
    }
}
/**
 * Save all deep understanding profiles for a user
 */
export async function saveDeepUnderstandingProfiles(userId) {
    const saved = [];
    const failed = [];
    // 1. Silence Pattern
    const silencePattern = getSilencePattern(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.silencePattern, silencePattern)) {
        saved.push('silencePattern');
    }
    else if (silencePattern) {
        failed.push('silencePattern');
    }
    // 2. Life Rhythm
    const lifeRhythm = getLifeRhythmProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.lifeRhythm, lifeRhythm)) {
        saved.push('lifeRhythm');
    }
    else if (lifeRhythm) {
        failed.push('lifeRhythm');
    }
    // 3. Relational Network
    const relationalNetwork = getRelationalNetwork(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.relationalNetwork, relationalNetwork)) {
        saved.push('relationalNetwork');
    }
    else if (relationalNetwork) {
        failed.push('relationalNetwork');
    }
    // 4. Resistance
    const resistance = getResistanceProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.resistance, resistance)) {
        saved.push('resistance');
    }
    else if (resistance) {
        failed.push('resistance');
    }
    // 5. Energy
    const energy = getEnergyPattern(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.energy, energy)) {
        saved.push('energy');
    }
    else if (energy) {
        failed.push('energy');
    }
    // 6. Subconscious
    const subconscious = getSubconsciousProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.subconscious, subconscious)) {
        saved.push('subconscious');
    }
    else if (subconscious) {
        failed.push('subconscious');
    }
    // 7. Conversational Flow
    const conversationalFlow = getFlowProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.conversationalFlow, conversationalFlow)) {
        saved.push('conversationalFlow');
    }
    else if (conversationalFlow) {
        failed.push('conversationalFlow');
    }
    // 8. Repair
    const repair = getRepairProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.repair, repair)) {
        saved.push('repair');
    }
    else if (repair) {
        failed.push('repair');
    }
    // 9. Hope
    const hope = getHopeProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.hope, hope)) {
        saved.push('hope');
    }
    else if (hope) {
        failed.push('hope');
    }
    // 10. Life Chapter
    const lifeChapter = getChapterProfile(userId);
    if (await saveSystemProfile(userId, SYSTEM_NAMES.lifeChapter, lifeChapter)) {
        saved.push('lifeChapter');
    }
    else if (lifeChapter) {
        failed.push('lifeChapter');
    }
    log.info({ userId, saved: saved.length, failed: failed.length }, '💾 Deep understanding profiles saved');
    return { saved, failed };
}
// ============================================================================
// LOAD FUNCTIONS
// ============================================================================
/**
 * Load a single system profile
 */
async function loadSystemProfile(userId, systemName) {
    try {
        const doc = await getDoc(userId, systemName).get();
        if (!doc.exists) {
            return null;
        }
        const data = doc.data();
        return JSON.parse(data.data);
    }
    catch (error) {
        log.warn({ error, userId, systemName }, 'Failed to load deep understanding profile');
        return null;
    }
}
/**
 * Load all deep understanding profiles for a user and import them into memory
 */
export async function loadDeepUnderstandingProfiles(userId) {
    const loaded = [];
    const notFound = [];
    // 1. Silence Pattern
    const silencePattern = await loadSystemProfile(userId, SYSTEM_NAMES.silencePattern);
    if (silencePattern) {
        importSilencePattern(silencePattern);
        loaded.push('silencePattern');
    }
    else {
        notFound.push('silencePattern');
    }
    // 2. Life Rhythm
    const lifeRhythm = await loadSystemProfile(userId, SYSTEM_NAMES.lifeRhythm);
    if (lifeRhythm) {
        importLifeRhythmProfile(lifeRhythm);
        loaded.push('lifeRhythm');
    }
    else {
        notFound.push('lifeRhythm');
    }
    // 3. Relational Network
    const relationalNetwork = await loadSystemProfile(userId, SYSTEM_NAMES.relationalNetwork);
    if (relationalNetwork) {
        importRelationalNetwork(relationalNetwork);
        loaded.push('relationalNetwork');
    }
    else {
        notFound.push('relationalNetwork');
    }
    // 4. Resistance
    const resistance = await loadSystemProfile(userId, SYSTEM_NAMES.resistance);
    if (resistance) {
        importResistanceProfile(resistance);
        loaded.push('resistance');
    }
    else {
        notFound.push('resistance');
    }
    // 5. Energy
    const energy = await loadSystemProfile(userId, SYSTEM_NAMES.energy);
    if (energy) {
        importEnergyPattern(energy);
        loaded.push('energy');
    }
    else {
        notFound.push('energy');
    }
    // 6. Subconscious
    const subconscious = await loadSystemProfile(userId, SYSTEM_NAMES.subconscious);
    if (subconscious) {
        importSubconsciousProfile(subconscious);
        loaded.push('subconscious');
    }
    else {
        notFound.push('subconscious');
    }
    // 7. Conversational Flow
    const conversationalFlow = await loadSystemProfile(userId, SYSTEM_NAMES.conversationalFlow);
    if (conversationalFlow) {
        importFlowProfile(conversationalFlow);
        loaded.push('conversationalFlow');
    }
    else {
        notFound.push('conversationalFlow');
    }
    // 8. Repair
    const repair = await loadSystemProfile(userId, SYSTEM_NAMES.repair);
    if (repair) {
        importRepairProfile(repair);
        loaded.push('repair');
    }
    else {
        notFound.push('repair');
    }
    // 9. Hope
    const hope = await loadSystemProfile(userId, SYSTEM_NAMES.hope);
    if (hope) {
        importHopeProfile(hope);
        loaded.push('hope');
    }
    else {
        notFound.push('hope');
    }
    // 10. Life Chapter
    const lifeChapter = await loadSystemProfile(userId, SYSTEM_NAMES.lifeChapter);
    if (lifeChapter) {
        importChapterProfile(lifeChapter);
        loaded.push('lifeChapter');
    }
    else {
        notFound.push('lifeChapter');
    }
    log.info({ userId, loaded: loaded.length, notFound: notFound.length }, '📂 Deep understanding profiles loaded');
    return { loaded, notFound };
}
// ============================================================================
// SESSION HOOKS
// ============================================================================
/**
 * Call at session start to load deep understanding profiles
 */
export async function onSessionStart(userId) {
    try {
        await loadDeepUnderstandingProfiles(userId);
    }
    catch (error) {
        log.warn({ error, userId }, 'Deep understanding profile load failed, starting fresh');
    }
}
/**
 * Call at session end to save deep understanding profiles
 */
export async function onSessionEnd(userId) {
    try {
        await saveDeepUnderstandingProfiles(userId);
    }
    catch (error) {
        log.error({ error, userId }, 'Deep understanding profile save failed');
    }
}
/**
 * Periodic sync during long sessions (every 5 minutes)
 */
export async function periodicSync(userId) {
    try {
        const { saved, failed } = await saveDeepUnderstandingProfiles(userId);
        if (failed.length > 0) {
            log.warn({ userId, failed }, 'Some deep understanding profiles failed to sync');
        }
    }
    catch (error) {
        log.warn({ error, userId }, 'Periodic deep understanding sync failed');
    }
}
// ============================================================================
// BUNDLE OPERATIONS
// ============================================================================
/**
 * Export all deep understanding profiles as a single bundle
 */
export function exportDeepUnderstandingBundle(userId) {
    return {
        userId,
        silencePattern: getSilencePattern(userId),
        lifeRhythm: getLifeRhythmProfile(userId),
        relationalNetwork: getRelationalNetwork(userId),
        resistance: getResistanceProfile(userId),
        energy: getEnergyPattern(userId),
        subconscious: getSubconsciousProfile(userId),
        conversationalFlow: getFlowProfile(userId),
        repair: getRepairProfile(userId),
        hope: getHopeProfile(userId),
        lifeChapter: getChapterProfile(userId),
        lastSynced: new Date(),
        version: CURRENT_VERSION,
    };
}
/**
 * Import a deep understanding bundle into memory
 */
export function importDeepUnderstandingBundle(bundle) {
    if (bundle.silencePattern) {
        importSilencePattern(bundle.silencePattern);
    }
    if (bundle.lifeRhythm) {
        importLifeRhythmProfile(bundle.lifeRhythm);
    }
    if (bundle.relationalNetwork) {
        importRelationalNetwork(bundle.relationalNetwork);
    }
    if (bundle.resistance) {
        importResistanceProfile(bundle.resistance);
    }
    if (bundle.energy) {
        importEnergyPattern(bundle.energy);
    }
    if (bundle.subconscious) {
        importSubconsciousProfile(bundle.subconscious);
    }
    if (bundle.conversationalFlow) {
        importFlowProfile(bundle.conversationalFlow);
    }
    if (bundle.repair) {
        importRepairProfile(bundle.repair);
    }
    if (bundle.hope) {
        importHopeProfile(bundle.hope);
    }
    if (bundle.lifeChapter) {
        importChapterProfile(bundle.lifeChapter);
    }
    log.info({ userId: bundle.userId }, '📦 Deep understanding bundle imported');
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Delete all deep understanding profiles for a user (for GDPR deletion)
 */
export async function deleteDeepUnderstandingProfiles(userId) {
    try {
        const batch = getDb().batch();
        const collection = getDb().collection('bogle_users').doc(userId).collection(COLLECTION_NAME);
        const docs = await collection.listDocuments();
        for (const doc of docs) {
            batch.delete(doc);
        }
        await batch.commit();
        log.info({ userId }, '🗑️ Deep understanding profiles deleted');
    }
    catch (error) {
        log.error({ error, userId }, 'Failed to delete deep understanding profiles');
        throw error;
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    saveDeepUnderstandingProfiles,
    loadDeepUnderstandingProfiles,
    onSessionStart,
    onSessionEnd,
    periodicSync,
    exportDeepUnderstandingBundle,
    importDeepUnderstandingBundle,
    deleteDeepUnderstandingProfiles,
};
//# sourceMappingURL=persistence.js.map