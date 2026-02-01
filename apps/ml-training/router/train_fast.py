#!/usr/bin/env python3
"""
FAST Ferni Router Training - Optimized for Speed

Uses Qwen2.5-0.5B (smaller, faster) with optimizations:
- 1 epoch (usually sufficient for classification)
- Larger batch size
- Fewer eval steps
- Optimized for ~1-2 hours on M4 Pro

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  python train_fast.py
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
)
from peft import LoraConfig, get_peft_model, TaskType
from sklearn.metrics import f1_score
import numpy as np

# ==============================================================================
# OPTIMIZED CONFIG
# ==============================================================================

# Use smaller model for faster training
BASE_MODEL = "Qwen/Qwen2.5-0.5B"

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
OUTPUT_DIR = Path("outputs/ferni-router-fast")
ONNX_OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-1069")

# Aggressive LoRA - smaller model allows higher rank
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05

# SPEED-OPTIMIZED training config
MAX_LENGTH = 128  # Shorter sequences
BATCH_SIZE = 16   # Larger batches
GRADIENT_ACCUMULATION = 2  # Less accumulation
EPOCHS = 1  # One epoch often sufficient
LEARNING_RATE = 5e-5  # Higher LR for faster convergence

# Environment
os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"

def setup_device():
    """Configure device."""
    if torch.backends.mps.is_available():
        device = torch.device("mps")
        print(f"✅ Using MPS (Apple Silicon)")
    elif torch.cuda.is_available():
        device = torch.device("cuda")
        print(f"✅ Using CUDA")
    else:
        device = torch.device("cpu")
        print("⚠️ CPU only")
    return device

def load_jsonl(path):
    with open(path, 'r') as f:
        return [json.loads(line) for line in f]

def load_data():
    train_data = load_jsonl(DATA_DIR / "train.jsonl")
    val_data = load_jsonl(DATA_DIR / "validation.jsonl")
    
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    
    print(f"Train: {len(train_data):,}, Val: {len(val_data):,}, Labels: {len(label_map)}")
    return train_data, val_data, label_map

def convert_to_multilabel(data, label_map, num_labels):
    processed = []
    for item in data:
        labels = [0.0] * num_labels
        for tool in item.get('selected_tools', []):
            if tool in label_map:
                labels[label_map[tool]] = 1.0
        processed.append({
            'text': item['query'],
            'labels': labels,
        })
    return processed

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    probs = 1 / (1 + np.exp(-logits))
    
    # Top-1 accuracy
    top1_indices = np.argmax(probs, axis=1)
    label_indices = np.argmax(labels, axis=1)
    top1_acc = (top1_indices == label_indices).mean()
    
    # Top-3 accuracy
    top3_indices = np.argsort(probs, axis=1)[:, -3:]
    top3_acc = np.array([label_indices[i] in top3_indices[i] for i in range(len(label_indices))]).mean()
    
    # F1
    preds = (probs > 0.5).astype(int)
    f1 = f1_score(labels, preds, average='micro', zero_division=0)
    
    return {'f1': f1, 'top1_acc': top1_acc, 'top3_acc': top3_acc}

def main():
    print("=" * 60)
    print("⚡ FAST Ferni Router Training")
    print("   Qwen2.5-0.5B + SOTA data + Speed optimizations")
    print("=" * 60)
    
    device = setup_device()
    
    # Load data
    print("\n📂 Loading data...")
    train_data, val_data, label_map = load_data()
    NUM_LABELS = len(label_map)
    
    # Convert
    train_processed = convert_to_multilabel(train_data, label_map, NUM_LABELS)
    val_processed = convert_to_multilabel(val_data, label_map, NUM_LABELS)
    
    train_dataset = Dataset.from_list(train_processed)
    val_dataset = Dataset.from_list(val_processed)
    
    # Load tokenizer
    print(f"\n🔤 Loading tokenizer: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Load model
    print(f"\n🧠 Loading model: {BASE_MODEL}")
    model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=NUM_LABELS,
        problem_type="multi_label_classification",
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    
    params = sum(p.numel() for p in model.parameters())
    print(f"   Parameters: {params:,} ({params/1e9:.2f}B)")
    
    # Add LoRA
    print(f"\n🔧 Adding LoRA (r={LORA_R}, alpha={LORA_ALPHA})")
    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=LORA_DROPOUT,
        bias="none",
        task_type=TaskType.SEQ_CLS,
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
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
    
    # Training args - SPEED OPTIMIZED
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # Calculate steps
    steps_per_epoch = len(train_dataset) // (BATCH_SIZE * GRADIENT_ACCUMULATION)
    total_steps = steps_per_epoch * EPOCHS
    
    print(f"\n📊 Training plan:")
    print(f"   Steps/epoch: {steps_per_epoch}")
    print(f"   Total steps: {total_steps}")
    print(f"   Est. time: ~{total_steps * 3 / 60:.0f} minutes")
    
    training_args = TrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE * 2,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION,
        learning_rate=LEARNING_RATE,
        warmup_ratio=0.1,
        weight_decay=0.01,
        eval_strategy="steps",
        eval_steps=500,
        save_strategy="steps",
        save_steps=500,
        save_total_limit=1,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=100,
        report_to="none",  # No tensorboard for speed
        remove_unused_columns=False,
        dataloader_pin_memory=False,
        fp16=False,  # MPS doesn't support fp16
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
    )
    
    # Train
    print("\n" + "=" * 60)
    print("🏋️ Training...")
    print("=" * 60 + "\n")
    
    trainer.train()
    
    # Evaluate
    print("\n📊 Final evaluation:")
    results = trainer.evaluate()
    print(f"   F1 Score:       {results['eval_f1']:.4f}")
    print(f"   Top-1 Accuracy: {results['eval_top1_acc']:.4f}")
    print(f"   Top-3 Accuracy: {results['eval_top3_acc']:.4f}")
    
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
    print(f"   Output: {ONNX_OUTPUT_DIR}")
    print("=" * 60)

def export_to_onnx(model, tokenizer, checkpoint_dir):
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
        
        shutil.copy(checkpoint_dir / "label_map.json", ONNX_OUTPUT_DIR / "label_map.json")
        
        print(f"   ✅ ONNX exported to {ONNX_OUTPUT_DIR}")
        
    except Exception as e:
        print(f"   ⚠️ ONNX export failed: {e}")
        print("   You can export manually later")

if __name__ == "__main__":
    main()
