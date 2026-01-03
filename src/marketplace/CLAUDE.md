# Marketplace Module

> **We believe in making AI human, and the decisions we make will reflect that.**

The marketplace module provides tool and agent registry, sandboxed execution, and persistence. Supports both built-in and community-contributed tools.

---

## Architecture Level

```
Level 70: marketplace/         ← THIS LAYER (Domain)
         ↓ imports from
Level 60: services/
Level 30: memory/
Level 10: config/, utils/, types/
```

---

## Directory Structure

```
marketplace/
├── index.ts                    # Main exports
├── registry.ts                 # 📦 Tool/agent registry
│
├── schema/                     # 📋 Manifest schemas
│   └── (tool-manifest, agent-manifest)
│
├── executor/                   # ⚡ Sandboxed execution
│   └── (sandbox, runtime)
│
├── persistence/                # 💾 Firestore persistence
│   └── (tools, agents, analytics)
│
├── auth/                       # 🔐 Authentication
│   └── (api-keys, permissions)
│
├── billing/                    # 💳 Usage billing
│   └── (metering, pricing)
│
├── reviews/                    # ⭐ Review system
│   └── (ratings, feedback)
│
├── examples/                   # 📚 Example tools
│
└── __tests__/                  # Unit tests
```

---

## Key Components

| Component | File | Purpose |
|-----------|------|---------|
| **Registry** | `registry.ts` | Central tool/agent registry |
| **Executor** | `executor/` | Sandboxed tool execution |
| **Persistence** | `persistence/` | Firestore storage |
| **Auth** | `auth/` | API keys and permissions |
| **Reviews** | `reviews/` | Rating and feedback |

---

## Registry Pattern

Hybrid in-memory + Firestore:

```typescript
import { getMarketplaceRegistry } from './marketplace/registry.js';

const registry = getMarketplaceRegistry();

// Register a tool
await registry.registerTool({
  id: 'my-tool',
  name: 'My Tool',
  version: '1.0.0',
  manifest: toolManifest,
});

// Lookup tool
const tool = await registry.getTool('my-tool');

// List available tools
const tools = await registry.listTools({
  category: 'productivity',
  verified: true,
});
```

---

## Tool Manifest Schema

```typescript
interface ToolManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: {
    name: string;
    verified: boolean;
  };
  permissions: string[];
  entryPoint: string;
  pricing?: {
    model: 'free' | 'paid' | 'freemium';
    pricePerUse?: number;
  };
}
```

---

## Sandboxed Execution

Tools run in a secure sandbox:

```typescript
import { executeInSandbox } from './marketplace/executor/index.js';

const result = await executeInSandbox({
  toolId: 'my-tool',
  input: userInput,
  context: sessionContext,
  timeout: 30000,
  permissions: ['network', 'storage'],
});

// Track execution
await trackExecution({
  toolId: 'my-tool',
  userId,
  duration: result.duration,
  success: result.success,
});
```

---

## Persistence

```typescript
import { getToolPersistence } from './marketplace/persistence/index.js';

const persistence = getToolPersistence();

// Save tool
await persistence.saveTool(tool);

// Get tool analytics
const analytics = await persistence.getAnalytics('my-tool');
// { executions: 1000, avgDuration: 250, successRate: 0.98 }
```

---

## Authentication

```typescript
import { validateApiKey } from './marketplace/auth/index.js';

const isValid = await validateApiKey({
  key: apiKey,
  toolId: 'my-tool',
  requiredPermissions: ['execute'],
});
```

---

## Review System

```typescript
import { submitReview, getReviews } from './marketplace/reviews/index.js';

// Submit review
await submitReview({
  toolId: 'my-tool',
  userId,
  rating: 5,
  comment: 'Great tool!',
});

// Get reviews
const reviews = await getReviews('my-tool', {
  limit: 10,
  sortBy: 'rating',
});
```

---

## Testing

```bash
# Run marketplace tests
pnpm vitest run src/marketplace/__tests__/
```

---

## Rules

| ✅ Do | ❌ Don't |
|-------|---------|
| Cache in dev, Firestore in prod | Always hit Firestore |
| Sandbox all external tools | Execute tools directly |
| Track execution analytics | Ignore usage data |
| Validate permissions at runtime | Trust manifests blindly |
| Rate limit API access | Allow unlimited calls |

---

## Development vs Production

| Mode | Registry | Execution |
|------|----------|-----------|
| Dev | In-memory cache | Direct execution |
| Prod | Firestore-backed | Full sandbox |

```typescript
const registry = getMarketplaceRegistry();
// Automatically uses correct backend based on NODE_ENV
```

---

## Related Docs

- `src/tools/CLAUDE.md` - Tool development
- `marketplace-agents/` - Agent marketplace
- `docs/architecture/MARKETPLACE-RUNTIME-SPEC.md`

---

*Last updated: January 2026*
