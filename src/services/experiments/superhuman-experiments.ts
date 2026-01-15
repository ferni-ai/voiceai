/**
 * Superhuman Experiments Orchestrator
 *
 * The main entry point for the "Better than Human" A/B testing system.
 * Coordinates all 5 superhuman capabilities:
 *
 * 1. Thompson Sampling - Dynamic traffic allocation
 * 2. Contextual Selection - Personalized variant selection
 * 3. Cross-Experiment Learning - Transfer learning across experiments
 * 4. Semantic Routing - Intelligent experiment discovery
 * 5. Auto-Graduation - Automatic winner detection and promotion
 *
 * @module experiments/superhuman-experiments
 */

import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb } from '../superhuman/firestore-utils.js';
import {
  thompsonSample,
  detectWinner,
  createArm,
  recordConversion,
  getExpectedRate,
  type BanditArm,
  type BanditSelection,
  type WinnerDetection,
} from './bandit-algorithm.js';
import {
  selectContextualVariant,
  extractContextFromRequest,
  mergeContexts,
  PREDEFINED_MODIFIERS,
  type UserContext,
  type ContextualVariant,
  type ContextualVariantSelection,
} from './contextual-selector.js';
import {
  findAllCorrelations,
  generateTransferPriors,
  detectMetaPatterns,
  buildUserProfile,
  serializeLearningState,
  type ExperimentOutcome,
  type CrossExperimentLearningState,
} from './cross-experiment-learning.js';
import {
  routeByTags,
  routeByIntent,
  checkEligibility,
  createExperimentMetadata,
  type ExperimentMetadata,
  type RoutingContext,
  type RoutingDecision,
} from './semantic-router.js';

const log = createLogger({ module: 'superhuman-experiments' });

// ============================================================================
// Types
// ============================================================================

export interface Experiment {
  id: string;
  name: string;
  description?: string;
  variants: ExperimentVariant[];
  metadata: ExperimentMetadata;
  banditState: BanditState;
  settings: ExperimentSettings;
  createdAt: number;
  updatedAt: number;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  description?: string;
  config: Record<string, unknown>;
  contextConditions?: Array<{
    field: string;
    operator: string;
    value: unknown;
    weightModifier: number;
  }>;
}

export interface BanditState {
  arms: BanditArm[];
  totalPulls: number;
  lastWinnerCheck: number;
  winnerDetection?: WinnerDetection;
}

export interface ExperimentSettings {
  algorithm: 'thompson' | 'epsilon-greedy' | 'contextual' | 'hybrid';
  epsilon?: number; // For epsilon-greedy
  confidenceThreshold: number; // For winner detection (default 0.95)
  minimumSamples: number; // Before considering graduation (default 100)
  maxDurationDays: number; // Auto-stop after this many days
  enableTransferLearning: boolean;
  enableContextual: boolean;
  autoGraduate: boolean; // Automatically graduate winners
}

export interface EnrollmentResult {
  experimentId: string;
  variantId: string;
  variant: ExperimentVariant;
  selection: BanditSelection | ContextualVariantSelection;
  isNew: boolean; // First time this user sees this experiment
  source: 'thompson' | 'contextual' | 'hybrid' | 'sticky';
}

export interface ConversionResult {
  experimentId: string;
  variantId: string;
  success: boolean;
  winnerCheck?: WinnerDetection;
  graduated?: boolean;
}

// ============================================================================
// Firestore Collections
// ============================================================================

const COLLECTION_EXPERIMENTS = 'superhuman_experiments';
const COLLECTION_ENROLLMENTS = 'superhuman_enrollments';
const COLLECTION_OUTCOMES = 'superhuman_outcomes';
const COLLECTION_LEARNING = 'superhuman_learning';

// ============================================================================
// Experiment Management
// ============================================================================

/**
 * Create a new experiment
 */
export async function createExperiment(
  experiment: Omit<Experiment, 'createdAt' | 'updatedAt' | 'banditState'>
): Promise<Experiment> {
  const db = getFirestoreDb();

  // Initialize bandit state
  const banditState: BanditState = {
    arms: experiment.variants.map((v) => createArm(v.id)),
    totalPulls: 0,
    lastWinnerCheck: 0,
  };

  const fullExperiment: Experiment = {
    ...experiment,
    banditState,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (db) {
    await db.collection(COLLECTION_EXPERIMENTS).doc(experiment.id).set(fullExperiment);
  }

  log.info(
    { experimentId: experiment.id, variantCount: experiment.variants.length },
    'Created experiment'
  );

  return fullExperiment;
}

/**
 * Get an experiment by ID
 */
export async function getExperiment(experimentId: string): Promise<Experiment | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  const doc = await db.collection(COLLECTION_EXPERIMENTS).doc(experimentId).get();
  if (!doc.exists) return null;

  return doc.data() as Experiment;
}

/**
 * List all active experiments
 */
export async function listExperiments(
  status?: ExperimentMetadata['status']
): Promise<Experiment[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  let query = db.collection(COLLECTION_EXPERIMENTS);
  if (status) {
    query = query.where('metadata.status', '==', status) as FirebaseFirestore.CollectionReference;
  }

  const snapshot = await query.get();
  return snapshot.docs.map((doc: FirebaseFirestore.DocumentSnapshot) => doc.data() as Experiment);
}

/**
 * Update experiment metadata
 */
export async function updateExperimentMetadata(
  experimentId: string,
  updates: Partial<ExperimentMetadata>
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db
    .collection(COLLECTION_EXPERIMENTS)
    .doc(experimentId)
    .update({
      ...Object.fromEntries(Object.entries(updates).map(([k, v]) => [`metadata.${k}`, v])),
      updatedAt: Date.now(),
    });

  log.info({ experimentId, updates: Object.keys(updates) }, 'Updated experiment metadata');
}

// ============================================================================
// Variant Selection (The Core "Superhuman" Logic)
// ============================================================================

/**
 * Enroll a user in an experiment and select a variant
 *
 * This is where the magic happens - combining Thompson Sampling,
 * contextual selection, and transfer learning.
 */
export async function enrollUser(
  experimentId: string,
  userId: string,
  context: UserContext = {}
): Promise<EnrollmentResult | null> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) {
    log.warn({ experimentId }, 'Experiment not found');
    return null;
  }

  // Check eligibility
  const routingContext: RoutingContext = {
    ...context,
    userId,
    userSegments: context.attributes?.segments as string[] | undefined,
  };

  const eligibility = checkEligibility(experiment.metadata, routingContext);
  if (!eligibility.eligible) {
    log.debug({ experimentId, userId, reason: eligibility.reason }, 'User not eligible');
    return null;
  }

  // Check for existing enrollment (sticky assignment)
  const existingEnrollment = await getEnrollment(experimentId, userId);
  if (existingEnrollment) {
    const variant = experiment.variants.find((v) => v.id === existingEnrollment.variantId);
    if (variant) {
      return {
        experimentId,
        variantId: existingEnrollment.variantId,
        variant,
        selection: {
          armId: existingEnrollment.variantId,
          confidence: 1,
          isExploration: false,
          expectedRate: getExpectedRate(
            experiment.banditState.arms.find((a) => a.id === existingEnrollment.variantId) ||
              createArm(existingEnrollment.variantId)
          ),
        },
        isNew: false,
        source: 'sticky',
      };
    }
  }

  // Select variant based on algorithm
  let selection: BanditSelection | ContextualVariantSelection;
  let source: EnrollmentResult['source'];

  if (experiment.settings.algorithm === 'contextual' || experiment.settings.enableContextual) {
    // Contextual selection with Thompson Sampling as base weights
    const contextualVariants: ContextualVariant[] = experiment.variants.map((v) => ({
      id: v.id,
      baseWeight:
        getExpectedRate(experiment.banditState.arms.find((a) => a.id === v.id) || createArm(v.id)) *
        100,
      contextConditions: v.contextConditions as ContextualVariant['contextConditions'],
    }));

    selection = selectContextualVariant(contextualVariants, context, PREDEFINED_MODIFIERS);
    source = experiment.settings.algorithm === 'hybrid' ? 'hybrid' : 'contextual';
  } else {
    // Pure Thompson Sampling
    selection = thompsonSample(experiment.banditState.arms);
    source = 'thompson';
  }

  // Extract variant ID from selection (BanditSelection uses armId, ContextualVariantSelection uses variantId)
  const selectedVariantId = 'armId' in selection ? selection.armId : selection.variantId;

  const selectedVariant = experiment.variants.find((v) => v.id === selectedVariantId);
  if (!selectedVariant) {
    log.error({ experimentId, variantId: selectedVariantId }, 'Selected variant not found');
    return null;
  }

  // Save enrollment
  await saveEnrollment(experimentId, userId, selectedVariantId);

  // Update bandit state (increment exposures)
  await updateBanditExposure(experimentId, selectedVariantId);

  log.info(
    {
      experimentId,
      userId: userId.substring(0, 8) + '...',
      variantId: selectedVariantId,
      source,
      confidence: 'confidence' in selection ? selection.confidence.toFixed(3) : undefined,
    },
    'User enrolled in experiment'
  );

  return {
    experimentId,
    variantId: selectedVariantId,
    variant: selectedVariant,
    selection,
    isNew: true,
    source,
  };
}

/**
 * Record a conversion (success or failure) for an enrollment
 */
export async function recordUserConversion(
  experimentId: string,
  userId: string,
  success: boolean
): Promise<ConversionResult | null> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) return null;

  const enrollment = await getEnrollment(experimentId, userId);
  if (!enrollment) {
    log.warn({ experimentId, userId }, 'No enrollment found for conversion');
    return null;
  }

  // Update bandit state
  const updatedArms = experiment.banditState.arms.map((arm) => {
    if (arm.id === enrollment.variantId) {
      return recordConversion(arm, success);
    }
    return arm;
  });

  // Save outcome for learning
  await saveOutcome({
    experimentId,
    variantId: enrollment.variantId,
    userId,
    success,
    timestamp: Date.now(),
  });

  // Check for winner periodically
  let winnerCheck: WinnerDetection | undefined;
  let graduated = false;

  const timeSinceLastCheck = Date.now() - experiment.banditState.lastWinnerCheck;
  const shouldCheckWinner = timeSinceLastCheck > 60 * 60 * 1000; // Every hour

  if (
    shouldCheckWinner &&
    experiment.banditState.totalPulls >= experiment.settings.minimumSamples
  ) {
    winnerCheck = detectWinner(
      updatedArms,
      experiment.settings.confidenceThreshold,
      experiment.settings.minimumSamples
    );

    // Auto-graduate if enabled
    if (
      experiment.settings.autoGraduate &&
      winnerCheck.hasWinner &&
      winnerCheck.recommendation === 'graduate'
    ) {
      await graduateExperiment(experimentId, winnerCheck.winnerId!);
      graduated = true;
    }
  }

  // Update Firestore
  const db = getFirestoreDb();
  if (db) {
    await db
      .collection(COLLECTION_EXPERIMENTS)
      .doc(experimentId)
      .update({
        'banditState.arms': updatedArms,
        'banditState.totalPulls': experiment.banditState.totalPulls + 1,
        'banditState.lastWinnerCheck': shouldCheckWinner
          ? Date.now()
          : experiment.banditState.lastWinnerCheck,
        'banditState.winnerDetection': winnerCheck || experiment.banditState.winnerDetection,
        updatedAt: Date.now(),
      });
  }

  return {
    experimentId,
    variantId: enrollment.variantId,
    success,
    winnerCheck,
    graduated,
  };
}

// ============================================================================
// Enrollment Persistence
// ============================================================================

interface Enrollment {
  experimentId: string;
  userId: string;
  variantId: string;
  enrolledAt: number;
}

async function getEnrollment(experimentId: string, userId: string): Promise<Enrollment | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  const doc = await db.collection(COLLECTION_ENROLLMENTS).doc(`${experimentId}:${userId}`).get();

  if (!doc.exists) return null;
  return doc.data() as Enrollment;
}

async function saveEnrollment(
  experimentId: string,
  userId: string,
  variantId: string
): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db.collection(COLLECTION_ENROLLMENTS).doc(`${experimentId}:${userId}`).set({
    experimentId,
    userId,
    variantId,
    enrolledAt: Date.now(),
  });
}

async function updateBanditExposure(experimentId: string, variantId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  // Use transaction for atomic update
  await db.runTransaction(async (transaction: FirebaseFirestore.Transaction) => {
    const ref = db.collection(COLLECTION_EXPERIMENTS).doc(experimentId);
    const doc = await transaction.get(ref);
    if (!doc.exists) return;

    const experiment = doc.data() as Experiment;
    const updatedArms = experiment.banditState.arms.map((arm) => {
      if (arm.id === variantId) {
        return { ...arm, exposures: arm.exposures + 1 };
      }
      return arm;
    });

    transaction.update(ref, {
      'banditState.arms': updatedArms,
      'banditState.totalPulls': experiment.banditState.totalPulls + 1,
      updatedAt: Date.now(),
    });
  });
}

async function saveOutcome(outcome: ExperimentOutcome): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db.collection(COLLECTION_OUTCOMES).add(outcome);
}

// ============================================================================
// Graduation and Lifecycle
// ============================================================================

/**
 * Graduate an experiment - promote the winner
 */
export async function graduateExperiment(experimentId: string, winnerId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db.collection(COLLECTION_EXPERIMENTS).doc(experimentId).update({
    'metadata.status': 'graduated',
    'metadata.winnerId': winnerId,
    updatedAt: Date.now(),
  });

  log.info({ experimentId, winnerId }, 'Experiment graduated');
}

/**
 * Stop an experiment (no clear winner)
 */
export async function stopExperiment(experimentId: string): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  await db.collection(COLLECTION_EXPERIMENTS).doc(experimentId).update({
    'metadata.status': 'stopped',
    updatedAt: Date.now(),
  });

  log.info({ experimentId }, 'Experiment stopped');
}

/**
 * Pause an experiment (temporarily)
 */
export async function pauseExperiment(experimentId: string): Promise<void> {
  await updateExperimentMetadata(experimentId, { status: 'paused' });
  log.info({ experimentId }, 'Experiment paused');
}

/**
 * Resume a paused experiment
 */
export async function resumeExperiment(experimentId: string): Promise<void> {
  await updateExperimentMetadata(experimentId, { status: 'running' });
  log.info({ experimentId }, 'Experiment resumed');
}

// ============================================================================
// Semantic Routing Integration
// ============================================================================

/**
 * Find experiments relevant to a set of tags
 */
export async function findExperimentsByTags(
  tags: string[],
  context: RoutingContext
): Promise<RoutingDecision> {
  const experiments = await listExperiments('running');
  return routeByTags(
    tags,
    experiments.map((e) => e.metadata),
    context
  );
}

/**
 * Find experiments by intent
 */
export async function findExperimentsByIntent(
  intent: string,
  context: RoutingContext
): Promise<RoutingDecision> {
  const experiments = await listExperiments('running');
  return routeByIntent(
    intent,
    experiments.map((e) => e.metadata),
    context
  );
}

// ============================================================================
// Cross-Experiment Learning Integration
// ============================================================================

/**
 * Update cross-experiment learning state
 */
export async function updateLearningState(): Promise<CrossExperimentLearningState> {
  const db = getFirestoreDb();

  // Get all outcomes
  const outcomes: ExperimentOutcome[] = [];
  if (db) {
    const snapshot = await db.collection(COLLECTION_OUTCOMES).get();
    snapshot.forEach((doc: FirebaseFirestore.DocumentSnapshot) =>
      outcomes.push(doc.data() as ExperimentOutcome)
    );
  }

  // Get experiment IDs
  const experiments = await listExperiments();
  const experimentIds = experiments.map((e) => e.id);

  // Find correlations
  const correlations = findAllCorrelations(experimentIds, outcomes);

  // Build user profiles and detect patterns
  const userIds = [...new Set(outcomes.map((o) => o.userId))];
  const profiles = userIds.map((userId) => buildUserProfile(userId, outcomes));
  const metaPatterns = detectMetaPatterns(profiles);

  // Serialize and save
  const learningState = serializeLearningState(correlations, metaPatterns);

  if (db) {
    await db.collection(COLLECTION_LEARNING).doc('global').set(learningState);
  }

  log.info(
    {
      correlationCount: correlations.length,
      patternCount: metaPatterns.length,
    },
    'Updated cross-experiment learning state'
  );

  return learningState;
}

/**
 * Get transfer learning priors for a new experiment
 */
export async function getTransferPriors(
  experimentId: string,
  variantIds: string[]
): Promise<ReturnType<typeof generateTransferPriors>> {
  const db = getFirestoreDb();
  if (!db) return [];

  // Get learning state
  const doc = await db.collection(COLLECTION_LEARNING).doc('global').get();
  if (!doc.exists) return [];

  const learningState = doc.data() as CrossExperimentLearningState;

  // Get historical outcomes
  const snapshot = await db.collection(COLLECTION_OUTCOMES).get();
  const outcomes: ExperimentOutcome[] = [];
  snapshot.forEach((doc: FirebaseFirestore.DocumentSnapshot) =>
    outcomes.push(doc.data() as ExperimentOutcome)
  );

  // Generate priors
  return generateTransferPriors(experimentId, variantIds, learningState.correlations, outcomes);
}

// ============================================================================
// Statistics and Analytics
// ============================================================================

export interface ExperimentStats {
  experimentId: string;
  totalEnrollments: number;
  totalConversions: number;
  overallConversionRate: number;
  variantStats: Array<{
    variantId: string;
    enrollments: number;
    conversions: number;
    conversionRate: number;
    credibleInterval: { lower: number; upper: number };
  }>;
  winnerDetection?: WinnerDetection;
  recommendation: string;
}

/**
 * Get detailed statistics for an experiment
 */
export async function getExperimentStats(experimentId: string): Promise<ExperimentStats | null> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) return null;

  const totalEnrollments = experiment.banditState.totalPulls;
  let totalConversions = 0;

  const variantStats = experiment.banditState.arms.map((arm) => {
    const conversions = arm.successes;
    totalConversions += conversions;
    const enrollments = arm.exposures;
    const rate = enrollments > 0 ? conversions / enrollments : 0;

    // Simple credible interval (95%)
    const alpha = arm.successes + 1;
    const beta = arm.failures + 1;
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const std = Math.sqrt(variance);

    return {
      variantId: arm.id,
      enrollments,
      conversions,
      conversionRate: rate,
      credibleInterval: {
        lower: Math.max(0, mean - 1.96 * std),
        upper: Math.min(1, mean + 1.96 * std),
      },
    };
  });

  // Generate recommendation
  let recommendation: string;
  const winnerDetection = experiment.banditState.winnerDetection;

  if (!winnerDetection) {
    recommendation = 'Continue collecting data';
  } else if (winnerDetection.hasWinner) {
    recommendation = `Graduate ${winnerDetection.winnerId} with ${(winnerDetection.confidence * 100).toFixed(1)}% confidence`;
  } else if (winnerDetection.recommendation === 'stop') {
    recommendation = 'Consider stopping - no clear winner emerging';
  } else {
    recommendation = `Continue - current leader confidence is ${(winnerDetection.confidence * 100).toFixed(1)}%`;
  }

  return {
    experimentId,
    totalEnrollments,
    totalConversions,
    overallConversionRate: totalEnrollments > 0 ? totalConversions / totalEnrollments : 0,
    variantStats,
    winnerDetection,
    recommendation,
  };
}

// ============================================================================
// Quick Setup Helpers
// ============================================================================

/**
 * Create a simple A/B test experiment
 */
export async function createSimpleABTest(
  id: string,
  name: string,
  variantA: { name: string; config: Record<string, unknown> },
  variantB: { name: string; config: Record<string, unknown> },
  tags: string[] = []
): Promise<Experiment> {
  return createExperiment({
    id,
    name,
    variants: [
      { id: 'control', name: variantA.name, config: variantA.config },
      { id: 'treatment', name: variantB.name, config: variantB.config },
    ],
    metadata: createExperimentMetadata({
      id,
      name,
      tags: ['ab-test', ...tags],
      status: 'running',
    }),
    settings: {
      algorithm: 'thompson',
      confidenceThreshold: 0.95,
      minimumSamples: 100,
      maxDurationDays: 30,
      enableTransferLearning: true,
      enableContextual: false,
      autoGraduate: true,
    },
  });
}

/**
 * Create a multi-variant experiment
 */
export async function createMultiVariantTest(
  id: string,
  name: string,
  variants: Array<{ id: string; name: string; config: Record<string, unknown> }>,
  options: Partial<ExperimentSettings> = {}
): Promise<Experiment> {
  return createExperiment({
    id,
    name,
    variants: variants.map((v) => ({ ...v, description: '' })),
    metadata: createExperimentMetadata({
      id,
      name,
      tags: ['multi-variant'],
      status: 'running',
    }),
    settings: {
      algorithm: 'thompson',
      confidenceThreshold: 0.95,
      minimumSamples: 100,
      maxDurationDays: 30,
      enableTransferLearning: true,
      enableContextual: false,
      autoGraduate: true,
      ...options,
    },
  });
}

export default {
  // Experiment management
  createExperiment,
  getExperiment,
  listExperiments,
  updateExperimentMetadata,

  // Enrollment and conversion
  enrollUser,
  recordUserConversion,

  // Lifecycle
  graduateExperiment,
  stopExperiment,
  pauseExperiment,
  resumeExperiment,

  // Routing
  findExperimentsByTags,
  findExperimentsByIntent,

  // Learning
  updateLearningState,
  getTransferPriors,

  // Analytics
  getExperimentStats,

  // Quick setup
  createSimpleABTest,
  createMultiVariantTest,
};
