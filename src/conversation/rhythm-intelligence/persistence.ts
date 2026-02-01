/**
 * Rhythm Intelligence Persistence
 *
 * Store and retrieve rhythm profiles.
 *
 * @module @ferni/conversation/rhythm-intelligence/persistence
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { ConversationalRhythm, TurnAnalysis } from './types.js';
import { DEFAULT_RHYTHM_PROFILE, THRESHOLDS } from './constants.js';

const log = createLogger({ module: 'RhythmPersistence' });

// ============================================================================
// MOCK STORAGE (In production, use Firestore)
// ============================================================================

/**
 * In-memory storage for profiles (replaced with Firestore in production)
 */
const profileStorage = new Map<string, ConversationalRhythm>();
const turnHistory = new Map<string, TurnAnalysis[]>();

// ============================================================================
// PROFILE OPERATIONS
// ============================================================================

/**
 * Get user's rhythm profile
 */
export async function getProfile(userId: string): Promise<ConversationalRhythm | null> {
  return profileStorage.get(userId) || null;
}

/**
 * Create default profile for user
 */
export async function createProfile(userId: string): Promise<ConversationalRhythm> {
  const profile: ConversationalRhythm = {
    userId,
    ...DEFAULT_RHYTHM_PROFILE,
    updatedAt: new Date(),
  };

  profileStorage.set(userId, profile);
  return profile;
}

/**
 * Save rhythm profile
 */
export async function saveProfile(profile: ConversationalRhythm): Promise<void> {
  profile.updatedAt = new Date();
  profileStorage.set(profile.userId, profile);
  log.debug({ userId: profile.userId }, 'Rhythm profile saved');
}

/**
 * Record a turn for learning
 */
export async function recordTurn(userId: string, analysis: TurnAnalysis): Promise<void> {
  const history = turnHistory.get(userId) || [];
  history.push(analysis);

  // Keep last 200 turns
  if (history.length > 200) {
    history.shift();
  }

  turnHistory.set(userId, history);

  // Update profile if enough turns
  if (history.length >= THRESHOLDS.minTurnsForProfile) {
    await updateProfileFromHistory(userId, history);
  }
}

/**
 * Update profile based on turn history
 */
async function updateProfileFromHistory(userId: string, history: TurnAnalysis[]): Promise<void> {
  let profile = await getProfile(userId);
  if (!profile) {
    profile = await createProfile(userId);
  }

  // Calculate averages from successful turns
  const successfulTurns = history.filter((t) => t.wasSuccessful !== false);
  if (successfulTurns.length === 0) return;

  // Average word count
  const totalWords = successfulTurns.reduce((sum, t) => sum + t.wordCount, 0);
  profile.avgWordsPerTurn = Math.round(totalWords / successfulTurns.length);

  // Determine preferred length
  if (profile.avgWordsPerTurn < THRESHOLDS.shortTurnWords) {
    profile.preferredResponseLength = 'brief';
  } else if (profile.avgWordsPerTurn < THRESHOLDS.moderateTurnWords) {
    profile.preferredResponseLength = 'moderate';
  } else {
    profile.preferredResponseLength = 'detailed';
  }

  // Update time patterns
  const timeGroups = groupByTime(successfulTurns);
  for (const [time, turns] of Object.entries(timeGroups)) {
    if (turns.length >= 5) {
      const avgWords = turns.reduce((sum, t) => sum + t.wordCount, 0) / turns.length;
      const avgEnergy = mostCommon(turns.map((t) => t.energy));

      profile.timePatterns[time as keyof typeof profile.timePatterns] = {
        length: avgWords < 25 ? 'brief' : avgWords < 50 ? 'moderate' : 'detailed',
        energy: avgEnergy,
        sampleSize: turns.length,
      };
    }
  }

  // Update topic preferences
  const topicGroups = groupByTopic(successfulTurns);
  profile.topicPreferences = [];
  for (const [topic, turns] of Object.entries(topicGroups)) {
    if (turns.length >= THRESHOLDS.minTurnsForTopicPref) {
      const avgWords = turns.reduce((sum, t) => sum + t.wordCount, 0) / turns.length;
      profile.topicPreferences.push({
        topic,
        preferredLength: avgWords < 25 ? 'brief' : avgWords < 50 ? 'moderate' : 'detailed',
        preferredDepth: avgWords < 30 ? 'surface' : avgWords < 60 ? 'moderate' : 'deep',
        sampleSize: turns.length,
      });
    }
  }

  profile.turnsAnalyzed = history.length;

  await saveProfile(profile);
}

/**
 * Group turns by time of day
 */
function groupByTime(turns: TurnAnalysis[]): Record<string, TurnAnalysis[]> {
  const groups: Record<string, TurnAnalysis[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    lateNight: [],
  };

  for (const turn of turns) {
    groups[turn.timeOfDay].push(turn);
  }

  return groups;
}

/**
 * Group turns by topic
 */
function groupByTopic(turns: TurnAnalysis[]): Record<string, TurnAnalysis[]> {
  const groups: Record<string, TurnAnalysis[]> = {};

  for (const turn of turns) {
    if (turn.topic) {
      const topic = turn.topic.toLowerCase();
      groups[topic] = groups[topic] || [];
      groups[topic].push(turn);
    }
  }

  return groups;
}

/**
 * Find most common value in array
 */
function mostCommon<T>(arr: T[]): T {
  const counts = new Map<T, number>();
  let maxCount = 0;
  let mostCommonValue = arr[0];

  for (const item of arr) {
    const count = (counts.get(item) || 0) + 1;
    counts.set(item, count);
    if (count > maxCount) {
      maxCount = count;
      mostCommonValue = item;
    }
  }

  return mostCommonValue;
}

/**
 * Clear user data (for testing)
 */
export async function clearUserData(userId: string): Promise<void> {
  profileStorage.delete(userId);
  turnHistory.delete(userId);
}
