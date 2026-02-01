# V7 Hierarchical Training Pipeline

## Architecture: Two-Stage Classification

```
User query: "remind me to call mom at 5pm"
    │
    ▼
┌──────────────────────────────┐
│  Stage 1: Domain Classifier  │  44 classes (vs 861 flat)
│  Qwen3-1.7B + LoRA           │  Expected: 99%+ top-1
└──────────────────────────────┘
    │ domain = "tasks_reminders"
    ▼
┌──────────────────────────────┐
│  Stage 2: Meta-tool Classif. │  6 classes (within domain)
│  Qwen3-1.7B + LoRA           │  Expected: 98%+ top-1
└──────────────────────────────┘
    │ meta_tool = "reminder.create"
    ▼
  LLM extracts params: {text: "call mom", time: "5pm"}
```

## What We Have

| Asset | Count | Location |
|-------|-------|----------|
| Training data (V6) | 432,124 examples | `data/train_v6.jsonl` |
| Validation data (V6) | 53,562 examples | `data/validation_v6.jsonl` |
| Test data | ~6,752 examples | `data/test.jsonl` |
| Tool → domain mapping | 861 tools | `v7_taxonomy.py` |
| Relabeling script | ready | `v7_relabel.py` |

## Pipeline Steps

### Step 1: Relabel Data (5 minutes, local)

```bash
python v7_relabel.py \
  --input data/train_v6.jsonl \
  --validation data/validation_v6.jsonl \
  --test data/test.jsonl \
  --output-dir data/v7/
```

**Produces:**
- `data/v7/stage1_train.jsonl` — query → domain (44 classes)
- `data/v7/stage2_train.jsonl` — query → meta_tool + domain (112 meta-tools)
- `data/v7/domain_label_map.json` — domain → index
- `data/v7/meta_label_maps.json` — per-domain meta_tool → index
- `data/v7/global_meta_label_map.json` — flat meta_tool → index

### Step 2: Train Stage 1 Domain Classifier (~4 hours on L4)

```yaml
# config_v7_stage1.yaml
model:
  base_model: "Qwen/Qwen3-1.7B"
  num_labels: 44  # domains
training:
  learning_rate: 2.0e-5
  num_train_epochs: 3
  per_device_train_batch_size: 16
  gradient_accumulation_steps: 4
  warmup_ratio: 0.1
  eval_steps: 500
  metric_for_best_model: "f1_weighted"
data:
  train_file: "data/v7/stage1_train.jsonl"
  validation_file: "data/v7/stage1_validation.jsonl"
output:
  output_dir: "outputs/ferni-router-v7-stage1"
```

**Why this is easier:** 44 well-separated classes vs 861 overlapping. Calendar vs Music vs Grief — unambiguous. Expected convergence in ~1 epoch vs 3 for V6.

### Step 3: Train Stage 2 Meta-tool Classifier (~4 hours on L4)

**Two approaches:**

#### Option A: Single Multi-Head Model (Recommended)

One model, 112 meta-tool classes, but domain is provided as input context:

```
Input: "[tasks_reminders] remind me to call mom at 5pm"
Label: "reminder.create"
```

Prepending the domain token lets the model learn domain-conditioned tool selection. This is simpler to deploy (one model, not 44) and still gets the accuracy benefit of small per-domain label spaces since the domain token eliminates cross-domain confusion.

```yaml
# config_v7_stage2.yaml
model:
  base_model: "Qwen/Qwen3-1.7B"
  num_labels: 112  # global meta-tools
training:
  learning_rate: 2.0e-5
  num_train_epochs: 3
data:
  train_file: "data/v7/stage2_train.jsonl"  # with [domain] prefix
  validation_file: "data/v7/stage2_validation.jsonl"
output:
  output_dir: "outputs/ferni-router-v7-stage2"
```

#### Option B: Per-Domain Models (Maximum accuracy)

Train 44 tiny classifiers, one per domain. Each only sees its own tools (2-8 classes). Extremely high accuracy but complex deployment (load the right model based on Stage 1 output).

**Recommendation:** Start with Option A. If accuracy isn't high enough, try Option B for the hardest domains (emotional_support, self_compassion, etc.).

### Step 4: Export to ONNX

```bash
# Export both stages
python export_onnx.py --checkpoint outputs/ferni-router-v7-stage1/best --output models/v7-stage1.onnx
python export_onnx.py --checkpoint outputs/ferni-router-v7-stage2/best --output models/v7-stage2.onnx
```

### Step 5: Inference Pipeline

```python
# Pseudocode for production inference
def classify_tool(query: str) -> tuple[str, str, float]:
    # Stage 1: Get domain
    domain, domain_conf = stage1_model.predict(query)

    # Stage 2: Get meta-tool (with domain prefix)
    prefixed = f"[{domain}] {query}"
    meta_tool, meta_conf = stage2_model.predict(prefixed)

    # Combined confidence
    confidence = domain_conf * meta_conf

    return domain, meta_tool, confidence
```

**Latency budget:** Stage 1 (~25ms) + Stage 2 (~25ms) = ~50ms total (same as V6 single model).

## Expected Results

| Metric | V6 (flat 861) | V7 Stage 1 | V7 Stage 2 | V7 Combined |
|--------|---------------|-----------|-----------|-------------|
| Classes | 861 | 44 | 112 | 44 × ~3 |
| Top-1 | ~85% (est.) | 99%+ | 98%+ | 97%+ |
| F1 weighted | ~0.85 | 0.99+ | 0.98+ | 0.97+ |
| Inference | ~50ms | ~25ms | ~25ms | ~50ms |

## Why V7 > V6

1. **Smaller label space:** 44 classes is 20x easier than 861. The model doesn't need to learn 861 decision boundaries.

2. **No cross-domain confusion:** "schedule a ride" never competes with "schedule a reminder" because they're in different domains.

3. **Verb overloading solved:** `track*` (20 tools in V6) maps to different domains. Within each domain, the meta-tool is unambiguous.

4. **Dense clusters decomposed:** The 195-label wellbeing cluster splits into grief_loss (3), emotional_support (4), self_compassion (3), etc.

5. **CRUD disambiguation:** Calendar always has explicit read/create/modify/delete meta-tools.

6. **Zero new data needed:** Just relabeling existing 432K examples.

## Training Compute Estimate

| Stage | Epochs | Steps | Time (L4 GPU) |
|-------|--------|-------|---------------|
| Stage 1 | 3 | ~20,256 | ~13 hours |
| Stage 2 | 3 | ~20,256 | ~13 hours |
| **Total** | | | **~26 hours** |

Same data, same hardware, two sequential training runs. Could parallelize on two GPUs.

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Stage 1 error cascades | Low (99% domain acc.) | Return top-3 domains to Stage 2 |
| Some meta-tools too similar | Medium | Merge further or use per-domain models |
| Latency doubles (two models) | Low | Batch, optimize, or use single multi-head |
| Domain mapping wrong | Low | Validate on existing test set before training |

## Files Created

| File | Purpose |
|------|---------|
| `v7_taxonomy.py` | Complete 861-tool → (domain, meta_tool) mapping |
| `v7_relabel.py` | Transform V6 JSONL → V7 hierarchical JSONL |
| `V7_PIPELINE.md` | This document |
