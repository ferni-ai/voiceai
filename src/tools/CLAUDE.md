# Tool Development

> **We believe in making AI human, and the decisions we make will reflect that.**

Tools give our AI the ability to take meaningful action in users' lives. Every tool should support gentle growth and authentic connection. See `../../CORE-PRINCIPLES.md` for our complete philosophy.

---

## Reference Docs
- Full guide: `docs/AGENT-AGNOSTIC-ARCHITECTURE.md`
- Examples: See existing tools in this directory

## Quick Start

### 1. Name by Domain (Not Persona)
```
habit-coaching.ts     # Correct - domain name
maya-habit-coach.ts   # Wrong - persona-specific
```

### 2. Tool Structure
```typescript
import { z } from 'zod';
import { defineTool } from './builder.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'tools:my-domain' });

export const myTool = defineTool({
  name: 'tool_name',
  description: 'Clear description of what this tool does',
  parameters: z.object({
    userId: z.string().describe('The user ID'),
    query: z.string().optional().describe('Optional search query'),
  }),
  execute: async (params, context) => {
    try {
      const result = await doSomething(params);
      return { success: true, data: result };
    } catch (error) {
      log.error({ error: String(error) }, 'Tool execution failed');
      return { success: false, error: 'Failed to execute' };
    }
  },
});
```

### 3. Register the Tool
```typescript
import { registerTool } from './registry.js';

registerTool(myTool);
```

## Rules

### Do
- Return structured results `{ success: boolean, data?: T, error?: string }`
- Validate inputs with Zod schemas
- Log errors with context
- Keep tools focused (single responsibility)
- Use `readonly` for input params that shouldn't be mutated

### Don't
- Create persona-specific tools (use context for personalization)
- Use `as any` - properly type parameters
- Forget error handling - wrap in try/catch
- Make tools > 200 lines (split into helpers)
- Call other tools directly (use the orchestration layer)

## Tool Categories
```
tools/
├── domains/
│   ├── memory/       # remember, recall, search
│   ├── finance/      # calculators, market data
│   └── wellness/     # habits, mood, health
├── scheduling.ts     # Calendar, reminders
├── handoff.ts        # Agent switching
└── builder.ts        # Tool factory (don't modify)
```

## Testing Tools
```typescript
// src/tests/tools/my-tool.test.ts
import { describe, it, expect } from 'vitest';
import { myTool } from '../../tools/my-domain.js';

describe('myTool', () => {
  it('should return success with valid input', async () => {
    const result = await myTool.execute({ userId: '123' }, mockContext);
    expect(result.success).toBe(true);
  });

  it('should handle errors gracefully', async () => {
    const result = await myTool.execute({ userId: '' }, mockContext);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
```
