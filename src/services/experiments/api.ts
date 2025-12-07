/**
 * Experiment API
 *
 * HTTP API endpoints for viewing and managing A/B experiments.
 * Integrates with the health server or can be used standalone.
 *
 * Endpoints:
 *   GET  /api/experiments          - List all experiments
 *   GET  /api/experiments/:id      - Get specific experiment
 *   GET  /api/experiments/summary  - Get summary statistics
 *   POST /api/experiments          - Create new experiment
 *   POST /api/experiments/:id/start - Start a draft experiment
 *   POST /api/experiments/:id/stop  - Stop a running experiment
 *
 * @module services/experiment-api
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getAgentEvolution,
  saveAgentEvolutionToFirestore,
  type PersonaExperiment,
  type PersonaEvolutionState,
} from '../../intelligence/agent-evolution.js';
import {
  startExperiment,
  getRunningExperiments,
  getExperimentResults,
} from './integration.js';
import {
  performBayesianAnalysis,
  getSegmentAnalysis,
  configureExperimentAlerts,
  configureBandit,
  scheduleExperiment,
  cancelScheduledExperiment,
  getScheduledExperiments,
  getAllSegments,
  type BayesianResult,
  type SegmentResult,
  type ExperimentAlertConfig,
  type BanditConfig,
  type ExperimentSchedule,
} from './advanced.js';

const logger = getLogger().child({ module: 'ExperimentAPI' });

// ============================================================================
// TYPES
// ============================================================================

export interface ExperimentSummary {
  id: string;
  name: string;
  personaId: string;
  status: string;
  hypothesis: string;
  trafficAllocation: number;
  minimumSampleSize: number;
  currentSamples: number;
  progress: number;
  winner?: string;
  winnerConfidence?: number;
  controlEngagement: number;
  treatmentEngagement: number;
  improvement: number;
  startedAt?: Date;
  endedAt?: Date;
  /** Bayesian analysis results */
  bayesian?: BayesianResult;
  /** Segment-level results */
  segments?: SegmentResult[];
  /** Scheduled start/end times */
  schedule?: ExperimentSchedule;
}

export interface ExperimentDashboardData {
  summary: {
    total: number;
    running: number;
    concluded: number;
    draft: number;
    totalSamples: number;
    avgImprovement: number;
  };
  experiments: ExperimentSummary[];
  adjustments: Array<{
    id: string;
    personaId: string;
    trigger: string;
    adjustment: string;
    source: string;
    confidence: number;
    enabled: boolean;
  }>;
  breakthroughs: Array<{
    personaId: string;
    pattern: string;
    frequency: number;
    effectSize: number;
    recommendation: string;
  }>;
}

export interface CreateExperimentRequest {
  personaId: string;
  name: string;
  hypothesis: string;
  trafficAllocation: number;
  minimumSampleSize: number;
  control: {
    description: string;
    promptModification?: string;
  };
  treatment: {
    description: string;
    promptModification?: string;
  };
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Get full dashboard data for all experiments
 */
export function getExperimentDashboard(): ExperimentDashboardData {
  const engine = getAgentEvolution();
  const states = engine.exportState();

  const experiments: ExperimentSummary[] = [];
  const adjustments: ExperimentDashboardData['adjustments'] = [];
  const breakthroughs: ExperimentDashboardData['breakthroughs'] = [];

  let totalExperiments = 0;
  let running = 0;
  let concluded = 0;
  let draft = 0;
  let totalSamples = 0;
  let totalImprovement = 0;
  let concludedCount = 0;

  for (const [personaId, state] of states) {
    // Process experiments
    for (const exp of state.experiments) {
      totalExperiments++;
      const samples = exp.metrics.engagement.controlN + exp.metrics.engagement.treatmentN;
      totalSamples += samples;

      if (exp.status === 'running') running++;
      else if (exp.status === 'concluded') {
        concluded++;
        const improvement = exp.metrics.engagement.treatment - exp.metrics.engagement.control;
        totalImprovement += improvement;
        concludedCount++;
      } else if (exp.status === 'draft') draft++;

      experiments.push({
        id: exp.id,
        name: exp.name,
        personaId,
        status: exp.status,
        hypothesis: exp.hypothesis,
        trafficAllocation: exp.trafficAllocation,
        minimumSampleSize: exp.minimumSampleSize,
        currentSamples: samples,
        progress: Math.min(100, Math.round((samples / exp.minimumSampleSize) * 100)),
        winner: exp.winner,
        winnerConfidence: exp.winnerConfidence,
        controlEngagement: exp.metrics.engagement.control,
        treatmentEngagement: exp.metrics.engagement.treatment,
        improvement: exp.metrics.engagement.treatment - exp.metrics.engagement.control,
        startedAt: exp.startedAt,
        endedAt: exp.endedAt,
      });
    }

    // Process adjustments
    for (const adj of state.adjustments) {
      adjustments.push({
        id: adj.id,
        personaId,
        trigger: adj.trigger.description,
        adjustment: adj.adjustment.content,
        source: adj.source,
        confidence: adj.confidence,
        enabled: adj.enabled,
      });
    }

    // Process emergent patterns
    for (const pattern of state.emergentPatterns) {
      breakthroughs.push({
        personaId,
        pattern: pattern.observedBehavior,
        frequency: pattern.frequency,
        effectSize: pattern.effectSize,
        recommendation: pattern.recommendation,
      });
    }
  }

  return {
    summary: {
      total: totalExperiments,
      running,
      concluded,
      draft,
      totalSamples,
      avgImprovement: concludedCount > 0 ? totalImprovement / concludedCount : 0,
    },
    experiments,
    adjustments,
    breakthroughs,
  };
}

/**
 * Get a single experiment by ID (with full analysis)
 */
export function getExperiment(experimentId: string): ExperimentSummary | null {
  const engine = getAgentEvolution();
  const states = engine.exportState();

  for (const [personaId, state] of states) {
    const exp = state.experiments.find((e) => e.id === experimentId);
    if (exp) {
      const samples = exp.metrics.engagement.controlN + exp.metrics.engagement.treatmentN;

      // Get Bayesian analysis if enough samples
      let bayesian: BayesianResult | undefined;
      if (samples >= 20) {
        try {
          bayesian = performBayesianAnalysis(exp);
        } catch {
          // Non-fatal
        }
      }

      // Get segment analysis
      const segments = getSegmentAnalysis(experimentId);

      // Get schedule if exists
      const scheduled = getScheduledExperiments().find((s) => s.experimentId === experimentId);

      return {
        id: exp.id,
        name: exp.name,
        personaId,
        status: exp.status,
        hypothesis: exp.hypothesis,
        trafficAllocation: exp.trafficAllocation,
        minimumSampleSize: exp.minimumSampleSize,
        currentSamples: samples,
        progress: Math.min(100, Math.round((samples / exp.minimumSampleSize) * 100)),
        winner: exp.winner,
        winnerConfidence: exp.winnerConfidence,
        controlEngagement: exp.metrics.engagement.control,
        treatmentEngagement: exp.metrics.engagement.treatment,
        improvement: exp.metrics.engagement.treatment - exp.metrics.engagement.control,
        startedAt: exp.startedAt,
        endedAt: exp.endedAt,
        bayesian,
        segments: segments.length > 0 ? segments : undefined,
        schedule: scheduled?.schedule,
      };
    }
  }

  return null;
}

/**
 * Create and start a new experiment
 */
export function createExperiment(request: CreateExperimentRequest): ExperimentSummary {
  const experiment = startExperiment(request);

  logger.info(
    { experimentId: experiment.id, personaId: request.personaId, name: request.name },
    'Created new experiment via API'
  );

  // Save to Firestore asynchronously
  void saveAgentEvolutionToFirestore();

  return {
    id: experiment.id,
    name: experiment.name,
    personaId: request.personaId,
    status: experiment.status,
    hypothesis: experiment.hypothesis,
    trafficAllocation: experiment.trafficAllocation,
    minimumSampleSize: experiment.minimumSampleSize,
    currentSamples: 0,
    progress: 0,
    controlEngagement: 0,
    treatmentEngagement: 0,
    improvement: 0,
    startedAt: experiment.startedAt,
  };
}

/**
 * Stop a running experiment
 */
export function stopExperiment(experimentId: string): boolean {
  const engine = getAgentEvolution();
  const states = engine.exportState();

  for (const [personaId, state] of states) {
    const exp = state.experiments.find((e) => e.id === experimentId);
    if (exp && exp.status === 'running') {
      exp.status = 'concluded';
      exp.endedAt = new Date();

      // Determine winner based on current data
      const { engagement } = exp.metrics;
      if (engagement.controlN > 10 && engagement.treatmentN > 10) {
        const diff = engagement.treatment - engagement.control;
        if (Math.abs(diff) > 0.05) {
          exp.winner = diff > 0 ? 'treatment' : 'control';
          exp.winnerConfidence = Math.min(0.95, Math.abs(diff) * 5);
        } else {
          exp.winner = 'inconclusive';
        }
      } else {
        exp.winner = 'inconclusive';
      }

      logger.info(
        { experimentId, winner: exp.winner },
        'Stopped experiment via API'
      );

      // Save to Firestore asynchronously
      void saveAgentEvolutionToFirestore();

      return true;
    }
  }

  return false;
}

// ============================================================================
// PRE-BUILT EXPERIMENT TEMPLATES
// ============================================================================

export const EXPERIMENT_TEMPLATES: CreateExperimentRequest[] = [
  {
    personaId: 'ferni',
    name: 'Humor Frequency Test',
    hypothesis: 'More frequent light humor improves engagement',
    trafficAllocation: 0.5,
    minimumSampleSize: 100,
    control: { description: 'Current humor frequency' },
    treatment: {
      description: 'Increased humor frequency',
      promptModification:
        'Add a light touch of humor or playfulness to most responses when appropriate. Keep it warm and natural.',
    },
  },
  {
    personaId: 'ferni',
    name: 'Storytelling Frequency Test',
    hypothesis: 'More personal stories increase user engagement',
    trafficAllocation: 0.5,
    minimumSampleSize: 100,
    control: { description: 'Standard storytelling frequency' },
    treatment: {
      description: 'Increased story sharing',
      promptModification:
        'Share brief, relevant personal anecdotes more frequently when they can illustrate a point.',
    },
  },
  {
    personaId: 'ferni',
    name: 'Question Style Test',
    hypothesis: 'Open-ended questions lead to deeper conversations',
    trafficAllocation: 0.5,
    minimumSampleSize: 100,
    control: { description: 'Mix of question types' },
    treatment: {
      description: 'Prioritize open-ended questions',
      promptModification:
        'Prefer open-ended questions that invite reflection (How/What/Tell me) over yes/no questions.',
    },
  },
  {
    personaId: 'ferni',
    name: 'Empathy Expression Test',
    hypothesis: 'Explicit empathy statements increase satisfaction',
    trafficAllocation: 0.5,
    minimumSampleSize: 100,
    control: { description: 'Natural empathy expression' },
    treatment: {
      description: 'Enhanced explicit empathy',
      promptModification:
        'Begin responses to emotional content with explicit empathy ("I hear how hard that is" or "That sounds really challenging").',
    },
  },
  {
    personaId: 'ferni',
    name: 'Pacing Test',
    hypothesis: 'Slower, more deliberate responses feel more thoughtful',
    trafficAllocation: 0.5,
    minimumSampleSize: 100,
    control: { description: 'Standard response pacing' },
    treatment: {
      description: 'More deliberate pacing',
      promptModification:
        'Take a breath before responding. Use "Let me think about that..." or brief pauses when appropriate.',
    },
  },
];

/**
 * Start an experiment from a template
 */
export function startExperimentFromTemplate(templateIndex: number): ExperimentSummary | null {
  if (templateIndex < 0 || templateIndex >= EXPERIMENT_TEMPLATES.length) {
    return null;
  }

  return createExperiment(EXPERIMENT_TEMPLATES[templateIndex]);
}

// ============================================================================
// ADVANCED FEATURES API
// ============================================================================

/**
 * Configure alerting (Slack/Email)
 */
export function configureAlerts(config: Partial<ExperimentAlertConfig>): void {
  configureExperimentAlerts(config);
}

/**
 * Configure Multi-Armed Bandit
 */
export function configureMAB(config: Partial<BanditConfig>): void {
  configureBandit(config);
}

/**
 * Schedule an experiment
 */
export function scheduleExperimentTime(
  experimentId: string,
  personaId: string,
  schedule: ExperimentSchedule
): void {
  scheduleExperiment(experimentId, personaId, schedule);
}

/**
 * Cancel a scheduled experiment
 */
export function cancelSchedule(experimentId: string): boolean {
  return cancelScheduledExperiment(experimentId);
}

/**
 * Get all scheduled experiments
 */
export function getSchedules(): Array<{
  experimentId: string;
  personaId: string;
  schedule: ExperimentSchedule;
}> {
  return getScheduledExperiments();
}

/**
 * Get segment analysis for an experiment
 */
export function getSegments(experimentId: string): SegmentResult[] {
  return getSegmentAnalysis(experimentId);
}

/**
 * Get Bayesian analysis for an experiment
 */
export function getBayesianAnalysis(experimentId: string): BayesianResult | null {
  const experiment = getExperiment(experimentId);
  if (!experiment) return null;

  const engine = getAgentEvolution();
  for (const state of engine.exportState().values()) {
    const exp = state.experiments.find((e) => e.id === experimentId);
    if (exp && exp.metrics.engagement.controlN >= 10 && exp.metrics.engagement.treatmentN >= 10) {
      return performBayesianAnalysis(exp);
    }
  }

  return null;
}

/**
 * Get all available segments
 */
export function getAvailableSegments(): Array<{ id: string; name: string; description: string }> {
  return getAllSegments().map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
  }));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  getExperimentDashboard,
  getExperiment,
  createExperiment,
  stopExperiment,
  startExperimentFromTemplate,
  EXPERIMENT_TEMPLATES,
  // Advanced features
  configureAlerts,
  configureMAB,
  scheduleExperimentTime,
  cancelSchedule,
  getSchedules,
  getSegments,
  getBayesianAnalysis,
  getAvailableSegments,
};

// Re-export types from experiment-advanced
export type {
  BayesianResult,
  SegmentResult,
  ExperimentAlertConfig,
  BanditConfig,
  ExperimentSchedule,
} from './advanced.js';

