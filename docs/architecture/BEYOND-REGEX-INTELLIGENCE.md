# Beyond Regex: Intelligent Memory Extraction

> **"Better Than Human" means understanding what humans miss**

---

## What We Just Enabled (v4.0)

The semantic intelligence integration now uses **LLM hybrid extraction**:

```typescript
// Before: Regex only
const persons = extractPersons(userText);

// After: Regex + LLM fallback for edge cases
const persons = await extractPersonsHybrid(userText);
```

### How It Works

1. **Regex first** (fast, ~1ms) - Catches obvious patterns
2. **Confidence check** - If regex confidence < 0.6, escalate
3. **LLM fallback** (smart, ~100-200ms) - Catches nuanced mentions
4. **Caching** - LRU cache prevents repeated LLM calls
5. **Circuit breaker** - Protects against LLM failures

---

## What Already Exists (Fully Built)

| System | File | Status |
|--------|------|--------|
| `extractPersonsWithLLM` | `llm-detector.ts` | ✅ Now wired |
| `detectAdviceHybrid` | `llm-detector.ts` | ✅ Now wired |
| `LLMSignalExtractor` | `llm-signal-extractor.ts` | 🔧 Available |
| `UnifiedAnalyzer` | `unified-analyzer.ts` | 🔧 Available |
| 6 Semantic Intelligence Systems | `semantic-intelligence/` | ✅ Active |

---

## Next Level: "Superhuman Understanding"

### 1. **Real-Time Conversation Analysis** (LLMSignalExtractor)

The `LLMSignalExtractor` can extract rich signals from entire conversations:

```typescript
// Currently extracts:
- importantDates (birthdays, anniversaries, deadlines)
- values (core beliefs driving decisions)
- dreams (goals they're excited about)
- fears (worries they shared)
- growth (how they've changed)
- challenges (current struggles)
- comfortPatterns (what actually helps)
- stressTriggers (specific triggers)
- insideJokes (shared funny moments)
- avoidances (topics they deflected)
- people (important relationships)
```

**To enable:** Wire into session end handler for comprehensive extraction.

### 2. **Pattern Mining Across Sessions**

The `UnifiedAnalyzer` can find patterns humans miss:

```typescript
// Example: Detect that user is always stressed before family visits
const patterns = await analyzer.findCrossSessionPatterns(userId, {
  lookback: '3 months',
  domains: ['emotion', 'relationships', 'calendar']
});
// → "I notice you often mention feeling drained the week before visiting your parents"
```

### 3. **Proactive Insight Generation**

Instead of waiting for patterns, generate insights proactively:

```typescript
// Example prompt for LLM:
const insight = await generateProactiveInsight({
  recentTopics: ['work stress', 'sleep issues', 'exercise goals'],
  emotionalTrend: 'declining over 2 weeks',
  upcomingEvents: ['performance review Friday'],
  pastAdvice: ['try morning meditation']
});
// → "You mentioned your performance review is Friday. Last time you felt 
//    this stressed, morning meditation helped. Want me to remind you tomorrow?"
```

### 4. **Emotional Trajectory Prediction**

Use temporal patterns to predict emotional states:

```typescript
// Trained on user's patterns
const prediction = await predictEmotionalState(userId, {
  dayOfWeek: 'Monday',
  timeOfDay: '9am',
  upcomingCalendar: ['Team standup', 'Client call'],
  recentSleep: 'poor (5 hours)'
});
// → { predictedEmotion: 'anxious', confidence: 0.78 }
// → Adjust conversation style preemptively
```

### 5. **Relationship Graph Intelligence**

Build and query a semantic relationship graph:

```typescript
// Query: "Who does the user mention when they're happy?"
const happyConnections = await relationshipGraph.query(userId, {
  emotionContext: 'positive',
  topK: 5
});
// → [{ name: 'Sarah', frequency: 23, avgSentiment: 0.8 }]

// Query: "Who causes stress?"
const stressConnections = await relationshipGraph.query(userId, {
  emotionContext: 'stressed',
  topK: 5
});
// → [{ name: 'Mom', frequency: 12, avgSentiment: -0.4 }]
```

---

## Implementation Roadmap

### Phase 1: ✅ DONE - Hybrid Extraction
- [x] Wire `extractPersonsHybrid` into relational semantics
- [x] Wire `detectAdviceHybrid` into counterfactual memory
- [x] Add logging for LLM fallback usage

### Phase 2: Session-End Intelligence
```typescript
// In cleanup-handler.ts, after session ends:
const signals = await llmSignalExtractor.extractSignals(allTurns);
await persistDeepSignals(userId, signals);
```

### Phase 3: Proactive Weekly Analysis
```typescript
// Scheduled job (e.g., Sunday evening):
const weeklyInsights = await generateWeeklyInsights(userId);
// Store for next session or send as push notification
```

### Phase 4: Predictive Conversation Preparation
```typescript
// Before session starts:
const prep = await prepareForConversation(userId, {
  dayOfWeek: 'Monday',
  recentEmotions: ['stressed', 'tired'],
  upcomingEvents: ['dentist', 'work deadline']
});
// → Inject preparation into system prompt
```

---

## When to Use LLM vs Regex

| Scenario | Use Regex | Use LLM |
|----------|-----------|---------|
| "My name is Sarah" | ✅ Fast pattern | Overkill |
| "Sarah, my boss's wife's sister" | ✅ Complex pattern | ✅ If regex misses |
| "Remember how I mentioned that guy?" | Fails | ✅ Contextual understanding |
| "That thing you suggested worked!" | ✅ "worked" pattern | ✅ For advice matching |
| Emotional undertones | Fails | ✅ Essential |
| Sarcasm/irony detection | Fails | ✅ Essential |

---

## Cost Considerations

| Operation | Latency | Cost per 1000 |
|-----------|---------|---------------|
| Regex extraction | ~1ms | $0 |
| LLM hybrid (cached) | ~5ms | $0 |
| LLM hybrid (new) | ~150ms | ~$0.003 |
| Full conversation analysis | ~500ms | ~$0.01 |

**Strategy:** Use hybrid mode (regex + LLM fallback) for real-time.
Use full LLM analysis at session end and weekly batches.

---

## Testing the Intelligence

```bash
# Run synthetic tests with LLM-powered generation
npx tsx src/tests/e2e/synthetic-conversations/generate-better-than-human.ts

# Run validation tests
pnpm vitest run src/tests/e2e/synthetic-conversations/run-synthetic-tests.test.ts

# Check LLM detector stats
curl http://localhost:3002/api/semantic-store/metrics
```

---

## Files to Know

| File | Purpose |
|------|---------|
| `llm-detector.ts` | LLM-powered extraction (persons, advice, outcomes) |
| `llm-signal-extractor.ts` | Full conversation signal extraction |
| `unified-analyzer.ts` | Cross-domain pattern analysis |
| `integration.ts` | Wires extraction into turn processing |
| `semantic-intelligence/` | 6 superhuman capabilities |
