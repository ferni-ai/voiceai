# ADR-004: Persona Registry Pattern

## Status

Accepted

## Date

2024-12-07

## Context

The voice agent supports multiple personas (Ferni, Maya, Jack, etc.), each with:
- Different voice IDs and speech patterns
- Different tools and capabilities
- Different cognitive profiles and behaviors
- Different greeting styles

Initially, persona-specific code was scattered:
- `maya-habits.ts`, `jack-finance.ts` (persona-coupled tools)
- Hardcoded persona checks in business logic
- No clear way to add new personas

## Decision

Adopt a **Registry Pattern** for personas:

### 1. Unified Registry
```typescript
// src/personas/registry/unified-registry.ts
export const personaRegistry = {
  register(id: string, config: PersonaConfig): void,
  get(id: string): PersonaConfig,
  list(): PersonaConfig[],
};
```

### 2. Domain-Based Tools (Not Persona-Based)
```
# Wrong: persona-coupled
tools/maya-habits.ts
tools/jack-finance.ts

# Right: domain-based
tools/domains/habits/index.ts     # Used by Maya
tools/domains/finance/index.ts    # Used by Jack
```

### 3. Tool Bundles per Persona
```typescript
// Each persona declares which domain tools it uses
const mayaBundle: PersonaBundle = {
  id: 'maya',
  tools: ['habits', 'wellness', 'scheduling'],
  voice: { ... },
  cognitive: { ... },
};
```

### 4. Runtime Loading
```typescript
// At session start, load persona bundle
const persona = await loadPersonaBundle(personaId);
const tools = await loadToolsForPersona(persona);
```

## Consequences

### Positive
- Adding new personas is declarative (config, not code)
- Tools are reusable across personas
- Clear separation of concerns
- Easy to A/B test persona variations

### Negative
- More indirection than direct imports
- Need to maintain registry consistency
- Bundle configuration can be complex

### Neutral
- Migration from old pattern ongoing
- Some legacy persona-specific code remains

## Alternatives Considered

### Alternative 1: Inheritance-Based Personas
- Pros: Familiar OOP pattern
- Cons: Rigid, hard to compose capabilities
- Why not chosen: Composition > inheritance for this use case

### Alternative 2: Separate Codebases per Persona
- Pros: Complete isolation
- Cons: Massive duplication, hard to share improvements
- Why not chosen: Personas share 80%+ of code

## References

- `src/personas/registry/` - Registry implementation
- `src/personas/bundles/` - Persona bundle definitions
- `src/tools/domains/` - Domain-based tool organization
- `docs/AGENT-AGNOSTIC-ARCHITECTURE.md` - Full patterns guide
