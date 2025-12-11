# Conversation Orchestrator Usage Guide

The **ConversationOrchestrator** is a unified system for humanizing AI responses through a clean 4-phase pipeline. It replaces the complex, interleaved logic with a maintainable architecture.

## Quick Start

```typescript
import { createOrchestratedHumanizer, orchestratorConfig } from '@ferni/conversation';

// Create humanizer (drop-in replacement for ConversationHumanizer)
const humanizer = createOrchestratedHumanizer(sessionId, 'ferni', userId);

// Humanize a response
const result = await humanizer.humanizeResponseAsync(llmResponse, {
  personaId: 'ferni',
  turnNumber: 5,
  userMessage: userInput,
  topic: 'career',
  wasPersonalSharing: true,
});

// Use the humanized response
console.log(result.text); // Humanized text
console.log(result.ssml); // SSML for speech synthesis
console.log(result.appliedFeatures); // What was applied
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ConversationOrchestrator                  │
├─────────────────────────────────────────────────────────────┤
│  Phase 1: ANALYSIS                                          │
│  - Message analysis (energy, engagement, topic weight)      │
│  - Signal detection (breakthrough, evidence, hesitation)    │
├─────────────────────────────────────────────────────────────┤
│  Phase 2: INTELLIGENCE                                      │
│  - Session intelligence (concern, predictions)              │
│  - Better-than-human (relationship, emotional memory)       │
│  - Deep humanization (mood tracking)                        │
├─────────────────────────────────────────────────────────────┤
│  Phase 3: HUMANIZATION                                      │
│  - Speech naturalization (disfluencies, hedging)            │
│  - Vocal humanization (energy matching, contractions)       │
│  - Advanced humanization (self-correction, catching-self)   │
│  - Content delivery pacing                                  │
├─────────────────────────────────────────────────────────────┤
│  Phase 4: OUTPUT                                            │
│  - Apply SSML enhancements                                  │
│  - Compile features list                                    │
│  - Generate metadata                                        │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

### Presets

Apply presets based on persona or context:

```typescript
import { orchestratorConfig } from '@ferni/conversation';

// Apply a preset
orchestratorConfig.applyPreset('therapeutic'); // For Ferni (emotional support)
orchestratorConfig.applyPreset('expert'); // For Nayan (authoritative)
orchestratorConfig.applyPreset('conversational'); // For Peter (friendly)
orchestratorConfig.applyPreset('minimal'); // For low-latency scenarios

// Or let the system choose based on persona
const preset = orchestratorConfig.getRecommendedPreset('ferni');
orchestratorConfig.applyPreset(preset);
```

### Feature Toggles

Enable/disable specific features:

```typescript
// Check current state
const state = orchestratorConfig.getState();
console.log(state.orchestratorFeatures.silencePresence); // true/false

// Toggle features
orchestratorConfig.enable('deepHumanization');
orchestratorConfig.disable('advancedHumanization');

// Check if enabled
if (orchestratorConfig.isEnabled('sessionIntelligence')) {
  // ...
}
```

### Available Features

| Feature                 | Default | Description                        |
| ----------------------- | ------- | ---------------------------------- |
| `speechNaturalization`  | ✅      | Disfluencies, hedging, fillers     |
| `vocalHumanization`     | ✅      | Energy matching, pitch variation   |
| `advancedHumanization`  | ✅      | Self-correction, catching-yourself |
| `deepHumanization`      | ✅      | Mood drift, spontaneous thoughts   |
| `sessionIntelligence`   | ✅      | Concern detection, predictions     |
| `betterThanHuman`       | ✅      | Cross-session relationship         |
| `contentDeliveryPacing` | ✅      | Chunking long responses            |
| `silencePresence`       | ✅      | Meaningful pauses for support      |

## Voice Agent Integration

### Basic Integration

```typescript
// In voice-agent.ts
import { createOrchestratedHumanizer, orchestratorConfig } from '@ferni/conversation';

// In your agent setup
const humanizer = createOrchestratedHumanizer(sessionId, personaId, userId);

// Set persona-specific config
orchestratorConfig.setPersona(personaId);
orchestratorConfig.applyPreset(orchestratorConfig.getRecommendedPreset(personaId));

// In your response handler
async function humanizeResponse(
  llmResponse: string,
  context: { userMessage: string; turnNumber: number /* ... */ }
) {
  const result = await humanizer.humanizeResponseAsync(llmResponse, {
    personaId,
    turnNumber: context.turnNumber,
    userMessage: context.userMessage,
    userEmotion: context.detectedEmotion,
    topic: context.topic,
    wasPersonalSharing: context.isVulnerable,
  });

  return {
    text: result.text,
    ssml: result.ssml,
    pacing: result.pacing,
  };
}
```

### With Metrics

```typescript
import {
  createOrchestratedHumanizer,
  getMetricsCollector,
  logMetricsSummary,
} from '@ferni/conversation';

const humanizer = createOrchestratedHumanizer(sessionId, personaId, userId);

// After N turns or at session end
const collector = getMetricsCollector(sessionId, personaId);
const summary = collector.getSummary();

console.log(`Avg latency: ${summary.avgTotalMs}ms`);
console.log(`P95 latency: ${summary.p95TotalMs}ms`);
console.log(`Features applied: ${summary.topFeatures.map((f) => f.name).join(', ')}`);

// Or just log it
logMetricsSummary(sessionId);
```

### With Debug Mode

```typescript
import { createOrchestratedHumanizer, orchestratorDebug } from '@ferni/conversation';

// Enable debug mode
const humanizer = createOrchestratedHumanizer(sessionId, personaId, userId);
// (Debug recording is automatic when config.debug = true)

// Get debug snapshot
const snapshot = orchestratorDebug.getSnapshot(sessionId, personaId);
console.log('Health:', snapshot.health.status);
console.log('Issues:', snapshot.health.issues);

// Export session for analysis
const exported = orchestratorDebug.export(sessionId);
saveToFile(`session-${sessionId}.json`, exported);

// Log summary
orchestratorDebug.logSummary(sessionId);
orchestratorDebug.logFeatures(sessionId);
```

## A/B Testing

Roll out the orchestrator gradually:

```typescript
import {
  createABTest,
  getABTestVariant,
  createOrchestratedHumanizer,
  getConversationHumanizer, // Legacy
} from '@ferni/conversation';

// Create test (do once at startup)
createABTest({
  name: 'orchestrator-v2-rollout',
  enabled: true,
  variants: {
    control: { useOrchestrator: false },
    treatment: { useOrchestrator: true, preset: 'default' },
  },
  trafficPercentage: 20, // 20% get new orchestrator
  startTime: Date.now(),
});

// In your handler
function getHumanizer(sessionId: string, personaId: string, userId: string) {
  const assignment = getABTestVariant('orchestrator-v2-rollout', userId);

  if (assignment?.config.useOrchestrator) {
    return createOrchestratedHumanizer(sessionId, personaId, userId);
  } else {
    return getConversationHumanizer(personaId); // Legacy
  }
}
```

## Performance Monitoring

### Circuit Breakers

The orchestrator uses circuit breakers to protect against slow systems:

```typescript
import { getCircuitBreakerStatus, getPerformanceStats } from '@ferni/conversation';

// Check circuit breaker status
const status = getCircuitBreakerStatus();
console.log(status);
// { sessionIntelligence: { state: 'closed', failures: 0 },
//   betterThanHuman: { state: 'closed', failures: 0 } }

// If a system is failing, the circuit opens and falls back gracefully
// After resetTimeoutMs (15s), it tries again
```

### Health Monitoring

```typescript
import { getHealthStatus, getSystemHealth } from '@ferni/conversation';

// Per-session health
const health = getHealthStatus(sessionId);
if (health.status !== 'healthy') {
  console.warn('Session health issues:', health.issues);
  console.log('Recommendations:', health.recommendations);
}

// System-wide health
const systemHealth = getSystemHealth();
console.log(`Active sessions: ${systemHealth.activeSessions}`);
console.log(`Total orchestrations: ${systemHealth.totalOrchestrations}`);
console.log(`System status: ${systemHealth.status}`);
```

## Profiling

Profile specific operations for performance debugging:

```typescript
import { createProfiler, profileOrchestration } from '@ferni/conversation';

// Profile a specific operation
const { result, profile } = await profileOrchestration('full-humanization', () =>
  humanizer.humanizeResponseAsync(response, context)
);
console.log(`Operation took ${profile.durationMs}ms`);

// Or use detailed profiling
const profiler = createProfiler();
profiler.mark('start');
// ... do work
profiler.mark('after-analysis');
// ... more work
profiler.mark('after-humanization');
profiler.mark('end');

console.log(profiler.getMarks());
// [{ name: 'start', delta: 0 }, { name: 'after-analysis', delta: 15 }, ...]
```

## Migration from Legacy Humanizer

The `createOrchestratedHumanizer` function returns an object with the same API as `ConversationHumanizer`:

```typescript
// Before
import { getConversationHumanizer } from '@ferni/conversation';
const humanizer = getConversationHumanizer(personaId);

// After
import { createOrchestratedHumanizer } from '@ferni/conversation';
const humanizer = createOrchestratedHumanizer(sessionId, personaId, userId);

// Same API
const result = await humanizer.humanizeResponseAsync(response, context);
```

### Key Differences

| Aspect           | Legacy                                | Orchestrator                                                |
| ---------------- | ------------------------------------- | ----------------------------------------------------------- |
| Initialization   | `getConversationHumanizer(personaId)` | `createOrchestratedHumanizer(sessionId, personaId, userId)` |
| Config           | `humanizationConfig.isEnabled()`      | `orchestratorConfig.isEnabled()`                            |
| Metrics          | Manual                                | Automatic                                                   |
| Circuit breakers | None                                  | Built-in                                                    |
| A/B testing      | Manual                                | Built-in                                                    |
| Debug mode       | Manual logging                        | `orchestratorDebug` API                                     |

## Best Practices

1. **Set persona early**: Call `orchestratorConfig.setPersona(personaId)` before first orchestration
2. **Use presets**: Don't manually configure features unless necessary
3. **Monitor health**: Check `getHealthStatus()` periodically in production
4. **Use A/B testing**: Roll out changes gradually with `createABTest()`
5. **Export sessions**: Use `orchestratorDebug.export()` for debugging production issues
6. **Check circuit breakers**: If intelligence is failing, circuits will open automatically

## Troubleshooting

### High Latency

```typescript
const health = getHealthStatus(sessionId);
if (health.avgLatency > 100) {
  // Consider minimal preset for speed
  orchestratorConfig.applyPreset('minimal');
}
```

### Circuit Breakers Open

```typescript
const cbStatus = getCircuitBreakerStatus();
if (cbStatus.sessionIntelligence.state === 'open') {
  // Session intelligence is failing
  // Check logs for root cause
  // System will recover automatically after 15s
}
```

### Features Not Applied

```typescript
// Check what's enabled
const state = orchestratorConfig.getState();
console.log('Enabled features:', state.orchestratorFeatures);

// Check metrics for skipped features
const collector = getMetricsCollector(sessionId);
const metrics = collector.getMetrics();
console.log('Feature stats:', metrics.features);
```
