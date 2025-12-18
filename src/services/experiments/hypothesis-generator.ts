/**
 * Hypothesis Generator
 *
 * AI-driven analysis of completed experiments to:
 * 1. Identify winning patterns across experiments
 * 2. Generate new hypotheses based on patterns
 * 3. Auto-create draft experiments for testing
 *
 * Better than human: We learn from every experiment.
 *
 * @module services/experiments/hypothesis-generator
 */

import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createLogger } from '../../utils/safe-logger.js';
import { removeUndefined } from '../../utils/firestore-utils.js';
import { quickValidate } from '../brand/index.js';
import { HERO_CTA_VARIANTS, HERO_HEADLINE_VARIANTS } from './variant-library.js';
import { getWebExperiments, type WebExperiment } from './web-experiments.js';

const log = createLogger({ module: 'HypothesisGenerator' });

// ============================================================================
// TYPES
// ============================================================================

export interface ExperimentPattern {
  attribute: string;
  winningValue: string;
  confidence: number;
  sampleSize: number;
  experimentIds: string[];
  discoveredAt: Date;
}

export interface GeneratedHypothesis {
  id: string;
  name: string;
  rationale: string;
  basedOnPatterns: string[];
  variants: Array<{
    id: string;
    name: string;
    weight: number;
    content: unknown;
  }>;
  expectedLift: number;
  confidence: number;
  status: 'draft' | 'approved' | 'rejected' | 'running';
  createdAt: Date;
}

export interface PatternAnalysisResult {
  patterns: ExperimentPattern[];
  hypotheses: GeneratedHypothesis[];
  experimentsAnalyzed: number;
  totalSamples: number;
}

// ============================================================================
// FEATURE EXTRACTION
// ============================================================================

/**
 * Extract features from a headline for pattern analysis
 */
function extractHeadlineFeatures(headline: string): Record<string, string | number | boolean> {
  const words = headline.split(/\s+/);

  return {
    wordCount: words.length,
    length: headline.length,
    isQuestion: headline.includes('?'),
    hasYou: /\byou\b/i.test(headline),
    hasSomeone: /\bsomeone\b/i.test(headline),
    hasWe: /\bwe\b/i.test(headline),
    isImperative: /^[A-Z][a-z]+\s/.test(headline) && !headline.includes('?'),
    hasEmotionalWord: /finally|actually|really|always|never/i.test(headline),
    hasNumber: /\d/.test(headline),
    startsWithAction: /^(start|begin|try|meet|get|find|discover)/i.test(headline),
    tone: detectTone(headline),
    lengthCategory: words.length <= 4 ? 'short' : words.length <= 7 ? 'medium' : 'long',
  };
}

/**
 * Detect emotional tone of text
 */
function detectTone(text: string): 'warm' | 'direct' | 'questioning' | 'bold' {
  if (text.includes('?')) return 'questioning';
  if (/finally|someone|understand|feel/i.test(text)) return 'warm';
  if (/six|brilliant|never|always|better/i.test(text)) return 'bold';
  return 'direct';
}

/**
 * Validate variant content against brand rules
 */
function validateVariantContent(content: unknown): boolean {
  if (!content || typeof content !== 'object') return true;

  const c = content as Record<string, unknown>;
  const textsToCheck: string[] = [];

  // Extract text fields
  if (typeof c.headline === 'string') textsToCheck.push(c.headline);
  if (typeof c.tagline === 'string') textsToCheck.push(c.tagline);
  if (typeof c.text === 'string') textsToCheck.push(c.text);
  if (typeof c.cta === 'string') textsToCheck.push(c.cta);

  // Validate each text
  for (const text of textsToCheck) {
    const result = quickValidate(text);
    if (result.hasBannedContent) {
      log.warn({ text, issues: result.issues }, 'Variant content failed brand validation');
      return false;
    }
  }

  return true;
}

/**
 * Extract features from a CTA
 */
function extractCTAFeatures(cta: {
  text: string;
  style?: string;
}): Record<string, string | number | boolean> {
  const text = cta.text;
  const words = text.split(/\s+/);

  return {
    wordCount: words.length,
    length: text.length,
    hasFree: /free/i.test(text),
    hasAction: /start|begin|try|get|meet/i.test(text),
    hasBrandName: /ferni/i.test(text),
    isPersonal: /your|you/i.test(text),
    style: cta.style || 'primary',
    firstWord: words[0]?.toLowerCase() || '',
  };
}

// ============================================================================
// PATTERN ANALYSIS
// ============================================================================

/**
 * Analyze completed experiments to find winning patterns
 */
export async function analyzeWinningPatterns(): Promise<ExperimentPattern[]> {
  const experiments = await getWebExperiments();

  // Filter to completed experiments with winners
  const completed = experiments.filter(
    (exp) =>
      exp.status === 'completed' && exp.winner && exp.winnerConfidence && exp.winnerConfidence >= 95
  );

  if (completed.length < 2) {
    log.info(
      { completed: completed.length },
      'Not enough completed experiments for pattern analysis'
    );
    return [];
  }

  const patterns: ExperimentPattern[] = [];

  // Analyze headline patterns
  const headlineExperiments = completed.filter((e) => e.id.includes('headline'));
  if (headlineExperiments.length >= 2) {
    const headlinePatterns = analyzeHeadlinePatterns(headlineExperiments);
    patterns.push(...headlinePatterns);
  }

  // Analyze CTA patterns
  const ctaExperiments = completed.filter((e) => e.id.includes('cta'));
  if (ctaExperiments.length >= 2) {
    const ctaPatterns = analyzeCTAPatterns(ctaExperiments);
    patterns.push(...ctaPatterns);
  }

  log.info({ patternCount: patterns.length }, 'Pattern analysis complete');

  return patterns;
}

/**
 * Analyze headline experiment patterns
 */
function analyzeHeadlinePatterns(experiments: WebExperiment[]): ExperimentPattern[] {
  const patterns: ExperimentPattern[] = [];
  const featureWins: Record<string, Array<{ value: unknown; experimentId: string }>> = {};

  for (const exp of experiments) {
    const winnerId = exp.winner;
    if (!winnerId) continue;

    // Get winning variant content
    const winningContent = HERO_HEADLINE_VARIANTS[winnerId as keyof typeof HERO_HEADLINE_VARIANTS];
    if (!winningContent) continue;

    const features = extractHeadlineFeatures(winningContent.headline);

    // Track feature wins
    for (const [feature, value] of Object.entries(features)) {
      if (!featureWins[feature]) {
        featureWins[feature] = [];
      }
      featureWins[feature].push({ value, experimentId: exp.id });
    }
  }

  // Find consistent patterns (same value wins in majority of experiments)
  for (const [feature, wins] of Object.entries(featureWins)) {
    if (wins.length < 2) continue;

    // Count value occurrences
    const valueCounts: Record<string, string[]> = {};
    for (const win of wins) {
      const key = String(win.value);
      if (!valueCounts[key]) {
        valueCounts[key] = [];
      }
      valueCounts[key].push(win.experimentId);
    }

    // Find dominant value
    const entries = Object.entries(valueCounts);
    const sorted = entries.sort((a, b) => b[1].length - a[1].length);
    const [topValue, topExperiments] = sorted[0];

    // Only create pattern if it wins > 60% of experiments
    const winRate = topExperiments.length / wins.length;
    if (winRate >= 0.6 && topExperiments.length >= 2) {
      patterns.push({
        attribute: `headline.${feature}`,
        winningValue: topValue,
        confidence: winRate,
        sampleSize: wins.length,
        experimentIds: topExperiments,
        discoveredAt: new Date(),
      });
    }
  }

  return patterns;
}

/**
 * Analyze CTA experiment patterns
 */
function analyzeCTAPatterns(experiments: WebExperiment[]): ExperimentPattern[] {
  const patterns: ExperimentPattern[] = [];
  const featureWins: Record<string, Array<{ value: unknown; experimentId: string }>> = {};

  for (const exp of experiments) {
    const winnerId = exp.winner;
    if (!winnerId) continue;

    const winningContent = HERO_CTA_VARIANTS[winnerId as keyof typeof HERO_CTA_VARIANTS];
    if (!winningContent) continue;

    const features = extractCTAFeatures(winningContent);

    for (const [feature, value] of Object.entries(features)) {
      if (!featureWins[feature]) {
        featureWins[feature] = [];
      }
      featureWins[feature].push({ value, experimentId: exp.id });
    }
  }

  // Find patterns
  for (const [feature, wins] of Object.entries(featureWins)) {
    if (wins.length < 2) continue;

    const valueCounts: Record<string, string[]> = {};
    for (const win of wins) {
      const key = String(win.value);
      if (!valueCounts[key]) {
        valueCounts[key] = [];
      }
      valueCounts[key].push(win.experimentId);
    }

    const entries = Object.entries(valueCounts);
    const sorted = entries.sort((a, b) => b[1].length - a[1].length);
    const [topValue, topExperiments] = sorted[0];

    const winRate = topExperiments.length / wins.length;
    if (winRate >= 0.6 && topExperiments.length >= 2) {
      patterns.push({
        attribute: `cta.${feature}`,
        winningValue: topValue,
        confidence: winRate,
        sampleSize: wins.length,
        experimentIds: topExperiments,
        discoveredAt: new Date(),
      });
    }
  }

  return patterns;
}

// ============================================================================
// HYPOTHESIS GENERATION
// ============================================================================

/**
 * Generate new experiment hypotheses based on patterns
 */
export async function generateHypotheses(
  patterns: ExperimentPattern[]
): Promise<GeneratedHypothesis[]> {
  const hypotheses: GeneratedHypothesis[] = [];

  if (patterns.length === 0) {
    log.info('No patterns to generate hypotheses from');
    return hypotheses;
  }

  // Group patterns by type
  const headlinePatterns = patterns.filter((p) => p.attribute.startsWith('headline.'));
  const ctaPatterns = patterns.filter((p) => p.attribute.startsWith('cta.'));

  // Generate headline hypotheses
  if (headlinePatterns.length > 0) {
    const headlineHypothesis = generateHeadlineHypothesis(headlinePatterns);
    if (headlineHypothesis) {
      hypotheses.push(headlineHypothesis);
    }
  }

  // Generate CTA hypotheses
  if (ctaPatterns.length > 0) {
    const ctaHypothesis = generateCTAHypothesis(ctaPatterns);
    if (ctaHypothesis) {
      hypotheses.push(ctaHypothesis);
    }
  }

  log.info({ hypothesisCount: hypotheses.length }, 'Hypotheses generated');

  return hypotheses;
}

/**
 * Generate a headline experiment hypothesis
 */
function generateHeadlineHypothesis(patterns: ExperimentPattern[]): GeneratedHypothesis | null {
  // Find the most confident pattern
  const topPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];
  if (!topPattern) return null;

  const id = `headline-${topPattern.attribute.split('.')[1]}-${Date.now()}`;

  // Generate variants based on the pattern
  const variants = generateHeadlineVariants(topPattern);

  return {
    id,
    name: `Headline ${topPattern.attribute.split('.')[1]} Optimization`,
    rationale: `Pattern detected: ${topPattern.attribute} = "${topPattern.winningValue}" wins in ${(topPattern.confidence * 100).toFixed(0)}% of experiments (n=${topPattern.sampleSize}). Testing variations that amplify this pattern.`,
    basedOnPatterns: [topPattern.attribute],
    variants,
    expectedLift: estimateLift(topPattern),
    confidence: topPattern.confidence,
    status: 'draft',
    createdAt: new Date(),
  };
}

/**
 * Generate headline variants based on a pattern
 */
function generateHeadlineVariants(pattern: ExperimentPattern): GeneratedHypothesis['variants'] {
  const variants: GeneratedHypothesis['variants'] = [];

  // Control is always the current winner
  variants.push({
    id: 'control',
    name: 'Current Winner',
    weight: 50,
    content: { ...HERO_HEADLINE_VARIANTS.control },
  });

  // Generate variants based on pattern type
  const patternType = pattern.attribute.replace('headline.', '');

  switch (patternType) {
    case 'lengthCategory':
      if (pattern.winningValue === 'short') {
        variants.push({
          id: 'ultra_short',
          name: 'Ultra Short (3 words)',
          weight: 25,
          content: {
            tagline: 'Better than human.',
            headline: 'Someone finally gets it.',
          },
        });
        variants.push({
          id: 'minimal',
          name: 'Minimal (4 words)',
          weight: 25,
          content: {
            tagline: 'Your AI life coach.',
            headline: 'They actually understand you.',
          },
        });
      }
      break;

    case 'isQuestion':
      if (pattern.winningValue === 'true') {
        variants.push({
          id: 'deeper_question',
          name: 'Deeper Question',
          weight: 25,
          content: {
            tagline: 'Better than human.',
            headline: 'When did you last feel truly heard?',
          },
        });
        variants.push({
          id: 'provocative_question',
          name: 'Provocative Question',
          weight: 25,
          content: {
            tagline: 'Beyond human limitations.',
            headline: 'What would change if someone remembered everything?',
          },
        });
      }
      break;

    case 'tone':
      if (pattern.winningValue === 'warm') {
        variants.push({
          id: 'warmer',
          name: 'Even Warmer',
          weight: 25,
          content: {
            tagline: 'Finally, someone who cares.',
            headline: 'You deserve to be understood.',
          },
        });
        variants.push({
          id: 'intimate',
          name: 'Intimate',
          weight: 25,
          content: {
            tagline: "We're here for you.",
            headline: "Let's talk. Really talk.",
          },
        });
      }
      break;

    default:
      // Generic variants
      variants.push({
        id: 'variation_a',
        name: 'Variation A',
        weight: 25,
        content: {
          tagline: 'Better than human.',
          headline: 'The support you deserve.',
        },
      });
      variants.push({
        id: 'variation_b',
        name: 'Variation B',
        weight: 25,
        content: {
          tagline: 'Always here.',
          headline: 'Real understanding. Real support.',
        },
      });
  }

  // Filter out variants that fail brand validation
  return variants.filter((v) => validateVariantContent(v.content));
}

/**
 * Generate a CTA experiment hypothesis
 */
function generateCTAHypothesis(patterns: ExperimentPattern[]): GeneratedHypothesis | null {
  const topPattern = patterns.sort((a, b) => b.confidence - a.confidence)[0];
  if (!topPattern) return null;

  const id = `cta-${topPattern.attribute.split('.')[1]}-${Date.now()}`;

  const variants: GeneratedHypothesis['variants'] = [
    {
      id: 'control',
      name: 'Current Winner',
      weight: 34,
      content: { ...HERO_CTA_VARIANTS.control },
    },
  ];

  // Generate variants based on pattern
  const patternType = topPattern.attribute.replace('cta.', '');

  if (patternType === 'hasAction' && topPattern.winningValue === 'true') {
    variants.push({
      id: 'stronger_action',
      name: 'Stronger Action',
      weight: 33,
      content: { text: 'Start Now', style: 'primary', icon: 'arrow' },
    });
    variants.push({
      id: 'urgent_action',
      name: 'Urgent Action',
      weight: 33,
      content: { text: 'Begin Today', style: 'primary', icon: 'arrow' },
    });
  } else {
    variants.push({
      id: 'variation_a',
      name: 'Variation A',
      weight: 33,
      content: { text: 'Get Started', style: 'primary', icon: 'arrow' },
    });
    variants.push({
      id: 'variation_b',
      name: 'Variation B',
      weight: 33,
      content: { text: 'Try Free', style: 'primary', icon: 'arrow' },
    });
  }

  return {
    id,
    name: `CTA ${topPattern.attribute.split('.')[1]} Optimization`,
    rationale: `Pattern: ${topPattern.attribute} = "${topPattern.winningValue}" wins ${(topPattern.confidence * 100).toFixed(0)}% of the time.`,
    basedOnPatterns: [topPattern.attribute],
    variants,
    expectedLift: estimateLift(topPattern),
    confidence: topPattern.confidence,
    status: 'draft',
    createdAt: new Date(),
  };
}

/**
 * Estimate expected lift for a hypothesis
 */
function estimateLift(pattern: ExperimentPattern): number {
  // Conservative estimate: higher confidence = higher expected lift
  // But diminishing returns as we optimize further
  const baseEstimate = 3; // 3% base
  const confidenceBonus = (pattern.confidence - 0.6) * 10; // Up to 4% more
  const sampleBonus = Math.min(pattern.sampleSize / 10, 2); // Up to 2% for sample size

  return Math.round((baseEstimate + confidenceBonus + sampleBonus) * 10) / 10;
}

// ============================================================================
// PERSISTENCE
// ============================================================================

/**
 * Save a generated hypothesis to Firestore
 */
export async function saveHypothesis(hypothesis: GeneratedHypothesis): Promise<void> {
  const db = getFirestore();

  await db
    .collection('generated_hypotheses')
    .doc(hypothesis.id)
    .set(
      removeUndefined({
        ...hypothesis,
        createdAt: FieldValue.serverTimestamp(),
      })
    );

  log.info({ hypothesisId: hypothesis.id }, 'Hypothesis saved');
}

/**
 * Get all generated hypotheses
 */
export async function getHypotheses(
  status?: GeneratedHypothesis['status']
): Promise<GeneratedHypothesis[]> {
  const db = getFirestore();

  let query = db.collection('generated_hypotheses').orderBy('createdAt', 'desc');

  if (status) {
    query = query.where('status', '==', status) as typeof query;
  }

  const snapshot = await query.limit(50).get();

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
    createdAt: doc.data().createdAt?.toDate() || new Date(),
  })) as GeneratedHypothesis[];
}

/**
 * Update hypothesis status
 */
export async function updateHypothesisStatus(
  hypothesisId: string,
  status: GeneratedHypothesis['status']
): Promise<void> {
  const db = getFirestore();

  await db.collection('generated_hypotheses').doc(hypothesisId).update({
    status,
    updatedAt: FieldValue.serverTimestamp(),
  });

  log.info({ hypothesisId, status }, 'Hypothesis status updated');
}

/**
 * Save discovered patterns
 */
export async function savePatterns(patterns: ExperimentPattern[]): Promise<void> {
  const db = getFirestore();
  const batch = db.batch();

  for (const pattern of patterns) {
    const id = `${pattern.attribute}-${pattern.winningValue}`.replace(/\./g, '-');
    const ref = db.collection('experiment_patterns').doc(id);

    batch.set(
      ref,
      removeUndefined({
        ...pattern,
        discoveredAt: FieldValue.serverTimestamp(),
      })
    );
  }

  await batch.commit();
  log.info({ patternCount: patterns.length }, 'Patterns saved');
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

/**
 * Run full pattern analysis and hypothesis generation
 */
export async function runAnalysis(): Promise<PatternAnalysisResult> {
  log.info('Starting pattern analysis');

  // 1. Analyze patterns
  const patterns = await analyzeWinningPatterns();

  // 2. Save patterns
  if (patterns.length > 0) {
    await savePatterns(patterns);
  }

  // 3. Generate hypotheses
  const hypotheses = await generateHypotheses(patterns);

  // 4. Save hypotheses
  for (const hypothesis of hypotheses) {
    await saveHypothesis(hypothesis);
  }

  const experiments = await getWebExperiments();
  const completedExperiments = experiments.filter((e) => e.status === 'completed');

  return {
    patterns,
    hypotheses,
    experimentsAnalyzed: completedExperiments.length,
    totalSamples: 0, // Would need to sum from experiments
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  analyzeWinningPatterns,
  generateHypotheses,
  saveHypothesis,
  getHypotheses,
  updateHypothesisStatus,
  savePatterns,
  runAnalysis,
};
