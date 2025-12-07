# A/B Testing System

Ferni's A/B testing framework enables data-driven persona behavior optimization. Run experiments to test different conversation approaches, analyze results, and continuously improve.

## Quick Start

### CLI Commands

```bash
# View all experiments
npm run experiments:status

# View detailed results
npm run experiments:results

# Start a predefined experiment
npm run experiments:create

# List available templates
npm run experiments -- list-templates
```

### Dashboard

Access the web dashboard at:
```
http://localhost:3003/api/experiments
```

Or view the HTML dashboard:
```
frontend-typescript/public/experiments-dashboard.html
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    A/B Testing System                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Session    │───>│  Experiment  │───>│   Agent      │       │
│  │   Manager    │    │  Integration │    │  Evolution   │       │
│  └──────────────┘    └──────────────┘    └──────────────┘       │
│         │                   │                    │               │
│         │                   ▼                    │               │
│         │           ┌──────────────┐             │               │
│         │           │   Advanced   │             │               │
│         │           │   Features   │             │               │
│         │           └──────────────┘             │               │
│         │                   │                    │               │
│         ▼                   ▼                    ▼               │
│  ┌──────────────────────────────────────────────────────┐       │
│  │                   Firestore                          │       │
│  │  (Experiment data, metrics, user assignments)        │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Experiment Flow

### 1. Create Experiment

```typescript
import { getAgentEvolution } from './intelligence/agent-evolution.js';

const evolution = getAgentEvolution();
const experiment = evolution.createExperiment({
  personaId: 'ferni',
  name: 'Storytelling Frequency',
  hypothesis: 'More stories increase engagement',
  controlBehavior: 'Standard storytelling frequency',
  treatmentBehavior: 'Increased storytelling (2x)',
  treatment: {
    promptModification: 'Share relevant personal stories twice as often',
  },
});
```

### 2. Assign Users to Variants

Users are automatically assigned when joining sessions:

```typescript
import { initializeSessionExperiments } from './services/experiments/integration.js';

// At session start
const { assignments, promptModifications } = await initializeSessionExperiments(
  userId,
  personaId
);
```

### 3. Record Metrics

```typescript
import { recordEngagementScore, recordSatisfactionScore } from './services/experiments/integration.js';

// During conversation
recordEngagementScore(userId, personaId, 0.85);

// At session end
recordSatisfactionScore(userId, personaId, 0.90);
```

### 4. View Results

```bash
npm run experiments:results

# Output:
# ┌─────────────────────────────────────────────────────────┐
# │ Experiment: Storytelling Frequency (ferni)             │
# │ Status: running | Started: 2024-01-15                  │
# ├─────────────────────────────────────────────────────────┤
# │ Engagement                                              │
# │   Control:   0.72 (n=150)                              │
# │   Treatment: 0.81 (n=148)                              │
# │   Lift: +12.5%  p-value: 0.023 *                       │
# └─────────────────────────────────────────────────────────┘
```

## Pre-built Experiment Templates

| Template | Description | Hypothesis |
|----------|-------------|------------|
| `storytelling` | Test storytelling frequency | More stories → higher engagement |
| `humor` | Test humor injection | Appropriate humor → better connection |
| `questions` | Test question styles | Open questions → deeper conversations |
| `empathy` | Test empathy expression | More empathy → higher satisfaction |
| `pacing` | Test response pacing | Slower pacing → better comprehension |

## Advanced Features

### Bayesian Analysis

Get probability-based insights:

```typescript
import { performBayesianAnalysis } from './services/experiments/advanced.js';

const result = performBayesianAnalysis(experiment);
console.log(result);
// {
//   probabilityTreatmentWins: 0.87,
//   expectedImprovement: 0.09,
//   credibleInterval: [0.02, 0.16],
//   recommendation: 'adopt_treatment',
//   confidence: 'high'
// }
```

### Multi-Armed Bandit

Dynamically shift traffic to winning variants:

```typescript
import { configureBandit, getBanditVariant } from './services/experiments/advanced.js';

// Configure MAB
configureBandit({
  algorithm: 'thompson', // or 'ucb', 'epsilon_greedy'
  explorationRate: 0.1,
});

// Get variant (automatically favors winner)
const variant = getBanditVariant(experiment, 'thompson');
```

### Experiment Scheduling

Schedule experiments to run at specific times:

```typescript
import { scheduleExperiment } from './services/experiments/advanced.js';

scheduleExperiment('exp_123', {
  startAt: new Date('2024-02-01'),
  endAt: new Date('2024-02-15'),
  daysOfWeek: [1, 2, 3, 4, 5], // Weekdays only
  hoursOfDay: [9, 10, 11, 14, 15, 16], // Business hours
  timezone: 'America/New_York',
});
```

### Segment Analysis

Break down results by user segments:

```typescript
import { registerSegment, getSegmentAnalysis } from './services/experiments/advanced.js';

// Register custom segment
registerSegment({
  id: 'power_users',
  name: 'Power Users',
  description: 'Users with 10+ sessions',
  evaluate: (profile) => profile.sessionCount >= 10,
});

// Get segment breakdown
const segments = getSegmentAnalysis('exp_123');
// Returns results broken down by:
// - new_users vs returning_users
// - free vs subscriber
// - platform (web, ios, android)
// - power_users (custom)
```

### Alerting

Get notified when experiments conclude:

```typescript
import { configureExperimentAlerts } from './services/experiments/advanced.js';

configureExperimentAlerts({
  slackWebhookUrl: process.env.SLACK_EXPERIMENTS_WEBHOOK_URL,
  emailRecipients: ['team@ferni.ai'],
  alertOnConclusion: true,
  alertOnSignificance: true,
  minImprovementToAlert: 0.05, // 5% lift threshold
});
```

## Statistical Significance

Experiments auto-conclude when:

1. **Minimum sample size** reached (default: 100 per variant)
2. **Statistical significance** achieved (p < 0.05)

The system uses Z-tests for proportion comparisons:

```
Z = (p_treatment - p_control) / sqrt(p_pooled * (1 - p_pooled) * (1/n_t + 1/n_c))
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/experiments` | GET | List all experiments |
| `/api/experiments/:id` | GET | Get experiment details |
| `/api/experiments` | POST | Create experiment |
| `/api/experiments/:id/start` | POST | Start experiment |
| `/api/experiments/:id/stop` | POST | Stop experiment |
| `/api/experiments/dashboard` | GET | Dashboard data |

## Files

| File | Purpose |
|------|---------|
| `src/intelligence/agent-evolution.ts` | Core experiment engine |
| `src/services/experiments/integration.ts` | Session integration |
| `src/services/experiments/api.ts` | REST API |
| `src/services/experiments/advanced.ts` | Advanced features |
| `src/cli/experiments-cli.ts` | CLI interface |
| `frontend-typescript/public/experiments-dashboard.html` | Web dashboard |

## Best Practices

1. **Run one experiment per persona** at a time
2. **Set realistic sample sizes** (min 100 per variant)
3. **Define clear hypotheses** before starting
4. **Let experiments run to completion** - don't stop early
5. **Document learnings** from each experiment
6. **Use segments** to understand who benefits most
7. **Roll out gradually** - use MAB for safer deployment

## Example: Complete Experiment Lifecycle

```typescript
// 1. Create experiment
const exp = evolution.createExperiment({
  personaId: 'ferni',
  name: 'Empathy Expressions',
  hypothesis: 'Explicit empathy increases satisfaction',
  controlBehavior: 'Standard empathy',
  treatmentBehavior: 'Enhanced empathy expressions',
  treatment: {
    promptModification: 'Express empathy explicitly: "I can understand how that feels..."',
  },
});

// 2. Start experiment
startExperiment('ferni', exp.id);

// 3. Experiment runs automatically during sessions
// - Users assigned to control/treatment
// - Metrics recorded after each response
// - Auto-concludes when significant

// 4. Check results
const results = await getExperimentResults(exp.id);
console.log(`Winner: ${results.winner} (${results.confidence}% confidence)`);

// 5. Apply learnings
if (results.winner === 'treatment') {
  // Update persona prompt with winning behavior
}
```

## Troubleshooting

### Experiment not starting

```bash
# Check if experiments are loading
npm run experiments:status

# Verify Firestore connection
npx tsx scripts/test-storage.ts
```

### No data appearing

1. Verify `initializeSessionExperiments()` is called at session start
2. Check `recordEngagementScore()` is called during conversations
3. Ensure `cleanupSessionExperiments()` is called at session end

### Results seem wrong

1. Check sample sizes are sufficient (n > 30 minimum)
2. Verify metrics are being recorded for both variants
3. Look for segment-specific effects

---

*Built for Ferni AI - Making conversations more human through data-driven optimization.*

