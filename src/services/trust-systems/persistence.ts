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
import { loadDashboardHistory, saveDashboardHistory } from './dashboard-history.js';
import { readTrustDoc, writeTrustDoc, getTrustDb, TRUST_COLLECTION } from './trust-doc.js';

// Trust system imports
import { exportBoundaries, importBoundaries, type BoundaryProfile } from './boundary-memory.js';

import {
  exportGrowthProfile,
  importGrowthProfile,
  type GrowthProfile,
} from './growth-reflection.js';

import {
  exportInsideJokesProfile,
  importInsideJokesProfile,
  type InsideJokesProfile,
} from './inside-jokes.js';

import {
  exportSmallWinsProfile,
  importSmallWinsProfile,
  type SmallWinsProfile,
} from './small-wins.js';

import {
  exportThinkingOfYouProfile,
  importThinkingOfYouProfile,
  type ThinkingOfYouProfile,
} from './thinking-of-you.js';

import {
  getUnsaidProfile,
  exportUnsaidProfile,
  importUnsaidProfile,
  type UserUnsaidProfile,
  type PersistedUserUnsaidProfile,
} from './reading-between-lines.js';

// Phase 12-17, 24-29: New trust system imports for persistence
import { getHealthScore, type RelationshipHealthScore } from './relationship-health.js';

import { getMomentumProfile, type MomentumProfile } from './celebration-momentum.js';

import type { SentimentTimeline } from './sentiment-timeline.js';

import { getBaseline, type PersonalBaseline } from './voice-prosody-learning.js';

import { getJournalingPatterns, type JournalingPattern } from './journaling-prompts.js';

import { getSeasonalProfile, type SeasonalProfile } from './seasonal-awareness.js';

import { getLearningProfile, type LearningProfile } from './learning-style.js';

import { getMediaPreferences, type MediaPreferences } from './media-suggestions.js';

import { getReportHistory, type InsightsReport } from './relationship-insights.js';

const log = createLogger({ module: 'TrustPersistence' });

// ============================================================================
// TYPES
// ============================================================================

export interface TrustProfileBundle {
  userId: string;
  // Core systems
  boundaries?: BoundaryProfile;
  growth?: GrowthProfile;
  insideJokes?: InsideJokesProfile;
  smallWins?: SmallWinsProfile;
  thinkingOfYou?: ThinkingOfYouProfile;
  unsaid?: PersistedUserUnsaidProfile;
  // Phase 12-17: Advanced trust systems
  relationshipHealth?: RelationshipHealthScore;
  celebrationMomentum?: MomentumProfile;
  sentimentTimeline?: SentimentTimeline;
  // Phase 24-29: Personalization systems
  voiceProsody?: PersonalBaseline;
  journaling?: JournalingPattern;
  seasonal?: SeasonalProfile;
  learningStyle?: LearningProfile;
  mediaPreferences?: MediaPreferences;
  insightsReports?: InsightsReport[];
  // Metadata
  lastSynced: Date;
  version: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

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
} as const;

// ============================================================================
// SAVE FUNCTIONS
// ============================================================================

/**
 * Save all trust profiles for a user. The dashboard's history (sentiment
 * timeline, life events) saves through dashboard-history.ts.
 */
export async function saveTrustProfiles(userId: string): Promise<{
  saved: string[];
  failed: string[];
}> {
  const saved: string[] = [];
  const failed: string[] = [];
  const insightsReports = getReportHistory(userId);

  const profiles: Array<[Exclude<keyof typeof SYSTEM_NAMES, 'unsaid'>, unknown]> = [
    // Core systems
    ['boundaries', exportBoundaries(userId)],
    ['growth', exportGrowthProfile(userId)],
    ['insideJokes', exportInsideJokesProfile(userId)],
    ['smallWins', exportSmallWinsProfile(userId)],
    ['thinkingOfYou', exportThinkingOfYouProfile(userId)],
    // Phase 12-17: advanced trust systems
    ['relationshipHealth', getHealthScore(userId)],
    ['celebrationMomentum', getMomentumProfile(userId)],
    // Phase 24-29: personalization systems
    ['voiceProsody', getBaseline(userId)],
    ['journaling', getJournalingPatterns(userId)],
    ['seasonal', getSeasonalProfile(userId)],
    ['learningStyle', getLearningProfile(userId)],
    ['mediaPreferences', getMediaPreferences(userId)],
    ['insightsReports', insightsReports.length > 0 ? insightsReports : null],
  ];

  for (const [name, profile] of profiles) {
    if (!profile) continue;
    if (await writeTrustDoc(userId, SYSTEM_NAMES[name], profile)) saved.push(name);
    else failed.push(name);
  }

  const history = await saveDashboardHistory(userId);
  saved.push(...history.saved);
  failed.push(...history.failed);

  log.info({ userId, saved: saved.length, failed: failed.length }, '💾 Trust profiles saved');

  return { saved, failed };
}

// ============================================================================
// LOAD FUNCTIONS
// ============================================================================

/** Load a single trust system profile (null when missing or unreadable). */
async function loadSystemProfile<T>(userId: string, systemName: string): Promise<T | null> {
  const read = await readTrustDoc<T>(userId, systemName);
  return read.status === 'found' ? read.data : null;
}

/**
 * Load all trust profiles for a user and import them into memory
 */
export async function loadTrustProfiles(userId: string): Promise<{
  loaded: string[];
  notFound: string[];
}> {
  const loaded: string[] = [];
  const notFound: string[] = [];

  // Boundaries
  const boundaries = await loadSystemProfile<BoundaryProfile>(userId, SYSTEM_NAMES.boundaries);
  if (boundaries) {
    importBoundaries(boundaries);
    loaded.push('boundaries');
  } else {
    notFound.push('boundaries');
  }

  // Growth
  const growth = await loadSystemProfile<GrowthProfile>(userId, SYSTEM_NAMES.growth);
  if (growth) {
    importGrowthProfile(growth);
    loaded.push('growth');
  } else {
    notFound.push('growth');
  }

  // Inside Jokes
  const insideJokes = await loadSystemProfile<InsideJokesProfile>(userId, SYSTEM_NAMES.insideJokes);
  if (insideJokes) {
    importInsideJokesProfile(insideJokes);
    loaded.push('insideJokes');
  } else {
    notFound.push('insideJokes');
  }

  // Small Wins
  const smallWins = await loadSystemProfile<SmallWinsProfile>(userId, SYSTEM_NAMES.smallWins);
  if (smallWins) {
    importSmallWinsProfile(smallWins);
    loaded.push('smallWins');
  } else {
    notFound.push('smallWins');
  }

  // Thinking of You
  const thinkingOfYou = await loadSystemProfile<ThinkingOfYouProfile>(
    userId,
    SYSTEM_NAMES.thinkingOfYou
  );
  if (thinkingOfYou) {
    importThinkingOfYouProfile(thinkingOfYou);
    loaded.push('thinkingOfYou');
  } else {
    notFound.push('thinkingOfYou');
  }

  // Sentiment timeline + life events: the dashboard's history.
  const history = await loadDashboardHistory(userId);
  loaded.push(...history);
  for (const name of ['sentimentTimeline', 'lifeEvents']) {
    if (!history.includes(name)) notFound.push(name);
  }

  log.info(
    { userId, loaded: loaded.length, notFound: notFound.length },
    '📂 Trust profiles loaded'
  );

  return { loaded, notFound };
}

// ============================================================================
// SESSION HOOKS
// ============================================================================

/**
 * Call at session start to load trust profiles
 */
export async function onSessionStart(userId: string): Promise<void> {
  try {
    await loadTrustProfiles(userId);
  } catch (error) {
    log.warn({ error, userId }, 'Trust profile load failed, starting fresh');
  }
}

/**
 * Call at session end to save trust profiles
 */
export async function onSessionEnd(userId: string): Promise<void> {
  try {
    await saveTrustProfiles(userId);
  } catch (error) {
    log.error({ error, userId }, 'Trust profile save failed');
  }
}

/**
 * Periodic sync during long sessions (every 5 minutes)
 */
export async function periodicSync(userId: string): Promise<void> {
  try {
    const { saved, failed } = await saveTrustProfiles(userId);
    if (failed.length > 0) {
      log.warn({ userId, failed }, 'Some trust profiles failed to sync');
    }
  } catch (error) {
    log.warn({ error, userId }, 'Periodic trust sync failed');
  }
}

// ============================================================================
// BUNDLE OPERATIONS
// ============================================================================

/**
 * Export all trust profiles as a single bundle
 */
export function exportTrustBundle(userId: string): TrustProfileBundle {
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
export function importTrustBundle(bundle: TrustProfileBundle): void {
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
export async function migrateTrustData(userId: string): Promise<void> {
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
export async function deleteTrustProfiles(userId: string): Promise<void> {
  try {
    const db = getTrustDb();
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
  } catch (error) {
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
