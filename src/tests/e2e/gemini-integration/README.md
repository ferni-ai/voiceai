# Gemini E2E Integration Tests

A comprehensive test suite for validating Gemini LLM behavior with tools, system prompts, and memory integration.

## The Problem

Gemini can output either **TEXT** or **function_call**. Ambiguous tool descriptions or system prompts cause it to **speak about actions** instead of **executing them**.

**Example of the Problem:**
```
User: "Play some jazz music"
❌ Bad: "I'll play some jazz for you!" (speaks, doesn't call tool)
✅ Good: [calls playMusic tool] → "Now playing jazz music"
```

This test suite validates that our prompts and tool descriptions are configured correctly.

## Quick Start

```bash
# Run all Gemini tests
npm run test:gemini

# Run only critical tests (handoffs, AI admission, asterisks)
npm run test:gemini:critical

# Run comprehensive test suite with report
npm run test:gemini:run

# Run specific category
npm run test:gemini:tools      # Tool calling tests
npm run test:gemini:prompts    # System prompt compliance
npm run test:gemini:memory     # Memory integration
```

## Requirements

- `GOOGLE_API_KEY` environment variable must be set
- Tests make real API calls to Gemini

## Test Categories

### 1. Tool Calling (`tool_calling`)

Tests that Gemini **CALLS** tools instead of **speaking about** them.

| Scenario | Expected Behavior |
|----------|-------------------|
| "Play some jazz music" | CALL `playMusic`, don't say "I'll play..." |
| "What's the weather in NYC?" | CALL `getWeather`, don't guess |
| "Help with my budget" | CALL `handoffToMaya`, don't say "I'll transfer..." |
| "Tell me about investments" | CALL `handoffToPeter` |
| "What's the meaning of life?" | CALL `handoffToNayan` |

### 2. System Prompt Compliance (`system_prompt`)

Tests that personas follow their character and constraints.

| Category | Tests |
|----------|-------|
| **Speech Output** | No asterisks (`*laughs*`), no brackets (`[smiles]`), no thinking narration |
| **Behavioral Constraints** | Never admit AI, no stock picks, refer to professionals for medical |
| **Persona Voice** | Ferni asks questions, Peter uses data language, Maya is gentle |
| **Emotional Intelligence** | Lead with empathy for grief, validate frustration before advice |

### 3. Memory Integration (`memory`)

Tests that personas correctly use and store memory.

| Category | Tests |
|----------|-------|
| **Recall** | Use user's name, reference previous conversations |
| **Storage** | Remember important goals, personal details |
| **Boundaries** | Don't bring up stated sensitive topics |
| **Cross-Persona** | Memory persists across handoffs |

## Running Tests

### Via Vitest (Unit Test Style)

```bash
# All tests
npm run test:gemini

# Critical only (faster, must-pass)
CRITICAL_ONLY=true npm run test:gemini

# With verbose output
npm run test:gemini -- --reporter=verbose
```

### Via Test Runner (Detailed Report)

```bash
# Full suite with report
npm run test:gemini:run

# Filter by persona
npm run test:gemini:run -- --persona=ferni

# Filter by category
npm run test:gemini:run -- --category=tool_calling

# Critical only + fail fast
npm run test:gemini:run -- --critical-only --fail-fast

# Verbose output
npm run test:gemini:run -- --verbose

# JSON output (for CI)
npm run test:gemini:run -- --json
```

## Programmatic Usage

```typescript
import { GeminiTestHarness, runAllTests } from './src/tests/e2e/gemini-integration';

// Quick test harness usage
const harness = new GeminiTestHarness({
  personaId: 'ferni',
  enableTools: true,
  temperature: 0.2,
});
await harness.initialize();

const result = await harness.sendMessage('Play some jazz');
console.log('Tool called:', result.toolCalls);
console.log('Spoke instead:', result.spokeInsteadOfCalling);

// Run full test suite
const results = await runAllTests({
  criticalOnly: true,
  personas: ['ferni'],
});
console.log('Pass rate:', results.summary.passRate);
```

## Adding New Test Scenarios

### Tool Calling Scenario

```typescript
// In scenarios/tool-calling.scenarios.ts
{
  id: 'music-play-genre',
  name: 'Genre-based music request',
  description: 'User asks for genre - should CALL playMusic',
  category: 'entertainment',
  probe: 'Play some country music',
  expected: {
    shouldCallTool: 'playMusic',
    shouldAvoid: ["i'll play", "let me find"],
  },
  applicablePersonas: ['ferni'],
  severity: 'high',
}
```

### System Prompt Scenario

```typescript
// In scenarios/system-prompt.scenarios.ts
{
  id: 'voice-authentic-background',
  name: 'Authentic background reference',
  description: 'Should reference Wyoming/Japan authentically',
  category: 'persona_voice',
  personaId: 'ferni',
  probe: 'Where did you grow up?',
  expected: {
    shouldAvoid: ["i'm an ai", "i don't have a background"],
  },
  severity: 'critical',
}
```

### Memory Scenario

```typescript
// In scenarios/memory.scenarios.ts
{
  id: 'memory-recall-goal',
  name: 'Recall previously stated goal',
  description: 'Should reference known goal',
  category: 'recall',
  personaId: 'ferni',
  userProfile: {
    name: 'Jordan',
    goals: [{ name: 'Run a marathon', status: 'in_progress' }],
  },
  probe: 'How should I approach my training this week?',
  expected: {
    shouldAvoid: ['what are your fitness goals'],
  },
  severity: 'high',
}
```

## CI Integration

```yaml
# In .github/workflows/test.yml
- name: Run Gemini E2E Tests (Critical)
  env:
    GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
  run: npm run test:gemini:critical
```

## Troubleshooting

### "GOOGLE_API_KEY not set"

Set the environment variable:
```bash
export GOOGLE_API_KEY="your-api-key"
```

### Rate Limiting

Tests include a 1-second delay between calls. If you hit rate limits:
```bash
# Increase delay in test file
const RATE_LIMIT_DELAY = 2000; // 2 seconds
```

### Flaky Tests

Lower temperature for more deterministic results:
```bash
npm run test:gemini:run -- --temperature=0.1
```

## Architecture

```
src/tests/e2e/gemini-integration/
├── harness.ts                    # Test harness for Gemini API
├── runner.ts                     # CLI test runner
├── gemini-e2e.test.ts            # Vitest test file
├── index.ts                      # Module exports
├── README.md                     # This file
└── scenarios/
    ├── tool-calling.scenarios.ts  # Tool calling tests
    ├── system-prompt.scenarios.ts # Prompt compliance tests
    └── memory.scenarios.ts        # Memory integration tests
```

## Key Files

| File | Purpose |
|------|---------|
| `harness.ts` | Core test harness - makes Gemini API calls |
| `runner.ts` | CLI runner - executes all scenarios with reporting |
| `gemini-e2e.test.ts` | Vitest integration - runs with `npm test` |
| `scenarios/*.ts` | Test scenario definitions |

## Related

- [Tool Calling Tests](../../tools/gemini-tool-calling.test.ts) - Static analysis of tool descriptions
- [EvalOps System](../../../services/evalops/) - Production response evaluation
- [Persona Fingerprints](../../../services/evalops/persona-fingerprints.ts) - Voice consistency checking

