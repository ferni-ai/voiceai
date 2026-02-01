# FTIS V5 Plan: Path to 99%+ Accuracy

> **Target:** 99%+ tool routing accuracy
> **Current:** V4 at 94.1% top-1 accuracy
> **Created:** January 26, 2026

---

## Executive Summary

V4 achieved 94.1% top-1 accuracy (99.3% top-3). V5 aims for 99%+ through:

1. **Training data expansion** - 10x more examples, LLM-generated edge cases
2. **Hybrid routing** - ML + patterns + context-aware fallbacks
3. **Per-category optimization** - Custom thresholds and patterns per tool category
4. **Conversation context** - Use session state to disambiguate

---

## Current State (V4)

| Metric         | Value | Notes                |
| -------------- | ----- | -------------------- |
| Top-1 Accuracy | 94.1% | Primary metric       |
| Top-3 Accuracy | 99.3% | Excellent fallback   |
| F1 Score       | 83.5% | Room for improvement |
| Precision      | 96.2% | Very good            |
| Recall         | 73.8% | **Gap to fix**       |
| Categories     | 40    | Needs expansion      |

### Gap Analysis by Category

| Category         | Current | Target | Gap    | Root Cause            |
| ---------------- | ------- | ------ | ------ | --------------------- |
| `habit_progress` | ~60%    | 99%    | High   | Slang, abbreviations  |
| `alarm`          | ~75%    | 99%    | Medium | Short/numeric queries |
| `timer`          | ~75%    | 99%    | Medium | Contextual (cooking)  |
| `save_memory`    | ~70%    | 99%    | Medium | Implicit saves        |
| `pause_music`    | ~80%    | 99%    | Low    | Conflicting signals   |
| `create_event`   | ~85%    | 99%    | Low    | Calendar ambiguity    |

---

## V5 Architecture

```
User Query
    │
    ├─────────────────────────────────────────────────────────┐
    │                                                         │
    ▼                                                         ▼
┌─────────────────┐                               ┌─────────────────┐
│ Pattern Matcher │ (<1ms)                        │ Session Context │
│ - Regex rules   │                               │ - Last 5 turns  │
│ - Keyword boost │                               │ - Active timers │
│ - Slang mapping │                               │ - Music playing │
└────────┬────────┘                               └────────┬────────┘
         │                                                 │
         └──────────────────┬──────────────────────────────┘
                            │
                            ▼
                ┌─────────────────────┐
                │ Qwen3-1.7B Classifier│ (~50ms)
                │ - 80k training data  │
                │ - LoRA fine-tuned    │
                │ - Multi-label output │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │ Confidence Router   │
                │ >95% → Execute      │
                │ 80-95% → Verify     │
                │ <80% → LLM Fallback │
                └──────────┬──────────┘
                           │
                           ▼
                ┌─────────────────────┐
                │ Tool Execution      │
                └─────────────────────┘
```

---

## Phase 1: Training Data Expansion (Week 1)

### Goal: 5,738 → 80,000 examples

| Data Type          | Current | Target | Method                        |
| ------------------ | ------- | ------ | ----------------------------- |
| Tool examples      | 4,000   | 40,000 | LLM generation + augmentation |
| Open intents       | 975     | 20,000 | Conversation corpus mining    |
| Hard negatives     | 24      | 10,000 | Confusion pair generation     |
| Slang variations   | 0       | 5,000  | Social media corpus           |
| Contextual queries | 0       | 5,000  | Session simulation            |

### Data Generation Strategy

```bash
# 1. Generate 1000 examples per category using Gemini
npx tsx scripts/generate-ftis-v5-data.ts --per-category=1000

# 2. Generate slang variations
npx tsx scripts/generate-ftis-slang-variations.ts

# 3. Mine hard negatives from confusion matrix
npx tsx scripts/generate-ftis-hard-negatives.ts --from-confusion

# 4. Generate contextual queries
npx tsx scripts/generate-ftis-contextual.ts
```

### Slang Dictionary to Add

```json
{
  "music_play": ["throw on", "bump", "blast", "vibe to", "queue up"],
  "alarm": ["gimme 6", "wake me", "ting for", "ring at"],
  "timer": ["cookin'", "baking", "count down", "tick for"],
  "habit": ["streak", "check in", "did my", "knocked out"],
  "memory": ["stash", "hold that", "remember when", "that thing about"]
}
```

---

## Phase 2: Model Architecture Improvements (Week 2)

### 2.1 Expand Label Space

Current: 40 tools → Target: 120 tools (full domain coverage)

```yaml
# config_v5.yaml changes
model:
  num_labels: 120 # Expanded from 40

data:
  train_file: 'data/train_v5.jsonl' # 80k examples
```

### 2.2 Add Hierarchical Classification

```
Stage 1: Super-category (10 classes, 99%+ accuracy)
  ├── music → Stage 2a: 5 music tools
  ├── calendar → Stage 2b: 3 calendar tools
  ├── timer_alarm → Stage 2c: 4 time tools
  └── ...
```

### 2.3 Multi-Task Learning

Train on both:

- Tool classification (primary)
- Open intent detection (auxiliary)
- Confidence calibration (auxiliary)

```python
# Multi-task head
class MultiTaskHead(nn.Module):
    def __init__(self, hidden_size, num_tools):
        self.tool_head = nn.Linear(hidden_size, num_tools)
        self.open_intent_head = nn.Linear(hidden_size, 2)
        self.confidence_head = nn.Linear(hidden_size, 1)
```

---

## Phase 3: Hybrid Router Enhancement (Week 2-3)

### 3.1 Pattern Rules for Edge Cases

```typescript
// V5 pattern rules (ftis-v5-patterns.ts)
export const V5_PATTERNS: PatternRule[] = [
  // Numeric alarm shortcuts
  { pattern: /^(gimme|set|wake me at?) ?(\d{1,2})$/i, tool: 'setAlarm', confidence: 0.95 },

  // Cooking timer detection
  { pattern: /\b(cook|bak|roast|broil|simmer)ing?\b.*\d+/i, tool: 'setTimer', confidence: 0.9 },

  // Implicit memory saves
  { pattern: /^(hold|save|keep|stash) (it|that|this)$/i, tool: 'saveMemory', confidence: 0.85 },

  // Music done = pause
  {
    pattern: /^(done|finished|enough) (listening|music|with this)$/i,
    tool: 'pauseMusic',
    confidence: 0.9,
  },

  // Habit slang
  { pattern: /^(did|done|finished|knocked out) (my )?\w+$/i, tool: 'logHabit', confidence: 0.85 },
];
```

### 3.2 Per-Category Confidence Thresholds

```typescript
// V5 category-specific thresholds
export const CATEGORY_THRESHOLDS: Record<string, number> = {
  // High-confidence categories (ML is reliable)
  weather: 0.8,
  call: 0.8,
  news: 0.8,

  // Medium-confidence (blend with patterns)
  music_play: 0.85,
  calendar_create: 0.85,
  reminder: 0.85,

  // Low-confidence (prefer patterns)
  alarm: 0.9,
  timer: 0.9,
  habit_log: 0.9,
  save_memory: 0.9,
};
```

### 3.3 Context-Aware Disambiguation

```typescript
// Session context for disambiguation
interface SessionContext {
  musicPlaying: boolean;
  activeTimers: string[];
  recentTopics: string[];
  lastToolUsed: string;
}

function disambiguate(query: string, predictions: Prediction[], ctx: SessionContext): string {
  // "done" when music is playing → pause
  if (ctx.musicPlaying && /^done$/i.test(query)) {
    return 'pauseMusic';
  }

  // "check it" after setting timer → timer status
  if (ctx.activeTimers.length > 0 && /check (it|on|the)/i.test(query)) {
    return 'getTimerStatus';
  }

  // Recent cooking mention + number → timer
  if (ctx.recentTopics.includes('cooking') && /\d+/.test(query)) {
    return 'setTimer';
  }

  return predictions[0].tool;
}
```

---

## Phase 4: Calibration & Testing (Week 3)

### 4.1 Platt Scaling Calibration

```python
# Post-hoc calibration using Platt scaling
from sklearn.calibration import CalibratedClassifierCV

calibrator = CalibratedClassifierCV(model, method='sigmoid', cv=5)
calibrator.fit(X_val, y_val)
```

### 4.2 Comprehensive Test Suite

| Test Type           | Count | Purpose               |
| ------------------- | ----- | --------------------- |
| Static unit tests   | 500   | Regression prevention |
| LLM-generated tests | 1000  | Edge case coverage    |
| Real user queries   | 500   | Production simulation |
| Adversarial tests   | 200   | Robustness            |

### 4.3 A/B Testing Plan

```yaml
# A/B test config
experiment:
  name: 'ftis-v5-rollout'
  control: 'ftis-v4'
  treatment: 'ftis-v5'
  allocation: 10% # Start with 10%
  metrics:
    - tool_execution_success_rate
    - user_satisfaction_score
    - latency_p50
    - latency_p99
  duration: 7_days
  success_criteria:
    tool_execution_success_rate: '+5%'
    latency_p99: '<200ms'
```

---

## Implementation Timeline

| Phase       | Tasks                          | Duration | Owner        |
| ----------- | ------------------------------ | -------- | ------------ |
| **Phase 1** | Data generation (80k examples) | 3-4 days | AI + Scripts |
| **Phase 2** | Model training + multi-task    | 2-3 days | GPU training |
| **Phase 3** | Hybrid router + patterns       | 2 days   | Engineering  |
| **Phase 4** | Calibration + testing          | 2-3 days | Engineering  |
| **Rollout** | A/B test → production          | 7 days   | Ops          |

**Total: ~3 weeks to 99%+**

---

## Success Metrics

| Metric         | V4    | V5 Target | Measurement |
| -------------- | ----- | --------- | ----------- |
| Top-1 Accuracy | 94.1% | **99%+**  | Test set    |
| Top-3 Accuracy | 99.3% | 99.9%     | Test set    |
| F1 Score       | 83.5% | 95%+      | Test set    |
| Recall         | 73.8% | 95%+      | Test set    |
| Latency (p50)  | 60ms  | <50ms     | Production  |
| Latency (p99)  | 180ms | <150ms    | Production  |

---

## Files to Create/Modify

| File                                              | Purpose                        |
| ------------------------------------------------- | ------------------------------ |
| `scripts/generate-ftis-v5-data.ts`                | Generate 80k training examples |
| `scripts/generate-ftis-slang-variations.ts`       | Slang augmentation             |
| `apps/ml-training/router/config_v5.yaml`          | V5 training config             |
| `apps/ml-training/router/train_v5.py`             | Multi-task training script     |
| `src/tools/intelligence/ftis-v5-patterns.ts`      | V5 pattern rules               |
| `src/tools/intelligence/ftis-v5-router.ts`        | V5 hybrid router               |
| `src/tools/intelligence/category-thresholds.ts`   | Per-category thresholds        |
| `src/tools/intelligence/context-disambiguator.ts` | Context-aware routing          |

---

## Quick Start

```bash
# 1. Generate V5 training data
npx tsx scripts/generate-ftis-v5-data.ts

# 2. Train V5 model
cd apps/ml-training/router
source .venv/bin/activate
python3 train.py --config config_v5.yaml

# 3. Export to ONNX
python3 export_onnx.py --model_dir outputs/ferni-router-v5/final

# 4. Run validation
npx tsx apps/ml-training/router/dynamic_synthetic_generator.ts --validate-only

# 5. Deploy with A/B test
ferni experiments create ftis-v5-rollout --control=v4 --treatment=v5 --allocation=10
```

---

## Appendix: Category Expansion (40 → 120)

### New Categories to Add

| Domain           | New Tools                                                        |
| ---------------- | ---------------------------------------------------------------- |
| **Health**       | `logExercise`, `logNutrition`, `logWater`, `logSleep`, `getMood` |
| **Finance**      | `checkBudget`, `logExpense`, `payBill`, `getBillsDue`            |
| **Travel**       | `searchFlights`, `getDirections`, `planTrip`, `bookHotel`        |
| **Smart Home**   | `controlLights`, `setThermostat`, `lockDoor`, `checkSecurity`    |
| **Social**       | `postUpdate`, `checkNotifications`, `sendEmoji`, `sharePhoto`    |
| **Productivity** | `startFocus`, `endFocus`, `getProductivity`, `setPriority`       |
| **CEO Coaching** | `getBriefing`, `logGratitude`, `setIntention`, `reflectOnDay`    |

---

_This plan will get FTIS from 94.1% to 99%+ accuracy through systematic improvements to data, model, and routing logic._
