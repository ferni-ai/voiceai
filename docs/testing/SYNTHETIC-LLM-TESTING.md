# Synthetic LLM Testing for Ferni Platform

> "We believe in making AI human, and the decisions we make will reflect that."

## Overview

Synthetic LLM testing uses AI-generated realistic scenarios to validate platform capabilities. Unlike unit tests with hardcoded examples, synthetic tests:

1. **Generate novel scenarios** - LLM creates realistic, varied user utterances
2. **Find edge cases** - Discovers gaps pattern-based systems miss
3. **Validate at scale** - Runs hundreds of scenarios automatically
4. **Measure capability depth** - Reveals how well systems handle real speech

## Test Scripts

### 1. Better Than Human (`test-better-than-human.ts`)

Tests superhuman detection capabilities:

```bash
# All systems
pnpm test:bth:llm

# Individual systems
pnpm test:bth:data-capture
pnpm test:bth:emotion
pnpm test:bth:reading-lines
```

| System | What It Tests | Target |
|--------|---------------|--------|
| Data Capture | Phone, email, names, dates extraction | >90% |
| Reading Lines | Deflection, masking, permission-seeking | >75% |
| Emotion Detection | Primary emotion, energy, intensity | >85% |
| Wellbeing Tracking | Sleep, stress, social, energy | >80% |

### 2. Platform Capabilities (`test-platform-synthetic.ts`)

Tests core platform routing and intelligence:

```bash
# All systems
pnpm test:platform

# Individual systems
pnpm test:platform:router
pnpm test:platform:handoff
pnpm test:platform:music
pnpm test:platform:habit
```

| System | What It Tests | Current | Target |
|--------|---------------|---------|--------|
| Semantic Router | Tool selection for 286 tools | 100% | 95%+ |
| Handoff Intelligence | Persona suggestions | ~40% | >80% |
| Music Intelligence | Emotion-to-music mapping | 100% | 95%+ |
| Contact Resolution | Relationship detection | ~80% | >90% |
| Habit Coaching | Goal/obstacle detection | ~40% | >80% |
| Calendar Intelligence | Schedule intent detection | ~30% | >80% |
| Trust Context | Boundary/rapport signals | ~40% | >80% |

### 3. E2E Tool Execution (`test-tool-execution-e2e.ts`)

Tests full execution pipeline:

```bash
# All tools
pnpm test:e2e:tools

# Specific categories
pnpm test:e2e:tools:music
pnpm test:e2e:tools:crisis
```

| Step | What It Tests |
|------|---------------|
| Routing | Semantic router detection |
| Argument Extraction | Parameter parsing |
| Tool Execution | Actual tool runs |
| Response | Correct output format |

### 4. Superhuman Services (`synthetic-superhuman.test.ts`)

Tests commitment, values, and crisis:

```bash
vitest run src/tests/superhuman/synthetic-superhuman.test.ts
```

## Running All Synthetic Tests

```bash
# Run everything
pnpm test:synthetic:all

# With verbose output
TEST_LLM_MODEL=gemini-2.5-flash pnpm test:platform:verbose
```

## LLM Model Configuration

Set via environment variable:

```bash
# Default (fast, good quality)
export TEST_LLM_MODEL=gemini-2.5-flash

# Alternative models
export TEST_LLM_MODEL=gemini-3-flash-preview
export TEST_LLM_MODEL=gemini-2.0-flash
```

## Interpreting Results

### Pass Rates

| Rate | Status | Action |
|------|--------|--------|
| >90% | ✅ Excellent | Monitor for regression |
| 70-90% | 🟡 Good | Address edge cases |
| 50-70% | 🟠 Needs Work | Expand patterns/training |
| <50% | ❌ Critical | System redesign needed |

### Common Failure Patterns

1. **Pattern Gaps**: Regex doesn't match natural variations
   - Solution: Add more patterns or use semantic matching

2. **Context Missing**: System needs conversation history
   - Solution: Pass context to detection functions

3. **Ambiguous Intent**: Multiple valid interpretations
   - Solution: Add confidence scoring, ask clarifying questions

4. **Edge Cases**: Unusual but valid expressions
   - Solution: LLM-generated training data

## Adding New Synthetic Tests

### Step 1: Define the Prompt

```typescript
const PROMPTS: Record<string, string> = {
  'my-system': `Generate realistic user utterances for [capability].

Categories:
- category1: Description and examples
- category2: Description and examples

Expected format: {"field": "value", ...}

Include natural, casual requests.`,
};
```

### Step 2: Create Tester Function

```typescript
async function testMySystem(
  scenarios: Scenario[],
  systems: Systems
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const scenario of scenarios) {
    // Call actual system
    const result = systems.mySystemFunction(scenario.utterance);
    
    // Validate against expected
    const passed = /* validation logic */;
    
    results.push({ scenario, passed, details });
  }

  return results;
}
```

### Step 3: Register in Main

```typescript
switch (systemName) {
  case 'my-system':
    results = await testMySystem(scenarios, systems);
    break;
}
```

## Continuous Improvement Loop

```
┌──────────────────────────────────────────────────────────────┐
│                    SYNTHETIC TESTING LOOP                     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│   1. LLM generates scenarios                                  │
│              ↓                                                │
│   2. Run against system                                       │
│              ↓                                                │
│   3. Identify failures                                        │
│              ↓                                                │
│   4. Analyze patterns                                         │
│              ↓                                                │
│   5. Expand detection (patterns, embeddings, training)        │
│              ↓                                                │
│   6. Re-run tests → goto 1                                    │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Key Insights from Testing

### Pattern-Based vs Semantic Detection

| Approach | Speed | Accuracy | Scalability |
|----------|-------|----------|-------------|
| Regex Patterns | <1ms | ~40-70% | Hard to maintain |
| Keyword Matching | <1ms | ~60-80% | Medium |
| Embedding Similarity | 10-50ms | ~85-95% | Excellent |
| LLM Classification | 100-500ms | ~95%+ | Excellent |

**Recommendation**: Use pattern matching for high-frequency, clear intents. Use semantic/LLM for nuanced detection.

### Systems That Benefit Most from LLM Testing

1. **Reading Between Lines** - Subtle emotional signals
2. **Trust Context** - Relationship dynamics
3. **Handoff Intelligence** - Implicit specialty requests
4. **Habit Coaching** - Goal vs complaint distinction

## Related Documentation

- `docs/architecture/TOOL-LOADING-SYSTEM.md` - How tools get to Gemini
- `docs/architecture/CLEAN-ARCHITECTURE.md` - Layer boundaries
- `CLAUDE.md` - Development guidelines
