# Beyond Regex: Intelligent Memory Extraction

> **"Better Than Human" means understanding what humans miss**

---

## ✅ FULLY IMPLEMENTED (January 2026)

The entire "Better Than Human" intelligence stack is now wired and operational:

### What's Running

| Capability | When | Where |
|------------|------|-------|
| **LLM Hybrid Person Extraction** | Every turn | `integration.ts` |
| **LLM Hybrid Advice Detection** | Every turn | `integration.ts` |
| **Deep Signal Extraction** | Session end | `cleanup-handler.ts` |
| **Predictive Emotional State** | Session start | `session-init-handler.ts` |
| **Proactive Insight Generation** | Session start | `session-init-handler.ts` |
| **Relationship Graph Queries** | Session start | `proactive-insight-generator.ts` |

---

## How It Works

### 1. Session Start (session-init-handler.ts)

```typescript
// Phase 6.5: Generate proactive insights
const insights = await generateProactiveInsights(userId, context);
const relationshipInsight = await queryRelationshipInsights(userId, 'positive_connections');

// Phase 6.6: Predict emotional state
const prediction = await getPatternPrediction(userId, { dayOfWeek, hourOfDay });
const suggestedApproach = prediction?.mood === 'stressed' ? 'gentle_check_in' : 'neutral_warm';
```

### 2. Every Turn (integration.ts)

```typescript
// Regex first, LLM fallback if low confidence
let persons = extractPersons(userText);
if (persons.length === 0 || maxConfidence < 0.6) {
  persons = await extractPersonsHybrid(userText);  // LLM fallback!
}

// Advice detection with LLM escalation
if (!mentionsAdvice) {
  const adviceCheck = await detectAdviceHybrid(userText);
  if (adviceCheck.containsAdvice && adviceCheck.confidence > 0.6) {
    mentionsAdvice = true;
  }
}
```

### 3. Session End (cleanup-handler.ts)

```typescript
// Deep signal extraction from full conversation
const extractor = new LLMSignalExtractor({ useLLM: true });
const signals = await extractor.extractSignals(turns, { userId, sessionId });
// Extracts: dates, values, dreams, fears, growth, challenges, 
//           comfort patterns, stress triggers, inside jokes, avoidances
await unifiedMemory.saveMemory(userId, mergedMemory);
```

---

## Signal Types Extracted

| Signal | When Extracted | Example |
|--------|----------------|---------|
| **Names** | Every turn | "Sarah, my boss's wife's sister" |
| **Relationships** | Every turn | "my therapist Dr. Wilson" |
| **Dates** | Session end | "birthday on the 15th" |
| **Values** | Session end | "family always comes first" |
| **Dreams** | Session end | "I want to write a book" |
| **Fears** | Session end | "terrified of public speaking" |
| **Growth** | Session end | "I used to avoid conflict" |
| **Challenges** | Session end | "struggling with work-life balance" |
| **Comfort Patterns** | Session end | "walking helps me think" |
| **Stress Triggers** | Session end | "deadlines make me spiral" |
| **Inside Jokes** | Session end | "Remember when we called it 'the incident'?" |
| **Avoidances** | Session end | Topics user deflected |

---

## Intelligence Systems Active

| System | File | What It Does |
|--------|------|--------------|
| `LLMSignalExtractor` | `llm-signal-extractor.ts` | Deep conversation analysis |
| `extractPersonsHybrid` | `llm-detector.ts` | NER-like person extraction |
| `detectAdviceHybrid` | `llm-detector.ts` | Advice pattern detection |
| `ProactiveInsightGenerator` | `proactive-insight-generator.ts` | Generate insights proactively |
| `RelationshipGraph` | `relationship-graph.ts` | Track emotional impact of people |
| `TemporalPatterns` | `temporal-patterns.ts` | Predict emotional states |
| `EmotionalTrajectories` | `emotional-trajectories.ts` | Track emotional arcs over time |
| `CorrelationMining` | `correlation-mining.ts` | Cross-domain pattern detection |
| `CounterfactualMemory` | `counterfactual-memory.ts` | Track advice outcomes |
| `GrowthFingerprint` | `growth-fingerprint.ts` | Show how user has evolved |
| `CrossSessionThreading` | `cross-session-threading.ts` | Connect insights across sessions |

---

## Test Results

69 LLM-generated synthetic conversations:

| Capability | Pass Rate |
|------------|-----------|
| SSML Stripping | 100% (47/47) |
| Handoff Triggers | 100% (4/4) |
| Correction Detection | 90.9% (20/22) |
| Name Capture | 81.1% (43/53) |
| **Overall** | **82.6%** (57/69) |

---

## Commands

```bash
# Generate new test conversations
npx tsx src/tests/e2e/synthetic-conversations/generate-better-than-human.ts

# Run validation tests
pnpm vitest run src/tests/e2e/synthetic-conversations/run-synthetic-tests.test.ts

# Run full E2E suite
pnpm vitest run src/tests/e2e/
```

---

## Files Changed

| File | Change |
|------|--------|
| `integration.ts` | Added LLM hybrid extraction for persons + advice |
| `cleanup-handler.ts` | Added deep signal extraction at session end |
| `session-init-handler.ts` | Added predictive emotional state + proactive insights |
| `proactive-insight-generator.ts` | New service for generating insights |
| `small-details.ts` | 15+ name extraction patterns |

---

## Cost Considerations

| Operation | Latency | Cost per 1000 calls |
|-----------|---------|---------------------|
| Regex extraction | ~1ms | $0 |
| LLM hybrid (cached) | ~5ms | $0 |
| LLM hybrid (new call) | ~150ms | ~$0.003 |
| Deep session analysis | ~500ms | ~$0.01 |
| Proactive insight gen | ~300ms | ~$0.005 |

**Strategy:** 
- Regex for real-time (every turn)
- LLM fallback when regex confidence < 0.6
- Full LLM analysis at session end only
