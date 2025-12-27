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

import { createLogger } from '../utils/safe-logger.js';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// Import all deep understanding systems
import {
  getSilencePattern,
  importSilencePattern,
  type SilencePattern,
} from './silence-intelligence.js';

import {
  getLifeRhythmProfile,
  importLifeRhythmProfile,
  type LifeRhythmProfile,
} from './life-rhythm-prediction.js';

import {
  getRelationalNetwork,
  importRelationalNetwork,
  type RelationalNetwork,
} from './relational-network.js';

import {
  getResistanceProfile,
  importResistanceProfile,
  type ResistanceProfile,
} from './resistance-detection.js';

import { getEnergyPattern, importEnergyPattern, type EnergyPattern } from './energy-state.js';

import {
  getSubconsciousProfile,
  importSubconsciousProfile,
  type SubconsciousProfile,
} from './subconscious-goals.js';

import { getFlowProfile, importFlowProfile, type FlowProfile } from './conversational-flow.js';

import {
  getRepairProfile,
  importRepairProfile,
  type RepairProfile,
} from './repair-intelligence.js';

import { getHopeProfile, importHopeProfile, type HopeProfile } from './hope-trajectory.js';

import { getChapterProfile, importChapterProfile, type ChapterProfile } from './life-chapter.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

const log = createLogger({ module: 'DeepUnderstandingPersistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface DeepUnderstandingBundle {
  userId: string;
  // All 10 systems
  silencePattern?: SilencePattern;
  lifeRhythm?: LifeRhythmProfile;
  relationalNetwork?: RelationalNetwork;
  resistance?: ResistanceProfile;
  energy?: EnergyPattern;
  subconscious?: SubconsciousProfile;
  conversationalFlow?: FlowProfile;
  repair?: RepairProfile;
  hope?: HopeProfile;
  lifeChapter?: ChapterProfile;
  // Metadata
  lastSynced: Date;
  version: number;
}

interface FirestoreDoc {
  data: string; // JSON stringified profile
  updatedAt: FirebaseFirestore.FieldValue;
  version: number;
}

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
} as const;

// ============================================================================
// FIRESTORE ACCESS
// ============================================================================

let db: FirebaseFirestore.Firestore | null = null;

function getDb(): FirebaseFirestore.Firestore {
  if (!db) {
    try {
      db = getFirestore();
    } catch (error) {
      log.warn({ error }, 'Firestore not initialized, using memory-only mode');
      throw new Error('Firestore not available');
    }
  }
  return db;
}

/**
 * Get deep understanding document reference
 */
function getDoc(userId: string, systemName: string) {
  return getDb().collection('bogle_users').doc(userId).collection(COLLECTION_NAME).doc(systemName);
}

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

/**
 * Save a single system profile
 */
async function saveSystemProfile<T>(
  userId: string,
  systemName: string,
  profile: T | null | undefined
): Promise<boolean> {
  if (!profile) return false;

  try {
    const doc: FirestoreDoc = {
      data: JSON.stringify(profile),
      updatedAt: FieldValue.serverTimestamp(),
      version: CURRENT_VERSION,
    };

    await getDoc(userId, systemName).set(cleanForFirestore(doc), { merge: true });
    log.debug({ userId, systemName }, 'Deep understanding profile saved');
    return true;
  } catch (error) {
    log.error({ error, userId, systemName }, 'Failed to save deep understanding profile');
    return false;
  }
}

/**
 * Save all deep understanding profiles for a user
 */
export async function saveDeepUnderstandingProfiles(userId: string): Promise<{
  saved: string[];
  failed: string[];
}> {
  const saved: string[] = [];
  const failed: string[] = [];

  // 1. Silence Pattern
  const silencePattern = getSilencePattern(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.silencePattern, silencePattern)) {
    saved.push('silencePattern');
  } else if (silencePattern) {
    failed.push('silencePattern');
  }

  // 2. Life Rhythm
  const lifeRhythm = getLifeRhythmProfile(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.lifeRhythm, lifeRhythm)) {
    saved.push('lifeRhythm');
  } else if (lifeRhythm) {
    failed.push('lifeRhythm');
  }

  // 3. Relational Network
  const relationalNetwork = getRelationalNetwork(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.relationalNetwork, relationalNetwork)) {
    saved.push('relationalNetwork');
  } else if (relationalNetwork) {
    failed.push('relationalNetwork');
  }

  // 4. Resistance
  const resistance = getResistanceProfile(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.resistance, resistance)) {
    saved.push('resistance');
  } else if (resistance) {
    failed.push('resistance');
  }

  // 5. Energy
  const energy = getEnergyPattern(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.energy, energy)) {
    saved.push('energy');
  } else if (energy) {
    failed.push('energy');
  }

  // 6. Subconscious
  const subconscious = getSubconsciousProfile(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.subconscious, subconscious)) {
    saved.push('subconscious');
  } else if (subconscious) {
    failed.push('subconscious');
  }

  // 7. Conversational Flow
  const conversationalFlow = getFlowProfile(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.conversationalFlow, conversationalFlow)) {
    saved.push('conversationalFlow');
  } else if (conversationalFlow) {
    failed.push('conversationalFlow');
  }

  // 8. Repair
  const repair = getRepairProfile(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.repair, repair)) {
    saved.push('repair');
  } else if (repair) {
    failed.push('repair');
  }

  // 9. Hope
  const hope = getHopeProfile(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.hope, hope)) {
    saved.push('hope');
  } else if (hope) {
    failed.push('hope');
  }

  // 10. Life Chapter
  const lifeChapter = getChapterProfile(userId);
  if (await saveSystemProfile(userId, SYSTEM_NAMES.lifeChapter, lifeChapter)) {
    saved.push('lifeChapter');
  } else if (lifeChapter) {
    failed.push('lifeChapter');
  }

  log.info(
    { userId, saved: saved.length, failed: failed.length },
    '💾 Deep understanding profiles saved'
  );

  return { saved, failed };
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

/**
 * Load a single system profile
 */
async function loadSystemProfile<T>(userId: string, systemName: string): Promise<T | null> {
  try {
    const doc = await getDoc(userId, systemName).get();

    if (!doc.exists) {
      return null;
    }

    const data = doc.data() as FirestoreDoc;
    return JSON.parse(data.data) as T;
  } catch (error) {
    log.warn({ error, userId, systemName }, 'Failed to load deep understanding profile');
    return null;
  }
}

/**
 * Load all deep understanding profiles for a user and import them into memory
 */
export async function loadDeepUnderstandingProfiles(userId: string): Promise<{
  loaded: string[];
  notFound: string[];
}> {
  const loaded: string[] = [];
  const notFound: string[] = [];

  // 1. Silence Pattern
  const silencePattern = await loadSystemProfile<SilencePattern>(
    userId,
    SYSTEM_NAMES.silencePattern
  );
  if (silencePattern) {
    importSilencePattern(silencePattern);
    loaded.push('silencePattern');
  } else {
    notFound.push('silencePattern');
  }

  // 2. Life Rhythm
  const lifeRhythm = await loadSystemProfile<LifeRhythmProfile>(userId, SYSTEM_NAMES.lifeRhythm);
  if (lifeRhythm) {
    importLifeRhythmProfile(lifeRhythm);
    loaded.push('lifeRhythm');
  } else {
    notFound.push('lifeRhythm');
  }

  // 3. Relational Network
  const relationalNetwork = await loadSystemProfile<RelationalNetwork>(
    userId,
    SYSTEM_NAMES.relationalNetwork
  );
  if (relationalNetwork) {
    importRelationalNetwork(relationalNetwork);
    loaded.push('relationalNetwork');
  } else {
    notFound.push('relationalNetwork');
  }

  // 4. Resistance
  const resistance = await loadSystemProfile<ResistanceProfile>(userId, SYSTEM_NAMES.resistance);
  if (resistance) {
    importResistanceProfile(resistance);
    loaded.push('resistance');
  } else {
    notFound.push('resistance');
  }

  // 5. Energy
  const energy = await loadSystemProfile<EnergyPattern>(userId, SYSTEM_NAMES.energy);
  if (energy) {
    importEnergyPattern(energy);
    loaded.push('energy');
  } else {
    notFound.push('energy');
  }

  // 6. Subconscious
  const subconscious = await loadSystemProfile<SubconsciousProfile>(
    userId,
    SYSTEM_NAMES.subconscious
  );
  if (subconscious) {
    importSubconsciousProfile(subconscious);
    loaded.push('subconscious');
  } else {
    notFound.push('subconscious');
  }

  // 7. Conversational Flow
  const conversationalFlow = await loadSystemProfile<FlowProfile>(
    userId,
    SYSTEM_NAMES.conversationalFlow
  );
  if (conversationalFlow) {
    importFlowProfile(conversationalFlow);
    loaded.push('conversationalFlow');
  } else {
    notFound.push('conversationalFlow');
  }

  // 8. Repair
  const repair = await loadSystemProfile<RepairProfile>(userId, SYSTEM_NAMES.repair);
  if (repair) {
    importRepairProfile(repair);
    loaded.push('repair');
  } else {
    notFound.push('repair');
  }

  // 9. Hope
  const hope = await loadSystemProfile<HopeProfile>(userId, SYSTEM_NAMES.hope);
  if (hope) {
    importHopeProfile(hope);
    loaded.push('hope');
  } else {
    notFound.push('hope');
  }

  // 10. Life Chapter
  const lifeChapter = await loadSystemProfile<ChapterProfile>(userId, SYSTEM_NAMES.lifeChapter);
  if (lifeChapter) {
    importChapterProfile(lifeChapter);
    loaded.push('lifeChapter');
  } else {
    notFound.push('lifeChapter');
  }

  log.info(
    { userId, loaded: loaded.length, notFound: notFound.length },
    '📂 Deep understanding profiles loaded'
  );

  return { loaded, notFound };
}

// ============================================================================
// SESSION HOOKS
// ============================================================================

/**
 * Call at session start to load deep understanding profiles
 */
export async function onSessionStart(userId: string): Promise<void> {
  try {
    await loadDeepUnderstandingProfiles(userId);
  } catch (error) {
    log.warn({ error, userId }, 'Deep understanding profile load failed, starting fresh');
  }
}

/**
 * Call at session end to save deep understanding profiles
 */
export async function onSessionEnd(userId: string): Promise<void> {
  try {
    await saveDeepUnderstandingProfiles(userId);
  } catch (error) {
    log.error({ error, userId }, 'Deep understanding profile save failed');
  }
}

/**
 * Periodic sync during long sessions (every 5 minutes)
 */
export async function periodicSync(userId: string): Promise<void> {
  try {
    const { saved, failed } = await saveDeepUnderstandingProfiles(userId);
    if (failed.length > 0) {
      log.warn({ userId, failed }, 'Some deep understanding profiles failed to sync');
    }
  } catch (error) {
    log.warn({ error, userId }, 'Periodic deep understanding sync failed');
  }
}

// ============================================================================
// BUNDLE OPERATIONS
// ============================================================================

/**
 * Export all deep understanding profiles as a single bundle
 */
export function exportDeepUnderstandingBundle(userId: string): DeepUnderstandingBundle {
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
export function importDeepUnderstandingBundle(bundle: DeepUnderstandingBundle): void {
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
export async function deleteDeepUnderstandingProfiles(userId: string): Promise<void> {
  try {
    const batch = getDb().batch();
    const collection = getDb().collection('bogle_users').doc(userId).collection(COLLECTION_NAME);

    const docs = await collection.listDocuments();
    for (const doc of docs) {
      batch.delete(doc);
    }

    await batch.commit();
    log.info({ userId }, '🗑️ Deep understanding profiles deleted');
  } catch (error) {
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
