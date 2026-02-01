/**
 * Relational Memory Engine
 *
 * Store and retrieve relationship-specific memories.
 *
 * @module @ferni/services/superhuman/relational-memory/engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  IRelationalMemory,
  RelationalMemory,
  InsideJoke,
  ConversationRitual,
  CommunicationPreference,
  TrustMilestone,
  RelationshipStats,
} from './types.js';

const log = createLogger({ module: 'RelationalMemory' });

// ============================================================================
// IN-MEMORY STORAGE (Replace with Firestore in production)
// ============================================================================

const storage = new Map<string, RelationalMemory>();

function getOrCreate(userId: string): RelationalMemory {
  let memory = storage.get(userId);
  if (!memory) {
    memory = {
      userId,
      jokes: [],
      rituals: [],
      preferences: [],
      milestones: [],
      stats: {
        totalSessions: 0,
        daysSinceFirstInteraction: 0,
        trustLevel: 0.3,
        engagementTrend: 'stable',
        topConnectedTopics: [],
      },
      updatedAt: new Date(),
    };
    storage.set(userId, memory);
  }
  return memory;
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class RelationalMemoryEngine implements IRelationalMemory {
  // ==========================================================================
  // JOKES
  // ==========================================================================

  async addJoke(
    userId: string,
    joke: Omit<
      InsideJoke,
      'id' | 'createdAt' | 'timesReferenced' | 'lastReferencedAt' | 'reactions'
    >
  ): Promise<InsideJoke> {
    const memory = getOrCreate(userId);

    const newJoke: InsideJoke = {
      ...joke,
      id: `joke-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      timesReferenced: 0,
      lastReferencedAt: new Date(),
      reactions: [],
    };

    memory.jokes.push(newJoke);
    memory.updatedAt = new Date();

    log.debug({ userId, jokeId: newJoke.id }, 'Inside joke added');
    return newJoke;
  }

  async getJokes(userId: string): Promise<InsideJoke[]> {
    const memory = storage.get(userId);
    return memory?.jokes || [];
  }

  async findRelevantJoke(userId: string, keywords: string[]): Promise<InsideJoke | null> {
    const jokes = await this.getJokes(userId);
    if (jokes.length === 0) return null;

    const normalizedKeywords = keywords.map((k) => k.toLowerCase());

    // Find jokes with matching keywords
    const matches = jokes.filter((joke) =>
      joke.triggerKeywords.some((k) =>
        normalizedKeywords.some((nk) => k.toLowerCase().includes(nk))
      )
    );

    if (matches.length === 0) return null;

    // Return most recently successful one
    const positiveJokes = matches.filter(
      (j) => j.reactions.length === 0 || j.reactions.slice(-3).some((r) => r.positive)
    );

    return positiveJokes.length > 0
      ? positiveJokes[Math.floor(Math.random() * positiveJokes.length)]
      : matches[0];
  }

  async recordJokeUse(userId: string, jokeId: string, wasPositive: boolean): Promise<void> {
    const memory = getOrCreate(userId);
    const joke = memory.jokes.find((j) => j.id === jokeId);

    if (joke) {
      joke.timesReferenced++;
      joke.lastReferencedAt = new Date();
      joke.reactions.push({ date: new Date(), positive: wasPositive });

      // Keep only last 10 reactions
      if (joke.reactions.length > 10) {
        joke.reactions = joke.reactions.slice(-10);
      }

      memory.updatedAt = new Date();
    }
  }

  // ==========================================================================
  // RITUALS
  // ==========================================================================

  async addRitual(
    userId: string,
    ritual: Omit<ConversationRitual, 'id' | 'establishedAt' | 'timesPerformed'>
  ): Promise<ConversationRitual> {
    const memory = getOrCreate(userId);

    const newRitual: ConversationRitual = {
      ...ritual,
      id: `ritual-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      establishedAt: new Date(),
      timesPerformed: 0,
    };

    memory.rituals.push(newRitual);
    memory.updatedAt = new Date();

    log.debug({ userId, ritualId: newRitual.id, name: newRitual.name }, 'Ritual added');
    return newRitual;
  }

  async getRituals(userId: string): Promise<ConversationRitual[]> {
    const memory = storage.get(userId);
    return memory?.rituals || [];
  }

  async getRitualsForTiming(
    userId: string,
    timing: ConversationRitual['timing']
  ): Promise<ConversationRitual[]> {
    const rituals = await this.getRituals(userId);
    return rituals.filter((r) => r.timing === timing || r.timing === 'any');
  }

  async recordRitualUse(userId: string, ritualId: string): Promise<void> {
    const memory = getOrCreate(userId);
    const ritual = memory.rituals.find((r) => r.id === ritualId);

    if (ritual) {
      ritual.timesPerformed++;
      memory.updatedAt = new Date();
    }
  }

  // ==========================================================================
  // PREFERENCES
  // ==========================================================================

  async updatePreference(userId: string, preference: CommunicationPreference): Promise<void> {
    const memory = getOrCreate(userId);
    const existing = memory.preferences.findIndex((p) => p.category === preference.category);

    if (existing >= 0) {
      memory.preferences[existing] = {
        ...memory.preferences[existing],
        ...preference,
        updatedAt: new Date(),
      };
    } else {
      memory.preferences.push({
        ...preference,
        updatedAt: new Date(),
      });
    }

    memory.updatedAt = new Date();
    log.debug({ userId, category: preference.category }, 'Preference updated');
  }

  async getPreferences(userId: string): Promise<CommunicationPreference[]> {
    const memory = storage.get(userId);
    return memory?.preferences || [];
  }

  async getPreferenceByCategory(
    userId: string,
    category: CommunicationPreference['category']
  ): Promise<CommunicationPreference | null> {
    const preferences = await this.getPreferences(userId);
    return preferences.find((p) => p.category === category) || null;
  }

  // ==========================================================================
  // MILESTONES
  // ==========================================================================

  async addMilestone(
    userId: string,
    milestone: Omit<TrustMilestone, 'id'>
  ): Promise<TrustMilestone> {
    const memory = getOrCreate(userId);

    const newMilestone: TrustMilestone = {
      ...milestone,
      id: `milestone-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };

    memory.milestones.push(newMilestone);
    memory.updatedAt = new Date();

    // Update trust level
    this.updateTrustLevel(memory);

    log.debug(
      { userId, milestoneId: newMilestone.id, type: newMilestone.type },
      'Trust milestone added'
    );
    return newMilestone;
  }

  async getMilestones(userId: string): Promise<TrustMilestone[]> {
    const memory = storage.get(userId);
    return memory?.milestones || [];
  }

  async getRecentMilestones(userId: string, days: number): Promise<TrustMilestone[]> {
    const milestones = await this.getMilestones(userId);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return milestones.filter((m) => new Date(m.occurredAt) > cutoff);
  }

  // ==========================================================================
  // AGGREGATE
  // ==========================================================================

  async getRelationalMemory(userId: string): Promise<RelationalMemory | null> {
    return storage.get(userId) || null;
  }

  async buildContextForLLM(userId: string): Promise<string> {
    const memory = storage.get(userId);
    if (!memory) return '';

    const sections: string[] = ['[RELATIONAL MEMORY]'];

    // Recent inside jokes
    const recentJokes = memory.jokes
      .filter((j) => j.reactions.slice(-3).some((r) => r.positive))
      .slice(0, 3);

    if (recentJokes.length > 0) {
      sections.push('Inside jokes you share:');
      for (const joke of recentJokes) {
        sections.push(`- "${joke.content}" (Keywords: ${joke.triggerKeywords.join(', ')})`);
      }
    }

    // Active rituals
    const activeRituals = memory.rituals.filter((r) => r.userPreference > 0.5);
    if (activeRituals.length > 0) {
      sections.push('Conversation rituals:');
      for (const ritual of activeRituals) {
        sections.push(`- ${ritual.name}: ${ritual.description}`);
      }
    }

    // Communication preferences
    const strongPrefs = memory.preferences.filter((p) => p.confidence > 0.7);
    if (strongPrefs.length > 0) {
      sections.push('Communication preferences:');
      for (const pref of strongPrefs) {
        sections.push(`- ${pref.category}: ${pref.value}`);
      }
    }

    // Recent milestones
    const recentMilestones = await this.getRecentMilestones(userId, 30);
    if (recentMilestones.length > 0) {
      sections.push('Recent trust moments:');
      for (const milestone of recentMilestones.slice(0, 3)) {
        sections.push(`- ${milestone.description}`);
      }
    }

    // Trust level
    sections.push(`Trust level: ${(memory.stats.trustLevel * 100).toFixed(0)}%`);

    return sections.join('\n');
  }

  // ==========================================================================
  // MAINTENANCE
  // ==========================================================================

  cleanup(): void {
    // Clean old, unused jokes
    for (const memory of storage.values()) {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Remove jokes that haven't been used in 30 days and got negative reactions
      memory.jokes = memory.jokes.filter(
        (j) =>
          new Date(j.lastReferencedAt) > thirtyDaysAgo ||
          j.reactions.slice(-3).some((r) => r.positive)
      );
    }

    log.debug('Relational memory cleanup completed');
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  private updateTrustLevel(memory: RelationalMemory): void {
    const milestoneBoost = Math.min(0.5, memory.milestones.length * 0.05);
    const ritualBoost = Math.min(0.2, memory.rituals.length * 0.05);
    const jokeBoost = Math.min(0.2, memory.jokes.length * 0.05);

    memory.stats.trustLevel = Math.min(1, 0.3 + milestoneBoost + ritualBoost + jokeBoost);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: RelationalMemoryEngine | null = null;

/**
 * Get singleton instance
 */
export function getRelationalMemory(): IRelationalMemory {
  if (!instance) {
    instance = new RelationalMemoryEngine();
  }
  return instance;
}

/**
 * Create new instance (for testing)
 */
export function createRelationalMemory(): IRelationalMemory {
  return new RelationalMemoryEngine();
}

/**
 * Reset singleton (for testing)
 */
export function resetRelationalMemory(): void {
  instance = null;
}

/**
 * Clear user data (for testing)
 */
export async function clearUserData(userId: string): Promise<void> {
  storage.delete(userId);
}
