# A/B Testing System

## Overview

Ferni's A/B testing system enables data-driven optimization of persona behaviors. Test different approaches (humor levels, question styles, empathy expressions) and measure their impact on user engagement.

## Quick Start

### View Experiments

```bash
# CLI Dashboard (terminal)
npm run experiments

# Detailed status
npm run experiments:status

# View results
npm run experiments:results
```

### Web Dashboard

Open `http://localhost:3000/experiments-dashboard.html` in your browser for a visual dashboard showing:
- Running experiments
- Sample collection progress
- Real-time metrics
- Results and recommendations

### Start an Experiment

```bash
# See available templates
npm run experiments:create

# Start from template
npx tsx src/cli/experiments-cli.ts start-template 1
```

Or programmatically:

```typescript
import { startExperiment } from './services/index.js';

const experiment = startExperiment({
  personaId: 'ferni',
  name: 'My Custom Test',
  hypothesis: 'Testing a new approach',
  trafficAllocation: 0.5, // 50% to treatment
  minimumSampleSize: 100,
  control: { description: 'Current behavior' },
  treatment: {
    description: 'New behavior',
    promptModification: 'Be more friendly and warm',
  },
});
```

---

## How It Works

### 1. User Assignment (Session Start)

When a session starts, users are deterministically assigned to experiment variants:

```typescript
// Automatically happens in session creation
initializeSessionExperiments(sessionId, userId, personaId);
```

- **Deterministic**: Same user always gets same variant
- **Consistent**: Works across sessions and devices
- **Per-experiment**: User can be in different variants for different experiments

### 2. Prompt Modification (During Conversation)

Treatment users receive modified prompts:

```typescript
const modifications = services.getExperimentModifications();
// Returns: "[EXPERIMENTAL ADJUSTMENTS]\nBe more friendly..."
```

This is automatically injected into the persona's system prompt.

### 3. Metric Collection (During & After)

```typescript
// Record engagement after each turn
services.recordEngagement(0.75);

// Record questions for breakthrough detection
services.recordQuestion("What's on your mind today?", currentEngagement);
```

### 4. Experiment Conclusion

When enough samples are collected (default: 100), the experiment automatically concludes:
- Winner determined (control vs treatment)
- Statistical confidence calculated
- Winning prompt modifications can be adopted

---

## Pre-Built Templates

| Template | What It Tests |
|----------|---------------|
| **Humor Frequency** | Does more humor improve engagement? |
| **Storytelling** | Do more personal stories help? |
| **Question Style** | Open-ended vs closed questions |
| **Empathy Expression** | Explicit vs natural empathy |
| **Pacing** | Deliberate vs natural pacing |

---

## API Reference

### Dashboard API

```typescript
import {
  getExperimentDashboard,
  getExperiment,
  createExperiment,
  stopExperiment,
  startExperimentFromTemplate,
} from './services/index.js';

// Get full dashboard data
const dashboard = getExperimentDashboard();
// Returns: { summary, experiments, adjustments, breakthroughs }

// Get single experiment
const exp = getExperiment('exp_ferni_123');

// Create custom experiment
const newExp = createExperiment({ ... });

// Stop running experiment early
stopExperiment('exp_ferni_123');
```

### Session Integration

```typescript
// SessionServices methods
services.recordEngagement(score: number)
services.recordQuestion(question: string, currentEngagement: number)
services.getExperimentModifications(): string
services.getBreakthroughs(): BreakthroughQuestion[]
```

### CLI Commands

```bash
npm run experiments          # Overview
npm run experiments:status   # Detailed status
npm run experiments:results  # View results
npm run experiments:create   # See templates
```

---

## Breakthrough Questions

The system automatically detects "breakthrough questions" - questions that cause significant engagement lifts (20%+):

```typescript
const breakthroughs = services.getBreakthroughs();
// [{ question: "What's really bothering you?", engagementLift: 0.35 }]
```

These are shared with the community learning system to improve all personas.

---

## Metrics Collected

| Metric | Description |
|--------|-------------|
| **Engagement** | Average engagement score across turns |
| **Satisfaction** | Positive/neutral/negative signals |
| **Depth** | Conversation depth (topics explored) |

---

## Statistical Methods

- **Assignment**: FNV-1a hash of userId + experimentId, normalized to [0,1]
- **Significance**: Z-score > 1.96 for 95% confidence
- **Sample Size**: Default 100 minimum for statistical power
- **Auto-Conclusion**: Experiments conclude when minimum samples reached

---

## Persistence

Experiments persist to Firestore automatically:
- Survives server restarts
- Shared across instances
- Loaded on startup via `initializeAgentEvolution()`

---

## Best Practices

### 1. Run One Change at a Time
Test a single variable per experiment for clear results.

### 2. Use Sufficient Sample Size
Default of 100 provides ~80% power to detect 10% improvements.

### 3. Don't Peek Too Early
Let experiments run to completion for valid results.

### 4. Document Your Hypothesis
Clear hypotheses make results actionable.

### 5. Adopt Winners Gradually
Roll out winning treatments over time, monitoring for issues.

---

## Architecture

```
src/services/experiment-integration.ts  # Core A/B logic
src/services/experiment-api.ts          # Dashboard API
src/intelligence/agent-evolution.ts     # Persistence & engine
src/cli/experiments-cli.ts              # CLI interface
apps/web/public/experiments-dashboard.html  # Web UI
```

---

## Troubleshooting

### Experiments Not Showing
1. Check if `initializeAgentEvolution()` is called at startup
2. Verify Firestore connection (non-fatal if missing)

### No Metrics Being Recorded
1. Ensure `recordEngagement()` is called each turn
2. Check session cleanup happens (calls `cleanupSessionExperiments()`)

### All Users Getting Same Variant
1. Verify userId is unique per user
2. Check trafficAllocation isn't 0 or 1

---

## Example: Full Experiment Lifecycle

```typescript
// 1. Create experiment
const exp = startExperiment({
  personaId: 'ferni',
  name: 'Warmth Test',
  hypothesis: 'Warmer greetings improve first-turn engagement',
  trafficAllocation: 0.5,
  minimumSampleSize: 50,
  control: { description: 'Standard greeting' },
  treatment: {
    description: 'Extra warm greeting',
    promptModification: 'Start every conversation with genuine warmth and a personal touch.',
  },
});

// 2. Monitor progress
const results = getExperimentResults(exp.id);
console.log(`Progress: ${results.metrics.engagement.controlN + results.metrics.engagement.treatmentN}/50`);

// 3. View results when complete
if (results.status === 'concluded') {
  console.log(`Winner: ${results.winner}`);
  console.log(`Improvement: ${(results.metrics.engagement.treatment - results.metrics.engagement.control) * 100}%`);
}

// 4. If treatment won, consider adopting the prompt modification permanently
```

---

## Advanced Features (Production Ready)

### 1. Slack/Email Alerting

Get notified when experiments conclude:

```typescript
import { configureAlerts } from './services/index.js';

configureAlerts({
  slackWebhookUrl: process.env.SLACK_EXPERIMENTS_WEBHOOK_URL,
  emailRecipients: ['team@example.com'],
  alertOnConclusion: true,
  alertOnSignificance: true,
  minImprovementToAlert: 0.05, // 5%
});
```

Set `SLACK_EXPERIMENTS_WEBHOOK_URL` in your environment. Alerts include:
- Experiment name and winner
- Improvement percentage and confidence
- Recommendation for action

### 2. Bayesian Analysis

More sophisticated statistics with credible intervals:

```typescript
import { getBayesianAnalysis } from './services/index.js';

const analysis = getBayesianAnalysis('exp_ferni_123');
// {
//   probabilityTreatmentWins: 0.94,
//   expectedImprovement: 0.08,
//   credibleInterval: [0.03, 0.13],
//   expectedLoss: 0.002,
//   recommendation: 'adopt_treatment',
//   confidence: 'high'
// }
```

Benefits over frequentist:
- Direct probability statements ("94% chance treatment is better")
- Decision-focused recommendations
- Expected loss calculations

### 3. Multi-Armed Bandit

Dynamically shift traffic to the winning variant:

```typescript
import { configureMAB } from './services/index.js';

configureMAB({
  enabled: true,
  algorithm: 'thompson', // or 'ucb' (Upper Confidence Bound)
  minExplorationRate: 0.1, // Always explore 10%
});
```

Algorithms:
- **Thompson Sampling**: Samples from posterior distributions, balances exploration/exploitation
- **UCB**: Uses upper confidence bounds, more deterministic

### 4. Experiment Scheduling

Start/stop experiments at specific times:

```typescript
import { scheduleExperimentTime } from './services/index.js';

scheduleExperimentTime('exp_ferni_123', 'ferni', {
  startAt: new Date('2025-01-15T09:00:00Z'),
  endAt: new Date('2025-01-22T17:00:00Z'),
  daysOfWeek: [1, 2, 3, 4, 5], // Weekdays only
  hoursOfDay: [9, 10, 11, 12, 13, 14, 15, 16, 17], // Business hours
  timezone: 'America/New_York',
});
```

### 5. Segment Analysis

Break down results by user type:

```typescript
import { getSegments, setSessionUserProfile } from './services/index.js';

// Enable segment tracking
setSessionUserProfile(sessionId, {
  totalConversations: 15,
  platform: 'web',
  subscriptionTier: 'premium',
});

// Get segment breakdown
const segments = getSegments('exp_ferni_123');
// [
//   { segmentId: 'new_users', improvement: 0.15, isSignificant: true },
//   { segmentId: 'returning_users', improvement: 0.03, isSignificant: false },
// ]
```

Built-in segments:
- `new_users` (< 5 conversations)
- `returning_users` (5+ conversations)
- `power_users` (20+ conversations)
- `web_users`, `mobile_users`
- `free_users`, `premium_users`

---

## API Endpoints (Advanced)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/experiments/:id/bayesian` | GET | Bayesian analysis |
| `/api/experiments/:id/segments` | GET | Segment breakdown |
| `/api/experiments/segments` | GET | Available segments |
| `/api/experiments/schedules` | GET | Scheduled experiments |

