/**
 * Commitment Linker - Connect Promises to Knowledge Graph
 *
 * Integrates with the existing Commitment Keeper superhuman service
 * to link user commitments and promises to entities and threads.
 *
 * This enables:
 * - Track commitments to specific people
 * - Associate promises with topics/threads
 * - Detect commitment patterns (who do they promise things to?)
 * - Surface commitment context when mentioning related entities
 * - Build accountability maps
 *
 * @module memory/knowledge-graph/superhuman/commitment-linker
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { Entity, Mention, Thread, Relationship } from '../types.js';

const log = createLogger({ module: 'CommitmentLinker' });

// ============================================================================
// TYPES
// ============================================================================

export interface LinkedCommitment {
  id: string;
  userId: string;
  /** Original commitment ID from Commitment Keeper */
  commitmentId: string;
  /** What was promised */
  description: string;
  /** Who the commitment involves */
  involvedEntities: Array<{
    entityId: string;
    entityName: string;
    role: 'beneficiary' | 'witness' | 'partner' | 'self';
  }>;
  /** Related threads/topics */
  relatedThreads: Array<{
    threadId: string;
    topic: string;
  }>;
  /** Current status */
  status: CommitmentStatus;
  /** When committed */
  createdAt: Date;
  /** When due (if specified) */
  dueDate?: Date;
  /** Session where commitment was made */
  sessionId?: string;
  /** Transcript snippet */
  originalTranscript?: string;
  /** Follow-up mentions */
  followUpMentions: Array<{
    date: Date;
    sentiment: 'positive' | 'neutral' | 'negative';
    context: string;
  }>;
  /** Was this surfaced? */
  lastSurfaced?: Date;
  /** User feedback on surfacing */
  surfacingFeedback?: 'helpful' | 'annoying' | 'neutral';
}

export type CommitmentStatus =
  | 'active' // Still working on it
  | 'completed' // Done!
  | 'overdue' // Past due date
  | 'forgotten' // Not mentioned in a while
  | 'abandoned' // User indicated giving up
  | 'recurring'; // Ongoing commitment

export interface CommitmentPattern {
  userId: string;
  type: 'beneficiary_pattern' | 'topic_pattern' | 'completion_pattern' | 'overdue_pattern';
  description: string;
  confidence: number;
  entities: string[];
  statistics: {
    total: number;
    completed: number;
    overdue: number;
    forgotten: number;
  };
}

export interface AccountabilityMap {
  userId: string;
  /** People the user makes commitments to */
  commitmentTargets: Array<{
    entityId: string;
    entityName: string;
    commitmentCount: number;
    completionRate: number;
    activeCommitments: number;
    overdueCommitments: number;
  }>;
  /** Topics that generate commitments */
  commitmentTopics: Array<{
    topic: string;
    commitmentCount: number;
    completionRate: number;
  }>;
  /** Overall statistics */
  overallStats: {
    totalCommitments: number;
    completionRate: number;
    averageDaysToComplete: number;
    mostReliableWith: string; // Entity name
    needsFollowUp: number;
  };
}

// ============================================================================
// COMMITMENT LINKER
// ============================================================================

export class CommitmentLinker {
  /**
   * Link a commitment to entities in the knowledge graph
   */
  async linkCommitment(
    userId: string,
    commitment: {
      id: string;
      description: string;
      dueDate?: Date;
      sessionId?: string;
      transcript?: string;
    }
  ): Promise<LinkedCommitment> {
    try {
      // 1. Extract entities from commitment description
      const entities = await this.extractEntitiesFromCommitment(userId, commitment.description);

      // 2. Find related threads
      const threads = await this.findRelatedThreads(userId, commitment.description);

      // 3. Create linked commitment
      const linkedCommitment: LinkedCommitment = {
        id: `linked-${commitment.id}`,
        userId,
        commitmentId: commitment.id,
        description: commitment.description,
        involvedEntities: entities,
        relatedThreads: threads,
        status: 'active',
        createdAt: new Date(),
        dueDate: commitment.dueDate,
        sessionId: commitment.sessionId,
        originalTranscript: commitment.transcript,
        followUpMentions: [],
      };

      // 4. Store the linked commitment
      await this.storeLinkedCommitment(linkedCommitment);

      // 5. Create relationships in the knowledge graph
      await this.createCommitmentRelationships(userId, linkedCommitment);

      log.info({
        commitmentId: commitment.id,
        entities: entities.length,
        threads: threads.length,
      }, 'Commitment linked to knowledge graph');

      return linkedCommitment;
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to link commitment');
      throw error;
    }
  }

  /**
   * Record a follow-up mention of a commitment
   */
  async recordFollowUp(
    userId: string,
    commitmentId: string,
    context: {
      transcript: string;
      sentiment: 'positive' | 'neutral' | 'negative';
      status?: CommitmentStatus;
    }
  ): Promise<void> {
    try {
      const linked = await this.getLinkedCommitment(userId, commitmentId);
      if (!linked) {
        log.debug({ commitmentId }, 'Commitment not found for follow-up');
        return;
      }

      linked.followUpMentions.push({
        date: new Date(),
        sentiment: context.sentiment,
        context: context.transcript.slice(0, 200),
      });

      if (context.status) {
        linked.status = context.status;
      }

      await this.updateLinkedCommitment(linked);
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to record follow-up');
    }
  }

  /**
   * Get commitments related to an entity
   */
  async getCommitmentsForEntity(userId: string, entityId: string): Promise<LinkedCommitment[]> {
    try {
      const db = await this.getFirestore();
      const snapshot = await db
        .collection('users')
        .doc(userId)
        .collection('linked_commitments')
        .where('involvedEntities', 'array-contains-any', [{ entityId }])
        .get();

      // Fallback: scan all commitments
      const allCommitments = await this.getAllCommitments(userId);
      return allCommitments.filter((c) =>
        c.involvedEntities.some((e) => e.entityId === entityId)
      );
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to get commitments for entity');
      return [];
    }
  }

  /**
   * Get active commitments that should be surfaced
   */
  async getCommitmentsToSurface(userId: string): Promise<LinkedCommitment[]> {
    const commitments = await this.getAllCommitments(userId);
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    return commitments.filter((c) => {
      // Active or overdue
      if (c.status !== 'active' && c.status !== 'overdue') return false;

      // Not surfaced recently (at least 3 days)
      if (c.lastSurfaced && now - new Date(c.lastSurfaced).getTime() < 3 * oneDayMs) {
        return false;
      }

      // Surfacing wasn't annoying
      if (c.surfacingFeedback === 'annoying') return false;

      // Has a due date coming up (within 3 days) OR is overdue
      if (c.dueDate) {
        const dueTime = new Date(c.dueDate).getTime();
        if (dueTime < now) return true; // Overdue
        if (dueTime - now < 3 * oneDayMs) return true; // Coming up
      }

      // Hasn't been mentioned in a while (14 days)
      const lastMention = c.followUpMentions.length > 0
        ? Math.max(...c.followUpMentions.map((m) => new Date(m.date).getTime()))
        : new Date(c.createdAt).getTime();

      if (now - lastMention > 14 * oneDayMs) return true;

      return false;
    });
  }

  /**
   * Build an accountability map for a user
   */
  async buildAccountabilityMap(userId: string): Promise<AccountabilityMap> {
    const commitments = await this.getAllCommitments(userId);

    // Build target statistics
    const targetStats: Map<string, {
      entityId: string;
      entityName: string;
      total: number;
      completed: number;
      overdue: number;
      active: number;
    }> = new Map();

    // Build topic statistics
    const topicStats: Map<string, { total: number; completed: number }> = new Map();

    let totalCompleted = 0;
    let totalOverdue = 0;
    let totalDaysToComplete = 0;
    let completedWithDays = 0;

    for (const commitment of commitments) {
      // Track by entity
      for (const entity of commitment.involvedEntities) {
        if (entity.role === 'beneficiary') {
          if (!targetStats.has(entity.entityId)) {
            targetStats.set(entity.entityId, {
              entityId: entity.entityId,
              entityName: entity.entityName,
              total: 0,
              completed: 0,
              overdue: 0,
              active: 0,
            });
          }
          const stats = targetStats.get(entity.entityId)!;
          stats.total++;
          if (commitment.status === 'completed') stats.completed++;
          if (commitment.status === 'overdue') stats.overdue++;
          if (commitment.status === 'active') stats.active++;
        }
      }

      // Track by topic
      for (const thread of commitment.relatedThreads) {
        if (!topicStats.has(thread.topic)) {
          topicStats.set(thread.topic, { total: 0, completed: 0 });
        }
        const stats = topicStats.get(thread.topic)!;
        stats.total++;
        if (commitment.status === 'completed') stats.completed++;
      }

      // Overall stats
      if (commitment.status === 'completed') {
        totalCompleted++;
        if (commitment.dueDate) {
          const completionDate = commitment.followUpMentions.find(
            (m) => m.sentiment === 'positive'
          )?.date || commitment.createdAt;
          const days = Math.round(
            (new Date(completionDate).getTime() - new Date(commitment.createdAt).getTime()) /
            (24 * 60 * 60 * 1000)
          );
          if (days > 0) {
            totalDaysToComplete += days;
            completedWithDays++;
          }
        }
      }
      if (commitment.status === 'overdue') totalOverdue++;
    }

    // Find most reliable relationship
    let mostReliable = 'yourself';
    let highestCompletionRate = 0;

    for (const [_, stats] of targetStats) {
      if (stats.total >= 3) {
        const rate = stats.completed / stats.total;
        if (rate > highestCompletionRate) {
          highestCompletionRate = rate;
          mostReliable = stats.entityName;
        }
      }
    }

    return {
      userId,
      commitmentTargets: Array.from(targetStats.values())
        .map((stats) => ({
          entityId: stats.entityId,
          entityName: stats.entityName,
          commitmentCount: stats.total,
          completionRate: stats.total > 0 ? stats.completed / stats.total : 0,
          activeCommitments: stats.active,
          overdueCommitments: stats.overdue,
        }))
        .sort((a, b) => b.commitmentCount - a.commitmentCount),
      commitmentTopics: Array.from(topicStats.entries())
        .map(([topic, stats]) => ({
          topic,
          commitmentCount: stats.total,
          completionRate: stats.total > 0 ? stats.completed / stats.total : 0,
        }))
        .sort((a, b) => b.commitmentCount - a.commitmentCount),
      overallStats: {
        totalCommitments: commitments.length,
        completionRate: commitments.length > 0 ? totalCompleted / commitments.length : 0,
        averageDaysToComplete:
          completedWithDays > 0 ? Math.round(totalDaysToComplete / completedWithDays) : 0,
        mostReliableWith: mostReliable,
        needsFollowUp: commitments.filter(
          (c) => c.status === 'active' || c.status === 'overdue' || c.status === 'forgotten'
        ).length,
      },
    };
  }

  /**
   * Detect commitment patterns
   */
  async detectPatterns(userId: string): Promise<CommitmentPattern[]> {
    const patterns: CommitmentPattern[] = [];
    const commitments = await this.getAllCommitments(userId);

    if (commitments.length < 5) return patterns;

    const accountabilityMap = await this.buildAccountabilityMap(userId);

    // Pattern: Who do they make most commitments to?
    const topTarget = accountabilityMap.commitmentTargets[0];
    if (topTarget && topTarget.commitmentCount >= 3) {
      patterns.push({
        userId,
        type: 'beneficiary_pattern',
        description: `You make the most commitments to ${topTarget.entityName}. Completion rate: ${Math.round(topTarget.completionRate * 100)}%.`,
        confidence: Math.min(0.9, topTarget.commitmentCount / 10),
        entities: [topTarget.entityId],
        statistics: {
          total: topTarget.commitmentCount,
          completed: Math.round(topTarget.completionRate * topTarget.commitmentCount),
          overdue: topTarget.overdueCommitments,
          forgotten: 0,
        },
      });
    }

    // Pattern: Which topics generate commitments?
    const topTopic = accountabilityMap.commitmentTopics[0];
    if (topTopic && topTopic.commitmentCount >= 3) {
      patterns.push({
        userId,
        type: 'topic_pattern',
        description: `"${topTopic.topic}" tends to generate commitments. ${Math.round(topTopic.completionRate * 100)}% get done.`,
        confidence: Math.min(0.85, topTopic.commitmentCount / 8),
        entities: [],
        statistics: {
          total: topTopic.commitmentCount,
          completed: Math.round(topTopic.completionRate * topTopic.commitmentCount),
          overdue: 0,
          forgotten: 0,
        },
      });
    }

    // Pattern: Overall completion rate
    if (accountabilityMap.overallStats.completionRate < 0.4 && commitments.length >= 5) {
      patterns.push({
        userId,
        type: 'overdue_pattern',
        description: `Many commitments don't get completed (${Math.round(accountabilityMap.overallStats.completionRate * 100)}% completion rate). Are you taking on too much?`,
        confidence: 0.8,
        entities: [],
        statistics: {
          total: commitments.length,
          completed: Math.round(accountabilityMap.overallStats.completionRate * commitments.length),
          overdue: commitments.filter((c) => c.status === 'overdue').length,
          forgotten: commitments.filter((c) => c.status === 'forgotten').length,
        },
      });
    } else if (accountabilityMap.overallStats.completionRate > 0.7 && commitments.length >= 5) {
      patterns.push({
        userId,
        type: 'completion_pattern',
        description: `You follow through on most commitments (${Math.round(accountabilityMap.overallStats.completionRate * 100)}%). That's reliability.`,
        confidence: 0.85,
        entities: [],
        statistics: {
          total: commitments.length,
          completed: Math.round(accountabilityMap.overallStats.completionRate * commitments.length),
          overdue: commitments.filter((c) => c.status === 'overdue').length,
          forgotten: commitments.filter((c) => c.status === 'forgotten').length,
        },
      });
    }

    return patterns;
  }

  /**
   * Generate context string for surfacing during conversation
   */
  async getCommitmentContext(userId: string, entityId?: string, topic?: string): Promise<string | null> {
    const relevantCommitments: LinkedCommitment[] = [];

    if (entityId) {
      const entityCommitments = await this.getCommitmentsForEntity(userId, entityId);
      relevantCommitments.push(...entityCommitments);
    }

    if (topic) {
      const allCommitments = await this.getAllCommitments(userId);
      const topicCommitments = allCommitments.filter((c) =>
        c.relatedThreads.some((t) =>
          t.topic.toLowerCase().includes(topic.toLowerCase())
        )
      );
      relevantCommitments.push(...topicCommitments);
    }

    // Filter to active/overdue
    const active = relevantCommitments.filter(
      (c) => c.status === 'active' || c.status === 'overdue'
    );

    if (active.length === 0) return null;

    // Build context string
    const parts: string[] = ['[COMMITMENT CONTEXT]'];

    for (const commitment of active.slice(0, 3)) {
      const entityNames = commitment.involvedEntities
        .filter((e) => e.role === 'beneficiary')
        .map((e) => e.entityName)
        .join(', ');

      let line = `• "${commitment.description}"`;
      if (entityNames) line += ` (to ${entityNames})`;
      if (commitment.status === 'overdue') line += ' - OVERDUE';
      if (commitment.dueDate) {
        const daysLeft = Math.ceil(
          (new Date(commitment.dueDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );
        if (daysLeft > 0 && daysLeft <= 7) line += ` - due in ${daysLeft} days`;
      }

      parts.push(line);
    }

    if (active.length > 3) {
      parts.push(`• ...and ${active.length - 3} more commitments`);
    }

    return parts.join('\n');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async extractEntitiesFromCommitment(
    userId: string,
    description: string
  ): Promise<LinkedCommitment['involvedEntities']> {
    const entities: LinkedCommitment['involvedEntities'] = [];

    try {
      const { searchEntities } = await import('../../entity-store/storage.js');

      // Simple entity extraction via keywords
      // In production, would use LLM extraction
      const words = description.split(/\s+/);
      const potentialNames = words.filter(
        (w) => w.length > 2 && w[0] === w[0].toUpperCase()
      );

      for (const name of potentialNames) {
        const matches = await searchEntities(userId, name, {
          types: ['person'],
          limit: 3,
        });

        for (const match of matches) {
          if (!entities.some((e) => e.entityId === match.id)) {
            // Determine role from context
            const role = this.inferRole(description, match.canonicalName);
            entities.push({
              entityId: match.id,
              entityName: match.canonicalName,
              role,
            });
          }
        }
      }

      // If no entities found, it's a commitment to self
      if (entities.length === 0) {
        entities.push({
          entityId: 'self',
          entityName: 'yourself',
          role: 'self',
        });
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Entity extraction failed');
    }

    return entities;
  }

  private inferRole(description: string, entityName: string): 'beneficiary' | 'witness' | 'partner' | 'self' {
    const lower = description.toLowerCase();
    const nameLower = entityName.toLowerCase();

    // Patterns that indicate beneficiary
    if (lower.includes(`for ${nameLower}`) || lower.includes(`to ${nameLower}`)) {
      return 'beneficiary';
    }

    // Patterns that indicate partner
    if (lower.includes(`with ${nameLower}`)) {
      return 'partner';
    }

    // Default to beneficiary if name is mentioned
    if (lower.includes(nameLower)) {
      return 'beneficiary';
    }

    return 'witness';
  }

  private async findRelatedThreads(
    userId: string,
    description: string
  ): Promise<LinkedCommitment['relatedThreads']> {
    const threads: LinkedCommitment['relatedThreads'] = [];

    try {
      const { getActiveThreads } = await import('../storage/index.js');

      const activeThreads = await getActiveThreads(userId, {
        includeOpen: true,
        includeRecurring: true,
        limit: 50,
      });

      // Simple keyword matching
      const descWords = new Set(
        description
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );

      for (const thread of activeThreads) {
        const topicWords = thread.topic.toLowerCase().split(/\s+/);
        const overlap = topicWords.filter((w) => descWords.has(w)).length;

        if (overlap >= 1 || description.toLowerCase().includes(thread.topic.toLowerCase())) {
          threads.push({
            threadId: thread.id,
            topic: thread.topic,
          });
        }
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Thread matching failed');
    }

    return threads.slice(0, 5);
  }

  private async createCommitmentRelationships(
    userId: string,
    commitment: LinkedCommitment
  ): Promise<void> {
    try {
      const { upsertRelationship } = await import('../../entity-store/storage.js');

      for (const entity of commitment.involvedEntities) {
        if (entity.entityId === 'self') continue;

        await upsertRelationship(userId, {
          id: `commitment-rel-${commitment.id}-${entity.entityId}`,
          fromEntityId: 'self',
          toEntityId: entity.entityId,
          type: 'commitment',
          label: `commitment: ${commitment.description.slice(0, 50)}`,
          firstMentionedAt: commitment.createdAt,
          lastMentionedAt: commitment.createdAt,
          mentionCount: 1,
          confidence: 0.9,
          sentiment: 'positive',
          context: {
            commitmentId: commitment.commitmentId,
            dueDate: commitment.dueDate?.toISOString(),
          },
        });
      }
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to create commitment relationships');
    }
  }

  // ============================================================================
  // STORAGE METHODS
  // ============================================================================

  private async getFirestore() {
    const { Firestore } = await import('@google-cloud/firestore');
    return new Firestore();
  }

  private async storeLinkedCommitment(commitment: LinkedCommitment): Promise<void> {
    try {
      const db = await this.getFirestore();
      await db
        .collection('users')
        .doc(commitment.userId)
        .collection('linked_commitments')
        .doc(commitment.id)
        .set({
          ...commitment,
          createdAt: commitment.createdAt.toISOString(),
          dueDate: commitment.dueDate?.toISOString(),
          lastSurfaced: commitment.lastSurfaced?.toISOString(),
          followUpMentions: commitment.followUpMentions.map((m) => ({
            ...m,
            date: m.date instanceof Date ? m.date.toISOString() : m.date,
          })),
        });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to store linked commitment');
    }
  }

  private async updateLinkedCommitment(commitment: LinkedCommitment): Promise<void> {
    await this.storeLinkedCommitment(commitment);
  }

  private async getLinkedCommitment(
    userId: string,
    commitmentId: string
  ): Promise<LinkedCommitment | null> {
    try {
      const db = await this.getFirestore();
      const doc = await db
        .collection('users')
        .doc(userId)
        .collection('linked_commitments')
        .doc(`linked-${commitmentId}`)
        .get();

      if (!doc.exists) return null;

      const data = doc.data()!;
      return {
        ...data,
        createdAt: new Date(data.createdAt),
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        lastSurfaced: data.lastSurfaced ? new Date(data.lastSurfaced) : undefined,
        followUpMentions: (data.followUpMentions || []).map(
          (m: { date: string; sentiment: string; context: string }) => ({
            ...m,
            date: new Date(m.date),
          })
        ),
      } as LinkedCommitment;
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to get linked commitment');
      return null;
    }
  }

  private async getAllCommitments(userId: string): Promise<LinkedCommitment[]> {
    try {
      const db = await this.getFirestore();
      const snapshot = await db
        .collection('users')
        .doc(userId)
        .collection('linked_commitments')
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get();

      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          ...data,
          createdAt: new Date(data.createdAt),
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          lastSurfaced: data.lastSurfaced ? new Date(data.lastSurfaced) : undefined,
          followUpMentions: (data.followUpMentions || []).map(
            (m: { date: string; sentiment: string; context: string }) => ({
              ...m,
              date: new Date(m.date),
            })
          ),
        } as LinkedCommitment;
      });
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to get all commitments');
      return [];
    }
  }

  /**
   * Mark a commitment as surfaced and record feedback
   */
  async recordSurfacing(
    userId: string,
    commitmentId: string,
    feedback?: 'helpful' | 'annoying' | 'neutral'
  ): Promise<void> {
    try {
      const commitment = await this.getLinkedCommitment(userId, commitmentId);
      if (!commitment) return;

      commitment.lastSurfaced = new Date();
      if (feedback) {
        commitment.surfacingFeedback = feedback;
      }

      await this.updateLinkedCommitment(commitment);
    } catch (error) {
      log.debug({ error: String(error) }, 'Failed to record surfacing');
    }
  }

  /**
   * Update commitment status
   */
  async updateStatus(
    userId: string,
    commitmentId: string,
    status: CommitmentStatus
  ): Promise<void> {
    const commitment = await this.getLinkedCommitment(userId, commitmentId);
    if (!commitment) return;

    commitment.status = status;
    await this.updateLinkedCommitment(commitment);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let commitmentLinker: CommitmentLinker | null = null;

export function getCommitmentLinker(): CommitmentLinker {
  if (!commitmentLinker) {
    commitmentLinker = new CommitmentLinker();
  }
  return commitmentLinker;
}

export default CommitmentLinker;
