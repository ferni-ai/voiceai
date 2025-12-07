# ADR-0002: Context Builder Pattern for LLM Intelligence

**Status**: Accepted  
**Date**: 2024-12-01  
**Decision Makers**: Engineering Team  
**Technical Story**: Modular LLM context injection system

## Context

Ferni's LLM needs contextual information to provide relevant, personalized responses. This includes:
- User profile data (name, preferences)
- Conversation history
- Current emotional state
- Persona-specific behavior rules
- Time-of-day awareness
- Memory recall
- Handoff context

Initially, context was built in one large function with many conditionals. This became:
1. Hard to test individual pieces
2. Difficult to add new context types
3. Impossible to toggle/debug specific injections
4. Performance-opaque (couldn't measure individual builder costs)

## Decision Drivers

* **Modularity**: Each context type should be independently testable
* **Extensibility**: Easy to add new context builders
* **Observability**: Measure latency of each builder
* **Flexibility**: Disable/enable builders per persona or situation
* **Type Safety**: Strong typing for builder inputs/outputs

## Considered Options

1. **Monolithic Context Function** - Single function building all context
2. **Plugin System** - Dynamic loading of context plugins
3. **Context Builder Pattern** - Registered builders with dependency injection

## Decision Outcome

Chosen option: **Context Builder Pattern**, because it provides the best balance of modularity, testability, and performance observability.

### Positive Consequences

* Each builder is independently testable
* Builders can declare dependencies on other builders
* Performance metrics per builder
* Easy to add new context types
* Can disable builders for specific personas
* Clear separation of concerns

### Negative Consequences

* More files to manage
* Learning curve for the pattern
* Need to manage builder execution order

## Pros and Cons of the Options

### Option 1: Monolithic Context Function

Single large function with all context logic.

* ✅ Good, because simple to understand initially
* ✅ Good, because no abstraction overhead
* ❌ Bad, because hard to test individual pieces
* ❌ Bad, because adding features increases complexity exponentially
* ❌ Bad, because no performance visibility

### Option 2: Plugin System

Dynamic plugin loading with interface contracts.

* ✅ Good, because maximum flexibility
* ✅ Good, because can add plugins at runtime
* ❌ Bad, because complex to implement
* ❌ Bad, because harder to type check
* ❌ Bad, because debugging is difficult

### Option 3: Context Builder Pattern (Chosen)

Statically registered builders with dependency injection.

* ✅ Good, because modular and testable
* ✅ Good, because type-safe with TypeScript
* ✅ Good, because observable performance
* ✅ Good, because clear execution order
* ✅ Good, because can conditionally enable/disable
* ❌ Bad, because more files and abstractions

## Implementation

### Builder Interface

```typescript
interface ContextBuilderInput {
  userProfile: UserProfile;
  conversationHistory: ConversationTurn[];
  currentAgent: string;
  sessionContext: SessionContext;
}

interface ContextInjection {
  type: 'system' | 'hint' | 'critical';
  content: string;
  priority: number;
  builder: string;
}

type ContextBuilder = (input: ContextBuilderInput) => ContextInjection[];
```

### Available Builders (15+)

| Builder | Purpose | Priority |
|---------|---------|----------|
| `emotion` | Detect/respond to emotional state | 100 |
| `memory` | Recall relevant memories | 90 |
| `topics` | Track conversation topics | 80 |
| `persona` | Inject persona-specific rules | 100 |
| `handoff` | Handle agent transitions | 95 |
| `time` | Time-of-day awareness | 60 |
| `engagement` | Rituals, streaks, predictions | 70 |
| `humanizing` | Filler words, prosody | 50 |
| `safety` | Content safety guardrails | 100 |

### Registration Pattern

```typescript
// In each builder file:
registerContextBuilder('emotion', async (input) => {
  const emotion = detectEmotion(input.conversationHistory);
  if (emotion.intensity > 0.7) {
    return [createCriticalInjection(
      `User appears ${emotion.type}. Respond with empathy.`,
      'emotion'
    )];
  }
  return [];
});
```

## Metrics

Each builder execution is measured:
- `context_builder_duration_ms{builder="emotion"}`
- `context_builder_injections{builder="memory"}`
- `context_builder_errors{builder="handoff"}`

## Links

* [Context Builders CLAUDE.md](../../../src/intelligence/context-builders/CLAUDE.md)
* [Cognitive Intelligence Architecture](../COGNITIVE-INTELLIGENCE-ARCHITECTURE.md)

