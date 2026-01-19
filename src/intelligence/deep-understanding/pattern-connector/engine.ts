/**
 * Pattern Connector Engine
 *
 * Connect dots humans miss. Track topic co-occurrence, emotional patterns,
 * and generate insights.
 *
 * @module @ferni/intelligence/deep-understanding/pattern-connector/engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type {
  IPatternConnector,
  TopicCoOccurrence,
  EmotionalPattern,
  PatternInsight,
} from './types.js';

const log = createLogger({ module: 'PatternConnector' });

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

interface UserPatterns {
  coOccurrences: Map<string, TopicCoOccurrence>;
  emotionalPatterns: Map<string, EmotionalPattern>;
  insights: PatternInsight[];
  observations: Array<{
    topics: string[];
    emotion: string;
    valence: number;
    sessionId: string;
    timestamp: Date;
  }>;
}

const storage = new Map<string, UserPatterns>();

function getOrCreate(userId: string): UserPatterns {
  let patterns = storage.get(userId);
  if (!patterns) {
    patterns = {
      coOccurrences: new Map(),
      emotionalPatterns: new Map(),
      insights: [],
      observations: [],
    };
    storage.set(userId, patterns);
  }
  return patterns;
}

// ============================================================================
// ENGINE IMPLEMENTATION
// ============================================================================

export class PatternConnector implements IPatternConnector {
  async recordObservation(
    userId: string,
    observation: {
      topics: string[];
      emotion: string;
      valence: number;
      sessionId: string;
    }
  ): Promise<void> {
    const patterns = getOrCreate(userId);

    // Store observation
    patterns.observations.push({
      ...observation,
      timestamp: new Date(),
    });

    // Keep last 500 observations
    if (patterns.observations.length > 500) {
      patterns.observations = patterns.observations.slice(-500);
    }

    // Update co-occurrences
    for (let i = 0; i < observation.topics.length; i++) {
      for (let j = i + 1; j < observation.topics.length; j++) {
        const key = this.coOccurrenceKey(observation.topics[i], observation.topics[j]);
        const existing = patterns.coOccurrences.get(key) || {
          topic1: observation.topics[i],
          topic2: observation.topics[j],
          count: 0,
          avgEmotion: observation.emotion,
          avgValence: 0,
          sessions: [],
          updatedAt: new Date(),
        };

        existing.count++;
        existing.avgValence =
          (existing.avgValence * (existing.count - 1) + observation.valence) /
          existing.count;
        if (!existing.sessions.includes(observation.sessionId)) {
          existing.sessions.push(observation.sessionId);
        }
        existing.updatedAt = new Date();

        patterns.coOccurrences.set(key, existing);
      }
    }

    // Update emotional patterns
    for (const topic of observation.topics) {
      const key = topic.toLowerCase();
      const existing = patterns.emotionalPatterns.get(key);

      if (existing) {
        const newSampleSize = existing.sampleSize + 1;
        const newValence =
          (existing.typicalValence * existing.sampleSize + observation.valence) /
          newSampleSize;

        // Calculate variance
        const oldVariance = existing.valenceVariance;
        const newVariance =
          (oldVariance * (existing.sampleSize - 1) +
            Math.pow(observation.valence - newValence, 2)) /
          newSampleSize;

        // Determine trend
        let trend: 'improving' | 'stable' | 'declining' = 'stable';
        const recentObs = patterns.observations
          .filter((o) => o.topics.includes(topic))
          .slice(-5);
        if (recentObs.length >= 3) {
          const recentAvg =
            recentObs.reduce((sum, o) => sum + o.valence, 0) / recentObs.length;
          if (recentAvg > existing.typicalValence + 0.1) trend = 'improving';
          else if (recentAvg < existing.typicalValence - 0.1) trend = 'declining';
        }

        patterns.emotionalPatterns.set(key, {
          ...existing,
          typicalValence: newValence,
          valenceVariance: newVariance,
          sampleSize: newSampleSize,
          trend,
          updatedAt: new Date(),
        });
      } else {
        patterns.emotionalPatterns.set(key, {
          subject: topic,
          subjectType: 'topic',
          typicalEmotion: observation.emotion,
          typicalValence: observation.valence,
          valenceVariance: 0,
          sampleSize: 1,
          trend: 'stable',
          updatedAt: new Date(),
        });
      }
    }

    log.debug(
      { userId, topicCount: observation.topics.length },
      'Pattern observation recorded'
    );
  }

  async getEmotionalPattern(
    userId: string,
    subject: string
  ): Promise<EmotionalPattern | null> {
    const patterns = storage.get(userId);
    return patterns?.emotionalPatterns.get(subject.toLowerCase()) || null;
  }

  async getCoOccurrences(
    userId: string,
    topic: string
  ): Promise<TopicCoOccurrence[]> {
    const patterns = storage.get(userId);
    if (!patterns) return [];

    const results: TopicCoOccurrence[] = [];
    const normalized = topic.toLowerCase();

    for (const coOcc of patterns.coOccurrences.values()) {
      if (
        coOcc.topic1.toLowerCase() === normalized ||
        coOcc.topic2.toLowerCase() === normalized
      ) {
        results.push(coOcc);
      }
    }

    return results.sort((a, b) => b.count - a.count);
  }

  async generateInsights(userId: string): Promise<PatternInsight[]> {
    const patterns = getOrCreate(userId);
    const insights: PatternInsight[] = [];

    // Generate emotional association insights
    for (const [_, pattern] of patterns.emotionalPatterns) {
      if (pattern.sampleSize >= 5) {
        // Strong negative association
        if (pattern.typicalValence < -0.3 && pattern.valenceVariance < 0.2) {
          insights.push({
            id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'emotional-association',
            insight: `When ${pattern.subject} comes up, your mood tends to drop.`,
            subjects: [pattern.subject],
            confidence: Math.min(0.9, 0.5 + pattern.sampleSize * 0.05),
            strength: Math.abs(pattern.typicalValence),
            generatedAt: new Date(),
            surfaced: false,
          });
        }

        // Strong positive association
        if (pattern.typicalValence > 0.4 && pattern.valenceVariance < 0.2) {
          insights.push({
            id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'emotional-association',
            insight: `${pattern.subject} seems to lift your spirits.`,
            subjects: [pattern.subject],
            confidence: Math.min(0.9, 0.5 + pattern.sampleSize * 0.05),
            strength: pattern.typicalValence,
            generatedAt: new Date(),
            surfaced: false,
          });
        }

        // Trend insights
        if (pattern.trend !== 'stable' && pattern.sampleSize >= 8) {
          insights.push({
            id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'trend',
            insight:
              pattern.trend === 'improving'
                ? `Your feelings about ${pattern.subject} seem to be improving.`
                : `Your feelings about ${pattern.subject} seem to be getting harder.`,
            subjects: [pattern.subject],
            confidence: 0.7,
            strength: 0.6,
            generatedAt: new Date(),
            surfaced: false,
          });
        }
      }
    }

    // Generate co-occurrence insights
    for (const coOcc of patterns.coOccurrences.values()) {
      if (coOcc.count >= 5 && coOcc.sessions.length >= 3) {
        insights.push({
          id: `insight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          type: 'co-occurrence',
          insight: `${coOcc.topic1} and ${coOcc.topic2} often come up together in our conversations.`,
          subjects: [coOcc.topic1, coOcc.topic2],
          confidence: Math.min(0.9, 0.5 + coOcc.count * 0.05),
          strength: Math.min(1, coOcc.count / 10),
          generatedAt: new Date(),
          surfaced: false,
        });
      }
    }

    // Store insights
    patterns.insights.push(...insights);

    return insights;
  }

  async getUnsurfacedInsights(userId: string): Promise<PatternInsight[]> {
    const patterns = storage.get(userId);
    if (!patterns) return [];
    return patterns.insights.filter((i) => !i.surfaced);
  }

  async surfaceInsight(
    userId: string,
    insightId: string,
    reaction?: 'helpful' | 'neutral' | 'unhelpful'
  ): Promise<void> {
    const patterns = storage.get(userId);
    if (!patterns) return;

    const insight = patterns.insights.find((i) => i.id === insightId);
    if (insight) {
      insight.surfaced = true;
      insight.userReaction = reaction;
    }
  }

  async buildContextInjection(
    userId: string,
    currentTopics: string[]
  ): Promise<string> {
    const patterns = storage.get(userId);
    if (!patterns) return '';

    const sections: string[] = ['[PATTERN INSIGHTS]'];
    let hasContent = false;

    // Find relevant emotional patterns
    for (const topic of currentTopics) {
      const pattern = patterns.emotionalPatterns.get(topic.toLowerCase());
      if (pattern && pattern.sampleSize >= 3) {
        if (pattern.typicalValence < -0.2) {
          sections.push(
            `Note: "${topic}" tends to bring up difficult feelings for this user.`
          );
          hasContent = true;
        } else if (pattern.typicalValence > 0.3) {
          sections.push(`Note: "${topic}" is usually a positive topic.`);
          hasContent = true;
        }
      }
    }

    // Find relevant co-occurrences
    for (const topic of currentTopics) {
      const coOccs = await this.getCoOccurrences(userId, topic);
      const strong = coOccs.filter((c) => c.count >= 3);
      if (strong.length > 0) {
        const related = strong
          .map((c) =>
            c.topic1.toLowerCase() === topic.toLowerCase() ? c.topic2 : c.topic1
          )
          .slice(0, 3);
        sections.push(`Related topics: ${related.join(', ')}`);
        hasContent = true;
      }
    }

    if (!hasContent) return '';
    return sections.join('\n');
  }

  reset(): void {
    storage.clear();
    log.debug('Pattern connector reset');
  }
  
  private coOccurrenceKey(topic1: string, topic2: string): string {
    const sorted = [topic1.toLowerCase(), topic2.toLowerCase()].sort();
    return `${sorted[0]}::${sorted[1]}`;
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let instance: PatternConnector | null = null;

export function getPatternConnector(): IPatternConnector {
  if (!instance) {
    instance = new PatternConnector();
  }
  return instance;
}

export function createPatternConnector(): IPatternConnector {
  return new PatternConnector();
}

export function resetPatternConnector(): void {
  instance = null;
}

export async function clearUserData(userId: string): Promise<void> {
  storage.delete(userId);
}
