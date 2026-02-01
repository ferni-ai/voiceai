# Tool Development Guide

> **We believe in making AI human, and the decisions we make will reflect that.**

Tools give our AI the ability to take meaningful action in users' lives. Every tool should support gentle growth and authentic connection. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## Quick Reference

| What             | Where                            |
| ---------------- | -------------------------------- |
| Tool Registry    | `registry/index.ts`              |
| Domain Tools     | `domains/*/index.ts`             |
| Tool Builder     | `builder.ts`                     |
| Orchestrator     | `orchestrator/tool-composer.ts`  |
| Tool Gateway     | `gateway/tool-gateway.ts`        |
| Semantic Router  | `semantic-router/index.ts`       |
| Experiments      | `experiments/experiment-manager.ts` |
| Schemas          | `schemas/`                       |
| Validation       | `validation.ts`                  |
| Test Utils       | `__tests__/test-utils.ts`        |

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture Overview](#architecture-overview)
3. [Tool Domains](#tool-domains)
4. [Creating Tools](#creating-tools)
5. [Tool Wrapper Utilities](#tool-wrapper-utilities)
6. [Testing Tools](#testing-tools)
7. [Tool Orchestration](#tool-orchestration)
8. [Advanced Systems](#advanced-systems)
9. [Best Practices](#best-practices)

---

## Quick Start

### 1. Name by Domain (Not Persona)

```
habit-coaching.ts     # ✅ Correct - domain name
maya-habit-coach.ts   # ❌ Wrong - persona-specific
```

### 2. Tool Structure

```typescript
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { getLogger } from '../../../utils/safe-logger.js';

const log = getLogger();

const myToolDef: ToolDefinition = {
  id: 'myTool',
  name: 'My Tool',
  description: 'Clear description of what this tool does',
  domain: 'career', // or other domain
  tags: ['career', 'assessment'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Description for the LLM',
      parameters: z.object({
        userId: z.string().describe('The user ID'),
        query: z.string().optional().describe('Optional search query'),
      }),
      execute: async (params) => {
        try {
          log.info({ agentId: ctx.agentId }, 'Executing tool');
          const result = await doSomething(params);
          return result;
        } catch (error) {
          log.error({ error: String(error) }, 'Tool execution failed');
          return 'Sorry, something went wrong.';
        }
      },
    });
  },
};

// Export for domain registration
export const { getToolDefinitions, domain, definitions } = createDomainExport('career', [
  myToolDef,
]);
```

### 3. Register the Tool

Tools are automatically registered when added to a domain's `index.ts` and included in `domains/index.ts`.

---

## Architecture Overview

```
tools/
├── __tests__/                 # Shared test utilities & E2E tests
│   ├── test-utils.ts         # Mock factories, assertions
│   └── e2e-tool-chains.test.ts # User journey tests
│
├── advanced/                  # Advanced optimization systems
│   ├── index.ts              # Re-exports all advanced systems
│   └── tool-lifecycle.ts     # A/B testing, semantic routing integration
│
├── domains/                   # Domain-specific tool collections (123 domains)
│   ├── calendar/             # Calendar tools (Alex)
│   ├── career/               # Career tools
│   ├── communication/        # Email, SMS, messaging (Alex)
│   ├── connection/           # Loneliness, friendship
│   ├── entertainment/        # Music, media
│   ├── finance/              # Banking, budgeting
│   ├── grief/                # Grief support tools
│   ├── habits/               # Habit tracking (Maya)
│   ├── information/          # News, weather, search
│   ├── life-planning/        # Goals, milestones (Jordan)
│   ├── memory/               # Memory persistence tools
│   ├── research/             # Stock research, market analysis (Peter)
│   │   ├── knowledge-graph/  # Knowledge graph services
│   │   ├── global-intelligence/ # Big brain services
│   │   └── proactive-engine/ # Proactive insights
│   ├── self-compassion/      # Inner critic, self-kindness
│   ├── wellness/             # Health tracking, medications
│   ├── wisdom/               # Quotes, principles (Nayan)
│   └── ...                   # 118 total domains
│
├── factories/                 # Tool factory patterns
├── habit-coaching/            # Habit coaching module (split for size)
│   ├── index.ts              # Re-exports
│   ├── types.ts              # Type definitions
│   ├── templates.ts          # Habit templates
│   ├── bundles.ts            # Habit bundles
│   ├── storage.ts            # Persistence layer
│   └── tools.ts              # Tool implementations
│
├── handoff/                   # Agent handoff tools
│
├── orchestrator/              # Tool orchestration
│   ├── index.ts              # Main exports
│   ├── tool-composer.ts      # TOOL_CHAINS, composition
│   ├── unified-tool-orchestrator.ts # Unified orchestrator
│   └── voice-agent-integration.ts # Voice agent hooks
│
├── registry/                  # Central tool registry
│   ├── index.ts              # ToolRegistry class
│   ├── loader.ts             # Lazy loading, domain registration
│   └── types.ts              # Type definitions
│
├── utils/                     # Shared utilities
│   ├── index.ts              # formatters, ID generation
│   ├── tool-helpers.ts       # Common tool utilities
│   ├── tool-wrapper.ts       # Validation, analytics, error handling
│   └── tool-execution-wrapper.ts # Execution utilities
│
├── # Root-level Infrastructure Files
├── builder.ts                # Builds tools from manifests
├── dynamic-loader.ts         # Lazy loading tools
├── lifecycle.ts              # Tool lifecycle management
├── validation.ts             # Input validation utilities
├── categories.ts             # Tool categories
├── deprecation.ts            # Deprecation handling
├── ab-testing.ts             # A/B testing service
│
├── # Root-level Infrastructure Files (continued)
├── awareness.ts              # Tool awareness
├── context-carrier.ts        # Context passing between tools
├── dynamic-tool-router.ts    # Dynamic routing
├── expression.ts             # Expression tools
├── handoff-state.ts          # Handoff state management
├── memory-aware-router.ts    # Memory-aware routing
├── proactive-coaching.ts     # Proactive coaching triggers
├── rate-limiter.ts           # Tool rate limiting
├── runtime-enforcement.ts    # Runtime enforcement
├── scheduling.ts             # Scheduling tools
├── team-integration.ts       # Team integration tools
├── tool-success-tracker.ts   # Track tool success rates
├── unified-intelligence-stub.ts # Intelligence stub
├── versioning.ts             # Tool versioning
│
├── CLAUDE.md                 # This file
└── index.ts                  # Main exports
```

### File Organization Guidelines

**Infrastructure (keep at root):**
- `builder.ts`, `validation.ts`, `lifecycle.ts` - Core infrastructure
- `dynamic-loader.ts`, `categories.ts` - Registry support
- `deprecation.ts`, `ab-testing.ts` - Advanced features

**Domain tools (move to domains/):**
- New domain tools should go in `domains/{domain}/`
- Legacy root files (bills.ts, news.ts, etc.) should be migrated when feasible

**When splitting large files:**
- Follow the `habit-coaching/` pattern
- Create: `types.ts`, `index.ts`, `tools.ts`, plus domain-specific files
- Re-export everything from `index.ts` for backward compatibility

---

## Tool Domains

### Functional Domains

| Domain          | Description                        | Agent  |
| --------------- | ---------------------------------- | ------ |
| `memory`        | User memory, recall, relationships | All    |
| `calendar`      | Appointments, scheduling, contacts | Alex   |
| `communication` | Email, SMS, messaging              | Alex   |
| `habits`        | Habit tracking, gamification       | Maya   |
| `finance`       | Banking, budgeting, calculators    | Maya   |
| `research`      | Stock research, market analysis    | Peter  |
| `productivity`  | Tasks, notes, routines             | Alex   |
| `life-planning` | Goals, milestones, events          | Jordan |
| `wellness`      | Health tracking, medications       | All    |
| `entertainment` | Music, media                       | All    |
| `information`   | News, weather, search              | All    |
| `wisdom`        | Quotes, principles                 | Nayan  |
| `handoff`       | Agent switching                    | All    |
| `telephony`     | Phone calls, callbacks             | All    |

### Deep Human Engagement Domains

| Domain            | Description                           |
| ----------------- | ------------------------------------- |
| `grief`           | Loss, transition, endings             |
| `meaning`         | Purpose, values, spirituality         |
| `relationships`   | Connection, conflict resolution       |
| `stories`         | Life story, legacy, narrative         |
| `vulnerability`   | Shame, authenticity, self-forgiveness |
| `curiosity`       | Wonder, exploration                   |
| `dreams`          | Aspirations, imagination              |
| `self-compassion` | Inner critic, self-kindness           |
| `play`            | Joy, fun, playfulness                 |
| `presence`        | Grounding, mindfulness, flow          |

### Life Coaching Domains

| Domain           | Description                           |
| ---------------- | ------------------------------------- |
| `crisis`         | Crisis resources, safety planning     |
| `health`         | Exercise, nutrition, sleep            |
| `career`         | Job search, interviews, development   |
| `decisions`      | Decision frameworks, values alignment |
| `family`         | Parenting, family dynamics            |
| `home`           | Maintenance, organization             |
| `learning`       | Education, skill development          |
| `creativity`     | Hobbies, creative projects            |
| `community`      | Volunteering, civic engagement        |
| `legal-admin`    | Documents, estate planning            |
| `second-chances` | Fresh starts, reinvention             |
| `connection`     | Loneliness, friendship, belonging     |

---

## Creating Tools

### Basic Tool Definition

```typescript
const myToolDef: ToolDefinition = {
  id: 'myToolId', // Unique identifier (camelCase)
  name: 'My Tool Name', // Human-readable name
  description: 'What this tool does', // For documentation
  domain: 'career', // Primary domain
  additionalDomains: ['decisions'], // Optional secondary domains
  tags: ['assessment', 'career'], // For searching/filtering
  experimental: false, // Beta feature flag
  deprecated: false, // Deprecation flag
  deprecationMessage: '', // If deprecated, why

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: 'Description shown to LLM',
      parameters: z.object({
        /* Zod schema */
      }),
      execute: async (params) => {
        /* implementation */
      },
    });
  },
};
```

### Using the Tool Wrapper (Recommended)

The tool wrapper adds validation, analytics, and error handling automatically:

```typescript
import { wrapToolDefinition } from '../utils/tool-wrapper.js';

const wrappedTool = wrapToolDefinition(myToolDef, {
  enableAnalytics: true, // Track usage metrics
  enableValidation: true, // Input sanitization
  enableErrorHandling: true, // Result type errors
  sanitizeFields: ['userInput'], // Fields to sanitize
});
```

### Enhanced Tool Factory

For new tools, use the enhanced factory:

```typescript
import { createEnhancedTool } from '../utils/tool-wrapper.js';

const myTool = createEnhancedTool({
  id: 'myTool',
  name: 'My Tool',
  description: 'Description',
  domain: 'career',
  llmDescription: 'Description for LLM',
  parameters: z.object({
    /* schema */
  }),

  execute: async (params, ctx, execContext) => {
    // Your implementation
    return 'Result string';
  },

  wrapperOptions: {
    enableAnalytics: true,
    sanitizeFields: ['query'],
  },
});
```

---

## Tool Wrapper Utilities

Located in `utils/tool-wrapper.ts`:

### Result Type

```typescript
import { success, failure, type ToolResult } from '../utils/tool-wrapper.js';

// Success
return success({ data: 'value' });

// Failure
return failure('Error message', 'ERROR_CODE');
```

### Wrapper Options

```typescript
interface WrapperOptions {
  enableAnalytics?: boolean; // Track tool usage
  enableValidation?: boolean; // Input validation
  enableErrorHandling?: boolean; // Catch errors → Result type
  enablePerformanceTracking?: boolean; // Log slow executions
  enableDeprecationWarnings?: boolean; // Warn about deprecated tools
  sanitizeFields?: string[]; // Fields to sanitize
  slowExecutionThresholdMs?: number; // Default: 2000ms
  customValidator?: (params) => { valid: boolean; error?: string };
}
```

---

## Testing Tools

### Test File Location

```
domains/career/__tests__/career.test.ts
```

### Standard Test Structure

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Standard mocks
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

// Import after mocks
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Not available');
      },
      getOptional: () => undefined,
    },
  };
}

describe('My Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  describe('Tool Loading', () => {
    it('should load all tool definitions', async () => {
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });
  });

  describe('Tool Execution', () => {
    it('should execute tool successfully', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'myTool');
      const tool = toolDef!.create(mockContext);
      const result = await tool.execute({ param: 'value' });
      expect(result).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const tool = toolDefinitions[0].create(mockContext);
      const result = await tool.execute({});
      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });
  });
});
```

### E2E Tool Chain Tests

```typescript
// __tests__/e2e-tool-chains.test.ts
describe('Career Journey', () => {
  it('should chain: goals → gaps → application → interview', async () => {
    const chain = [
      { toolId: 'clarifyCareerGoals', params: { timeHorizon: '1-year' } },
      { toolId: 'exploreGrowthAreas', params: { currentRole: 'Junior Dev' } },
      { toolId: 'trackJobApplication', params: { company: 'Tech Corp' } },
      { toolId: 'practiceInterview', params: { interviewType: 'behavioral' } },
    ];

    const result = await runToolChain(chain, careerTools, ctx);
    expect(result.success).toBe(true);
  });
});
```

---

## Tool Orchestration

### Tool Chains

Tool chains define natural conversation flows:

```typescript
// orchestration/tool-composer.ts
export const TOOL_CHAINS: Record<string, ToolChain> = {
  // Career journey
  clarifyCareerGoals: {
    primary: 'clarifyCareerGoals',
    suggestedFollowers: ['exploreGrowthAreas', 'createLearningPath'],
    contextKeys: ['timeHorizon', 'clarity', 'values'],
    typicalEmotion: 'empathetic',
  },

  // Grief journey
  processGrief: {
    primary: 'processGrief',
    suggestedFollowers: ['navigateGriefWave', 'companionInGrief'],
    contextKeys: ['lossType', 'whereTheyAre'],
    typicalEmotion: 'empathetic',
  },
};
```

### Using the Composer

```typescript
import { createToolComposer } from './orchestration/index.js';

const composer = createToolComposer(sessionId, userId, agentId);

// Compose a tool result
const composed = composer.compose('processGrief', result, {
  shareContext: true,
  extractFacts: true,
});

console.log(composed.suggestedNext); // ['navigateGriefWave', 'companionInGrief']
console.log(composed.emotion); // 'empathetic'

// Check if we should wrap up
const { should, reasons } = composer.shouldWrapUp();
```

---

## Advanced Systems

Located in `advanced/`:

### A/B Testing

```typescript
import { abTestingService } from './ab-testing.js';

// Assign user to variant
const assignment = abTestingService.assignVariant(userId, 'tool_v2_test');

// Track result
abTestingService.recordMetric(userId, experimentId, 'success_rate', 1);
```

### Semantic Routing

```typescript
import { semanticRouter } from './semantic-router.js';

// Route request to best tool
const matches = await semanticRouter.findMatches(userIntent, {
  threshold: 0.6,
  maxResults: 5,
});
```

### Deprecation Service

```typescript
import { deprecationService } from './deprecation.js';

// Check if deprecated
if (deprecationService.isDeprecated(toolId)) {
  const replacement = deprecationService.getReplacement(toolId);
}
```

### Tool Lifecycle Integration

```typescript
import { initializeToolLifecycle, selectBestTool } from './advanced/tool-lifecycle.js';

// Initialize at startup
await initializeToolLifecycle({
  buildSemanticIndex: true,
  checkDeprecations: true,
  toolDefinitions: allTools,
});

// Select best tool considering all factors
const selection = await selectBestTool(userIntent, availableTools, { userId });
// Returns: { toolId, reason, alternatives, warnings }
```

---

## Best Practices

### Do ✅

- Return meaningful, human-readable responses
- Validate inputs with Zod schemas
- Log errors with context using `getLogger()`
- Keep tools focused (single responsibility)
- Use `readonly` for input params
- Use the tool wrapper for consistency
- Write tests for all tools
- Follow tool chains for natural conversation flow

### Don't ❌

- Create persona-specific tools (use context for personalization)
- Use `as any` - properly type parameters
- Forget error handling - wrap in try/catch
- Make tools > 200 lines (split into helpers)
- Call other tools directly (use orchestration layer)
- Use `console.log` - use `getLogger()` instead
- Return raw JSON to users - format for speech

### Tool Naming

```typescript
// ✅ Good - action + object
clarifyCareerGoals;
trackJobApplication;
assessBurnout;

// ❌ Bad - vague or persona-specific
doCareerStuff;
mayaHabitTool;
processData;
```

### Error Messages

```typescript
// ✅ Good - helpful to user
return "I couldn't find any job applications matching that company. Would you like to add one?";

// ❌ Bad - technical error
return `Error: ENOENT: no such file or directory`;
```

---

## Running Tests

```bash
# Run all tool tests
npx vitest run src/tools

# Run specific domain tests
npx vitest run src/tools/domains/career/__tests__/career.test.ts

# Run E2E tool chain tests
npx vitest run src/tools/__tests__/e2e-tool-chains.test.ts

# Watch mode
npx vitest src/tools
```

---

## Reference Docs

- Full architecture: `docs/AGENT-AGNOSTIC-ARCHITECTURE.md`
- Tool migration guide: `docs/TOOL_MIGRATION.md`
- Core principles: `CORE-PRINCIPLES.md`
