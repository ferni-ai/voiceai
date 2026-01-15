/**
 * Memory Consolidation & Decay System
 *
 * Human memory consolidates during sleep - similar memories merge,
 * important ones strengthen, unimportant ones fade. This system
 * does the same for Ferni's knowledge graph.
 *
 * Why this matters:
 * - Without decay, the graph grows unbounded
 * - Without consolidation, we have redundant entities
 * - Without reinforcement, everything has equal weight
 *
 * Processes:
 * 1. Entity Merging: Detect and merge duplicate entities
 * 2. Fact Consolidation: Combine similar facts
 * 3. Strength Decay: Reduce importance of unused entities
 * 4. Relationship Pruning: Remove weak, unused relationships
 * 5. Correlation Refresh: Update correlation statistics
 *
 * This runs as a background job, typically daily.
 *
 * @module memory/knowledge-graph/consolidation
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getEntityResolver } from '../entity-store/entity-resolver.js';
import { getCorrelationEngine } from '../entity-store/correlation-engine.js';
import { getFirestoreDb, cleanForFirestore } from '../../utils/firestore-utils.js';
import type {
  Entity,
  Fact,
  Relationship,
  ConsolidationResult,
  DecayConfig,
  Correlation,
} from './types.js';

const log = createLogger({ module: 'MemoryConsolidation' });

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION = 'knowledge_graph';
const ENTITIES_SUBCOLLECTION = 'entities';
const FACTS_SUBCOLLECTION = 'facts';
const RELATIONSHIPS_SUBCOLLECTION = 'relationships';
const CONSOLIDATION_LOG_SUBCOLLECTION = 'consolidation_log';

const DEFAULT_DECAY_CONFIG: DecayConfig = {
  baseDecayRate: 0.02, // 2% decay per day
  minimumStrength: 0.05, // Archive below this
  emotionalProtection: 0.5, // High emotional salience reduces decay by up to 50%
  recentMentionProtectionDays: 7, // No decay if mentioned in last week
  importanceProtection: 0.3, // High importance reduces decay by up to 30%
};

// ============================================================================
// CONSOLIDATION ENGINE
// ============================================================================

export class ConsolidationEngine {
  private resolver = getEntityResolver();
  private correlationEngine = getCorrelationEngine();
  private config: DecayConfig;

  constructor(config?: Partial<DecayConfig>) {
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
  }

  /**
   * Run full consolidation process.
   * This should be called as a scheduled job (e.g., daily at 3 AM).
   */
  async runConsolidation(userId: string): Promise<ConsolidationResult> {
    const startTime = Date.now();
    log.info({ userId }, 'Starting memory consolidation');

    const result: ConsolidationResult = {
      entitiesMerged: 0,
      factsConsolidated: 0,
      relationshipsStrengthened: 0,
      memoriesDecayed: 0,
      newCorrelations: [],
    };

    try {
      // 1. Merge duplicate entities
      const merged = await this.mergeRedundantEntities(userId);
      result.entitiesMerged = merged;

      // 2. Consolidate similar facts
      const consolidated = await this.consolidateFacts(userId);
      result.factsConsolidated = consolidated;

      // 3. Apply decay to unused entities
      const decayed = await this.applyDecay(userId);
      result.memoriesDecayed = decayed;

      // 4. Reinforce frequently co-occurring relationships
      const reinforced = await this.reinforceRelationships(userId);
      result.relationshipsStrengthened = reinforced;

      // 5. Refresh correlations
      const correlations = await this.correlationEngine.analyzePatterns(userId);
      result.newCorrelations = correlations;

      // 6. Log the consolidation
      await this.logConsolidation(userId, result);

      log.info(
        {
          userId,
          ...result,
          newCorrelationsCount: result.newCorrelations.length,
          durationMs: Date.now() - startTime,
        },
        'Memory consolidation complete'
      );

      return result;
    } catch (error) {
      log.error({ userId, error: String(error) }, 'Memory consolidation failed');
      throw error;
    }
  }

  /**
   * Merge entities that appear to be duplicates.
   * Uses fuzzy matching and relationship analysis.
   */
  async mergeRedundantEntities(userId: string): Promise<number> {
    const db = await getFirestoreDb();
    if (!db) return 0;

    // Get all entities
    const snapshot = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(ENTITIES_SUBCOLLECTION)
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
   * Consolidate similar facts about the same entity.
   */
  async consolidateFacts(userId: string): Promise<number> {
    const db = await getFirestoreDb();
    if (!db) return 0;

    const snapshot = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(FACTS_SUBCOLLECTION)
      .where('contradicted', '==', false)
      .get();

    const factsByEntity = new Map<string, Fact[]>();

    for (const doc of snapshot.docs) {
      const fact = doc.data() as Fact;
      if (!factsByEntity.has(fact.entityId)) {
        factsByEntity.set(fact.entityId, []);
      }
      factsByEntity.get(fact.entityId)!.push({ ...fact, id: doc.id });
    }

    let consolidatedCount = 0;

    for (const [entityId, facts] of factsByEntity) {
      const consolidated = await this.consolidateEntityFacts(userId, entityId, facts);
      consolidatedCount += consolidated;
    }

    return consolidatedCount;
  }

  /**
   * Apply decay to entities that haven't been mentioned recently.
   */
  async applyDecay(userId: string): Promise<number> {
    const db = await getFirestoreDb();
    if (!db) return 0;

    const cutoffDate = new Date(
      Date.now() - this.config.recentMentionProtectionDays * 24 * 60 * 60 * 1000
    );

    const snapshot = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(ENTITIES_SUBCOLLECTION)
      .where('lastMentioned', '<', cutoffDate)
      .get();

    let decayedCount = 0;
    const batch = db.batch();
    const toArchive: string[] = [];

    for (const doc of snapshot.docs) {
      const entity = doc.data() as Entity;

      // Calculate decay amount
      const daysSinceMention = Math.floor(
        (Date.now() - entity.lastMentioned.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate protection factors
      const emotionalProtection = 1 - entity.emotionalSalience * this.config.emotionalProtection;
      const importanceProtection = 1 - entity.importance * this.config.importanceProtection;

      // Apply decay
      const effectiveDecayRate =
        this.config.baseDecayRate * emotionalProtection * importanceProtection;
      const decayAmount =
        effectiveDecayRate * (daysSinceMention - this.config.recentMentionProtectionDays);

      const newImportance = Math.max(0, entity.importance - decayAmount);

      if (newImportance < this.config.minimumStrength) {
        // Mark for archival
        toArchive.push(doc.id);
      } else {
        // Update with decayed importance
        batch.update(doc.ref, {
          importance: newImportance,
          updatedAt: new Date(),
        });
        decayedCount++;
      }
    }

    await batch.commit();

    // Archive entities below minimum strength
    for (const entityId of toArchive) {
      await this.archiveEntity(userId, entityId);
      decayedCount++;
    }

    return decayedCount;
  }

  /**
   * Strengthen relationships that are frequently reinforced.
   */
  async reinforceRelationships(userId: string): Promise<number> {
    const db = await getFirestoreDb();
    if (!db) return 0;

    const snapshot = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(RELATIONSHIPS_SUBCOLLECTION)
      .get();

    let reinforcedCount = 0;
    const batch = db.batch();

    for (const doc of snapshot.docs) {
      const relationship = doc.data() as Relationship;

      // Strengthen based on reinforcement count
      if (relationship.reinforcementCount > 1) {
        const strengthBoost = Math.min(0.1, relationship.reinforcementCount * 0.02);
        const newStrength = Math.min(1, relationship.strength + strengthBoost);

        batch.update(doc.ref, {
          strength: newStrength,
          updatedAt: new Date(),
        });
        reinforcedCount++;
      }

      // Decay old, weak relationships
      const daysSinceReinforced = Math.floor(
        (Date.now() - relationship.lastReinforced.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceReinforced > 60 && relationship.strength < 0.3) {
        // Remove weak, old relationships
        batch.delete(doc.ref);
      }
    }

    await batch.commit();
    return reinforcedCount;
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
    if (a.type === 'person' && a.properties.relationship && b.properties.relationship) {
      if (a.properties.relationship === b.properties.relationship) {
        // Same relationship (e.g., both are "mother") - likely same person
        return true;
      }
    }

    return false;
  }

  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;

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
    const db = await getFirestoreDb();
    if (!db) return;

    // Merge all data into primary
    const mergedAliases = new Set(primary.aliases);
    let totalMentions = primary.mentionCount;
    let maxSalience = primary.emotionalSalience;
    let maxImportance = primary.importance;
    let earliestMention = primary.firstMentioned;

    for (const dup of duplicates) {
      dup.aliases.forEach((a) => mergedAliases.add(a));
      mergedAliases.add(dup.canonicalName);
      totalMentions += dup.mentionCount;
      maxSalience = Math.max(maxSalience, dup.emotionalSalience);
      maxImportance = Math.max(maxImportance, dup.importance);
      if (dup.firstMentioned < earliestMention) {
        earliestMention = dup.firstMentioned;
      }

      // Merge properties
      for (const [key, value] of Object.entries(dup.properties)) {
        if (value && !primary.properties[key as keyof typeof primary.properties]) {
          (primary.properties as Record<string, unknown>)[key] = value;
        }
      }
    }

    // Update primary entity
    await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(ENTITIES_SUBCOLLECTION)
      .doc(primary.id)
      .update(
        cleanForFirestore({
          aliases: [...mergedAliases],
          mentionCount: totalMentions,
          emotionalSalience: maxSalience,
          importance: maxImportance,
          firstMentioned: earliestMention,
          properties: primary.properties,
          updatedAt: new Date(),
        })
      );

    // Re-point facts and relationships to primary
    for (const dup of duplicates) {
      // Update facts
      const factsSnapshot = await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(FACTS_SUBCOLLECTION)
        .where('entityId', '==', dup.id)
        .get();

      const batch = db.batch();
      for (const doc of factsSnapshot.docs) {
        batch.update(doc.ref, { entityId: primary.id });
      }

      // Update relationships
      const relSnapshot = await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(RELATIONSHIPS_SUBCOLLECTION)
        .where('sourceId', '==', dup.id)
        .get();

      for (const doc of relSnapshot.docs) {
        batch.update(doc.ref, { sourceId: primary.id });
      }

      const relTargetSnapshot = await db
        .collection(COLLECTION)
        .doc(userId)
        .collection(RELATIONSHIPS_SUBCOLLECTION)
        .where('targetId', '==', dup.id)
        .get();

      for (const doc of relTargetSnapshot.docs) {
        batch.update(doc.ref, { targetId: primary.id });
      }

      // Delete duplicate entity
      batch.delete(
        db.collection(COLLECTION).doc(userId).collection(ENTITIES_SUBCOLLECTION).doc(dup.id)
      );

      await batch.commit();
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

  private async consolidateEntityFacts(
    userId: string,
    entityId: string,
    facts: Fact[]
  ): Promise<number> {
    // Group facts by structured predicate
    const db = await getFirestoreDb();
    if (!db) return 0;

    const byPredicate = new Map<string, Fact[]>();

    for (const fact of facts) {
      if (fact.structured?.predicate) {
        const key = fact.structured.predicate;
        if (!byPredicate.has(key)) {
          byPredicate.set(key, []);
        }
        byPredicate.get(key)!.push(fact);
      }
    }

    let consolidated = 0;

    for (const [predicate, predicateFacts] of byPredicate) {
      if (predicateFacts.length <= 1) continue;

      // Keep the highest-confidence fact, mark others as superseded
      const sorted = predicateFacts.sort((a, b) => b.confidence - a.confidence);
      const primary = sorted[0];

      const batch = db.batch();
      for (let i = 1; i < sorted.length; i++) {
        batch.update(
          db.collection(COLLECTION).doc(userId).collection(FACTS_SUBCOLLECTION).doc(sorted[i].id),
          {
            contradicted: true,
            supersededBy: primary.id,
            updatedAt: new Date(),
          }
        );
        consolidated++;
      }
      await batch.commit();
    }

    return consolidated;
  }

  private async archiveEntity(userId: string, entityId: string): Promise<void> {
    const db = await getFirestoreDb();
    if (!db) return;

    // Move entity to archive subcollection
    const entityDoc = await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(ENTITIES_SUBCOLLECTION)
      .doc(entityId)
      .get();

    if (entityDoc.exists) {
      await db
        .collection(COLLECTION)
        .doc(userId)
        .collection('archived_entities')
        .doc(entityId)
        .set({
          ...entityDoc.data(),
          archivedAt: new Date(),
        });

      await entityDoc.ref.delete();
    }
  }

  private async logConsolidation(userId: string, result: ConsolidationResult): Promise<void> {
    const db = await getFirestoreDb();
    if (!db) return;

    await db
      .collection(COLLECTION)
      .doc(userId)
      .collection(CONSOLIDATION_LOG_SUBCOLLECTION)
      .add({
        timestamp: new Date(),
        ...result,
        newCorrelationsCount: result.newCorrelations.length,
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
