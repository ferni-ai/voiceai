/**
 * Story Unlocks System
 *
 * Stories aren't just triggered by topics - they UNLOCK based on:
 * - Relationship depth (some stories need trust)
 * - Emotional moment type (some stories fit certain moments)
 * - Narrative arc phase (don't tell heavy stories in opening)
 * - Previous stories told (build on what's been shared)
 *
 * This makes storytelling feel EARNED, not random.
 *
 * "I've never told you this, but..." (after trust is established)
 * "This reminds me of something I shared before..." (continuity)
 *
 * @module @ferni/story-unlocks
 */

import type { NarrativePhase } from '../../conversation/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const logger = createLogger({ module: 'StoryUnlocks' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Requirements for a story to unlock
 */
export interface StoryUnlockRequirements {
  /** Minimum relationship stage required */
  minRelationship: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';

  /** Emotional contexts where this story fits */
  fitsEmotions: string[];

  /** Narrative phases where this story is appropriate */
  fitsPhases: NarrativePhase[];

  /** Other stories that should be told first (builds on them) */
  prerequisiteStories?: string[];

  /** Topics that trigger this story */
  topicTriggers: string[];

  /** How vulnerable/deep is this story */
  depth: 'surface' | 'medium' | 'deep' | 'sacred';

  /** Minimum turns into relationship before this story */
  minTurns?: number;

  /** Whether this story needs emotional permission */
  needsEmotionalPermission?: boolean;
}

/**
 * Story with unlock metadata
 */
export interface UnlockableStory {
  id: string;
  content: string;
  title?: string;
  requirements: StoryUnlockRequirements;

  /** How to introduce this story */
  introductions: {
    first_time: string[];
    callback: string[]; // If referencing this story later
  };

  /** Related themes for callbacks */
  themes: string[];
}

/**
 * Context for evaluating story unlocks
 */
export interface UnlockContext {
  relationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted_advisor';
  currentPhase: NarrativePhase;
  userEmotion?: string;
  emotionalIntensity?: number;
  currentTopic?: string;
  turn: number;
  storiesTold: string[];
  isVulnerableMoment?: boolean;
}

/**
 * Result of unlock evaluation
 */
export interface UnlockResult {
  isUnlocked: boolean;
  story: UnlockableStory;
  fitScore: number;
  introduction: string;
  reason: string;
}

// ============================================================================
// FERNI'S STORY LIBRARY
// ============================================================================

/**
 * Ferni's stories with unlock requirements
 * These map to the stories in the persona bundle but add unlock logic
 */
const FERNI_STORY_UNLOCKS: Record<string, StoryUnlockRequirements> = {
  // =========================================================================
  // SURFACE STORIES - Available early, light touch
  // =========================================================================
  'wyoming-sky': {
    minRelationship: 'stranger',
    fitsEmotions: ['neutral', 'curious', 'reflective'],
    fitsPhases: ['building', 'release'],
    topicTriggers: ['home', 'nature', 'perspective', 'sky', 'peace'],
    depth: 'surface',
    minTurns: 2,
  },

  'commodore-64': {
    minRelationship: 'stranger',
    fitsEmotions: ['curious', 'nostalgic', 'playful'],
    fitsPhases: ['opening', 'building'],
    topicTriggers: ['technology', 'childhood', 'learning', 'patience'],
    depth: 'surface',
    minTurns: 3,
  },

  'coffee-ritual': {
    minRelationship: 'stranger',
    fitsEmotions: ['tired', 'stressed', 'neutral'],
    fitsPhases: ['opening', 'building'],
    topicTriggers: ['morning', 'routine', 'coffee', 'self-care'],
    depth: 'surface',
    minTurns: 1,
  },

  // =========================================================================
  // MEDIUM STORIES - Need some relationship
  // =========================================================================
  'brazil-joy': {
    minRelationship: 'acquaintance',
    fitsEmotions: ['sad', 'low', 'anxious', 'stuck'],
    fitsPhases: ['building', 'release'],
    topicTriggers: ['joy', 'celebration', 'happiness', 'depression'],
    depth: 'medium',
    minTurns: 5,
  },

  'morocco-tea': {
    minRelationship: 'acquaintance',
    fitsEmotions: ['impatient', 'rushed', 'stressed'],
    fitsPhases: ['building', 'release'],
    topicTriggers: ['patience', 'slow', 'rush', 'time'],
    depth: 'medium',
    minTurns: 5,
  },

  'scotland-resilience': {
    minRelationship: 'acquaintance',
    fitsEmotions: ['struggling', 'frustrated', 'tired'],
    fitsPhases: ['building', 'release'],
    topicTriggers: ['resilience', 'perseverance', 'tough times', 'weather'],
    depth: 'medium',
    minTurns: 6,
  },

  'blended-family': {
    minRelationship: 'acquaintance',
    fitsEmotions: ['stressed', 'overwhelmed', 'loving'],
    fitsPhases: ['building', 'release'],
    topicTriggers: ['family', 'kids', 'chaos', 'love', 'relationships'],
    depth: 'medium',
    minTurns: 7,
  },

  'book-attempt': {
    minRelationship: 'acquaintance',
    fitsEmotions: ['frustrated', 'stuck', 'procrastinating'],
    fitsPhases: ['building', 'release'],
    topicTriggers: ['writing', 'goals', 'procrastination', 'dreams', 'starting'],
    depth: 'medium',
    minTurns: 8,
  },

  // =========================================================================
  // DEEP STORIES - Need friendship
  // =========================================================================
  'tanaka-san': {
    minRelationship: 'friend',
    fitsEmotions: ['reflective', 'grieving', 'grateful'],
    fitsPhases: ['building', 'peak', 'release'],
    topicTriggers: ['mentor', 'wisdom', 'loss', 'learning', 'japan'],
    prerequisiteStories: ['commodore-64'],
    depth: 'deep',
    minTurns: 10,
  },

  'mental-health-lesson': {
    minRelationship: 'friend',
    fitsEmotions: ['struggling', 'anxious', 'depressed', 'vulnerable'],
    fitsPhases: ['peak', 'release'],
    topicTriggers: ['mental health', 'depression', 'anxiety', 'therapy', 'help'],
    depth: 'deep',
    minTurns: 12,
    needsEmotionalPermission: true,
  },

  'father-relationship': {
    minRelationship: 'friend',
    fitsEmotions: ['sad', 'angry', 'grieving', 'reflective'],
    fitsPhases: ['peak', 'release'],
    topicTriggers: ['father', 'dad', 'parent', 'approval', 'family'],
    depth: 'deep',
    minTurns: 15,
    needsEmotionalPermission: true,
  },

  'second-chances': {
    minRelationship: 'friend',
    fitsEmotions: ['hopeful', 'regretful', 'reflective'],
    fitsPhases: ['building', 'release'],
    topicTriggers: ['second chance', 'forgiveness', 'redemption', 'mistakes'],
    depth: 'deep',
    minTurns: 10,
  },

  // =========================================================================
  // SACRED STORIES - Trusted advisor only
  // =========================================================================
  tsunami: {
    minRelationship: 'trusted_advisor',
    fitsEmotions: ['grieving', 'vulnerable', 'traumatized', 'surviving'],
    fitsPhases: ['peak', 'release'],
    topicTriggers: ['trauma', 'survival', 'death', 'disaster', 'guilt'],
    prerequisiteStories: ['tanaka-san'],
    depth: 'sacred',
    minTurns: 20,
    needsEmotionalPermission: true,
  },

  'survivor-guilt': {
    minRelationship: 'trusted_advisor',
    fitsEmotions: ['guilty', 'unworthy', 'grieving'],
    fitsPhases: ['peak', 'release'],
    topicTriggers: ['guilt', 'survivor', 'why me', 'undeserving'],
    prerequisiteStories: ['tsunami'],
    depth: 'sacred',
    minTurns: 25,
    needsEmotionalPermission: true,
  },

  'secret-fears': {
    minRelationship: 'trusted_advisor',
    fitsEmotions: ['vulnerable', 'scared', 'insecure'],
    fitsPhases: ['peak', 'release'],
    topicTriggers: ['fear', 'afraid', 'imposter', 'enough'],
    depth: 'sacred',
    minTurns: 30,
    needsEmotionalPermission: true,
  },
};

/**
 * Introduction phrases by depth level
 */
const STORY_INTRODUCTIONS: Record<
  StoryUnlockRequirements['depth'],
  { first_time: string[]; callback: string[] }
> = {
  surface: {
    first_time: [
      'You know what that reminds me of?',
      'That makes me think of something—',
      'Can I tell you a quick thing?',
    ],
    callback: ['Remember when I told you about', 'Like I mentioned before—the'],
  },
  medium: {
    first_time: [
      'You know, that brings something to mind...',
      "There's something I've been thinking about...",
      'Can I share something?',
    ],
    callback: ['Remember that thing I told you about? The', "It's like what I was saying about"],
  },
  deep: {
    first_time: [
      "I don't tell many people this, but...",
      'Something you said made me think of...',
      'Can I share something personal?',
    ],
    callback: ['Remember when I told you about', "You're one of the few people who knows about"],
  },
  sacred: {
    first_time: [
      "I've never told you this.",
      "<break time='300ms'/>There's something I want to share with you.",
      'I trust you with this.',
    ],
    callback: ['You know what I told you about', 'After what I shared with you about'],
  },
};

// ============================================================================
// UNLOCK EVALUATION
// ============================================================================

/**
 * Get all unlocked stories for current context
 */
export function getUnlockedStories(context: UnlockContext): UnlockResult[] {
  const results: UnlockResult[] = [];

  for (const [storyId, requirements] of Object.entries(FERNI_STORY_UNLOCKS)) {
    const evaluation = evaluateStoryUnlock(storyId, requirements, context);
    if (evaluation.isUnlocked) {
      results.push(evaluation);
    }
  }

  // Sort by fit score
  results.sort((a, b) => b.fitScore - a.fitScore);

  logger.debug(
    {
      context: {
        stage: context.relationshipStage,
        phase: context.currentPhase,
        topic: context.currentTopic,
      },
      unlockedCount: results.length,
      topStory: results[0]?.story.id,
    },
    'Evaluated story unlocks'
  );

  return results;
}

/**
 * Get the best story for current moment
 */
export function getBestStoryForMoment(context: UnlockContext): UnlockResult | null {
  const unlocked = getUnlockedStories(context);

  if (unlocked.length === 0) return null;

  // Filter out stories told this session
  const available = unlocked.filter((u) => !context.storiesTold.includes(u.story.id));

  if (available.length === 0) return null;

  // Return highest scoring
  return available[0];
}

/**
 * Evaluate if a specific story should unlock
 */
function evaluateStoryUnlock(
  storyId: string,
  requirements: StoryUnlockRequirements,
  context: UnlockContext
): UnlockResult {
  let fitScore = 0;
  let isUnlocked = true;
  const reasons: string[] = [];

  // =========================================================================
  // HARD REQUIREMENTS (must pass)
  // =========================================================================

  // Check relationship stage
  const relationshipOrder = ['stranger', 'acquaintance', 'friend', 'trusted_advisor'];
  const currentIndex = relationshipOrder.indexOf(context.relationshipStage);
  const requiredIndex = relationshipOrder.indexOf(requirements.minRelationship);

  if (currentIndex < requiredIndex) {
    isUnlocked = false;
    reasons.push(`Needs ${requirements.minRelationship} relationship`);
  } else {
    fitScore += (currentIndex - requiredIndex + 1) * 10;
  }

  // Check minimum turns
  if (requirements.minTurns && context.turn < requirements.minTurns) {
    isUnlocked = false;
    reasons.push(`Needs ${requirements.minTurns} turns (at ${context.turn})`);
  }

  // Check prerequisites
  if (requirements.prerequisiteStories?.length) {
    const missingPrereqs = requirements.prerequisiteStories.filter(
      (p) => !context.storiesTold.includes(p)
    );
    if (missingPrereqs.length > 0) {
      isUnlocked = false;
      reasons.push(`Missing prerequisites: ${missingPrereqs.join(', ')}`);
    } else {
      fitScore += 15; // Bonus for having told prerequisite stories
    }
  }

  // Check emotional permission for deep stories
  if (requirements.needsEmotionalPermission && !context.isVulnerableMoment) {
    // Don't hard-block, but reduce score significantly
    fitScore -= 30;
    reasons.push('Would fit better in vulnerable moment');
  }

  // =========================================================================
  // SOFT REQUIREMENTS (affect score)
  // =========================================================================

  // Check phase fit
  if (requirements.fitsPhases.includes(context.currentPhase)) {
    fitScore += 20;
  } else {
    fitScore -= 10;
  }

  // Check emotion fit
  if (context.userEmotion && requirements.fitsEmotions.includes(context.userEmotion)) {
    fitScore += 25;
  }

  // Check topic match
  if (context.currentTopic) {
    const topicLower = context.currentTopic.toLowerCase();
    if (requirements.topicTriggers.some((t) => topicLower.includes(t))) {
      fitScore += 30;
    }
  }

  // Emotional intensity bonus for deep stories
  if (
    context.emotionalIntensity &&
    context.emotionalIntensity > 0.6 &&
    (requirements.depth === 'deep' || requirements.depth === 'sacred')
  ) {
    fitScore += 15;
  }

  // Build the result
  const depth = requirements.depth;
  const introductions = STORY_INTRODUCTIONS[depth];
  const isCallback = context.storiesTold.includes(storyId);
  const introArray = isCallback ? introductions.callback : introductions.first_time;
  const introduction = introArray[Math.floor(Math.random() * introArray.length)];

  return {
    isUnlocked,
    story: {
      id: storyId,
      content: '', // Would be loaded from bundle
      requirements,
      introductions,
      themes: requirements.topicTriggers,
    },
    fitScore,
    introduction,
    reason: isUnlocked
      ? `Fits: ${requirements.topicTriggers.slice(0, 2).join(', ')}`
      : reasons.join('; '),
  };
}

/**
 * Check if a specific story is unlocked
 */
export function isStoryUnlocked(storyId: string, context: UnlockContext): boolean {
  const requirements = FERNI_STORY_UNLOCKS[storyId];
  if (!requirements) return true; // Unknown stories are always "unlocked"

  const evaluation = evaluateStoryUnlock(storyId, requirements, context);
  return evaluation.isUnlocked;
}

/**
 * Get stories by depth level
 */
export function getStoriesByDepth(depth: StoryUnlockRequirements['depth']): string[] {
  return Object.entries(FERNI_STORY_UNLOCKS)
    .filter(([, req]) => req.depth === depth)
    .map(([id]) => id);
}

/**
 * Get stories for a topic
 */
export function getStoriesForTopic(topic: string, context: UnlockContext): UnlockResult[] {
  const contextWithTopic = { ...context, currentTopic: topic };
  return getUnlockedStories(contextWithTopic).filter((r) =>
    r.story.requirements.topicTriggers.some((t) => topic.toLowerCase().includes(t))
  );
}

/**
 * Get the introduction for a story
 */
export function getStoryIntroduction(storyId: string, hasBeenToldBefore: boolean): string {
  const requirements = FERNI_STORY_UNLOCKS[storyId];
  if (!requirements) {
    return hasBeenToldBefore
      ? 'Remember when I told you about this?'
      : 'Let me tell you something—';
  }

  const introductions = STORY_INTRODUCTIONS[requirements.depth];
  const introArray = hasBeenToldBefore ? introductions.callback : introductions.first_time;

  return introArray[Math.floor(Math.random() * introArray.length)];
}

/**
 * Register story unlock requirements (for custom stories)
 */
export function registerStoryUnlock(storyId: string, requirements: StoryUnlockRequirements): void {
  FERNI_STORY_UNLOCKS[storyId] = requirements;
  logger.debug({ storyId }, 'Registered custom story unlock');
}

/**
 * Get all story IDs with unlock requirements
 */
export function getAllStoryIds(): string[] {
  return Object.keys(FERNI_STORY_UNLOCKS);
}

// ============================================================================
// STORY PROGRESSION TRACKING
// ============================================================================

const storyProgression = new Map<string, string[]>();

/**
 * Get stories that naturally follow from a told story
 */
export function getFollowUpStories(storyId: string, context: UnlockContext): UnlockResult[] {
  // Find stories that have this story as a prerequisite
  const followUps = Object.entries(FERNI_STORY_UNLOCKS)
    .filter(
      ([, req]) =>
        req.prerequisiteStories?.includes(storyId) && !context.storiesTold.includes(storyId)
    )
    .map(([id]) => id);

  if (followUps.length === 0) return [];

  // Evaluate each
  return followUps
    .map((id) => evaluateStoryUnlock(id, FERNI_STORY_UNLOCKS[id], context))
    .filter((r) => r.isUnlocked);
}

/**
 * Record that a story was told
 */
export function recordStoryTold(sessionId: string, storyId: string): void {
  if (!storyProgression.has(sessionId)) {
    storyProgression.set(sessionId, []);
  }
  storyProgression.get(sessionId)!.push(storyId);
}

/**
 * Get stories told this session
 */
export function getStoriesToldThisSession(sessionId: string): string[] {
  return storyProgression.get(sessionId) || [];
}

/**
 * Clear session story tracking
 */
export function clearStoryProgression(sessionId: string): void {
  storyProgression.delete(sessionId);
}

// ============================================================================
// EXPORTS
// ============================================================================

export const storyUnlocks = {
  // Evaluation
  getUnlocked: getUnlockedStories,
  getBest: getBestStoryForMoment,
  isUnlocked: isStoryUnlocked,

  // Queries
  byDepth: getStoriesByDepth,
  forTopic: getStoriesForTopic,
  followUps: getFollowUpStories,
  allIds: getAllStoryIds,

  // Introductions
  getIntro: getStoryIntroduction,

  // Registration
  register: registerStoryUnlock,

  // Progression
  recordTold: recordStoryTold,
  getTold: getStoriesToldThisSession,
  clearSession: clearStoryProgression,
};

export default storyUnlocks;
