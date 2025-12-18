# Contributing to Ferni AI

Welcome! We're excited you want to contribute to Ferni. This guide will help you get started.

---

## Before Everything Else: Our Mission

> **We believe in making AI human, and the decisions we make will reflect that.**

This isn't just a tagline. It's the lens through which every contribution should be viewed.

Before you write any code, ask yourself:
1. **Does this make the AI feel more human?** - If it adds warmth, connection, or natural interaction: do it
2. **Does this serve the relationship?** - Every interaction is part of an ongoing relationship, not a transaction
3. **Does this support gentle growth?** - Sustainable change comes from compassion, not pressure
4. **Is this authentic?** - Real character, not corporate neutrality

Read [`CORE-PRINCIPLES.md`](./CORE-PRINCIPLES.md) for our complete philosophy. This is **required reading** before your first PR.

---

## Quick Start

```bash
# 1. Clone and setup
git clone <repo-url>
cd voiceai
npm install
cp .env.example .env

# 2. Run quality checks before making changes
npm run quality  # Typecheck + lint + test

# 3. Start development
npm run dev
```

## Before You Code

### 1. Read the Standards

| Document | What You'll Learn |
|----------|-------------------|
| `CORE-PRINCIPLES.md` | **START HERE** - Our mission and philosophy |
| `.cursorrules` | Complete coding standards (required reading) |
| `CLAUDE.md` | Quick reference for common patterns |
| `src/tools/CLAUDE.md` | How to create tools |
| `src/personas/CLAUDE.md` | How to create personas |
| `apps/web/CLAUDE.md` | Frontend design standards |

### 2. Understand the Architecture

```
agents/           → Voice agent implementations
personas/         → Persona bundles + cognitive profiles
intelligence/     → Context builders (emotion, memory, topics)
services/         → Business logic, DI container
memory/           → Storage: Firestore, Postgres, Redis
tools/            → 100+ LLM tools organized by domain
api/              → REST API routes
```

### 3. Find Existing Code First

Before creating new files, search the codebase:

```bash
# Search for function/class names
grep -r "functionName" src/

# Find files by pattern
find src -name "*.ts" | xargs grep "pattern"

# List large files that might have what you need
find src -name "*.ts" -exec wc -l {} \; | sort -rn | head -20
```

---

## Code Quality Requirements

### Non-Negotiable Rules

| ❌ Never | ✅ Always |
|----------|----------|
| `console.log()` | `createLogger()` from `utils/safe-logger.js` |
| `any` type | `unknown` + type narrowing |
| Files > 500 lines | Split into modules |
| `as any` casts | Proper typing or `as unknown as T` |
| `.catch(() => {})` | `.catch((e) => log.error({ error: e }, 'context'))` |
| Hardcoded colors | CSS variables: `var(--persona-primary)` |
| Hardcoded durations | Constants: `DURATION.SLOW`, `EASING.SPRING` |

### Required Checks

Run these before every commit:

```bash
npm run quality      # Full check (typecheck + lint + test)
npm run typecheck    # TypeScript only
npm run lint:fix     # Auto-fix lint issues
npm test             # Run tests
```

All checks must pass before your PR can be merged.

---

## Making Changes

### 1. Create a Branch

```bash
git checkout -b feature/my-feature
# or
git checkout -b fix/bug-description
```

### 2. Follow File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Modules | `kebab-case.ts` | `user-profile.ts` |
| Classes | `PascalCase.ts` | `SessionManager.ts` |
| Tests | `*.test.ts` | `memory.test.ts` |
| Domain tools | Domain name, not persona | `habit-coaching.ts` ✅, `maya-habits.ts` ❌ |

### 3. Write Tests

Every feature needs tests:

```typescript
// src/tests/my-feature.test.ts
import { describe, it, expect } from 'vitest';

describe('MyFeature', () => {
  it('should handle success case', async () => {
    const result = await myFeature.execute(validInput);
    expect(result.success).toBe(true);
  });

  it('should handle error case', async () => {
    const result = await myFeature.execute(invalidInput);
    expect(result.success).toBe(false);
  });
});
```

### 4. Add JSDoc for Public APIs

```typescript
/**
 * Creates a new habit for the user.
 * 
 * @param userId - The user's unique identifier
 * @param habit - The habit configuration
 * @returns The created habit or an error
 * 
 * @example
 * const result = await createHabit('user-123', { name: 'Meditate' });
 */
export async function createHabit(
  userId: string,
  habit: HabitConfig
): Promise<Result<Habit, HabitError>> {
  // ...
}
```

---

## Specific Contribution Types

### Adding a Tool

1. Read `src/tools/CLAUDE.md`
2. Create tool in appropriate domain: `src/tools/domains/{domain}/`
3. Use `defineTool()` builder
4. Register with `registerTool()`
5. Add tests

```typescript
// src/tools/domains/wellness/my-tool.ts
import { defineTool } from '../../builder.js';
import { z } from 'zod';

export const myTool = defineTool({
  name: 'my_tool',
  description: 'What this tool does',
  parameters: z.object({
    userId: z.string(),
  }),
  execute: async (params) => {
    // implementation
  },
});
```

### Adding a Persona

1. Read `src/personas/CLAUDE.md`
2. Create bundle: `src/personas/bundles/{persona-id}/`
3. Write `persona.manifest.json`
4. Add identity files
5. Register in persona registry
6. Test with: `PERSONA_ID={id} npm run dev`

### Adding a Context Builder

1. Read `src/intelligence/context-builders/CLAUDE.md`
2. Create builder file
3. Export from index
4. Follow priority guidelines
5. Add tests

### Adding an API Endpoint

1. Create route handler in `src/api/`
2. Use `createLogger()` for logging
3. Add authentication via `requireAuth()`
4. Validate input with Zod schemas
5. Add to router in `ui-server.js`

---

## Pull Request Process

### 1. PR Title Format

```
feat: Add habit streak tracking
fix: Resolve memory leak in voice agent
refactor: Split large tools file
docs: Update API reference
test: Add context builder tests
```

### 2. PR Description Template

```markdown
## What
Brief description of changes

## Why
Motivation for the change

## How
Implementation approach

## Testing
How you tested this

## Checklist
- [ ] Tests pass (`npm run quality`)
- [ ] New code has tests
- [ ] Documentation updated if needed
- [ ] No console.log statements
- [ ] Types are explicit (no `any`)
```

### 3. Review Process

1. All checks must pass
2. At least one approval required
3. Address review comments
4. Squash commits on merge

---

## Getting Help

### Where to Look

1. Search existing docs in `docs/`
2. Check inline CLAUDE.md files in src directories
3. Look at similar existing code
4. Check test files for usage examples

### Common Issues

| Issue | Solution |
|-------|----------|
| TypeScript errors | Run `npm run build` for details |
| Test failures | Check `npm test -- --verbose` |
| Lint errors | Run `npm run lint:fix` |
| Module not found | Check import paths use `.js` extension |

---

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on the code, not the person
- Assume good intent

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

