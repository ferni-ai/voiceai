/**
 * Memory Consolidation Service
 *
 * Implements nightly batch processing to consolidate, deduplicate, and
 * strengthen memory connections. Runs during low-activity periods.
 *
 * Architecture:
 * ```
 * ┌──────────────────────────────────────────────────┐
 * │            Memory Consolidation Service          │
 * │                                                  │
 * │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
 * │  │  Entity  │  │  Fact    │  │ Relationship │  │
 * │  │  Merger  │  │  Dedup   │  │  Strength    │  │
 * │  └──────────┘  └──────────┘  └──────────────┘  │
 * │                                                  │
 * │  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
 * │  │ Temporal │  │  Memory  │  │   Summary    │  │
 * │  │  Decay   │  │  Threads │  │  Generation  │  │
 * │  └──────────┘  └──────────┘  └──────────────┘  │
 * └──────────────────────────────────────────────────┘
 * ```
 *
 * Processes:
 * 1. Entity Merging - Merge duplicate entities with similar names
 * 2. Fact Deduplication - Remove or merge duplicate facts
 * 3. Relationship Strengthening - Update relationship strengths based on co-occurrence
 * 4. Temporal Decay - Apply time-based decay to importance scores
 * 5. Memory Thread Updates - Update episodic memory threads
 * 6. Summary Generation - Generate user summaries for retrieval
 *
 * @module memory/consolidation/memory-consolidation-service
 */

import { createLogger } from '../../utils/safe-logger.js';
import { Firestore, FieldValue } from '@google-cloud/firestore';

const log = createLogger({ module: 'MemoryConsolidation' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Consolidation job configuration
 */
export interface ConsolidationConfig {
  /** User IDs to process (empty = all users) */
  userIds?: string[];
  /** Run entity merging */
  mergeEntities?: boolean;
  /** Run fact deduplication */
  deduplicateFacts?: boolean;
  /** Run relationship strengthening */
  strengthenRelationships?: boolean;
  /** Run temporal decay */
  applyTemporalDecay?: boolean;
  /** Run memory thread updates */
  updateMemoryThreads?: boolean;
  /** Run summary generation */
  generateSummaries?: boolean;
  /** Dry run (don't persist changes) */
  dryRun?: boolean;
  /** Batch size for processing */
  batchSize?: number;
  /** Maximum users to process (for testing) */
  maxUsers?: number;
}

/**
 * Consolidation result
 */
export interface ConsolidationResult {
  /** Job ID */
  jobId: string;
  /** Start time */
  startedAt: Date;
  /** End time */
  completedAt: Date;
  /** Users processed */
  usersProcessed: number;
  /** Per-task metrics */
  metrics: {
    entitiesMerged: number;
    factsDeduped: number;
    relationshipsUpdated: number;
    decayApplied: number;
    threadsUpdated: number;
    summariesGenerated: number;
  };
  /** Errors encountered */
  errors: Array<{ userId: string; task: string; error: string }>;
  /** Duration in ms */
  durationMs: number;
}

/**
 * Entity similarity score
 */
interface EntitySimilarity {
  entityId1: string;
  entityId2: string;
  name1: string;
  name2: string;
  similarity: number;
  shouldMerge: boolean;
}

/**
 * Temporal decay configuration
 */
interface TemporalDecayConfig {
  /** Half-life in days for importance decay */
  importanceHalfLifeDays: number;
  /** Minimum importance (never decay below this) */
  minImportance: number;
  /** Maximum days since mention before heavy decay */
  maxInactiveDays: number;
}

// ============================================================================
// MEMORY CONSOLIDATION SERVICE
// ============================================================================

/**
 * Service for nightly memory consolidation
 */
export class MemoryConsolidationService {
  private firestore: Firestore;
  private isRunning = false;
  private currentJobId: string | null = null;

  constructor(firestore?: Firestore) {
    this.firestore = firestore || new Firestore();
  }

  /**
   * Run full consolidation job
   */
  async runConsolidation(config: ConsolidationConfig = {}): Promise<ConsolidationResult> {
    if (this.isRunning) {
      throw new Error(`Consolidation already running (job: ${this.currentJobId})`);
    }

    const startedAt = new Date();
    const jobId = `consolidation_${startedAt.getTime()}`;
    this.currentJobId = jobId;
    this.isRunning = true;

    const {
      userIds,
      mergeEntities = true,
      deduplicateFacts = true,
      strengthenRelationships = true,
      applyTemporalDecay = true,
      updateMemoryThreads = true,
      generateSummaries = false, // Off by default (expensive)
      dryRun = false,
      batchSize = 50,
      maxUsers,
    } = config;

    log.info(
      {
        jobId,
        dryRun,
        tasks: {
          mergeEntities,
          deduplicateFacts,
          strengthenRelationships,
          applyTemporalDecay,
          updateMemoryThreads,
          generateSummaries,
        },
      },
      '🌙 Starting memory consolidation job'
    );

    const result: ConsolidationResult = {
      jobId,
      startedAt,
      completedAt: new Date(),
      usersProcessed: 0,
      metrics: {
        entitiesMerged: 0,
        factsDeduped: 0,
        relationshipsUpdated: 0,
        decayApplied: 0,
        threadsUpdated: 0,
        summariesGenerated: 0,
      },
      errors: [],
      durationMs: 0,
    };

    try {
      // Get users to process
      const users = await this.getUsersToProcess(userIds, maxUsers);
      log.info({ userCount: users.length }, 'Users to process');

      // Process users in batches
      for (let i = 0; i < users.length; i += batchSize) {
        const batch = users.slice(i, Math.min(i + batchSize, users.length));

        for (const userId of batch) {
          try {
            const userMetrics = await this.processUser(userId, {
              mergeEntities,
              deduplicateFacts,
              strengthenRelationships,
              applyTemporalDecay,
              updateMemoryThreads,
              generateSummaries,
              dryRun,
            });

            // Aggregate metrics
            result.metrics.entitiesMerged += userMetrics.entitiesMerged;
            result.metrics.factsDeduped += userMetrics.factsDeduped;
            result.metrics.relationshipsUpdated += userMetrics.relationshipsUpdated;
            result.metrics.decayApplied += userMetrics.decayApplied;
            result.metrics.threadsUpdated += userMetrics.threadsUpdated;
            result.metrics.summariesGenerated += userMetrics.summariesGenerated;
            result.usersProcessed++;
          } catch (error) {
            result.errors.push({
              userId,
              task: 'processUser',
              error: String(error),
            });
            log.warn({ userId, error: String(error) }, 'Error processing user');
          }
        }

        // Log progress
        log.info(
          {
            processed: Math.min(i + batchSize, users.length),
            total: users.length,
            metrics: result.metrics,
          },
          'Consolidation progress'
        );
      }
    } finally {
      result.completedAt = new Date();
      result.durationMs = result.completedAt.getTime() - startedAt.getTime();
      this.isRunning = false;
      this.currentJobId = null;
    }

    log.info(
      {
        jobId,
        usersProcessed: result.usersProcessed,
        durationMs: result.durationMs,
        metrics: result.metrics,
        errorCount: result.errors.length,
      },
      '✅ Memory consolidation completed'
    );

    return result;
  }

  /**
   * Get users to process
   */
  private async getUsersToProcess(userIds?: string[], maxUsers?: number): Promise<string[]> {
    if (userIds && userIds.length > 0) {
      return maxUsers ? userIds.slice(0, maxUsers) : userIds;
    }

    // Get all users from entity store
    const snapshot = await this.firestore
      .collection('unified_entities')
      .select()
      .limit(maxUsers || 10000)
      .get();

    const userSet = new Set<string>();
    for (const doc of snapshot.docs) {
      const userId = doc.ref.parent.parent?.id;
      if (userId) userSet.add(userId);
    }

    return Array.from(userSet);
  }

  /**
   * Process a single user's memories
   */
  private async processUser(
    userId: string,
    config: {
      mergeEntities: boolean;
      deduplicateFacts: boolean;
      strengthenRelationships: boolean;
      applyTemporalDecay: boolean;
      updateMemoryThreads: boolean;
      generateSummaries: boolean;
      dryRun: boolean;
    }
  ): Promise<{
    entitiesMerged: number;
    factsDeduped: number;
    relationshipsUpdated: number;
    decayApplied: number;
    threadsUpdated: number;
    summariesGenerated: number;
  }> {
    const metrics = {
      entitiesMerged: 0,
      factsDeduped: 0,
      relationshipsUpdated: 0,
      decayApplied: 0,
      threadsUpdated: 0,
      summariesGenerated: 0,
    };

    // 1. Entity Merging
    if (config.mergeEntities) {
      metrics.entitiesMerged = await this.mergeEntities(userId, config.dryRun);
    }

    // 2. Fact Deduplication
    if (config.deduplicateFacts) {
      metrics.factsDeduped = await this.deduplicateFacts(userId, config.dryRun);
    }

    // 3. Relationship Strengthening
    if (config.strengthenRelationships) {
      metrics.relationshipsUpdated = await this.strengthenRelationships(userId, config.dryRun);
    }

    // 4. Temporal Decay
    if (config.applyTemporalDecay) {
      metrics.decayApplied = await this.applyTemporalDecay(userId, config.dryRun);
    }

    // 5. Memory Thread Updates
    if (config.updateMemoryThreads) {
      metrics.threadsUpdated = await this.updateMemoryThreads(userId, config.dryRun);
    }

    // 6. Summary Generation
    if (config.generateSummaries) {
      metrics.summariesGenerated = await this.generateSummaries(userId, config.dryRun);
    }

    return metrics;
  }

  // ============================================================================
  // ENTITY MERGING
  // ============================================================================

  /**
   * Find and merge duplicate entities
   */
  private async mergeEntities(userId: string, dryRun: boolean): Promise<number> {
    const entitiesRef = this.firestore.collection('users').doc(userId).collection('unified_entities');
    const snapshot = await entitiesRef.get();

    if (snapshot.empty) return 0;

    // Group entities by type
    const entitiesByType = new Map<string, Array<{ id: string; name: string; aliases: string[] }>>();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const type = data.type || 'unknown';

      if (!entitiesByType.has(type)) {
        entitiesByType.set(type, []);
      }

      entitiesByType.get(type)!.push({
        id: doc.id,
        name: data.canonicalName || data.name || '',
        aliases: data.aliases || [],
      });
    }

    // Find similar entities within each type
    let mergedCount = 0;
    const entitiesByTypeArray = Array.from(entitiesByType.entries());

    for (const [_type, entities] of entitiesByTypeArray) {
      const similarities = this.findSimilarEntities(entities);

      for (const sim of similarities) {
        if (sim.shouldMerge) {
          if (!dryRun) {
            await this.performMerge(userId, sim.entityId1, sim.entityId2);
          }
          mergedCount++;
        }
      }
    }

    return mergedCount;
  }

  /**
   * Find similar entities based on name similarity
   */
  private findSimilarEntities(
    entities: Array<{ id: string; name: string; aliases: string[] }>
  ): EntitySimilarity[] {
    const similarities: EntitySimilarity[] = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];

        const similarity = this.calculateNameSimilarity(
          e1.name,
          e2.name,
          e1.aliases,
          e2.aliases
        );

        if (similarity > 0.8) {
          similarities.push({
            entityId1: e1.id,
            entityId2: e2.id,
            name1: e1.name,
            name2: e2.name,
            similarity,
            shouldMerge: similarity > 0.9,
          });
        }
      }
    }

    return similarities;
  }

  /**
   * Calculate name similarity including aliases
   */
  private calculateNameSimilarity(
    name1: string,
    name2: string,
    aliases1: string[],
    aliases2: string[]
  ): number {
    const normalize = (s: string) => s.toLowerCase().trim();
    const n1 = normalize(name1);
    const n2 = normalize(name2);

    // Exact match
    if (n1 === n2) return 1.0;

    // Alias match
    const allNames1 = [n1, ...aliases1.map(normalize)];
    const allNames2 = [n2, ...aliases2.map(normalize)];

    for (const a1 of allNames1) {
      for (const a2 of allNames2) {
        if (a1 === a2) return 0.95;
      }
    }

    // Levenshtein distance
    const distance = this.levenshteinDistance(n1, n2);
    const maxLen = Math.max(n1.length, n2.length);
    if (maxLen === 0) return 0;

    return 1 - distance / maxLen;
  }

  /**
   * Levenshtein distance for fuzzy matching
   */
  private levenshteinDistance(s1: string, s2: string): number {
    const m = s1.length;
    const n = s2.length;
    const dp: number[][] = Array(m + 1)
      .fill(null)
      .map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (s1[i - 1] === s2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    return dp[m][n];
  }

  /**
   * Merge two entities
   */
  private async performMerge(
    userId: string,
    primaryEntityId: string,
    secondaryEntityId: string
  ): Promise<void> {
    const entitiesRef = this.firestore.collection('users').doc(userId).collection('unified_entities');

    const [primaryDoc, secondaryDoc] = await Promise.all([
      entitiesRef.doc(primaryEntityId).get(),
      entitiesRef.doc(secondaryEntityId).get(),
    ]);

    if (!primaryDoc.exists || !secondaryDoc.exists) return;

    const primary = primaryDoc.data()!;
    const secondary = secondaryDoc.data()!;

    // Merge aliases
    const mergedAliases = Array.from(
      new Set([
        ...(primary.aliases || []),
        ...(secondary.aliases || []),
        secondary.canonicalName || secondary.name || '',
      ])
    ).filter(Boolean);

    // Merge attributes
    const mergedAttributes = {
      ...(secondary.attributes || {}),
      ...(primary.attributes || {}),
    };

    // Update primary with merged data
    await entitiesRef.doc(primaryEntityId).update({
      aliases: mergedAliases,
      attributes: mergedAttributes,
      mentionCount: (primary.mentionCount || 0) + (secondary.mentionCount || 0),
      salience: Math.max(primary.salience || 0, secondary.salience || 0),
      emotionalWeight: Math.max(primary.emotionalWeight || 0, secondary.emotionalWeight || 0),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Delete secondary
    await entitiesRef.doc(secondaryEntityId).delete();

    log.debug(
      { userId, primary: primaryEntityId, secondary: secondaryEntityId },
      'Merged entities'
    );
  }

  // ============================================================================
  // FACT DEDUPLICATION
  // ============================================================================

  /**
   * Deduplicate facts for a user
   */
  private async deduplicateFacts(userId: string, dryRun: boolean): Promise<number> {
    // Get all facts
    const factsRef = this.firestore.collection('users').doc(userId).collection('facts');
    const snapshot = await factsRef.limit(1000).get();

    if (snapshot.empty) return 0;

    // Group by entity and key
    const factsByEntityKey = new Map<string, Array<{ id: string; value: string; confidence: number }>>();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const key = `${data.entityId}:${data.key}`;

      if (!factsByEntityKey.has(key)) {
        factsByEntityKey.set(key, []);
      }

      factsByEntityKey.get(key)!.push({
        id: doc.id,
        value: data.value,
        confidence: data.confidence || 0.5,
      });
    }

    // Find duplicates
    let dedupedCount = 0;
    const factsByEntityKeyArray = Array.from(factsByEntityKey.values());

    for (const facts of factsByEntityKeyArray) {
      if (facts.length <= 1) continue;

      // Keep highest confidence, delete others
      facts.sort((a, b) => b.confidence - a.confidence);
      const duplicates = facts.slice(1);

      for (const dup of duplicates) {
        if (!dryRun) {
          await factsRef.doc(dup.id).delete();
        }
        dedupedCount++;
      }
    }

    return dedupedCount;
  }

  // ============================================================================
  // RELATIONSHIP STRENGTHENING
  // ============================================================================

  /**
   * Update relationship strengths based on co-occurrence
   */
  private async strengthenRelationships(userId: string, dryRun: boolean): Promise<number> {
    // Get recent interactions
    const conversationsRef = this.firestore
      .collection('users')
      .doc(userId)
      .collection('conversations');

    const recentConversations = await conversationsRef
      .where('createdAt', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) // Last 7 days
      .limit(100)
      .get();

    if (recentConversations.empty) return 0;

    // Count entity co-occurrences
    const coOccurrences = new Map<string, number>();

    for (const doc of recentConversations.docs) {
      const data = doc.data();
      const entities = data.mentionedEntities || [];

      // Count pairs
      for (let i = 0; i < entities.length; i++) {
        for (let j = i + 1; j < entities.length; j++) {
          const key = [entities[i], entities[j]].sort().join(':');
          coOccurrences.set(key, (coOccurrences.get(key) || 0) + 1);
        }
      }
    }

    // Update relationship strengths
    let updatedCount = 0;
    const relationshipsRef = this.firestore
      .collection('users')
      .doc(userId)
      .collection('relationships');

    const coOccurrencesArray = Array.from(coOccurrences.entries());
    for (const [key, count] of coOccurrencesArray) {
      const [entity1, entity2] = key.split(':');

      // Find existing relationship
      const existingRelationships = await relationshipsRef
        .where('entity1Id', 'in', [entity1, entity2])
        .limit(10)
        .get();

      for (const relDoc of existingRelationships.docs) {
        const relData = relDoc.data();
        if (
          (relData.entity1Id === entity1 && relData.entity2Id === entity2) ||
          (relData.entity1Id === entity2 && relData.entity2Id === entity1)
        ) {
          // Strengthen relationship
          const strengthBoost = Math.min(0.1 * count, 0.3);
          const newStrength = Math.min((relData.strength || 0.5) + strengthBoost, 1.0);

          if (!dryRun) {
            await relationshipsRef.doc(relDoc.id).update({
              strength: newStrength,
              lastCoOccurrence: FieldValue.serverTimestamp(),
            });
          }
          updatedCount++;
        }
      }
    }

    return updatedCount;
  }

  // ============================================================================
  // TEMPORAL DECAY
  // ============================================================================

  /**
   * Apply temporal decay to entity importance
   */
  private async applyTemporalDecay(userId: string, dryRun: boolean): Promise<number> {
    const config: TemporalDecayConfig = {
      importanceHalfLifeDays: 30,
      minImportance: 0.1,
      maxInactiveDays: 90,
    };

    const entitiesRef = this.firestore.collection('users').doc(userId).collection('unified_entities');
    const snapshot = await entitiesRef.get();

    if (snapshot.empty) return 0;

    const now = Date.now();
    let decayedCount = 0;

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const lastMentioned = data.lastMentionedAt?.toDate?.() || data.updatedAt?.toDate?.();

      if (!lastMentioned) continue;

      const daysSinceLastMention = (now - lastMentioned.getTime()) / (24 * 60 * 60 * 1000);

      // Calculate decay factor
      const decayFactor = Math.pow(0.5, daysSinceLastMention / config.importanceHalfLifeDays);
      const currentImportance = data.salience || data.importance || 0.5;
      const newImportance = Math.max(currentImportance * decayFactor, config.minImportance);

      // Only update if significant change
      if (Math.abs(newImportance - currentImportance) > 0.01) {
        if (!dryRun) {
          await entitiesRef.doc(doc.id).update({
            salience: newImportance,
            temporalDecayApplied: FieldValue.serverTimestamp(),
          });
        }
        decayedCount++;
      }
    }

    return decayedCount;
  }

  // ============================================================================
  // MEMORY THREADS
  // ============================================================================

  /**
   * Update memory threads
   */
  private async updateMemoryThreads(userId: string, dryRun: boolean): Promise<number> {
    // Get recent memories
    const memoriesRef = this.firestore.collection('users').doc(userId).collection('memories');
    const recentMemories = await memoriesRef
      .where('createdAt', '>', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    if (recentMemories.empty) return 0;

    // Group by theme/topic
    const themeGroups = new Map<string, string[]>();

    for (const doc of recentMemories.docs) {
      const data = doc.data();
      const themes = data.themes || data.topics || [];

      for (const theme of themes) {
        if (!themeGroups.has(theme)) {
          themeGroups.set(theme, []);
        }
        themeGroups.get(theme)!.push(doc.id);
      }
    }

    // Update or create threads
    const threadsRef = this.firestore.collection('users').doc(userId).collection('memory_threads');
    let updatedCount = 0;

    const themeGroupsArray = Array.from(themeGroups.entries());
    for (const [theme, memoryIds] of themeGroupsArray) {
      if (memoryIds.length < 2) continue;

      if (!dryRun) {
        await threadsRef.doc(theme.toLowerCase().replace(/\s+/g, '_')).set(
          {
            theme,
            memoryIds,
            memoryCount: memoryIds.length,
            lastUpdated: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
      updatedCount++;
    }

    return updatedCount;
  }

  // ============================================================================
  // SUMMARY GENERATION
  // ============================================================================

  /**
   * Generate user summaries
   */
  private async generateSummaries(userId: string, dryRun: boolean): Promise<number> {
    // Get important entities
    const entitiesRef = this.firestore.collection('users').doc(userId).collection('unified_entities');
    const importantEntities = await entitiesRef
      .where('salience', '>', 0.5)
      .orderBy('salience', 'desc')
      .limit(20)
      .get();

    if (importantEntities.empty) return 0;

    // Build summary
    const entityNames = importantEntities.docs.map((d) => d.data().canonicalName || d.data().name);
    const summary = {
      importantPeople: entityNames.filter((_, i) => {
        const data = importantEntities.docs[i].data();
        return data.type === 'person';
      }),
      importantTopics: entityNames.filter((_, i) => {
        const data = importantEntities.docs[i].data();
        return data.type === 'topic' || data.type === 'theme';
      }),
      generatedAt: new Date(),
      entityCount: importantEntities.docs.length,
    };

    if (!dryRun) {
      await this.firestore.collection('users').doc(userId).collection('summaries').doc('current').set(
        summary,
        { merge: true }
      );
    }

    return 1;
  }

  // ============================================================================
  // STATUS
  // ============================================================================

  /**
   * Check if consolidation is currently running
   */
  isConsolidating(): boolean {
    return this.isRunning;
  }

  /**
   * Get current job ID
   */
  getCurrentJobId(): string | null {
    return this.currentJobId;
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let serviceInstance: MemoryConsolidationService | null = null;

/**
 * Get or create the consolidation service singleton
 */
export function getConsolidationService(): MemoryConsolidationService {
  if (!serviceInstance) {
    serviceInstance = new MemoryConsolidationService();
  }
  return serviceInstance;
}

/**
 * Run consolidation with default config
 */
export async function runConsolidation(
  config?: ConsolidationConfig
): Promise<ConsolidationResult> {
  const service = getConsolidationService();
  return service.runConsolidation(config);
}

/**
 * Run consolidation for a single user
 */
export async function consolidateUser(
  userId: string,
  dryRun: boolean = false
): Promise<ConsolidationResult> {
  const service = getConsolidationService();
  return service.runConsolidation({
    userIds: [userId],
    dryRun,
  });
}

/**
 * Run nightly consolidation job
 * Designed to be called by Cloud Scheduler
 */
export async function nightlyConsolidation(): Promise<ConsolidationResult> {
  return runConsolidation({
    mergeEntities: true,
    deduplicateFacts: true,
    strengthenRelationships: true,
    applyTemporalDecay: true,
    updateMemoryThreads: true,
    generateSummaries: false, // Keep off for nightly (expensive)
    dryRun: false,
    batchSize: 100,
  });
}
