/**
 * Life Chapter Detection - Auto-Segment Life Into Meaningful Chapters
 *
 * Humans think of their lives in chapters: "When I was in college",
 * "During my first job", "After the divorce". This service automatically
 * detects these chapters from conversation patterns.
 *
 * Chapters are detected by:
 * - Major life events (job change, move, relationship change)
 * - Significant emotional shifts
 * - Topic cluster changes
 * - Temporal gaps
 *
 * @module memory/knowledge-graph/superhuman/life-chapters
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { Entity, Thread, Insight } from '../types.js';

const log = createLogger({ module: 'LifeChapterDetector' });

// ============================================================================
// TYPES
// ============================================================================

export interface LifeChapter {
  id: string;
  userId: string;
  /** Title for this chapter */
  title: string;
  /** When this chapter started */
  startDate: Date;
  /** When this chapter ended (null if current) */
  endDate: Date | null;
  /** Primary themes of this chapter */
  themes: string[];
  /** Key entities in this chapter */
  keyEntities: Array<{ id: string; name: string; role: string }>;
  /** Key events that defined this chapter */
  keyEvents: Array<{ description: string; date: Date; significance: string }>;
  /** Overall emotional tone */
  emotionalTone: 'growth' | 'struggle' | 'stability' | 'transition' | 'joy' | 'loss';
  /** Confidence score */
  confidence: number;
  /** What triggered this chapter detection */
  detectedBy: ChapterTrigger;
}

export interface ChapterTransition {
  fromChapter: string;
  toChapter: string;
  transitionDate: Date;
  triggerEvent?: string;
  emotionalShift: string;
  /** User's state at the transition */
  userState: {
    dominantEmotion: string;
    activeGoals: string[];
    keyRelationships: string[];
  };
}

export type ChapterTrigger =
  | 'life_event' // Major life event detected
  | 'emotional_shift' // Significant emotional change
  | 'topic_change' // Major shift in conversation topics
  | 'relationship_change' // Key relationship added/removed
  | 'temporal_gap' // Long gap in conversation
  | 'explicit' // User explicitly mentioned a chapter
  | 'system_analysis'; // Deep analysis detected

// ============================================================================
// LIFE EVENTS THAT START CHAPTERS
// ============================================================================

const CHAPTER_TRIGGERING_EVENTS = [
  // Career
  'new job', 'promotion', 'fired', 'laid off', 'quit', 'retired', 'started business',
  'career change', 'graduated',

  // Relationships
  'married', 'engaged', 'divorced', 'breakup', 'started dating', 'had a baby',
  'had a child', 'became a parent',

  // Living
  'moved', 'bought house', 'new apartment', 'relocated', 'immigration',

  // Health
  'diagnosis', 'surgery', 'recovery', 'illness', 'treatment',

  // Loss
  'death', 'passed away', 'lost', 'funeral', 'grief',

  // Personal
  'turning point', 'epiphany', 'breakthrough', 'hitting bottom', 'new beginning',
];

// ============================================================================
// LIFE CHAPTER DETECTOR
// ============================================================================

export class LifeChapterDetector {
  /**
   * Detect all life chapters for a user
   */
  async detectChapters(userId: string): Promise<LifeChapter[]> {
    try {
      const chapters: LifeChapter[] = [];

      // 1. Load threads and mentions
      const { getActiveThreads } = await import('../storage/index.js');
      const { getAllEntities, getMentionsForEntity } = await import(
        '../../entity-store/storage.js'
      );

      const threads = await getActiveThreads(userId, {
        includeOpen: true,
        includeRecurring: true,
        limit: 100,
      });

      const entities = await getAllEntities(userId, { limit: 200 });

      // 2. Collect all mentions with dates
      const allMentions: Array<{
        date: Date;
        transcript: string;
        emotion?: string;
        topics: string[];
        entityIds: string[];
      }> = [];

      for (const entity of entities.slice(0, 50)) {
        const mentions = await getMentionsForEntity(userId, entity.id, 20);
        for (const mention of mentions) {
          allMentions.push({
            date: new Date(mention.timestamp),
            transcript: mention.transcript || '',
            emotion: mention.emotion,
            topics: mention.topics || [],
            entityIds: [entity.id],
          });
        }
      }

      // Sort by date
      allMentions.sort((a, b) => a.date.getTime() - b.date.getTime());

      if (allMentions.length < 10) {
        // Not enough data for chapter detection
        return [{
          id: `chapter-${userId}-current`,
          userId,
          title: 'Your Story So Far',
          startDate: allMentions[0]?.date || new Date(),
          endDate: null,
          themes: this.extractTopThemes(allMentions),
          keyEntities: this.extractKeyEntities(entities),
          keyEvents: [],
          emotionalTone: 'growth',
          confidence: 0.5,
          detectedBy: 'system_analysis',
        }];
      }

      // 3. Detect chapter boundaries
      const boundaries = await this.detectChapterBoundaries(allMentions, entities);

      // 4. Create chapters from boundaries
      for (let i = 0; i < boundaries.length; i++) {
        const start = boundaries[i];
        const end = boundaries[i + 1];

        const chapterMentions = allMentions.filter(
          (m) =>
            m.date.getTime() >= start.date.getTime() &&
            (!end || m.date.getTime() < end.date.getTime())
        );

        if (chapterMentions.length < 3) continue;

        const chapter = this.buildChapter(
          userId,
          `chapter-${userId}-${i}`,
          start,
          end,
          chapterMentions,
          entities
        );

        chapters.push(chapter);
      }

      return chapters;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Chapter detection failed');
      return [];
    }
  }

  /**
   * Get the current life chapter
   */
  async getCurrentChapter(userId: string): Promise<LifeChapter | null> {
    const chapters = await this.detectChapters(userId);
    return chapters.find((c) => c.endDate === null) || chapters[chapters.length - 1] || null;
  }

  /**
   * Generate chapter transitions
   */
  async getChapterTransitions(userId: string): Promise<ChapterTransition[]> {
    const chapters = await this.detectChapters(userId);
    const transitions: ChapterTransition[] = [];

    for (let i = 0; i < chapters.length - 1; i++) {
      const from = chapters[i];
      const to = chapters[i + 1];

      transitions.push({
        fromChapter: from.title,
        toChapter: to.title,
        transitionDate: to.startDate,
        triggerEvent: to.keyEvents[0]?.description,
        emotionalShift: `${from.emotionalTone} → ${to.emotionalTone}`,
        userState: {
          dominantEmotion: to.emotionalTone,
          activeGoals: to.themes.slice(0, 3),
          keyRelationships: to.keyEntities.map((e) => e.name).slice(0, 5),
        },
      });
    }

    return transitions;
  }

  /**
   * Generate a life narrative summary
   */
  async generateLifeNarrative(userId: string): Promise<string> {
    const chapters = await this.detectChapters(userId);

    if (chapters.length === 0) {
      return "We're just getting to know each other. Your story is still being written.";
    }

    const parts: string[] = [];

    parts.push(`I've been with you through ${chapters.length} chapter${chapters.length > 1 ? 's' : ''} of your life.`);

    for (const chapter of chapters) {
      const duration = chapter.endDate
        ? Math.round(
            (chapter.endDate.getTime() - chapter.startDate.getTime()) /
              (1000 * 60 * 60 * 24 * 30)
          )
        : null;

      const durationStr = duration
        ? `spanning ${duration} months`
        : 'which is still unfolding';

      const themeStr = chapter.themes.slice(0, 2).join(' and ');
      const entityStr =
        chapter.keyEntities.length > 0
          ? `, with ${chapter.keyEntities[0].name} playing a key role`
          : '';

      parts.push(
        `"${chapter.title}" (${durationStr}) - a time of ${chapter.emotionalTone}, focused on ${themeStr}${entityStr}.`
      );
    }

    const current = chapters.find((c) => !c.endDate);
    if (current) {
      parts.push(
        `\nRight now, you're in "${current.title}". The themes I see: ${current.themes.join(', ')}.`
      );
    }

    return parts.join('\n\n');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async detectChapterBoundaries(
    mentions: Array<{
      date: Date;
      transcript: string;
      emotion?: string;
      topics: string[];
    }>,
    entities: Entity[]
  ): Promise<Array<{ date: Date; trigger: ChapterTrigger; description: string }>> {
    const boundaries: Array<{ date: Date; trigger: ChapterTrigger; description: string }> = [];

    // Always add the first mention as a boundary
    if (mentions.length > 0) {
      boundaries.push({
        date: mentions[0].date,
        trigger: 'system_analysis',
        description: 'Beginning of recorded history',
      });
    }

    // Look for life events in transcripts
    for (const mention of mentions) {
      const lowerTranscript = mention.transcript.toLowerCase();

      for (const event of CHAPTER_TRIGGERING_EVENTS) {
        if (lowerTranscript.includes(event)) {
          // Check if this is significantly different from existing boundaries
          const existingNearby = boundaries.find(
            (b) =>
              Math.abs(b.date.getTime() - mention.date.getTime()) <
              30 * 24 * 60 * 60 * 1000 // 30 days
          );

          if (!existingNearby) {
            boundaries.push({
              date: mention.date,
              trigger: 'life_event',
              description: event,
            });
          }
          break;
        }
      }
    }

    // Look for emotional shifts
    const emotionWindows = this.createEmotionalWindows(mentions, 10);
    for (let i = 1; i < emotionWindows.length; i++) {
      const prev = emotionWindows[i - 1];
      const curr = emotionWindows[i];

      if (Math.abs(curr.avgValence - prev.avgValence) > 0.4) {
        const existingNearby = boundaries.find(
          (b) =>
            Math.abs(b.date.getTime() - curr.startDate.getTime()) <
            30 * 24 * 60 * 60 * 1000
        );

        if (!existingNearby) {
          boundaries.push({
            date: curr.startDate,
            trigger: 'emotional_shift',
            description: `Emotional shift: ${prev.avgValence > 0 ? 'positive' : 'negative'} → ${curr.avgValence > 0 ? 'positive' : 'negative'}`,
          });
        }
      }
    }

    // Look for topic cluster changes
    const topicWindows = this.createTopicWindows(mentions, 15);
    for (let i = 1; i < topicWindows.length; i++) {
      const prev = topicWindows[i - 1];
      const curr = topicWindows[i];

      const overlap = this.calculateTopicOverlap(prev.topTopics, curr.topTopics);
      if (overlap < 0.3) {
        // Topics changed significantly
        const existingNearby = boundaries.find(
          (b) =>
            Math.abs(b.date.getTime() - curr.startDate.getTime()) <
            30 * 24 * 60 * 60 * 1000
        );

        if (!existingNearby) {
          boundaries.push({
            date: curr.startDate,
            trigger: 'topic_change',
            description: `Focus shifted from ${prev.topTopics.slice(0, 2).join(', ')} to ${curr.topTopics.slice(0, 2).join(', ')}`,
          });
        }
      }
    }

    // Look for temporal gaps (> 60 days without contact)
    for (let i = 1; i < mentions.length; i++) {
      const gap = mentions[i].date.getTime() - mentions[i - 1].date.getTime();
      const sixtyDays = 60 * 24 * 60 * 60 * 1000;

      if (gap > sixtyDays) {
        boundaries.push({
          date: mentions[i].date,
          trigger: 'temporal_gap',
          description: 'Return after extended absence',
        });
      }
    }

    // Sort by date
    return boundaries.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  private createEmotionalWindows(
    mentions: Array<{ date: Date; emotion?: string }>,
    windowSize: number
  ): Array<{ startDate: Date; avgValence: number }> {
    const windows: Array<{ startDate: Date; avgValence: number }> = [];

    const valenceMap: Record<string, number> = {
      happy: 0.8, joy: 0.9, excited: 0.7, grateful: 0.8, hopeful: 0.6,
      sad: -0.7, angry: -0.6, anxious: -0.5, stressed: -0.4, frustrated: -0.5,
      neutral: 0,
    };

    for (let i = 0; i < mentions.length; i += windowSize) {
      const window = mentions.slice(i, i + windowSize);
      const valences = window
        .filter((m) => m.emotion)
        .map((m) => valenceMap[m.emotion!] ?? 0);

      if (valences.length > 0) {
        windows.push({
          startDate: window[0].date,
          avgValence: valences.reduce((a, b) => a + b, 0) / valences.length,
        });
      }
    }

    return windows;
  }

  private createTopicWindows(
    mentions: Array<{ date: Date; topics: string[] }>,
    windowSize: number
  ): Array<{ startDate: Date; topTopics: string[] }> {
    const windows: Array<{ startDate: Date; topTopics: string[] }> = [];

    for (let i = 0; i < mentions.length; i += windowSize) {
      const window = mentions.slice(i, i + windowSize);
      const topicCounts: Record<string, number> = {};

      for (const mention of window) {
        for (const topic of mention.topics) {
          topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        }
      }

      const topTopics = Object.entries(topicCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic]) => topic);

      if (topTopics.length > 0) {
        windows.push({
          startDate: window[0].date,
          topTopics,
        });
      }
    }

    return windows;
  }

  private calculateTopicOverlap(topics1: string[], topics2: string[]): number {
    const set1 = new Set(topics1);
    const set2 = new Set(topics2);
    const intersection = [...set1].filter((t) => set2.has(t));
    const union = new Set([...set1, ...set2]);
    return intersection.length / union.size;
  }

  private buildChapter(
    userId: string,
    id: string,
    start: { date: Date; trigger: ChapterTrigger; description: string },
    end: { date: Date; trigger: ChapterTrigger; description: string } | undefined,
    mentions: Array<{
      date: Date;
      transcript: string;
      emotion?: string;
      topics: string[];
      entityIds: string[];
    }>,
    entities: Entity[]
  ): LifeChapter {
    // Determine themes
    const themes = this.extractTopThemes(mentions);

    // Determine emotional tone
    const emotionalTone = this.determineEmotionalTone(mentions);

    // Get key entities
    const keyEntities = this.extractChapterEntities(mentions, entities);

    // Generate title
    const title = this.generateChapterTitle(themes, emotionalTone, start.description);

    // Extract key events
    const keyEvents = this.extractKeyEvents(mentions);

    return {
      id,
      userId,
      title,
      startDate: start.date,
      endDate: end?.date || null,
      themes,
      keyEntities,
      keyEvents,
      emotionalTone,
      confidence: Math.min(0.9, mentions.length / 20), // More data = more confidence
      detectedBy: start.trigger,
    };
  }

  private extractTopThemes(
    mentions: Array<{ topics: string[] }>
  ): string[] {
    const topicCounts: Record<string, number> = {};

    for (const mention of mentions) {
      for (const topic of mention.topics) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    return Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([topic]) => topic);
  }

  private determineEmotionalTone(
    mentions: Array<{ emotion?: string }>
  ): LifeChapter['emotionalTone'] {
    const emotionCounts: Record<string, number> = {};

    for (const mention of mentions) {
      if (mention.emotion) {
        emotionCounts[mention.emotion] = (emotionCounts[mention.emotion] || 0) + 1;
      }
    }

    const topEmotion = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0];

    const positiveEmotions = ['happy', 'joy', 'excited', 'grateful', 'hopeful', 'proud'];
    const negativeEmotions = ['sad', 'angry', 'anxious', 'stressed', 'frustrated', 'worried'];
    const transitionEmotions = ['uncertain', 'confused', 'overwhelmed'];

    if (positiveEmotions.includes(topEmotion)) return 'joy';
    if (negativeEmotions.includes(topEmotion)) return 'struggle';
    if (transitionEmotions.includes(topEmotion)) return 'transition';
    if (emotionCounts['hopeful'] || emotionCounts['determined']) return 'growth';
    if (emotionCounts['grief'] || emotionCounts['sad']) return 'loss';

    return 'stability';
  }

  private extractChapterEntities(
    mentions: Array<{ entityIds: string[] }>,
    entities: Entity[]
  ): LifeChapter['keyEntities'] {
    const entityCounts: Record<string, number> = {};

    for (const mention of mentions) {
      for (const entityId of mention.entityIds) {
        entityCounts[entityId] = (entityCounts[entityId] || 0) + 1;
      }
    }

    return Object.entries(entityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([entityId]) => {
        const entity = entities.find((e) => e.id === entityId);
        return {
          id: entityId,
          name: entity?.canonicalName || 'Unknown',
          role: entity?.specificRelation || 'person',
        };
      });
  }

  private extractKeyEvents(
    mentions: Array<{ date: Date; transcript: string }>
  ): LifeChapter['keyEvents'] {
    const events: LifeChapter['keyEvents'] = [];

    for (const mention of mentions) {
      const lowerTranscript = mention.transcript.toLowerCase();

      for (const event of CHAPTER_TRIGGERING_EVENTS) {
        if (lowerTranscript.includes(event)) {
          events.push({
            description: event,
            date: mention.date,
            significance: 'life_event',
          });
          break;
        }
      }
    }

    return events.slice(0, 5);
  }

  private generateChapterTitle(
    themes: string[],
    emotionalTone: LifeChapter['emotionalTone'],
    triggerDescription: string
  ): string {
    const topTheme = themes[0] || 'journey';

    const toneWords: Record<LifeChapter['emotionalTone'], string> = {
      growth: 'Growing',
      struggle: 'Navigating',
      stability: 'Steady',
      transition: 'Changing',
      joy: 'Celebrating',
      loss: 'Processing',
    };

    if (triggerDescription.includes('new job') || triggerDescription.includes('career')) {
      return `Career ${toneWords[emotionalTone]}`;
    }
    if (triggerDescription.includes('married') || triggerDescription.includes('dating')) {
      return `New Love Chapter`;
    }
    if (triggerDescription.includes('moved') || triggerDescription.includes('house')) {
      return `New Beginnings`;
    }
    if (triggerDescription.includes('baby') || triggerDescription.includes('child')) {
      return `Becoming a Parent`;
    }

    return `${toneWords[emotionalTone]} Through ${topTheme.charAt(0).toUpperCase() + topTheme.slice(1)}`;
  }

  private extractKeyEntities(entities: Entity[]): LifeChapter['keyEntities'] {
    return entities
      .sort((a, b) => (b.mentionCount || 0) - (a.mentionCount || 0))
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        name: e.canonicalName,
        role: e.specificRelation || 'person',
      }));
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let lifeChapterDetector: LifeChapterDetector | null = null;

export function getLifeChapterDetector(): LifeChapterDetector {
  if (!lifeChapterDetector) {
    lifeChapterDetector = new LifeChapterDetector();
  }
  return lifeChapterDetector;
}

export default LifeChapterDetector;
