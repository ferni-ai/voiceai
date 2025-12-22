/**
 * Memory Adapter for Human Personality System
 *
 * Integrates the personality system with the existing memory infrastructure:
 * - Firestore Vector Store for semantic search of personal moments
 * - SharedStory for tracking what personas have shared with users
 * - KeyMoment for callbacks (what users shared that we should follow up on)
 * - semantic-rag for fast relevance matching
 *
 * This is MUCH better than the keyword-based approach:
 * - Semantic similarity > keyword matching
 * - Persistent storage > in-memory
 * - Existing infrastructure > parallel systems
 *
 * @module personality/memory-adapter
 */

import { embedCached } from '../memory/embedding-cache.js';
import { cosineSimilarity } from '../memory/embeddings.js';
import { isOk } from '../memory/result.js';
import type { KeyMoment, SharedStory, UserProfile } from '../types/user-profile.js';
import { createLogger } from '../utils/safe-logger.js';
import { getMomentsForPersona, getRegisteredPersonaIds } from './personal-moment-store.js';
import type {
  PersonalMoment,
  PersonalMomentTopic,
  RelationshipStage,
  RelevanceMatch,
} from './types.js';

const log = createLogger({ module: 'PersonalityMemoryAdapter' });

// ============================================================================
// EMBEDDED MOMENTS CACHE
// ============================================================================

/**
 * Cache of pre-embedded personal moments per persona
 * Computed once on first access, then reused
 */
interface EmbeddedMoment {
  moment: PersonalMoment;
  embedding: number[];
}

const embeddedMomentsCache = new Map<string, EmbeddedMoment[]>();
const embeddingInProgress = new Map<string, Promise<EmbeddedMoment[]>>();

/**
 * Get or compute embedded moments for a persona
 * Uses the existing embedding cache for efficiency
 */
async function getEmbeddedMoments(personaId: string): Promise<EmbeddedMoment[]> {
  // Check cache
  const cached = embeddedMomentsCache.get(personaId);
  if (cached) {
    return cached;
  }

  // Check if embedding is already in progress
  const inProgress = embeddingInProgress.get(personaId);
  if (inProgress) {
    return inProgress;
  }

  // Start embedding
  const embeddingPromise = embedMomentsForPersona(personaId);
  embeddingInProgress.set(personaId, embeddingPromise);

  try {
    const result = await embeddingPromise;
    embeddedMomentsCache.set(personaId, result);
    return result;
  } finally {
    embeddingInProgress.delete(personaId);
  }
}

/**
 * Embed all moments for a persona
 */
async function embedMomentsForPersona(personaId: string): Promise<EmbeddedMoment[]> {
  const moments = getMomentsForPersona(personaId);
  if (moments.length === 0) {
    return [];
  }

  log.info({ personaId, count: moments.length }, '🔮 Embedding personal moments');

  const embeddedMoments: EmbeddedMoment[] = [];

  for (const moment of moments) {
    // Create searchable text from moment
    const searchableText = createSearchableText(moment);

    // Get cached embedding (or generate new one)
    const result = await embedCached(searchableText);

    if (isOk(result)) {
      embeddedMoments.push({
        moment,
        embedding: result.value,
      });
    } else {
      log.warn({ momentId: moment.id, error: result.error }, 'Failed to embed moment');
    }
  }

  log.info({ personaId, embedded: embeddedMoments.length }, '✅ Moments embedded');
  return embeddedMoments;
}

/**
 * Create searchable text from a moment for embedding
 */
function createSearchableText(moment: PersonalMoment): string {
  const parts = [
    moment.content,
    moment.topic,
    ...moment.triggers.keywords,
    ...(moment.triggers.emotions || []),
    ...(moment.triggers.topics || []),
  ];
  return parts.join(' ');
}

// ============================================================================
// SEMANTIC RELEVANCE SEARCH
// ============================================================================

/**
 * Find semantically relevant personal moments using embeddings
 * This is MUCH better than keyword matching
 */
export async function findRelevantMomentSemantic(
  personaId: string,
  userMessage: string,
  options: {
    relationshipStage: RelationshipStage;
    sharedStories?: SharedStory[];
    minSimilarity?: number;
    maxResults?: number;
  }
): Promise<RelevanceMatch | null> {
  const minSimilarity = options.minSimilarity ?? 0.3;
  const maxResults = options.maxResults ?? 1;

  // Get embedded moments
  const embeddedMoments = await getEmbeddedMoments(personaId);
  if (embeddedMoments.length === 0) {
    return null;
  }

  // Embed user message
  const userEmbeddingResult = await embedCached(userMessage);
  if (!isOk(userEmbeddingResult)) {
    log.warn({ error: userEmbeddingResult.error }, 'Failed to embed user message');
    return null;
  }
  const userEmbedding = userEmbeddingResult.value;

  // Get accessible moments based on relationship stage
  const stageOrder: RelationshipStage[] = ['stranger', 'acquaintance', 'friend', 'trusted'];
  const stageIndex = stageOrder.indexOf(options.relationshipStage);

  // Score all moments by semantic similarity
  const scored: Array<{ moment: PersonalMoment; similarity: number }> = [];

  for (const { moment, embedding } of embeddedMoments) {
    // Check relationship stage access
    const momentStageIndex = stageOrder.indexOf(moment.minRelationshipStage);
    if (momentStageIndex > stageIndex) {
      continue; // Not accessible at this relationship stage
    }

    // Check if already shared (using SharedStory from profile)
    if (options.sharedStories) {
      const alreadyShared = options.sharedStories.some((s) => s.storyId === moment.id);
      if (alreadyShared) {
        // Check cooldown
        const sharedStory = options.sharedStories.find((s) => s.storyId === moment.id);
        if (sharedStory) {
          const daysSinceShared = Math.floor(
            (Date.now() - new Date(sharedStory.sharedAt).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceShared < moment.cooldownDays) {
            continue; // Within cooldown, skip
          }
        }
      }
    }

    // Calculate semantic similarity
    const similarity = cosineSimilarity(userEmbedding, embedding);

    if (similarity >= minSimilarity) {
      scored.push({ moment, similarity });
    }
  }

  if (scored.length === 0) {
    return null;
  }

  // Sort by similarity descending
  scored.sort((a, b) => b.similarity - a.similarity);

  const best = scored[0];

  // Build result
  const result: RelevanceMatch = {
    moment: best.moment,
    relevanceScore: best.similarity,
    reason: `Semantic similarity: ${(best.similarity * 100).toFixed(1)}%`,
    suggestedTransition:
      best.moment.transitions[Math.floor(Math.random() * best.moment.transitions.length)],
    previouslyShared: options.sharedStories?.some((s) => s.storyId === best.moment.id) ?? false,
  };

  log.debug(
    {
      personaId,
      momentId: best.moment.id,
      similarity: best.similarity,
    },
    '✨ Found semantically relevant moment'
  );

  return result;
}

// ============================================================================
// SHARED STORY TRACKING (Uses existing UserProfile.sharedStories)
// ============================================================================

/**
 * Create a SharedStory record when a persona shares a moment
 * This integrates with the existing UserProfile type
 */
export function createSharedStoryRecord(
  moment: PersonalMoment,
  context: string,
  userReaction?: 'positive' | 'neutral' | 'moved' | 'curious'
): SharedStory {
  return {
    storyId: moment.id,
    theme: moment.topic,
    sharedAt: new Date(),
    userReaction,
    context,
  };
}

/**
 * Check if a moment was already shared with this user
 */
export function wasMomentSharedWithUser(
  momentId: string,
  sharedStories: SharedStory[] | undefined
): boolean {
  if (!sharedStories) return false;
  return sharedStories.some((s) => s.storyId === momentId);
}

/**
 * Get topics the user has discovered about this persona
 */
export function getDiscoveredTopicsFromStories(
  sharedStories: SharedStory[] | undefined
): PersonalMomentTopic[] {
  if (!sharedStories) return [];
  return [...new Set(sharedStories.map((s) => s.theme as PersonalMomentTopic))];
}

// ============================================================================
// CALLBACK INTEGRATION (Uses existing KeyMoment type)
// ============================================================================

/**
 * Create a KeyMoment for callback from user's message
 * This integrates with the existing KeyMoment retrieval system
 */
export function createCallbackKeyMoment(
  what: string,
  options: {
    type?: KeyMoment['type'];
    emotionalWeight?: KeyMoment['emotionalWeight'];
    topics?: string[];
    followUpDate?: Date;
  } = {}
): KeyMoment {
  return {
    id: `km_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date(),
    type: options.type ?? 'concern',
    summary: what,
    emotionalWeight: options.emotionalWeight ?? 'medium',
    topics: options.topics ?? [],
    followUpNeeded: true,
    followUpDate: options.followUpDate,
  };
}

/**
 * Extract callback-worthy moments from user message
 * Returns KeyMoments that can be added to the user's profile
 */
export function extractCallbackKeyMoments(userMessage: string): KeyMoment[] {
  const keyMoments: KeyMoment[] = [];

  // Upcoming events
  const eventPatterns = [
    /(?:have|got)\s+(?:a|an)\s+(\w+(?:\s+\w+)?)\s+(?:on|this|next)\s+(\w+day)/i,
    /(?:interview|meeting|presentation|recital|exam)\s+(?:on|this|next|tomorrow)/i,
  ];

  for (const pattern of eventPatterns) {
    if (pattern.test(userMessage)) {
      keyMoments.push(
        createCallbackKeyMoment(userMessage.slice(0, 100), {
          type: 'milestone',
          emotionalWeight: 'medium',
          followUpDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
        })
      );
      break;
    }
  }

  // Difficult conversations / decisions
  const decisionPatterns = [
    /(?:need to|have to|going to)\s+(?:talk|speak|tell|confront)/i,
    /(?:thinking about|considering|might)\s+(?:quitting|leaving|changing|starting)/i,
  ];

  for (const pattern of decisionPatterns) {
    if (pattern.test(userMessage)) {
      keyMoments.push(
        createCallbackKeyMoment(userMessage.slice(0, 100), {
          type: 'decision',
          emotionalWeight: 'heavy',
        })
      );
      break;
    }
  }

  // Shared vulnerability
  if (/(?:never told|hard to say|between us|vulnerable)/i.test(userMessage)) {
    keyMoments.push(
      createCallbackKeyMoment(userMessage.slice(0, 100), {
        type: 'shared_vulnerability',
        emotionalWeight: 'heavy',
      })
    );
  }

  // Celebrations
  if (/(?:finally|just)\s+(?:finished|completed|did|passed|got)/i.test(userMessage)) {
    keyMoments.push(
      createCallbackKeyMoment(userMessage.slice(0, 100), {
        type: 'celebration',
        emotionalWeight: 'light',
        followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
      })
    );
  }

  return keyMoments;
}

/**
 * Get pending callbacks from user's key moments
 */
export function getPendingCallbacksFromProfile(
  profile: UserProfile
): Array<{ moment: KeyMoment; question: string }> {
  const keyMoments = profile.keyMoments || [];
  const pending: Array<{ moment: KeyMoment; question: string }> = [];

  for (const moment of keyMoments) {
    if (!moment.followUpNeeded) continue;

    // Check if follow-up date has passed
    if (moment.followUpDate && new Date(moment.followUpDate) > new Date()) {
      continue;
    }

    // Generate follow-up question based on type
    let question: string;
    switch (moment.type) {
      case 'milestone':
        question = `How did that go? The ${moment.topics[0] || 'thing you mentioned'}?`;
        break;
      case 'decision':
        question = 'Any movement on that decision you were thinking about?';
        break;
      case 'shared_vulnerability':
        question = 'How are you doing with that? The thing you shared with me?';
        break;
      case 'celebration':
        question = 'Still riding that win? You should be proud!';
        break;
      case 'concern':
        question = 'How are things going? You mentioned something was weighing on you.';
        break;
      case 'breakthrough':
        question = 'Has that insight stuck with you? The breakthrough you had?';
        break;
      default:
        question = `How's that thing going that you mentioned?`;
    }

    pending.push({ moment, question });
  }

  // Sort by emotional weight (heavy first) then by date (older first)
  pending.sort((a, b) => {
    const weightOrder = { heavy: 0, medium: 1, light: 2 };
    const weightDiff =
      weightOrder[a.moment.emotionalWeight] - weightOrder[b.moment.emotionalWeight];
    if (weightDiff !== 0) return weightDiff;

    return new Date(a.moment.timestamp).getTime() - new Date(b.moment.timestamp).getTime();
  });

  return pending;
}

/**
 * Format a callback for prompt injection
 */
export function formatCallbackForPrompt(callback: { moment: KeyMoment; question: string }): string {
  const transitions = [
    'Hey, before we get into anything—',
    'I was thinking about you—',
    'Quick thing—',
    '',
  ];

  const transition = transitions[Math.floor(Math.random() * transitions.length)];

  return [
    '[💝 CALLBACK OPPORTUNITY - THE SMILE FACTOR]',
    '',
    'You have something to follow up on with this person:',
    '',
    `Original context: "${callback.moment.summary}"`,
    `Type: ${callback.moment.type}`,
    `Follow-up question: "${callback.question}"`,
    `Suggested transition: "${transition}"`,
    '',
    'This is what makes people feel LOVED - that you remembered.',
    "Only bring this up if it feels natural. Don't force it.",
    'But this is GOLD. Use it.',
  ].join('\n');
}

// ============================================================================
// WARM-UP / PREFETCH
// ============================================================================

/**
 * Warm up embeddings for a persona (call on session start)
 */
export async function warmUpPersonaEmbeddings(personaId: string): Promise<void> {
  log.info({ personaId }, '🔥 Warming up persona embeddings');
  await getEmbeddedMoments(personaId);
}

/**
 * Warm up embeddings for all personas
 */
export async function warmUpAllPersonaEmbeddings(): Promise<void> {
  const personaIds = getRegisteredPersonaIds();
  log.info({ count: personaIds.length }, '🔥 Warming up all persona embeddings');

  await Promise.all(personaIds.map(async (id) => warmUpPersonaEmbeddings(id)));
}

/**
 * Clear embedding cache (for testing)
 */
export function clearEmbeddingCache(): void {
  embeddedMomentsCache.clear();
  embeddingInProgress.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  findRelevantMomentSemantic,
  createSharedStoryRecord,
  wasMomentSharedWithUser,
  getDiscoveredTopicsFromStories,
  createCallbackKeyMoment,
  extractCallbackKeyMoments,
  getPendingCallbacksFromProfile,
  formatCallbackForPrompt,
  warmUpPersonaEmbeddings,
  warmUpAllPersonaEmbeddings,
  clearEmbeddingCache,
};
