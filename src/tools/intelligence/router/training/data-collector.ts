/**
 * Training Data Collector
 *
 * Extracts training examples from Firestore production data.
 * Collects tool selection outcomes, user corrections, and routing events.
 *
 * @module tools/intelligence/router/training/data-collector
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { TrainingExample, DatasetMetadata, HardNegative } from './types.js';
import { getTimeOfDay } from '../../transitions/types.js';

const log = createLogger({ module: 'ftis:data-collector' });

// ============================================================================
// TYPES
// ============================================================================

interface CollectorConfig {
  /** Minimum examples per tool for inclusion */
  minExamplesPerTool: number;
  /** Maximum age of data to collect (days) */
  maxAgeDays: number;
  /** Include failed tool calls */
  includeFailures: boolean;
  /** Anonymize user IDs */
  anonymizeUsers: boolean;
  /** Batch size for Firestore queries */
  batchSize: number;
}

const DEFAULT_CONFIG: CollectorConfig = {
  minExamplesPerTool: 5,
  maxAgeDays: 90,
  includeFailures: true,
  anonymizeUsers: true,
  batchSize: 500,
};

// ============================================================================
// DATA COLLECTOR
// ============================================================================

export class TrainingDataCollector {
  private config: CollectorConfig;
  private db: FirebaseFirestore.Firestore | null = null;
  private examples: TrainingExample[] = [];
  private hardNegatives: HardNegative[] = [];

  constructor(config: Partial<CollectorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // INITIALIZATION
  // ==========================================================================

  /**
   * Initialize with Firestore instance
   */
  async initialize(db: FirebaseFirestore.Firestore): Promise<void> {
    this.db = db;
    log.info('Training data collector initialized');
  }

  // ==========================================================================
  // DATA COLLECTION
  // ==========================================================================

  /**
   * Collect training data from all sources
   */
  async collectAll(): Promise<{
    examples: TrainingExample[];
    hardNegatives: HardNegative[];
    metadata: DatasetMetadata;
  }> {
    this.examples = [];
    this.hardNegatives = [];

    const startTime = Date.now();
    log.info('Starting training data collection');

    // Collect from different sources
    await this.collectFromToolOutcomes();
    await this.collectFromCorrections();
    await this.collectFromRoutingEvents();

    // Deduplicate
    this.deduplicateExamples();

    // Generate hard negatives
    await this.generateHardNegatives();

    // Calculate metadata
    const metadata = this.calculateMetadata();

    log.info(
      {
        exampleCount: this.examples.length,
        hardNegativeCount: this.hardNegatives.length,
        durationMs: Date.now() - startTime,
      },
      'Training data collection complete'
    );

    return {
      examples: this.examples,
      hardNegatives: this.hardNegatives,
      metadata,
    };
  }

  /**
   * Collect from tool_outcomes collection
   */
  private async collectFromToolOutcomes(): Promise<void> {
    if (!this.db) return;

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.config.maxAgeDays);

      const snapshot = await this.db
        .collection('tool_outcomes')
        .where('createdAt', '>=', cutoff)
        .orderBy('createdAt', 'desc')
        .limit(10000)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();

        // Skip failures if configured
        if (!this.config.includeFailures && !data.executionSuccess) {
          continue;
        }

        const example: TrainingExample = {
          id: `outcome_${doc.id}`,
          query: data.query || '',
          personaId: data.personaId || 'ferni',
          emotion: data.emotion || 'neutral',
          timeOfDay: this.getTimeOfDayFromTimestamp(data.createdAt),
          recentTools: data.recentTools || [],
          userAffinities: data.userAffinities || {},
          selectedTools: [data.toolId],
          wasSuccessful: data.executionSuccess === true,
          userSatisfaction: data.userSatisfaction,
          timestamp: data.createdAt?.toDate() || new Date(),
          sessionId: data.sessionId || '',
          userId: this.anonymizeUserId(data.userId || ''),
          source: 'production',
        };

        if (example.query && example.selectedTools.length > 0) {
          this.examples.push(example);
        }
      }

      log.debug({ count: snapshot.size }, 'Collected from tool_outcomes');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to collect from tool_outcomes');
    }
  }

  /**
   * Collect from semantic_router_corrections collection
   */
  private async collectFromCorrections(): Promise<void> {
    if (!this.db) return;

    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - this.config.maxAgeDays);

      const snapshot = await this.db
        .collection('semantic_router_corrections')
        .where('timestamp', '>=', cutoff)
        .orderBy('timestamp', 'desc')
        .limit(5000)
        .get();

      for (const doc of snapshot.docs) {
        const data = doc.data();

        // Create example from corrected tool (the right answer)
        if (data.actualTool) {
          const example: TrainingExample = {
            id: `correction_${doc.id}`,
            query: data.originalQuery || '',
            personaId: data.personaId || 'ferni',
            emotion: 'neutral',
            timeOfDay: this.getTimeOfDayFromTimestamp(data.timestamp),
            recentTools: data.conversationContext || [],
            userAffinities: {},
            selectedTools: [data.actualTool],
            wasSuccessful: true, // Corrections represent ground truth
            timestamp: data.timestamp?.toDate() || new Date(),
            sessionId: data.sessionId || '',
            userId: this.anonymizeUserId(data.userId || ''),
            source: 'correction',
          };

          if (example.query && example.selectedTools.length > 0) {
            this.examples.push(example);
          }

          // Also record as hard negative
          if (data.predictedTool && data.predictedTool !== data.actualTool) {
            this.hardNegatives.push({
              originalId: `correction_${doc.id}`,
              query: data.originalQuery || '',
              wrongTool: data.predictedTool,
              correctTool: data.actualTool,
              toolSimilarity: 0, // Will be computed later
              reason: 'user_correction',
            });
          }
        }
      }

      log.debug({ count: snapshot.size }, 'Collected from corrections');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to collect from corrections');
    }
  }

  /**
   * Collect from routing events
   */
  private async collectFromRoutingEvents(): Promise<void> {
    if (!this.db) return;

    try {
      // Get recent date partitions
      const dates: string[] = [];
      const today = new Date();
      for (let i = 0; i < Math.min(this.config.maxAgeDays, 30); i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
      }

      for (const date of dates) {
        try {
          const snapshot = await this.db
            .collection('semantic_router_events')
            .doc(date)
            .collection('events')
            .where('outcome.toolExecuted', '!=', null)
            .limit(this.config.batchSize)
            .get();

          for (const doc of snapshot.docs) {
            const data = doc.data();

            if (!data.outcome?.toolExecuted) continue;

            const example: TrainingExample = {
              id: `event_${date}_${doc.id}`,
              query: data.inputText || '',
              personaId: data.personaId || 'ferni',
              emotion: 'neutral',
              timeOfDay: this.getTimeOfDayFromTimestamp(data.timestamp),
              recentTools: [],
              userAffinities: {},
              selectedTools: [data.outcome.toolExecuted],
              wasSuccessful: data.outcome.executionSuccess === true,
              timestamp: data.timestamp?.toDate() || new Date(),
              sessionId: data.sessionId || '',
              userId: this.anonymizeUserId(data.userId || ''),
              source: 'production',
            };

            if (example.query && example.selectedTools.length > 0) {
              this.examples.push(example);
            }
          }
        } catch {
          // Date partition might not exist
        }
      }

      log.debug({ dates: dates.length }, 'Collected from routing events');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to collect from routing events');
    }
  }

  // ==========================================================================
  // POST-PROCESSING
  // ==========================================================================

  /**
   * Remove duplicate examples
   */
  private deduplicateExamples(): void {
    const seen = new Map<string, TrainingExample>();

    for (const example of this.examples) {
      // Key by query + selected tools
      const key = `${example.query.toLowerCase().trim()}::${example.selectedTools.sort().join(',')}`;

      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, example);
      } else {
        // Keep the one with more context or higher success
        if (example.wasSuccessful && !existing.wasSuccessful) {
          seen.set(key, example);
        } else if (example.source === 'correction') {
          // Corrections are ground truth
          seen.set(key, example);
        }
      }
    }

    const before = this.examples.length;
    this.examples = Array.from(seen.values());
    log.debug({ before, after: this.examples.length }, 'Deduplicated examples');
  }

  /**
   * Generate additional hard negatives from confusion patterns
   */
  private async generateHardNegatives(): Promise<void> {
    // Group examples by similar queries
    const queryGroups = new Map<string, TrainingExample[]>();

    for (const example of this.examples) {
      const normalizedQuery = example.query.toLowerCase().trim();
      const words = normalizedQuery.split(/\s+/).slice(0, 5).join(' ');

      if (!queryGroups.has(words)) {
        queryGroups.set(words, []);
      }
      queryGroups.get(words)!.push(example);
    }

    // Find groups where same query led to different tools
    for (const [, examples] of queryGroups) {
      if (examples.length < 2) continue;

      const toolCounts = new Map<string, number>();
      for (const ex of examples) {
        for (const tool of ex.selectedTools) {
          toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
        }
      }

      // If multiple tools for same query, it's a confusion point
      if (toolCounts.size >= 2) {
        const tools = Array.from(toolCounts.entries()).sort((a, b) => b[1] - a[1]);
        const primaryTool = tools[0][0];

        for (let i = 1; i < tools.length; i++) {
          const confusedTool = tools[i][0];

          // Find an example with the confused tool
          const confusedExample = examples.find((ex) => ex.selectedTools.includes(confusedTool));

          if (confusedExample && !confusedExample.wasSuccessful) {
            this.hardNegatives.push({
              originalId: confusedExample.id,
              query: confusedExample.query,
              wrongTool: confusedTool,
              correctTool: primaryTool,
              toolSimilarity: 0.5, // Estimated
              reason: 'confusion_pattern',
            });
          }
        }
      }
    }

    log.debug({ hardNegativeCount: this.hardNegatives.length }, 'Generated hard negatives');
  }

  // ==========================================================================
  // METADATA
  // ==========================================================================

  /**
   * Calculate dataset metadata
   */
  private calculateMetadata(): DatasetMetadata {
    const toolCounts = new Map<string, number>();
    const personaCounts = new Map<string, number>();
    let totalQueryLength = 0;
    let totalToolsPerExample = 0;
    let successCount = 0;
    let syntheticCount = 0;

    for (const example of this.examples) {
      // Tool distribution
      for (const tool of example.selectedTools) {
        toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
      }

      // Persona distribution
      personaCounts.set(example.personaId, (personaCounts.get(example.personaId) || 0) + 1);

      // Quality metrics
      totalQueryLength += example.query.length;
      totalToolsPerExample += example.selectedTools.length;
      if (example.wasSuccessful) successCount++;
      if (example.source === 'synthetic') syntheticCount++;
    }

    const labelDistribution: Record<string, number> = {};
    for (const [tool, count] of toolCounts) {
      labelDistribution[tool] = count;
    }

    return {
      version: `1.0.0-${new Date().toISOString().split('T')[0]}`,
      createdAt: new Date(),
      exampleCount: this.examples.length,
      uniqueTools: toolCounts.size,
      uniquePersonas: personaCounts.size,
      labelDistribution,
      qualityMetrics: {
        avgQueryLength: this.examples.length > 0 ? totalQueryLength / this.examples.length : 0,
        avgToolsPerExample:
          this.examples.length > 0 ? totalToolsPerExample / this.examples.length : 0,
        successRate: this.examples.length > 0 ? successCount / this.examples.length : 0,
        syntheticRatio: this.examples.length > 0 ? syntheticCount / this.examples.length : 0,
      },
    };
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Get time of day from Firestore timestamp
   */
  private getTimeOfDayFromTimestamp(
    timestamp: { toDate?: () => Date } | Date | undefined
  ): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (!timestamp) return 'afternoon';

    let date: Date;
    if (timestamp instanceof Date) {
      date = timestamp;
    } else if (
      typeof timestamp === 'object' &&
      'toDate' in timestamp &&
      typeof timestamp.toDate === 'function'
    ) {
      date = timestamp.toDate();
    } else {
      date = new Date();
    }

    return getTimeOfDay(date);
  }

  /**
   * Anonymize user ID
   */
  private anonymizeUserId(userId: string): string {
    if (!this.config.anonymizeUsers || !userId) {
      return userId;
    }

    // Create a hash-based anonymous ID
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      const char = userId.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `anon_${Math.abs(hash).toString(36)}`;
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get collector statistics
   */
  getStats(): {
    exampleCount: number;
    hardNegativeCount: number;
    config: CollectorConfig;
  } {
    return {
      exampleCount: this.examples.length,
      hardNegativeCount: this.hardNegatives.length,
      config: this.config,
    };
  }

  /**
   * Get collected examples
   */
  getExamples(): TrainingExample[] {
    return this.examples;
  }

  /**
   * Get collected hard negatives
   */
  getHardNegatives(): HardNegative[] {
    return this.hardNegatives;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let collectorInstance: TrainingDataCollector | null = null;

export function getTrainingDataCollector(): TrainingDataCollector {
  if (!collectorInstance) {
    collectorInstance = new TrainingDataCollector();
  }
  return collectorInstance;
}

export function resetTrainingDataCollector(): void {
  collectorInstance = null;
}
