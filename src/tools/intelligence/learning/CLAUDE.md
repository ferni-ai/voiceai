# Learning & Experimentation System

> **Autonomous A/B testing, multi-armed bandits, and auto-escalating rollouts.**

This module provides a complete experimentation platform for data-driven decision making. It supports traditional A/B tests, Thompson Sampling bandits for dynamic traffic allocation, and auto-escalating rollouts with automatic promotion/rollback.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ExperimentManager                            │
│  (Central orchestrator - creates, manages, and checks all      │
│   experiments autonomously)                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  A/B Testing  │     │   Bandit      │     │  Auto-Rollout │
│  (ab-testing) │     │  (bandit)     │     │ (auto-rollout)│
│               │     │               │     │               │
│  Z-test       │     │  Thompson     │     │  Stage-based  │
│  significance │     │  Sampling     │     │  escalation   │
└───────────────┘     └───────────────┘     └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                  ┌───────────────────┐
                  │ Sequential Test   │
                  │ (SPRT early stop) │
                  └───────────────────┘
                              │
                              ▼
                  ┌───────────────────┐
                  │  Outcome Tracker  │
                  │  (metrics store)  │
                  └───────────────────┘
```

---

## Directory Structure

```
src/tools/intelligence/learning/
├── CLAUDE.md                    # This file
├── index.ts                     # Module exports
├── ab-testing.ts                # Classic A/B test manager
├── auto-rollout.ts              # Auto-escalating rollout manager
├── bandit.ts                    # Thompson Sampling multi-armed bandit
├── sequential-test.ts           # SPRT early stopping
├── experiment-manager.ts        # Central orchestrator
├── outcome-tracker.ts           # Metrics and outcome tracking
├── ftis-rollout.ts              # FTIS-specific rollout
└── learning-pipeline.ts         # Learning pipeline integration
```

---

## Key Concepts

### Experiment Types

| Type | Algorithm | When to Use |
|------|-----------|-------------|
| `ab` | Z-test for significance | Fixed sample size, clear hypothesis |
| `bandit` | Thompson Sampling | Minimize regret, dynamic optimization |
| `rollout` | Stage-based escalation | Safe feature deployment |

### Thompson Sampling (Bandit)

Multi-armed bandit using Beta distributions:

```typescript
// Each variant has Beta(α, β) distribution
// α = successes + 1, β = failures + 1
// Sample from each, pick highest

interface BanditVariant {
  id: string;
  alpha: number;  // Beta distribution α
  beta: number;   // Beta distribution β
  pulls: number;  // Total assignments
}

// Algorithm:
// 1. For each variant, sample θ ~ Beta(α, β)
// 2. Select variant with highest θ
// 3. After outcome: success → α++, failure → β++
```

**Key insight:** Thompson Sampling naturally balances exploration (trying uncertain variants) with exploitation (favoring known winners).

### Auto-Escalating Rollout

Stage-based deployment with automatic progression:

```typescript
// Default stages
const stages = [
  { percentage: 2, minDurationMs: 3600000, minSamples: 100 },   // 2% for 1hr
  { percentage: 10, minDurationMs: 3600000, minSamples: 200 },  // 10% for 1hr
  { percentage: 25, minDurationMs: 7200000, minSamples: 500 },  // 25% for 2hr
  { percentage: 50, minDurationMs: 14400000, minSamples: 1000 }, // 50% for 4hr
  { percentage: 100, minDurationMs: 0, minSamples: 0 },          // 100% (done)
];
```

**Promotion criteria:**
- Sample size ≥ minSamples
- Duration ≥ minDuration
- Confidence ≥ 95%
- No degradation vs baseline

**Rollback triggers:**
- Treatment degradation > 5%
- Error rate spike
- Manual override

### Sequential Testing (SPRT)

Sequential Probability Ratio Test for early stopping:

```typescript
// Wald's boundaries
const A = (1 - beta) / alpha;  // Accept H1 boundary
const B = beta / (1 - alpha);  // Accept H0 boundary

// At each sample, compute likelihood ratio Λ
// If Λ ≥ A → Accept H1 (treatment wins)
// If Λ ≤ B → Accept H0 (control wins)
// Otherwise → Continue sampling
```

**Benefits:**
- No fixed sample size required
- Can stop early when evidence is clear
- Maintains statistical guarantees

---

## Usage

### Creating an Experiment

```typescript
import { getExperimentManager } from '../tools/intelligence/learning/index.js';

const manager = getExperimentManager();

// Create A/B test
manager.createExperiment({
  id: 'voice-speed-test',
  name: 'Voice Speed Test',
  type: 'ab',
  variants: [
    { id: 'control', name: 'Normal Speed', trafficPercent: 50 },
    { id: 'treatment', name: 'Faster Speed', trafficPercent: 50 },
  ],
  primaryMetric: 'completion_rate',
  autoPromote: true,
  autoRollback: true,
});

// Create bandit
manager.createExperiment({
  id: 'greeting-optimizer',
  name: 'Greeting Optimizer',
  type: 'bandit',
  variants: [
    { id: 'formal', name: 'Formal Greeting' },
    { id: 'casual', name: 'Casual Greeting' },
    { id: 'friendly', name: 'Friendly Greeting' },
  ],
  primaryMetric: 'engagement_score',
  banditConfig: {
    explorationFactor: 1.0,
    minExploration: 0.05,
  },
});

// Create rollout
manager.createExperiment({
  id: 'new-feature-rollout',
  name: 'New Feature Rollout',
  type: 'rollout',
  variants: [
    { id: 'control', name: 'Without Feature' },
    { id: 'treatment', name: 'With Feature' },
  ],
  primaryMetric: 'success_rate',
  rolloutConfig: {
    stages: DEFAULT_STAGES,
    minConfidence: 0.95,
  },
});
```

### Recording Outcomes

```typescript
// Record a successful outcome
manager.recordOutcome('voice-speed-test', 'treatment', {
  success: true,
  value: 1,
  metric: 'completion_rate',
});

// Record a failed outcome
manager.recordOutcome('voice-speed-test', 'control', {
  success: false,
  value: 0,
  metric: 'completion_rate',
});
```

### Getting Assignments

```typescript
// Get variant assignment for a user
const variant = manager.getAssignment('voice-speed-test', userId);
// Returns: 'control' | 'treatment'

// For bandits, this uses Thompson Sampling
// For A/B, this uses traffic percentage
// For rollouts, this uses current stage percentage
```

### Checking Status

```typescript
// Check if ready to promote
const promotion = manager.checkPromotion('voice-speed-test');
// Returns: { shouldPromote, winner, confidence, reason, blockingIssues }

// Check if should rollback
const rollback = manager.checkRollback('voice-speed-test');
// Returns: { shouldRollback, reason, severity }

// Get health status
const health = manager.getExperimentHealth('voice-speed-test');
// Returns: { status, recommendations, typeStatus, lastCheck }
```

---

## API Endpoints

The experiment system is exposed via REST API:

```
GET  /api/experiments              - List all experiments
GET  /api/experiments/summary      - Get experiment summary
GET  /api/experiments/:id          - Get experiment details
GET  /api/experiments/:id/health   - Get experiment health
POST /api/experiments              - Create new experiment
POST /api/experiments/:id/start    - Start experiment
POST /api/experiments/:id/pause    - Pause experiment
POST /api/experiments/:id/resume   - Resume experiment
POST /api/experiments/:id/complete - Complete experiment
POST /api/experiments/:id/promote  - Promote winner
POST /api/experiments/:id/rollback - Force rollback
DELETE /api/experiments/:id        - Delete experiment
```

**Implementation:** `src/api/experiment-routes.ts`

---

## CLI Commands

```bash
ferni experiments list              # List all experiments
ferni experiments status            # Show experiment summary
ferni experiments show <id>         # Show experiment details
ferni experiments health <id>       # Show experiment health
ferni experiments start <id>        # Start an experiment
ferni experiments pause <id>        # Pause an experiment
ferni experiments resume <id>       # Resume an experiment
ferni experiments complete <id>     # Complete an experiment
ferni experiments promote <id>      # Check and promote winner
ferni experiments delete <id> -f    # Delete an experiment
```

**Implementation:** `apps/cli/src/commands/experiments/experiments.ts`

---

## Configuration

### Experiment Config

```typescript
interface ExperimentConfig {
  id: string;                    // Unique identifier
  name: string;                  // Display name
  description?: string;          // Optional description
  type: 'ab' | 'bandit' | 'rollout';
  variants: VariantConfig[];
  primaryMetric: string;         // Main success metric
  secondaryMetrics?: string[];   // Additional metrics to track
  autoEscalate?: boolean;        // Auto-escalate rollouts (default: true)
  autoPromote?: boolean;         // Auto-promote winners (default: false)
  autoRollback?: boolean;        // Auto-rollback on degradation (default: true)
  schedule?: {
    startAt?: Date;              // Scheduled start time
    endAt?: Date;                // Scheduled end time
  };

  // Type-specific config
  abConfig?: {
    minSampleSize: number;       // Minimum samples per variant
  };
  banditConfig?: {
    explorationFactor?: number;  // 1.0 = pure Thompson
    minExploration?: number;     // Min traffic to all variants
    updateBatchSize?: number;    // Update after N outcomes
    priorStrength?: number;      // Prior Beta parameters
  };
  rolloutConfig?: {
    stages?: RolloutStage[];     // Rollout stages
    minConfidence?: number;      // Required confidence to advance
    checkIntervalMs?: number;    // How often to check
  };
  sequentialConfig?: {
    alpha?: number;              // Type I error rate
    beta?: number;               // Type II error rate
    minEffect?: number;          // Minimum detectable effect
    maxSamples?: number;         // Safety cap
  };
}
```

---

## Best Practices

### When to Use Each Type

| Scenario | Recommended Type |
|----------|------------------|
| "Is A better than B?" | `ab` |
| "Find the best of N variants" | `bandit` |
| "Safely deploy new feature" | `rollout` |
| "Minimize regret during test" | `bandit` |
| "Need statistical significance" | `ab` |
| "Feature might cause issues" | `rollout` |

### Sample Size Guidelines

| Effect Size | Samples/Variant | Notes |
|-------------|-----------------|-------|
| Large (10%+) | 200-500 | Quick experiments |
| Medium (5%) | 500-2000 | Typical tests |
| Small (2%) | 2000-10000 | Precision needed |

### Rollout Duration Guidelines

| Risk Level | Stage Duration | Notes |
|------------|----------------|-------|
| Low | 1-2 hours | Known-safe changes |
| Medium | 4-8 hours | Typical features |
| High | 24-48 hours | Critical paths |

---

## Monitoring & Observability

### Metrics Emitted

```
experiment_created_total          # Counter
experiment_started_total          # Counter
experiment_completed_total        # Counter
experiment_promoted_total         # Counter
experiment_rolled_back_total      # Counter
experiment_outcome_total          # Counter by variant
experiment_assignment_total       # Counter by variant
bandit_selection_total            # Counter by variant
rollout_stage_advanced_total      # Counter by stage
```

### Health Checks

The health endpoint provides:
- Overall status: `healthy`, `warning`, `critical`
- Type-specific metrics (A/B results, bandit confidence, rollout stage)
- Recommendations for action
- Last check timestamp

---

## Testing

```bash
# Run unit tests
pnpm vitest run src/tools/intelligence/learning/__tests__/

# Run E2E tests
pnpm vitest run src/tests/synthetic/experiments-e2e.test.ts
```

---

## Related Documentation

- `docs/CLI-COMMAND-REFERENCE.md` - Full CLI reference
- `docs/CEO-AUTOMATION-ROADMAP.md` - Automation strategy
- `src/api/experiment-routes.ts` - API implementation
- `apps/cli/src/commands/experiments/` - CLI implementation

---

*Last updated: January 2026*
