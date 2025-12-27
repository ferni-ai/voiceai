/**
 * Brand Evolution Engine
 *
 * Learns from experiments and user feedback to evolve brand rules.
 * Connects A/B test results to brand improvements.
 *
 * @module @ferni/brand/brand-evolution
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { removeUndefined, cleanForFirestore } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getWebExperiments, type WebExperiment } from '../experiments/web-experiments.js';
import { clearBrandContextCache } from './brand-context.js';
import type {
  BrandHealthMetrics,
  BrandRuleChange,
  ExperimentPattern,
  ValidationResult,
} from './types.js';

const log = createLogger({ module: 'BrandEvolution' });

// ============================================================================
// PATTERN EXTRACTION
// ============================================================================

/**
 * Extract learnings from completed experiments
 */
export async function extractBrandLearnings(): Promise<ExperimentPattern[]> {
  const patterns: ExperimentPattern[] = [];

  try {
    const experiments = await getWebExperiments();

    // Filter to completed experiments with winners
    const completed = experiments.filter(
      (exp) =>
        exp.status === 'completed' &&
        exp.winner &&
        exp.winnerConfidence &&
        exp.winnerConfidence >= 90
    );

    if (completed.length < 2) {
      log.info({ completed: completed.length }, 'Not enough completed experiments for analysis');
      return patterns;
    }

    // Analyze what made winners win
    for (const exp of completed) {
      const analysis = analyzeWinningVariant(exp);
      if (analysis) {
        patterns.push(analysis);
      }
    }

    // Find meta-patterns across experiments
    const metaPatterns = findMetaPatterns(patterns);
    patterns.push(...metaPatterns);

    log.info({ patterns: patterns.length }, 'Extracted brand learnings');
    return patterns;
  } catch (error) {
    log.error({ error }, 'Failed to extract brand learnings');
    return patterns;
  }
}

/**
 * Analyze what made a variant win
 */
function analyzeWinningVariant(experiment: WebExperiment): ExperimentPattern | null {
  if (!experiment.winner || !experiment.winnerConfidence) {
    return null;
  }

  const winnerVariant = experiment.variants.find((v) => v.id === experiment.winner);
  const controlVariant = experiment.variants.find((v) => v.id === 'control');

  if (!winnerVariant || !controlVariant || winnerVariant.id === controlVariant.id) {
    return null;
  }

  // Use variant name/description for analysis (content is stored in variant-library)
  const winnerContent = winnerVariant.description || winnerVariant.name || winnerVariant.id;
  const controlContent = controlVariant.description || controlVariant.name || controlVariant.id;

  // Extract features from content
  const winnerFeatures = extractContentFeatures(winnerContent);
  const controlFeatures = extractContentFeatures(controlContent);

  // Find distinguishing features
  const distinguishingFeatures = findDistinguishingFeatures(winnerFeatures, controlFeatures);

  if (distinguishingFeatures.length === 0) {
    return null;
  }

  return {
    pattern: distinguishingFeatures[0],
    confidence: experiment.winnerConfidence / 100,
    experiments: [experiment.id],
    discoveredAt: new Date().toISOString(),
    examples: [winnerContent],
  };
}

/**
 * Extract features from content
 */
function extractContentFeatures(content: string): Record<string, string | number | boolean> {
  const words = content.split(/\s+/);

  return {
    length: content.length,
    wordCount: words.length,
    hasQuestion: content.includes('?'),
    hasExclamation: content.includes('!'),
    hasPeriod: content.includes('.'),
    startsWithYou: content.toLowerCase().startsWith('you'),
    startsWithWhat: content.toLowerCase().startsWith('what'),
    startsWithFinally: content.toLowerCase().startsWith('finally'),
    hasEllipsis: content.includes('...'),
    isShort: words.length <= 5,
    isMedium: words.length > 5 && words.length <= 10,
    isLong: words.length > 10,
    hasEmotionalWord: /feel|heart|love|care|warm/i.test(content),
    hasActionWord: /start|begin|try|do/i.test(content),
    hasComparisonToHuman: /friend|therapist|human|someone/i.test(content),
    firstPerson: /\bwe\b|\bour\b|\bI\b/i.test(content),
    secondPerson: /\byou\b|\byour\b/i.test(content),
  };
}

/**
 * Find features that distinguish winner from control
 */
function findDistinguishingFeatures(
  winner: Record<string, string | number | boolean>,
  control: Record<string, string | number | boolean>
): string[] {
  const features: string[] = [];

  // Check for clear distinctions
  if (winner.isShort && !control.isShort) {
    features.push('Short headlines perform better');
  }
  if (winner.hasQuestion && !control.hasQuestion) {
    features.push('Questions engage more than statements');
  }
  if (winner.startsWithYou && !control.startsWithYou) {
    features.push('Starting with "You" is more personal');
  }
  if (winner.hasComparisonToHuman && !control.hasComparisonToHuman) {
    features.push('Comparing to human support resonates');
  }
  if (winner.hasEmotionalWord && !control.hasEmotionalWord) {
    features.push('Emotional language connects better');
  }
  if (winner.secondPerson && !control.secondPerson) {
    features.push('Second person (you/your) outperforms');
  }

  return features;
}

/**
 * Find patterns that appear across multiple experiments
 */
function findMetaPatterns(patterns: ExperimentPattern[]): ExperimentPattern[] {
  const metaPatterns: ExperimentPattern[] = [];
  const patternCounts: Record<
    string,
    { count: number; experiments: string[]; confidence: number }
  > = {};

  // Count pattern occurrences
  for (const pattern of patterns) {
    if (!patternCounts[pattern.pattern]) {
      patternCounts[pattern.pattern] = { count: 0, experiments: [], confidence: 0 };
    }
    patternCounts[pattern.pattern].count++;
    patternCounts[pattern.pattern].experiments.push(...pattern.experiments);
    patternCounts[pattern.pattern].confidence += pattern.confidence;
  }

  // Create meta-patterns for repeated patterns
  for (const [pattern, data] of Object.entries(patternCounts)) {
    if (data.count >= 2) {
      metaPatterns.push({
        pattern: `[META] ${pattern}`,
        confidence: data.confidence / data.count,
        experiments: data.experiments,
        discoveredAt: new Date().toISOString(),
        examples: [],
      });
    }
  }

  return metaPatterns;
}

// ============================================================================
// BRAND RULE UPDATES
// ============================================================================

/**
 * Update brand rules based on learnings
 */
export async function evolveBrandRules(learnings: ExperimentPattern[]): Promise<BrandRuleChange[]> {
  const changes: BrandRuleChange[] = [];
  const db = getFirestore();

  for (const learning of learnings) {
    // Only apply high-confidence learnings
    if (learning.confidence < 0.9) continue;

    // Don't apply meta-patterns directly (they inform but don't become rules)
    if (learning.pattern.startsWith('[META]')) continue;

    const change: BrandRuleChange = {
      rule: learning.pattern,
      change: 'added',
      source: 'experiment',
      confidence: learning.confidence,
      timestamp: new Date().toISOString(),
      details: `Discovered from experiments: ${learning.experiments.join(', ')}`,
    };

    try {
      // Store the rule change
      await db.collection('brand_rule_changes').add(cleanForFirestore(change));

      // Update winning patterns
      await db
        .collection('brand_learnings')
        .doc('winning_patterns')
        .set(
          cleanForFirestore({
            patterns: FieldValue.arrayUnion(learning),
            updatedAt: FieldValue.serverTimestamp(),
          }),
          { merge: true }
        );

      changes.push(change);
      log.info({ rule: learning.pattern, confidence: learning.confidence }, 'Brand rule evolved');
    } catch (error) {
      log.error({ error, rule: learning.pattern }, 'Failed to evolve brand rule');
    }
  }

  // Clear cache so new rules take effect
  if (changes.length > 0) {
    clearBrandContextCache();
  }

  return changes;
}

/**
 * Record a failed approach
 */
export async function recordFailedApproach(
  approach: string,
  reason: string,
  experimentId: string
): Promise<void> {
  const db = getFirestore();

  try {
    await db
      .collection('brand_learnings')
      .doc('failed_approaches')
      .set(
        cleanForFirestore({
          approaches: FieldValue.arrayUnion({
            approach,
            reason,
            experiments: [experimentId],
            learnedAt: new Date().toISOString(),
          }),
          updatedAt: FieldValue.serverTimestamp(),
        }),
        { merge: true }
      );

    log.info({ approach, reason }, 'Recorded failed approach');
  } catch (error) {
    log.error({ error, approach }, 'Failed to record failed approach');
  }
}

// ============================================================================
// BRAND HEALTH METRICS
// ============================================================================

/**
 * Calculate brand health metrics
 */
export async function calculateBrandHealth(): Promise<BrandHealthMetrics> {
  const db = getFirestore();

  try {
    // Get validation history (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const validationSnap = await db
      .collection('brand_validations')
      .where('timestamp', '>=', thirtyDaysAgo)
      .orderBy('timestamp', 'desc')
      .limit(1000)
      .get();

    const validations = validationSnap.docs.map(
      (d) => d.data() as ValidationResult & { timestamp: Date }
    );

    // Calculate compliance metrics
    const compliantCount = validations.filter((v) => v.isCompliant).length;
    const complianceRate = validations.length > 0 ? compliantCount / validations.length : 1;
    const averageScore =
      validations.length > 0
        ? validations.reduce((sum, v) => sum + v.score, 0) / validations.length
        : 100;

    // Get top violations
    const violationCounts: Record<string, number> = {};
    for (const validation of validations) {
      for (const violation of validation.violations) {
        violationCounts[violation.text] = (violationCounts[violation.text] || 0) + 1;
      }
    }

    const topViolations = Object.entries(violationCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([text]) => {
        const v = validations.find((val) => val.violations.some((viol) => viol.text === text));
        return v?.violations.find((viol) => viol.text === text);
      })
      .filter(Boolean) as BrandHealthMetrics['topViolations'];

    // Get recent learnings
    const learningsSnap = await db.collection('brand_learnings').doc('winning_patterns').get();
    const recentLearnings = (learningsSnap.data()?.patterns as ExperimentPattern[]) || [];

    // Get experiment velocity
    const experiments = await getWebExperiments();
    const recentExperiments = experiments.filter((e) => {
      if (!e.startedAt) return false;
      const started = new Date(e.startedAt);
      return started >= thirtyDaysAgo;
    });
    const experimentVelocity = recentExperiments.length / 4.3; // per week

    return {
      complianceRate,
      averageComplianceScore: averageScore,
      topViolations,
      voiceConsistencyScore: 0.85, // Placeholder - would need voice analysis
      personaDistinctiveness: 0.8, // Placeholder - would need persona analysis
      recentLearnings: recentLearnings.slice(0, 10),
      experimentVelocity,
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    log.error({ error }, 'Failed to calculate brand health');
    return {
      complianceRate: 0,
      averageComplianceScore: 0,
      topViolations: [],
      voiceConsistencyScore: 0,
      personaDistinctiveness: 0,
      recentLearnings: [],
      experimentVelocity: 0,
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Log a validation for metrics tracking
 */
export async function logValidation(
  content: string,
  result: ValidationResult,
  context?: { persona?: string; channel?: string }
): Promise<void> {
  const db = getFirestore();

  try {
    await db.collection('brand_validations').add(
      removeUndefined({
        contentLength: content.length,
        isCompliant: result.isCompliant,
        score: result.score,
        violations: result.violations,
        context,
        timestamp: FieldValue.serverTimestamp(),
      })
    );
  } catch (error) {
    log.warn({ error }, 'Failed to log validation');
  }
}

// ============================================================================
// SCHEDULED TASKS
// ============================================================================

/**
 * Run daily brand evolution analysis
 */
export async function runDailyEvolution(): Promise<{
  learnings: ExperimentPattern[];
  changes: BrandRuleChange[];
}> {
  log.info('Running daily brand evolution');

  // Extract learnings from experiments
  const learnings = await extractBrandLearnings();

  // Evolve brand rules based on learnings
  const changes = await evolveBrandRules(learnings);

  log.info(
    { learnings: learnings.length, changes: changes.length },
    'Daily brand evolution complete'
  );

  return { learnings, changes };
}

/**
 * Get recent rule changes
 */
export async function getRecentRuleChanges(days: number = 30): Promise<BrandRuleChange[]> {
  const db = getFirestore();

  try {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const snap = await db
      .collection('brand_rule_changes')
      .where('timestamp', '>=', since.toISOString())
      .orderBy('timestamp', 'desc')
      .limit(50)
      .get();

    return snap.docs.map((d) => d.data() as BrandRuleChange);
  } catch (error) {
    log.error({ error }, 'Failed to get recent rule changes');
    return [];
  }
}
