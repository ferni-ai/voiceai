/**
 * Pattern Formation
 *
 * Detects patterns from repeated events/memories:
 * - Behavioral patterns ("You tend to feel anxious before presentations")
 * - Emotional patterns ("Your mood improves after exercise")
 * - Temporal patterns ("You're most productive in the morning")
 * - Relationship patterns ("Conversations with X often lead to Y")
 *
 * This is "Better Than Human" because we can objectively track
 * patterns that users can't see themselves.
 *
 * @module memory/pattern-formation
 */

import { createLogger } from '../utils/safe-logger.js';
import type { MemoryItem } from './interfaces/index.js';

const log = createLogger({ module: 'PatternFormation' });

// ============================================================================
// TYPES
// ============================================================================

export type PatternType =
  | 'behavioral' // Actions that repeat
  | 'emotional' // Emotional responses that repeat
  | 'temporal' // Time-based patterns
  | 'relational' // Patterns involving people
  | 'topical' // Recurring themes
  | 'sequential'; // A leads to B patterns

export interface DetectedPattern {
  id: string;
  type: PatternType;
  description: string;
  confidence: number; // 0-1

  // Evidence
  sourceMemoryIds: string[];
  occurrenceCount: number;
  firstOccurrence: Date;
  lastOccurrence: Date;

  // Pattern details
  trigger?: string; // What triggers the pattern
  outcome?: string; // What typically results
  frequency?: string; // How often it occurs
  context?: Record<string, unknown>;

  // Metadata
  createdAt: Date;
  lastValidated: Date;
  surfacedCount: number;
}

export interface PatternCandidate {
  memories: MemoryItem[];
  type: PatternType;
  similarity: number;
  description: string;
}

export interface PatternFormationConfig {
  // Minimum occurrences to form a pattern
  minOccurrences: number;

  // Similarity threshold for grouping
  similarityThreshold: number;

  // Time window for temporal patterns (days)
  temporalWindowDays: number;

  // Maximum patterns per user
  maxPatternsPerUser: number;

  // Confidence decay for old patterns
  confidenceDecayPerDay: number;
}

const DEFAULT_CONFIG: PatternFormationConfig = {
  minOccurrences: 3,
  similarityThreshold: 0.7,
  temporalWindowDays: 90,
  maxPatternsPerUser: 50,
  confidenceDecayPerDay: 0.001,
};

// ============================================================================
// PATTERN DETECTOR
// ============================================================================

export class PatternFormationEngine {
  private config: PatternFormationConfig;
  private patternsCache = new Map<string, DetectedPattern[]>();

  constructor(config?: Partial<PatternFormationConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // PATTERN DETECTION
  // ==========================================================================

  /**
   * Detect all patterns from a user's memories
   */
  async detectPatterns(userId: string, memories: MemoryItem[]): Promise<DetectedPattern[]> {
    const allPatterns: DetectedPattern[] = [];

    // Detect each type of pattern
    const behavioral = await this.detectBehavioralPatterns(memories);
    const emotional = await this.detectEmotionalPatterns(memories);
    const temporal = await this.detectTemporalPatterns(memories);
    const relational = await this.detectRelationalPatterns(memories);
    const topical = await this.detectTopicalPatterns(memories);
    const sequential = await this.detectSequentialPatterns(memories);

    allPatterns.push(
      ...behavioral,
      ...emotional,
      ...temporal,
      ...relational,
      ...topical,
      ...sequential
    );

    // Sort by confidence and limit
    const sorted = allPatterns
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, this.config.maxPatternsPerUser);

    // Cache
    this.patternsCache.set(userId, sorted);

    log.debug(
      {
        userId,
        totalPatterns: sorted.length,
        byType: {
          behavioral: behavioral.length,
          emotional: emotional.length,
          temporal: temporal.length,
          relational: relational.length,
          topical: topical.length,
          sequential: sequential.length,
        },
      },
      'Patterns detected'
    );

    return sorted;
  }

  /**
   * Detect behavioral patterns (repeated actions)
   */
  private async detectBehavioralPatterns(memories: MemoryItem[]): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Group by action-like content
    const actionMemories = memories.filter(
      (m) =>
        m.content.toLowerCase().includes('started') ||
        m.content.toLowerCase().includes('went') ||
        m.content.toLowerCase().includes('did') ||
        m.content.toLowerCase().includes('decided') ||
        m.content.toLowerCase().includes('always') ||
        m.content.toLowerCase().includes('usually')
    );

    // Group by similar topics
    const byTopic = this.groupByTopic(actionMemories);

    for (const [topic, group] of byTopic) {
      if (group.length >= this.config.minOccurrences) {
        const pattern = this.createPattern('behavioral', group, `Tends to ${topic.toLowerCase()}`);
        if (pattern) patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Detect emotional patterns (emotional responses that repeat)
   */
  private async detectEmotionalPatterns(memories: MemoryItem[]): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Group by emotional weight
    const highEmotion = memories.filter((m) => m.emotionalWeight > 0.6);

    // Look for emotion → topic correlations
    const emotionTopics = new Map<string, MemoryItem[]>();

    for (const memory of highEmotion) {
      const topic = memory.topics?.[0] || 'general';
      const existing = emotionTopics.get(topic) || [];
      existing.push(memory);
      emotionTopics.set(topic, existing);
    }

    for (const [topic, group] of emotionTopics) {
      if (group.length >= this.config.minOccurrences) {
        const avgWeight = group.reduce((sum, m) => sum + m.emotionalWeight, 0) / group.length;
        const intensity = avgWeight > 0.8 ? 'strong' : 'moderate';

        const pattern = this.createPattern(
          'emotional',
          group,
          `Has ${intensity} emotional responses to ${topic}`
        );
        if (pattern) patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Detect temporal patterns (time-based)
   */
  private async detectTemporalPatterns(memories: MemoryItem[]): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Group by day of week
    const byDayOfWeek = new Map<number, MemoryItem[]>();
    for (const memory of memories) {
      const day = memory.timestamp.getDay();
      const existing = byDayOfWeek.get(day) || [];
      existing.push(memory);
      byDayOfWeek.set(day, existing);
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const [day, group] of byDayOfWeek) {
      // Check if significantly more than average
      const avgPerDay = memories.length / 7;
      if (group.length > avgPerDay * 1.5 && group.length >= this.config.minOccurrences) {
        const pattern = this.createPattern('temporal', group, `More active on ${dayNames[day]}s`);
        if (pattern) {
          pattern.frequency = dayNames[day];
          patterns.push(pattern);
        }
      }
    }

    // Group by time of day
    const byTimeOfDay = new Map<string, MemoryItem[]>();
    for (const memory of memories) {
      const hour = memory.timestamp.getHours();
      let timeOfDay: string;
      if (hour >= 5 && hour < 12) timeOfDay = 'morning';
      else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon';
      else if (hour >= 17 && hour < 21) timeOfDay = 'evening';
      else timeOfDay = 'night';

      const existing = byTimeOfDay.get(timeOfDay) || [];
      existing.push(memory);
      byTimeOfDay.set(timeOfDay, existing);
    }

    for (const [timeOfDay, group] of byTimeOfDay) {
      const avgPerTime = memories.length / 4;
      if (group.length > avgPerTime * 1.5 && group.length >= this.config.minOccurrences) {
        const pattern = this.createPattern('temporal', group, `Most active in the ${timeOfDay}`);
        if (pattern) {
          pattern.frequency = timeOfDay;
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  /**
   * Detect relational patterns (patterns involving people)
   */
  private async detectRelationalPatterns(memories: MemoryItem[]): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Group by person mentioned
    const byPerson = new Map<string, MemoryItem[]>();
    for (const memory of memories) {
      if (memory.personMentioned) {
        const existing = byPerson.get(memory.personMentioned) || [];
        existing.push(memory);
        byPerson.set(memory.personMentioned, existing);
      }
    }

    for (const [person, group] of byPerson) {
      if (group.length >= this.config.minOccurrences) {
        // Look for common emotions with this person
        const avgEmotion = group.reduce((sum, m) => sum + m.emotionalWeight, 0) / group.length;
        const emotionLevel =
          avgEmotion > 0.7
            ? 'emotionally significant'
            : avgEmotion > 0.4
              ? 'meaningful'
              : 'regular';

        const pattern = this.createPattern(
          'relational',
          group,
          `${emotionLevel} interactions with ${person}`
        );
        if (pattern) {
          pattern.context = { person, avgEmotionalWeight: avgEmotion };
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  /**
   * Detect topical patterns (recurring themes)
   */
  private async detectTopicalPatterns(memories: MemoryItem[]): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Group by topic
    const byTopic = this.groupByTopic(memories);

    for (const [topic, group] of byTopic) {
      if (group.length >= this.config.minOccurrences) {
        const pattern = this.createPattern('topical', group, `Frequently thinks about ${topic}`);
        if (pattern) patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Detect sequential patterns (A leads to B)
   */
  private async detectSequentialPatterns(memories: MemoryItem[]): Promise<DetectedPattern[]> {
    const patterns: DetectedPattern[] = [];

    // Sort by time
    const sorted = [...memories].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Look for topic → topic sequences
    const sequences = new Map<string, number>();
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];

      // Within 24 hours
      const timeDiff = next.timestamp.getTime() - current.timestamp.getTime();
      if (timeDiff > 0 && timeDiff < 24 * 60 * 60 * 1000) {
        const currentTopic = current.topics?.[0] || 'general';
        const nextTopic = next.topics?.[0] || 'general';

        if (currentTopic !== nextTopic) {
          const key = `${currentTopic}→${nextTopic}`;
          sequences.set(key, (sequences.get(key) || 0) + 1);
        }
      }
    }

    for (const [sequence, count] of sequences) {
      if (count >= this.config.minOccurrences) {
        const [from, to] = sequence.split('→');
        const relatedMemories = sorted.filter(
          (m) => m.topics?.includes(from) || m.topics?.includes(to)
        );

        const pattern = this.createPattern(
          'sequential',
          relatedMemories.slice(0, 10),
          `${from} often leads to thoughts about ${to}`
        );
        if (pattern) {
          pattern.trigger = from;
          pattern.outcome = to;
          pattern.occurrenceCount = count;
          patterns.push(pattern);
        }
      }
    }

    return patterns;
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private groupByTopic(memories: MemoryItem[]): Map<string, MemoryItem[]> {
    const byTopic = new Map<string, MemoryItem[]>();

    for (const memory of memories) {
      const topic = memory.topics?.[0] || 'general';
      const existing = byTopic.get(topic) || [];
      existing.push(memory);
      byTopic.set(topic, existing);
    }

    return byTopic;
  }

  private createPattern(
    type: PatternType,
    memories: MemoryItem[],
    description: string
  ): DetectedPattern | null {
    if (memories.length < this.config.minOccurrences) return null;

    const timestamps = memories.map((m) => m.timestamp.getTime());
    const firstOccurrence = new Date(Math.min(...timestamps));
    const lastOccurrence = new Date(Math.max(...timestamps));

    // Calculate confidence based on frequency and recency
    const daysSinceFirst = (Date.now() - firstOccurrence.getTime()) / (24 * 60 * 60 * 1000);
    const frequency = memories.length / Math.max(1, daysSinceFirst / 30); // Per month
    const recency =
      1 - Math.min(1, (Date.now() - lastOccurrence.getTime()) / (90 * 24 * 60 * 60 * 1000));

    const confidence = Math.min(1, frequency * 0.3 + recency * 0.4 + (memories.length / 10) * 0.3);

    return {
      id: `pattern_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      description,
      confidence,
      sourceMemoryIds: memories.map((m) => m.id),
      occurrenceCount: memories.length,
      firstOccurrence,
      lastOccurrence,
      createdAt: new Date(),
      lastValidated: new Date(),
      surfacedCount: 0,
    };
  }

  /**
   * Get cached patterns for a user
   */
  getPatterns(userId: string): DetectedPattern[] {
    return this.patternsCache.get(userId) || [];
  }

  /**
   * Get patterns relevant to a topic
   */
  getPatternsForTopic(userId: string, topic: string): DetectedPattern[] {
    const patterns = this.getPatterns(userId);
    return patterns.filter(
      (p) =>
        p.description.toLowerCase().includes(topic.toLowerCase()) ||
        p.trigger?.toLowerCase().includes(topic.toLowerCase()) ||
        p.outcome?.toLowerCase().includes(topic.toLowerCase())
    );
  }

  /**
   * Mark a pattern as surfaced
   */
  markSurfaced(userId: string, patternId: string): void {
    const patterns = this.patternsCache.get(userId);
    if (patterns) {
      const pattern = patterns.find((p) => p.id === patternId);
      if (pattern) {
        pattern.surfacedCount++;
        pattern.lastValidated = new Date();
      }
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let patternFormationInstance: PatternFormationEngine | null = null;

export function getPatternFormation(): PatternFormationEngine {
  if (!patternFormationInstance) {
    patternFormationInstance = new PatternFormationEngine();
  }
  return patternFormationInstance;
}

export function resetPatternFormation(): void {
  patternFormationInstance = null;
}

export default {
  PatternFormationEngine,
  getPatternFormation,
  resetPatternFormation,
};
