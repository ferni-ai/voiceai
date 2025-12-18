# AI Experiment Orchestrator

> Automatic feature calibration for the Ferni landing page using AI-driven experimentation.

**Status**: Implementation Plan
**Owner**: Ferni Engineering
**Created**: December 2025

---

## Executive Summary

Build an AI-driven system that automatically:

1. **Runs experiments** on landing page elements (headlines, CTAs, layouts)
2. **Analyzes results** in real-time with statistical rigor
3. **Auto-graduates winners** when confidence thresholds are met
4. **Generates new hypotheses** based on winning patterns
5. **Allocates traffic intelligently** using multi-armed bandits

The goal is "set and forget" optimization - the system continuously improves conversion without manual intervention.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI EXPERIMENT ORCHESTRATOR                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │   Landing    │───▶│  Experiment  │───▶│    Auto      │               │
│  │    Page      │    │   Tracker    │    │  Optimizer   │               │
│  │  (Variants)  │◀───│   (Events)   │◀───│    (AI)      │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│         │                   │                   │                        │
│         ▼                   ▼                   ▼                        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐               │
│  │   Variant    │    │   Metrics    │    │  Hypothesis  │               │
│  │   Library    │    │   Storage    │    │  Generator   │               │
│  │  (Content)   │    │ (Firestore)  │    │    (AI)      │               │
│  └──────────────┘    └──────────────┘    └──────────────┘               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Auto-Optimization Service

### 1.1 Auto-Graduate Winners

The core AI loop that watches experiments and ships winners automatically.

```typescript
// src/services/experiments/auto-optimizer.ts

interface AutoOptimizerConfig {
  // When to auto-graduate
  minimumConfidence: number; // Default: 95%
  minimumSamples: number; // Default: 1000
  minimumDuration: number; // Default: 7 days (avoid novelty effects)

  // Safety rails
  maxLift: number; // Flag if >200% lift (likely bug)
  minConversionRate: number; // Flag if <0.1% (tracking issue)

  // Actions
  autoShip: boolean; // Actually apply winner as default
  notifyOnWinner: boolean; // Send Slack/email notification
  createFollowUp: boolean; // Auto-create next experiment
}

async function runOptimizationLoop(): Promise<void> {
  // 1. Get all running experiments
  // 2. For each: analyze current results
  // 3. If winner detected → graduate and ship
  // 4. If stalled → suggest action
  // 5. Schedule next check (hourly)
}
```

### 1.2 Winner Detection Logic

```typescript
interface WinnerDecision {
  hasWinner: boolean;
  winnerId: string | null;
  confidence: number;
  lift: number;
  recommendation: 'ship' | 'continue' | 'stop' | 'investigate';
  reasoning: string;
}

function detectWinner(analysis: ExperimentAnalysis): WinnerDecision {
  // Statistical significance check
  if (analysis.confidence < 95) {
    return { hasWinner: false, recommendation: 'continue', ... };
  }

  // Minimum sample check
  if (analysis.sampleSize < config.minimumSamples) {
    return { hasWinner: false, recommendation: 'continue', ... };
  }

  // Sanity checks
  if (analysis.variants[0].conversionRate < 0.001) {
    return { hasWinner: false, recommendation: 'investigate', ... };
  }

  // Winner found!
  return {
    hasWinner: true,
    winnerId: analysis.winner,
    confidence: analysis.confidence,
    lift: analysis.variants.find(v => v.id === analysis.winner)?.improvement || 0,
    recommendation: 'ship',
    reasoning: `Variant ${analysis.winner} shows ${lift}% lift with ${confidence}% confidence`,
  };
}
```

### 1.3 Auto-Ship Implementation

```typescript
async function shipWinner(experimentId: string, winnerId: string): Promise<void> {
  // 1. Update experiment config to make winner the new default
  await updateExperimentDefault(experimentId, winnerId);

  // 2. Update variant library (for landing page)
  await updateVariantLibrary(experimentId, winnerId);

  // 3. Complete the experiment
  await completeWebExperiment(experimentId, winnerId, analysis.confidence);

  // 4. Log for audit trail
  await logShipment({ experimentId, winnerId, timestamp: new Date() });

  // 5. Notify team
  await notifyWinner({ experimentId, winnerId, lift, confidence });

  // 6. Create follow-up experiment (optional)
  if (config.createFollowUp) {
    await createFollowUpExperiment(experimentId, winnerId);
  }
}
```

---

## Phase 2: Landing Page Variants

### 2.1 Experiment Catalog

Define the experiments we want to run:

| Experiment ID    | Element               | Variants              | Primary Goal    |
| ---------------- | --------------------- | --------------------- | --------------- |
| `hero-headline`  | Hero H1               | 4 headlines           | `cta_click`     |
| `hero-cta`       | Primary CTA button    | 3 texts + 2 colors    | `cta_click`     |
| `social-proof`   | Trust badges position | top vs bottom         | `scroll_depth`  |
| `team-order`     | Persona display order | Ferni first vs random | `team_click`    |
| `pricing-anchor` | Pricing highlight     | Free vs Friend        | `pricing_click` |

### 2.2 Variant Library

```typescript
// src/services/experiments/variant-library.ts

export const LANDING_PAGE_VARIANTS = {
  'hero-headline': {
    control: {
      tagline: 'Better than human.',
      headline: 'Finally, someone who gets it.',
    },
    variant_a: {
      tagline: 'Your AI life coach.',
      headline: 'What if someone actually understood?',
    },
    variant_b: {
      tagline: 'Better than human.',
      headline: 'Six brilliant minds. One conversation.',
    },
    variant_c: {
      tagline: 'Beyond human limitations.',
      headline: 'Someone who never forgets.',
    },
  },

  'hero-cta': {
    control: { text: 'Start Free', color: 'primary' },
    variant_a: { text: 'Meet Ferni', color: 'primary' },
    variant_b: { text: 'Begin a Real Conversation', color: 'primary' },
    variant_c: { text: 'Start Free', color: 'secondary' },
  },

  'trust-badges': {
    control: { position: 'below-cta', style: 'minimal' },
    variant_a: { position: 'above-cta', style: 'minimal' },
    variant_b: { position: 'below-cta', style: 'prominent' },
  },
};
```

### 2.3 Landing Page Integration

Update the landing page to fetch and apply variants:

```javascript
// apps/website/ferni-website/src/js/experiment-variants.js

(function () {
  'use strict';

  const EXPERIMENTS = ['hero-headline', 'hero-cta', 'trust-badges'];

  async function initExperiments() {
    for (const experimentId of EXPERIMENTS) {
      const variant = await FerniExperiments.getVariant(experimentId);
      if (variant) {
        applyVariant(experimentId, variant);
      }
    }
  }

  function applyVariant(experimentId, variantId) {
    switch (experimentId) {
      case 'hero-headline':
        applyHeroHeadline(variantId);
        break;
      case 'hero-cta':
        applyHeroCTA(variantId);
        break;
      case 'trust-badges':
        applyTrustBadges(variantId);
        break;
    }
  }

  function applyHeroHeadline(variantId) {
    const variants = {
      control: { tagline: 'Better than human.', headline: 'Finally, someone who gets it.' },
      variant_a: {
        tagline: 'Your AI life coach.',
        headline: 'What if someone actually understood?',
      },
      variant_b: {
        tagline: 'Better than human.',
        headline: 'Six brilliant minds. One conversation.',
      },
      variant_c: { tagline: 'Beyond human limitations.', headline: 'Someone who never forgets.' },
    };

    const content = variants[variantId];
    if (!content) return;

    const tagline = document.querySelector('.hero__tagline');
    const headline = document.querySelector('.hero__headline');

    if (tagline) tagline.textContent = content.tagline;
    if (headline) headline.innerHTML = content.headline;
  }

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExperiments);
  } else {
    initExperiments();
  }

  window.FerniVariants = { applyVariant };
})();
```

### 2.4 Conversion Tracking

```javascript
// Track CTA clicks
document.querySelectorAll('.hero__cta a, .nav__cta').forEach((btn) => {
  btn.addEventListener('click', () => {
    FerniExperiments.trackConversionForAll('cta_click');
  });
});

// Track scroll depth
let maxScroll = 0;
window.addEventListener(
  'scroll',
  () => {
    const scrollPercent =
      (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
    if (scrollPercent > maxScroll) {
      maxScroll = scrollPercent;
      if (maxScroll >= 50) FerniExperiments.trackConversionForAll('scroll_50');
      if (maxScroll >= 75) FerniExperiments.trackConversionForAll('scroll_75');
      if (maxScroll >= 90) FerniExperiments.trackConversionForAll('scroll_90');
    }
  },
  { passive: true }
);

// Track time on page
setTimeout(() => FerniExperiments.trackConversionForAll('time_30s'), 30000);
setTimeout(() => FerniExperiments.trackConversionForAll('time_60s'), 60000);
```

---

## Phase 3: Multi-Armed Bandit

### 3.1 Thompson Sampling Implementation

Instead of 50/50 traffic split, dynamically allocate more traffic to better performers:

```typescript
// src/services/experiments/thompson-sampler.ts

interface BanditArm {
  variantId: string;
  successes: number; // Conversions
  failures: number; // Non-conversions
}

interface ThompsonSamplerConfig {
  experimentId: string;
  explorationWeight: number; // 0-1, higher = more exploration
  minimumExploration: number; // Minimum % traffic to each variant
}

function sampleBeta(alpha: number, beta: number): number {
  // Generate sample from Beta distribution
  const x = gammaSample(alpha);
  const y = gammaSample(beta);
  return x / (x + y);
}

function selectVariant(arms: BanditArm[], config: ThompsonSamplerConfig): string {
  // Thompson Sampling: sample from posterior distribution for each arm
  let bestSample = -1;
  let bestVariant = arms[0].variantId;

  for (const arm of arms) {
    // Beta(successes + 1, failures + 1) is the posterior
    const sample = sampleBeta(arm.successes + 1, arm.failures + 1);

    if (sample > bestSample) {
      bestSample = sample;
      bestVariant = arm.variantId;
    }
  }

  return bestVariant;
}

// Update the assignment function to use Thompson Sampling
export async function assignVariantWithBandit(
  experimentId: string,
  userId: string,
  context?: AssignmentContext
): Promise<VariantAssignment | null> {
  const experiment = await getWebExperiment(experimentId);
  if (!experiment || experiment.status !== 'running') return null;

  // Check for existing assignment (consistency)
  const existing = await getExistingAssignment(experimentId, userId);
  if (existing) return existing;

  // Get current arm stats
  const arms = await getArmStats(experimentId);

  // Use Thompson Sampling to select variant
  const variantId = selectVariant(arms, { experimentId, explorationWeight: 0.1 });

  // Persist and return
  await persistAssignment(experimentId, userId, variantId);
  return { experimentId, variantId, assignedAt: new Date(), isNewAssignment: true };
}
```

### 3.2 Regret Minimization

Track and minimize regret (opportunity cost of not always showing the best variant):

```typescript
interface BanditMetrics {
  totalRegret: number;
  averageRegret: number;
  estimatedBestArm: string;
  armProbabilities: Record<string, number>;
  explorationRatio: number;
}

async function calculateRegret(experimentId: string): Promise<BanditMetrics> {
  const arms = await getArmStats(experimentId);
  const assignments = await getAssignmentHistory(experimentId);

  // Estimate true conversion rates
  const rates = arms.map((arm) => ({
    variantId: arm.variantId,
    rate: arm.successes / (arm.successes + arm.failures + 1),
  }));

  const bestRate = Math.max(...rates.map((r) => r.rate));
  const bestArm = rates.find((r) => r.rate === bestRate)?.variantId;

  // Calculate regret
  let totalRegret = 0;
  for (const assignment of assignments) {
    const armRate = rates.find((r) => r.variantId === assignment.variantId)?.rate || 0;
    totalRegret += bestRate - armRate;
  }

  return {
    totalRegret,
    averageRegret: totalRegret / assignments.length,
    estimatedBestArm: bestArm || 'unknown',
    armProbabilities: Object.fromEntries(rates.map((r) => [r.variantId, r.rate])),
    explorationRatio: calculateExplorationRatio(assignments, bestArm),
  };
}
```

---

## Phase 4: AI Hypothesis Generator

### 4.1 Pattern Analysis

Analyze completed experiments to find winning patterns:

```typescript
// src/services/experiments/hypothesis-generator.ts

interface ExperimentPattern {
  attribute: string; // e.g., 'headline_length', 'cta_verb', 'color'
  winningValue: string; // e.g., 'short', 'action', 'green'
  confidence: number;
  experimentIds: string[]; // Supporting experiments
}

async function analyzeWinningPatterns(): Promise<ExperimentPattern[]> {
  // Get all completed experiments with winners
  const completed = await getCompletedExperiments();

  const patterns: ExperimentPattern[] = [];

  // Analyze headline patterns
  const headlineExperiments = completed.filter((e) => e.id.includes('headline'));
  if (headlineExperiments.length >= 3) {
    const headlinePattern = analyzeHeadlinePatterns(headlineExperiments);
    if (headlinePattern) patterns.push(headlinePattern);
  }

  // Analyze CTA patterns
  const ctaExperiments = completed.filter((e) => e.id.includes('cta'));
  if (ctaExperiments.length >= 3) {
    const ctaPattern = analyzeCTAPatterns(ctaExperiments);
    if (ctaPattern) patterns.push(ctaPattern);
  }

  return patterns;
}

function analyzeHeadlinePatterns(experiments: WebExperiment[]): ExperimentPattern | null {
  // Extract features from winning headlines
  const features = experiments.map((exp) => ({
    winner: exp.winner,
    length: getHeadlineLength(exp.winner),
    hasQuestion: isQuestion(exp.winner),
    tone: analyzeTone(exp.winner),
    keywords: extractKeywords(exp.winner),
  }));

  // Find common winning features
  const lengthWins = features.filter((f) => f.length === 'short').length;
  if (lengthWins > features.length * 0.7) {
    return {
      attribute: 'headline_length',
      winningValue: 'short',
      confidence: lengthWins / features.length,
      experimentIds: experiments.map((e) => e.id),
    };
  }

  return null;
}
```

### 4.2 Auto-Generate New Experiments

```typescript
interface GeneratedHypothesis {
  experimentId: string;
  name: string;
  rationale: string;
  variants: WebExperimentVariant[];
  expectedLift: number;
  confidence: number;
}

async function generateHypotheses(patterns: ExperimentPattern[]): Promise<GeneratedHypothesis[]> {
  const hypotheses: GeneratedHypothesis[] = [];

  for (const pattern of patterns) {
    // Generate variants that test the pattern further
    if (pattern.attribute === 'headline_length' && pattern.winningValue === 'short') {
      hypotheses.push({
        experimentId: `headline-ultra-short-${Date.now()}`,
        name: 'Ultra-Short Headlines Test',
        rationale: `Pattern detected: short headlines win (${pattern.confidence * 100}% of experiments). Testing even shorter variants.`,
        variants: [
          { id: 'control', name: 'Current Winner', weight: 50 },
          { id: 'ultra_short', name: 'Ultra Short (3 words)', weight: 25 },
          { id: 'one_word', name: 'One Word Impact', weight: 25 },
        ],
        expectedLift: 5,
        confidence: pattern.confidence,
      });
    }

    if (pattern.attribute === 'cta_verb' && pattern.winningValue === 'action') {
      hypotheses.push({
        experimentId: `cta-action-variants-${Date.now()}`,
        name: 'Action Verb CTA Variants',
        rationale: `Pattern detected: action verbs win. Testing variations.`,
        variants: [
          { id: 'control', name: 'Current (Start Free)', weight: 34 },
          { id: 'begin', name: 'Begin Now', weight: 33 },
          { id: 'try', name: 'Try Ferni', weight: 33 },
        ],
        expectedLift: 3,
        confidence: pattern.confidence,
      });
    }
  }

  return hypotheses;
}
```

### 4.3 AI-Powered Variant Generation (Future)

Use LLM to generate new headline/CTA variants:

```typescript
async function generateVariantsWithAI(
  experimentType: 'headline' | 'cta' | 'subhead',
  context: { winningPatterns: ExperimentPattern[]; brandVoice: string }
): Promise<string[]> {
  const prompt = `
    You are generating A/B test variants for Ferni, an AI life coaching service.
    
    Brand voice: ${context.brandVoice}
    
    Winning patterns from past experiments:
    ${context.winningPatterns.map((p) => `- ${p.attribute}: ${p.winningValue} wins`).join('\n')}
    
    Generate 3 new ${experimentType} variants that:
    1. Follow the winning patterns
    2. Match Ferni's warm, human brand voice
    3. Are distinctly different from each other
    4. Focus on emotional connection, not features
    
    Current ${experimentType}: "Finally, someone who gets it."
    
    Respond with JSON array of 3 variants.
  `;

  // Call Claude API
  const response = await callClaudeAPI(prompt);
  return JSON.parse(response);
}
```

---

## Phase 5: Integration & Monitoring

### 5.1 Scheduled Jobs

```typescript
// Cloud Function: Run optimization loop hourly
export const optimizationLoop = onSchedule('every 1 hours', async () => {
  const optimizer = new AutoOptimizer(config);

  // 1. Check for winners
  const winners = await optimizer.checkForWinners();
  for (const winner of winners) {
    await optimizer.shipWinner(winner);
  }

  // 2. Update bandit allocations
  await optimizer.updateBanditAllocations();

  // 3. Generate new hypotheses (weekly)
  if (isWeeklyRun()) {
    const hypotheses = await optimizer.generateHypotheses();
    for (const h of hypotheses) {
      await createExperimentDraft(h);
    }
  }

  // 4. Clean up old experiments
  await optimizer.archiveOldExperiments();
});
```

### 5.2 Dashboard API

```typescript
// GET /api/v1/admin/optimizer/status
interface OptimizerStatus {
  isRunning: boolean;
  lastRun: Date;
  experimentsChecked: number;
  winnersShipped: number;
  pendingHypotheses: GeneratedHypothesis[];
  banditMetrics: Record<string, BanditMetrics>;
  alerts: OptimizerAlert[];
}

// GET /api/v1/admin/optimizer/experiments
interface ExperimentOverview {
  running: WebExperiment[];
  pendingReview: WebExperiment[]; // Winners detected, awaiting review
  completed: WebExperiment[];
  hypotheses: GeneratedHypothesis[];
}
```

### 5.3 Alerting

```typescript
interface OptimizerAlert {
  type: 'winner_detected' | 'anomaly' | 'stalled' | 'hypothesis_ready';
  severity: 'info' | 'warning' | 'critical';
  experimentId: string;
  message: string;
  timestamp: Date;
}

async function sendAlert(alert: OptimizerAlert): Promise<void> {
  // Slack notification
  if (alert.severity === 'critical' || alert.type === 'winner_detected') {
    await sendSlackMessage({
      channel: '#experiments',
      text: `🧪 ${alert.type}: ${alert.message}`,
      blocks: formatAlertBlocks(alert),
    });
  }

  // Store for dashboard
  await storeAlert(alert);
}
```

---

## Implementation Timeline

### Week 1: Foundation

- [ ] Create `auto-optimizer.ts` service
- [ ] Implement winner detection logic
- [ ] Add auto-ship functionality
- [ ] Set up Cloud Function scheduler

### Week 2: Landing Page Integration

- [ ] Create variant library
- [ ] Update `experiments.js` for landing page
- [ ] Wire up conversion tracking
- [ ] Create initial experiments (hero-headline, hero-cta)

### Week 3: Multi-Armed Bandit

- [ ] Implement Thompson Sampling
- [ ] Update assignment logic to use bandit
- [ ] Add regret tracking
- [ ] Dashboard integration

### Week 4: AI Hypothesis Generator

- [ ] Pattern analysis for completed experiments
- [ ] Auto-generation of new experiments
- [ ] (Optional) LLM-powered variant generation
- [ ] Full monitoring dashboard

---

## Files to Create/Modify

### New Files

```
src/services/experiments/
├── auto-optimizer.ts          # Core optimization loop
├── thompson-sampler.ts        # Multi-armed bandit
├── hypothesis-generator.ts    # AI pattern analysis
├── variant-library.ts         # Landing page variants
└── optimizer-scheduler.ts     # Cloud Function

apps/website/ferni-website/src/js/
├── experiment-variants.js     # Apply variants to DOM
└── conversion-tracking.js     # Track goals

src/api/
└── optimizer-routes.ts        # Admin dashboard API
```

### Modified Files

```
src/services/experiments/web-experiments.ts  # Add bandit support
src/api/v1/admin/experiments.ts              # Add optimizer endpoints
apps/website/ferni-website/src/story-brand.njk      # Add experiment hooks
apps/website/ferni-website/src/js/main.js           # Include new scripts
```

---

## Success Metrics

| Metric                     | Target   | Measurement                            |
| -------------------------- | -------- | -------------------------------------- |
| Experiments auto-graduated | 80%      | % of experiments that reach conclusion |
| Time to significance       | <14 days | Average days to 95% confidence         |
| Conversion lift            | +15%     | Cumulative improvement over baseline   |
| Regret minimization        | <5%      | Traffic wasted on losing variants      |
| Hypothesis quality         | >50%     | % of AI hypotheses that show lift      |

---

## Risk Mitigation

| Risk                        | Mitigation                                |
| --------------------------- | ----------------------------------------- |
| Auto-ship breaks page       | Rollback mechanism + manual review option |
| Statistical false positives | Multiple testing correction (Bonferroni)  |
| Novelty effects             | Minimum 7-day experiment duration         |
| Sample ratio mismatch       | SRM detection in every analysis           |
| Tracking bugs               | Conversion rate sanity checks             |

---

## Next Steps

1. **Start with Phase 1** - Auto-optimizer service
2. **Add Phase 2** - Wire up landing page experiments
3. **Deploy and monitor** - Run first experiments
4. **Add Phase 3** - Multi-armed bandit for efficiency
5. **Add Phase 4** - AI hypothesis generation

Ready to begin implementation?
