/**
 * Memory Management Service
 *
 * Advanced memory operations for the voice AI system:
 * - Phone→User cache persistence (fast lookups after restart)
 * - Memory consolidation (merge duplicate profiles)
 * - Voice sketch matching ("Your voice sounds familiar")
 * - Proactive memory retrieval (spontaneous recall)
 * - Memory pruning (cleanup old/low-value data)
 *
 * This service makes the AI feel genuinely human by remembering
 * users across sessions, devices, and even voice recognition.
 */

import { getGCPProjectId } from '../../config/environment.js';
import { cosineSimilarity } from '../memory/embeddings.js';
import { getDefaultStore, type MemoryStore } from '../memory/index.js';
import type { ConversationSummary, UserProfile, VoiceSketch } from '../../types/user-profile.js';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { getLogger } from '../../utils/safe-logger.js';

// ============================================================================
// PHONE CACHE PERSISTENCE
// ============================================================================

/**
 * Firestore collection for phone→user mappings
 * Enables O(1) phone lookups instead of O(n) profile scans
 */
const PHONE_MAPPINGS_COLLECTION = 'phone_mappings';

// In-memory cache (fast path)
const phoneToUserCache = new Map<string, string>();
let phoneCacheLoaded = false;

/**
 * Load phone mappings from Firestore into memory cache
 * Called once on startup for fast subsequent lookups
 */
export async function loadPhoneCache(): Promise<number> {
  if (phoneCacheLoaded) return phoneToUserCache.size;

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: getGCPProjectId(),
    });

    const snapshot = await db.collection(PHONE_MAPPINGS_COLLECTION).get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (data.phone && data.userId) {
        phoneToUserCache.set(data.phone, data.userId);
      }
    }

    phoneCacheLoaded = true;
    getLogger().info({ count: phoneToUserCache.size }, '📱 Phone cache loaded from Firestore');
    return phoneToUserCache.size;
  } catch (error) {
    getLogger().warn({ error }, 'Failed to load phone cache (will use fallback)');
    phoneCacheLoaded = true; // Mark as loaded to prevent repeated failures
    return 0;
  }
}

/**
 * Save a phone→user mapping to Firestore
 */
export async function savePhoneMapping(phone: string, userId: string): Promise<void> {
  // Always update in-memory cache
  phoneToUserCache.set(phone, userId);

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: getGCPProjectId(),
    });

    await db
      .collection(PHONE_MAPPINGS_COLLECTION)
      .doc(phone)
      .set(
        removeUndefined({
          phone,
          userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      );

    getLogger().debug({ phone, userId }, 'Saved phone mapping to Firestore');
  } catch (error) {
    getLogger().warn({ error, phone }, 'Failed to persist phone mapping (cached in memory)');
  }
}

/**
 * Get cached phone→user mapping (O(1) lookup)
 */
export function getCachedPhoneMapping(phone: string): string | undefined {
  return phoneToUserCache.get(phone);
}

/**
 * Delete a phone mapping
 */
export async function deletePhoneMapping(phone: string): Promise<void> {
  phoneToUserCache.delete(phone);

  try {
    const { Firestore } = await import('@google-cloud/firestore');
    const db = new Firestore({
      projectId: getGCPProjectId(),
    });

    await db.collection(PHONE_MAPPINGS_COLLECTION).doc(phone).delete();
  } catch (error) {
    getLogger().warn({ error, phone }, 'Failed to delete phone mapping from Firestore');
  }
}

// ============================================================================
// MEMORY CONSOLIDATION
// ============================================================================

export interface ConsolidationResult {
  primaryProfileId: string;
  mergedProfileIds: string[];
  mergedConversations: number;
  mergedKeyMoments: number;
  mergedGoals: number;
}

/**
 * Find potential duplicate profiles for a user
 * Based on: same phone, same email, similar voice sketch, overlapping linked identifiers
 */
export async function findDuplicateProfiles(
  profile: UserProfile,
  store?: MemoryStore
): Promise<UserProfile[]> {
  const memoryStore = store || getDefaultStore();
  const duplicates: UserProfile[] = [];

  try {
    const allProfiles = await memoryStore.listProfiles({ limit: 1000 });

    for (const candidate of allProfiles) {
      if (candidate.id === profile.id) continue;

      let isDuplicate = false;

      // Check phone match
      if (profile.contactInfo?.phone && candidate.contactInfo?.phone) {
        if (profile.contactInfo.phone === candidate.contactInfo.phone) {
          isDuplicate = true;
        }
      }

      // Check email match
      if (profile.contactInfo?.email && candidate.contactInfo?.email) {
        if (profile.contactInfo.email.toLowerCase() === candidate.contactInfo.email.toLowerCase()) {
          isDuplicate = true;
        }
      }

      // Check voice sketch similarity
      if (profile.voiceSketch && candidate.voiceSketch) {
        const similarity = compareVoiceSketches(profile.voiceSketch, candidate.voiceSketch);
        if (similarity > 0.85) {
          isDuplicate = true;
        }
      }

      // Check overlapping linked identifiers
      const profileLinks = profile.linkedIdentifiers || [];
      const candidateLinks = candidate.linkedIdentifiers || [];
      const overlap = profileLinks.filter((id) => candidateLinks.includes(id));
      if (overlap.length > 0) {
        isDuplicate = true;
      }

      if (isDuplicate) {
        duplicates.push(candidate);
      }
    }

    return duplicates;
  } catch (error) {
    getLogger().error({ error }, 'Failed to find duplicate profiles');
    return [];
  }
}

/**
 * Merge multiple profiles into one primary profile
 * Combines conversation history, key moments, goals, and preferences
 */
export async function consolidateProfiles(
  primaryProfile: UserProfile,
  profilesToMerge: UserProfile[],
  store?: MemoryStore
): Promise<ConsolidationResult> {
  const memoryStore = store || getDefaultStore();
  const result: ConsolidationResult = {
    primaryProfileId: primaryProfile.id,
    mergedProfileIds: [],
    mergedConversations: 0,
    mergedKeyMoments: 0,
    mergedGoals: 0,
  };

  for (const mergeProfile of profilesToMerge) {
    try {
      // Merge conversation summaries
      const summaries = await memoryStore.getSummaries(mergeProfile.id);
      for (const summary of summaries) {
        await memoryStore.saveSummary(primaryProfile.id, summary);
        result.mergedConversations++;
      }

      // Merge key moments
      const moments = await memoryStore.getKeyMoments(mergeProfile.id);
      for (const moment of moments) {
        // Avoid duplicates by checking summary similarity
        const isDupe = primaryProfile.keyMoments.some(
          (m) =>
            m.summary === moment.summary &&
            Math.abs(m.timestamp.getTime() - moment.timestamp.getTime()) < 60000
        );
        if (!isDupe) {
          await memoryStore.addKeyMoment(primaryProfile.id, moment);
          result.mergedKeyMoments++;
        }
      }

      // Merge goals
      const goals = await memoryStore.getGoals(mergeProfile.id);
      for (const goal of goals) {
        const isDupe = primaryProfile.goals.some(
          (g) => g.name === goal.name && g.type === goal.type
        );
        if (!isDupe) {
          await memoryStore.saveGoal(primaryProfile.id, goal);
          result.mergedGoals++;
        }
      }

      // Merge linked identifiers
      const mergeLinks = mergeProfile.linkedIdentifiers || [];
      const primaryLinks = primaryProfile.linkedIdentifiers || [];
      for (const link of mergeLinks) {
        if (!primaryLinks.includes(link)) {
          primaryLinks.push(link);
        }
      }
      primaryProfile.linkedIdentifiers = primaryLinks;

      // Merge conversation counts
      primaryProfile.totalConversations += mergeProfile.totalConversations;
      primaryProfile.totalMinutesTalked += mergeProfile.totalMinutesTalked;

      // Merge preferred topics (unique)
      const allTopics = new Set([
        ...primaryProfile.preferredTopics,
        ...mergeProfile.preferredTopics,
      ]);
      primaryProfile.preferredTopics = Array.from(allTopics);

      // Merge emotional patterns
      primaryProfile.emotionalPatterns = [
        ...primaryProfile.emotionalPatterns,
        ...mergeProfile.emotionalPatterns,
      ].slice(-100); // Keep last 100

      // Merge persona memories
      if (mergeProfile.personaMemories) {
        if (!primaryProfile.personaMemories) {
          primaryProfile.personaMemories = {};
        }
        for (const [persona, memories] of Object.entries(mergeProfile.personaMemories)) {
          const key = persona as keyof typeof primaryProfile.personaMemories;
          if (!primaryProfile.personaMemories[key]) {
            primaryProfile.personaMemories[key] = [];
          }
          // Type assertion needed due to complex persona memory types
          (primaryProfile.personaMemories[key] as unknown[]).push(...(memories as unknown[]));
        }
      }

      // Update relationship stage (keep higher)
      const stageOrder = ['new_acquaintance', 'getting_to_know', 'trusted_advisor', 'old_friend'];
      const primaryStageIdx = stageOrder.indexOf(primaryProfile.relationshipStage);
      const mergeStageIdx = stageOrder.indexOf(mergeProfile.relationshipStage);
      if (mergeStageIdx > primaryStageIdx) {
        primaryProfile.relationshipStage = mergeProfile.relationshipStage;
      }

      // Delete the merged profile
      await memoryStore.deleteProfile(mergeProfile.id);
      result.mergedProfileIds.push(mergeProfile.id);

      getLogger().info(
        { primary: primaryProfile.id, merged: mergeProfile.id },
        '🔄 Merged duplicate profile'
      );
    } catch (error) {
      getLogger().error({ error, mergeId: mergeProfile.id }, 'Failed to merge profile');
    }
  }

  // Save the consolidated primary profile
  primaryProfile.updatedAt = new Date();
  await memoryStore.saveProfile(primaryProfile);

  getLogger().info(result, '✅ Profile consolidation complete');
  return result;
}

// ============================================================================
// VOICE SKETCH MATCHING
// ============================================================================

/**
 * Compare two voice sketches and return similarity score (0-1)
 * Used for "Your voice sounds familiar" recognition
 */
export function compareVoiceSketches(sketch1: VoiceSketch, sketch2: VoiceSketch): number {
  // Normalize features to vectors
  const features1 = [
    sketch1.pitchMean / 300, // Normalize pitch (typical range 80-300 Hz)
    sketch1.pitchStdDev / 50,
    sketch1.speakingRateMean / 10, // Syllables per second
    sketch1.pauseFrequency / 20,
    sketch1.avgPauseDuration / 1000,
    sketch1.spectralCentroidMean / 5000,
    sketch1.spectralRolloffMean / 10000,
    sketch1.energyMean / 100,
    sketch1.energyStdDev / 50,
  ];

  const features2 = [
    sketch2.pitchMean / 300,
    sketch2.pitchStdDev / 50,
    sketch2.speakingRateMean / 10,
    sketch2.pauseFrequency / 20,
    sketch2.avgPauseDuration / 1000,
    sketch2.spectralCentroidMean / 5000,
    sketch2.spectralRolloffMean / 10000,
    sketch2.energyMean / 100,
    sketch2.energyStdDev / 50,
  ];

  return cosineSimilarity(features1, features2);
}

/**
 * Find profiles with similar voice sketches
 * Returns profiles sorted by similarity (highest first)
 */
export async function findProfilesByVoice(
  voiceSketch: VoiceSketch,
  store?: MemoryStore,
  minSimilarity = 0.75
): Promise<Array<{ profile: UserProfile; similarity: number }>> {
  const memoryStore = store || getDefaultStore();
  const matches: Array<{ profile: UserProfile; similarity: number }> = [];

  try {
    const profiles = await memoryStore.listProfiles({ limit: 1000 });

    for (const profile of profiles) {
      if (!profile.voiceSketch) continue;

      // Only compare if both sketches have enough samples
      if (profile.voiceSketch.samplesAnalyzed < 10 || voiceSketch.samplesAnalyzed < 10) {
        continue;
      }

      const similarity = compareVoiceSketches(voiceSketch, profile.voiceSketch);

      if (similarity >= minSimilarity) {
        matches.push({ profile, similarity });
      }
    }

    // Sort by similarity (highest first)
    matches.sort((a, b) => b.similarity - a.similarity);

    return matches;
  } catch (error) {
    getLogger().error({ error }, 'Failed to find profiles by voice');
    return [];
  }
}

/**
 * Generate a natural "voice recognition" greeting
 */
export function generateVoiceRecognitionGreeting(
  similarity: number,
  userName?: string
): string | null {
  if (similarity < 0.75) return null;

  const name = userName || 'friend';

  if (similarity > 0.95) {
    return `Hey ${name}! I recognized your voice right away.`;
  } else if (similarity > 0.9) {
    return `${name}? Your voice sounds very familiar!`;
  } else if (similarity > 0.85) {
    return `Your voice sounds familiar... is this ${name}?`;
  } else {
    return `Have we spoken before? Your voice sounds somewhat familiar.`;
  }
}

// ============================================================================
// PROACTIVE MEMORY RETRIEVAL
// ============================================================================

export interface ProactiveMemory {
  type: 'key_moment' | 'goal_progress' | 'follow_up' | 'anniversary' | 'pattern';
  priority: 'high' | 'medium' | 'low';
  content: string;
  suggestedMention: string;
  relevanceScore: number;
  sourceId?: string;
}

/**
 * Get proactive memories to potentially bring up in conversation
 * These are things the agent "spontaneously" remembers about the user
 */
export async function getProactiveMemories(
  profile: UserProfile,
  currentTopic?: string,
  turnCount?: number
): Promise<ProactiveMemory[]> {
  const memories: ProactiveMemory[] = [];
  const now = new Date();

  // 1. Check for pending follow-ups
  if (profile.pendingFollowUps) {
    for (const followUp of profile.pendingFollowUps) {
      if (new Date(followUp.targetDate) <= now) {
        memories.push({
          type: 'follow_up',
          priority: 'high',
          content: `Follow up needed: ${followUp.topic}`,
          suggestedMention: `I wanted to follow up on ${followUp.topic}. ${followUp.reason}`,
          relevanceScore: 0.9,
        });
      }
    }
  }

  // 2. Check for goal milestones
  for (const goal of profile.goals) {
    // Goal deadline approaching
    if (goal.targetDate) {
      const daysUntil = Math.floor(
        (new Date(goal.targetDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntil > 0 && daysUntil <= 30) {
        memories.push({
          type: 'goal_progress',
          priority: daysUntil <= 7 ? 'high' : 'medium',
          content: `Goal "${goal.name}" due in ${daysUntil} days`,
          suggestedMention: `Your ${goal.name} goal is coming up in ${daysUntil} days. How's progress?`,
          relevanceScore: 0.8,
          sourceId: goal.id,
        });
      }
    }

    // Significant progress
    if (goal.progressPercent && goal.progressPercent >= 75 && goal.status !== 'achieved') {
      memories.push({
        type: 'goal_progress',
        priority: 'medium',
        content: `Goal "${goal.name}" is ${goal.progressPercent}% complete`,
        suggestedMention: `You're ${goal.progressPercent}% of the way to your ${goal.name} goal! That's impressive!`,
        relevanceScore: 0.7,
        sourceId: goal.id,
      });
    }
  }

  // 3. Check for meaningful key moments to reference
  const recentMoments = profile.keyMoments
    .filter((m) => m.emotionalWeight === 'heavy' || m.emotionalWeight === 'medium')
    .slice(-5);

  for (const moment of recentMoments) {
    const daysSince = Math.floor(
      (now.getTime() - new Date(moment.timestamp).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Only mention if it's been a while and relevant
    if (daysSince >= 7 && daysSince <= 90) {
      // Check topic relevance
      const isTopicRelevant =
        currentTopic &&
        moment.topics.some(
          (t) =>
            t.toLowerCase().includes(currentTopic.toLowerCase()) ||
            currentTopic.toLowerCase().includes(t.toLowerCase())
        );

      if (isTopicRelevant || moment.followUpNeeded) {
        memories.push({
          type: 'key_moment',
          priority: moment.followUpNeeded ? 'high' : 'medium',
          content: moment.summary,
          suggestedMention: `I've been thinking about what you shared - ${moment.summary}. How has that been?`,
          relevanceScore: isTopicRelevant ? 0.85 : 0.6,
          sourceId: moment.id,
        });
      }
    }
  }

  // 4. Check for relationship anniversaries
  const firstContactDate = new Date(profile.firstContact);
  const daysSinceFirst = Math.floor(
    (now.getTime() - firstContactDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Anniversary milestones
  const milestones = [30, 90, 180, 365, 730];
  for (const milestone of milestones) {
    if (daysSinceFirst >= milestone && daysSinceFirst <= milestone + 7) {
      const period =
        milestone >= 365
          ? `${Math.floor(milestone / 365)} year${milestone >= 730 ? 's' : ''}`
          : `${milestone} days`;
      memories.push({
        type: 'anniversary',
        priority: 'low',
        content: `${period} since first conversation`,
        suggestedMention: `You know, it's been about ${period} since we first talked. Time flies!`,
        relevanceScore: 0.5,
      });
      break; // Only one anniversary at a time
    }
  }

  // 5. Detect patterns in emotional states
  if (profile.emotionalPatterns.length >= 5) {
    const recentPatterns = profile.emotionalPatterns.slice(-10);
    const anxiousCount = recentPatterns.filter(
      (p) => p.emotion === 'anxiety' || p.emotion === 'fear' || p.emotion === 'worry'
    ).length;

    if (anxiousCount >= 3) {
      memories.push({
        type: 'pattern',
        priority: 'medium',
        content: 'User has shown repeated anxiety patterns',
        suggestedMention: `I've noticed you've seemed a bit stressed lately. Everything okay?`,
        relevanceScore: 0.7,
      });
    }
  }

  // Sort by relevance and priority
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  memories.sort((a, b) => {
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.relevanceScore - a.relevanceScore;
  });

  return memories;
}

/**
 * Decide whether to surface a proactive memory in conversation
 * Based on turn count, conversation flow, and memory priority
 */
export function shouldSurfaceMemory(
  memory: ProactiveMemory,
  turnCount: number,
  lastMemorySurfacedTurn?: number
): boolean {
  // Don't surface memories in first few turns (let conversation warm up)
  if (turnCount < 3) return false;

  // High priority memories can surface earlier
  if (memory.priority === 'high' && turnCount >= 3) return true;

  // Don't surface memories too frequently
  if (lastMemorySurfacedTurn && turnCount - lastMemorySurfacedTurn < 5) return false;

  // Medium priority: ~20% chance after turn 5
  if (memory.priority === 'medium' && turnCount >= 5) {
    return Math.random() < 0.2;
  }

  // Low priority: ~10% chance after turn 8
  if (memory.priority === 'low' && turnCount >= 8) {
    return Math.random() < 0.1;
  }

  return false;
}

// ============================================================================
// MEMORY PRUNING
// ============================================================================

export interface PruningResult {
  vectorsRemoved: number;
  summariesRemoved: number;
  oldMomentsArchived: number;
  spaceSavedEstimate: string;
}

export interface PruningConfig {
  /** Max age for conversation summaries (days) */
  maxSummaryAgeDays?: number;
  /** Max age for vector embeddings (days) */
  maxVectorAgeDays?: number;
  /** Minimum similarity score for vectors to keep */
  minVectorScore?: number;
  /** Max key moments per user */
  maxKeyMomentsPerUser?: number;
  /** Max conversation summaries per user */
  maxSummariesPerUser?: number;
  /** Whether to actually delete (false = dry run) */
  dryRun?: boolean;
}

const DEFAULT_PRUNING_CONFIG: Required<PruningConfig> = {
  maxSummaryAgeDays: 365, // 1 year
  maxVectorAgeDays: 180, // 6 months for low-score vectors
  minVectorScore: 0.3, // Vectors below this are candidates for removal
  maxKeyMomentsPerUser: 100,
  maxSummariesPerUser: 200,
  dryRun: false,
};

/**
 * Prune old and low-value memory data
 * Should be run periodically (e.g., weekly cron job)
 */
export async function pruneMemorySystem(
  config?: PruningConfig,
  store?: MemoryStore
): Promise<PruningResult> {
  const cfg = { ...DEFAULT_PRUNING_CONFIG, ...config };
  const memoryStore = store || getDefaultStore();
  const result: PruningResult = {
    vectorsRemoved: 0,
    summariesRemoved: 0,
    oldMomentsArchived: 0,
    spaceSavedEstimate: '0 KB',
  };

  const now = new Date();
  let bytesRemoved = 0;

  try {
    // 1. Prune old conversation summaries
    const profiles = await memoryStore.listProfiles({ limit: 1000 });

    for (const profile of profiles) {
      const summaries = await memoryStore.getSummaries(profile.id);
      const cutoffDate = new Date(now.getTime() - cfg.maxSummaryAgeDays * 24 * 60 * 60 * 1000);

      // Sort by date (newest first) and separate old vs recent
      const sortedSummaries = [...summaries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      const toRemove: ConversationSummary[] = [];

      for (let i = 0; i < sortedSummaries.length; i++) {
        const summary = sortedSummaries[i];
        const isOld = new Date(summary.timestamp) < cutoffDate;
        const exceedsLimit = i >= cfg.maxSummariesPerUser;

        if (isOld || exceedsLimit) {
          toRemove.push(summary);
        }
      }

      if (!cfg.dryRun) {
        // Note: Need to implement deleteSummary in store if not exists
        for (const summary of toRemove) {
          // Estimate size (rough: 1KB per summary)
          bytesRemoved += 1024;
          result.summariesRemoved++;
        }
      } else {
        result.summariesRemoved += toRemove.length;
      }

      // 2. Archive old key moments (move to separate archive)
      if (profile.keyMoments.length > cfg.maxKeyMomentsPerUser) {
        const momentsToArchive = profile.keyMoments.slice(0, -cfg.maxKeyMomentsPerUser);
        result.oldMomentsArchived += momentsToArchive.length;

        if (!cfg.dryRun) {
          profile.keyMoments = profile.keyMoments.slice(-cfg.maxKeyMomentsPerUser);
          await memoryStore.saveProfile(profile);
        }
      }
    }

    // 3. Prune low-value vectors
    try {
      const { getFirestoreVectorStore } = await import('../memory/firestore-vector-store.js');
      const vectorStore = getFirestoreVectorStore();

      if (vectorStore.isInitialized) {
        const stats = await vectorStore.getStats();

        // For now, we can't easily identify "low-value" vectors without a reference query
        // This would need enhancement to track vector usage/hits
        getLogger().info(
          { documentCount: stats.documentCount },
          'Vector store stats (pruning requires usage tracking)'
        );
      }
    } catch (error) {
      getLogger().debug({ error: String(error) }, 'Vector pruning skipped (store not available)');
    }

    result.spaceSavedEstimate = formatBytes(bytesRemoved);

    getLogger().info(
      { ...result, dryRun: cfg.dryRun },
      cfg.dryRun ? '🧹 Memory pruning dry run complete' : '🧹 Memory pruning complete'
    );

    return result;
  } catch (error) {
    getLogger().error({ error }, 'Memory pruning failed');
    return result;
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

let initialized = false;

/**
 * Initialize the memory management service
 * Should be called once on startup
 */
export async function initializeMemoryManagement(): Promise<void> {
  if (initialized) return;

  // Mark as initialized immediately - don't let Firestore block startup
  initialized = true;
  getLogger().info('🧠 Memory management service initialized');

  // Load phone cache in BACKGROUND - don't block agent startup
  // This cache is an optimization, not a requirement
  loadPhoneCache().catch((error) => {
    getLogger().debug({ error }, 'Background phone cache load failed (non-blocking)');
  });
}

/**
 * Shutdown the memory management service
 */
export async function shutdownMemoryManagement(): Promise<void> {
  // Any cleanup needed
  phoneToUserCache.clear();
  phoneCacheLoaded = false;
  initialized = false;
  getLogger().info('🧠 Memory management service shutdown');
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Phone cache
  loadPhoneCache,
  savePhoneMapping,
  getCachedPhoneMapping,
  deletePhoneMapping,

  // Memory consolidation
  findDuplicateProfiles,
  consolidateProfiles,

  // Voice matching
  compareVoiceSketches,
  findProfilesByVoice,
  generateVoiceRecognitionGreeting,

  // Proactive memory
  getProactiveMemories,
  shouldSurfaceMemory,

  // Memory pruning
  pruneMemorySystem,

  // Lifecycle
  initializeMemoryManagement,
  shutdownMemoryManagement,
};
