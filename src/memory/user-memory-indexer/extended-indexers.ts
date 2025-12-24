/**
 * Extended Domain Indexers
 *
 * Index additional data sources for comprehensive semantic search:
 * - Voice journals
 * - Custom agents
 * - Contact notes
 * - Habits
 *
 * @module memory/user-memory-indexer/extended-indexers
 */

import { getLogger } from '../../utils/safe-logger.js';
import { generateDocId, type AnyVectorStore, type VectorDocument } from './types.js';
import type { JournalEntry, CustomAgent } from '../../types/custom-agent.js';
import type { EnhancedContact } from '../../services/contacts/types.js';
import type { EnhancedHabit } from '../../tools/habit-coaching/types.js';

const log = getLogger().child({ module: 'ExtendedIndexers' });

// ============================================================================
// VOICE JOURNALS
// ============================================================================

/**
 * Index voice journal entries for semantic search.
 * Enables queries like "What did I write about feeling overwhelmed?"
 */
export async function indexVoiceJournals(
  userId: string,
  journals: JournalEntry[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const journal of journals) {
    // Skip if no transcript (nothing to embed)
    if (!journal.transcript?.trim()) continue;

    const text = `Voice journal entry${journal.mood ? ` (mood: ${journal.mood})` : ''}: ${journal.transcript}. ${
      journal.themes?.length ? `Themes: ${journal.themes.join(', ')}. ` : ''
    }${journal.keyInsights?.length ? `Insights: ${journal.keyInsights.join('. ')}` : ''}`;

    const doc: VectorDocument = {
      id: generateDocId('voice_journal', userId, journal.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'voice_journal',
        journalId: journal.id,
        mood: journal.mood || null,
        themes: journal.themes || [],
        durationSeconds: journal.durationSeconds,
        userId,
        timestamp: journal.date,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, journalId: journal.id }, 'Failed to index voice journal');
    }
  }

  return indexed;
}

// ============================================================================
// CUSTOM AGENTS
// ============================================================================

/**
 * Index custom agent descriptions and personality for similarity search.
 * Enables finding agents similar to user descriptions.
 */
export async function indexCustomAgents(
  userId: string,
  agents: CustomAgent[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const agent of agents) {
    // Build rich text representation
    const personalityTraits = agent.personality?.traits
      ? `Warmth: ${agent.personality.traits.warmth}, Directness: ${agent.personality.traits.directness}, Humor: ${agent.personality.traits.humor}`
      : '';

    const values = agent.personality?.values?.join(', ') || '';
    const passions = agent.personality?.passions?.join(', ') || '';

    const text = `Custom agent "${agent.name}" (${agent.type}): ${agent.description}. ` +
      `Relationship: ${agent.relationship}. ` +
      (personalityTraits ? `Personality: ${personalityTraits}. ` : '') +
      (values ? `Values: ${values}. ` : '') +
      (passions ? `Passions: ${passions}. ` : '') +
      (agent.behaviors?.catchphrases?.length
        ? `Catchphrases: "${agent.behaviors.catchphrases.slice(0, 3).join('", "')}". `
        : '');

    const doc: VectorDocument = {
      id: generateDocId('custom_agent', userId, agent.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'custom_agent',
        agentId: agent.id,
        agentName: agent.name,
        agentType: agent.type,
        relationship: agent.relationship,
        status: agent.status,
        privacy: agent.privacy,
        userId,
        timestamp: agent.updatedAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;

      // Also index agent memories (stories, wisdom, shared moments)
      if (agent.memories) {
        indexed += await indexAgentMemories(userId, agent.id, agent.memories, store);
      }
    } catch (err) {
      log.debug({ error: err, agentId: agent.id }, 'Failed to index custom agent');
    }
  }

  return indexed;
}

/**
 * Index memories within a custom agent
 */
async function indexAgentMemories(
  userId: string,
  agentId: string,
  memories: CustomAgent['memories'],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  // Index stories
  for (const story of memories.stories || []) {
    const text = `Agent story: "${story.title}". ${story.content}. Themes: ${story.themes.join(', ')}`;
    const doc: VectorDocument = {
      id: generateDocId('custom_agent', userId, `${agentId}_story_${story.id}`),
      text,
      metadata: {
        source: 'user_memory',
        category: 'custom_agent',
        subCategory: 'story',
        agentId,
        storyId: story.id,
        themes: story.themes,
        userId,
        timestamp: story.createdAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err }, 'Failed to index agent story');
    }
  }

  // Index wisdom sayings
  for (const wisdom of memories.wisdom || []) {
    const text = `Agent wisdom: "${wisdom.saying}"${wisdom.explanation ? `. Meaning: ${wisdom.explanation}` : ''}`;
    const doc: VectorDocument = {
      id: generateDocId('custom_agent', userId, `${agentId}_wisdom_${wisdom.id}`),
      text,
      metadata: {
        source: 'user_memory',
        category: 'custom_agent',
        subCategory: 'wisdom',
        agentId,
        wisdomId: wisdom.id,
        userId,
        timestamp: wisdom.createdAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err }, 'Failed to index agent wisdom');
    }
  }

  // Index shared moments
  for (const moment of memories.sharedMoments || []) {
    const text = `Shared moment with agent: ${moment.description}. Emotion: ${moment.emotion}. ${
      moment.whatTheySaid ? `They said: "${moment.whatTheySaid}". ` : ''
    }${moment.whatILearned ? `I learned: ${moment.whatILearned}` : ''}`;

    const doc: VectorDocument = {
      id: generateDocId('custom_agent', userId, `${agentId}_moment_${moment.id}`),
      text,
      metadata: {
        source: 'user_memory',
        category: 'custom_agent',
        subCategory: 'shared_moment',
        agentId,
        momentId: moment.id,
        emotion: moment.emotion,
        userId,
        timestamp: moment.createdAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err }, 'Failed to index shared moment');
    }
  }

  return indexed;
}

// ============================================================================
// CONTACT NOTES
// ============================================================================

/**
 * Index contact notes and relationship context for queries like:
 * "Who did I talk to about hiking?" or "What do I know about Sarah's interests?"
 */
export async function indexContactNotes(
  userId: string,
  contacts: EnhancedContact[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const contact of contacts) {
    // Skip contacts with no meaningful data to index
    const hasNotes = contact.notes?.trim();
    const hasInterests = contact.interests?.length;
    const hasSharedMemories = contact.sharedMemories?.length;
    const hasRecentTopics = contact.recentTopics?.length;

    if (!hasNotes && !hasInterests && !hasSharedMemories && !hasRecentTopics) {
      continue;
    }

    const text = `Contact: ${contact.name} (${contact.relationship}). ` +
      (hasNotes ? `Notes: ${contact.notes}. ` : '') +
      (hasInterests ? `Interests: ${contact.interests!.join(', ')}. ` : '') +
      (hasSharedMemories ? `Shared memories: ${contact.sharedMemories!.join('; ')}. ` : '') +
      (hasRecentTopics ? `Recent topics: ${contact.recentTopics!.join(', ')}. ` : '') +
      (contact.sensitiveTopics?.length
        ? `Sensitive topics to avoid: ${contact.sensitiveTopics.join(', ')}.`
        : '');

    const doc: VectorDocument = {
      id: generateDocId('contact_note', userId, contact.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'contact_note',
        contactId: contact.id,
        contactName: contact.name,
        relationship: contact.relationship,
        strengthScore: contact.strengthScore,
        sentiment: contact.sentiment,
        userId,
        timestamp: contact.updatedAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, contactId: contact.id }, 'Failed to index contact notes');
    }
  }

  return indexed;
}

// ============================================================================
// HABITS
// ============================================================================

/**
 * Index habit descriptions for semantic queries like:
 * "What habits do I have related to exercise?" or "Show me my morning habits"
 */
export async function indexHabits(
  userId: string,
  habits: EnhancedHabit[],
  store: AnyVectorStore
): Promise<number> {
  let indexed = 0;

  for (const habit of habits) {
    const habitLoopDesc = habit.habitLoop
      ? `Cue: ${habit.habitLoop.cue.description}. Routine: ${habit.habitLoop.routine.behavior}. Reward: ${habit.habitLoop.reward.intrinsic}.`
      : '';

    const text = `Habit: ${habit.name}. ${habit.description || ''} ` +
      `Domain: ${habit.domain}${habit.subdomain ? `/${habit.subdomain}` : ''}. ` +
      `Frequency: ${habit.frequency}. ` +
      (habit.isKeystone ? 'This is a keystone habit. ' : '') +
      (habit.cascadeEffects?.length
        ? `Cascade effects: ${habit.cascadeEffects.join(', ')}. `
        : '') +
      (habitLoopDesc ? habitLoopDesc + ' ' : '') +
      (habit.notes ? `Notes: ${habit.notes}. ` : '') +
      (habit.tags?.length ? `Tags: ${habit.tags.join(', ')}.` : '');

    const doc: VectorDocument = {
      id: generateDocId('habit', userId, habit.id),
      text,
      metadata: {
        source: 'user_memory',
        category: 'habit',
        habitId: habit.id,
        habitName: habit.name,
        domain: habit.domain,
        subdomain: habit.subdomain || null,
        isKeystone: habit.isKeystone,
        isActive: habit.isActive,
        currentStreak: habit.currentStreak,
        successRate: habit.successRate,
        frequency: habit.frequency,
        userId,
        timestamp: habit.updatedAt,
      },
    };

    try {
      await store.addDocument(doc);
      indexed++;
    } catch (err) {
      log.debug({ error: err, habitId: habit.id }, 'Failed to index habit');
    }
  }

  return indexed;
}
