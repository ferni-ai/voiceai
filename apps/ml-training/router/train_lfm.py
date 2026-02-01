#!/usr/bin/env python3
"""
Ferni Router Model Training - LFM2.5-1.2B-Thinking (2026 SOTA)

Uses Liquid AI's LFM2.5-1.2B-Thinking model, which is specifically
optimized for tool use and on-device inference.

Key advantages over Qwen 2.5 1.5B:
- 57% on BFCLv3 tool use benchmark (vs ~50% for Qwen)
- 88% on IFEval instruction following
- <1GB memory footprint
- MLX-5bit optimized for Apple Silicon

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  pip install unsloth  # For optimized LoRA training
  python train_lfm.py

Data: /Users/sethford/Documents/voiceai/data/ftis-training-sota/
"""

import os
import json
import torch
from pathlib import Path
from datasets import Dataset
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    EarlyStoppingCallback,
)
from peft import LoraConfig, get_peft_model, TaskType
from sklearn.metrics import f1_score
import numpy as np

# ==============================================================================
# CONFIG
# ==============================================================================

# Use Liquid AI's reasoning model - optimized for tool use
BASE_MODEL = "LiquidAI/LFM2.5-1.2B-Thinking"

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
OUTPUT_DIR = Path("outputs/ferni-router-lfm")
ONNX_OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-lfm")

# LoRA config - LFM2.5 has different architecture (LIV + GQA blocks)
# Target the attention projections in both block types
LORA_R = 16  # Can use higher rank with smaller model
LORA_ALPHA = 32
LORA_DROPOUT = 0.1

# Training config - optimized for M4 Pro with MPS
MAX_LENGTH = 256
BATCH_SIZE = 8  # LFM2.5 is smaller, can use larger batch
GRADIENT_ACCUMULATION = 4  # Effective batch = 32
EPOCHS = 3
LEARNING_RATE = 2e-5

# Environment
os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

def setup_device():
    """Configure device for Apple Silicon."""
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        print(f"✅ Using MPS (Apple Silicon GPU)")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"✅ Using CUDA")
    else:
        device = torch.device("cpu")
        print("⚠️ No GPU available, using CPU")
    return device

def load_jsonl(path):
    """Load JSONL file."""
    with open(path, 'r') as f:
        return [json.loads(line) for line in f]

def load_data():
    """Load training data."""
    train_data = load_jsonl(DATA_DIR / "train.jsonl")
    val_data = load_jsonl(DATA_DIR / "validation.jsonl")
    
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    
    print(f"Train: {len(train_data):,}, Val: {len(val_data):,}")
    print(f"Labels: {len(label_map)}")
    
    return train_data, val_data, label_map

def convert_to_multilabel(data, label_map, num_labels):
    """Convert to multi-label format, handling negatives and multi-tool."""
    processed = []
    for item in data:
        labels = [0.0] * num_labels
        
        # Get selected tools (may be empty for negatives, or multiple for multi-tool)
        selected_tools = item.get('selected_tools', [])
        for tool in selected_tools:
            if tool in label_map:
                labels[label_map[tool]] = 1.0
        
        # For conversational negatives, all labels are 0
        # This teaches the model to output low confidence for chitchat
        
        processed.append({
            'text': item['query'],
            'labels': labels,
        })
    return processed

def compute_metrics(eval_pred):
    """Compute F1 and accuracy."""
    logits, labels = eval_pred
    probs = 1 / (1 + np.exp(-logits))
    preds = (probs > 0.5).astype(int)
    
    # Top-1 accuracy
    top1_indices = np.argmax(probs, axis=1)
    label_indices = np.argmax(labels, axis=1)
    top1_acc = (top1_indices == label_indices).mean()
    
    # Top-3 accuracy
    top3_indices = np.argsort(probs, axis=1)[:, -3:]
    top3_acc = np.array([label_indices[i] in top3_indices[i] for i in range(len(label_indices))]).mean()
    
    # F1
    f1 = f1_score(labels, preds, average='micro', zero_division=0)
    
    # Negative detection accuracy (for conversational queries)
    # If max prob < 0.3, it's correctly rejecting
    max_probs = np.max(probs, axis=1)
    is_negative = labels.sum(axis=1) == 0
    correct_rejections = (is_negative & (max_probs < 0.3)).sum()
    total_negatives = is_negative.sum()
    negative_acc = correct_rejections / total_negatives if total_negatives > 0 else 0
    
    return {
        'f1': f1, 
        'top1_acc': top1_acc, 
        'top3_acc': top3_acc,
        'negative_acc': negative_acc,
    }

def main():
    print("=" * 60)
    print("🚀 Ferni Router Training (LFM2.5-1.2B-Thinking)")
    print("   State-of-the-art 2026 model for tool use")
    print("=" * 60)
    
    device = setup_device()
    
    # Load data
    print("\n📂 Loading SOTA training data...")
    train_data, val_data, label_map = load_data()
    NUM_LABELS = len(label_map)
    
    # Convert
    train_processed = convert_to_multilabel(train_data, label_map, NUM_LABELS)
    val_processed = convert_to_multilabel(val_data, label_map, NUM_LABELS)
    
    train_dataset = Dataset.from_list(train_processed)
    val_dataset = Dataset.from_list(val_processed)
    
    # Load tokenizer
    print(f"\n🔤 Loading tokenizer: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Load model
    print(f"\n🧠 Loading model: {BASE_MODEL}")
    print("   (This is optimized for tool use and reasoning)")
    
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=NUM_LABELS,
        problem_type="multi_label_classification",
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    
    print(f"   Parameters: {sum(p.numel() for p in model.parameters()):,}")
    
    # Add LoRA - target LFM2.5's hybrid architecture
    print(f"\n🔧 Adding LoRA (r={LORA_R}, alpha={LORA_ALPHA})")
    
    # LFM2.5 uses LIV convolution blocks + GQA attention blocks
    # Target the attention projections in GQA blocks
    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",  # GQA attention
            "gate_proj", "up_proj", "down_proj",     # MLP
        ],
        lora_dropout=LORA_DROPOUT,
        bias="none",
        task_type=TaskType.SEQ_CLS,
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    # Move to device
    model = model.to(device)
    
    # Tokenize
    print(f"\n📝 Tokenizing (max_length={MAX_LENGTH})...")
    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            padding="max_length",
            truncation=True,
            max_length=MAX_LENGTH,
        )
    
    train_dataset = train_dataset.map(tokenize_fn, batched=True)
    val_dataset = val_dataset.map(tokenize_fn, batched=True)
    
    train_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
    val_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
    
    # Training args
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION,
        learning_rate=LEARNING_RATE,
        warmup_ratio=0.1,
        weight_decay=0.01,
        evaluation_strategy="steps",
        eval_steps=200,
        save_strategy="steps",
        save_steps=400,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_dir=str(OUTPUT_DIR / "logs"),
        logging_steps=50,
        report_to="tensorboard",
        remove_unused_columns=False,
        # MPS-specific
        use_mps_device=True if str(device) == "mps" else False,
        dataloader_pin_memory=False,
    )
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )
    
    # Train
    print("\n" + "=" * 60)
    print("🏋️ Starting training with LFM2.5-1.2B-Thinking...")
    print(f"   Epochs: {EPOCHS}")
    print(f"   Effective batch: {BATCH_SIZE * GRADIENT_ACCUMULATION}")
    print(f"   Train samples: {len(train_dataset):,}")
    print("=" * 60 + "\n")
    
    trainer.train()
    
    # Evaluate
    print("\n📊 Final evaluation:")
    results = trainer.evaluate()
    print(f"   F1 Score:       {results['eval_f1']:.4f}")
    print(f"   Top-1 Accuracy: {results['eval_top1_acc']:.4f}")
    print(f"   Top-3 Accuracy: {results['eval_top3_acc']:.4f}")
    print(f"   Negative Acc:   {results['eval_negative_acc']:.4f}")
    
    # Save
    final_dir = OUTPUT_DIR / "final"
    trainer.save_model(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    
    import shutil
    shutil.copy(DATA_DIR / "label_map.json", final_dir / "label_map.json")
    
    print(f"\n✅ Model saved to {final_dir}")
    
    # Export to ONNX
    print("\n📦 Exporting to ONNX...")
    export_to_onnx(model, tokenizer, final_dir)
    
    print("\n" + "=" * 60)
    print("✅ TRAINING COMPLETE!")
    print(f"   Model: {ONNX_OUTPUT_DIR}")
    print("   Next: Update inference code to use new model")
    print("=" * 60)

def export_to_onnx(model, tokenizer, checkpoint_dir):
    """Export to ONNX format."""
    import shutil
    
    try:
        from optimum.onnxruntime import ORTModelForSequenceClassification
        
        # Merge LoRA
        merged_model = model.merge_and_unload()
        merged_dir = OUTPUT_DIR / "merged"
        merged_model.save_pretrained(str(merged_dir))
        tokenizer.save_pretrained(str(merged_dir))
        
        # Export
        ONNX_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        
        ort_model = ORTModelForSequenceClassification.from_pretrained(
            str(merged_dir),
            export=True,
        )
        ort_model.save_pretrained(str(ONNX_OUTPUT_DIR))
        
        # Copy label map
        shutil.copy(checkpoint_dir / "label_map.json", ONNX_OUTPUT_DIR / "label_map.json")
        
        print(f"   ✅ ONNX exported to {ONNX_OUTPUT_DIR}")
        
    except Exception as e:
        print(f"   ⚠️ ONNX export failed: {e}")
        print("   Export manually later")

if __name__ == "__main__":
    main()
