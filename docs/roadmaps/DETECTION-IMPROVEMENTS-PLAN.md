# Detection Logic Improvement Plan

> **Based on synthetic test failures in semantic intelligence**

## Executive Summary

Our synthetic tests revealed 4 detection failures that represent opportunities to improve Ferni's "Better than Human" pattern recognition. This plan outlines specific fixes and enhancements.

**Current Status:** ✅ **IMPLEMENTED** - LLM-powered detection with Gemini Flash 2.0
**Tests Passing:** 19/19 LLM detector tests, including all 4 previously failing cases

## ✅ IMPLEMENTED: LLM-Powered Detection (Dec 26, 2024)

We implemented a hybrid detection system using **Gemini Flash 2.0** for high-accuracy detection:

| Component | File | Description |
|-----------|------|-------------|
| `detectAdviceWithLLM` | `llm-detector.ts` | LLM-powered advice classification |
| `extractPersonsWithLLM` | `llm-detector.ts` | NER-like person extraction |
| `detectAdviceOutcomeWithLLM` | `llm-detector.ts` | Advice follow-up detection |
| `detectAdviceHybrid` | `llm-detector.ts` | Regex first, LLM for edge cases |
| `extractPersonsHybrid` | `llm-detector.ts` | Combined regex + LLM extraction |

### Key Features
- **Fast**: Gemini Flash 2.0 with 2s timeout
- **Cached**: 5-minute LRU cache for repeated queries
- **Resilient**: Circuit breaker prevents cascade failures
- **Hybrid**: Regex for high-confidence, LLM for edge cases

---

---

## 1. Advice Detection Failures

### Failing Cases

| Test Input | Expected | Actual | Root Cause |
|------------|----------|--------|------------|
| "Try keeping a gratitude journal - it might help shift your perspective." | `containsAdvice: true` | `containsAdvice: false` | "Try keeping" not matched; "it might help" requires "to" |
| "Have you tried the Pomodoro technique for staying focused? It might help." | `containsAdvice: true` | `containsAdvice: false` | ANTI_PATTERN `?$` filters entire text |

### Root Cause Analysis

**Issue 1: Incomplete "Try" patterns**
```typescript
// Current - Only matches "try to"
{ pattern: /\btry to\b/i, category: 'behavioral', strength: 0.7 },

// Missing patterns:
// - "try keeping" 
// - "try doing"
// - "try [verb]-ing"
```

**Issue 2: "It might help" requires "to"**
```typescript
// Current - Requires "to" after "help"
{ pattern: /\bit might help to\b/i, category: 'practical', strength: 0.7 },

// Missing: "it might help" standalone
```

**Issue 3: Anti-patterns are too aggressive**
```typescript
// Current - Filters entire text if it ends with "?"
/\?$/,

// Problem: Multi-sentence text where only ONE sentence is a question
// "Have you tried X? It might help." - Second sentence is advice!
```

### Proposed Fixes

```typescript
// === advice-detector.ts ===

// FIX 1: Add more "try" variants
{ pattern: /\btry to\b/i, category: 'behavioral', strength: 0.7 },
{ pattern: /\btry \w+ing\b/i, category: 'behavioral', strength: 0.7 },  // NEW: try keeping, try doing
{ pattern: /\btry (a|the|some) \w+\b/i, category: 'behavioral', strength: 0.65 }, // NEW: try a walk

// FIX 2: Soften "might help" pattern
{ pattern: /\bit might help to\b/i, category: 'practical', strength: 0.7 },
{ pattern: /\bit might help\b/i, category: 'practical', strength: 0.6 }, // NEW: standalone version
{ pattern: /\bthat might help\b/i, category: 'practical', strength: 0.6 }, // NEW: "that might help"
{ pattern: /\bcould help\b/i, category: 'practical', strength: 0.5 }, // NEW

// FIX 3: Make anti-patterns sentence-aware
const ANTI_PATTERNS: RegExp[] = [
  // OLD: /\?$/,  // Too aggressive - filters multi-sentence
  /^[^.!]*\?$/,   // NEW: Only filter if the ENTIRE text is just a question
  /\bdid you\b/i,
  /\bhave you\b.*\?/i, // NEW: Only if "have you" is part of a question
  // ... etc
];

// Alternative: Per-sentence analysis
function detectAdvice(responseText: string): AdviceDetectionResult {
  // Split into sentences and analyze each
  const sentences = responseText.split(/(?<=[.!?])\s+/);
  
  for (const sentence of sentences) {
    // Skip if this specific sentence is a question
    if (sentence.trim().endsWith('?')) continue;
    
    // Check for advice patterns in non-question sentences
    const result = detectAdviceInSentence(sentence);
    if (result.containsAdvice) return result;
  }
  
  return NO_ADVICE_RESULT;
}
```

### Additional Advice Patterns to Add

```typescript
// Framework/technique mentions (high signal)
{ pattern: /\b(pomodoro|pomodoro technique)\b/i, category: 'practical', strength: 0.8 },
{ pattern: /\b(eisenhower matrix|time blocking|gtd|getting things done)\b/i, category: 'practical', strength: 0.8 },
{ pattern: /\b(gratitude journal|gratitude practice)\b/i, category: 'behavioral', strength: 0.85 },
{ pattern: /\b(deep breathing|box breathing|4-7-8)\b/i, category: 'emotional', strength: 0.8 },
{ pattern: /\b(mindfulness|meditation)\b.*\b(try|practice|consider)\b/i, category: 'emotional', strength: 0.75 },

// Gentle suggestions
{ pattern: /\bmaybe (try|consider|think about)\b/i, category: 'practical', strength: 0.6 },
{ pattern: /\bperhaps (try|consider|think about)\b/i, category: 'practical', strength: 0.6 },
{ pattern: /\bwhat about (trying|doing)\b/i, category: 'behavioral', strength: 0.65 },

// Action-oriented
{ pattern: /\bstart with\b/i, category: 'practical', strength: 0.7 },
{ pattern: /\bbegin with\b/i, category: 'practical', strength: 0.7 },
{ pattern: /\bfocus on\b/i, category: 'practical', strength: 0.6 },
```

---

## 2. Person Extraction Failures

### Failing Cases

| Test Input | Expected | Actual | Root Cause |
|------------|----------|--------|------------|
| "My mom always knows what to say" | Extract "mom" | Empty array | Pattern group indexing issue |
| "I had lunch with my boss today" | Extract "boss" | Empty array | Same pattern group issue |

### Root Cause Analysis

The RELATIONSHIP_PATTERNS use this structure:
```typescript
{ pattern: /\b(my |the )?(mom|mother|mama|mommy)\b/i, relationship: 'parent', confidence: 0.95 },
```

When matching "My mom always knows":
- `match[0]` = "My mom" (full match)
- `match[1]` = "My " (optional prefix group)
- `match[2]` = "mom" (relationship term)

The current code:
```typescript
const name = match[2] || match[1] || match[0];
```

**Potential Issues:**
1. The optional group `(my |the )?` might capture differently on some inputs
2. If the prefix isn't present, `match[1]` might be `undefined` not `null`

### Proposed Fixes

```typescript
// === person-extractor.ts ===

// FIX 1: More robust group extraction
for (const { pattern, relationship, confidence } of RELATIONSHIP_PATTERNS) {
  const match = text.match(pattern);
  if (match) {
    // Extract the relationship term - it's always the last non-prefix capture group
    // For pattern /\b(my |the )?(mom|mother|...)\b/, we want match[2]
    // But if pattern is /\b(my )?(mom)\b/, match[1] might be the prefix
    const fullMatch = match[0];
    const lastGroup = match[match.length - 1]; // The relationship term is always last group
    
    // Fallback: extract relationship term from full match by removing prefix
    const name = lastGroup || fullMatch.replace(/^(my |the |a |an |our )/i, '').trim();
    
    // ... rest of logic
  }
}

// FIX 2: Add standalone relationship word detection (without prefix requirement)
const STANDALONE_RELATIONSHIPS: Array<{
  pattern: RegExp;
  relationship: PersonRelationship;
  confidence: number;
}> = [
  // These match even without "my/the" prefix
  { pattern: /\b(mom|mother|dad|father)\b/i, relationship: 'parent', confidence: 0.8 },
  { pattern: /\b(boss|manager)\b/i, relationship: 'coworker', confidence: 0.7 },
  { pattern: /\b(wife|husband|partner)\b/i, relationship: 'spouse', confidence: 0.8 },
];

// FIX 3: Context-aware extraction
function extractPersons(text: string): ExtractedPerson[] {
  // ... existing logic ...
  
  // NEW: Also check for standalone relationship words in relevant contexts
  for (const { pattern, relationship, confidence } of STANDALONE_RELATIONSHIPS) {
    const match = text.match(pattern);
    if (match) {
      const name = match[1];
      const context = text.toLowerCase();
      
      // Only extract if context suggests it's about a person
      if (context.includes('my ' + name.toLowerCase()) ||
          context.includes('the ' + name.toLowerCase()) ||
          /\b(talked|spoke|called|texted|met|saw)\b/.test(context)) {
        // ... add to extracted
      }
    }
  }
}
```

### Additional Person Patterns to Add

```typescript
// Title + Name patterns
{ pattern: /\b(mr|mrs|ms|miss|dr|prof)\.?\s+([A-Z][a-z]+)/i, nameGroup: 2, confidence: 0.9 },

// "Name, my [relationship]" pattern
{ pattern: /\b([A-Z][a-z]+),?\s+my\s+(friend|sister|brother|cousin)/i, nameGroup: 1, confidence: 0.9 },

// "[Name] is my [relationship]"
{ pattern: /\b([A-Z][a-z]+)\s+is\s+my\s+(friend|sister|brother)/i, nameGroup: 1, confidence: 0.85 },

// More contextual patterns
{ pattern: /\bhung out with\s+([A-Z][a-z]+)/i, nameGroup: 1, confidence: 0.8 },
{ pattern: /\bgrabbed (lunch|dinner|coffee) with\s+([A-Z][a-z]+)/i, nameGroup: 2, confidence: 0.85 },
```

---

## 3. Implementation Plan

### Phase 1: Quick Fixes (1-2 hours)

| Task | File | Priority |
|------|------|----------|
| Add "try [verb]-ing" pattern | advice-detector.ts | HIGH |
| Add standalone "might help" | advice-detector.ts | HIGH |
| Make anti-patterns sentence-aware | advice-detector.ts | HIGH |
| Fix relationship group extraction | person-extractor.ts | HIGH |

### Phase 2: Enhanced Detection (4-6 hours)

| Task | File | Priority |
|------|------|----------|
| Add framework/technique patterns | advice-detector.ts | MEDIUM |
| Add contextual person patterns | person-extractor.ts | MEDIUM |
| Add Title+Name extraction | person-extractor.ts | MEDIUM |
| Add gentle suggestion patterns | advice-detector.ts | MEDIUM |

### Phase 3: LLM-Enhanced Detection (Future)

| Task | Approach | Priority |
|------|----------|----------|
| LLM-powered advice classification | Use Gemini for edge cases | LOW |
| Named Entity Recognition | Use NLP library (compromise.js) | LOW |
| Context-aware extraction | Multi-sentence analysis | LOW |

---

## 4. Testing Strategy

### Add These Test Cases

```typescript
// advice-detector.ts test additions
const NEW_ADVICE_SCENARIOS = [
  // "Try [verb]-ing" patterns
  { text: "Try keeping a gratitude journal", expected: { containsAdvice: true } },
  { text: "Try meditating for 5 minutes", expected: { containsAdvice: true } },
  { text: "Try taking a walk when stressed", expected: { containsAdvice: true } },
  
  // Standalone "might help"
  { text: "That might help with your anxiety.", expected: { containsAdvice: true } },
  { text: "Exercise might help.", expected: { containsAdvice: true } },
  
  // Multi-sentence with question
  { text: "Have you tried meditation? It really helps.", expected: { containsAdvice: true } },
  { text: "What about journaling? I think it could help.", expected: { containsAdvice: true } },
  
  // Framework mentions
  { text: "The Pomodoro technique might work for you.", expected: { containsAdvice: true } },
  { text: "Have you heard of GTD? It's great for organization.", expected: { containsAdvice: true } },
];

// person-extractor.ts test additions
const NEW_PERSON_SCENARIOS = [
  // Relationship words without "my" prefix
  { text: "Mom called earlier", expected: { name: 'Mom', relationship: 'parent' } },
  { text: "Had coffee with boss today", expected: { name: 'boss', relationship: 'coworker' } },
  
  // Various formats
  { text: "Dr. Smith said to rest more", expected: { name: 'Dr. Smith' } },
  { text: "Sarah, my sister, is visiting", expected: { name: 'Sarah', relationship: 'sibling' } },
  { text: "Grabbed lunch with Mike", expected: { name: 'Mike' } },
];
```

### Regression Testing

After implementing fixes, run full test suite:

```bash
# Run all semantic intelligence tests
pnpm vitest run src/services/superhuman/semantic-intelligence/__tests__/

# Run synthetic tests
pnpm vitest run src/services/superhuman/semantic-intelligence/__tests__/semantic-intelligence-synthetic.test.ts

# Watch mode for development
pnpm vitest src/services/superhuman/semantic-intelligence/
```

---

## 5. Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Advice detection accuracy | ~67% (4/6) | 95%+ |
| Person extraction accuracy | ~71% (5/7) | 95%+ |
| Overall synthetic test pass rate | 90% (38/42) | 100% |
| False positive rate | Unknown | <5% |

---

## 6. Dependencies & Risks

### Dependencies
- No external dependencies for Phase 1-2
- Phase 3 (LLM-enhanced) would require API calls, adding latency

### Risks
| Risk | Impact | Mitigation |
|------|--------|------------|
| False positives from broader patterns | Medium | Add confidence thresholds |
| Performance impact from more patterns | Low | Patterns are O(n), minimal impact |
| Breaking existing behavior | High | Comprehensive regression tests |

---

## 7. Future Considerations

### LLM-Powered Classification

For edge cases that regex can't handle, consider:

```typescript
async function detectAdviceWithLLM(text: string): Promise<boolean> {
  // Only use LLM for ambiguous cases (low regex confidence)
  const regexResult = detectAdvice(text);
  
  if (regexResult.confidence > 0.7) return regexResult.containsAdvice;
  if (regexResult.confidence < 0.3) return false;
  
  // Ambiguous - use LLM
  const prompt = `Does this text contain actionable advice? "${text}". Answer only "yes" or "no".`;
  return await llmClassify(prompt) === 'yes';
}
```

### NER Integration

Consider using a lightweight NER library:

```typescript
import nlp from 'compromise';

function extractPersonsWithNLP(text: string): ExtractedPerson[] {
  const doc = nlp(text);
  const people = doc.people().out('array');
  
  return people.map(name => ({
    name,
    confidence: 0.85,
    isProperName: true,
    // ... other fields
  }));
}
```

---

## Appendix: Complete Pattern Lists After Fix

### Advice Patterns (After Phase 2)

```typescript
const ADVICE_PATTERNS = [
  // Strong explicit
  { pattern: /\byou should\b/i, category: 'behavioral', strength: 0.9 },
  { pattern: /\bi'd suggest\b/i, category: 'practical', strength: 0.9 },
  { pattern: /\bi'd recommend\b/i, category: 'practical', strength: 0.9 },
  { pattern: /\bmy advice\b/i, category: 'practical', strength: 0.95 },
  
  // Try variants (FIXED)
  { pattern: /\btry to\b/i, category: 'behavioral', strength: 0.7 },
  { pattern: /\btry \w+ing\b/i, category: 'behavioral', strength: 0.7 },
  { pattern: /\btry (a|the|some) \w+\b/i, category: 'behavioral', strength: 0.65 },
  
  // Might help variants (FIXED)
  { pattern: /\bit might help to\b/i, category: 'practical', strength: 0.7 },
  { pattern: /\bit might help\b/i, category: 'practical', strength: 0.6 },
  { pattern: /\bthat might help\b/i, category: 'practical', strength: 0.6 },
  { pattern: /\bcould help\b/i, category: 'practical', strength: 0.5 },
  
  // Framework mentions (NEW)
  { pattern: /\b(pomodoro|eisenhower|gtd)\b/i, category: 'practical', strength: 0.8 },
  { pattern: /\bgratitude (journal|practice)\b/i, category: 'behavioral', strength: 0.85 },
  
  // ... existing patterns ...
];
```

---

*Created: December 26, 2024*
*Status: PLANNED*
*Owner: Semantic Intelligence Team*

