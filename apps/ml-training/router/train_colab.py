#!/usr/bin/env python3
"""
Ferni Router Model Training - Google Colab Version

Upload this file to Google Colab and run with GPU runtime.
Upload data/ folder contents alongside this script.

Steps:
1. Open Google Colab (colab.research.google.com)
2. Runtime > Change runtime type > T4 GPU
3. Upload this script and data files
4. Run all cells

Data files needed:
- data/train.jsonl
- data/validation.jsonl  
- data/test.jsonl
- data/label_map.json
"""

# ==============================================================================
# CELL 1: Install Dependencies
# ==============================================================================
# !pip install -q transformers peft datasets accelerate bitsandbytes
# !pip install -q tensorboard scikit-learn

# ==============================================================================
# CELL 2: Imports & Config
# ==============================================================================
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
from sklearn.metrics import f1_score, accuracy_score
import numpy as np

# ==============================================================================
# CONFIG
# ==============================================================================
BASE_MODEL = "Qwen/Qwen2.5-1.5B"
DATA_DIR = Path("data")  # Upload data folder here
OUTPUT_DIR = Path("outputs/ferni-router")
ONNX_OUTPUT = Path("models/ferni-router-1069/model.onnx")

# LoRA config
LORA_R = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.1

# Training config
MAX_LENGTH = 512
BATCH_SIZE = 8  # Reduce if OOM
EPOCHS = 3
LEARNING_RATE = 2e-5

# ==============================================================================
# CELL 3: Load Data
# ==============================================================================
def load_jsonl(path):
    """Load JSONL file into list of dicts."""
    with open(path, 'r') as f:
        return [json.loads(line) for line in f]

def load_data():
    """Load training data."""
    train_data = load_jsonl(DATA_DIR / "train.jsonl")
    val_data = load_jsonl(DATA_DIR / "validation.jsonl")
    test_data = load_jsonl(DATA_DIR / "test.jsonl")
    
    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)
    
    print(f"Train: {len(train_data)}, Val: {len(val_data)}, Test: {len(test_data)}")
    print(f"Labels: {len(label_map)}")
    
    return train_data, val_data, test_data, label_map

train_data, val_data, test_data, label_map = load_data()
NUM_LABELS = len(label_map)
print(f"\n✅ Loaded {NUM_LABELS} tool labels")

# ==============================================================================
# CELL 4: Prepare Dataset
# ==============================================================================
def convert_to_multilabel(data, label_map, num_labels):
    """Convert data to multi-label format."""
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

train_processed = convert_to_multilabel(train_data, label_map, NUM_LABELS)
val_processed = convert_to_multilabel(val_data, label_map, NUM_LABELS)

train_dataset = Dataset.from_list(train_processed)
val_dataset = Dataset.from_list(val_processed)

print(f"Train dataset: {len(train_dataset)}")
print(f"Val dataset: {len(val_dataset)}")

# ==============================================================================
# CELL 5: Load Model & Tokenizer
# ==============================================================================
print(f"Loading {BASE_MODEL}...")

tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL,
    num_labels=NUM_LABELS,
    problem_type="multi_label_classification",
    trust_remote_code=True,
    torch_dtype=torch.float16,
    device_map="auto",
)
model.config.pad_token_id = tokenizer.pad_token_id

print(f"✅ Model loaded: {sum(p.numel() for p in model.parameters()):,} parameters")

# ==============================================================================
# CELL 6: Add LoRA
# ==============================================================================
lora_config = LoraConfig(
    r=LORA_R,
    lora_alpha=LORA_ALPHA,
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    lora_dropout=LORA_DROPOUT,
    bias="none",
    task_type=TaskType.SEQ_CLS,
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()

# ==============================================================================
# CELL 7: Tokenize
# ==============================================================================
def tokenize_function(examples):
    return tokenizer(
        examples["text"],
        padding="max_length",
        truncation=True,
        max_length=MAX_LENGTH,
    )

train_dataset = train_dataset.map(tokenize_function, batched=True)
val_dataset = val_dataset.map(tokenize_function, batched=True)

train_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])
val_dataset.set_format("torch", columns=["input_ids", "attention_mask", "labels"])

# ==============================================================================
# CELL 8: Metrics
# ==============================================================================
def compute_metrics(eval_pred):
    """Compute F1 and accuracy."""
    logits, labels = eval_pred
    probs = 1 / (1 + np.exp(-logits))  # Sigmoid
    preds = (probs > 0.5).astype(int)
    
    # Top-1 accuracy (correct tool is highest prediction)
    top1_indices = np.argmax(probs, axis=1)
    label_indices = np.argmax(labels, axis=1)
    top1_acc = (top1_indices == label_indices).mean()
    
    # Top-3 accuracy
    top3_indices = np.argsort(probs, axis=1)[:, -3:]
    top3_acc = np.array([label_indices[i] in top3_indices[i] for i in range(len(label_indices))]).mean()
    
    # F1 score
    f1 = f1_score(labels, preds, average='micro', zero_division=0)
    
    return {
        'f1': f1,
        'top1_acc': top1_acc,
        'top3_acc': top3_acc,
    }

# ==============================================================================
# CELL 9: Training Arguments
# ==============================================================================
training_args = TrainingArguments(
    output_dir=str(OUTPUT_DIR),
    num_train_epochs=EPOCHS,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE * 2,
    gradient_accumulation_steps=4,
    learning_rate=LEARNING_RATE,
    warmup_ratio=0.1,
    weight_decay=0.01,
    fp16=True,
    evaluation_strategy="steps",
    eval_steps=100,
    save_strategy="steps",
    save_steps=200,
    save_total_limit=3,
    load_best_model_at_end=True,
    metric_for_best_model="f1",
    greater_is_better=True,
    logging_dir=str(OUTPUT_DIR / "logs"),
    logging_steps=50,
    report_to="tensorboard",
    remove_unused_columns=False,
)

# ==============================================================================
# CELL 10: Train!
# ==============================================================================
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    compute_metrics=compute_metrics,
    callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
)

print("🚀 Starting training...")
trainer.train()

# ==============================================================================
# CELL 11: Evaluate
# ==============================================================================
print("\n📊 Final evaluation:")
results = trainer.evaluate()
print(f"F1 Score: {results['eval_f1']:.4f}")
print(f"Top-1 Accuracy: {results['eval_top1_acc']:.4f}")
print(f"Top-3 Accuracy: {results['eval_top3_acc']:.4f}")

# ==============================================================================
# CELL 12: Save Model
# ==============================================================================
final_dir = OUTPUT_DIR / "final"
trainer.save_model(str(final_dir))
tokenizer.save_pretrained(str(final_dir))

# Save label map alongside model
import shutil
shutil.copy(DATA_DIR / "label_map.json", final_dir / "label_map.json")

print(f"\n✅ Model saved to {final_dir}")

# ==============================================================================
# CELL 13: Export to ONNX
# ==============================================================================
print("\n📦 Exporting to ONNX...")

from optimum.onnxruntime import ORTModelForSequenceClassification

# Merge LoRA weights
merged_model = model.merge_and_unload()
merged_dir = OUTPUT_DIR / "merged"
merged_model.save_pretrained(str(merged_dir))
tokenizer.save_pretrained(str(merged_dir))

# Export to ONNX
ONNX_OUTPUT.parent.mkdir(parents=True, exist_ok=True)

ort_model = ORTModelForSequenceClassification.from_pretrained(
    str(merged_dir),
    export=True,
)
ort_model.save_pretrained(str(ONNX_OUTPUT.parent))

# Copy label map
shutil.copy(DATA_DIR / "label_map.json", ONNX_OUTPUT.parent / "label_map.json")

print(f"\n✅ ONNX model saved to {ONNX_OUTPUT.parent}")
print("\nDownload the 'models/ferni-router-1069/' folder and copy to your voiceai repo!")

# ==============================================================================
# CELL 14: Test Inference
# ==============================================================================
print("\n🧪 Quick inference test...")

import onnxruntime as ort

# Load label map for decoding
with open(ONNX_OUTPUT.parent / "label_map.json", 'r') as f:
    label_map = json.load(f)
reverse_map = {v: k for k, v in label_map.items()}

# Load ONNX model
session = ort.InferenceSession(
    str(ONNX_OUTPUT.parent / "model.onnx"),
    providers=["CPUExecutionProvider"]
)

# Test queries
test_queries = [
    "play some jazz music",
    "what's the weather like",
    "help me with my habits",
    "transfer me to Maya",
    "I'm feeling anxious",
]

for query in test_queries:
    inputs = tokenizer(query, return_tensors="np", padding="max_length", max_length=512, truncation=True)
    outputs = session.run(None, {
        "input_ids": inputs["input_ids"],
        "attention_mask": inputs["attention_mask"],
    })
    
    logits = outputs[0][0]
    probs = 1 / (1 + np.exp(-logits))
    top_indices = np.argsort(probs)[::-1][:3]
    
    print(f"\n📝 '{query}'")
    for i, idx in enumerate(top_indices):
        tool_name = reverse_map.get(idx, f"unknown_{idx}")
        print(f"   {i+1}. {tool_name}: {probs[idx]:.3f}")

print("\n✅ Training complete! Download the model folder and deploy.")
