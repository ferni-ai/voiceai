/**
 * Memory Consolidation & Decay System
 *
 * Human memory consolidates during sleep - similar memories merge,
 * important ones strengthen, unimportant ones fade. This system
 * does the same for Ferni's entity store.
 *
 * Why this matters:
 * - Without decay, the store grows unbounded
 * - Without consolidation, we have redundant entities
 * - Without reinforcement, everything has equal weight
 *
 * Processes:
 * 1. Entity Merging: Detect and merge duplicate entities
 * 2. Strength Decay: Reduce salience of unused entities
 * 3. Relationship Pruning: Remove weak, unused relationships
 * 4. Correlation Refresh: Update correlation statistics
 *
 * This runs as a background job, typically daily.
 *
 * @module memory/entity-store/consolidation
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
import { getEntityStore } from './store.js';
import { getCorrelationEngine, type Correlation } from './correlation-engine.js';
import type { Entity, EntityRelationship, ConsolidationReport } from './types.js';

const log = createLogger({ module: 'MemoryConsolidation' });

// ============================================================================
// CONSTANTS
// ============================================================================

const ENTITIES_COLLECTION = 'entities';
const RELATIONSHIPS_COLLECTION = 'entity_relationships';
const ARCHIVED_COLLECTION = 'archived_entities';
const CONSOLIDATION_LOG_COLLECTION = 'consolidation_log';

// ============================================================================
// DECAY CONFIGURATION
// ============================================================================

export interface DecayConfig {
  /** Base decay rate per day (0-1) */
  baseDecayRate: number;

  /** Minimum salience before entity is archived */
  minimumSalience: number;

  /** Emotional weight protection factor */
  emotionalProtection: number;

  /** Recent mention protection (days) */
  recentMentionProtectionDays: number;

  /** High-salience entity protection factor */
  salienceProtection: number;
}

const DEFAULT_DECAY_CONFIG: DecayConfig = {
  baseDecayRate: 0.02, // 2% decay per day
  minimumSalience: 0.05, // Archive below this
  emotionalProtection: 0.5, // High emotional weight reduces decay by up to 50%
  recentMentionProtectionDays: 7, // No decay if mentioned in last week
  salienceProtection: 0.3, // High salience reduces decay by up to 30%
};

// ============================================================================
// CONSOLIDATION ENGINE
// ============================================================================

export class ConsolidationEngine {
  private db: FirebaseFirestore.Firestore | null = null;
  private initialized = false;
  private config: DecayConfig;
  private correlationEngine = getCorrelationEngine();

  constructor(config?: Partial<DecayConfig>) {
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const { Firestore } = await import('@google-cloud/firestore');
      this.db = new Firestore({
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
        databaseId: process.env.FIRESTORE_DATABASE || '(default)',
      });
      this.initialized = true;
      log.info('✅ ConsolidationEngine initialized');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to initialize ConsolidationEngine');
    }
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.db) {
      throw new Error('ConsolidationEngine not initialized. Call initialize() first.');
    }
  }

  /**
   * Run full consolidation process.
   * This should be called as a scheduled job (e.g., daily at 3 AM).
   */
  async runConsolidation(userId: string): Promise<ConsolidationReport> {
    await this.initialize();
    this.ensureInitialized();

    const startTime = Date.now();
    log.info({ userId }, 'Starting memory consolidation');

    const report: ConsolidationReport = {
      mergedEntities: 0,
      decayedEntities: 0,
      strengthenedEntities: 0,
      newPatternsDetected: 0,
      relationshipsUpdated: 0,
      durationMs: 0,
    };

    try {
      // 1. Merge duplicate entities
      report.mergedEntities = await this.mergeRedundantEntities(userId);

      // 2. Apply decay to unused entities
      report.decayedEntities = await this.applyDecay(userId);

      // 3. Reinforce frequently co-occurring relationships
      report.relationshipsUpdated = await this.updateRelationships(userId);

      // 4. Refresh correlations
      await this.correlationEngine.initialize();
      const correlations = await this.correlationEngine.analyzePatterns(userId);
      report.newPatternsDetected = correlations.length;

      // 5. Log the consolidation
      await this.logConsolidation(userId, report);

      report.durationMs = Date.now() - startTime;

      log.info({ userId, ...report }, 'Memory consolidation complete');

      return report;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Memory consolidation failed');
      throw error;
    }
  }

  /**
   * Merge entities that appear to be duplicates.
   * Uses fuzzy matching and alias overlap detection.
   */
  async mergeRedundantEntities(userId: string): Promise<number> {
    this.ensureInitialized();
    if (!this.db) return 0;

    // Get all entities for this user
    const snapshot = await this.db
      .collection(ENTITIES_COLLECTION)
      .where('userId', '==', userId)
      .get();

    const entities: Entity[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Entity[];

    let mergeCount = 0;
    const processed = new Set<string>();

    for (let i = 0; i < entities.length; i++) {
      if (processed.has(entities[i].id)) continue;

      const entity = entities[i];
      const duplicates: Entity[] = [];

      for (let j = i + 1; j < entities.length; j++) {
        if (processed.has(entities[j].id)) continue;

        const other = entities[j];
        if (this.arePotentialDuplicates(entity, other)) {
          duplicates.push(other);
          processed.add(other.id);
        }
      }

      if (duplicates.length > 0) {
        await this.mergeEntities(userId, entity, duplicates);
        mergeCount += duplicates.length;
      }

      processed.add(entity.id);
    }

    return mergeCount;
  }

  /**
   * Apply decay to entities that haven't been mentioned recently.
   */
  async applyDecay(userId: string): Promise<number> {
    this.ensureInitialized();
    if (!this.db) return 0;

    const cutoffDate = new Date(
      Date.now() - this.config.recentMentionProtectionDays * 24 * 60 * 60 * 1000
    );

    const snapshot = await this.db
      .collection(ENTITIES_COLLECTION)
      .where('userId', '==', userId)
      .where('lastSeen', '<', cutoffDate)
      .get();

    let decayedCount = 0;
    const batch = this.db.batch();
    const toArchive: string[] = [];

    for (const doc of snapshot.docs) {
      const entity = doc.data() as Entity;

      // Calculate decay amount
      const lastSeen =
        entity.lastSeen instanceof Date
          ? entity.lastSeen
          : (entity.lastSeen as FirebaseFirestore.Timestamp)?.toDate() || new Date();

      const daysSinceMention = Math.floor(
        (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate protection factors
      const emotionalProtection = 1 - entity.emotionalWeight * this.config.emotionalProtection;
      const salienceProtection = 1 - entity.salienceScore * this.config.salienceProtection;

      // Apply decay
      const effectiveDecayRate =
        this.config.baseDecayRate * emotionalProtection * salienceProtection;
      const decayAmount =
        effectiveDecayRate * (daysSinceMention - this.config.recentMentionProtectionDays);

      const newSalience = Math.max(0, entity.salienceScore - decayAmount);

      if (newSalience < this.config.minimumSalience) {
        // Mark for archival
        toArchive.push(doc.id);
      } else {
        // Update with decayed salience
        batch.update(doc.ref, {
          salienceScore: newSalience,
          updatedAt: new Date(),
        });
        decayedCount++;
      }
    }

    await batch.commit();

    // Archive entities below minimum salience
    for (const entityId of toArchive) {
      await this.archiveEntity(userId, entityId);
      decayedCount++;
    }

    return decayedCount;
  }

  /**
   * Update relationships: strengthen frequently used, prune old weak ones.
   */
  async updateRelationships(userId: string): Promise<number> {
    this.ensureInitialized();
    if (!this.db) return 0;

    // Get relationships for entities belonging to this user
    // First get all user's entity IDs
    const entitiesSnapshot = await this.db
      .collection(ENTITIES_COLLECTION)
      .where('userId', '==', userId)
      .select() // Only need IDs
      .get();

    const entityIds = new Set(entitiesSnapshot.docs.map((doc) => doc.id));

    // Get relationships involving these entities
    const relSnapshot = await this.db.collection(RELATIONSHIPS_COLLECTION).get();

    let updatedCount = 0;
    const batch = this.db.batch();

    for (const doc of relSnapshot.docs) {
      const rel = doc.data() as EntityRelationship;

      // Skip if not for this user's entities
      if (!entityIds.has(rel.fromEntity) && !entityIds.has(rel.toEntity)) {
        continue;
      }

      // Strengthen based on reinforcement count
      if (rel.reinforcementCount > 1) {
        const strengthBoost = Math.min(0.1, rel.reinforcementCount * 0.02);
        const newStrength = Math.min(1, rel.strength + strengthBoost);

        batch.update(doc.ref, {
          strength: newStrength,
        });
        updatedCount++;
      }

      // Prune old, weak relationships
      const lastReinforced =
        rel.lastReinforced instanceof Date
          ? rel.lastReinforced
          : (rel.lastReinforced as FirebaseFirestore.Timestamp)?.toDate() || new Date();

      const daysSinceReinforced = Math.floor(
        (Date.now() - lastReinforced.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceReinforced > 60 && rel.strength < 0.3) {
        batch.delete(doc.ref);
        updatedCount++;
      }
    }

    await batch.commit();
    return updatedCount;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private arePotentialDuplicates(a: Entity, b: Entity): boolean {
    // Must be same type
    if (a.type !== b.type) return false;

    // Check name similarity
    const similarity = this.stringSimilarity(
      a.canonicalName.toLowerCase(),
      b.canonicalName.toLowerCase()
    );

    if (similarity > 0.85) return true;

    // Check alias overlap
    const aAliases = new Set(a.aliases.map((x) => x.toLowerCase()));
    const bAliases = new Set(b.aliases.map((x) => x.toLowerCase()));

    for (const alias of aAliases) {
      if (bAliases.has(alias)) return true;
      if (b.canonicalName.toLowerCase() === alias) return true;
    }

    for (const alias of bAliases) {
      if (a.canonicalName.toLowerCase() === alias) return true;
    }

    // For people, check relationship match
    if (a.type === 'person') {
      const aAttrs = a.attributes as { _type: 'person'; relationship?: string };
      const bAttrs = b.attributes as { _type: 'person'; relationship?: string };
      if (aAttrs.relationship && bAttrs.relationship) {
        if (aAttrs.relationship === bAttrs.relationship) {
          return true;
        }
      }
    }

    return false;
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

    // Levenshtein distance normalized
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    const distance = matrix[b.length][a.length];
    const maxLength = Math.max(a.length, b.length);
    return 1 - distance / maxLength;
  }

  private async mergeEntities(
    userId: string,
    primary: Entity,
    duplicates: Entity[]
  ): Promise<void> {
    if (!this.db) return;

    // Merge all data into primary
    const mergedAliases = new Set(primary.aliases);
    let totalMentions = primary.mentionCount;
    let maxSalience = primary.salienceScore;
    let maxEmotional = primary.emotionalWeight;
    let earliestSeen =
      primary.firstSeen instanceof Date
        ? primary.firstSeen
        : (primary.firstSeen as FirebaseFirestore.Timestamp)?.toDate() || new Date();

    for (const dup of duplicates) {
      dup.aliases.forEach((a) => mergedAliases.add(a));
      mergedAliases.add(dup.canonicalName);
      totalMentions += dup.mentionCount;
      maxSalience = Math.max(maxSalience, dup.salienceScore);
      maxEmotional = Math.max(maxEmotional, dup.emotionalWeight);

      const dupFirstSeen =
        dup.firstSeen instanceof Date
          ? dup.firstSeen
          : (dup.firstSeen as FirebaseFirestore.Timestamp)?.toDate() || new Date();
      if (dupFirstSeen < earliestSeen) {
        earliestSeen = dupFirstSeen;
      }
    }

    // Update primary entity
    await this.db
      .collection(ENTITIES_COLLECTION)
      .doc(primary.id)
      .update(
        cleanForFirestore({
          aliases: [...mergedAliases],
          mentionCount: totalMentions,
          salienceScore: maxSalience,
          emotionalWeight: maxEmotional,
          firstSeen: earliestSeen,
          updatedAt: new Date(),
        })
      );

    // Re-point relationships to primary and delete duplicates
    for (const dup of duplicates) {
      // Update relationships where this entity is source
      const fromSnapshot = await this.db
        .collection(RELATIONSHIPS_COLLECTION)
        .where('fromEntity', '==', dup.id)
        .get();

      for (const doc of fromSnapshot.docs) {
        await doc.ref.update({ fromEntity: primary.id });
      }

      // Update relationships where this entity is target
      const toSnapshot = await this.db
        .collection(RELATIONSHIPS_COLLECTION)
        .where('toEntity', '==', dup.id)
        .get();

      for (const doc of toSnapshot.docs) {
        await doc.ref.update({ toEntity: primary.id });
      }

      // Delete duplicate entity
      await this.db.collection(ENTITIES_COLLECTION).doc(dup.id).delete();
    }

    log.debug(
      {
        userId,
        primaryId: primary.id,
        duplicateIds: duplicates.map((d) => d.id),
      },
      'Merged duplicate entities'
    );
  }

  private async archiveEntity(userId: string, entityId: string): Promise<void> {
    if (!this.db) return;

    const entityDoc = await this.db.collection(ENTITIES_COLLECTION).doc(entityId).get();

    if (entityDoc.exists) {
      // Move to archive
      await this.db
        .collection(ARCHIVED_COLLECTION)
        .doc(entityId)
        .set({
          ...entityDoc.data(),
          archivedAt: new Date(),
        });

      // Delete from main collection
      await entityDoc.ref.delete();

      log.debug({ userId, entityId }, 'Archived low-salience entity');
    }
  }

  private async logConsolidation(userId: string, report: ConsolidationReport): Promise<void> {
    if (!this.db) return;

    await this.db.collection(CONSOLIDATION_LOG_COLLECTION).add({
      userId,
      timestamp: new Date(),
      ...report,
    });
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let consolidationEngine: ConsolidationEngine | null = null;

export function getConsolidationEngine(config?: Partial<DecayConfig>): ConsolidationEngine {
  if (!consolidationEngine) {
    consolidationEngine = new ConsolidationEngine(config);
  }
  return consolidationEngine;
}

export default ConsolidationEngine;
