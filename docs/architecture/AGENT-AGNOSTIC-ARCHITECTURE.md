# Agent-Agnostic Architecture

> **We believe in making AI human, and the decisions we make will reflect that.**

This architecture enables each persona to feel like a genuine individual - with their own voice, knowledge, and personality - while sharing the foundation that makes AI feel human. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

This document describes the new agent-agnostic tool and team handler architecture for the Ferni Voice AI platform.

## Overview

The platform has been refactored to decouple tools and handlers from specific agents, enabling:

1. **User-Defined Agents**: Create custom agents with specific tool sets and voice characteristics
2. **Domain-Based Organization**: Tools and handlers are grouped by capability, not by agent
3. **Declarative Configuration**: Agent capabilities defined in JSON manifests
4. **Dynamic Assembly**: Tools and handlers are assembled at runtime based on configuration

## Architecture Components

### 1. Tool Registry

The tool registry manages all available tools, organized by domain:

```
src/tools/
├── registry/
│   ├── types.ts      # ToolDefinition, ToolDomain types
│   ├── index.ts      # ToolRegistry class
│   └── loader.ts     # Domain auto-discovery
└── domains/
    ├── memory/       # User memory tools
    ├── productivity/ # Tasks, notes
    ├── information/  # Web search, weather, news
    ├── handoff/      # Agent switching
    ├── calendar/     # Calendar management
    ├── habits/       # Habit tracking
    ├── finance/      # Financial tools
    ├── wellness/     # Wellness tracking
    ├── wisdom/       # Quotes, advice
    ├── communication/# Email, SMS
    ├── research/     # Stock analysis
    ├── life-planning/# Goals, milestones
    ├── entertainment/# Music, media
    └── telephony/    # Phone calls
```

### 2. Team Handler Registry

The team handler registry manages cross-agent communication:

```
src/services/team-handler-registry/
├── types.ts          # HandlerCapability, TeamHandlerDefinition
├── index.ts          # TeamHandlerRegistry class
├── loader.ts         # Legacy + manifest loading
└── handlers/
    ├── index.ts      # All handler exports
    ├── financial.ts  # Maya's handlers
    ├── scheduling.ts # Alex's handlers
    ├── life-planning.ts # Jordan's handlers
    ├── research.ts   # Peter's handlers
    └── coordination.ts  # Ferni's handlers
```

### 3. Agent Manifests

Each agent is defined by a JSON manifest:

```json
{
  "identity": {
    "id": "maya-santos",
    "display_name": "Maya Santos"
  },
  "tools": {
    "domains": ["memory", "habits", "finance", "handoff"],
    "required": [],
    "optional": ["getStockQuote"],
    "forbidden": ["dayTrade", "playMusic"]
  },
  "team_handlers": {
    "capabilities": ["savings-goals", "budgets", "expense-tracking"],
    "handlers": ["createSavingsGoal", "createBudget", ...],
    "can_receive_from": ["jordan", "ferni", "alex"],
    "can_send_to": ["jordan", "ferni", "alex"]
  },
  "capabilities": {
    "can_handoff": true,
    "handoff_targets": ["ferni", "jordan-taylor", ...]
  }
}
```

## Handler Capabilities

Each capability represents a domain of functionality:

| Capability | Description | Primary Agent |
|------------|-------------|---------------|
| `savings-goals` | Create/manage savings goals | Maya |
| `budgets` | Budget creation and tracking | Maya |
| `expense-tracking` | Track expenses | Maya |
| `financial-status` | Financial summaries | Maya |
| `scheduling` | Event scheduling | Alex |
| `reminders` | Reminder management | Alex |
| `notifications` | Send notifications | Alex |
| `contacts` | Contact management | Alex |
| `goals` | Life goal management | Jordan |
| `milestones` | Milestone tracking | Jordan |
| `retirement` | Retirement planning | Jordan |
| `insights` | Cross-domain insights | Peter |
| `analysis` | Data analysis | Peter |
| `team-status` | Team coordination | Ferni |
| `context-sharing` | Share context between agents | Ferni |
| `escalation` | Handle escalations | Ferni |

## Usage

### Enabling the New System

Set environment variables:

```bash
# Enable new tool registry
export USE_NEW_TOOL_SYSTEM=true

# Enable new team handler registry
export USE_NEW_TEAM_HANDLERS=true
```

### Registering All Handlers

```typescript
import { registerAllHandlers } from './services/team-handler-registry/handlers/index.js';

// Register all handlers with default agents
await registerAllHandlers();

// Or specify custom agent mappings
await registerAllHandlers({
  ferni: 'my-coordinator',
  maya: 'my-financial-agent',
});
```

### Routing Requests

```typescript
import { 
  teamHandlerRegistry, 
  routeTeamRequest 
} from './tools/index.js';

// Route by handler ID
const result = await routeTeamRequest('createSavingsGoal', {
  toolName: 'createSavingsGoal',
  params: { name: 'Vacation Fund', targetAmount: 5000 },
  userId: 'user-123',
}, { fromAgent: 'jordan' });

// Route by capability
const result = await teamHandlerRegistry.routeByCapability(
  'savings-goals',
  request,
  { fromAgent: 'jordan' }
);
```

### Creating Custom Handlers

```typescript
import { registerTeamHandler } from './services/team-handler-registry/index.js';
import type { TeamHandlerDefinition } from './services/team-handler-registry/types.js';

const myHandler: TeamHandlerDefinition = {
  id: 'myCustomHandler',
  name: 'My Custom Handler',
  description: 'Does something custom',
  capability: 'savings-goals',
  execute: async (request) => {
    // Implementation
    return {
      success: true,
      result: 'Done!',
      executedBy: 'my-agent',
    };
  },
};

registerTeamHandler(myHandler, 'my-agent');
```

## Migration Guide

### From Legacy Tool Factory

**Before (Legacy):**
```typescript
import { createPersonaTools } from './tools/factory.js';
const tools = await createPersonaTools('maya');
```

**After (New System):**
```typescript
import { buildAgentTools } from './tools/index.js';
const tools = await buildAgentTools('maya-santos', { userId: 'user-123' });
```

### From Legacy Team Handlers

**Before (Legacy):**
```typescript
import { registerMayaTeamHandlers } from './tools/maya-team-handlers.js';
registerMayaTeamHandlers();
```

**After (New System):**
```typescript
import { registerFinancialHandlers } from './services/team-handler-registry/handlers/index.js';
registerFinancialHandlers('maya');
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Manifests                          │
│  (persona.manifest.json for each agent)                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Loader                               │
│  - Reads manifest                                               │
│  - Configures tools from domains                               │
│  - Configures handlers from capabilities                       │
└─────────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Tool Registry  │ │ Handler Registry│ │   Agent Bus     │
│                 │ │                 │ │                 │
│ - 14 domains    │ │ - 16 capabilities│ │ - Message routing│
│ - ~205 tools    │ │ - 27 handlers   │ │ - Context sharing│
└─────────────────┘ └─────────────────┘ └─────────────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Voice Agent                                │
│  - Uses tools for user interactions                            │
│  - Uses handlers for cross-agent coordination                  │
│  - Uses Agent Bus for team communication                       │
└─────────────────────────────────────────────────────────────────┘
```

## Testing

### Unit Tests

```bash
# Tool registry tests
npx vitest run src/tools/registry/__tests__/

# Handler registry tests
npx vitest run src/services/team-handler-registry/__tests__/registry.test.ts

# Integration tests
npx vitest run src/services/team-handler-registry/__tests__/integration.test.ts
```

### Handler Counts

| Agent | Handlers |
|-------|----------|
| Ferni (Coordination) | 6 |
| Maya (Financial) | 5 |
| Alex (Scheduling) | 5 |
| Jordan (Life Planning) | 6 |
| Peter (Research) | 5 |
| **Total** | **27** |

## Future Enhancements

1. **Dynamic Agent Creation**: UI for creating custom agents with selected tools/handlers
2. **Handler Marketplace**: Share and discover community-created handlers
3. **Performance Monitoring**: Track handler execution times and success rates
4. **A/B Testing**: Test different handler implementations
5. **Versioned Handlers**: Support multiple versions of handlers for gradual rollout

## Related Documentation

- [Tool Registry Documentation](./tools/README.md)
- [Persona Architecture](./PERSONA-ARCHITECTURE-PLAN.md)
- [Handoff Architecture](./HANDOFF_ARCHITECTURE.md)
- [Creating Personas](./creating-personas.md)

