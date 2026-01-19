# Persona Registry Architecture

> **OCP-Compliant Runtime Persona Registration**

## Overview

The Persona Registry provides an OCP-compliant (Open-Closed Principle) mechanism for registering AI personas at runtime without modifying the core bundle discovery system.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         PersonaRegistry                              │
│   (OCP Layer - Runtime registration without modifying bundles)       │
├─────────────────────────────────────────────────────────────────────┤
│   Runtime Personas   │   Plugin Personas   │   Bundle Personas      │
│   (from API/SDK)     │   (from extensions) │   (delegated to ↓)     │
└──────────────────────┴─────────────────────┴────────────────────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         AgentRegistry                                │
│   (Bundle Discovery - File-based persona bundles in src/personas/)   │
├─────────────────────────────────────────────────────────────────────┤
│   ferni/   │   maya/   │   peter/   │   jordan/   │   alex/   │...  │
│   (coach)  │   (team)  │   (team)   │   (team)    │   (team)  │     │
└────────────┴───────────┴────────────┴─────────────┴───────────┴─────┘
```

## When to Use Each Registry

| Registry | Use Case |
|----------|----------|
| **PersonaRegistry** | Runtime registration, plugins, SDK extensions |
| **AgentRegistry** | Direct bundle access, coordinator lookup, agent resolution |

### PersonaRegistry (OCP Layer)

```typescript
import { getPersonaRegistry } from '../personas/registry/persona-registry-impl.js';

const registry = getPersonaRegistry();

// Register a runtime persona
await registry.register({
  id: 'custom-agent',
  name: 'Custom Agent',
  description: 'A custom AI persona',
  voice: { voiceId: 'voice-123', provider: 'cartesia' },
  role: 'team',
  aliases: ['custom', 'agent'],
});

// Query personas (includes both runtime and bundle)
const persona = await registry.get('custom-agent');
const all = await registry.getAll({ source: 'runtime' });
```

### AgentRegistry (Bundle Discovery)

```typescript
import { AgentRegistry } from '../personas/registry/unified-registry.js';

// Direct bundle access
const coordinator = await AgentRegistry.getCoordinator();
const agent = await AgentRegistry.getAgentOrNull('ferni');
const enabled = await AgentRegistry.getEnabledAgents();
```

## API Endpoints

### GET /api/v1/admin/agents/stats

Get registry statistics.

**Response:**
```json
{
  "total": 12,
  "fromBundles": 6,
  "fromRuntime": 4,
  "fromPlugins": 2,
  "timestamp": "2026-01-18T15:00:00Z"
}
```

### POST /api/v1/admin/agents/register

Register a runtime persona (OCP-compliant).

**Request:**
```json
{
  "id": "my-agent",
  "name": "My Agent",
  "description": "A custom AI persona",
  "voice": {
    "voiceId": "voice-123",
    "provider": "cartesia"
  },
  "role": "team",
  "aliases": ["my", "agent"],
  "overwrite": false,
  "source": "runtime"
}
```

**Response:**
```json
{
  "success": true,
  "personaId": "my-agent",
  "replaced": false,
  "message": "Persona \"my-agent\" registered successfully"
}
```

### DELETE /api/v1/admin/agents/:id/runtime

Unregister a runtime persona.

**Response:**
```json
{
  "success": true,
  "personaId": "my-agent",
  "message": "Persona \"my-agent\" unregistered successfully"
}
```

## PersonaDefinition Interface

```typescript
interface PersonaDefinition {
  id: string;           // Unique identifier (lowercase, alphanumeric + hyphens)
  name: string;         // Display name
  description: string;  // Brief description
  voice: {
    voiceId: string;
    provider: 'cartesia' | 'openai' | 'elevenlabs';
  };
  role: 'coach' | 'team' | 'standalone';
  aliases?: string[];   // Alternative names for lookup
}
```

## RegisteredPersona (Extended)

After registration, personas include additional metadata:

```typescript
interface RegisteredPersona extends PersonaDefinition {
  source: 'bundle' | 'runtime' | 'plugin';
  registeredAt: string;  // ISO timestamp
  isCoordinator: boolean;
}
```

## Validation Rules

| Rule | Validation |
|------|------------|
| ID format | Must start with letter, lowercase alphanumeric + hyphens |
| ID uniqueness | Cannot register duplicate ID without `overwrite: true` |
| Required fields | `id`, `name` are required |
| Voice defaults | Defaults to `{ voiceId: 'default', provider: 'cartesia' }` |
| Role defaults | Defaults to `'team'` |

## Registration Options

```typescript
interface RegisterOptions {
  overwrite?: boolean;     // Replace existing persona if same ID
  source?: 'runtime' | 'plugin';  // Source tracking
}
```

## Caching & Performance

- PersonaRegistry uses in-memory caching for registered personas
- Bundle personas are delegated to AgentRegistry (file-based caching)
- Alias resolution is O(1) via alias map
- Statistics are computed on-demand

## Testing

```bash
# Run PersonaRegistry tests (30 tests)
pnpm vitest run src/tests/registry/persona-registry.test.ts
```

## DI Container Integration

PersonaRegistry is registered in the DI container:

```typescript
// In setup.ts
container.registerSingleton(Tokens.PersonaRegistry, async () => {
  const { getPersonaRegistry } = await import('../../personas/registry/persona-registry-impl.js');
  return getPersonaRegistry();
});

// Resolve via DI
import { resolvePersonaRegistry } from '../services/di/setup.js';
const registry = await resolvePersonaRegistry();
```

## Migration Notes

### From AgentDirectory

The old AgentDirectory provided similar functionality but was tightly coupled to bundle discovery. PersonaRegistry provides:

1. **OCP Compliance** - Register new personas without modifying bundles
2. **Source Tracking** - Know if persona is from bundle, runtime, or plugin
3. **Batch Operations** - Register multiple personas efficiently
4. **Clear API** - Consistent interface for all persona operations

### Backward Compatibility

- AgentRegistry remains the source of truth for bundle-based personas
- PersonaRegistry delegates bundle lookups to AgentRegistry
- Existing code using AgentRegistry continues to work unchanged

## Architecture Decision Records

### ADR-001: Why Two Registries?

**Decision:** Keep AgentRegistry for bundle discovery, add PersonaRegistry for runtime registration.

**Context:** We needed to support runtime persona registration without modifying the file-based bundle system.

**Consequences:**
- Bundle personas continue to work unchanged
- Runtime personas can be added via API
- Clear separation of concerns
- Slightly more complex lookup (check PersonaRegistry first, then delegate)
