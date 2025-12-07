# ADR-0003: Domain-Based Tool Organization

**Status**: Accepted  
**Date**: 2024-12-01  
**Decision Makers**: Engineering Team  
**Technical Story**: LLM tool organization and routing

## Context

Ferni has 100+ LLM tools across various domains (financial, communication, habits, memory, etc.). Managing this many tools presented challenges:

1. **Token efficiency**: LLM context windows have limits
2. **Tool selection**: LLM struggled to choose correct tool
3. **Persona relevance**: Not all tools apply to all personas
4. **Maintenance**: Scattered tool definitions
5. **Testing**: No clear ownership

## Decision Drivers

* **LLM Performance**: Fewer, focused tools improve selection accuracy
* **Token Efficiency**: Only load relevant tools per conversation
* **Persona Routing**: Match tools to persona specialties
* **Developer Experience**: Clear organization and ownership
* **Extensibility**: Easy to add new tool domains

## Considered Options

1. **Flat Tool List** - All tools always available
2. **Category Tags** - Tag-based filtering
3. **Domain Organization** - Hierarchical domain structure

## Decision Outcome

Chosen option: **Domain Organization**, with consolidated domain tools and persona-based routing.

### Positive Consequences

* Tools organized by domain (`financial/`, `communication/`, `habits/`)
* Consolidated domain tools reduce LLM confusion
* Persona manifests specify required/optional/forbidden tools
* Better test coverage per domain
* Clear ownership model

### Negative Consequences

* More complex tool loading
* Cross-domain operations need coordination
* Some duplication across domains

## Implementation

### Directory Structure

```
src/tools/
├── index.ts                    # Tool registry and factories
├── lifecycle.ts                # Init/shutdown
├── categories.ts               # Domain definitions
│
├── financial/                  # Financial domain
│   ├── market-tools.ts         # Stock quotes, analysis
│   ├── calculator-tools.ts     # Financial calculators
│   └── personal-finance.ts     # Budget, expenses
│
├── communication/              # Alex's domain
│   ├── email-drafting.ts
│   ├── meeting-scheduling.ts
│   └── outreach.ts
│
├── habit-coaching/             # Maya's domain
│   ├── habit-tracking.ts
│   ├── streak-management.ts
│   └── challenges.ts
│
├── memory/                     # Shared memory tools
│   ├── remember-tool.ts
│   ├── recall-tool.ts
│   └── search-tool.ts
│
└── consolidated/               # LLM-optimized mega-tools
    ├── financial.ts            # All financial ops in one tool
    ├── memory.ts               # All memory ops in one tool
    └── productivity.ts         # Tasks + shopping + notes
```

### Persona Tool Routing

In `persona.manifest.json`:

```json
{
  "tools": {
    "domains": ["financial", "memory"],
    "required": ["remember", "recall"],
    "optional": ["market_lookup"],
    "forbidden": ["email_draft"]
  }
}
```

### Consolidated Tools

Instead of 15 individual tools:
```
createTaskTool()
createTaskListTool()
createTaskCompleteTool()
createShoppingTool()
createShoppingListTool()
...
```

Use one consolidated tool:
```typescript
createConsolidatedProductivityTool()
// Handles: { domain: 'tasks', action: 'add', text: '...' }
```

This improves LLM selection accuracy by 40%+ in testing.

## Metrics

* Tool count per conversation: ~15 (down from 50+)
* Tool selection accuracy: 94% (up from 78%)
* Tool loading time: <50ms

## Links

* [Tools CLAUDE.md](../../../src/tools/CLAUDE.md)
* [Tool Categories](../../../src/tools/categories.ts)

