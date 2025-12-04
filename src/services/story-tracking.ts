/**
 * Story Tracking Service
 * 
 * Tracks which stories have been told to which users, gates stories by
 * relationship stage, and manages narrative arcs.
 */

import { getLogger } from '../utils/logger.js';
import type { PersonaRelationshipStage } from '../types/user-profile.js';

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
}

export interface StoryResult {
  story: Story;
  canTell: boolean;
  reason?: string;
}

// ============================================================================
// In-Memory Story Registry (would be loaded from bundles in production)
// ============================================================================

// Track which stories have been told to which users
const storiesToldMap = new Map<string, Set<string>>(); // userId -> Set of storyIds

// Story registry (simplified - in production, load from persona bundles)
const storyRegistry = new Map<string, Story>();

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
export function hasStoryBeenTold(
  userId: string,
  personaId: string,
  storyId: string
): boolean {
  const key = getTrackingKey(userId, personaId);
  const told = storiesToldMap.get(key);
  return told?.has(storyId) ?? false;
}

/**
 * Mark a story as told to a user
 */
export function markStoryTold(
  userId: string,
  personaId: string,
  storyId: string
): void {
  const key = getTrackingKey(userId, personaId);
  let told = storiesToldMap.get(key);
  if (!told) {
    told = new Set();
    storiesToldMap.set(key, told);
  }
  told.add(storyId);
  
  logger.debug({ userId, personaId, storyId }, 'Marked story as told');
}

/**
 * Get all stories told to a user by a persona
 */
export function getStoriesTold(
  userId: string,
  personaId: string
): string[] {
  const key = getTrackingKey(userId, personaId);
  const told = storiesToldMap.get(key);
  return told ? Array.from(told) : [];
}

/**
 * Check if user qualifies for a story based on relationship stage
 */
export function canTellStory(
  story: Story,
  relationshipStage: PersonaRelationshipStage
): boolean {
  const stageOrder: PersonaRelationshipStage[] = [
    'stranger',
    'acquaintance',
    'friend',
    'trusted_advisor'
  ];
  
  const userStageIndex = stageOrder.indexOf(relationshipStage);
  const requiredStageIndex = stageOrder.indexOf(story.relationshipGate);
  
  return userStageIndex >= requiredStageIndex;
}

/**
 * Find an appropriate story for the context
 */
export function findStoryForContext(
  context: StoryTellingContext,
  availableStories: Story[]
): StoryResult | null {
  const { userId, personaId, relationshipStage, userMood, currentTopic } = context;
  
  // Filter stories that can be told
  const eligibleStories = availableStories.filter(story => {
    // Must be from this persona
    if (story.personaId !== personaId) return false;
    
    // Must not have been told already
    if (hasStoryBeenTold(userId, personaId, story.id)) return false;
    
    // Must meet relationship gate
    if (!canTellStory(story, relationshipStage)) return false;
    
    return true;
  });
  
  if (eligibleStories.length === 0) {
    return null;
  }
  
  // Score stories by relevance
  const scoredStories = eligibleStories.map(story => {
    let score = 0;
    
    // Mood matching
    if (userMood && story.emotionalTags.includes(userMood)) {
      score += 3;
    }
    
    // Topic relevance (basic keyword matching)
    if (currentTopic) {
      const topicLower = currentTopic.toLowerCase();
      if (story.title.toLowerCase().includes(topicLower) ||
          story.content.toLowerCase().includes(topicLower)) {
        score += 2;
      }
    }
    
    // Prefer stories that follow from previous ones
    const toldStories = getStoriesTold(userId, personaId);
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
    canTell: true
  };
}

/**
 * Get continuation stories (stories that follow from a just-told story)
 */
export function getContinuationStories(
  storyId: string,
  context: StoryTellingContext,
  allStories: Story[]
): Story[] {
  const justTold = allStories.find(s => s.id === storyId);
  if (!justTold?.leadsTo || justTold.leadsTo.length === 0) {
    return [];
  }
  
  return allStories.filter(story => {
    // Must be in the leads-to list
    if (!justTold.leadsTo?.includes(story.id)) return false;
    
    // Must not have been told
    if (hasStoryBeenTold(context.userId, context.personaId, story.id)) return false;
    
    // Must meet relationship gate
    if (!canTellStory(story, context.relationshipStage)) return false;
    
    return true;
  });
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
  return Array.from(storyRegistry.values()).filter(s => s.personaId === personaId);
}

/**
 * Clear story tracking for a user (for testing/reset)
 */
export function clearUserStoryHistory(userId: string, personaId?: string): void {
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
  logger.debug({ userId, personaId }, 'Cleared story history');
}

/**
 * Get story statistics for a user-persona pair
 */
export function getStoryStats(
  userId: string,
  personaId: string
): {
  totalTold: number;
  availableStories: number;
  completedArcs: number;
} {
  const told = getStoriesTold(userId, personaId);
  const available = getPersonaStories(personaId);
  
  // Count completed arcs (stories that have no leadsTo or all leadsTo are told)
  let completedArcs = 0;
  for (const story of available) {
    if (told.includes(story.id)) {
      if (!story.leadsTo || story.leadsTo.length === 0) {
        completedArcs++;
      } else if (story.leadsTo.every(id => told.includes(id))) {
        completedArcs++;
      }
    }
  }
  
  return {
    totalTold: told.length,
    availableStories: available.length,
    completedArcs
  };
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
};

export default StoryTrackingService;

