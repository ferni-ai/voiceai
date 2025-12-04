# Tool System Migration Guide

This guide documents the ongoing migration to a clean, unified tool architecture.

## Overview

The tool system is being migrated from:
- **Legacy system**: Individual `create*Tools()` functions with persona-specific names
- **To**: Domain-based registry with agent-agnostic tools + orchestration layer

## Current Architecture

```
src/tools/
├── registry/           # Domain-based tool registry
│   ├── types.ts        # Core types (ToolDefinition, ToolDomain, etc.)
│   ├── index.ts        # Registry singleton
│   └── loader.ts       # Domain auto-loading
├── domains/            # New domain-organized tools
│   ├── memory/         # Memory & recall tools
│   ├── habits/         # Habit tracking & coaching
│   ├── finance/        # Financial tools
│   ├── communication/  # Email, SMS, calendar
│   └── ...
├── orchestration/      # NEW: Conversation orchestration
│   ├── tool-composer.ts    # Tool chaining & context sharing
│   └── index.ts
├── utils/              # NEW: Shared utilities
│   ├── tool-helpers.ts # getUserId, generateId, formatters
│   └── index.ts
├── builder.ts          # Build tools from manifests
└── index.ts            # Main exports
```

## Migration Status

### ✅ Completed

1. **Shared Utilities** (`utils/tool-helpers.ts`)
   - `getUserId()` - Extract userId from context
   - `generateId()` - Consistent ID generation
   - `formatCurrency()`, `formatDate()`, etc.
   - `getLogger()` - Cached logger access

2. **Orchestration Layer** (`orchestration/`)
   - `ConversationStateManager` - Shared conversation context
   - `ToolComposer` - Tool chaining and context sharing
   - `EmotionalContext` - Emotional awareness
   - `TOOL_CHAINS` - Predefined tool sequences

3. **Deprecations**
   - `gamification.ts` (v1) - Use `gamification-v2.ts` instead
   - Persona-specific aliases (createMayaTools, etc.)

### 🔄 In Progress

1. **Habit System Unification**
   - `domains/habits/unified-habits.ts` - New unified implementation
   - Merges `habits.ts` + `habit-coaching.ts`

### 📋 Planned

1. **Proactive Tools Consolidation**
   - Merge `proactive.ts` + `proactive-coaching.ts`

2. **Communication Tools Unification**
   - Consolidate `communication.ts`, `communication-tools.ts`, `domains/communication/`

## How to Migrate

### For Tool Consumers

**Before (Legacy):**
```typescript
import { createMayaTools, createAlexTools } from './tools/index.js';
const mayaTools = createMayaTools();
const alexTools = createAlexTools();
```

**After (New):**
```typescript
import { buildAgentTools } from './tools/index.js';

// For specific agent
const tools = await buildAgentTools('maya-santos');

// For specific domains
import { buildToolsForDomains } from './tools/index.js';
const tools = await buildToolsForDomains(['habits', 'finance']);
```

### For Orchestration

**Using the Composer:**
```typescript
import { createToolComposer, composeToolResult } from './tools/index.js';

// Create composer for session
const composer = createToolComposer(sessionId, userId, agentId);

// Compose tool result with metadata
const result = composer.compose('logHabit', habitResult, {
  shareContext: true,
  extractFacts: true,
});

// result.speech - Natural language for TTS
// result.emotion - Emotion hint ('happy', 'celebratory', etc.)
// result.suggestedNext - Tools to consider next
// result.factsToRemember - Facts to persist
```

**Quick composition:**
```typescript
import { composeToolResult } from './tools/index.js';

const result = composeToolResult(sessionId, 'logHabit', habitResult);
```

### For Tool Implementers

**Before (Legacy):**
```typescript
export function createMyTools() {
  return {
    myTool: llm.tool({
      description: '...',
      parameters: z.object({ ... }),
      execute: async (params, { ctx }) => {
        const userData = ctx?.userData as { userId?: string };
        const userId = userData?.userId || 'default';
        // ...
      },
    }),
  };
}
```

**After (New):**
```typescript
import { getUserId, generateId } from '../utils/tool-helpers.js';
import type { ToolDefinition, ToolContext, Tool } from '../registry/types.js';

export const myToolDef: ToolDefinition = {
  id: 'myTool',
  name: 'My Tool',
  description: 'What this tool does',
  domain: 'productivity',  // or 'habits', 'finance', etc.
  tags: ['relevant', 'tags'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: '...',
      parameters: z.object({ ... }),
      execute: async (params, { ctx: toolCtx }) => {
        const userId = getUserId({ ctx: toolCtx });
        const newId = generateId('item');
        // ...
      },
    });
  },
};
```

## Deprecation Warnings

The following exports are deprecated and will be removed:

| Deprecated | Use Instead |
|-----------|-------------|
| `createMayaTools` | `createFinancialHabitsTools` or `buildAgentTools('maya-santos')` |
| `createAlexTools` | `createCommunicationTools` or `buildAgentTools('alex-chen')` |
| `createJordanTools` | `createEventPlanningTools` or `buildAgentTools('jordan-taylor')` |
| `createGamificationTools` | `createGamificationToolsV2` |
| `createMayaGamificationTools` | `createGamificationToolsV2` |

## Tool Chains

The orchestration system defines tool chains for natural conversation flow:

```typescript
import { TOOL_CHAINS } from './tools/index.js';

// Example: After logging a habit
TOOL_CHAINS.logHabit = {
  primary: 'logHabit',
  suggestedFollowers: ['awardXP', 'checkStreakMilestone', 'suggestNextHabit'],
  contextKeys: ['habitName', 'streak', 'completed'],
  typicalEmotion: 'celebratory',
};
```

## Conversation State

The `ConversationStateManager` provides shared context:

```typescript
import { getConversationState } from './tools/index.js';

const state = getConversationState(sessionId, userId, agentId);

// Emotional context
state.setEmotionalContext({ sentiment: 'positive', urgency: 2 });
state.detectEmotion('excited');

// Topic tracking
state.setCurrentTopic('retirement planning');
state.addCircleBackTopic('emergency fund', 'User mentioned wanting to discuss');

// Flow signals
const { should, reasons } = state.shouldWrapUp();
if (should) {
  console.log('Consider wrapping up:', reasons);
}

// For LLM context
const summary = state.getSummaryForLLM();
```

## Testing

To verify the migration works:

```bash
# Run tool tests
npm test -- --grep "tools"

# Check for deprecation warnings
npm run lint

# Build to check types
npm run build
```

## Questions?

- See `src/tools/registry/types.ts` for all type definitions
- See `src/tools/orchestration/tool-composer.ts` for chain definitions
- See individual domain folders for implementation examples

