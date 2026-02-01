/**
 * Insight Validator
 *
 * Validates that cross-persona insights are created as expected.
 */

import { getInsightsPath } from '../context-factory.js';
import type {
  InsightExpectation,
  InsightValidationResult,
  InsightSummary,
  E2ETestContext,
} from '../types.js';

// ============================================================================
// Insight Validation
// ============================================================================

/**
 * Validate that expected insights were created.
 */
export async function validateInsight(
  ctx: E2ETestContext,
  expectation?: InsightExpectation
): Promise<InsightValidationResult> {
  const errors: string[] = [];
  const insights: InsightSummary[] = [];
  let found = false;

  try {
    // Get insights from Firestore
    const insightsPath = getInsightsPath(ctx.userId);
    const docRef = ctx.firestore.doc(insightsPath);
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data() as { insights?: InsightData[] } | undefined;
      const rawInsights = data?.insights || [];

      // Filter out expired insights
      const now = Date.now();
      const validInsights = rawInsights.filter((i) => !i.expiresAt || i.expiresAt > now);

      found = validInsights.length > 0;

      // Convert to summaries
      for (const insight of validInsights) {
        insights.push({
          id: insight.id,
          category: insight.category || 'unknown',
          source: insight.source || 'system',
          target: insight.target || 'all',
          priority: insight.priority || 'normal',
          content: insight.content || '',
          createdAt: insight.createdAt || now,
        });
      }
    }

    // If no expectation provided, just check that insights exist
    if (!expectation) {
      return {
        found,
        passed: true, // No expectation = always pass
        insights,
        errors: [],
      };
    }

    // Validate against expectation
    if (expectation.anyInsight) {
      if (!found) {
        errors.push('Expected at least one insight to be created, but none found');
      }
    } else {
      // Look for specific insight matching criteria
      const matchingInsight = insights.find((i) => matchesExpectation(i, expectation));

      if (!matchingInsight) {
        const criteria: string[] = [];
        if (expectation.category) criteria.push(`category="${expectation.category}"`);
        if (expectation.source) criteria.push(`source="${expectation.source}"`);
        if (expectation.target) criteria.push(`target="${expectation.target}"`);
        if (expectation.priority) criteria.push(`priority="${expectation.priority}"`);

        errors.push(
          `Expected insight matching [${criteria.join(', ')}] not found. ` +
            `Found ${insights.length} insights: ${insights.map((i) => i.category).join(', ') || 'none'}`
        );
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    errors.push(`Error validating insights: ${errorMessage}`);
    ctx.log.error('Insight validation error', { error: errorMessage });
  }

  return {
    found,
    passed: errors.length === 0,
    insights,
    errors,
  };
}

/**
 * Check if an insight matches the expectation criteria.
 */
function matchesExpectation(insight: InsightSummary, expectation: InsightExpectation): boolean {
  if (expectation.category && insight.category !== expectation.category) {
    return false;
  }
  if (expectation.source && insight.source !== expectation.source) {
    return false;
  }
  if (expectation.target && insight.target !== expectation.target) {
    return false;
  }
  if (expectation.priority && insight.priority !== expectation.priority) {
    return false;
  }
  return true;
}

// ============================================================================
// Insight Data Type (internal)
// ============================================================================

interface InsightData {
  id: string;
  category?: string;
  source?: string;
  target?: string;
  priority?: string;
  content?: string;
  createdAt?: number;
  expiresAt?: number;
}

// ============================================================================
// Insight Assertions
// ============================================================================

/**
 * Assert that at least one insight was created.
 */
export async function assertInsightCreated(
  ctx: E2ETestContext,
  message?: string
): Promise<{ passed: boolean; error?: string }> {
  const result = await validateInsight(ctx, { anyInsight: true });

  if (!result.found) {
    return {
      passed: false,
      error: message || 'Expected at least one insight to be created',
    };
  }

  return { passed: true };
}

/**
 * Assert that an insight with specific category was created.
 */
export async function assertInsightWithCategory(
  ctx: E2ETestContext,
  category: string,
  message?: string
): Promise<{ passed: boolean; error?: string }> {
  const result = await validateInsight(ctx, { category });

  if (!result.passed) {
    return {
      passed: false,
      error: message || `Expected insight with category "${category}" to be created`,
    };
  }

  return { passed: true };
}

/**
 * Assert that NO insights were created.
 */
export async function assertNoInsights(
  ctx: E2ETestContext,
  message?: string
): Promise<{ passed: boolean; error?: string }> {
  const result = await validateInsight(ctx);

  if (result.found) {
    return {
      passed: false,
      error:
        message ||
        `Expected no insights, but found ${result.insights.length}: ${result.insights.map((i) => i.category).join(', ')}`,
    };
  }

  return { passed: true };
}

// ============================================================================
// Insight Queries
// ============================================================================

/**
 * Get all insights for the test user.
 */
export async function getInsights(ctx: E2ETestContext): Promise<InsightSummary[]> {
  const result = await validateInsight(ctx);
  return result.insights;
}

/**
 * Get insights by category.
 */
export async function getInsightsByCategory(
  ctx: E2ETestContext,
  category: string
): Promise<InsightSummary[]> {
  const all = await getInsights(ctx);
  return all.filter((i) => i.category === category);
}

/**
 * Get insights by source persona.
 */
export async function getInsightsBySource(
  ctx: E2ETestContext,
  source: string
): Promise<InsightSummary[]> {
  const all = await getInsights(ctx);
  return all.filter((i) => i.source === source);
}

/**
 * Count insights matching criteria.
 */
export async function countInsights(
  ctx: E2ETestContext,
  criteria?: Partial<InsightExpectation>
): Promise<number> {
  const all = await getInsights(ctx);

  if (!criteria) {
    return all.length;
  }

  return all.filter((i) => {
    if (criteria.category && i.category !== criteria.category) return false;
    if (criteria.source && i.source !== criteria.source) return false;
    if (criteria.target && i.target !== criteria.target) return false;
    if (criteria.priority && i.priority !== criteria.priority) return false;
    return true;
  }).length;
}
