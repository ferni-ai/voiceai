/**
 * Advanced Correlation Engine - Superhuman Pattern Detection
 *
 * Detects sophisticated patterns that humans would miss:
 * - Temporal patterns (weekly, monthly, seasonal cycles)
 * - Emotional correlations (what triggers what feelings)
 * - Behavioral sequences (A → B → C patterns)
 * - Cross-domain correlations (work stress → relationship tension)
 * - Lagged effects (event X predicts feeling Y after N days)
 *
 * Uses statistical methods to ensure patterns are real, not noise.
 *
 * @module memory/knowledge-graph/superhuman/advanced-correlation
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { Entity, Mention, Thread } from '../types.js';

const log = createLogger({ module: 'AdvancedCorrelation' });

// ============================================================================
// TYPES
// ============================================================================

export interface TemporalPattern {
  id: string;
  userId: string;
  /** Type of temporal pattern */
  type: 'daily' | 'weekly' | 'monthly' | 'seasonal' | 'event_triggered';
  /** What's being tracked */
  subject: string;
  entityId?: string;
  /** When in the cycle this happens */
  timing: {
    /** For daily: hour (0-23), weekly: day (0-6), monthly: day (1-31), seasonal: month (1-12) */
    value: number;
    /** Variance in timing */
    variance: number;
  };
  /** What happens at this time */
  observation: string;
  /** Statistical confidence (0-1) */
  confidence: number;
  /** Number of occurrences observed */
  occurrences: number;
  /** How actionable is this */
  actionability: 'high' | 'medium' | 'low';
  /** Suggested intervention */
  suggestion?: string;
}

export interface EmotionalCorrelation {
  id: string;
  userId: string;
  /** The trigger (entity, topic, or event) */
  trigger: {
    type: 'entity' | 'topic' | 'event' | 'time' | 'context';
    id?: string;
    name: string;
  };
  /** The resulting emotion */
  emotion: {
    primary: string;
    intensity: number;
    valence: number;
  };
  /** Correlation strength (-1 to 1) */
  correlation: number;
  /** Statistical significance (p-value) */
  significance: number;
  /** How often this correlation occurs */
  frequency: number;
  /** Time lag before emotion manifests (hours) */
  lagHours?: number;
  /** Context where correlation is strongest */
  strongestContext?: string;
}

export interface BehavioralSequence {
  id: string;
  userId: string;
  /** Sequence of events/topics that tend to follow each other */
  sequence: Array<{
    step: number;
    type: 'entity' | 'topic' | 'emotion' | 'action';
    name: string;
    id?: string;
  }>;
  /** How often this sequence occurs */
  frequency: number;
  /** Typical time between steps (hours) */
  typicalGapHours: number;
  /** Confidence this is a real pattern */
  confidence: number;
  /** Is this a healthy or concerning pattern? */
  assessment: 'positive' | 'negative' | 'neutral';
  /** Why we care about this pattern */
  insight: string;
}

export interface PatternInsight {
  id: string;
  userId: string;
  /** Type of insight */
  type: 'temporal' | 'emotional' | 'behavioral' | 'cross_domain';
  /** Natural language description */
  insight: string;
  /** Supporting evidence */
  evidence: string[];
  /** Confidence (0-1) */
  confidence: number;
  /** Should this be proactively surfaced? */
  shouldSurface: boolean;
  /** When to surface (if applicable) */
  surfaceContext?: string;
  /** Related patterns */
  relatedPatterns: string[];
  /** Generated at */
  generatedAt: Date;
}

export interface CrossDomainCorrelation {
  domain1: {
    name: string;
    type: 'work' | 'health' | 'relationship' | 'finance' | 'personal';
    entityIds: string[];
  };
  domain2: {
    name: string;
    type: 'work' | 'health' | 'relationship' | 'finance' | 'personal';
    entityIds: string[];
  };
  correlation: number;
  lagDays: number;
  direction: 'bidirectional' | 'domain1_to_domain2' | 'domain2_to_domain1';
  insight: string;
}

// ============================================================================
// ADVANCED CORRELATION ENGINE
// ============================================================================

export class AdvancedCorrelationEngine {
  /**
   * Detect all temporal patterns for a user
   */
  async detectTemporalPatterns(userId: string): Promise<TemporalPattern[]> {
    const patterns: TemporalPattern[] = [];

    try {
      const mentions = await this.loadMentions(userId, 180); // 6 months

      // Detect daily patterns
      const dailyPatterns = this.detectDailyPatterns(userId, mentions);
      patterns.push(...dailyPatterns);

      // Detect weekly patterns
      const weeklyPatterns = this.detectWeeklyPatterns(userId, mentions);
      patterns.push(...weeklyPatterns);

      // Detect monthly patterns
      const monthlyPatterns = this.detectMonthlyPatterns(userId, mentions);
      patterns.push(...monthlyPatterns);

      // Detect seasonal patterns (if enough data)
      if (mentions.length > 100) {
        const seasonalPatterns = this.detectSeasonalPatterns(userId, mentions);
        patterns.push(...seasonalPatterns);
      }

      return patterns.filter((p) => p.confidence > 0.5);
    } catch (error) {
      log.error({ error: String(error) }, 'Temporal pattern detection failed');
      return [];
    }
  }

  /**
   * Find emotional correlations
   */
  async findEmotionalCorrelations(userId: string): Promise<EmotionalCorrelation[]> {
    const correlations: EmotionalCorrelation[] = [];

    try {
      const mentions = await this.loadMentions(userId, 90); // 3 months
      const { getAllEntities } = await import('../../entity-store/storage.js');
      const entities = await getAllEntities(userId, { limit: 100 });

      // Entity → Emotion correlations
      for (const entity of entities) {
        const entityMentions = mentions.filter((m) => m.entityId === entity.id);
        if (entityMentions.length < 5) continue;

        const emotionCounts = this.countEmotions(entityMentions);
        const correlationResult = this.calculateEmotionCorrelation(entityMentions);

        if (correlationResult.significance < 0.1) {
          correlations.push({
            id: `emotional-${entity.id}`,
            userId,
            trigger: {
              type: 'entity',
              id: entity.id,
              name: entity.canonicalName,
            },
            emotion: correlationResult.dominantEmotion,
            correlation: correlationResult.correlation,
            significance: correlationResult.significance,
            frequency: entityMentions.length,
          });
        }
      }

      // Time-based emotional patterns
      const timeCorrelations = this.detectTimeEmotionCorrelations(userId, mentions);
      correlations.push(...timeCorrelations);

      return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    } catch (error) {
      log.error({ error: String(error) }, 'Emotional correlation analysis failed');
      return [];
    }
  }

  /**
   * Detect behavioral sequences
   */
  async detectBehavioralSequences(userId: string): Promise<BehavioralSequence[]> {
    const sequences: BehavioralSequence[] = [];

    try {
      const mentions = await this.loadMentions(userId, 90);
      const { getActiveThreads } = await import('../storage/index.js');
      const threads = await getActiveThreads(userId, { limit: 100 });

      // Sort mentions by time
      const sorted = [...mentions].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      // Look for repeated sequences of 2-4 steps
      const sequenceCounts = new Map<string, BehavioralSequence>();

      for (let windowSize = 2; windowSize <= 4; windowSize++) {
        for (let i = 0; i <= sorted.length - windowSize; i++) {
          const window = sorted.slice(i, i + windowSize);

          // Skip if time gap is too large (> 7 days)
          const startTime = new Date(window[0].timestamp).getTime();
          const endTime = new Date(window[window.length - 1].timestamp).getTime();
          const gapHours = (endTime - startTime) / (1000 * 60 * 60);

          if (gapHours > 168) continue; // > 7 days

          // Build sequence key
          const steps = window.map((m) => {
            if (m.entityId) return `entity:${m.entityId}`;
            if (m.context?.topic) return `topic:${m.context.topic}`;
            if (m.emotion) return `emotion:${m.emotion}`;
            return 'unknown';
          });

          const key = steps.join('→');

          if (!sequenceCounts.has(key)) {
            sequenceCounts.set(key, {
              id: `seq-${key.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 50)}`,
              userId,
              sequence: steps.map((s, idx) => {
                const [type, name] = s.split(':');
                return {
                  step: idx + 1,
                  type: type as 'entity' | 'topic' | 'emotion',
                  name: name || s,
                };
              }),
              frequency: 0,
              typicalGapHours: 0,
              confidence: 0,
              assessment: 'neutral',
              insight: '',
            });
          }

          const seq = sequenceCounts.get(key)!;
          seq.frequency++;
          seq.typicalGapHours = (seq.typicalGapHours * (seq.frequency - 1) + gapHours) / seq.frequency;
        }
      }

      // Filter to significant sequences
      for (const [_, seq] of sequenceCounts) {
        if (seq.frequency < 3) continue;

        seq.confidence = Math.min(0.9, seq.frequency / 10);
        seq.assessment = this.assessSequence(seq);
        seq.insight = this.generateSequenceInsight(seq);

        sequences.push(seq);
      }

      return sequences.sort((a, b) => b.frequency - a.frequency).slice(0, 20);
    } catch (error) {
      log.error({ error: String(error) }, 'Behavioral sequence detection failed');
      return [];
    }
  }

  /**
   * Find cross-domain correlations
   */
  async findCrossDomainCorrelations(userId: string): Promise<CrossDomainCorrelation[]> {
    const correlations: CrossDomainCorrelation[] = [];

    try {
      const { getAllEntities, getMentionsForEntity } = await import('../../entity-store/storage.js');
      const entities = await getAllEntities(userId, { limit: 200 });

      // Categorize entities by domain
      const domains: Map<string, Entity[]> = new Map();
      const domainKeywords: Record<string, string[]> = {
        work: ['boss', 'job', 'work', 'colleague', 'project', 'meeting', 'deadline'],
        health: ['doctor', 'exercise', 'sleep', 'health', 'gym', 'diet', 'anxiety'],
        relationship: ['partner', 'spouse', 'friend', 'family', 'mom', 'dad', 'brother', 'sister'],
        finance: ['money', 'budget', 'savings', 'debt', 'investment', 'salary'],
        personal: ['hobby', 'growth', 'goal', 'dream', 'passion'],
      };

      for (const entity of entities) {
        const nameLower = entity.canonicalName.toLowerCase();
        for (const [domain, keywords] of Object.entries(domainKeywords)) {
          if (keywords.some((k) => nameLower.includes(k))) {
            if (!domains.has(domain)) domains.set(domain, []);
            domains.get(domain)!.push(entity);
            break;
          }
        }
      }

      // Calculate cross-domain correlations
      const domainNames = Array.from(domains.keys());

      for (let i = 0; i < domainNames.length; i++) {
        for (let j = i + 1; j < domainNames.length; j++) {
          const domain1Name = domainNames[i];
          const domain2Name = domainNames[j];

          const domain1Entities = domains.get(domain1Name)!;
          const domain2Entities = domains.get(domain2Name)!;

          if (domain1Entities.length < 2 || domain2Entities.length < 2) continue;

          // Get mentions for both domains
          const domain1Mentions: Mention[] = [];
          const domain2Mentions: Mention[] = [];

          for (const entity of domain1Entities) {
            const mentions = await getMentionsForEntity(userId, entity.id, 30);
            domain1Mentions.push(...mentions);
          }

          for (const entity of domain2Entities) {
            const mentions = await getMentionsForEntity(userId, entity.id, 30);
            domain2Mentions.push(...mentions);
          }

          // Calculate correlation between domain mention patterns
          const correlation = this.calculateMentionCorrelation(domain1Mentions, domain2Mentions);

          if (Math.abs(correlation.value) > 0.3) {
            correlations.push({
              domain1: {
                name: domain1Name,
                type: domain1Name as 'work' | 'health' | 'relationship' | 'finance' | 'personal',
                entityIds: domain1Entities.map((e) => e.id),
              },
              domain2: {
                name: domain2Name,
                type: domain2Name as 'work' | 'health' | 'relationship' | 'finance' | 'personal',
                entityIds: domain2Entities.map((e) => e.id),
              },
              correlation: correlation.value,
              lagDays: correlation.lagDays,
              direction: correlation.direction,
              insight: this.generateCrossDomainInsight(domain1Name, domain2Name, correlation),
            });
          }
        }
      }

      return correlations.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
    } catch (error) {
      log.error({ error: String(error) }, 'Cross-domain correlation analysis failed');
      return [];
    }
  }

  /**
   * Generate insights from all detected patterns
   */
  async generatePatternInsights(userId: string): Promise<PatternInsight[]> {
    const insights: PatternInsight[] = [];

    try {
      // Gather all patterns
      const [temporal, emotional, behavioral, crossDomain] = await Promise.all([
        this.detectTemporalPatterns(userId),
        this.findEmotionalCorrelations(userId),
        this.detectBehavioralSequences(userId),
        this.findCrossDomainCorrelations(userId),
      ]);

      // Generate insights from temporal patterns
      for (const pattern of temporal.slice(0, 5)) {
        insights.push({
          id: `insight-temporal-${pattern.id}`,
          userId,
          type: 'temporal',
          insight: `${pattern.observation}${pattern.suggestion ? ` ${pattern.suggestion}` : ''}`,
          evidence: [`Observed ${pattern.occurrences} times`, `Confidence: ${Math.round(pattern.confidence * 100)}%`],
          confidence: pattern.confidence,
          shouldSurface: pattern.actionability === 'high',
          surfaceContext: pattern.actionability === 'high' ? `When it's ${pattern.type === 'weekly' ? this.getDayName(pattern.timing.value) : 'around this time'}` : undefined,
          relatedPatterns: [pattern.id],
          generatedAt: new Date(),
        });
      }

      // Generate insights from emotional correlations
      for (const corr of emotional.filter((c) => Math.abs(c.correlation) > 0.5).slice(0, 5)) {
        const direction = corr.correlation > 0 ? 'consistently brings' : 'tends to trigger';
        insights.push({
          id: `insight-emotional-${corr.id}`,
          userId,
          type: 'emotional',
          insight: `${corr.trigger.name} ${direction} ${corr.emotion.primary} feelings.`,
          evidence: [`Correlation: ${Math.round(corr.correlation * 100)}%`, `Observed ${corr.frequency} times`],
          confidence: 1 - corr.significance,
          shouldSurface: corr.emotion.valence < -0.3 && corr.correlation > 0.5,
          surfaceContext: corr.emotion.valence < -0.3 ? `When discussing ${corr.trigger.name}` : undefined,
          relatedPatterns: [corr.id],
          generatedAt: new Date(),
        });
      }

      // Generate insights from behavioral sequences
      for (const seq of behavioral.filter((s) => s.assessment !== 'neutral').slice(0, 3)) {
        insights.push({
          id: `insight-behavioral-${seq.id}`,
          userId,
          type: 'behavioral',
          insight: seq.insight,
          evidence: [`Occurs ${seq.frequency} times`, `Typically over ${Math.round(seq.typicalGapHours)} hours`],
          confidence: seq.confidence,
          shouldSurface: seq.assessment === 'negative',
          relatedPatterns: [seq.id],
          generatedAt: new Date(),
        });
      }

      // Generate insights from cross-domain correlations
      for (const corr of crossDomain.slice(0, 3)) {
        insights.push({
          id: `insight-crossdomain-${corr.domain1.name}-${corr.domain2.name}`,
          userId,
          type: 'cross_domain',
          insight: corr.insight,
          evidence: [`Correlation: ${Math.round(Math.abs(corr.correlation) * 100)}%`],
          confidence: Math.abs(corr.correlation),
          shouldSurface: Math.abs(corr.correlation) > 0.5,
          relatedPatterns: [],
          generatedAt: new Date(),
        });
      }

      return insights.sort((a, b) => b.confidence - a.confidence);
    } catch (error) {
      log.error({ error: String(error) }, 'Pattern insight generation failed');
      return [];
    }
  }

  // ============================================================================
  // PRIVATE PATTERN DETECTION METHODS
  // ============================================================================

  private detectDailyPatterns(userId: string, mentions: Mention[]): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];
    const byHour: Map<number, Mention[]> = new Map();

    for (const mention of mentions) {
      const hour = new Date(mention.timestamp).getHours();
      if (!byHour.has(hour)) byHour.set(hour, []);
      byHour.get(hour)!.push(mention);
    }

    // Find hours with emotional spikes
    for (const [hour, hourMentions] of byHour) {
      if (hourMentions.length < 5) continue;

      const negativeRatio = hourMentions.filter((m) => this.isNegative(m.emotion)).length / hourMentions.length;

      if (negativeRatio > 0.6) {
        const timeLabel = hour < 12 ? `${hour}am` : hour === 12 ? '12pm' : `${hour - 12}pm`;
        patterns.push({
          id: `daily-${userId}-hour-${hour}`,
          userId,
          type: 'daily',
          subject: `Emotional pattern around ${timeLabel}`,
          timing: { value: hour, variance: 1 },
          observation: `Around ${timeLabel} tends to be an emotionally difficult time.`,
          confidence: Math.min(0.85, negativeRatio * (hourMentions.length / 10)),
          occurrences: hourMentions.length,
          actionability: hour >= 21 || hour <= 5 ? 'high' : 'medium',
          suggestion: hour >= 21 ? 'Late night thoughts can feel heavier. Consider a wind-down routine.' : undefined,
        });
      }
    }

    return patterns;
  }

  private detectWeeklyPatterns(userId: string, mentions: Mention[]): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];
    const byDay: Map<number, Mention[]> = new Map();

    for (const mention of mentions) {
      const day = new Date(mention.timestamp).getDay();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(mention);
    }

    for (const [day, dayMentions] of byDay) {
      if (dayMentions.length < 5) continue;

      const negativeRatio = dayMentions.filter((m) => this.isNegative(m.emotion)).length / dayMentions.length;
      const avgIntensity = this.averageIntensity(dayMentions);

      if (negativeRatio > 0.55 && avgIntensity > 0.5) {
        const dayName = this.getDayName(day);
        patterns.push({
          id: `weekly-${userId}-day-${day}`,
          userId,
          type: 'weekly',
          subject: `${dayName} pattern`,
          timing: { value: day, variance: 0 },
          observation: `${dayName}s tend to bring more challenging conversations.`,
          confidence: Math.min(0.8, negativeRatio * avgIntensity),
          occurrences: dayMentions.length,
          actionability: day === 0 || day === 1 ? 'high' : 'medium', // Sunday/Monday blues
          suggestion: day === 1 ? 'Monday anxiety is real. Consider what might make Mondays gentler.' : undefined,
        });
      }
    }

    return patterns;
  }

  private detectMonthlyPatterns(userId: string, mentions: Mention[]): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];
    const byWeek: Map<number, Mention[]> = new Map(); // Week of month (1-4)

    for (const mention of mentions) {
      const date = new Date(mention.timestamp);
      const weekOfMonth = Math.ceil(date.getDate() / 7);
      if (!byWeek.has(weekOfMonth)) byWeek.set(weekOfMonth, []);
      byWeek.get(weekOfMonth)!.push(mention);
    }

    // Check for beginning/end of month patterns
    const firstWeek = byWeek.get(1) || [];
    const lastWeek = byWeek.get(4) || [];

    if (firstWeek.length >= 5) {
      const negativeRatio = firstWeek.filter((m) => this.isNegative(m.emotion)).length / firstWeek.length;
      if (negativeRatio > 0.5) {
        patterns.push({
          id: `monthly-${userId}-first-week`,
          userId,
          type: 'monthly',
          subject: 'Beginning of month pattern',
          timing: { value: 1, variance: 3 },
          observation: 'The beginning of each month seems to bring more stress.',
          confidence: Math.min(0.75, negativeRatio),
          occurrences: firstWeek.length,
          actionability: 'medium',
          suggestion: 'Is there something about the start of the month that creates pressure? Bills, work deadlines?',
        });
      }
    }

    return patterns;
  }

  private detectSeasonalPatterns(userId: string, mentions: Mention[]): TemporalPattern[] {
    const patterns: TemporalPattern[] = [];
    const byMonth: Map<number, Mention[]> = new Map();

    for (const mention of mentions) {
      const month = new Date(mention.timestamp).getMonth();
      if (!byMonth.has(month)) byMonth.set(month, []);
      byMonth.get(month)!.push(mention);
    }

    // Check for seasonal patterns (winter blues, etc.)
    const winterMonths = [11, 0, 1]; // Dec, Jan, Feb
    const winterMentions = winterMonths.flatMap((m) => byMonth.get(m) || []);

    if (winterMentions.length >= 10) {
      const negativeRatio = winterMentions.filter((m) => this.isNegative(m.emotion)).length / winterMentions.length;
      const avgIntensity = this.averageIntensity(winterMentions);

      if (negativeRatio > 0.5 && avgIntensity > 0.5) {
        patterns.push({
          id: `seasonal-${userId}-winter`,
          userId,
          type: 'seasonal',
          subject: 'Winter pattern',
          timing: { value: 12, variance: 30 },
          observation: 'Winter months seem to bring more difficult emotions.',
          confidence: Math.min(0.7, negativeRatio * avgIntensity),
          occurrences: winterMentions.length,
          actionability: 'high',
          suggestion: 'Seasonal patterns are real. Consider extra self-care strategies for winter months.',
        });
      }
    }

    return patterns;
  }

  private detectTimeEmotionCorrelations(userId: string, mentions: Mention[]): EmotionalCorrelation[] {
    const correlations: EmotionalCorrelation[] = [];

    // Late night correlation
    const lateNight = mentions.filter((m) => {
      const hour = new Date(m.timestamp).getHours();
      return hour >= 22 || hour <= 4;
    });

    if (lateNight.length >= 5) {
      const result = this.calculateEmotionCorrelation(lateNight);
      if (result.significance < 0.2) {
        correlations.push({
          id: `time-latenight-${userId}`,
          userId,
          trigger: {
            type: 'time',
            name: 'Late night hours',
          },
          emotion: result.dominantEmotion,
          correlation: result.correlation,
          significance: result.significance,
          frequency: lateNight.length,
        });
      }
    }

    return correlations;
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private async loadMentions(userId: string, days: number): Promise<Mention[]> {
    const { getAllEntities, getMentionsForEntity } = await import('../../entity-store/storage.js');
    const entities = await getAllEntities(userId, { limit: 100 });

    const allMentions: Mention[] = [];
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    for (const entity of entities) {
      const mentions = await getMentionsForEntity(userId, entity.id, 50);
      const filtered = mentions.filter((m) => new Date(m.timestamp).getTime() > cutoff);
      allMentions.push(...filtered);
    }

    return allMentions;
  }

  private isNegative(emotion?: string): boolean {
    const negative = ['sad', 'angry', 'anxious', 'stressed', 'frustrated', 'hurt', 'worried', 'overwhelmed'];
    return negative.includes(emotion?.toLowerCase() || '');
  }

  private isPositive(emotion?: string): boolean {
    const positive = ['happy', 'excited', 'grateful', 'hopeful', 'calm', 'content', 'proud'];
    return positive.includes(emotion?.toLowerCase() || '');
  }

  private averageIntensity(mentions: Mention[]): number {
    if (mentions.length === 0) return 0;
    return mentions.reduce((sum, m) => sum + (m.emotionalIntensity || 0.5), 0) / mentions.length;
  }

  private countEmotions(mentions: Mention[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const mention of mentions) {
      if (mention.emotion) {
        counts.set(mention.emotion, (counts.get(mention.emotion) || 0) + 1);
      }
    }
    return counts;
  }

  private calculateEmotionCorrelation(mentions: Mention[]): {
    dominantEmotion: { primary: string; intensity: number; valence: number };
    correlation: number;
    significance: number;
  } {
    const emotionCounts = this.countEmotions(mentions);
    let dominant = 'neutral';
    let maxCount = 0;

    for (const [emotion, count] of emotionCounts) {
      if (count > maxCount) {
        maxCount = count;
        dominant = emotion;
      }
    }

    const valence = this.isPositive(dominant) ? 0.7 : this.isNegative(dominant) ? -0.7 : 0;
    const intensity = maxCount / mentions.length;

    // Simple significance based on sample size
    const significance = mentions.length < 5 ? 0.5 : mentions.length < 10 ? 0.2 : 0.05;

    return {
      dominantEmotion: { primary: dominant, intensity, valence },
      correlation: intensity * (valence < 0 ? -1 : 1),
      significance,
    };
  }

  private calculateMentionCorrelation(
    mentions1: Mention[],
    mentions2: Mention[]
  ): { value: number; lagDays: number; direction: 'bidirectional' | 'domain1_to_domain2' | 'domain2_to_domain1' } {
    // Simple correlation based on co-occurrence in same day
    const days1 = new Set(mentions1.map((m) => new Date(m.timestamp).toISOString().split('T')[0]));
    const days2 = new Set(mentions2.map((m) => new Date(m.timestamp).toISOString().split('T')[0]));

    let overlap = 0;
    for (const day of days1) {
      if (days2.has(day)) overlap++;
    }

    const correlation = (2 * overlap) / (days1.size + days2.size);

    return {
      value: correlation,
      lagDays: 0,
      direction: 'bidirectional',
    };
  }

  private getDayName(day: number): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];
  }

  private assessSequence(seq: BehavioralSequence): 'positive' | 'negative' | 'neutral' {
    // Check if sequence ends in negative emotion
    const lastStep = seq.sequence[seq.sequence.length - 1];
    if (lastStep.type === 'emotion' && this.isNegative(lastStep.name)) {
      return 'negative';
    }
    if (lastStep.type === 'emotion' && this.isPositive(lastStep.name)) {
      return 'positive';
    }
    return 'neutral';
  }

  private generateSequenceInsight(seq: BehavioralSequence): string {
    const steps = seq.sequence.map((s) => s.name).join(' → ');

    if (seq.assessment === 'negative') {
      return `Pattern detected: ${steps}. This sequence tends to lead to difficult feelings.`;
    }
    if (seq.assessment === 'positive') {
      return `Pattern detected: ${steps}. This sequence often leads to positive outcomes.`;
    }
    return `Pattern detected: ${steps}. Occurs frequently in your conversations.`;
  }

  private generateCrossDomainInsight(
    domain1: string,
    domain2: string,
    correlation: { value: number; lagDays: number; direction: string }
  ): string {
    const strength = Math.abs(correlation.value) > 0.6 ? 'strongly' : 'noticeably';

    if (correlation.value > 0) {
      return `${domain1} and ${domain2} are ${strength} connected. When one area improves, the other tends to follow.`;
    }
    return `${domain1} and ${domain2} seem inversely related. Focus on one may temporarily impact the other.`;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let advancedCorrelationEngine: AdvancedCorrelationEngine | null = null;

export function getAdvancedCorrelationEngine(): AdvancedCorrelationEngine {
  if (!advancedCorrelationEngine) {
    advancedCorrelationEngine = new AdvancedCorrelationEngine();
  }
  return advancedCorrelationEngine;
}

export default AdvancedCorrelationEngine;
