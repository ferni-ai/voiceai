/**
 * Story Tracking Service
 *
 * Tracks which stories have been told to which users, gates stories by
 * relationship stage, and manages narrative arcs.
 *
 * Persists to user profile for cross-session narrative continuity.
 */

import { getLogger } from '../utils/safe-logger.js';
import { getDefaultStore } from '../memory/index.js';
import type { PersonaRelationshipStage } from '../types/user-profile.js';
import { cleanForFirestore } from '../utils/firestore-utils.js';

const logger = getLogger().child({ service: 'StoryTracking' });

// ============================================================================
// Types
// ============================================================================

export interface Story {
  id: string;
  personaId: string;
  title: string;
  content: string;
  emotionalTags: string[];
  relationshipGate: PersonaRelationshipStage;
  category: 'personal' | 'teaching' | 'wisdom' | 'vulnerability' | 'humor';
  followsFrom?: string; // ID of story this continues from
  leadsTo?: string[]; // IDs of stories this can lead into
}

export interface StoryTellingContext {
  personaId: string;
  userId: string;
  relationshipStage: PersonaRelationshipStage;
  userMood?: string;
  currentTopic?: string;
  /** Optional bundle runtime for accessing story graph */
  bundleRuntime?: {
    getRecommendedStories?: (context: string) => string[];
  };
}

export interface StoryResult {
  story: Story;
  canTell: boolean;
  reason?: string;
}

// ============================================================================
// Storage (In-memory cache backed by Firestore via humanizingState)
// ============================================================================

// Track which stories have been told to which users (cache)
const storiesToldMap = new Map<string, Set<string>>(); // userId:personaId -> Set of storyIds

// Story registry (loaded from persona bundles)
const storyRegistry = new Map<string, Story>();

// Dirty tracking for batched persistence
const dirtyUsers = new Set<string>();
let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
const PERSISTENCE_DEBOUNCE_MS = 5000;

/**
 * Schedule persistence to Firestore (debounced)
 */
function schedulePersistence(userId: string): void {
  dirtyUsers.add(userId);

  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
  }

  persistenceTimer = setTimeout(() => {
    void flushToPersistence();
  }, PERSISTENCE_DEBOUNCE_MS);
}

/**
 * Flush dirty story data to Firestore
 */
async function flushToPersistence(): Promise<void> {
  if (dirtyUsers.size === 0) return;

  const usersToFlush = Array.from(dirtyUsers);
  dirtyUsers.clear();

  try {
    const store = getDefaultStore();

    for (const userId of usersToFlush) {
      const profile = await store.getProfile(userId);
      if (!profile) continue;

      // Collect stories told for all personas for this user
      const perPersonaStories: Record<string, string[]> = {};

      for (const [key, storyIds] of storiesToldMap.entries()) {
        if (key.startsWith(`${userId}:`)) {
          const personaId = key.split(':')[1];
          perPersonaStories[personaId] = Array.from(storyIds);
        }
      }

      // Store in humanizingState.storiesTold (using existing field structure)
      if (!profile.humanizingState) {
        profile.humanizingState = {
          usedShareTags: [],
          totalSpontaneousShares: 0,
          updatedAt: new Date(),
        };
      }

      // Store per-persona stories in customData
      if (!profile.customData) profile.customData = {};
      profile.customData.perPersonaStoriesTold = perPersonaStories;
      profile.humanizingState.updatedAt = new Date();

      await store.saveProfile(profile);
      logger.debug(
        { userId, personaCount: Object.keys(perPersonaStories).length },
        'Persisted story history'
      );
    }
  } catch (error) {
    logger.warn({ error }, 'Failed to persist story history');
    usersToFlush.forEach((u) => dirtyUsers.add(cleanForFirestore(u)));
  }
}

/**
 * Load story history from user profile
 */
async function loadFromProfile(userId: string): Promise<void> {
  try {
    const store = getDefaultStore();
    const profile = await store.getProfile(userId);

    // Load from customData.perPersonaStoriesTold
    if (profile?.customData?.perPersonaStoriesTold) {
      const storedStories = profile.customData.perPersonaStoriesTold as Record<string, string[]>;

      for (const [personaId, storyIds] of Object.entries(storedStories)) {
        const key = getTrackingKey(userId, personaId);
        storiesToldMap.set(key, new Set(storyIds));
      }

      logger.debug(
        { userId, personaCount: Object.keys(storedStories).length },
        'Loaded story history from profile'
      );
    }
  } catch (error) {
    logger.warn({ error, userId }, 'Failed to load story history from profile');
  }
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get key for user-persona story tracking
 */
function getTrackingKey(userId: string, personaId: string): string {
  return `${userId}:${personaId}`;
}

/**
 * Check if a story has been told to a user by a specific persona
 */
export async function hasStoryBeenTold(
  userId: string,
  personaId: string,
  storyId: string
): Promise<boolean> {
  const key = getTrackingKey(userId, personaId);
  let told = storiesToldMap.get(key);

  // Load from profile if not in cache
  if (!told) {
    await loadFromProfile(userId);
    told = storiesToldMap.get(key);
  }

  return told?.has(storyId) ?? false;
}

/**
 * Mark a story as told to a user
 * Persists to Firestore for cross-session narrative continuity
 */
export async function markStoryTold(
  userId: string,
  personaId: string,
  storyId: string
): Promise<void> {
  const key = getTrackingKey(userId, personaId);
  let told = storiesToldMap.get(key);

  if (!told) {
    await loadFromProfile(userId);
    told = storiesToldMap.get(key);
  }

  if (!told) {
    told = new Set();
    storiesToldMap.set(key, told);
  }
  told.add(cleanForFirestore(storyId));

  // Schedule persistence (debounced)
  schedulePersistence(userId);

  logger.debug({ userId, personaId, storyId }, 'Marked story as told');
}

/**
 * Get all stories told to a user by a persona
 */
export async function getStoriesTold(userId: string, personaId: string): Promise<string[]> {
  const key = getTrackingKey(userId, personaId);
  let told = storiesToldMap.get(key);

  if (!told) {
    await loadFromProfile(userId);
    told = storiesToldMap.get(key);
  }

  return told ? Array.from(told) : [];
}

/**
 * Check if user qualifies for a story based on relationship stage
 */
export function canTellStory(story: Story, relationshipStage: PersonaRelationshipStage): boolean {
  const stageOrder: PersonaRelationshipStage[] = [
    'stranger',
    'acquaintance',
    'friend',
    'trusted_advisor',
  ];

  const userStageIndex = stageOrder.indexOf(relationshipStage);
  const requiredStageIndex = stageOrder.indexOf(story.relationshipGate);

  return userStageIndex >= requiredStageIndex;
}

/**
 * Story graph context trigger type
 * Used to match user context to recommended stories from bundle story graphs
 */
export interface StoryGraphContextTrigger {
  recommended_stories: string[];
  priority: 'high' | 'medium' | 'low';
  requires_trust?: boolean;
  timing?: 'after_comfort' | 'immediate';
}

/**
 * Story graph configuration from bundle _story-graph.json
 */
export interface StoryGraphConfig {
  context_triggers?: Record<string, StoryGraphContextTrigger>;
  story_timing_rules?: {
    minimum_turns_before_first_story?: number;
    minimum_turns_between_stories?: number;
    max_stories_per_session?: number;
    never_tell_story_when?: string[];
    ideal_moments?: string[];
  };
}

// Cache for story graphs per persona
const storyGraphCache = new Map<string, StoryGraphConfig>();

/**
 * Register a story graph for a persona (loaded from bundles)
 */
export function registerStoryGraph(personaId: string, graph: StoryGraphConfig): void {
  storyGraphCache.set(personaId, graph);
  logger.debug(
    { personaId, triggers: Object.keys(graph.context_triggers || {}).length },
    'Registered story graph'
  );
}

/**
 * Detect context triggers in user message/context
 */
function detectContextTriggers(
  userMood: string | undefined,
  currentTopic: string | undefined
): string[] {
  const triggers: string[] = [];
  const moodLower = (userMood || '').toLowerCase();
  const topicLower = (currentTopic || '').toLowerCase();
  const combined = `${moodLower} ${topicLower}`;

  // Map user context to story graph trigger keys
  const contextPatterns: Record<string, string[]> = {
    user_facing_setback: [
      'setback',
      'failed',
      'failure',
      "didn't work",
      'went wrong',
      'disappointed',
    ],
    user_made_mistake: ['mistake', 'messed up', 'screwed up', 'regret', "shouldn't have"],
    user_family_topic: [
      'family',
      'parent',
      'sibling',
      'brother',
      'sister',
      'mom',
      'dad',
      'kids',
      'children',
    ],
    user_travel_topic: ['travel', 'trip', 'vacation', 'abroad', 'country', 'visited'],
    user_career_question: ['career', 'job', 'work', 'profession', 'salary', 'promotion'],
    user_feeling_overwhelmed: ['overwhelmed', 'too much', 'stressed', "can't handle", 'drowning'],
    user_mental_health: ['anxious', 'depressed', 'mental health', 'therapy', 'struggling'],
    user_questioning_self_worth: ['worth', 'enough', 'good enough', 'deserve', 'value'],
    user_discussing_patience: ['patience', 'waiting', 'takes time', 'slow'],
    user_experienced_loss: ['loss', 'lost', 'grief', 'passed away', 'died', 'gone'],
  };

  for (const [trigger, keywords] of Object.entries(contextPatterns)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      triggers.push(trigger);
    }
  }

  return triggers;
}

/**
 * Find an appropriate story for the context
 *
 * HUMANIZATION FIX: Now uses story graph context_triggers from bundles
 * for smarter, persona-specific story selection instead of basic keyword matching.
 */
export async function findStoryForContext(
  context: StoryTellingContext,
  availableStories: Story[]
): Promise<StoryResult | null> {
  const { userId, personaId, relationshipStage, userMood, currentTopic } = context;

  // Filter stories that can be told (need to check each one async)
  const eligibleStories: Story[] = [];
  for (const story of availableStories) {
    // Must be from this persona
    if (story.personaId !== personaId) continue;

    // Must not have been told already
    if (await hasStoryBeenTold(userId, personaId, story.id)) continue;

    // Must meet relationship gate
    if (!canTellStory(story, relationshipStage)) continue;

    eligibleStories.push(story);
  }

  if (eligibleStories.length === 0) {
    return null;
  }

  // Get stories told for scoring
  const toldStories = await getStoriesTold(userId, personaId);

  // HUMANIZATION FIX: Use story graph context triggers for smarter selection
  // Try bundle runtime first (preferred), fall back to cached story graph
  const detectedTriggers = detectContextTriggers(userMood, currentTopic);

  // Collect recommended stories from matching triggers
  const graphRecommendations = new Map<string, { priority: number; trigger: string }>();

  // PRIORITY 1: Use bundle runtime's getRecommendedStories if available
  if (context.bundleRuntime?.getRecommendedStories) {
    for (const trigger of detectedTriggers) {
      const recommendedStoryIds = context.bundleRuntime.getRecommendedStories(trigger);
      if (recommendedStoryIds.length > 0) {
        // Bundle runtime recommendations are high priority
        for (const storyId of recommendedStoryIds) {
          const existing = graphRecommendations.get(storyId);
          if (!existing || existing.priority < 8) {
            graphRecommendations.set(cleanForFirestore(storyId), { priority: 8, trigger });
          }
        }
        logger.debug(
          { trigger, count: recommendedStoryIds.length },
          'Bundle runtime recommended stories'
        );
      }
    }
  }

  // PRIORITY 2: Fall back to cached story graph
  const storyGraph = storyGraphCache.get(personaId);
  if (storyGraph?.context_triggers && graphRecommendations.size === 0) {
    for (const trigger of detectedTriggers) {
      const triggerConfig = storyGraph.context_triggers[trigger];
      if (triggerConfig) {
        // Check trust requirement
        if (triggerConfig.requires_trust && relationshipStage === 'stranger') {
          continue; // Skip stories requiring trust for strangers
        }

        const priorityScore =
          triggerConfig.priority === 'high' ? 10 : triggerConfig.priority === 'medium' ? 5 : 2;
        for (const storyId of triggerConfig.recommended_stories) {
          const existing = graphRecommendations.get(storyId);
          if (!existing || existing.priority < priorityScore) {
            graphRecommendations.set(cleanForFirestore(storyId), {
              priority: priorityScore,
              trigger,
            });
          }
        }
      }
    }
  }

  // Score stories by relevance
  const scoredStories = eligibleStories.map((story) => {
    let score = 0;

    // HUMANIZATION FIX: Heavy bonus for story graph recommendations
    const graphRec = graphRecommendations.get(story.id);
    if (graphRec) {
      score += graphRec.priority; // 2-10 points based on priority
      logger.debug(
        { storyId: story.id, trigger: graphRec.trigger, priority: graphRec.priority },
        'Story matched context trigger'
      );
    }

    // Mood matching
    if (userMood && story.emotionalTags.includes(userMood)) {
      score += 3;
    }

    // Topic relevance (basic keyword matching as fallback)
    if (currentTopic && !graphRec) {
      const topicLower = currentTopic.toLowerCase();
      if (
        story.title.toLowerCase().includes(topicLower) ||
        story.content.toLowerCase().includes(topicLower)
      ) {
        score += 2;
      }
    }

    // Prefer stories that follow from previous ones
    if (story.followsFrom && toldStories.includes(story.followsFrom)) {
      score += 4; // Strong preference for narrative continuity
    }

    // Slight randomness
    score += Math.random();

    return { story, score };
  });

  // Sort by score and pick best
  scoredStories.sort((a, b) => b.score - a.score);
  const bestStory = scoredStories[0].story;

  return {
    story: bestStory,
    canTell: true,
  };
}

/**
 * Get continuation stories (stories that follow from a just-told story)
 */
export async function getContinuationStories(
  storyId: string,
  context: StoryTellingContext,
  allStories: Story[]
): Promise<Story[]> {
  const justTold = allStories.find((s) => s.id === storyId);
  if (!justTold?.leadsTo || justTold.leadsTo.length === 0) {
    return [];
  }

  const results: Story[] = [];
  for (const story of allStories) {
    // Must be in the leads-to list
    if (!justTold.leadsTo?.includes(story.id)) continue;

    // Must not have been told
    if (await hasStoryBeenTold(context.userId, context.personaId, story.id)) continue;

    // Must meet relationship gate
    if (!canTellStory(story, context.relationshipStage)) continue;

    results.push(story);
  }

  return results;
}

/**
 * Register a story (for loading from bundles)
 */
export function registerStory(story: Story): void {
  storyRegistry.set(story.id, story);
  logger.debug({ storyId: story.id, personaId: story.personaId }, 'Registered story');
}

/**
 * Get all registered stories for a persona
 */
export function getPersonaStories(personaId: string): Story[] {
  return Array.from(storyRegistry.values()).filter((s) => s.personaId === personaId);
}

/**
 * Clear story tracking for a user (for testing/reset)
 */
export async function clearUserStoryHistory(userId: string, personaId?: string): Promise<void> {
  if (personaId) {
    const key = getTrackingKey(userId, personaId);
    storiesToldMap.delete(key);
  } else {
    // Clear all personas for this user
    for (const key of storiesToldMap.keys()) {
      if (key.startsWith(`${userId}:`)) {
        storiesToldMap.delete(key);
      }
    }
  }

  // Persist the cleared state
  schedulePersistence(userId);
  logger.debug({ userId, personaId }, 'Cleared story history');
}

/**
 * Get story statistics for a user-persona pair
 */
export async function getStoryStats(
  userId: string,
  personaId: string
): Promise<{
  totalTold: number;
  availableStories: number;
  completedArcs: number;
}> {
  const told = await getStoriesTold(userId, personaId);
  const available = getPersonaStories(personaId);

  // Count completed arcs (stories that have no leadsTo or all leadsTo are told)
  let completedArcs = 0;
  for (const story of available) {
    if (told.includes(story.id)) {
      if (!story.leadsTo || story.leadsTo.length === 0) {
        completedArcs++;
      } else if (story.leadsTo.every((id) => told.includes(id))) {
        completedArcs++;
      }
    }
  }

  return {
    totalTold: told.length,
    availableStories: available.length,
    completedArcs,
  };
}

/**
 * Force immediate persistence (for graceful shutdown)
 */
export async function flushStoryPersistence(): Promise<void> {
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
    persistenceTimer = null;
  }
  await flushToPersistence();
}

// Export as service object
export const StoryTrackingService = {
  hasBeenTold: hasStoryBeenTold,
  markTold: markStoryTold,
  getStoriesTold,
  canTell: canTellStory,
  findForContext: findStoryForContext,
  getContinuations: getContinuationStories,
  register: registerStory,
  getPersonaStories,
  clearHistory: clearUserStoryHistory,
  getStats: getStoryStats,
  flush: flushStoryPersistence,
};

export default StoryTrackingService;
