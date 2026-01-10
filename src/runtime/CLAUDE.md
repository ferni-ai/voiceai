# Runtime Module

Unified runtime for local development and cloud production.

## Purpose

Provides a seamless abstraction over local (in-process) and remote (gRPC/HTTP) service execution. The same code runs in both environments:

| Mode | Description |
|------|-------------|
| **LOCAL** | All services run in-process, no network calls |
| **REMOTE** | Services run as separate Cloud Run/K8s services |
| **HYBRID** | Mix of local and remote based on config |

## Architecture Layer

**Layer 60 (Service)** - Provides service abstractions for higher layers.

## Key Files

| File | Purpose |
|------|---------|
| `index.ts` | Public API exports |
| `service-mode.ts` | Core runtime: Local/Remote service implementations |
| `voice-agent-integration.ts` | Bridge between voice agents and runtime services |

## Service Interfaces

Three core services with identical interfaces regardless of mode:

| Service | Purpose |
|---------|---------|
| `IToolService` | Execute tools, list available tools |
| `IPersonaService` | Get system prompts, persona config |
| `IMemoryService` | Store/recall memories |

## Usage Patterns

```typescript
import { getRuntime, createRuntimeToolProxy } from '../runtime/index.js';

// Get global runtime (auto-detects mode)
const runtime = await getRuntime();

// Execute a tool
const result = await runtime.tools.execute('habitCoaching.createHabit', params, ctx);

// For voice agents - create tool proxy
const toolProxy = await createRuntimeToolProxy(jobCtx, 'ferni', { userId });
const tools = await toolProxy.getToolDefinitions();
const result = await toolProxy.execute(toolId, params);
```

## Mode Detection

Mode is auto-detected:
1. `SERVICE_MODE` env var (explicit override)
2. `K_SERVICE` or `CLOUD_RUN_JOB` env (Cloud Run -> remote)
3. `KUBERNETES_SERVICE_HOST` env (K8s -> remote)
4. Default: local (development)

## Local vs Remote Implementation

### Local Mode
- Services lazily load actual modules (tools, personas, memory)
- No network calls
- Instant startup, hot reload friendly
- Single process debugging

### Remote Mode
- HTTP/JSON calls to Cloud Run services
- Independent scaling
- Process isolation
- Uses Connect-ES/gRPC protocol

## Voice Agent Integration

The `voice-agent-integration.ts` bridges voice agents with runtime:

```typescript
import { createRuntimeToolProxy, shouldUseRuntime } from '../runtime/voice-agent-integration.js';

if (shouldUseRuntime()) {
  const proxy = await createRuntimeToolProxy(ctx, personaId);

  // Get LLM tool definitions
  const tools = await proxy.getToolDefinitions();

  // Execute tool calls
  const result = await proxy.execute('habitCoaching.createHabit', params);

  // Memory operations
  await proxy.storeMemory('User shared X', { topic: 'personal' });
  const memories = await proxy.recallMemories('habit progress');
}
```

## Marketplace Tool Integration

Runtime tool proxy automatically includes installed marketplace tools:
- Marketplace tools are prefixed with `mkt.`
- Sandboxed execution via marketplace module
- Appears alongside built-in tools in LLM definitions

## Configuration

```typescript
// Explicit configuration
const runtime = await createRuntime({
  mode: 'hybrid',
  localOverrides: { tools: true },  // Tools run locally
  services: {
    memoryService: 'https://memory-service.run.app',  // Memory is remote
  },
});
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `SERVICE_MODE` | Force mode: `local`, `remote`, `hybrid` |
| `USE_RUNTIME` | Feature flag: `true`/`false` |
| `TOOL_SERVICE_URL` | Remote tool service endpoint |
| `PERSONA_SERVICE_URL` | Remote persona service endpoint |
| `MEMORY_SERVICE_URL` | Remote memory service endpoint |

## Rules for Extending

1. **Add to interface first** - Define in `I*Service` interface
2. **Implement both modes** - Local and Remote implementations
3. **Keep stateless** - Services should not hold state
4. **Handle failures** - Return proper error status, not exceptions
5. **Test both modes** - Verify local and remote paths work

## Integration Points

- `src/agents/voice-agent-entry.ts` - Voice agent tool execution
- `src/tools/` - Tool definitions loaded by LocalToolService
- `src/personas/` - Persona config loaded by LocalPersonaService
- `src/memory/` - Memory operations by LocalMemoryService
