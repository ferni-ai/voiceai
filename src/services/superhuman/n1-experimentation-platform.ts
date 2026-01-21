/**
 * N=1 Experimentation Platform - Better Than Human Service
 *
 * What no human friend can do: Design rigorous personal experiments,
 * control for confounds, analyze results with statistical precision,
 * and build a personalized evidence base for life decisions.
 *
 * Research Foundation:
 * - Single-subject experimental design (SSED)
 * - A-B-A reversal designs
 * - Multiple baseline designs
 * - Randomized N-of-1 trials
 * - Self-tracking and quantified self methodology
 *
 * @module services/superhuman/n1-experimentation-platform
 */

import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore, getFirestoreDb } from './firestore-utils.js';

const log = createLogger({ module: 'n1-experimentation-platform' });

// ============================================================================
// TYPES
// ============================================================================

export type ExperimentDesign =
  | 'ab' // Simple before/after
  | 'aba' // Reversal design (baseline → intervention → baseline)
  | 'abab' // Multiple reversal
  | 'multiple_baseline' // Staggered across behaviors/contexts
  | 'alternating_treatments' // Compare two interventions
  | 'randomized_n1'; // Random assignment to intervention/control periods

export type ExperimentStatus =
  | 'designing'
  | 'baseline'
  | 'active'
  | 'washout' // Between phases
  | 'analyzing'
  | 'completed'
  | 'abandoned';

export type MeasurementType =
  | 'frequency' // Count of occurrences
  | 'duration' // Time spent
  | 'intensity' // Subjective scale
  | 'latency' // Time until occurrence
  | 'binary' // Yes/no
  | 'continuous'; // Numeric measure

export interface ExperimentVariable {
  name: string;
  type: 'independent' | 'dependent' | 'control' | 'covariate';
  measurementType: MeasurementType;
  unit: string;

  // For dependent variables
  targetDirection?: 'increase' | 'decrease' | 'stabilize';
  minimumDetectableEffect?: number; // What change would be meaningful?

  // For tracking
  trackingMethod: 'self_report' | 'automatic' | 'hybrid';
  trackingFrequency: 'continuous' | 'daily' | 'weekly';
}

export interface ExperimentPhase {
  name: string;
  type: 'baseline' | 'intervention' | 'washout';
  plannedDays: number;
  actualDays?: number;
  startDate?: string;
  endDate?: string;

  // Intervention details (if intervention phase)
  intervention?: {
    description: string;
    frequency: string;
    adherenceTarget: number; // 0-100%
  };
}

export interface DataPoint {
  timestamp: number;
  variableName: string;
  value: number;
  phase: string;
  notes?: string;
  confoundingFactors?: string[];
}

export interface ExperimentDesignSpec {
  id: string;
  userId: string;

  // Metadata
  title: string;
  hypothesis: string;
  startDate?: string;
  status: ExperimentStatus;

  // Design
  designType: ExperimentDesign;
  variables: ExperimentVariable[];
  phases: ExperimentPhase[];

  // Quality
  potentialConfounds: string[];
  controlStrategies: string[];
  blindingPossible: boolean;

  // Analysis plan
  primaryOutcome: string;
  analysisMethod: string;

  createdAt: number;
  updatedAt: number;
}

export interface ExperimentResults {
  experimentId: string;

  // Data
  dataPoints: DataPoint[];

  // Phase statistics
  phaseStats: Array<{
    phaseName: string;
    variable: string;
    mean: number;
    standardDeviation: number;
    median: number;
    min: number;
    max: number;
    n: number;
  }>;

  // Effect analysis
  effectAnalysis: {
    primaryOutcome: string;
    baselineMean: number;
    interventionMean: number;
    absoluteChange: number;
    percentChange: number;
    effectSize: number; // Cohen's d
    effectSizeInterpretation: 'negligible' | 'small' | 'medium' | 'large';
    confidence: 'low' | 'moderate' | 'high';
    confoundsPresent: string[];
  };

  // Conclusions
  conclusion: {
    supported: boolean;
    confidence: number;
    narrative: string;
    limitations: string[];
    recommendations: string[];
  };

  analyzedAt: number;
}

export interface ExperimentationProfile {
  userId: string;

  // Experiment history
  experiments: ExperimentDesignSpec[];
  results: ExperimentResults[];

  // Personal evidence base
  evidenceBase: Array<{
    domain: string;
    findings: Array<{
      intervention: string;
      effectOnOutcome: string;
      effectSize: number;
      confidence: string;
      experimentId: string;
    }>;
  }>;

  // Experiment preferences
  preferences: {
    preferredDuration: number; // days
    measurementTolerancee: 'minimal' | 'moderate' | 'intensive';
    openToReversal: boolean;
  };

  updatedAt: number;
}

// ============================================================================
// EXPERIMENT DESIGN
// ============================================================================

/**
 * Design a personalized experiment based on the user's question.
 */
export function designExperiment(params: {
  userId: string;
  question: string;
  intervention: string;
  outcome: string;
  context: {
    availableTrackingMethods: string[];
    timeConstraints: 'minimal' | 'moderate' | 'flexible';
    previousExperiments?: ExperimentDesignSpec[];
  };
}): ExperimentDesignSpec {
  const { userId, question, intervention, outcome, context } = params;

  // Determine best design type
  const designType = selectDesignType(context);

  // Generate hypothesis
  const hypothesis = generateHypothesis(intervention, outcome);

  // Define variables
  const variables = defineVariables(intervention, outcome, context.availableTrackingMethods);

  // Design phases
  const phases = designPhases(designType, context.timeConstraints);

  // Identify confounds
  const confounds = identifyPotentialConfounds(intervention, outcome);
  const controlStrategies = generateControlStrategies(confounds);

  return {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId,
    title: question,
    hypothesis,
    status: 'designing',
    designType,
    variables,
    phases,
    potentialConfounds: confounds,
    controlStrategies,
    blindingPossible: false, // Most self-experiments can't be blinded
    primaryOutcome: outcome,
    analysisMethod:
      designType === 'randomized_n1' ? 'Randomization test' : 'Visual analysis with effect size',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function selectDesignType(context: {
  timeConstraints: 'minimal' | 'moderate' | 'flexible';
  previousExperiments?: ExperimentDesignSpec[];
}): ExperimentDesign {
  // If tight on time, use simple A-B
  if (context.timeConstraints === 'minimal') {
    return 'ab';
  }

  // If moderate time, use A-B-A reversal for stronger evidence
  if (context.timeConstraints === 'moderate') {
    return 'aba';
  }

  // If flexible, consider randomized design for strongest evidence
  return 'randomized_n1';
}

function generateHypothesis(intervention: string, outcome: string): string {
  return `Implementing "${intervention}" will lead to measurable changes in "${outcome}" compared to baseline conditions.`;
}

function defineVariables(
  intervention: string,
  outcome: string,
  availableMethods: string[]
): ExperimentVariable[] {
  const variables: ExperimentVariable[] = [];

  // Independent variable (the intervention)
  variables.push({
    name: intervention,
    type: 'independent',
    measurementType: 'binary',
    unit: 'present/absent',
    trackingMethod: 'self_report',
    trackingFrequency: 'daily',
  });

  // Dependent variable (the outcome)
  variables.push({
    name: outcome,
    type: 'dependent',
    measurementType: 'intensity', // Default to scale
    unit: 'scale 1-10',
    targetDirection: 'increase', // Default assumption
    minimumDetectableEffect: 1.5, // 1.5 points on 10-point scale
    trackingMethod: availableMethods.includes('automatic') ? 'automatic' : 'self_report',
    trackingFrequency: 'daily',
  });

  // Common covariates
  variables.push({
    name: 'sleep_quality',
    type: 'covariate',
    measurementType: 'intensity',
    unit: 'scale 1-10',
    trackingMethod: 'self_report',
    trackingFrequency: 'daily',
  });

  variables.push({
    name: 'stress_level',
    type: 'covariate',
    measurementType: 'intensity',
    unit: 'scale 1-10',
    trackingMethod: 'self_report',
    trackingFrequency: 'daily',
  });

  return variables;
}

function designPhases(
  designType: ExperimentDesign,
  timeConstraints: 'minimal' | 'moderate' | 'flexible'
): ExperimentPhase[] {
  const phases: ExperimentPhase[] = [];

  const baseDuration = timeConstraints === 'minimal' ? 7 : timeConstraints === 'moderate' ? 14 : 21;

  switch (designType) {
    case 'ab':
      phases.push(
        { name: 'A1_baseline', type: 'baseline', plannedDays: baseDuration },
        {
          name: 'B1_intervention',
          type: 'intervention',
          plannedDays: baseDuration,
          intervention: {
            description: 'Apply intervention daily',
            frequency: 'daily',
            adherenceTarget: 80,
          },
        }
      );
      break;

    case 'aba':
      phases.push(
        { name: 'A1_baseline', type: 'baseline', plannedDays: baseDuration },
        {
          name: 'B1_intervention',
          type: 'intervention',
          plannedDays: baseDuration,
          intervention: {
            description: 'Apply intervention daily',
            frequency: 'daily',
            adherenceTarget: 80,
          },
        },
        { name: 'A2_reversal', type: 'baseline', plannedDays: baseDuration }
      );
      break;

    case 'abab':
      phases.push(
        { name: 'A1_baseline', type: 'baseline', plannedDays: Math.floor(baseDuration * 0.75) },
        {
          name: 'B1_intervention',
          type: 'intervention',
          plannedDays: Math.floor(baseDuration * 0.75),
          intervention: {
            description: 'Apply intervention daily',
            frequency: 'daily',
            adherenceTarget: 80,
          },
        },
        { name: 'A2_reversal', type: 'baseline', plannedDays: Math.floor(baseDuration * 0.75) },
        {
          name: 'B2_reintroduction',
          type: 'intervention',
          plannedDays: Math.floor(baseDuration * 0.75),
          intervention: {
            description: 'Reintroduce intervention',
            frequency: 'daily',
            adherenceTarget: 80,
          },
        }
      );
      break;

    case 'randomized_n1':
      // 20 days total, randomly assigned to intervention or control
      for (let i = 1; i <= 20; i++) {
        const isIntervention = Math.random() > 0.5;
        phases.push({
          name: `Day${i}_${isIntervention ? 'intervention' : 'control'}`,
          type: isIntervention ? 'intervention' : 'baseline',
          plannedDays: 1,
          ...(isIntervention && {
            intervention: {
              description: 'Apply intervention',
              frequency: 'once',
              adherenceTarget: 100,
            },
          }),
        });
      }
      break;

    default:
      phases.push(
        { name: 'A1_baseline', type: 'baseline', plannedDays: baseDuration },
        {
          name: 'B1_intervention',
          type: 'intervention',
          plannedDays: baseDuration,
          intervention: {
            description: 'Apply intervention daily',
            frequency: 'daily',
            adherenceTarget: 80,
          },
        }
      );
  }

  return phases;
}

function identifyPotentialConfounds(intervention: string, outcome: string): string[] {
  // Common confounds in personal experiments
  const confounds = [
    'Sleep quality variation',
    'Stress from external sources',
    'Seasonal/weather effects',
    'Social interactions',
    'Expectation effects (placebo)',
    'Measurement reactivity (behavior changes from tracking)',
    'Day of week effects',
  ];

  // Add context-specific confounds
  if (outcome.toLowerCase().includes('energy') || outcome.toLowerCase().includes('mood')) {
    confounds.push('Caffeine intake');
    confounds.push('Exercise variation');
    confounds.push('Diet changes');
  }

  if (outcome.toLowerCase().includes('productivity') || outcome.toLowerCase().includes('focus')) {
    confounds.push('Workload variation');
    confounds.push('Interruption frequency');
    confounds.push('Meeting density');
  }

  return confounds;
}

function generateControlStrategies(confounds: string[]): string[] {
  return confounds.map((confound) => {
    switch (confound) {
      case 'Sleep quality variation':
        return 'Track sleep nightly as covariate; maintain consistent sleep schedule';
      case 'Stress from external sources':
        return 'Track daily stress level; note major stressors in journal';
      case 'Expectation effects (placebo)':
        return 'Cannot be fully controlled; acknowledge in analysis';
      case 'Measurement reactivity':
        return 'Allow adaptation period before baseline measurement';
      case 'Day of week effects':
        return 'Include weekday as covariate; ensure phases include full weeks';
      default:
        return `Track ${confound} as potential confound`;
    }
  });
}

// ============================================================================
// DATA ANALYSIS
// ============================================================================

/**
 * Analyze experiment results.
 */
export function analyzeExperiment(
  experiment: ExperimentDesignSpec,
  dataPoints: DataPoint[]
): ExperimentResults {
  const experimentId = experiment.id;

  // Calculate phase statistics
  const phaseStats = calculatePhaseStats(experiment, dataPoints);

  // Calculate effect
  const effectAnalysis = calculateEffect(experiment, phaseStats);

  // Generate conclusions
  const conclusion = generateConclusions(experiment, effectAnalysis);

  return {
    experimentId,
    dataPoints,
    phaseStats,
    effectAnalysis,
    conclusion,
    analyzedAt: Date.now(),
  };
}

function calculatePhaseStats(
  experiment: ExperimentDesignSpec,
  dataPoints: DataPoint[]
): ExperimentResults['phaseStats'] {
  const stats: ExperimentResults['phaseStats'] = [];

  const dependentVars = experiment.variables.filter((v) => v.type === 'dependent');

  for (const phase of experiment.phases) {
    const phaseData = dataPoints.filter((dp) => dp.phase === phase.name);

    for (const variable of dependentVars) {
      const values = phaseData
        .filter((dp) => dp.variableName === variable.name)
        .map((dp) => dp.value);

      if (values.length === 0) continue;

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const sortedValues = [...values].sort((a, b) => a - b);
      const median = sortedValues[Math.floor(sortedValues.length / 2)];
      const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
      const standardDeviation = Math.sqrt(variance);

      stats.push({
        phaseName: phase.name,
        variable: variable.name,
        mean,
        standardDeviation,
        median,
        min: Math.min(...values),
        max: Math.max(...values),
        n: values.length,
      });
    }
  }

  return stats;
}

function calculateEffect(
  experiment: ExperimentDesignSpec,
  phaseStats: ExperimentResults['phaseStats']
): ExperimentResults['effectAnalysis'] {
  const primaryOutcome = experiment.primaryOutcome;

  // Get baseline and intervention stats for primary outcome
  const baselineStats = phaseStats.find(
    (s) => s.variable === primaryOutcome && s.phaseName.includes('baseline')
  );
  const interventionStats = phaseStats.find(
    (s) => s.variable === primaryOutcome && s.phaseName.includes('intervention')
  );

  if (!baselineStats || !interventionStats) {
    return {
      primaryOutcome,
      baselineMean: 0,
      interventionMean: 0,
      absoluteChange: 0,
      percentChange: 0,
      effectSize: 0,
      effectSizeInterpretation: 'negligible',
      confidence: 'low',
      confoundsPresent: [],
    };
  }

  const absoluteChange = interventionStats.mean - baselineStats.mean;
  const percentChange = baselineStats.mean !== 0 ? (absoluteChange / baselineStats.mean) * 100 : 0;

  // Cohen's d (standardized effect size)
  const pooledSD = Math.sqrt(
    (Math.pow(baselineStats.standardDeviation, 2) +
      Math.pow(interventionStats.standardDeviation, 2)) /
      2
  );
  const effectSize = pooledSD !== 0 ? absoluteChange / pooledSD : 0;

  // Interpret effect size
  let effectSizeInterpretation: ExperimentResults['effectAnalysis']['effectSizeInterpretation'];
  const absEffect = Math.abs(effectSize);
  if (absEffect < 0.2) effectSizeInterpretation = 'negligible';
  else if (absEffect < 0.5) effectSizeInterpretation = 'small';
  else if (absEffect < 0.8) effectSizeInterpretation = 'medium';
  else effectSizeInterpretation = 'large';

  // Confidence based on data quality
  let confidence: ExperimentResults['effectAnalysis']['confidence'] = 'moderate';
  if (baselineStats.n < 5 || interventionStats.n < 5) {
    confidence = 'low';
  } else if (baselineStats.n >= 14 && interventionStats.n >= 14 && absEffect > 0.5) {
    confidence = 'high';
  }

  return {
    primaryOutcome,
    baselineMean: baselineStats.mean,
    interventionMean: interventionStats.mean,
    absoluteChange,
    percentChange,
    effectSize,
    effectSizeInterpretation,
    confidence,
    confoundsPresent: [], // Would be populated from data analysis
  };
}

function generateConclusions(
  experiment: ExperimentDesignSpec,
  effectAnalysis: ExperimentResults['effectAnalysis']
): ExperimentResults['conclusion'] {
  const supported =
    Math.abs(effectAnalysis.effectSize) >= 0.5 && effectAnalysis.confidence !== 'low';

  const dependentVar = experiment.variables.find((v) => v.type === 'dependent');
  const direction = effectAnalysis.absoluteChange > 0 ? 'increased' : 'decreased';
  const directionMatches =
    (dependentVar?.targetDirection === 'increase' && effectAnalysis.absoluteChange > 0) ||
    (dependentVar?.targetDirection === 'decrease' && effectAnalysis.absoluteChange < 0);

  let narrative: string;
  if (supported && directionMatches) {
    narrative =
      `The intervention appears effective. ${experiment.primaryOutcome} ${direction} by ${Math.abs(effectAnalysis.percentChange).toFixed(1)}% ` +
      `(effect size: ${effectAnalysis.effectSizeInterpretation}). Consider continuing or making permanent.`;
  } else if (supported && !directionMatches) {
    narrative =
      `The intervention had an effect, but in the opposite direction than hoped. ${experiment.primaryOutcome} ${direction} ` +
      `instead of the expected direction. Recommend discontinuing.`;
  } else {
    narrative =
      `No clear effect detected. The change in ${experiment.primaryOutcome} (${effectAnalysis.percentChange.toFixed(1)}%) ` +
      `is within normal variation. Consider a longer experiment or different intervention.`;
  }

  const limitations: string[] = [
    'Single-subject design limits generalizability',
    'Self-reported measures may have bias',
  ];

  if (effectAnalysis.confidence === 'low') {
    limitations.push('Limited data points reduce confidence');
  }

  if (experiment.potentialConfounds.length > 0) {
    limitations.push(
      `Potential confounds not fully controlled: ${experiment.potentialConfounds.slice(0, 2).join(', ')}`
    );
  }

  const recommendations: string[] = [];
  if (supported && directionMatches) {
    recommendations.push('Continue the intervention');
    recommendations.push('Track long-term to ensure effect persists');
    recommendations.push('Share finding with your Ferni team for integration');
  } else {
    recommendations.push('Try a different intervention');
    recommendations.push('Consider longer baseline period');
    recommendations.push('Identify and control more confounds');
  }

  return {
    supported: supported && directionMatches,
    confidence:
      effectAnalysis.confidence === 'low'
        ? 0.3
        : effectAnalysis.confidence === 'moderate'
          ? 0.6
          : 0.85,
    narrative,
    limitations,
    recommendations,
  };
}

// ============================================================================
// EXPERIMENT MANAGEMENT
// ============================================================================

/**
 * Record a data point for an active experiment.
 */
export function recordDataPoint(
  experiment: ExperimentDesignSpec,
  variableName: string,
  value: number,
  notes?: string,
  confoundingFactors?: string[]
): DataPoint {
  // Determine current phase
  const currentPhase = getCurrentPhase(experiment);

  return {
    timestamp: Date.now(),
    variableName,
    value,
    phase: currentPhase?.name || 'unknown',
    notes,
    confoundingFactors,
  };
}

function getCurrentPhase(experiment: ExperimentDesignSpec): ExperimentPhase | null {
  const now = Date.now();

  for (const phase of experiment.phases) {
    if (phase.startDate && phase.endDate) {
      const start = new Date(phase.startDate).getTime();
      const end = new Date(phase.endDate).getTime();
      if (now >= start && now <= end) {
        return phase;
      }
    }
  }

  // If no phase has dates yet, return the first one without an end date
  return experiment.phases.find((p) => !p.endDate) || null;
}

/**
 * Generate a daily check-in prompt for an active experiment.
 */
export function generateDailyCheckIn(experiment: ExperimentDesignSpec): {
  questions: Array<{
    variable: string;
    prompt: string;
    inputType: 'scale' | 'number' | 'boolean';
    scale?: { min: number; max: number };
  }>;
  reminderText: string;
} {
  const currentPhase = getCurrentPhase(experiment);
  const dependentVars = experiment.variables.filter((v) => v.type === 'dependent');
  const covariates = experiment.variables.filter((v) => v.type === 'covariate');

  const questions = [
    ...dependentVars.map((v) => ({
      variable: v.name,
      prompt: `How would you rate your ${v.name} today?`,
      inputType: 'scale' as const,
      scale: { min: 1, max: 10 },
    })),
    ...covariates.slice(0, 2).map((v) => ({
      variable: v.name,
      prompt: `Rate your ${v.name} (to control for confounds)`,
      inputType: 'scale' as const,
      scale: { min: 1, max: 10 },
    })),
  ];

  const reminderText =
    currentPhase?.type === 'intervention'
      ? `Remember: You're in the intervention phase. ${currentPhase.intervention?.description || ''}`
      : `You're in the baseline phase. Just observe and record without changing anything.`;

  return { questions, reminderText };
}

// ============================================================================
// FIRESTORE PERSISTENCE
// ============================================================================

export async function loadExperimentationProfile(
  userId: string
): Promise<ExperimentationProfile | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const doc = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('superhuman')
      .doc('experimentation')
      .get();

    if (!doc.exists) return null;
    return doc.data() as ExperimentationProfile;
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to load experimentation profile');
    return null;
  }
}

export async function saveExperimentationProfile(profile: ExperimentationProfile): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(profile.userId)
      .collection('superhuman')
      .doc('experimentation')
      .set(cleanForFirestore({ ...profile, updatedAt: Date.now() }));

    log.debug({ userId: profile.userId }, 'Experimentation profile saved');
  } catch (error) {
    log.warn(
      { error: String(error), userId: profile.userId },
      'Failed to save experimentation profile'
    );
  }
}

export async function saveExperiment(experiment: ExperimentDesignSpec): Promise<void> {
  const db = getFirestoreDb();
  if (!db) return;

  try {
    await db
      .collection('bogle_users')
      .doc(experiment.userId)
      .collection('experiments')
      .doc(experiment.id)
      .set(cleanForFirestore({ ...experiment, updatedAt: Date.now() }));

    log.debug({ userId: experiment.userId, experimentId: experiment.id }, 'Experiment saved');
  } catch (error) {
    log.warn({ error: String(error), userId: experiment.userId }, 'Failed to save experiment');
  }
}

// ============================================================================
// CONTEXT BUILDING
// ============================================================================

export async function buildExperimentationContext(userId: string): Promise<string> {
  const profile = await loadExperimentationProfile(userId);
  if (!profile) return '';

  const sections: string[] = [
    '[N=1 EXPERIMENTATION PLATFORM - Better Than Human Personal Science]',
  ];
  sections.push(
    'You can design rigorous personal experiments and build an evidence base for their life.'
  );

  // Active experiments
  const activeExperiments = profile.experiments.filter(
    (e) => e.status === 'baseline' || e.status === 'active'
  );

  if (activeExperiments.length > 0) {
    sections.push('\n**Active Experiments**:');
    for (const exp of activeExperiments) {
      const currentPhase = getCurrentPhase(exp);
      sections.push(`• "${exp.title}" - ${currentPhase?.name || 'unknown phase'}`);
    }
  }

  // Evidence base
  if (profile.evidenceBase.length > 0) {
    sections.push('\n**Personal Evidence Base**:');
    for (const domain of profile.evidenceBase.slice(0, 2)) {
      sections.push(`${domain.domain}:`);
      for (const finding of domain.findings.slice(0, 2)) {
        const direction = finding.effectSize > 0 ? '↑' : '↓';
        sections.push(
          `  • ${finding.intervention} ${direction} ${finding.effectOnOutcome} (${finding.confidence})`
        );
      }
    }
  }

  // Completed experiments
  const completedCount = profile.experiments.filter((e) => e.status === 'completed').length;
  if (completedCount > 0) {
    sections.push(`\n**Experiment History**: ${completedCount} completed experiments`);
  }

  sections.push('\nHelp them become scientists of their own lives. Rigorous but accessible.');

  return sections.join('\n');
}

// ============================================================================
// EXPORTS
// ============================================================================

export const n1ExperimentationPlatform = {
  // Design
  designExperiment,

  // Data collection
  recordDataPoint,
  generateDailyCheckIn,

  // Analysis
  analyzeExperiment,

  // Persistence
  loadProfile: loadExperimentationProfile,
  saveProfile: saveExperimentationProfile,
  saveExperiment,

  // Context
  buildContext: buildExperimentationContext,
};
