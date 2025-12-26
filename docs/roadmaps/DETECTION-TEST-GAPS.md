# Detection Test Gap Analysis

> **Comprehensive review of missing test scenarios for semantic intelligence**

## ✅ IMPLEMENTATION COMPLETE (Dec 26, 2024)

**All gaps have been addressed with 178 passing tests!**

| File | Tests | Status |
|------|-------|--------|
| `semantic-intelligence.test.ts` | 66 | ✅ Passing |
| `semantic-intelligence-synthetic.test.ts` | 28 | ✅ Passing |
| `llm-detector.test.ts` | 19 | ✅ Passing |
| `detection-comprehensive.test.ts` | 65 | ✅ NEW - All gaps covered |

## Previous Coverage (Before This Work)

| Component | Tests | Coverage Quality |
|-----------|-------|------------------|
| Advice Detection | 6 seed + LLM-generated | Medium - missing many edge cases |
| Person Extraction | 7 seed + LLM-generated | Medium - missing complex scenarios |
| Advice Outcome | 2 tests | Low - needs more scenarios |
| LLM Detector | 19 tests | Good for happy paths, missing edge cases |

---

## 1. Advice Detection Gaps

### 1.1 Implicit/Subtle Advice (HIGH PRIORITY)

These are coaching patterns that don't use explicit "should/try/consider":

```typescript
const IMPLICIT_ADVICE_SCENARIOS = [
  // Reframing (subtle advice)
  { text: "What if we looked at this differently?", expected: { containsAdvice: true, category: 'philosophical' } },
  { text: "Another way to think about it...", expected: { containsAdvice: true, category: 'philosophical' } },
  
  // Permission-giving (emotional advice)
  { text: "It's okay to feel that way", expected: { containsAdvice: true, category: 'emotional' } },
  { text: "You don't have to have it all figured out", expected: { containsAdvice: true, category: 'emotional' } },
  { text: "You're allowed to take a break", expected: { containsAdvice: true, category: 'emotional' } },
  
  // Gentle nudges
  { text: "Some people find it helpful to...", expected: { containsAdvice: true, category: 'practical' } },
  { text: "One thing that's worked for others...", expected: { containsAdvice: true, category: 'practical' } },
  
  // Action-oriented without explicit verbs
  { text: "A walk might be nice right now", expected: { containsAdvice: true, category: 'behavioral' } },
  { text: "Fresh air could help clear your head", expected: { containsAdvice: true, category: 'behavioral' } },
];
```

### 1.2 Multi-Sentence / Complex Advice

```typescript
const COMPLEX_ADVICE_SCENARIOS = [
  // Empathy + Advice combo
  {
    text: "That sounds really hard. Have you considered talking to someone about it?",
    expected: { containsAdvice: true, category: 'relational' }
  },
  
  // Question + hidden advice
  {
    text: "What would happen if you just said no to that meeting?",
    expected: { containsAdvice: true, category: 'behavioral' }
  },
  
  // Story-based advice
  {
    text: "When I was in a similar situation, I found that journaling helped me process things.",
    expected: { containsAdvice: true, category: 'practical' }
  },
  
  // Conditional advice
  {
    text: "If you're feeling overwhelmed, it might help to break it into smaller pieces.",
    expected: { containsAdvice: true, category: 'practical' }
  },
  
  // Long-form with multiple pieces of advice
  {
    text: "First, take a deep breath. Then, try writing down what's bothering you. After that, consider calling a friend.",
    expected: { containsAdvice: true, adviceCount: 3 }
  },
];
```

### 1.3 Non-Advice False Positives (CRITICAL)

These should NOT be detected as advice:

```typescript
const NON_ADVICE_SCENARIOS = [
  // Reflection/mirroring
  { text: "It sounds like you're feeling really stressed", expected: { containsAdvice: false } },
  { text: "So what I'm hearing is...", expected: { containsAdvice: false } },
  
  // Pure questions
  { text: "How does that make you feel?", expected: { containsAdvice: false } },
  { text: "What do you think you should do?", expected: { containsAdvice: false } },
  { text: "Have you thought about why that bothers you?", expected: { containsAdvice: false } },
  
  // Observations
  { text: "You seem to be carrying a lot right now", expected: { containsAdvice: false } },
  { text: "I notice you've mentioned work stress a few times", expected: { containsAdvice: false } },
  
  // Validation
  { text: "That's a completely reasonable reaction", expected: { containsAdvice: false } },
  { text: "Anyone would feel that way in your situation", expected: { containsAdvice: false } },
  
  // Information (not advice)
  { text: "The deadline is next Friday", expected: { containsAdvice: false } },
  { text: "Meditation has been shown to reduce cortisol", expected: { containsAdvice: false } },
  
  // Past tense (not actionable advice)
  { text: "I tried that once and it helped", expected: { containsAdvice: false } },
  { text: "They said it was a good idea", expected: { containsAdvice: false } },
];
```

### 1.4 Domain-Specific Advice

```typescript
const DOMAIN_SPECIFIC_ADVICE = [
  // Health/wellness
  { text: "Make sure you're drinking enough water", expected: { category: 'behavioral' } },
  { text: "Your body might be telling you to slow down", expected: { category: 'behavioral' } },
  
  // Relationships
  { text: "Have you told them how you feel?", expected: { category: 'relational' } },
  { text: "Setting that boundary would be healthy", expected: { category: 'relational' } },
  
  // Career
  { text: "Updating your LinkedIn might open some doors", expected: { category: 'practical' } },
  { text: "A mentor could help you navigate this", expected: { category: 'practical' } },
  
  // Finance
  { text: "A budget might help reduce that anxiety", expected: { category: 'practical' } },
  { text: "Starting with just $50/month in savings", expected: { category: 'practical' } },
  
  // Mental health
  { text: "A therapist could help unpack this", expected: { category: 'practical' } },
  { text: "CBT techniques might help with those thoughts", expected: { category: 'practical' } },
];
```

---

## 2. Person Extraction Gaps

### 2.1 Complex Name Patterns

```typescript
const COMPLEX_NAME_SCENARIOS = [
  // Names with titles
  { text: "Dr. Sarah Johnson called about my results", expected: { name: 'Dr. Sarah Johnson' } },
  { text: "Professor Martinez assigned the homework", expected: { name: 'Professor Martinez' } },
  
  // Hyphenated names
  { text: "I talked to Mary-Anne about it", expected: { name: 'Mary-Anne' } },
  { text: "Jean-Pierre is visiting next week", expected: { name: 'Jean-Pierre' } },
  
  // Names with apostrophes
  { text: "O'Brien sent the email", expected: { name: "O'Brien" } },
  
  // Last names only
  { text: "Called the Johnson family", expected: { name: 'Johnson' } },
  
  // Nicknames in quotes
  { text: 'My friend "Big Mike" is coming over', expected: { name: 'Big Mike' } },
];
```

### 2.2 Ambiguous Relationship Terms

```typescript
const AMBIGUOUS_RELATIONSHIP_SCENARIOS = [
  // Could be multiple relationships
  { text: "My partner and I are considering", expected: { relationship: ['spouse', 'romantic'] } },
  { text: "My ex texted me again", expected: { relationship: 'romantic' } },
  
  // Step-relationships
  { text: "My stepmom is visiting", expected: { relationship: 'extended_family' } },
  { text: "Stepdad helped me move", expected: { relationship: 'extended_family' } },
  
  // In-laws
  { text: "Mother-in-law is making dinner", expected: { relationship: 'extended_family' } },
  { text: "My father-in-law's advice", expected: { relationship: 'extended_family' } },
  
  // Work relationships (ambiguous)
  { text: "My team lead suggested", expected: { relationship: 'coworker' } },
  { text: "The new hire is struggling", expected: { relationship: 'coworker' } },
  { text: "HR called me in", expected: { relationship: 'professional' } },
];
```

### 2.3 Multiple People in One Utterance

```typescript
const MULTIPLE_PEOPLE_SCENARIOS = [
  { 
    text: "Mom and Dad are fighting again",
    expected: { people: ['mom', 'dad'], relationships: ['parent', 'parent'] }
  },
  {
    text: "Sarah told Mike what happened with Jennifer",
    expected: { people: ['Sarah', 'Mike', 'Jennifer'], count: 3 }
  },
  {
    text: "My boss, my wife, and my therapist all said the same thing",
    expected: { people: 3, relationships: ['coworker', 'spouse', 'professional'] }
  },
];
```

### 2.4 Context-Dependent Extraction

```typescript
const CONTEXT_DEPENDENT_SCENARIOS = [
  // "They" referring to a specific person
  { text: "They said they'd call back - meaning Sarah", expected: { name: 'Sarah' } },
  
  // Groups vs individuals
  { text: "My friends at work are supportive", expected: { isGroup: true } },
  { text: "The family is gathering for Thanksgiving", expected: { isGroup: true } },
  
  // Mentioned vs present
  { text: "Jake mentioned that Lisa was upset", expected: { mentioned: ['Jake', 'Lisa'] } },
];
```

### 2.5 Non-Person False Positives

```typescript
const NON_PERSON_SCENARIOS = [
  // Brands/companies
  { text: "I called Amazon about my order", expected: { isPerson: false } },
  { text: "Google sent me a notification", expected: { isPerson: false } },
  
  // Places
  { text: "I love Paris in the spring", expected: { isPerson: false } },
  
  // Pets (should be relationship: 'pet')
  { text: "My dog Max is sick", expected: { name: 'Max', relationship: 'pet' } },
  
  // Historical/fictional figures
  { text: "Einstein said that", expected: { isPerson: true, isHistorical: true } },
];
```

---

## 3. Advice Outcome Detection Gaps

### 3.1 Positive Outcomes

```typescript
const POSITIVE_OUTCOME_SCENARIOS = [
  { 
    advice: "Try journaling before bed",
    message: "I started journaling like you suggested and I'm sleeping so much better!",
    expected: { outcome: 'followed', sentiment: 'positive' }
  },
  {
    advice: "Have you tried talking to your boss directly?",
    message: "I finally had that conversation with my boss - it went great!",
    expected: { outcome: 'followed', sentiment: 'positive' }
  },
  {
    advice: "Taking a break might help",
    message: "That break really cleared my head, thanks for the suggestion",
    expected: { outcome: 'followed', sentiment: 'positive' }
  },
];
```

### 3.2 Negative Outcomes

```typescript
const NEGATIVE_OUTCOME_SCENARIOS = [
  {
    advice: "Try talking to them about it",
    message: "I tried talking to them but it made things worse",
    expected: { outcome: 'followed', sentiment: 'negative' }
  },
  {
    advice: "Exercise in the morning",
    message: "I tried the morning workout thing but I just couldn't stick with it",
    expected: { outcome: 'partial', sentiment: 'neutral' }
  },
];
```

### 3.3 Ignored Advice

```typescript
const IGNORED_ADVICE_SCENARIOS = [
  {
    advice: "You should take a vacation",
    message: "I know I should take time off but I just can't right now",
    expected: { outcome: 'ignored', reason: 'constraints' }
  },
  {
    advice: "Have you tried meditation?",
    message: "I've never been able to meditate, it's just not for me",
    expected: { outcome: 'ignored', reason: 'preference' }
  },
];
```

### 3.4 Delayed Outcomes

```typescript
const DELAYED_OUTCOME_SCENARIOS = [
  {
    advice: "Start small with just 5 minutes of exercise",
    daysSince: 14,
    message: "Remember when you suggested starting small? I've been walking every day!",
    expected: { outcome: 'followed', isDelayed: true }
  },
];
```

---

## 4. Edge Cases & Error Handling

### 4.1 Input Validation

```typescript
const INPUT_EDGE_CASES = [
  // Empty/null
  { text: '', expected: 'graceful handling' },
  { text: null, expected: 'graceful handling' },
  { text: undefined, expected: 'graceful handling' },
  
  // Very short
  { text: 'Hi', expected: 'no detection' },
  { text: 'OK', expected: 'no detection' },
  
  // Very long (>1000 chars)
  { text: 'A'.repeat(2000), expected: 'truncation + handling' },
  
  // Special characters
  { text: 'What about 😊 this? Try the 🧘‍♀️ yoga!', expected: 'handle emojis' },
  { text: "What's the best way to handle <script>alert('xss')</script>", expected: 'sanitize' },
  
  // Unicode
  { text: 'My friend Müller suggested meditation', expected: 'handle unicode' },
  { text: '日本語のテキスト with some English', expected: 'handle mixed scripts' },
];
```

### 4.2 API Failure Handling

```typescript
const API_FAILURE_SCENARIOS = [
  { scenario: 'API timeout (>2s)', expected: 'fallback to regex' },
  { scenario: 'API rate limit', expected: 'circuit breaker + retry' },
  { scenario: 'Invalid API key', expected: 'graceful degradation' },
  { scenario: 'Network offline', expected: 'cache + fallback' },
];
```

### 4.3 Concurrent Processing

```typescript
const CONCURRENCY_SCENARIOS = [
  { scenario: '100 simultaneous requests', expected: 'queue + throttle' },
  { scenario: 'Same text multiple times', expected: 'cache hit' },
  { scenario: 'Similar texts', expected: 'semantic cache hit' },
];
```

---

## 5. Integration Scenarios

### 5.1 Full Turn Processing

```typescript
const FULL_TURN_SCENARIOS = [
  {
    userMessage: "My mom thinks I should quit my job and my therapist agrees",
    agentResponse: "That's a big decision. Have you considered making a pros and cons list?",
    expected: {
      personsExtracted: ['mom', 'therapist'],
      adviceDetected: true,
      adviceCategory: 'practical',
    }
  },
  {
    previousAdvice: "Try setting boundaries with your colleague",
    userMessage: "I tried setting that boundary like you said. Sarah was actually really understanding about it!",
    expected: {
      personExtracted: 'Sarah',
      outcomeDetected: true,
      outcome: 'followed',
      sentiment: 'positive',
    }
  },
];
```

---

## 6. Priority Implementation Order

### Phase 1 (Critical - This Week)

| # | Scenario Type | Count | Priority |
|---|---------------|-------|----------|
| 1 | Non-Advice False Positives | 10 | HIGH |
| 2 | Implicit/Subtle Advice | 9 | HIGH |
| 3 | Multiple People | 3 | HIGH |

### Phase 2 (Important - Next Week)

| # | Scenario Type | Count | Priority |
|---|---------------|-------|----------|
| 4 | Complex Name Patterns | 7 | MEDIUM |
| 5 | Advice Outcome - All Types | 10 | MEDIUM |
| 6 | Domain-Specific Advice | 10 | MEDIUM |

### Phase 3 (Nice to Have)

| # | Scenario Type | Count | Priority |
|---|---------------|-------|----------|
| 7 | Edge Cases / Unicode | 8 | LOW |
| 8 | API Failure Handling | 4 | LOW |
| 9 | Integration Scenarios | 2 | LOW |

---

## 7. Recommended Test File Updates

### Add to `llm-detector.test.ts`:

```typescript
describe('Implicit Advice Detection', () => {
  it.each(IMPLICIT_ADVICE_SCENARIOS)('should detect: "$text"', ...);
});

describe('Non-Advice False Positives', () => {
  it.each(NON_ADVICE_SCENARIOS)('should NOT detect advice in: "$text"', ...);
});

describe('Multiple Person Extraction', () => {
  it.each(MULTIPLE_PEOPLE_SCENARIOS)('should extract all people from: "$text"', ...);
});

describe('Advice Outcome Detection', () => {
  describe('Positive Outcomes', () => {
    it.each(POSITIVE_OUTCOME_SCENARIOS)('should detect positive outcome', ...);
  });
  describe('Negative Outcomes', () => {
    it.each(NEGATIVE_OUTCOME_SCENARIOS)('should detect negative outcome', ...);
  });
});
```

---

*Created: December 26, 2024*
*Status: GAP ANALYSIS COMPLETE*
*Next Step: Implement Phase 1 tests*

