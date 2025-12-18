# Runtime Usage Guide

The Ferni Runtime provides a unified interface for local development and cloud production. The same code runs identically in both environments.

## Quick Start

```typescript
import { getRuntime } from './runtime';

// Automatically detects environment (local vs cloud)
const runtime = await getRuntime();

// Execute a tool (works the same locally and in production)
const result = await runtime.tools.execute(
  'habitCoaching.createHabit',
  { name: 'Morning meditation', frequency: 'daily' },
  {
    userId: 'user_123',
    sessionId: 'session_456',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    subscriptionTier: 'friend',
  }
);

if (result.status === 'success') {
  console.log(result.summary); // "I've created your morning meditation habit!"
}
```

## Service Modes

### Local Mode (Development Default)

All services run in-process. No Docker, no network calls, instant startup.

```bash
# Just run your dev server
pnpm dev

# Or explicitly set mode
SERVICE_MODE=local pnpm dev
```

```typescript
const runtime = await getRuntime({ mode: 'local' });
// Tools, personas, memory all run in the same process
```

### Remote Mode (Production Default)

Services run as separate containers/Cloud Run services, communicating via gRPC.

```bash
# Auto-detected in Cloud Run
SERVICE_MODE=remote  # or K_SERVICE is set

# Point to service URLs
TOOL_SERVICE_URL=https://tool-service-xxx.run.app
PERSONA_SERVICE_URL=https://persona-service-xxx.run.app
MEMORY_SERVICE_URL=https://memory-service-xxx.run.app
```

```typescript
const runtime = await getRuntime({ mode: 'remote' });
// All calls go to remote services
```

### Hybrid Mode (Testing)

Mix of local and remote services. Useful for testing specific services.

```bash
# Run tool service in Docker
docker-compose -f docker-compose.services.yml up tool-service

# Run agent locally, pointing to Docker tool service
SERVICE_MODE=hybrid \
TOOL_SERVICE_URL=http://localhost:50051 \
pnpm dev
```

```typescript
const runtime = await getRuntime({
  mode: 'hybrid',
  localOverrides: {
    personas: true, // Personas run locally
    memory: true, // Memory runs locally
    tools: false, // Tools are remote (Docker)
  },
  services: {
    toolService: 'http://localhost:50051',
  },
});
```

## Running the Full Stack Locally (Docker)

```bash
# Start all services
docker-compose -f docker-compose.services.yml up

# Services available at:
# - Tool Service:    http://localhost:50051
# - Persona Service: http://localhost:50052
# - Memory Service:  http://localhost:50053
# - Agent Runtime:   http://localhost:8080
```

## Integration in Voice Agent

```typescript
// Example: Using runtime in a voice agent session

import { getRuntime, type IRuntime } from '../runtime';

export class VoiceAgentSession {
  private runtime: IRuntime;

  async initialize() {
    // Get runtime (auto-detects local vs cloud)
    this.runtime = await getRuntime();

    console.log(`Running in ${this.runtime.mode} mode`);
  }

  async handleToolCall(toolId: string, params: unknown) {
    const result = await this.runtime.tools.execute(toolId, params as Record<string, unknown>, {
      userId: this.userId,
      sessionId: this.sessionId,
      agentId: this.agentId,
      agentDisplayName: this.agentDisplayName,
      subscriptionTier: this.subscriptionTier,
    });

    if (result.status !== 'success') {
      // Use the user-friendly error message
      return result.error?.userMessage || 'Something went wrong.';
    }

    return result.summary || JSON.stringify(result.data);
  }

  async recallMemories(query: string) {
    return this.runtime.memory.recall(this.userId, query, {
      limit: 5,
      threshold: 0.7,
    });
  }

  async getPersonaContext() {
    return this.runtime.personas.getSystemPrompt({
      personaId: this.agentId,
      userId: this.userId,
    });
  }
}
```

## Health Checks

```typescript
const runtime = await getRuntime();

const health = await runtime.health();
console.log(health);
// {
//   overall: 'healthy',
//   services: {
//     tools: { healthy: true, latencyMs: 5 },
//     personas: { healthy: true, latencyMs: 3 },
//     memory: { healthy: true, latencyMs: 12 },
//   }
// }
```

## Environment Variables

| Variable              | Description                    | Default                  |
| --------------------- | ------------------------------ | ------------------------ |
| `SERVICE_MODE`        | `local`, `remote`, or `hybrid` | Auto-detected            |
| `TOOL_SERVICE_URL`    | Tool service endpoint          | `http://localhost:50051` |
| `PERSONA_SERVICE_URL` | Persona service endpoint       | `http://localhost:50052` |
| `MEMORY_SERVICE_URL`  | Memory service endpoint        | `http://localhost:50053` |

## Auto-Detection Logic

The runtime auto-detects the mode:

1. If `SERVICE_MODE` env var is set, use that
2. If `K_SERVICE` is set (Cloud Run), use `remote`
3. If `KUBERNETES_SERVICE_HOST` is set, use `remote`
4. Otherwise, use `local`

## Migration Path

To migrate from direct tool calls to the runtime:

```typescript
// BEFORE (direct)
import { buildAgentTools } from '../tools/builder';
const tools = await buildAgentTools('ferni', { userId });
const result = await tools.habitCoaching.execute(params);

// AFTER (via runtime)
import { getRuntime } from '../runtime';
const runtime = await getRuntime();
const result = await runtime.tools.execute('habitCoaching.createHabit', params, ctx);
```

Benefits:

- Same code works locally and in production
- Tools can be scaled independently
- No code changes needed when deploying to cloud
- Consistent error handling and logging
