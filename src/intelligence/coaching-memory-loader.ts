/**
 * Coaching Memory Loader
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This module loads user memories in a format optimized for coaching questions:
 * - Recent topics with days since mentioned
 * - Unfinished threads
 * - Important moments
 * - Relationship milestones
 *
 * The goal: Enable memory-grounded questions like
 * "Last time you mentioned X. How's that going?"
 */

import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CoachingMemory {
  topic: string;
  daysAgo: number;
  summary: string;
  type: 'topic' | 'moment' | 'thread' | 'milestone';
  context?: string;
  lastDiscussed: Date;
}

export interface CoachingMemoryContext {
  memories: CoachingMemory[];
  totalConversations: number;
  relationshipDays: number;
  recentTopics: string[];
  suggestedFollowUps: string[];
}

// ============================================================================
// MEMORY LOADING
// ============================================================================

/**
 * Load memories formatted for coaching questions
 * 
 * This aggregates from multiple memory sources and formats them
 * for the coaching question system.
 */
export async function loadCoachingMemories(
  userId: string,
  personaId: string
): Promise<CoachingMemoryContext> {
  const memories: CoachingMemory[] = [];
  const now = new Date();

  try {
    // Load from voice conversation memory
    const voiceMemory = await loadVoiceConversationMemory(userId);
    if (voiceMemory) {
      // Add topics as memories
      for (const topic of voiceMemory.topics.slice(0, 10)) {
        const daysAgo = Math.floor(
          (now.getTime() - topic.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
        );
        memories.push({
          topic: topic.topic,
          daysAgo,
          summary: `Discussed ${topic.topic} ${daysAgo} days ago`,
          type: 'topic',
          lastDiscussed: topic.lastMentioned,
        });
      }

      // Add important moments
      for (const moment of voiceMemory.importantMoments.slice(0, 5)) {
        const daysAgo = Math.floor(
          (now.getTime() - moment.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        memories.push({
          topic: moment.type,
          daysAgo,
          summary: moment.summary,
          type: 'moment',
          context: moment.context,
          lastDiscussed: moment.date,
        });
      }

      // Add milestones
      for (const milestone of voiceMemory.milestones.slice(0, 3)) {
        const daysAgo = Math.floor(
          (now.getTime() - milestone.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        memories.push({
          topic: milestone.name,
          daysAgo,
          summary: milestone.name,
          type: 'milestone',
          lastDiscussed: milestone.date,
        });
      }

      // Build context
      const firstConversation = voiceMemory.firstConversation;
      const relationshipDays = firstConversation
        ? Math.floor((now.getTime() - firstConversation.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      return {
        memories: memories.sort((a, b) => a.daysAgo - b.daysAgo).slice(0, 15),
        totalConversations: voiceMemory.totalConversations,
        relationshipDays,
        recentTopics: voiceMemory.topics.slice(0, 5).map((t) => t.topic),
        suggestedFollowUps: voiceMemory.suggestedFollowUps || [],
      };
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load voice conversation memory');
  }

  try {
    // Fallback: Load from persona memories
    const personaMemories = await loadPersonaMemories(userId, personaId);
    if (personaMemories.length > 0) {
      for (const mem of personaMemories.slice(0, 10)) {
        const daysAgo = Math.floor(
          (now.getTime() - mem.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        memories.push({
          topic: mem.name,
          daysAgo,
          summary: mem.details || mem.name,
          type: 'topic',
          lastDiscussed: mem.createdAt,
        });
      }

      return {
        memories,
        totalConversations: 0,
        relationshipDays: 0,
        recentTopics: memories.slice(0, 5).map((m) => m.topic),
        suggestedFollowUps: [],
      };
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load persona memories');
  }

  // Return empty context if no memories found
  return {
    memories: [],
    totalConversations: 0,
    relationshipDays: 0,
    recentTopics: [],
    suggestedFollowUps: [],
  };
}

/**
 * Get memories relevant to a specific topic
 */
export async function getMemoriesForTopic(
  userId: string,
  topic: string
): Promise<CoachingMemory[]> {
  const context = await loadCoachingMemories(userId, 'ferni');
  const topicLower = topic.toLowerCase();

  return context.memories.filter((m) => {
    const memTopic = m.topic.toLowerCase();
    const memSummary = m.summary.toLowerCase();
    return (
      memTopic.includes(topicLower) ||
      topicLower.includes(memTopic) ||
      memSummary.includes(topicLower)
    );
  });
}

/**
 * Get follow-up suggestions based on memories
 */
export async function getSuggestedFollowUps(
  userId: string,
  currentTopic?: string
): Promise<string[]> {
  const context = await loadCoachingMemories(userId, 'ferni');
  const suggestions: string[] = [];

  // Add memory-based suggestions
  for (const memory of context.memories.slice(0, 5)) {
    if (memory.daysAgo > 3 && memory.daysAgo < 30) {
      if (memory.type === 'topic') {
        suggestions.push(`Last time you mentioned ${memory.topic}. How's that going?`);
      } else if (memory.type === 'moment') {
        suggestions.push(`I've been thinking about when you shared ${memory.summary.toLowerCase()}. Any updates?`);
      } else if (memory.type === 'milestone') {
        suggestions.push(`You mentioned ${memory.topic} ${memory.daysAgo} days ago. How do you feel about it now?`);
      }
    }
  }

  // Add context-provided suggestions
  suggestions.push(...context.suggestedFollowUps);

  return suggestions.slice(0, 5);
}

// ============================================================================
// MEMORY SOURCE ADAPTERS
// ============================================================================

interface VoiceMemoryData {
  topics: Array<{ topic: string; lastMentioned: Date }>;
  importantMoments: Array<{ type: string; summary: string; context?: string; date: Date }>;
  milestones: Array<{ name: string; date: Date }>;
  totalConversations: number;
  firstConversation?: Date;
  suggestedFollowUps?: string[];
}

async function loadVoiceConversationMemory(userId: string): Promise<VoiceMemoryData | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getUserMemory, getConversationContext } = await import(
      '../services/voice-conversation-memory.js'
    );

    const [memory, context] = await Promise.all([
      getUserMemory(userId),
      getConversationContext(userId),
    ]);

    if (!memory) return null;

    return {
      topics: memory.topics.map((t: { topic: string; lastMentioned: Date }) => ({
        topic: t.topic,
        lastMentioned: t.lastMentioned,
      })),
      importantMoments: memory.importantMoments.map(
        (m: { summary: string; date: Date; emotion?: string }) => ({
          type: m.emotion || 'moment', // emotion serves as type indicator
          summary: m.summary,
          context: undefined,
          date: m.date,
        })
      ),
      milestones: memory.relationshipMilestones?.map((m: { milestone: string; date: Date }) => ({
        name: m.milestone,
        date: m.date,
      })) || [],
      totalConversations: memory.totalConversations,
      firstConversation: memory.firstConversation,
      suggestedFollowUps: context.suggestedFollowUps,
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Voice memory unavailable');
    return null;
  }
}

interface PersonaMemoryData {
  name: string;
  details?: string;
  createdAt: Date;
}

async function loadPersonaMemories(
  userId: string,
  _personaId: string
): Promise<PersonaMemoryData[]> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getAllUserMemories } = await import('../services/persona-memories.js');
    const memories = await getAllUserMemories(userId);

    // Filter and map to PersonaMemoryData format
    return memories
      .filter((m) => m.name) // Only memories with names
      .map((m) => ({
        name: m.name,
        details: m.details,
        createdAt: m.createdAt,
      }));
  } catch (error) {
    log.debug({ error: String(error) }, 'Persona memories unavailable');
    return [];
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  loadCoachingMemories,
  getMemoriesForTopic,
  getSuggestedFollowUps,
};

