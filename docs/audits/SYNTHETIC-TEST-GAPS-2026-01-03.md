# Synthetic Test Gap Analysis - January 3, 2026

## Overview

LLM-generated synthetic conversations stress-tested Ferni's memory pipeline and revealed several gaps in extraction, detection, and handoff systems.

**Test Results:**
- Total Conversations: 16
- Pass Rate: 25.0%
- Categories Tested: name_capture, correction_handling, emotional_support, handoff_trigger, relationship_building, stress_test, edge_cases, multi_topic

## Critical Gaps Identified

### 1. Name Extraction (High Priority)

**Issue:** The `extractSmallDetails` function misses many valid names and incorrectly extracts common words as names.

**Failures:**
| Expected | Actual | Issue |
|----------|--------|-------|
| "Dr. Evans" | null | Title prefixes not handled |
| "Mr. Henderson" | null | Title prefixes not handled |
| "Mrs. Gable" | null | Title prefixes not handled |
| "Mittens" (pet) | null | Pet names in context not captured |
| "Will" (name) | null | Common-word names filtered out |
| "Grace", "Hope" | null | Common-word names filtered out |
| "Sarah" | "exhausting, hard" | Random words extracted as names |

**Root Causes:**
1. No pattern for `Title + Name` (Dr., Mr., Mrs., Ms., Prof.)
2. No pattern for `my [pet/role] [Name]` (my cat Mittens, my boss John)
3. `looksLikeName()` too aggressively filters names that are also words
4. Extraction patterns match parts of sentences

**Recommended Fixes:**
```typescript
// Add title patterns to small-details.ts
const TITLE_PATTERNS = [
  /(?:Dr\.|Mr\.|Mrs\.|Ms\.|Prof\.)\s+([A-Z][a-z]+)/g,
];

// Add possessive patterns
const POSSESSIVE_PATTERNS = [
  /my\s+(?:cat|dog|pet|boss|friend|husband|wife|partner)\s+([A-Z][a-z]+)/gi,
];

// Whitelist common names that are also words
const NAME_WHITELIST = new Set(['Will', 'Grace', 'Hope', 'Faith', 'Joy', 'Rose']);
```

### 2. Handoff Detection (High Priority)

**Issue:** Handoff triggers are too specific - natural language about topics doesn't trigger handoffs.

**Failures:**
| User Message | Expected Handoff | Actual |
|-------------|------------------|--------|
| "I want to improve my communication skills" | Alex | None |
| "I've been struggling with forming habits" | Maya | None |
| "I feel stuck and unmotivated" | Maya | None |

**Root Causes:**
1. Detection functions (`shouldHandoffToAlex`, etc.) use exact keyword matching
2. No semantic understanding of intent
3. Triggers don't cover natural paraphrases

**Recommended Fixes:**
```typescript
// Add more trigger phrases to detection.ts

// For Alex (communication)
const alexTriggers = [
  ...existing,
  'communication skills',
  'improve my communication',
  'better at talking',
  'express myself',
];

// For Maya (habits)
const mayaTriggers = [
  ...existing,
  'forming habits',
  'build habits',
  'stick to',
  'stay consistent',
  'unmotivated',
  'productivity',
];
```

### 3. Correction Detection (Medium Priority)

**Issue:** Some user corrections aren't being detected.

**Failures:**
| User Message | Expected | Actual |
|-------------|----------|--------|
| "No, I meant Thursday, not Friday" | Detected | Not detected |
| "Wait, I think I said that wrong" | Detected | Not detected |

**Root Causes:**
1. Correction patterns don't cover all natural phrasings
2. Context-dependent corrections may need more sophisticated detection

### 4. False Positive Names (Medium Priority)

**Issue:** Random words being extracted as names.

**Examples:**
- "exhausting" extracted as name
- "deflecting" extracted as name
- "drowning" extracted as name (from "I'm drowning in work")

**Root Cause:** Sentence parsing too aggressive, matching partial phrases.

## Test Infrastructure Created

### Files Created
1. `src/tests/e2e/synthetic-conversations/conversation-generator.ts` - LLM-powered conversation generator
2. `src/tests/e2e/synthetic-conversations/run-synthetic-tests.test.ts` - Test runner with validators
3. `src/tests/e2e/synthetic-conversations/quick-generate.ts` - Quick generation script

### Generated Test Data
- Location: `src/tests/e2e/synthetic-conversations/generated/`
- Format: JSON with conversations, expected extractions, and validation checks

### Categories Tested
| Category | Description | Tests |
|----------|-------------|-------|
| name_capture | Users revealing names naturally | 2 |
| correction_handling | Users correcting AI misunderstandings | 2 |
| emotional_support | Emotional/difficult conversations | 2 |
| handoff_trigger | Conversations needing other team members | 2 |
| relationship_building | Deep connection conversations | 2 |
| stress_test | Rapid changes, sarcasm, complexity | 2 |
| edge_cases | Short responses, homophones, ambiguity | 2 |
| multi_topic | Conversations spanning multiple topics | 2 |

## Recommended Action Plan

### Immediate (P0)
1. [ ] Add title patterns to name extraction (`Dr.`, `Mr.`, `Mrs.`, `Ms.`)
2. [ ] Add possessive patterns (`my cat X`, `my boss X`)
3. [ ] Expand handoff trigger keywords

### Short-term (P1)
1. [ ] Fix false positive name extraction
2. [ ] Add correction pattern coverage
3. [ ] Whitelist common names that are also words

### Long-term (P2)
1. [ ] Semantic handoff detection (embeddings-based)
2. [ ] Context-aware name extraction
3. [ ] Continuous synthetic testing in CI

## Running Synthetic Tests

```bash
# Generate new conversations
npx tsx src/tests/e2e/synthetic-conversations/quick-generate.ts

# Run tests
pnpm vitest run src/tests/e2e/synthetic-conversations/run-synthetic-tests.test.ts
```

## Conclusion

The LLM-powered synthetic testing successfully identified real gaps in Ferni's memory and detection systems. The 25% pass rate indicates significant room for improvement, particularly in name extraction and handoff detection. These tests should be run regularly as part of CI to catch regressions.
