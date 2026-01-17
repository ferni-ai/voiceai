# 🧠 Intelligent Routing System

> **Beyond Semantic Matching: A 6-Strategy Cascade for Human-Like Tool Selection**

The intelligent routing system represents the next evolution of Ferni's tool selection, combining fast pattern matching, reinforcement learning, and LLM reasoning into a unified cascade that adapts to each user.

## 🎯 Overview

Traditional semantic routing uses embeddings to match user queries to tools. Intelligent routing goes further:

| Strategy | Latency | Use Case |
|----------|---------|----------|
| **Intent Classifier** | < 1ms | Clear patterns ("play music", "talk to maya") |
| **Semantic Router** | ~10ms | Context-aware matching |
| **Bandit Optimizer** | < 1ms | Learns from outcomes via Thompson Sampling |
| **LLM Fallback** | ~500ms | Ambiguous requests |
| **ReAct Reasoning** | ~800ms | Complex intents needing explanation |
| **Goal Planner** | ~1-2s | Multi-step requests |

## 🚀 Quick Start

### Basic Usage

```typescript
import {
  initializeIntelligentRouter,
  startIntelligentRouting,
  recordIntelligentOutcome,
} from './integration/index.js';

// Initialize on startup
await initializeIntelligentRouter({
  enableBanditPersistence: true,
  useGemini: true,
});

// Route user input
const decision = await startIntelligentRouting('play some jazz music', {
  userId: 'user123',
  sessionId: 'session456',
  personaId: 'ferni',
});

console.log(decision.toolId);      // 'spotify_play'
console.log(decision.decidedBy);   // 'intent-classifier'
console.log(decision.confidence);  // 0.95

// Record outcome for learning
recordIntelligentOutcome(decision, { success: true, reward: 1.0 });
```

### Cache Warming

```typescript
import { warmIntelligentRouting, quickWarmup, fullWarmup } from './intelligent';

// Quick warmup (< 50ms)
await quickWarmup();

// Full warmup with active users
await fullWarmup(['user123', 'user456']);
```

### A/B Testing

```typescript
import {
  enableIntelligentRouting,
  shouldUseIntelligentRouting,
  recordABTestResult,
} from './intelligent';

// Enable with 20% traffic
enableIntelligentRouting(20);

// Check variant for user
if (shouldUseIntelligentRouting(userId)) {
  // Use intelligent routing
} else {
  // Use semantic routing (control)
}

// Record results
recordABTestResult(userId, decision, success);
```

## 📁 Module Structure

```
intelligent/
├── intent-classifier.ts      # Fast pattern-based classification
├── bandit-optimizer.ts       # Thompson Sampling RL
├── llm-fallback.ts          # LLM-based selection for uncertainty
├── react-reasoning.ts       # Explainable step-by-step reasoning
├── goal-planner.ts          # Multi-step request decomposition
├── orchestrator.ts          # Main cascade coordinator
├── ferni-intents.ts         # Core Ferni intent definitions
├── extended-intents.ts      # Weather, timers, reminders, etc.
├── llm-providers.ts         # Gemini, OpenAI, Claude providers
├── bandit-persistence.ts    # Firestore persistence
├── observability.ts         # Metrics and alerting
├── ab-testing.ts            # A/B testing framework
├── cache-warming.ts         # Startup cache warming
├── benchmarks.ts            # Performance benchmarks
└── __tests__/               # Test suites
```

## 🎭 Intent Categories

### Core Intents (`ferni-intents.ts`)

| Category | Examples | Tool IDs |
|----------|----------|----------|
| **Handoffs** | "talk to maya", "switch to peter" | `handoff_*` |
| **Music** | "play music", "pause", "skip" | `spotify_*` |
| **Habits** | "log workout", "morning routine" | `habit_*` |
| **Calendar** | "what's on my calendar" | `calendar_*` |
| **Finance** | "check my portfolio" | `portfolio_*`, `budget_*` |
| **Planning** | "help me plan a trip" | `goal_*`, `event_*` |
| **Wisdom** | "I need some wisdom" | `quote_*`, `reflection_*` |
| **Emotional** | "I'm feeling stressed" | `stress_*`, `sadness_*` |
| **Crisis** | "I need urgent help" | `crisis_help` (priority 20) |
| **Memory** | "remember that..." | `memory_*` |
| **Smalltalk** | "hello", "thanks" | `__conversation__` |

### Extended Intents (`extended-intents.ts`)

| Category | Examples | Tool IDs |
|----------|----------|----------|
| **Weather** | "what's the weather", "will it rain" | `weather_*` |
| **Reminders** | "remind me to...", "show reminders" | `reminder_*` |
| **Timers** | "set a 5 minute timer" | `timer_*` |
| **Alarms** | "wake me up at 7am" | `alarm_*` |
| **Notes** | "take a note", "voice memo" | `note_*`, `voicememo_*` |
| **Spotify** | "play my liked songs", "chill music" | `spotify_playlist`, `spotify_mood` |
| **Search** | "search for...", "define..." | `search_*` |
| **Location** | "find nearest...", "directions to" | `location_*` |
| **DateTime** | "what time is it" | `datetime_*` |

## 🎰 Bandit Optimizer (Thompson Sampling)

The bandit optimizer learns which tools work best for each context using Thompson Sampling:

```typescript
// Selection with contextual features
const result = bandit.select(['spotify_play', 'calendar_check'], {
  intentCategory: 'music',
  timeOfDay: 'evening',
  personaId: 'ferni',
});

// Record outcome
bandit.recordReward(result.toolId, 1.0); // Success
bandit.recordReward(result.toolId, 0.0); // Failure
```

### Reward Calculation

```typescript
// Implicit rewards (from user behavior)
const reward = calculateImplicitReward({
  continued: true,     // User continued conversation
  corrected: false,    // User didn't correct
  thanked: true,       // User said thanks
  switchedTopic: false,
  responseTimeMs: 500,
});

// Explicit rewards (from feedback)
const reward = calculateExplicitReward({
  thumbs: 'up',   // 1.0
  rating: 5,      // 1.0
  helpful: true,  // 1.0
});
```

## 🔌 LLM Providers

Three production-ready providers:

```typescript
// Auto-detect from environment
const provider = createProviderFromEnv();

// Or explicit configuration
const gemini = createGeminiProvider({
  apiKey: process.env.GOOGLE_API_KEY,
  model: 'gemini-2.0-flash-exp',
  temperature: 0.3,
});

const openai = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o-mini',
});

const claude = createClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-3-haiku-20240307',
});
```

All providers implement:
- `selectTool()` - For LLM fallback
- `reason()` - For ReAct reasoning
- `createPlan()` - For goal planning

## 📊 Observability

### Recording Metrics

```typescript
import {
  recordRoutingDecision,
  recordRoutingOutcome,
  getDashboardData,
  checkAlerts,
} from './intelligent';

// Record each routing decision
recordRoutingDecision(decision, {
  userId,
  sessionId,
  personaId,
  input: userText,
});

// Record outcome
recordRoutingOutcome(decision, { success: true }, context);

// Get dashboard data
const dashboard = getDashboardData();
// Returns: summary, strategyBreakdown, topTools, recentErrors, hourlyTrends

// Check for alerts
const alerts = checkAlerts();
// Alerts for: high error rate, slow latency, low confidence
```

### Alert Rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | > 10% | Error |
| Slow Latency | P95 > 500ms | Warning |
| Very Slow Latency | P99 > 2000ms | Critical |
| Low Confidence | Avg < 50% | Warning |

## 🧪 A/B Testing

### Pre-defined Experiments

1. **intelligent-vs-semantic** - Full comparison of routing systems
2. **confidence-threshold** - Optimize the confidence threshold

### Traffic Control

```typescript
// Enable with specific traffic percentage
enableIntelligentRouting(10);  // 10% to intelligent
enableIntelligentRouting(50);  // 50% to intelligent

// Get results
const { experiments, results } = getExperimentDashboard();
```

### Experiment Results

```typescript
const results = getExperimentDashboard().results[0];

console.log(results.controlStats.successRate);  // 0.82
console.log(results.variantStats[0].successRate);  // 0.91
console.log(results.winner);  // 'intelligent-full'
console.log(results.confidenceLevel);  // 0.95
```

## 🔥 Cache Warming

### Startup Warmup

```typescript
// Quick warmup (essential only)
await quickWarmup();
// Time: ~50ms
// Warms: intent classifier, sample queries

// Full warmup (production)
await fullWarmup(['user123', 'user456']);
// Time: ~500ms
// Warms: everything including LLM provider test
```

### Periodic Refresh

```typescript
// Refresh bandit arms every 5 minutes
startPeriodicRefresh(5 * 60 * 1000);

// Stop refresh
stopPeriodicRefresh();
```

## 📈 Benchmarks

Run benchmarks:

```bash
npx tsx src/tools/semantic-router/advanced/intelligent/benchmarks.ts
```

Expected results:

| Strategy | Avg Latency | P95 | QPS |
|----------|-------------|-----|-----|
| Intent Classifier | 0.2ms | 0.5ms | 5000 |
| Bandit Optimizer | 0.1ms | 0.3ms | 10000 |
| Full Cascade (no LLM) | 5ms | 12ms | 200 |

## 🛡️ Best Practices

### Do ✅

- **Warm on startup** - Call `quickWarmup()` in your entry point
- **Record outcomes** - Always call `recordIntelligentOutcome()` for learning
- **Use A/B testing** - Validate before rolling out to 100%
- **Monitor alerts** - Check `checkAlerts()` regularly
- **Persist bandit arms** - Enable `enableBanditPersistence: true`

### Don't ❌

- **Skip warmup** - Cold start adds 200-500ms latency
- **Ignore outcomes** - Bandit can't learn without rewards
- **Deploy without A/B** - Always validate in production
- **Hardcode tool IDs** - Use intent patterns instead

## 🔗 Integration Points

### Voice Agent

```typescript
// In transcript-handler.ts
if (shouldUseIntelligentRouting(userId)) {
  const result = await startIntelligentRouting(transcript, context);
  if (result.handled) {
    return; // Skip LLM processing
  }
} else {
  const result = await routeTranscript(transcript, context);
  // ... existing flow
}
```

### API Routes

```typescript
// GET /api/intelligent-routing/dashboard
app.get('/api/intelligent-routing/dashboard', (req, res) => {
  res.json(getDashboardData());
});

// GET /api/intelligent-routing/alerts
app.get('/api/intelligent-routing/alerts', (req, res) => {
  res.json(checkAlerts());
});
```

## 📚 Related Documentation

- [Semantic Router Architecture](../../../docs/architecture/SEMANTIC-ROUTER.md)
- [Tool Development Guide](../../CLAUDE.md)
- [Function Calling System](../../../docs/architecture/FUNCTION-CALLING-SYSTEM.md)
