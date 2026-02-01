# Path to 99% Routing Accuracy

## Current Status (January 2026)

| Test Suite | Before | After | Delta |
|------------|--------|-------|-------|
| Static Tests (23 cases) | 60.9% | **95.7%** | +34.8% |
| Dynamic LLM Tests (100 cases) | 35.0% | **72.0%** | +37.0% |

### Key Improvements Made

1. **Hybrid Router** (`ftis-hybrid-router.ts`)
   - Combines ML predictions with keyword pattern matching
   - ML handles clear intents, keywords handle edge cases
   - When ML confidence < 30%, keyword match takes priority

2. **Comprehensive Keyword Patterns**
   - 16 tool categories with extensive regex patterns
   - Handles slang, abbreviations, conversational phrasing
   - Categories at 100%: `call`, `weather`
   - Categories at 83%+: `music`, `message`, `reminder`, `search`, `news`, `get_events`

3. **GPU Acceleration**
   - Candle ML framework with Metal GPU
   - 6.6x faster than CPU inference
   - ~180ms per query (warm)

---

## Gap Analysis: 72% → 99%

### Categories Needing Improvement

| Category | Current | Gap | Blockers |
|----------|---------|-----|----------|
| `habit_progress` | 16.7% | High | Slang queries ("habit stats?", "how's my habits?") |
| `alarm` | 50% | Medium | Extreme slang ("yo, set ting", "gimme 6") |
| `timer` | 50% | Medium | Contextual ("pizza's cookin' 20") |
| `save_memory` | 50% | Medium | Implicit ("hold that thought", "stash it") |
| `pause_music` | 66.7% | Low | "Done listening" detected as play |
| `create_event` | 66.7% | Low | "Calendar it" confused with get_events |
| `log_habit` | 66.7% | Low | Short phrases ("planks done") |

### Root Causes

1. **ML Model Training Gaps**
   - Model wasn't trained on slang/abbreviations
   - Extreme short queries ("temps?", "yo set it")
   - Contextual queries without explicit keywords

2. **Semantic Ambiguity**
   - "reminder to calendar" → reminder or event?
   - "calendar it" → create or view?
   - "done listening" → pause or play? (conflicting signals)

3. **Missing Patterns**
   - Gen-Z slang: "frfr", "hmu", "ting"
   - Context-dependent: "20" (20 minutes? $20? track 20?)
   - Implicit intents: "pizza's cookin'" → timer

---

## Strategy to Reach 99%

### Phase 1: Training Data Augmentation (Est. +15%)

Generate additional training data from failures:

```bash
# Suggested training data already generated
cat apps/ml-training/router/data/suggested_training_data.jsonl
```

**Actions:**
1. Add 34 failure cases to training data
2. Generate slang variations using LLM
3. Add context-aware examples (cooking timers, alarm times)
4. Retrain Qwen3-1.7B model with augmented data

### Phase 2: Pattern Refinement (Est. +8%)

**Specific patterns to add:**

```typescript
// Habit Progress - slang
/how'?s? (my )?(habits?|streaks?)/i,
/(habit|streak) stats/i,

// Timer - contextual
/\w+'?s? (cookin|cooking|baking)/i,  // Cooking context → timer
/\d+ more min/i,                      // "20 more min"

// Alarm - numeric shortcuts
/^gimme \d+$/i,                       // "gimme 6" → 6am alarm
/^set \d+$/i,                         // "set 7" → 7am alarm

// Save Memory - implicit
/^(hold|save|keep) (it|that)$/i,      // Very short saves
```

### Phase 3: Confidence Calibration (Est. +4%)

The hybrid router currently uses a fixed 30% threshold for ML confidence. This should be tuned per category:

| Category | Current Threshold | Proposed |
|----------|------------------|----------|
| `timer` | 30% | 40% (keyword more reliable) |
| `alarm` | 30% | 40% (keyword more reliable) |
| `create_event` | 30% | 25% (ML better at context) |
| `pause_music` | 30% | 50% (high false positive rate) |

### Phase 4: Context-Aware Routing (Est. +5%)

Use conversation context to disambiguate:

```typescript
// If music is currently playing:
"done" → pause_music (not open intent)
"quiet" → pause_music (not skip)

// If user recently set a timer:
"check it" → get timer status

// If user mentioned cooking:
"20" → likely timer for 20 minutes
```

---

## Validation Script Usage

```bash
# Full generation (slow, ~10 min)
npx tsx apps/ml-training/router/dynamic_synthetic_generator.ts

# Quick test (2 min)
npx tsx apps/ml-training/router/dynamic_synthetic_generator.ts --quick

# Validate existing data only (fast)
npx tsx apps/ml-training/router/dynamic_synthetic_generator.ts --validate-only

# Focus on one category
npx tsx apps/ml-training/router/dynamic_synthetic_generator.ts --category=alarm

# Generate only (no validation)
npx tsx apps/ml-training/router/dynamic_synthetic_generator.ts --generate-only
```

---

## Files Modified

| File | Purpose |
|------|---------|
| `src/tools/semantic-router/integration/ftis-hybrid-router.ts` | Hybrid ML + keyword router |
| `apps/ml-training/router/dynamic_synthetic_generator.ts` | LLM-based test generation |
| `apps/ml-training/router/data/suggested_training_data.jsonl` | Training data from failures |
| `apps/ml-training/router/data/hard_negatives_v4.jsonl` | Edge case training data |

---

## Next Steps

1. [ ] Retrain model with augmented training data
2. [ ] Add remaining keyword patterns
3. [ ] Implement per-category confidence thresholds
4. [ ] Add conversation context to routing decisions
5. [ ] Run comprehensive validation (500+ queries)
6. [ ] Deploy to production with A/B test

---

*Last updated: January 2026*
