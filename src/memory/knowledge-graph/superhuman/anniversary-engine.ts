/**
 * Anniversary Engine - Never Forget Important Dates
 *
 * A superhuman friend never forgets:
 * - Birthdays
 * - Anniversaries
 * - Death anniversaries (grief support)
 * - First dates of things ("1 year since you started therapy")
 * - Commitment due dates
 * - Goal milestones
 *
 * The engine proactively surfaces these at the right time
 * with appropriate emotional framing.
 *
 * @module memory/knowledge-graph/superhuman/anniversary-engine
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import type { Entity, Insight } from '../types.js';

const log = createLogger({ module: 'AnniversaryEngine' });

// ============================================================================
// TYPES
// ============================================================================

export interface Anniversary {
  id: string;
  userId: string;
  /** What this anniversary is for */
  type: AnniversaryType;
  /** Title/description */
  title: string;
  /** The date (month/day, or full date) */
  date: Date;
  /** Is this recurring? */
  recurring: boolean;
  /** Related entity (if person-related) */
  entityId?: string;
  entityName?: string;
  /** Emotional tone to use */
  emotionalTone: 'celebration' | 'remembrance' | 'reflection' | 'milestone' | 'gratitude';
  /** Days before to start surfacing (e.g., 7 = surface 7 days before) */
  preSurfaceDays: number;
  /** How important (affects surfacing priority) */
  importance: number;
  /** When we learned about this */
  learnedAt: Date;
  /** Last time we surfaced this */
  lastSurfacedAt?: Date;
  /** User feedback on surfacing */
  feedback?: 'appreciated' | 'not_helpful' | 'too_early' | 'too_late';
}

export interface Milestone {
  id: string;
  userId: string;
  /** What milestone this is */
  type: MilestoneType;
  /** Description */
  description: string;
  /** When it occurred/will occur */
  date: Date;
  /** Related entity or goal */
  relatedId?: string;
  relatedName?: string;
  /** Duration achieved (for streak milestones) */
  duration?: string;
  /** Suggested celebration */
  celebrationSuggestion?: string;
}

export type AnniversaryType =
  | 'birthday'
  | 'wedding_anniversary'
  | 'death_anniversary'
  | 'relationship_start'
  | 'job_start'
  | 'sobriety'
  | 'therapy_start'
  | 'move_anniversary'
  | 'custom';

export type MilestoneType =
  | 'streak' // X days of habit
  | 'goal_progress' // 50% of goal, etc.
  | 'conversation_count' // 100 conversations
  | 'relationship_duration' // 1 year knowing someone
  | 'growth_marker' // Personal growth achievement
  | 'commitment_kept'; // Promise fulfilled

// ============================================================================
// ANNIVERSARY ENGINE
// ============================================================================

export class AnniversaryEngine {
  /**
   * Get upcoming anniversaries for a user
   */
  async getUpcomingAnniversaries(userId: string, daysAhead: number = 30): Promise<Anniversary[]> {
    try {
      const anniversaries = await this.loadAnniversaries(userId);
      const now = new Date();
      const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      return anniversaries
        .filter((a) => {
          const nextOccurrence = this.getNextOccurrence(a.date, a.recurring);
          return nextOccurrence >= now && nextOccurrence <= cutoff;
        })
        .sort((a, b) => {
          const dateA = this.getNextOccurrence(a.date, a.recurring);
          const dateB = this.getNextOccurrence(b.date, b.recurring);
          return dateA.getTime() - dateB.getTime();
        });
    } catch (error) {
      log.error({ error: String(error), userId }, 'Failed to get upcoming anniversaries');
      return [];
    }
  }

  /**
   * Get anniversaries that should be surfaced today
   */
  async getAnniversariesToSurface(userId: string): Promise<Anniversary[]> {
    const anniversaries = await this.loadAnniversaries(userId);
    const now = new Date();
    const toSurface: Anniversary[] = [];

    for (const anniversary of anniversaries) {
      const nextOccurrence = this.getNextOccurrence(anniversary.date, anniversary.recurring);
      const daysUntil = Math.ceil(
        (nextOccurrence.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
      );

      // Should surface if within pre-surface window
      if (daysUntil >= 0 && daysUntil <= anniversary.preSurfaceDays) {
        // Check cooldown (don't surface same anniversary too often)
        if (anniversary.lastSurfacedAt) {
          const daysSinceSurfaced = Math.floor(
            (now.getTime() - new Date(anniversary.lastSurfacedAt).getTime()) / (24 * 60 * 60 * 1000)
          );
          // Don't surface more than once per week
          if (daysSinceSurfaced < 7) continue;
        }

        toSurface.push(anniversary);
      }
    }

    // Sort by importance * proximity
    return toSurface.sort((a, b) => {
      const daysA = Math.ceil(
        (this.getNextOccurrence(a.date, a.recurring).getTime() - now.getTime()) /
          (24 * 60 * 60 * 1000)
      );
      const daysB = Math.ceil(
        (this.getNextOccurrence(b.date, b.recurring).getTime() - now.getTime()) /
          (24 * 60 * 60 * 1000)
      );

      // Priority = importance / (days until + 1)
      const priorityA = a.importance / (daysA + 1);
      const priorityB = b.importance / (daysB + 1);

      return priorityB - priorityA;
    });
  }

  /**
   * Extract anniversaries from conversation data
   */
  async detectAnniversaries(userId: string): Promise<Anniversary[]> {
    const detected: Anniversary[] = [];

    try {
      const { getAllEntities, getMentionsForEntity } =
        await import('../../entity-store/storage.js');

      const entities = await getAllEntities(userId, { limit: 100 });

      for (const entity of entities) {
        // Check for birthday
        if (entity.contact?.birthday) {
          detected.push(this.createBirthdayAnniversary(userId, entity));
        }

        // Check mentions for anniversary keywords
        const mentions = await getMentionsForEntity(userId, entity.id, 20);
        for (const mention of mentions) {
          const anniversaries = this.extractAnniversariesFromText(
            userId,
            mention.transcript || '',
            entity
          );
          detected.push(...anniversaries);
        }
      }

      // Deduplicate
      return this.deduplicateAnniversaries(detected);
    } catch (error) {
      log.error({ error: String(error), userId }, 'Anniversary detection failed');
      return [];
    }
  }

  /**
   * Calculate upcoming milestones
   */
  async calculateMilestones(userId: string): Promise<Milestone[]> {
    const milestones: Milestone[] = [];

    try {
      // Conversation count milestones
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      const userDoc = await db.collection('bogle_users').doc(userId).get();
      const totalConversations = userDoc.data()?.totalConversations || 0;

      const conversationMilestones = [10, 25, 50, 100, 250, 500, 1000];
      for (const milestone of conversationMilestones) {
        if (totalConversations >= milestone - 5 && totalConversations < milestone) {
          milestones.push({
            id: `conv-${milestone}`,
            userId,
            type: 'conversation_count',
            description: `${milestone} conversations together`,
            date: new Date(), // Estimated
            celebrationSuggestion: this.getSuggestionForConversationMilestone(milestone),
          });
        }
      }

      // Entity relationship duration milestones
      const { getAllEntities } = await import('../../entity-store/storage.js');
      const entities = await getAllEntities(userId, { limit: 50 });

      const now = new Date();
      for (const entity of entities) {
        if (!entity.firstMentionedAt) continue;

        const daysSinceFirst = Math.floor(
          (now.getTime() - new Date(entity.firstMentionedAt).getTime()) / (24 * 60 * 60 * 1000)
        );

        // Check for relationship duration milestones
        const durationMilestones = [
          { days: 30, label: '1 month' },
          { days: 90, label: '3 months' },
          { days: 180, label: '6 months' },
          { days: 365, label: '1 year' },
          { days: 730, label: '2 years' },
        ];

        for (const milestone of durationMilestones) {
          // Within 3 days of milestone
          if (Math.abs(daysSinceFirst - milestone.days) <= 3) {
            milestones.push({
              id: `rel-${entity.id}-${milestone.days}`,
              userId,
              type: 'relationship_duration',
              description: `${milestone.label} of knowing ${entity.canonicalName}`,
              date: new Date(
                new Date(entity.firstMentionedAt).getTime() + milestone.days * 24 * 60 * 60 * 1000
              ),
              relatedId: entity.id,
              relatedName: entity.canonicalName,
              duration: milestone.label,
              celebrationSuggestion: `Remember when you first mentioned ${entity.canonicalName}? It's been ${milestone.label}!`,
            });
          }
        }
      }

      return milestones;
    } catch (error) {
      log.error({ error: String(error), userId }, 'Milestone calculation failed');
      return [];
    }
  }

  /**
   * Generate surfacing phrase for an anniversary
   */
  generateSurfacingPhrase(anniversary: Anniversary, daysUntil: number): string {
    const timePhrase =
      daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

    switch (anniversary.type) {
      case 'birthday':
        if (daysUntil === 0) {
          return `It's ${anniversary.entityName || anniversary.title}'s birthday today! 🎂`;
        }
        return `${anniversary.entityName || anniversary.title}'s birthday is coming up ${timePhrase}. Would you like to plan something?`;

      case 'death_anniversary':
        if (daysUntil === 0) {
          return `I know today marks the anniversary of ${anniversary.entityName}'s passing. I'm here if you want to talk.`;
        }
        return `${anniversary.entityName}'s anniversary is ${timePhrase}. How are you feeling about that?`;

      case 'wedding_anniversary':
        if (daysUntil === 0) {
          return `Happy anniversary! How are you celebrating?`;
        }
        return `Your anniversary is coming up ${timePhrase}. Any plans?`;

      case 'sobriety':
        if (daysUntil === 0) {
          return `Congratulations on your sobriety anniversary! That's such an achievement. 💪`;
        }
        return `Your sobriety anniversary is ${timePhrase}. That's something to be proud of.`;

      case 'therapy_start':
        return `It's been a year since you started therapy. How do you feel you've grown?`;

      default:
        if (daysUntil === 0) {
          return `Today marks ${anniversary.title}.`;
        }
        return `${anniversary.title} is coming up ${timePhrase}.`;
    }
  }

  /**
   * Record that an anniversary was surfaced
   */
  async recordSurfacing(userId: string, anniversaryId: string): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      await db
        .collection('knowledge_graph')
        .doc(userId)
        .collection('anniversaries')
        .doc(anniversaryId)
        .update({
          lastSurfacedAt: new Date(),
        });
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to record anniversary surfacing');
    }
  }

  /**
   * Record user feedback on surfacing
   */
  async recordFeedback(
    userId: string,
    anniversaryId: string,
    feedback: Anniversary['feedback']
  ): Promise<void> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      await db
        .collection('knowledge_graph')
        .doc(userId)
        .collection('anniversaries')
        .doc(anniversaryId)
        .update({
          feedback,
          feedbackAt: new Date(),
        });
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to record anniversary feedback');
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async loadAnniversaries(userId: string): Promise<Anniversary[]> {
    try {
      const { Firestore } = await import('@google-cloud/firestore');
      const db = new Firestore();

      const snapshot = await db
        .collection('knowledge_graph')
        .doc(userId)
        .collection('anniversaries')
        .get();

      return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate?.() || new Date(doc.data().date),
        learnedAt: doc.data().learnedAt?.toDate?.() || new Date(),
        lastSurfacedAt: doc.data().lastSurfacedAt?.toDate?.(),
      })) as Anniversary[];
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to load anniversaries');
      return [];
    }
  }

  private getNextOccurrence(date: Date, recurring: boolean): Date {
    if (!recurring) return date;

    const now = new Date();
    const thisYear = new Date(now.getFullYear(), date.getMonth(), date.getDate());

    if (thisYear >= now) {
      return thisYear;
    }

    return new Date(now.getFullYear() + 1, date.getMonth(), date.getDate());
  }

  private createBirthdayAnniversary(userId: string, entity: Entity): Anniversary {
    const birthday = entity.contact?.birthday;
    let date: Date;

    if (typeof birthday === 'string') {
      // Parse "March 15" or "03/15" format
      date = new Date(birthday);
      if (isNaN(date.getTime())) {
        date = new Date(`${birthday} 2000`); // Add dummy year
      }
    } else {
      date = birthday || new Date();
    }

    return {
      id: `birthday-${entity.id}`,
      userId,
      type: 'birthday',
      title: `${entity.canonicalName}'s birthday`,
      date,
      recurring: true,
      entityId: entity.id,
      entityName: entity.canonicalName,
      emotionalTone: 'celebration',
      preSurfaceDays: 7, // Surface a week before
      importance: entity.salience || 0.5,
      learnedAt: new Date(),
    };
  }

  private extractAnniversariesFromText(
    userId: string,
    text: string,
    entity: Entity
  ): Anniversary[] {
    const anniversaries: Anniversary[] = [];
    const lowerText = text.toLowerCase();

    // Death anniversary patterns
    if (
      lowerText.includes('passed away') ||
      lowerText.includes('died') ||
      lowerText.includes('death anniversary') ||
      lowerText.includes('memorial')
    ) {
      // Try to extract date
      const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}|\w+\s+\d{1,2}(?:st|nd|rd|th)?)/);
      if (dateMatch) {
        anniversaries.push({
          id: `death-${entity.id}`,
          userId,
          type: 'death_anniversary',
          title: `${entity.canonicalName}'s passing`,
          date: new Date(dateMatch[1] + ' 2000'), // Dummy year
          recurring: true,
          entityId: entity.id,
          entityName: entity.canonicalName,
          emotionalTone: 'remembrance',
          preSurfaceDays: 3, // Be more gentle
          importance: 0.9,
          learnedAt: new Date(),
        });
      }
    }

    // Wedding anniversary
    if (
      lowerText.includes('wedding') ||
      lowerText.includes('married') ||
      lowerText.includes('anniversary')
    ) {
      anniversaries.push({
        id: `wedding-${entity.id}`,
        userId,
        type: 'wedding_anniversary',
        title: `Wedding anniversary`,
        date: new Date(), // Would need date extraction
        recurring: true,
        entityId: entity.id,
        entityName: entity.canonicalName,
        emotionalTone: 'celebration',
        preSurfaceDays: 7,
        importance: 0.85,
        learnedAt: new Date(),
      });
    }

    // Sobriety
    if (
      lowerText.includes('sober') ||
      lowerText.includes('sobriety') ||
      lowerText.includes('clean')
    ) {
      anniversaries.push({
        id: `sobriety-${userId}`,
        userId,
        type: 'sobriety',
        title: 'Sobriety anniversary',
        date: new Date(), // Would need date extraction
        recurring: true,
        emotionalTone: 'milestone',
        preSurfaceDays: 3,
        importance: 0.95,
        learnedAt: new Date(),
      });
    }

    return anniversaries;
  }

  private deduplicateAnniversaries(anniversaries: Anniversary[]): Anniversary[] {
    const seen = new Map<string, Anniversary>();

    for (const anniversary of anniversaries) {
      const key = `${anniversary.type}-${anniversary.entityId || anniversary.title}`;
      const existing = seen.get(key);

      if (!existing || anniversary.importance > existing.importance) {
        seen.set(key, anniversary);
      }
    }

    return Array.from(seen.values());
  }

  private getSuggestionForConversationMilestone(count: number): string {
    if (count === 10) return "We're getting to know each other!";
    if (count === 25) return "You're becoming a regular. I appreciate our talks.";
    if (count === 50) return 'Fifty conversations! We have quite a history now.';
    if (count === 100) return 'One hundred conversations. I feel like I truly know you.';
    if (count === 250) return "Two hundred fifty! You're one of my favorite people.";
    if (count === 500) return "Five hundred conversations. We've been through a lot together.";
    if (count === 1000) return 'A thousand conversations! This is a real relationship.';
    return 'This is a milestone worth celebrating!';
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let anniversaryEngine: AnniversaryEngine | null = null;

export function getAnniversaryEngine(): AnniversaryEngine {
  if (!anniversaryEngine) {
    anniversaryEngine = new AnniversaryEngine();
  }
  return anniversaryEngine;
}

export default AnniversaryEngine;
