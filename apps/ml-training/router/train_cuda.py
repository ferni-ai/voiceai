#!/usr/bin/env python3
"""
Ferni Router Training - CUDA/GCE Optimized

Optimized for NVIDIA T4/V100/A100 GPUs on GCE.
Much faster than local MPS training.

Expected times on T4 GPU:
- Qwen 0.5B: ~30 minutes
- LFM2.5-Base: ~45 minutes

Usage:
  python train_cuda.py --model qwen    # Train Qwen 0.5B
  python train_cuda.py --model lfm     # Train LFM2.5-Base
"""

import os
import json
import torch
import torch.nn as nn
from pathlib import Path
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModel,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)
from peft import LoraConfig, get_peft_model, TaskType
from sklearn.metrics import f1_score
import numpy as np
import argparse

# ==============================================================================
# CONFIG
# ==============================================================================

# Auto-detect data directory
DATA_DIR = Path(os.environ.get("DATA_DIR", "/home/ubuntu/ferni-training/data"))
if not DATA_DIR.exists():
    DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")

OUTPUT_DIR = Path("outputs/ferni-router")

# CUDA-optimized settings
MAX_LENGTH = 128
BATCH_SIZE = 32  # Much larger on GPU
GRADIENT_ACCUMULATION = 1  # Less accumulation needed
EPOCHS = 2
LEARNING_RATE = 3e-5


class LFM2SequenceClassifier(nn.Module):
    """Custom sequence classifier for LFM2.5."""
    
    def __init__(self, base_model_name: str, num_labels: int):
        super().__init__()
        self.num_labels = num_labels
        self.base = AutoModel.from_pretrained(base_model_name, trust_remote_code=True)
        hidden_size = self.base.config.hidden_size
        self.dropout = nn.Dropout(0.1)
        self.classifier = nn.Linear(hidden_size, num_labels)
        nn.init.xavier_uniform_(self.classifier.weight)
        nn.init.zeros_(self.classifier.bias)
    
    def forward(self, input_ids, attention_mask=None, labels=None):
        outputs = self.base(input_ids=input_ids, attention_mask=attention_mask, return_dict=True)
        hidden_states = outputs.last_hidden_state
        
        if attention_mask is not None:
            seq_lengths = attention_mask.sum(dim=1) - 1
            batch_size = hidden_states.size(0)
            pooled = hidden_states[torch.arange(batch_size, device=hidden_states.device), seq_lengths]
        else:
            pooled = hidden_states[:, -1, :]
        
        pooled = self.dropout(pooled)
        logits = self.classifier(pooled)
        
        loss = None
        if labels is not None:
            loss = nn.BCEWithLogitsLoss()(logits, labels.float())
        
        return {"loss": loss, "logits": logits}


def setup_device():
    if torch.cuda.is_available():
        device = torch.device("cuda")
        gpu_name = torch.cuda.get_device_name(0)
        gpu_mem = torch.cuda.get_device_properties(0).total_memory / 1e9
        print(f"✅ Using CUDA: {gpu_name} ({gpu_mem:.1f}GB)")
    elif torch.backends.mps.is_available():
        device = torch.device("mps")
        print("✅ Using MPS (Apple Silicon)")
    else:
        device = torch.device("cpu")
        print("⚠️ CPU only - this will be slow!")
    return device


def load_data():
    def load_jsonl(path):
        with open(path, 'r') as f:
            return [json.loads(line) for line in f]
    
    train_data = load_jsonl(DATA_DIR / "train.jsonl")
    val_data = load_jsonl(DATA_DIR / "validation.jsonl")
    
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    
    print(f"📊 Data: {len(train_data):,} train, {len(val_data):,} val, {len(label_map)} labels")
    return train_data, val_data, label_map


def convert_to_multilabel(data, label_map, num_labels):
    processed = []
    for item in data:
        labels = [0.0] * num_labels
        for tool in item.get('selected_tools', []):
            if tool in label_map:
                labels[label_map[tool]] = 1.0
        processed.append({'text': item['query'], 'labels': labels})
    return processed


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    probs = 1 / (1 + np.exp(-logits))
    
    top1_indices = np.argmax(probs, axis=1)
    label_indices = np.argmax(labels, axis=1)
    top1_acc = (top1_indices == label_indices).mean()
    
    top3_indices = np.argsort(probs, axis=1)[:, -3:]
    top3_acc = np.array([label_indices[i] in top3_indices[i] for i in range(len(label_indices))]).mean()
    
    preds = (probs > 0.5).astype(int)
    f1 = f1_score(labels, preds, average='micro', zero_division=0)
    
    return {'f1': f1, 'top1_acc': top1_acc, 'top3_acc': top3_acc}


def train_qwen(device, train_data, val_data, label_map):
    """Train Qwen 0.5B model."""
    MODEL = "Qwen/Qwen2.5-0.5B"
    NUM_LABELS = len(label_map)
    
    print(f"\n🧠 Loading {MODEL}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL,
        num_labels=NUM_LABELS,
        problem_type="multi_label_classification",
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    
    # LoRA
    lora_config = LoraConfig(
        r=16, lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.1, bias="none",
        task_type=TaskType.SEQ_CLS,
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    return model, tokenizer


def train_lfm(device, train_data, val_data, label_map):
    """Train LFM2.5-Base model with custom head."""
    MODEL = "LiquidAI/LFM2.5-1.2B-Base"
    NUM_LABELS = len(label_map)
    
    print(f"\n🧠 Loading {MODEL} with custom head...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    model = LFM2SequenceClassifier(MODEL, NUM_LABELS)
    
    # LoRA on base model
    lora_config = LoraConfig(
        r=16, lora_alpha=32,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.1, bias="none",
        task_type=TaskType.FEATURE_EXTRACTION,
    )
    model.base = get_peft_model(model.base, lora_config)
    model.base.print_trainable_parameters()
    
    return model, tokenizer


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", choices=["qwen", "lfm"], default="qwen",
                       help="Model to train: qwen (0.5B) or lfm (LFM2.5-Base)")
    args = parser.parse_args()
    
    print("=" * 60)
    print(f"🚀 Ferni Router Training (CUDA Optimized)")
    print(f"   Model: {'Qwen 0.5B' if args.model == 'qwen' else 'LFM2.5-Base'}")
    print("=" * 60)
    
    device = setup_device()
    
    # Load data
    train_data, val_data, label_map = load_data()
    NUM_LABELS = len(label_map)
    
    # Convert
    train_processed = convert_to_multilabel(train_data, label_map, NUM_LABELS)
    val_processed = convert_to_multilabel(val_data, label_map, NUM_LABELS)
    
    train_dataset = Dataset.from_list(train_processed)
    val_dataset = Dataset.from_list(val_processed)
    
    # Load model
    if args.model == "qwen":
        model, tokenizer = train_qwen(device, train_data, val_data, label_map)
    else:
        model, tokenizer = train_lfm(device, train_data, val_data, label_map)
    
    model = model.to(device)
    
    # Tokenize
    print(f"\n📝 Tokenizing...")
    def tokenize_fn(examples):
        return tokenizer(examples["text"], padding="max_length", truncation=True, max_length=MAX_LENGTH)
    
    train_dataset = train_dataset.map(tokenize_fn, batched=True)
    val_dataset = val_dataset.map(tokenize_fn, batched=True)
    
    train_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
    val_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
    
    # Training
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
        eval_strategy="steps",
        eval_steps=200,
        save_strategy="steps",
        save_steps=200,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_steps=50,
        report_to="none",
        remove_unused_columns=False,
        fp16=torch.cuda.is_available(),  # Use FP16 on CUDA
        dataloader_num_workers=4,
    )
    
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        compute_metrics=compute_metrics,
    )
    
    print("\n🏋️ Training...")
    trainer.train()
    
    # Evaluate
    print("\n📊 Final evaluation:")
    results = trainer.evaluate()
    print(f"   F1: {results['eval_f1']:.4f}")
    print(f"   Top-1: {results['eval_top1_acc']:.4f}")
    print(f"   Top-3: {results['eval_top3_acc']:.4f}")
    
    # Save
    final_dir = OUTPUT_DIR / "final"
    trainer.save_model(str(final_dir))
    tokenizer.save_pretrained(str(final_dir))
    
    import shutil
    shutil.copy(DATA_DIR / "label_map.json", final_dir / "label_map.json")
    
    print(f"\n✅ Model saved to {final_dir}")


if __name__ == "__main__":
    main()
