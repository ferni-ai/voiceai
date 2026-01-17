# Tool Domains

> **We believe in making AI human, and the decisions we make will reflect that.**

This directory contains 118+ tool domains - each representing a focused area of functionality that Ferni can use to help users. See `../CLAUDE.md` for the full tool development guide.

---

## Quick Reference

| What | Where |
|------|-------|
| Domain Index | `index.ts` |
| Shared Utilities | `shared/` |
| Example Domain | `career/index.ts` |
| Tests | `{domain}/__tests__/` |

---

## Domain Categories

### Core Personas
| Domain | Persona | Purpose |
|--------|---------|---------|
| `habits/` | Maya | Habit tracking, gamification |
| `habit-coaching/` | Maya | Habit coaching tools |
| `maya-coaching/` | Maya | Personalized coaching |
| `research/` | Peter | Stock research, market analysis |
| `peter-analytics/` | Peter | Data analysis tools |
| `communication/` | Alex | Email, SMS, messaging |
| `calendar/` | Alex | Scheduling, contacts |
| `life-planning/` | Jordan | Goals, milestones |
| `jordan-planning/` | Jordan | Event planning |
| `wisdom/` | Nayan | Quotes, principles |
| `nayan-wisdom/` | Nayan | Deep wisdom tools |

### Life Coaching
| Domain | Purpose |
|--------|---------|
| `career/` | Job search, interviews, development |
| `decisions/` | Decision frameworks |
| `family/` | Parenting, family dynamics |
| `health/` | Exercise, nutrition, sleep |
| `crisis/` | Crisis resources, safety |
| `grief/` | Loss, transition support |
| `relationships/` | Connection, conflict resolution |
| `self-compassion/` | Inner critic, self-kindness |

### Deep Human Engagement
| Domain | Purpose |
|--------|---------|
| `meaning/` | Purpose, values, spirituality |
| `stories/` | Life story, legacy, narrative |
| `vulnerability/` | Shame, authenticity |
| `curiosity/` | Wonder, exploration |
| `dreams/` | Aspirations, imagination |
| `presence/` | Grounding, mindfulness |
| `play/` | Joy, playfulness |

### Utilities
| Domain | Purpose |
|--------|---------|
| `memory/` | User memory, recall |
| `information/` | News, weather, search |
| `entertainment/` | Music, media |
| `productivity/` | Tasks, notes, routines |
| `finance/` | Banking, budgeting |
| `handoff/` | Agent switching |
| `telephony/` | Phone calls |

---

## Domain Structure

Each domain follows this structure:

```
domains/{domain}/
├── index.ts           # Main exports, getToolDefinitions()
├── types.ts           # Domain-specific types (optional)
├── storage.ts         # Persistence layer (optional)
├── helpers.ts         # Utility functions (optional)
└── __tests__/
    └── {domain}.test.ts
```

### Standard Domain Export

```typescript
// index.ts
import { createDomainExport } from '../../registry/loader.js';

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'career',
  [
    careerGoalsTool,
    jobSearchTool,
    interviewPrepTool,
  ]
);
```

---

## Creating a New Domain

1. Create folder: `domains/{domain-name}/`
2. Create `index.ts` with tool definitions
3. Export via `createDomainExport()`
4. Add tests in `__tests__/{domain}.test.ts`
5. The domain is auto-discovered by the semantic router

---

## Rules

### Do ✅
- Name by domain, not persona
- Keep tools focused (single responsibility)
- Return human-readable responses
- Use `getLogger()` for logging
- Write tests for all tools

### Don't ❌
- Create persona-specific tool names
- Make tools > 200 lines
- Return raw JSON to users
- Use `console.log`
- Skip error handling

---

## Reference Docs

- Tool Development: `../CLAUDE.md`
- Semantic Router: `../semantic-router/`
- Orchestration: `../orchestrator/`
- Registry: `../registry/`

---

*Last updated: January 2026*
