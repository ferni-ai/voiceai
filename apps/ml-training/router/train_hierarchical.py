#!/usr/bin/env python3
"""
Train hierarchical tool classifier:
  Stage 1: Query → Category (14 categories)
  Stage 2: Query + Category → Tool (per-category classifiers)
"""

import json
import torch
import torch.nn as nn
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import LoraConfig, get_peft_model, TaskType
from tqdm import tqdm
from collections import defaultdict

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
TAXONOMY_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-full")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-qwen")

MODEL_NAME = "Qwen/Qwen2.5-0.5B"
EPOCHS = 5
BATCH_SIZE = 16
LR = 5e-5
PATIENCE = 2

class ClassificationDataset(Dataset):
    def __init__(self, data, tokenizer, label_map, max_len=64):
        self.data = data
        self.tokenizer = tokenizer
        self.label_map = label_map
        self.num_labels = len(label_map)
        self.max_len = max_len
        
    def __len__(self):
        return len(self.data)
        
    def __getitem__(self, idx):
        item = self.data[idx]
        query = item['query']
        label = item['label']
        
        enc = self.tokenizer(query, truncation=True, max_length=self.max_len, 
                          padding='max_length', return_tensors='pt')
        
        return {
            'input_ids': enc['input_ids'].squeeze(),
            'attention_mask': enc['attention_mask'].squeeze(),
            'labels': torch.tensor(self.label_map[label], dtype=torch.long)
        }

def train_classifier(name, train_data, val_data, label_map, output_path):
    """Train a single classifier (Stage 1 or Stage 2)."""
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    num_labels = len(label_map)
    
    print(f"\n{'='*60}")
    print(f"🚀 Training {name} ({num_labels} classes, {len(train_data)} examples)")
    print(f"{'='*60}")
    
    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    
    # Model
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, num_labels=num_labels, trust_remote_code=True, torch_dtype=torch.float32
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    
    # LoRA
    lora_config = LoraConfig(
        r=8, lora_alpha=16, lora_dropout=0.05,
        target_modules=["q_proj", "v_proj"],
        bias="none", task_type=TaskType.SEQ_CLS, modules_to_save=["score"],
    )
    model = get_peft_model(model, lora_config)
    model.to(device)
    
    # Data
    train_ds = ClassificationDataset(train_data, tokenizer, label_map)
    val_ds = ClassificationDataset(val_data, tokenizer, label_map)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE)
    
    # Training
    optimizer = AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    loss_fn = nn.CrossEntropyLoss()
    
    best_acc = 0
    patience_counter = 0
    
    for epoch in range(EPOCHS):
        model.train()
        total_loss = 0
        
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS}")
        for batch in pbar:
            optimizer.zero_grad()
            ids = batch['input_ids'].to(device)
            mask = batch['attention_mask'].to(device)
            labels = batch['labels'].to(device)
            
            out = model(input_ids=ids, attention_mask=mask)
            loss = loss_fn(out.logits, labels)
            
            if not torch.isnan(loss):
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                total_loss += loss.item()
            
            pbar.set_postfix({'loss': f"{loss.item():.4f}"})
        
        # Validation
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for batch in val_loader:
                ids = batch['input_ids'].to(device)
                mask = batch['attention_mask'].to(device)
                labels = batch['labels'].to(device)
                out = model(input_ids=ids, attention_mask=mask)
                preds = out.logits.argmax(dim=1)
                correct += (preds == labels).sum().item()
                total += len(labels)
        
        acc = correct / total if total > 0 else 0
        print(f"📊 Epoch {epoch+1}: acc={acc:.1%}")
        
        if acc > best_acc:
            best_acc = acc
            patience_counter = 0
            output_path.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(output_path)
            tokenizer.save_pretrained(output_path)
            with open(output_path / "label_map.json", "w") as f:
                json.dump(label_map, f, indent=2)
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"⏹️ Early stopping")
                break
    
    print(f"✅ {name} complete! Best accuracy: {best_acc:.1%}")
    return best_acc

def main():
    print("🏗️ Building Hierarchical Tool Classifier")
    print("=" * 60)
    
    # Load taxonomy
    with open(TAXONOMY_DIR / "taxonomy_consolidated.json") as f:
        taxonomy = json.load(f)
    
    tool_to_category = taxonomy["tool_to_category"]
    category_to_tools = taxonomy["category_to_tools"]
    categories = list(category_to_tools.keys())
    
    print(f"📊 {len(categories)} categories, {len(tool_to_category)} tools")
    
    # Load training data
    train_raw = [json.loads(l) for l in open(DATA_DIR / "train.jsonl")]
    val_raw = [json.loads(l) for l in open(DATA_DIR / "validation.jsonl")]
    
    # Build Stage 1 data (query → category)
    stage1_train = []
    stage1_val = []
    
    for item in train_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str):
            tools = [tools]
        if tools and tools[0] in tool_to_category:
            stage1_train.append({
                'query': item['query'],
                'label': tool_to_category[tools[0]]
            })
    
    for item in val_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str):
            tools = [tools]
        if tools and tools[0] in tool_to_category:
            stage1_val.append({
                'query': item['query'],
                'label': tool_to_category[tools[0]]
            })
    
    # Stage 1: Category classifier
    category_label_map = {cat: i for i, cat in enumerate(sorted(categories))}
    stage1_acc = train_classifier(
        "Stage 1 (Category)",
        stage1_train,
        stage1_val,
        category_label_map,
        OUTPUT_DIR / "stage1"
    )
    
    # Build Stage 2 data (per-category tool classifiers)
    stage2_train = defaultdict(list)
    stage2_val = defaultdict(list)
    
    for item in train_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str):
            tools = [tools]
        if tools and tools[0] in tool_to_category:
            tool = tools[0]
            category = tool_to_category[tool]
            stage2_train[category].append({
                'query': item['query'],
                'label': tool
            })
    
    for item in val_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str):
            tools = [tools]
        if tools and tools[0] in tool_to_category:
            tool = tools[0]
            category = tool_to_category[tool]
            stage2_val[category].append({
                'query': item['query'],
                'label': tool
            })
    
    # Stage 2: Per-category tool classifiers
    stage2_accs = {}
    for category in sorted(categories):
        if category == "other":
            continue
            
        train_data = stage2_train[category]
        val_data = stage2_val[category]
        
        if len(train_data) < 10:
            print(f"⏭️ Skipping {category} (only {len(train_data)} examples)")
            continue
        
        tools_in_category = category_to_tools[category]
        tool_label_map = {tool: i for i, tool in enumerate(sorted(tools_in_category))}
        
        acc = train_classifier(
            f"Stage 2 ({category})",
            train_data,
            val_data,
            tool_label_map,
            OUTPUT_DIR / "stage2" / category
        )
        stage2_accs[category] = acc
    
    # Summary
    print("\n" + "=" * 60)
    print("🎉 TRAINING COMPLETE")
    print("=" * 60)
    print(f"Stage 1 accuracy: {stage1_acc:.1%}")
    print(f"Stage 2 average: {sum(stage2_accs.values())/len(stage2_accs):.1%}")
    
    combined = stage1_acc * (sum(stage2_accs.values())/len(stage2_accs))
    print(f"Combined estimate: {combined:.1%}")
    
    # Save summary
    summary = {
        "stage1_accuracy": stage1_acc,
        "stage2_accuracies": stage2_accs,
        "combined_estimate": combined,
    }
    with open(OUTPUT_DIR / "training_results.json", "w") as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n💾 Results saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
