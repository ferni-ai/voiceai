# Experiments & A/B Testing System

> Autonomous A/B testing, multi-armed bandits, and auto-escalating rollouts.

**Location:** `src/tools/experiments/`

---

## Directory Structure

```
experiments/
├── CLAUDE.md                  # This file
├── index.ts                   # Module exports
├── ab-testing.ts              # Classic A/B test manager (Z-test significance)
├── auto-rollout.ts            # Auto-escalating rollout with stage-based progression
├── bandit.ts                  # Thompson Sampling multi-armed bandit
├── sequential-test.ts         # SPRT early stopping
├── experiment-manager.ts      # Central orchestrator
└── outcome-tracker.ts         # Metrics and outcome tracking
```

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

## Experiment Types

| Type | Algorithm | When to Use |
|------|-----------|-------------|
| `ab` | Z-test for significance | Fixed sample size, clear hypothesis |
| `bandit` | Thompson Sampling | Minimize regret, dynamic optimization |
| `rollout` | Stage-based escalation (2%→10%→25%→50%→100%) | Safe feature deployment |

---

## Usage

```typescript
import { getExperimentManager } from '../tools/experiments/index.js';

const manager = getExperimentManager();

// Create A/B test
manager.createExperiment({
  id: 'voice-speed-test',
  type: 'ab',
  variants: [
    { id: 'control', name: 'Normal Speed', trafficPercent: 50 },
    { id: 'treatment', name: 'Faster Speed', trafficPercent: 50 },
  ],
  primaryMetric: 'completion_rate',
});

// Record outcome
manager.recordOutcome('voice-speed-test', 'treatment', {
  success: true, value: 1, metric: 'completion_rate',
});

// Get assignment (uses Thompson Sampling for bandits, traffic % for A/B)
const variant = manager.getAssignment('voice-speed-test', userId);

// Check promotion/rollback
const promotion = manager.checkPromotion('voice-speed-test');
const rollback = manager.checkRollback('voice-speed-test');
```

---

## API Endpoints

```
GET  /api/experiments              - List all experiments
GET  /api/experiments/summary      - Get experiment summary
GET  /api/experiments/:id          - Get experiment details
GET  /api/experiments/:id/health   - Get experiment health
POST /api/experiments              - Create new experiment
POST /api/experiments/:id/start    - Start experiment
POST /api/experiments/:id/promote  - Promote winner
POST /api/experiments/:id/rollback - Force rollback
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
ferni experiments promote <id>      # Check and promote winner
```

**Implementation:** `apps/cli/src/commands/experiments/experiments.ts`

---

## Testing

```bash
pnpm vitest run src/tools/experiments/

pnpm vitest run src/tests/synthetic/experiments-e2e.test.ts
```

---

## Related Documentation

- `src/api/experiment-routes.ts` - API implementation
- `apps/cli/src/commands/experiments/` - CLI implementation
- Root `CLAUDE.md` - Experiments & A/B Testing section

---

*Last updated: January 2026*
