#!/usr/bin/env python3
"""
Ferni Router Training - LFM2.5 with Custom Classification Head

LFM2.5 doesn't support AutoModelForSequenceClassification directly,
so we use AutoModel + custom classification head.

Key advantages:
- 57% BFCLv3 tool use benchmark (state-of-the-art)
- <1GB memory footprint
- Specifically designed for reasoning and tool use

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  python train_lfm_custom.py
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
    TrainingArguments,
    Trainer,
)
from peft import LoraConfig, get_peft_model, TaskType
from sklearn.metrics import f1_score
import numpy as np

# ==============================================================================
# CONFIG
# ==============================================================================

# Use LFM2.5-Base (not Thinking) for fine-tuning
BASE_MODEL = "LiquidAI/LFM2.5-1.2B-Base"

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
OUTPUT_DIR = Path("outputs/ferni-router-lfm")
ONNX_OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-lfm")

# LoRA config
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.1

# Training config
MAX_LENGTH = 128
BATCH_SIZE = 8
GRADIENT_ACCUMULATION = 4
EPOCHS = 1
LEARNING_RATE = 3e-5

os.environ["PYTORCH_MPS_HIGH_WATERMARK_RATIO"] = "0.0"


class LFM2SequenceClassifier(nn.Module):
    """Custom sequence classifier using LFM2.5 base model."""
    
    def __init__(self, base_model_name: str, num_labels: int, dropout: float = 0.1):
        super().__init__()
        self.num_labels = num_labels
        
        # Load base model
        self.base = AutoModel.from_pretrained(
            base_model_name,
            trust_remote_code=True,
        )
        
        hidden_size = self.base.config.hidden_size
        
        # Classification head
        self.dropout = nn.Dropout(dropout)
        self.classifier = nn.Linear(hidden_size, num_labels)
        
        # Initialize classifier weights
        nn.init.xavier_uniform_(self.classifier.weight)
        nn.init.zeros_(self.classifier.bias)
    
    def forward(self, input_ids, attention_mask=None, labels=None):
        # Get base model outputs
        outputs = self.base(
            input_ids=input_ids,
            attention_mask=attention_mask,
            return_dict=True,
        )
        
        # Pool: use last token (like GPT) or mean pooling
        # For decoder-only models, last token is usually best
        hidden_states = outputs.last_hidden_state
        
        # Get the last non-padding token for each sequence
        if attention_mask is not None:
            # Find position of last real token
            seq_lengths = attention_mask.sum(dim=1) - 1
            batch_size = hidden_states.size(0)
            pooled = hidden_states[torch.arange(batch_size, device=hidden_states.device), seq_lengths]
        else:
            # Use last token
            pooled = hidden_states[:, -1, :]
        
        # Classification
        pooled = self.dropout(pooled)
        logits = self.classifier(pooled)
        
        # Compute loss
        loss = None
        if labels is not None:
            # Multi-label classification with BCE
            loss_fct = nn.BCEWithLogitsLoss()
            loss = loss_fct(logits, labels.float())
        
        return {"loss": loss, "logits": logits}


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
    print("🧪 Ferni Router Training (LFM2.5 Custom Head)")
    print("   State-of-the-art 2026 model for tool use")
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
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Load model with custom head
    print(f"\n🧠 Loading LFM2.5 with custom classification head...")
    model = LFM2SequenceClassifier(BASE_MODEL, NUM_LABELS)
    
    params = sum(p.numel() for p in model.parameters())
    print(f"   Total parameters: {params:,} ({params/1e9:.2f}B)")
    
    # Add LoRA to base model
    print(f"\n🔧 Adding LoRA (r={LORA_R}, alpha={LORA_ALPHA})")
    
    # Find target modules (LFM2.5 uses different naming)
    target_modules = []
    for name, _ in model.base.named_modules():
        if any(t in name for t in ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]):
            # Get the last part of the name
            target_modules.append(name.split(".")[-1])
    
    target_modules = list(set(target_modules))
    print(f"   Target modules: {target_modules}")
    
    lora_config = LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        target_modules=target_modules if target_modules else ["q_proj", "v_proj"],
        lora_dropout=LORA_DROPOUT,
        bias="none",
        task_type=TaskType.FEATURE_EXTRACTION,  # Not SEQ_CLS since we have custom head
    )
    
    # Apply LoRA to base model only
    model.base = get_peft_model(model.base, lora_config)
    model.base.print_trainable_parameters()
    
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
    
    steps_per_epoch = len(train_dataset) // (BATCH_SIZE * GRADIENT_ACCUMULATION)
    
    print(f"\n📊 Training plan:")
    print(f"   Steps/epoch: {steps_per_epoch}")
    print(f"   Est. time: ~{steps_per_epoch * EPOCHS * 5 / 60:.0f} minutes")
    
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
        report_to="none",
        remove_unused_columns=False,
        dataloader_pin_memory=False,
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
    print("🏋️ Training LFM2.5 + Custom Head...")
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
    final_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the full model
    torch.save(model.state_dict(), final_dir / "model.pt")
    tokenizer.save_pretrained(str(final_dir))
    
    import shutil
    shutil.copy(DATA_DIR / "label_map.json", final_dir / "label_map.json")
    
    # Save config
    config = {
        "base_model": BASE_MODEL,
        "num_labels": NUM_LABELS,
        "hidden_size": model.base.config.hidden_size,
        "lora_r": LORA_R,
        "lora_alpha": LORA_ALPHA,
    }
    with open(final_dir / "config.json", 'w') as f:
        json.dump(config, f, indent=2)
    
    print(f"\n✅ Model saved to {final_dir}")
    
    print("\n" + "=" * 60)
    print("✅ LFM2.5 TRAINING COMPLETE!")
    print(f"   Output: {final_dir}")
    print("   Note: ONNX export requires custom handling for this architecture")
    print("=" * 60)


if __name__ == "__main__":
    main()
