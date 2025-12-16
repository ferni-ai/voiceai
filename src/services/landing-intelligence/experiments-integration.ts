/**
 * Landing Page Experiments Integration
 *
 * Integrates the landing intelligence system with the existing A/B testing
 * infrastructure. Defines experiments for the new sections.
 *
 * @module services/landing-intelligence/experiments-integration
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LandingExperiments' });

// ============================================================================
// EXPERIMENT DEFINITIONS
// ============================================================================

export interface LandingExperiment {
  id: string;
  name: string;
  description: string;
  section: string;
  variants: ExperimentVariant[];
  targetMetric: string;
  status: 'draft' | 'running' | 'paused' | 'completed';
  startDate?: Date;
  endDate?: Date;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  weight: number; // 0-100
  changes: Record<string, string | boolean | number>;
}

// Pre-defined experiments for the new sections
export const LANDING_EXPERIMENTS: LandingExperiment[] = [
  // ============================================================================
  // SUPERPOWERS SECTION EXPERIMENTS
  // ============================================================================
  {
    id: 'superpowers_tab_order',
    name: 'Superpowers Tab Order',
    description:
      'Test whether leading with Quote Callback (memory) converts better than Reading Between Lines',
    section: 'superpowers',
    variants: [
      {
        id: 'control',
        name: 'Current Order',
        weight: 50,
        changes: {
          tabOrder:
            'reading-between-lines,quote-callback,presence-mode,emotional-forecasting,gentle-challenge',
        },
      },
      {
        id: 'memory_first',
        name: 'Memory First',
        weight: 50,
        changes: {
          tabOrder:
            'quote-callback,reading-between-lines,presence-mode,emotional-forecasting,gentle-challenge',
        },
      },
    ],
    targetMetric: 'cta_clicks',
    status: 'draft',
  },
  {
    id: 'superpowers_demo_animation',
    name: 'Demo Chat Animation',
    description: 'Test animated chat messages vs static display',
    section: 'superpowers',
    variants: [
      {
        id: 'control',
        name: 'Animated',
        weight: 50,
        changes: { animatedChat: true },
      },
      {
        id: 'static',
        name: 'Static',
        weight: 50,
        changes: { animatedChat: false },
      },
    ],
    targetMetric: 'section_engagement_time',
    status: 'draft',
  },

  // ============================================================================
  // HARDEST MOMENTS EXPERIMENTS
  // ============================================================================
  {
    id: 'hardest_moments_card_count',
    name: 'Hardest Moments Card Count',
    description: 'Test showing 3 cards vs all 5 cards',
    section: 'hardest-moments',
    variants: [
      {
        id: 'control',
        name: 'All 5 Cards',
        weight: 50,
        changes: { cardCount: 5 },
      },
      {
        id: 'three_cards',
        name: '3 Featured Cards',
        weight: 50,
        changes: { cardCount: 3, featuredCards: 'second-chances,connection,quiet-growth' },
      },
    ],
    targetMetric: 'scroll_depth',
    status: 'draft',
  },
  {
    id: 'hardest_moments_voice_quotes',
    name: 'Voice Quotes Visibility',
    description: 'Test impact of Ferni voice quotes on engagement',
    section: 'hardest-moments',
    variants: [
      {
        id: 'control',
        name: 'With Quotes',
        weight: 50,
        changes: { showVoiceQuotes: true },
      },
      {
        id: 'no_quotes',
        name: 'Without Quotes',
        weight: 50,
        changes: { showVoiceQuotes: false },
      },
    ],
    targetMetric: 'section_engagement_time',
    status: 'draft',
  },

  // ============================================================================
  // MEMORY DEMO EXPERIMENTS
  // ============================================================================
  {
    id: 'memory_demo_layout',
    name: 'Memory Demo Layout',
    description: 'Test timeline-only vs timeline+insights side panel',
    section: 'memory-demo',
    variants: [
      {
        id: 'control',
        name: 'Timeline + Insights',
        weight: 50,
        changes: { layout: 'side-by-side' },
      },
      {
        id: 'timeline_only',
        name: 'Timeline Only',
        weight: 50,
        changes: { layout: 'timeline-only' },
      },
    ],
    targetMetric: 'scroll_past_section',
    status: 'draft',
  },
  {
    id: 'memory_demo_emotions',
    name: 'Emotion Labels',
    description: 'Test showing emotion labels on memory cards',
    section: 'memory-demo',
    variants: [
      {
        id: 'control',
        name: 'With Emotions',
        weight: 50,
        changes: { showEmotions: true },
      },
      {
        id: 'no_emotions',
        name: 'Without Emotions',
        weight: 50,
        changes: { showEmotions: false },
      },
    ],
    targetMetric: 'cta_clicks',
    status: 'draft',
  },

  // ============================================================================
  // JOURNEY SECTION EXPERIMENTS
  // ============================================================================
  {
    id: 'journey_depth_viz',
    name: 'Journey Depth Visualization',
    description: 'Test depth bars vs timeline-only view',
    section: 'journey',
    variants: [
      {
        id: 'control',
        name: 'Depth Bars + Timeline',
        weight: 50,
        changes: { showDepthViz: true },
      },
      {
        id: 'timeline_only',
        name: 'Timeline Only',
        weight: 50,
        changes: { showDepthViz: false },
      },
    ],
    targetMetric: 'scroll_depth',
    status: 'draft',
  },

  // ============================================================================
  // HERO EXPERIMENTS
  // ============================================================================
  {
    id: 'hero_tagline_variations',
    name: 'Hero Tagline',
    description: 'Test different tagline variations',
    section: 'hero',
    variants: [
      {
        id: 'control',
        name: 'Better than human.',
        weight: 34,
        changes: { tagline: 'Better than human.' },
      },
      {
        id: 'time_aware',
        name: 'Time-aware (dynamic)',
        weight: 33,
        changes: { tagline: 'dynamic' }, // Uses time-aware content
      },
      {
        id: 'question',
        name: 'What if someone actually understood?',
        weight: 33,
        changes: { tagline: 'What if someone actually understood?' },
      },
    ],
    targetMetric: 'cta_clicks',
    status: 'draft',
  },
];

// ============================================================================
// EXPERIMENT ASSIGNMENT
// ============================================================================

export function assignVariant(experiment: LandingExperiment, visitorId: string): ExperimentVariant {
  // Use visitor ID for deterministic assignment
  const hash = hashString(`${experiment.id}_${visitorId}`);
  const bucket = hash % 100;

  let cumulative = 0;
  for (const variant of experiment.variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant;
    }
  }

  // Fallback to first variant
  return experiment.variants[0];
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

// ============================================================================
// EXPERIMENT RESULTS
// ============================================================================

export interface ExperimentResult {
  experimentId: string;
  variantId: string;
  metric: string;
  value: number;
  sampleSize: number;
  confidence: number;
  winner?: string;
}

export function calculateExperimentResults(
  experimentId: string,
  data: Array<{ variantId: string; converted: boolean; metric?: number }>
): ExperimentResult[] {
  const experiment = LANDING_EXPERIMENTS.find((e) => e.id === experimentId);
  if (!experiment) return [];

  const results: ExperimentResult[] = [];

  for (const variant of experiment.variants) {
    const variantData = data.filter((d) => d.variantId === variant.id);
    const conversions = variantData.filter((d) => d.converted).length;
    const conversionRate = variantData.length > 0 ? conversions / variantData.length : 0;

    results.push({
      experimentId,
      variantId: variant.id,
      metric: experiment.targetMetric,
      value: conversionRate,
      sampleSize: variantData.length,
      confidence: calculateConfidence(variantData.length, conversions),
    });
  }

  // Determine winner if confidence is high enough
  if (results.length >= 2 && results.every((r) => r.confidence > 0.95)) {
    const sorted = [...results].sort((a, b) => b.value - a.value);
    if (sorted[0].value > sorted[1].value * 1.05) {
      // 5% lift threshold
      sorted[0].winner = sorted[0].variantId;
    }
  }

  return results;
}

function calculateConfidence(n: number, k: number): number {
  // Simple confidence calculation based on sample size
  // In production, use proper statistical tests
  if (n < 100) return 0.5;
  if (n < 500) return 0.7;
  if (n < 1000) return 0.85;
  return 0.95;
}

// ============================================================================
// GET ACTIVE EXPERIMENTS
// ============================================================================

export function getActiveExperiments(): LandingExperiment[] {
  return LANDING_EXPERIMENTS.filter((e) => e.status === 'running');
}

export function getExperimentById(id: string): LandingExperiment | undefined {
  return LANDING_EXPERIMENTS.find((e) => e.id === id);
}

export function startExperiment(id: string): boolean {
  const experiment = LANDING_EXPERIMENTS.find((e) => e.id === id);
  if (!experiment) return false;

  experiment.status = 'running';
  experiment.startDate = new Date();
  log.info({ experimentId: id }, 'Experiment started');
  return true;
}

export function stopExperiment(id: string): boolean {
  const experiment = LANDING_EXPERIMENTS.find((e) => e.id === id);
  if (!experiment) return false;

  experiment.status = 'completed';
  experiment.endDate = new Date();
  log.info({ experimentId: id }, 'Experiment stopped');
  return true;
}
