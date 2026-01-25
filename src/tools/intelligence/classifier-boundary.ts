/**
 * FTIS Decision Boundary Checker
 *
 * Implements ROIC-style open intent detection by checking if query embeddings
 * fall within the decision boundaries of known tool categories.
 *
 * Queries outside boundaries are classified as "open intent" and should be
 * passed to the LLM rather than routed to tools.
 *
 * @module tools/intelligence/classifier-boundary
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ftis-boundary' });

// ============================================================================
// TYPES
// ============================================================================

export interface BoundaryStats {
  mean_distance: number;
  std_distance: number;
  min_distance?: number;
  max_distance?: number;
  num_samples: number;
}

export interface CategoryBoundary {
  centroid: number[];
  radius: number;
  percentile: number;
  superCategory?: string;
  stats: BoundaryStats;
}

export interface GlobalBoundary {
  centroid: number[];
  radius: number;
  description: string;
  num_classes_combined: number;
}

export interface DecisionBoundaries {
  version: string;
  model: string;
  percentile: number;
  stage1: Record<string, CategoryBoundary>;
  stage2: Record<string, Record<string, CategoryBoundary>>;
  global: GlobalBoundary;
}

export interface BoundaryCheckResult {
  /** Whether the query is within the class boundary */
  withinBoundary: boolean;
  /** Distance from query to class centroid */
  distance: number;
  /** Decision radius for the class */
  radius: number;
  /** How far inside/outside the boundary (negative = outside) */
  margin: number;
  /** Confidence adjustment factor based on boundary position */
  boundaryConfidence: number;
}

export interface OpenIntentResult {
  /** Whether the query should be classified as open intent */
  isOpenIntent: boolean;
  /** Reason for the classification */
  reason: 'within_boundary' | 'outside_class' | 'outside_global' | 'no_boundary_data';
  /** The boundary check result if available */
  boundaryCheck?: BoundaryCheckResult;
  /** Distance to global boundary if checked */
  globalDistance?: number;
}

// ============================================================================
// DECISION BOUNDARY CHECKER
// ============================================================================

export class FTISDecisionBoundary {
  private boundaries: DecisionBoundaries | null = null;
  private initialized = false;
  private boundariesPath: string;

  constructor(modelsDir?: string) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const defaultModelsDir = path.join(__dirname, '../../../models/ftis-merged');
    this.boundariesPath = path.join(modelsDir || defaultModelsDir, 'decision_boundaries.json');
  }

  /**
   * Initialize by loading decision boundaries from file
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;

    try {
      const data = await fs.readFile(this.boundariesPath, 'utf-8');
      this.boundaries = JSON.parse(data) as DecisionBoundaries;
      this.initialized = true;
      log.info(
        {
          version: this.boundaries.version,
          stage1Categories: Object.keys(this.boundaries.stage1).length,
          stage2Categories: Object.values(this.boundaries.stage2).reduce(
            (sum, cat) => sum + Object.keys(cat).length,
            0
          ),
        },
        '✅ Decision boundaries loaded'
      );
      return true;
    } catch (error) {
      log.warn(
        { error: String(error), path: this.boundariesPath },
        'Decision boundaries not found - open intent detection disabled'
      );
      return false;
    }
  }

  /**
   * Check if decision boundaries are available
   */
  isReady(): boolean {
    return this.initialized && this.boundaries !== null;
  }

  /**
   * Compute cosine distance between two vectors (1 - cosine similarity)
   */
  private cosineDistance(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      log.warn({ aLen: a.length, bLen: b.length }, 'Vector dimension mismatch');
      return 1.0; // Maximum distance for mismatched vectors
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) return 1.0;

    const similarity = dotProduct / denominator;
    return 1.0 - similarity;
  }

  /**
   * Check if a query embedding is within the boundary of a Stage 1 category
   */
  checkStage1Boundary(embedding: number[], superCategory: string): BoundaryCheckResult | null {
    if (!this.boundaries) return null;

    const boundary = this.boundaries.stage1[superCategory];
    if (!boundary) {
      log.debug({ superCategory }, 'No Stage 1 boundary found');
      return null;
    }

    return this.checkBoundary(embedding, boundary);
  }

  /**
   * Check if a query embedding is within the boundary of a Stage 2 category
   */
  checkStage2Boundary(
    embedding: number[],
    superCategory: string,
    fineCategory: string
  ): BoundaryCheckResult | null {
    if (!this.boundaries) return null;

    const superBoundaries = this.boundaries.stage2[superCategory];
    if (!superBoundaries) {
      log.debug({ superCategory }, 'No Stage 2 super-category found');
      return null;
    }

    const boundary = superBoundaries[fineCategory];
    if (!boundary) {
      log.debug({ superCategory, fineCategory }, 'No Stage 2 fine-category boundary found');
      return null;
    }

    return this.checkBoundary(embedding, boundary);
  }

  /**
   * Check if a query embedding is within the global boundary (all tool categories)
   */
  checkGlobalBoundary(embedding: number[]): BoundaryCheckResult | null {
    if (!this.boundaries?.global) return null;

    const { centroid, radius } = this.boundaries.global;
    const distance = this.cosineDistance(embedding, centroid);
    const margin = radius - distance;
    const withinBoundary = margin >= 0;

    // Compute confidence adjustment based on how far inside/outside the boundary
    // Inside boundary: confidence = 1.0 at center, decreasing to 0.5 at edge
    // Outside boundary: confidence decreases further
    let boundaryConfidence: number;
    if (withinBoundary) {
      // Map [0, radius] to [1.0, 0.5]
      boundaryConfidence = 1.0 - (distance / radius) * 0.5;
    } else {
      // Map [radius, 2*radius] to [0.5, 0.0]
      boundaryConfidence = Math.max(0, 0.5 - ((distance - radius) / radius) * 0.5);
    }

    return {
      withinBoundary,
      distance,
      radius,
      margin,
      boundaryConfidence,
    };
  }

  /**
   * Internal helper to check against a single boundary
   */
  private checkBoundary(embedding: number[], boundary: CategoryBoundary): BoundaryCheckResult {
    const distance = this.cosineDistance(embedding, boundary.centroid);
    const margin = boundary.radius - distance;
    const withinBoundary = margin >= 0;

    // Compute confidence adjustment
    let boundaryConfidence: number;
    if (withinBoundary) {
      // Inside: high confidence that this is the right class
      // Use ratio of distance to radius (closer to center = higher confidence)
      const normalizedPosition = distance / boundary.radius;
      boundaryConfidence = 1.0 - normalizedPosition * 0.3; // Range: [0.7, 1.0]
    } else {
      // Outside: confidence drops based on how far outside
      const outsideRatio = (distance - boundary.radius) / boundary.radius;
      boundaryConfidence = Math.max(0, 0.7 - outsideRatio * 0.5); // Range: [0.0, 0.7]
    }

    return {
      withinBoundary,
      distance,
      radius: boundary.radius,
      margin,
      boundaryConfidence,
    };
  }

  /**
   * Full open intent check - combines class and global boundary checks
   *
   * @param embedding - Query embedding (384-dim from MiniLM)
   * @param predictedSuperCategory - Stage 1 predicted category
   * @param predictedFineCategory - Stage 2 predicted category
   * @returns Open intent result indicating whether to pass to LLM
   */
  checkOpenIntent(
    embedding: number[],
    predictedSuperCategory: string,
    predictedFineCategory: string
  ): OpenIntentResult {
    if (!this.boundaries) {
      return {
        isOpenIntent: false,
        reason: 'no_boundary_data',
      };
    }

    // First check: Is the query within the fine category boundary?
    const fineCheck = this.checkStage2Boundary(
      embedding,
      predictedSuperCategory,
      predictedFineCategory
    );

    if (fineCheck) {
      if (fineCheck.withinBoundary) {
        // Query is within the predicted class boundary - likely correct
        return {
          isOpenIntent: false,
          reason: 'within_boundary',
          boundaryCheck: fineCheck,
        };
      } else {
        // Query is outside the predicted class boundary
        // This suggests misclassification - should go to LLM
        log.debug(
          {
            superCategory: predictedSuperCategory,
            fineCategory: predictedFineCategory,
            distance: fineCheck.distance.toFixed(4),
            radius: fineCheck.radius.toFixed(4),
            margin: fineCheck.margin.toFixed(4),
          },
          '⚠️ Query outside class boundary'
        );

        return {
          isOpenIntent: true,
          reason: 'outside_class',
          boundaryCheck: fineCheck,
        };
      }
    }

    // Fallback: Check global boundary if fine category check wasn't available
    const globalCheck = this.checkGlobalBoundary(embedding);

    if (globalCheck) {
      if (globalCheck.withinBoundary) {
        // Within global boundary but no specific class match
        // This is ambiguous - let classifier confidence decide
        return {
          isOpenIntent: false,
          reason: 'within_boundary',
          boundaryCheck: globalCheck,
          globalDistance: globalCheck.distance,
        };
      } else {
        // Outside ALL tool boundaries - definitely conversation/open intent
        log.debug(
          {
            globalDistance: globalCheck.distance.toFixed(4),
            globalRadius: globalCheck.radius.toFixed(4),
          },
          '🔄 Query outside global boundary - passing to LLM'
        );

        return {
          isOpenIntent: true,
          reason: 'outside_global',
          boundaryCheck: globalCheck,
          globalDistance: globalCheck.distance,
        };
      }
    }

    // No boundary data available
    return {
      isOpenIntent: false,
      reason: 'no_boundary_data',
    };
  }

  /**
   * Get adjusted confidence score based on boundary position
   *
   * @param originalConfidence - Original classifier confidence
   * @param embedding - Query embedding
   * @param superCategory - Predicted super category
   * @param fineCategory - Predicted fine category
   * @returns Adjusted confidence (lowered if near/outside boundary)
   */
  getAdjustedConfidence(
    originalConfidence: number,
    embedding: number[],
    superCategory: string,
    fineCategory: string
  ): number {
    const check = this.checkStage2Boundary(embedding, superCategory, fineCategory);

    if (!check) {
      // No boundary data - return original confidence
      return originalConfidence;
    }

    // Multiply original confidence by boundary confidence
    // This lowers confidence for queries near or outside boundaries
    const adjusted = originalConfidence * check.boundaryConfidence;

    log.debug(
      {
        original: originalConfidence.toFixed(3),
        boundaryConf: check.boundaryConfidence.toFixed(3),
        adjusted: adjusted.toFixed(3),
        withinBoundary: check.withinBoundary,
      },
      '🎯 Confidence adjustment'
    );

    return adjusted;
  }

  /**
   * Get boundary statistics for a category
   */
  getCategoryStats(superCategory: string, fineCategory?: string): BoundaryStats | null {
    if (!this.boundaries) return null;

    if (fineCategory) {
      const boundary = this.boundaries.stage2[superCategory]?.[fineCategory];
      return boundary?.stats || null;
    } else {
      const boundary = this.boundaries.stage1[superCategory];
      return boundary?.stats || null;
    }
  }

  /**
   * Get all available categories with boundaries
   */
  getAvailableCategories(): { stage1: string[]; stage2: Record<string, string[]> } {
    if (!this.boundaries) {
      return { stage1: [], stage2: {} };
    }

    const stage1 = Object.keys(this.boundaries.stage1);
    const stage2: Record<string, string[]> = {};

    for (const [superCat, boundaries] of Object.entries(this.boundaries.stage2)) {
      stage2[superCat] = Object.keys(boundaries);
    }

    return { stage1, stage2 };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let boundaryInstance: FTISDecisionBoundary | null = null;

export function getFTISDecisionBoundary(): FTISDecisionBoundary {
  if (!boundaryInstance) {
    boundaryInstance = new FTISDecisionBoundary();
  }
  return boundaryInstance;
}

export async function initializeFTISDecisionBoundary(
  modelsDir?: string
): Promise<FTISDecisionBoundary> {
  if (!boundaryInstance) {
    boundaryInstance = new FTISDecisionBoundary(modelsDir);
  }
  await boundaryInstance.initialize();
  return boundaryInstance;
}

export function resetFTISDecisionBoundary(): void {
  boundaryInstance = null;
}
