# FTIS 98%+ Accuracy Plan - 2026 SOTA Models

## ✅ IMPLEMENTATION COMPLETE - January 19, 2026

### Final Results

| Model | Stage 1 | Stage 2 Avg | Combined | Δ from V1 |
|-------|---------|-------------|----------|-----------|
| V1 Original (79 cats) | 97.06% | 95.50% | 92.70% | baseline |
| V2 Hard Negatives | 97.09% | 96.03% | 93.24% | +0.54% |
| **V3 Merged (70 cats)** | **96.89%** | **96.40%** | **93.40%** | **+0.70%** |

### Phase 2 Results - Category Merges

| Category | V1 | V3 Merged | Change |
|----------|-----|-----------|--------|
| calendar | 98.22% | 98.00% | -0.22% |
| communication | 97.72% | 98.01% | +0.29% |
| emotional | 93.64% | 93.82% | +0.18% |
| finance | 94.00% | 96.00% | **+2.00%** ✅ |
| health | 91.60% | 92.20% | +0.60% |
| home | 99.00% | 98.01% | -0.99% |
| media | 93.81% | 95.21% | **+1.40%** ✅ |
| productivity | 92.00% | 94.18% | **+2.18%** ✅ |
| system | 99.00% | 99.80% | +0.80% |
| travel | 96.02% | 98.80% | **+2.78%** ✅ |

### Categories Merged (79 → 70)
- `habit_log + exercise_log` → `activity_log`
- `nutrition + water` → `hydration_nutrition`
- `voice_memo + memory_save` → `save_info`
- `todo_add + list_manage` → `item_add`
- `journal + gratitude` → `reflection`
- `grounding + wellness_check` → `calm_support`
- `self_compassion + imposter_syndrome` → `self_worth`
- `music_play + music_mood` → `play_music`
- `music_search + music_playlist` → `find_music`
- `weather_current + weather_forecast` → `weather`

---

## Original Plan (Historical)

## Current State
- **V1 (flat)**: 17% accuracy with 887 labels
- **V2 (hierarchical)**: 93% combined accuracy
  - Stage 1: 97% (10 super-categories)
  - Stage 2: 91-99% (10 classifiers, 79 fine categories)

## Problem: Stubborn Categories at 91-94%
| Category | Accuracy | Issue |
|----------|----------|-------|
| health | 91-92% | 10 overlapping labels (habit_log vs exercise_log) |
| productivity | 92-93% | 11 similar concepts (todo vs list vs memory) |
| emotional | 93-94% | 11 nuanced emotions (crisis vs grounding) |
| media | 93-94% | 10 music/content types |

## Root Cause Analysis
The issue isn't model capacity - it's **semantic ambiguity**:
- "I worked out today" → habit_log OR exercise_log?
- "Save this" → voice_memo OR memory_save?
- "I need to calm down" → grounding OR crisis_support?

## 2026 SOTA Options

### Option 1: Gemini Embedding API (Recommended)
**Pros:**
- Best-in-class on MMTEB (250+ languages)
- We already have Gemini API access
- No training needed - just embed + classify

**Cons:**
- API latency (~100-200ms)
- Cost per query

**Implementation:**
```typescript
// Use Gemini for hard classifications
const embedding = await gemini.embed(query);
const similarities = categories.map(c => cosineSim(embedding, c.centroid));
return categories[argmax(similarities)];
```

### Option 2: ModernBERT Fine-Tuning
**Pros:**
- 8k context window
- Fast inference (FlashAttention)
- Open source, local deployment

**Cons:**
- Requires training infrastructure
- May hit same accuracy ceiling

**Implementation:**
```python
from transformers import AutoModelForSequenceClassification
model = AutoModelForSequenceClassification.from_pretrained(
    "answerdotai/ModernBERT-base",
    num_labels=80
)
```

### Option 3: Hybrid Approach (Best)
**Architecture:**
```
Query → ONNX (current, fast) → confidence check
                                    ↓
                    High (>0.9) → Return result
                    Low (<0.9)  → Gemini Embedding fallback
```

**Pros:**
- Fast for easy cases (95% of queries)
- High accuracy for ambiguous cases
- No retraining needed

**Cons:**
- Slightly more complex

## Option 4: Rethink the Categories

The real issue may be that some categories are **inherently ambiguous** and should be merged:

### Proposed Merges
| Current | Merged |
|---------|--------|
| habit_log + exercise_log | activity_log |
| voice_memo + memory_save | save_info |
| grounding + wellness_check | calm_support |
| music_play + music_mood | play_music |
| todo_add + list_manage | add_item |

This reduces 79 categories → ~60 categories with clearer boundaries.

## Recommended Plan

### Phase 1: Quick Win (Hybrid Fallback)
1. Keep current ONNX models
2. Add Gemini embedding fallback for low-confidence predictions
3. Expected: 93% → 96-97%

### Phase 2: Category Optimization
1. Merge inherently ambiguous categories
2. Regenerate training data
3. Retrain
4. Expected: 96-97% → 98%+

### Phase 3: ModernBERT (Optional)
1. If Phase 2 doesn't hit 98%
2. Fine-tune ModernBERT on optimized categories
3. Expected: 98%+ guaranteed

## Implementation Timeline

| Phase | Effort | Impact |
|-------|--------|--------|
| Hybrid fallback | 2-4 hours | +3-4% |
| Category merge | 4-8 hours | +2-3% |
| ModernBERT | 1-2 days | +1-2% |

## Decision

**Recommended: Start with Hybrid + Category Merge**

This gets us to 98%+ without:
- Retraining the whole system
- Adding significant latency
- Requiring new infrastructure
