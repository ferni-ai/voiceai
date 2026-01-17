# Semantic Coherence Test Suite

> **"We believe in making AI human, and the decisions we make will reflect that."**

This test suite uses **LLM reasoning** to validate that our codebase naming, organization, and architecture align with our "Better than Human" philosophy.

## Why Synthetic LLM Tests?

Traditional tests verify behavior. **Semantic coherence tests** verify that:
- Names imply their actual function
- Related concepts are grouped logically
- The architecture reflects our core philosophy
- Domain boundaries make intuitive sense

## Test Categories

### 1. Domain Naming Coherence
Does `commitment-keeper.ts` sound like it keeps commitments? Does `emotional-first-aid.ts` suggest immediate emotional support?

### 2. Semantic Memory Organization
Can you find relationship data in `relationship-network.ts`? Is memory retrieval logically organized?

### 3. Integration Wiring Validation
When Ferni needs Peter's research, is the handoff discoverable? Are cross-persona connections intuitive?

### 4. Architectural Philosophy Alignment
Does the "Better Than Human" folder actually contain superhuman capabilities? Does the architecture embody our principles?

## Running Tests

```bash
# Run all semantic coherence tests
pnpm test:semantic

# Run specific category
pnpm test:semantic:naming
pnpm test:semantic:memory
pnpm test:semantic:wiring
pnpm test:semantic:philosophy

# Generate coherence report
pnpm test:semantic:report
```

## Test Output

Tests generate both:
1. **Pass/Fail results** - Binary coherence assessment
2. **Coherence scores** - 0-100 semantic alignment rating
3. **Suggestions** - LLM-generated improvement recommendations

## Philosophy

> "If an intelligent newcomer can't guess what a module does from its name and location, we've failed at semantic design."
