# ADR-001: Clean Architecture with Domain Layers

## Status

Accepted

## Date

2024-12-07

## Context

The Ferni AI Voice Agent codebase grew organically with features spread across many files without clear boundaries. This led to:
- Circular dependencies between modules
- Difficulty understanding where new code should go
- Tight coupling making refactoring risky
- No clear separation between business logic and infrastructure

## Decision

Adopt a layered architecture with strict import rules:

```
Level 100 (Application):
  agents/     - Voice agent entry points
  api/        - HTTP API routes
  cli/        - Command-line tools

Level 70 (Domain - peers can import each other):
  personas/       - Agent personality definitions
  intelligence/   - Context builders, emotion detection
  tools/          - LLM tools (domain logic)
  conversation/   - Conversation state management
  speech/         - Speech processing, SSML

Level 60 (Service):
  services/   - Business logic orchestration, DI container

Level 10-30 (Infrastructure):
  memory/     - Data storage (Firestore, Postgres, Redis)
  config/     - Configuration
  utils/      - Shared utilities
  types/      - Type definitions
```

**Import Rules:**
- Lower layers CANNOT import from higher layers
- Domain layers (Level 70) can import from each other
- Enforced by `npm run quality:arch`

## Consequences

### Positive
- Clear boundaries prevent spaghetti dependencies
- New developers understand where code belongs
- Refactoring is safer with explicit contracts
- Automated validation catches violations

### Negative
- Some legitimate patterns require explicit exceptions
- Initial effort to categorize existing code
- May feel restrictive for small changes

### Neutral
- Existing circular dependencies flagged as warnings (not blocking)

## Alternatives Considered

### Alternative 1: Strict Hexagonal Architecture
- Pros: Maximum decoupling, easy to test
- Cons: Too much ceremony for a single-team project
- Why not chosen: Overhead not justified for current team size

### Alternative 2: No Formal Architecture
- Pros: Maximum flexibility
- Cons: Already causing problems with circular deps
- Why not chosen: Current pain points require structure

## References

- `scripts/architecture-validator.ts` - Enforcement script
- `docs/CLEAN-ARCHITECTURE.md` - Detailed architecture guide
