/**
 * Narrative Builder
 *
 * Builds coherent life narratives from collections of memories.
 * Identifies themes, turning points, and emotional arcs to help
 * users understand their journey.
 *
 * @module memory/associative-cortex/discovery/narrative-builder
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { StoredMemory } from '../../unified-store/types.js';
import type {
  NarrativeArc,
  NarrativeType,
  KeyMoment,
  EmotionalTrajectory,
} from '../types.js';

const log = createLogger({ module: 'NarrativeBuilder' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface NarrativeBuilderConfig {
  /** Minimum memories required to build a narrative */
  minMemoriesForNarrative: number;

  /** Maximum memories to include in a narrative */
  maxMemoriesInNarrative: number;

  /** Minimum emotional variance to consider a trajectory */
  minEmotionalVariance: number;

  /** Themes to look for */
  themes: string[];
}

const DEFAULT_CONFIG: NarrativeBuilderConfig = {
  minMemoriesForNarrative: 3,
  maxMemoriesInNarrative: 20,
  minEmotionalVariance: 0.2,
  themes: [
    'career',
    'relationships',
    'health',
    'family',
    'growth',
    'creativity',
    'learning',
    'goals',
    'challenges',
    'achievements',
  ],
};

// ============================================================================
// NARRATIVE BUILDER
// ============================================================================

/**
 * Narrative Builder
 *
 * Builds life narratives from memories.
 */
export class NarrativeBuilder {
  private config: NarrativeBuilderConfig;

  constructor(config: Partial<NarrativeBuilderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build a narrative arc around a theme
   */
  async buildNarrative(
    userId: string,
    theme: string,
    memories: StoredMemory[],
    timeRange?: { start: Date; end: Date }
  ): Promise<NarrativeArc | null> {
    // Filter memories by theme
    let themeMemories = memories.filter((m) =>
      m.topics.some((t) => t.toLowerCase().includes(theme.toLowerCase()))
    );

    // Filter by time range if specified
    if (timeRange) {
      themeMemories = themeMemories.filter(
        (m) => m.createdAt >= timeRange.start && m.createdAt <= timeRange.end
      );
    }

    // Need enough memories
    if (themeMemories.length < this.config.minMemoriesForNarrative) {
      log.debug({ theme, count: themeMemories.length }, 'Not enough memories for narrative');
      return null;
    }

    // Sort chronologically
    themeMemories.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    // Limit to max
    if (themeMemories.length > this.config.maxMemoriesInNarrative) {
      themeMemories = this.selectRepresentativeMemories(themeMemories);
    }

    // Build components
    const keyMoments = this.identifyKeyMoments(themeMemories);
    const emotionalTrajectory = this.analyzeEmotionalTrajectory(themeMemories);
    const narrativeType = this.classifyNarrativeType(themeMemories, keyMoments, emotionalTrajectory);
    const insights = this.generateInsights(themeMemories, keyMoments, emotionalTrajectory, narrativeType);

    return {
      id: `narrative_${userId}_${theme}_${Date.now()}`,
      userId,
      theme,
      memories: themeMemories,
      keyMoments,
      emotionalTrajectory,
      insights,
      type: narrativeType,
      identifiedAt: new Date(),
    };
  }

  /**
   * Find all narratives for a user
   */
  async findNarratives(
    userId: string,
    memories: StoredMemory[]
  ): Promise<NarrativeArc[]> {
    const narratives: NarrativeArc[] = [];

    // Try each theme
    for (const theme of this.config.themes) {
      const narrative = await this.buildNarrative(userId, theme, memories);
      if (narrative) {
        narratives.push(narrative);
      }
    }

    // Sort by significance (number of key moments + memory count)
    narratives.sort((a, b) => {
      const scoreA = a.keyMoments.length * 2 + a.memories.length;
      const scoreB = b.keyMoments.length * 2 + b.memories.length;
      return scoreB - scoreA;
    });

    return narratives;
  }

  /**
   * Identify key moments in a narrative
   */
  private identifyKeyMoments(memories: StoredMemory[]): KeyMoment[] {
    const keyMoments: KeyMoment[] = [];

    for (let i = 0; i < memories.length; i++) {
      const memory = memories[i];
      const prev = memories[i - 1];
      const next = memories[i + 1];

      // Check for turning point (emotional shift)
      if (prev) {
        const emotionalShift = Math.abs(memory.emotionalWeight - prev.emotionalWeight);
        if (emotionalShift > 0.3) {
          keyMoments.push({
            memoryId: memory.id,
            type: 'turning_point',
            significance: `Significant emotional shift from previous`,
            emotionalIntensity: memory.emotionalWeight,
          });
          continue;
        }
      }

      // Check for commitment (potential realization or challenge)
      if (memory.isActiveCommitment) {
        keyMoments.push({
          memoryId: memory.id,
          type: 'challenge',
          significance: 'Set a new commitment',
          emotionalIntensity: memory.emotionalWeight,
        });
        continue;
      }

      // Check for high emotional intensity (significant moment)
      if (memory.emotionalWeight > 0.7) {
        const type = memory.emotionalWeight > 0.5 ? 'realization' : 'setback';
        keyMoments.push({
          memoryId: memory.id,
          type,
          significance: 'High emotional significance',
          emotionalIntensity: memory.emotionalWeight,
        });
        continue;
      }

      // Check for first or last (bookend moments)
      if (i === 0) {
        keyMoments.push({
          memoryId: memory.id,
          type: 'challenge',
          significance: 'Beginning of this journey',
          emotionalIntensity: memory.emotionalWeight,
        });
      } else if (i === memories.length - 1) {
        keyMoments.push({
          memoryId: memory.id,
          type: 'growth',
          significance: 'Current state in this journey',
          emotionalIntensity: memory.emotionalWeight,
        });
      }
    }

    // Deduplicate and limit
    const uniqueMoments = this.deduplicateKeyMoments(keyMoments);
    return uniqueMoments.slice(0, 5);
  }

  /**
   * Analyze emotional trajectory
   */
  private analyzeEmotionalTrajectory(memories: StoredMemory[]): EmotionalTrajectory {
    if (memories.length < 2) {
      return {
        direction: 'stable',
        startWeight: memories[0]?.emotionalWeight ?? 0.5,
        endWeight: memories[0]?.emotionalWeight ?? 0.5,
        shifts: [],
      };
    }

    const weights = memories.map((m) => m.emotionalWeight);
    const startWeight = weights[0];
    const endWeight = weights[weights.length - 1];

    // Calculate variance
    const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
    const variance =
      weights.reduce((sum, w) => sum + Math.pow(w - mean, 2), 0) / weights.length;

    // Identify shifts
    const shifts: EmotionalTrajectory['shifts'] = [];
    for (let i = 1; i < memories.length; i++) {
      const shift = memories[i].emotionalWeight - memories[i - 1].emotionalWeight;
      if (Math.abs(shift) > 0.3) {
        shifts.push({
          memoryId: memories[i].id,
          from: memories[i - 1].emotionalWeight,
          to: memories[i].emotionalWeight,
          reason: shift > 0 ? 'Emotional increase' : 'Emotional decrease',
        });
      }
    }

    // Determine direction
    let direction: EmotionalTrajectory['direction'];
    const delta = endWeight - startWeight;

    if (variance > 0.1) {
      direction = 'fluctuating';
    } else if (delta > 0.2) {
      direction = 'declining'; // Higher emotional weight often means more stress
    } else if (delta < -0.2) {
      direction = 'improving'; // Lower emotional weight often means resolution
    } else {
      direction = 'stable';
    }

    return {
      direction,
      startWeight,
      endWeight,
      shifts,
    };
  }

  /**
   * Classify the type of narrative
   */
  private classifyNarrativeType(
    memories: StoredMemory[],
    keyMoments: KeyMoment[],
    trajectory: EmotionalTrajectory
  ): NarrativeType {
    // Check for growth journey (emotional improvement over time)
    if (trajectory.direction === 'improving' && memories.length >= 5) {
      return 'growth_journey';
    }

    // Check for challenge overcome (starts hard, ends better)
    if (trajectory.startWeight > 0.6 && trajectory.endWeight < 0.4) {
      return 'challenge_overcome';
    }

    // Check for recurring pattern (high variance, similar content)
    if (trajectory.direction === 'fluctuating') {
      return 'recurring_pattern';
    }

    // Check for relationship arc (people mentioned)
    const hasPeople = memories.some((m) => m.peopleMentioned.length > 0);
    if (hasPeople) {
      return 'relationship_arc';
    }

    // Check for life chapter (long time span)
    if (memories.length >= 2) {
      const firstDate = memories[0].createdAt;
      const lastDate = memories[memories.length - 1].createdAt;
      const daySpan = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daySpan > 90) {
        return 'life_chapter';
      }
    }

    // Default
    return 'growth_journey';
  }

  /**
   * Generate insights from the narrative
   */
  private generateInsights(
    memories: StoredMemory[],
    keyMoments: KeyMoment[],
    trajectory: EmotionalTrajectory,
    type: NarrativeType
  ): string[] {
    const insights: string[] = [];

    // Trajectory insight
    switch (trajectory.direction) {
      case 'improving':
        insights.push('This journey shows positive progress over time.');
        break;
      case 'declining':
        insights.push('This area may need attention - emotional intensity has been increasing.');
        break;
      case 'fluctuating':
        insights.push('This theme has had ups and downs - patterns may be worth exploring.');
        break;
      case 'stable':
        insights.push('This area has remained relatively consistent.');
        break;
    }

    // Key moments insight
    if (keyMoments.length >= 3) {
      insights.push(`There have been ${keyMoments.length} significant moments in this journey.`);
    }

    // Type-specific insights
    switch (type) {
      case 'growth_journey':
        insights.push('You\'ve shown real growth in this area.');
        break;
      case 'challenge_overcome':
        insights.push('You faced a challenge here and came through it.');
        break;
      case 'recurring_pattern':
        insights.push('This pattern keeps repeating - there may be underlying causes worth exploring.');
        break;
      case 'relationship_arc':
        insights.push('This narrative involves important relationships.');
        break;
      case 'life_chapter':
        insights.push('This represents a significant chapter in your life.');
        break;
    }

    // People insight
    const allPeople = new Set(memories.flatMap((m) => m.peopleMentioned));
    if (allPeople.size > 0) {
      insights.push(`Key people in this narrative: ${[...allPeople].slice(0, 3).join(', ')}`);
    }

    return insights;
  }

  /**
   * Select representative memories when there are too many
   */
  private selectRepresentativeMemories(memories: StoredMemory[]): StoredMemory[] {
    const max = this.config.maxMemoriesInNarrative;

    // Always include first and last
    const selected: StoredMemory[] = [memories[0], memories[memories.length - 1]];

    // Include high emotional weight memories
    const sorted = [...memories.slice(1, -1)].sort(
      (a, b) => b.emotionalWeight - a.emotionalWeight
    );

    // Add until max
    for (const memory of sorted) {
      if (selected.length >= max) break;
      if (!selected.includes(memory)) {
        selected.push(memory);
      }
    }

    // Re-sort chronologically
    return selected.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  /**
   * Deduplicate key moments (same memory shouldn't appear twice)
   */
  private deduplicateKeyMoments(moments: KeyMoment[]): KeyMoment[] {
    const seen = new Set<string>();
    return moments.filter((m) => {
      if (seen.has(m.memoryId)) return false;
      seen.add(m.memoryId);
      return true;
    });
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let builderInstance: NarrativeBuilder | null = null;

export function getNarrativeBuilder(config?: Partial<NarrativeBuilderConfig>): NarrativeBuilder {
  if (!builderInstance) {
    builderInstance = new NarrativeBuilder(config);
  }
  return builderInstance;
}

export function resetNarrativeBuilder(): void {
  builderInstance = null;
}
