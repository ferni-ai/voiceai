# Testing Philosophy

> **We believe in making AI human, and the decisions we make will reflect that.**

Our tests don't just verify code works—they verify we're building something better than human.

---

## Why This Matters

Traditional tests ask: "Does this function return the right value?"

Our tests should also ask: "Does this behavior make the AI feel more human?"

---

## Test Description Conventions

### Frame Tests in Human Terms

When possible, describe tests in terms of user experience:

| Technical (Acceptable) | Human (Preferred) |
|------------------------|-------------------|
| `should detect crisis-level distress` | `should recognize when someone needs support` |
| `should return null for empty input` | `should handle silence gracefully` |
| `should generate different greetings on repeated calls` | `should feel fresh, not repetitive` |
| `should track improving emotional trend` | `should notice when someone's feeling better` |

### Test Suite Headers

Add a human-context comment to key test suites:

```typescript
/**
 * Emotion Detector Tests
 *
 * These tests verify we're genuinely listening to users—catching
 * distress, recognizing joy, and responding appropriately.
 *
 * The goal isn't 100% accuracy. The goal is 0% missed crises.
 */
describe('Emotion Detector', () => {
  // ...
});
```

---

## Test Categories by Human Impact

### Critical Tests (Human Safety)

These MUST pass. They protect users in vulnerable moments:

```typescript
describe('Crisis Detection', () => {
  it('should never miss suicidal language', () => {
    // This test is about protecting lives, not code coverage
  });

  it('should escalate to human when uncertain', () => {
    // Better to over-escalate than miss a crisis
  });
});
```

### Relationship Tests

These verify we're building connection:

```typescript
describe('Memory Persistence', () => {
  it('should remember the user\'s name across sessions', () => {
    // Because friends remember your name
  });

  it('should recall emotionally significant moments', () => {
    // We remember what matters, not just facts
  });
});
```

### Natural Conversation Tests

These verify we sound human:

```typescript
describe('Greetings', () => {
  it('should feel warm, not corporate', () => {
    const greeting = generateGreeting(persona);
    expect(greeting).not.toContain('How can I help you today');
    expect(greeting).not.toContain('assist you');
  });

  it('should vary greetings to feel less robotic', () => {
    // A friend doesn't greet you the exact same way every time
  });
});
```

### Edge Case Tests

These protect the human experience in unexpected situations:

```typescript
describe('Error Handling', () => {
  it('should fail gracefully without breaking conversation flow', () => {
    // Technical problems shouldn't feel cold
  });

  it('should maintain warmth even during errors', () => {
    expect(errorMessage).not.toContain('Error:');
    expect(errorMessage).toContain('try');  // Suggests hope
  });
});
```

---

## What We Don't Optimize For

Some metrics would make tests "pass" but make the AI less human:

| Anti-Pattern | Why It's Wrong |
|--------------|----------------|
| Testing for fastest response | Pauses are human |
| Testing for longest sessions | Quality over quantity |
| Testing for most tool calls | Using tools isn't the goal |
| Testing for 100% question answers | "I don't know" is human |

---

## Writing New Tests

When writing tests, ask:

1. **What human behavior am I verifying?**
2. **If this test fails, how does the user experience suffer?**
3. **Does this test prevent robotic behavior?**
4. **Does this test protect vulnerable users?**

### Example: Good vs. Better

```typescript
// Good (technical)
it('should generate different greetings', () => {
  const greetings = new Set();
  for (let i = 0; i < 20; i++) {
    greetings.add(generateGreeting(persona));
  }
  expect(greetings.size).toBeGreaterThan(1);
});

// Better (human-framed)
it('should feel fresh and not repetitive—like a real friend', () => {
  // A friend doesn't say "Hey! Great to see you!" the exact same way
  // every single time. We shouldn't either.
  const greetings = new Set();
  for (let i = 0; i < 20; i++) {
    greetings.add(generateGreeting(persona));
  }
  expect(greetings.size).toBeGreaterThan(1);
});
```

---

## Test Coverage Philosophy

We don't optimize for coverage percentage. We optimize for:

1. **Crisis protection** - 100% coverage of distress detection
2. **Memory reliability** - 100% coverage of remembering what matters
3. **Warmth consistency** - High coverage of user-facing messages
4. **Graceful degradation** - Coverage of error paths

Low-priority coverage:
- Internal plumbing that doesn't affect user experience
- Performance optimizations (covered by benchmarks instead)
- Rarely-used admin features

---

## Running Tests

```bash
npm test                    # Run all tests
npm test -- --coverage      # See coverage report
npm run test:watch          # Watch mode for development
```

---

*"Every test is a promise we're keeping to our users."*
