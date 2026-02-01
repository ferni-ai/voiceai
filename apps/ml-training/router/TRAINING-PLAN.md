# ONNX Router Training Plan

> Last updated: January 26, 2026

## Summary

Training a Qwen3-1.7B model for tool classification with 796 tools using LoRA fine-tuning.

---

## Completed Work

### 1. Fixed ONNX Classifier Issues
- **Label map mismatch**: Changed from v4 label_map.json (40 labels) to ferni-router-rich/label_map.json (758 labels)
- **Sigmoid → Softmax**: Fixed `apps/rust-perf/src/onnx_router.rs` to use softmax for single-label classification
- **Tests passing**: All 5 ONNX classifier tests pass (~60-70ms latency)

### 2. Generated Quality Training Data
- **Before**: 5,738 examples, 40 tools (5.3% coverage)
- **After**: 33,856 examples, 796 tools (100% coverage)

Files created:
- `generate-quality-data.ts` - Domain-specific template generator
- `create-splits.ts` - Stratified train/val/test split creator
- `data/train.jsonl` - 28,449 examples
- `data/validation.jsonl` - 2,999 examples
- `data/test.jsonl` - 2,408 examples

### 3. Updated Config for MPS (Apple Silicon)
- Disabled fp16 (MPS compatibility)
- Reduced batch size to 4 (effective 32 with gradient_accumulation=8)
- Reduced max_length to 128 (queries are short)
- Set dataloader_num_workers to 0

---

## Training Status

| Metric | Value |
|--------|-------|
| Model | Qwen/Qwen3-1.7B |
| Trainable params | 19M (1.09% of 1.74B) |
| Total steps | 2,670 (3 epochs) |
| Steps completed | 49 (~2%) |
| Estimated time on MPS | 7-9 hours |

Training was interrupted - needs to be restarted.

---

## To Resume Training

### Option 1: Local MPS Training (7-9 hours)
```bash
cd /Users/sethford/Documents/voiceai/apps/ml-training/router
source .venv/bin/activate
nohup python3 train.py --config config.yaml --data_dir ./data --output_dir ./outputs/ferni-router-v2 > training.log 2>&1 &

# Monitor progress
tail -f training.log
```

### Option 2: Cloud GPU Training (faster)
Upload to Google Cloud, AWS, or use Google Colab with GPU runtime.

### Option 3: Smaller Model (faster but less accurate)
Use Qwen2.5-0.5B instead of Qwen3-1.7B.

---

## After Training Completes

### 1. Export to ONNX
```bash
cd /Users/sethford/Documents/voiceai/apps/ml-training/router
source .venv/bin/activate
python3 export_onnx.py --model_dir ./outputs/ferni-router-v2/final --output_dir ./outputs/ferni-router-v2/onnx
```

### 2. Update ONNX Classifier Path
Edit `src/tools/semantic-router/advanced/intelligent/onnx-classifier.ts`:
```typescript
const richModelDir = path.resolve(process.cwd(), 'apps/ml-training/router/outputs/ferni-router-v2');
```

### 3. Rebuild Rust Bindings
```bash
cd apps/rust-perf && pnpm build
```

### 4. Run Tests
```bash
pnpm vitest run src/tools/semantic-router/advanced/intelligent/__tests__/onnx-classifier.test.ts
```

---

## Key Files

| File | Purpose |
|------|---------|
| `apps/ml-training/router/train.py` | Main training script |
| `apps/ml-training/router/config.yaml` | Training config (MPS optimized) |
| `apps/ml-training/router/export_onnx.py` | ONNX export script |
| `apps/rust-perf/src/onnx_router.rs` | Rust ONNX inference (softmax fixed) |
| `src/tools/semantic-router/advanced/intelligent/onnx-classifier.ts` | TS classifier wrapper |

---

## Expected Results

After training:
- **Top-1 accuracy**: ~85-90% (based on previous runs)
- **Inference latency**: ~60-70ms
- **Tool coverage**: 796 tools (100%)
