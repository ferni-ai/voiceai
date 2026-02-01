#!/usr/bin/env python3
"""
Train hierarchical tool classifier with FULL FINE-TUNING (no LoRA).
This ensures proper model saving without LoRA merge issues.
"""

import json
import torch
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from tqdm import tqdm
from collections import defaultdict

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
TAXONOMY_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-full")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-prod")

MODEL_NAME = "Qwen/Qwen2.5-0.5B"
EPOCHS = 5
BATCH_SIZE = 16
LR = 2e-5
PATIENCE = 2

class ClassificationDataset(Dataset):
    def __init__(self, data, tokenizer, max_len=64):
        self.data = data
        self.tokenizer = tokenizer
        self.max_len = max_len
        
    def __len__(self):
        return len(self.data)
        
    def __getitem__(self, idx):
        item = self.data[idx]
        enc = self.tokenizer(item['query'], truncation=True, max_length=self.max_len, 
                          padding='max_length', return_tensors='pt')
        return {
            'input_ids': enc['input_ids'].squeeze(),
            'attention_mask': enc['attention_mask'].squeeze(),
            'labels': torch.tensor(item['label'], dtype=torch.long)
        }

def train_classifier(name, train_data, val_data, num_labels, output_path):
    """Train and save model with full fine-tuning."""
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    
    print(f"\n{'='*60}")
    print(f"🚀 Training {name} ({num_labels} classes, {len(train_data)} examples)")
    print(f"{'='*60}")
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, num_labels=num_labels, trust_remote_code=True, torch_dtype=torch.float32
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    model.to(device)
    
    train_ds = ClassificationDataset(train_data, tokenizer)
    val_ds = ClassificationDataset(val_data, tokenizer)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=BATCH_SIZE)
    
    optimizer = AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    
    best_acc = 0
    best_model_state = None
    patience_counter = 0
    
    for epoch in range(EPOCHS):
        model.train()
        pbar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS}")
        for batch in pbar:
            optimizer.zero_grad()
            out = model(
                input_ids=batch['input_ids'].to(device),
                attention_mask=batch['attention_mask'].to(device),
                labels=batch['labels'].to(device)
            )
            if not torch.isnan(out.loss):
                out.loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
            pbar.set_postfix({'loss': f"{out.loss.item():.4f}"})
        
        # Validation
        model.eval()
        correct = total = 0
        with torch.no_grad():
            for batch in val_loader:
                out = model(
                    input_ids=batch['input_ids'].to(device),
                    attention_mask=batch['attention_mask'].to(device)
                )
                preds = out.logits.argmax(dim=1)
                correct += (preds == batch['labels'].to(device)).sum().item()
                total += len(batch['labels'])
        
        acc = correct / total if total > 0 else 0
        print(f"📊 Epoch {epoch+1}: acc={acc:.1%}")
        
        if acc > best_acc:
            best_acc = acc
            patience_counter = 0
            best_model_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"⏹️ Early stopping")
                break
    
    # Save best model
    output_path.mkdir(parents=True, exist_ok=True)
    model.load_state_dict(best_model_state)
    model.save_pretrained(output_path, safe_serialization=True)
    tokenizer.save_pretrained(output_path)
    
    print(f"✅ {name} complete! Best accuracy: {best_acc:.1%}")
    return best_acc

def main():
    print("🏗️ Training Hierarchical Classifier (Full Fine-tuning)")
    print("=" * 60)
    
    # Load taxonomy
    with open(TAXONOMY_DIR / "taxonomy_consolidated.json") as f:
        taxonomy = json.load(f)
    
    tool_to_category = taxonomy["tool_to_category"]
    category_to_tools = taxonomy["category_to_tools"]
    categories = sorted([c for c in category_to_tools.keys() if c != "other"])
    
    print(f"📊 {len(categories)} categories, {len(tool_to_category)} tools")
    
    # Load data
    train_raw = [json.loads(l) for l in open(DATA_DIR / "train.jsonl")]
    val_raw = [json.loads(l) for l in open(DATA_DIR / "validation.jsonl")]
    
    # Build Stage 1 data
    cat_map = {c: i for i, c in enumerate(categories)}
    stage1_train, stage1_val = [], []
    
    for item in train_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str): tools = [tools]
        if tools and tools[0] in tool_to_category:
            cat = tool_to_category[tools[0]]
            if cat != "other":
                stage1_train.append({'query': item['query'], 'label': cat_map[cat]})
                
    for item in val_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str): tools = [tools]
        if tools and tools[0] in tool_to_category:
            cat = tool_to_category[tools[0]]
            if cat != "other":
                stage1_val.append({'query': item['query'], 'label': cat_map[cat]})
    
    # Save label map
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_DIR / "stage1" / "label_map.json", "w") as f:
        json.dump({c: i for i, c in enumerate(categories)}, f, indent=2)
    
    # Stage 1
    stage1_acc = train_classifier("Stage 1 (Category)", stage1_train, stage1_val, 
                                   len(categories), OUTPUT_DIR / "stage1")
    
    # Build Stage 2 data
    stage2_train = defaultdict(list)
    stage2_val = defaultdict(list)
    
    for item in train_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str): tools = [tools]
        if tools and tools[0] in tool_to_category:
            cat = tool_to_category[tools[0]]
            if cat != "other":
                stage2_train[cat].append({'query': item['query'], 'tool': tools[0]})
                
    for item in val_raw:
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str): tools = [tools]
        if tools and tools[0] in tool_to_category:
            cat = tool_to_category[tools[0]]
            if cat != "other":
                stage2_val[cat].append({'query': item['query'], 'tool': tools[0]})
    
    # Stage 2
    stage2_accs = {}
    for category in categories:
        train_data = stage2_train[category]
        val_data = stage2_val[category]
        if len(train_data) < 10:
            print(f"⏭️ Skipping {category} (only {len(train_data)} examples)")
            continue
        
        # Get tools for this category and create label map
        tools_in_train = sorted(set(d['tool'] for d in train_data))
        if len(tools_in_train) < 2:
            print(f"⏭️ Skipping {category} (only {len(tools_in_train)} tools)")
            continue
            
        tool_map = {t: i for i, t in enumerate(tools_in_train)}
        
        # Convert to labeled format
        train_labeled = [{'query': d['query'], 'label': tool_map[d['tool']]} 
                         for d in train_data if d['tool'] in tool_map]
        val_labeled = [{'query': d['query'], 'label': tool_map[d['tool']]} 
                       for d in val_data if d['tool'] in tool_map]
        
        # Save label map
        stage2_output = OUTPUT_DIR / "stage2" / category
        stage2_output.mkdir(parents=True, exist_ok=True)
        with open(stage2_output / "label_map.json", "w") as f:
            json.dump(tool_map, f, indent=2)
            
        acc = train_classifier(f"Stage 2 ({category})", train_labeled, val_labeled,
                               len(tool_map), stage2_output)
        stage2_accs[category] = acc
    
    # Summary
    print("\n" + "=" * 60)
    print("🎉 TRAINING COMPLETE")
    print("=" * 60)
    print(f"Stage 1 accuracy: {stage1_acc:.1%}")
    print(f"Stage 2 average: {sum(stage2_accs.values())/len(stage2_accs):.1%}")
    combined = stage1_acc * (sum(stage2_accs.values())/len(stage2_accs))
    print(f"Combined estimate: {combined:.1%}")
    
    # Copy taxonomy
    import shutil
    shutil.copy(TAXONOMY_DIR / "taxonomy_consolidated.json", OUTPUT_DIR / "taxonomy.json")
    with open(OUTPUT_DIR / "category_to_tools.json", "w") as f:
        json.dump(category_to_tools, f, indent=2)
    
    # Save results
    with open(OUTPUT_DIR / "training_results.json", "w") as f:
        json.dump({
            "stage1_accuracy": stage1_acc, 
            "stage2_accuracies": stage2_accs, 
            "combined_estimate": combined
        }, f, indent=2)
    
    print(f"\n💾 Models saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
