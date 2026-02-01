#!/usr/bin/env python3
"""Train Ferni Tool Router locally on Apple Silicon (MPS)"""

import json
import torch
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from peft import LoraConfig, get_peft_model, TaskType
from tqdm import tqdm

# Paths
DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-qwen-v3")

# Config
MODEL_NAME = "Qwen/Qwen2.5-0.5B"
EPOCHS = 3
BATCH_SIZE = 16  # Smaller batch for MPS memory
LR = 5e-5
MAX_LEN = 64

def main():
    # Device
    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    print(f"🖥️ Device: {device}")
    
    # Load data
    print("📚 Loading data...")
    with open(DATA_DIR / "label_map.json") as f:
        label_map = json.load(f)
    num_labels = len(label_map)
    print(f"   {num_labels} tool labels")
    
    train_data = [json.loads(l) for l in open(DATA_DIR / "train.jsonl")]
    val_data = [json.loads(l) for l in open(DATA_DIR / "validation.jsonl")]
    print(f"   Train: {len(train_data)}, Val: {len(val_data)}")
    
    # Tokenizer
    print("📥 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    
    # Model
    print("📥 Loading model...")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=num_labels,
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    
    # LoRA
    lora_config = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        target_modules=["q_proj", "v_proj"],
        bias="none",
        task_type=TaskType.SEQ_CLS,
        modules_to_save=["score"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    model.to(device)
    
    # Dataset
    class ToolDataset(Dataset):
        def __init__(self, data):
            self.data = data
            
        def __len__(self):
            return len(self.data)
            
        def __getitem__(self, idx):
            item = self.data[idx]
            query = item['query']
            tools = item.get('selected_tools', item.get('tools', []))
            if isinstance(tools, str):
                tools = [tools]
            
            enc = tokenizer(query, truncation=True, max_length=MAX_LEN, 
                          padding='max_length', return_tensors='pt')
            
            labels = np.zeros(num_labels, dtype=np.float32)
            for t in tools:
                if t in label_map:
                    labels[label_map[t]] = 1.0
            
            return {
                'input_ids': enc['input_ids'].squeeze(),
                'attention_mask': enc['attention_mask'].squeeze(),
                'labels': torch.tensor(labels, dtype=torch.float32)
            }
    
    train_loader = DataLoader(ToolDataset(train_data), batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(ToolDataset(val_data), batch_size=BATCH_SIZE)
    
    # Training
    optimizer = AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    loss_fn = torch.nn.BCEWithLogitsLoss()
    
    print(f"\n🚀 Training {EPOCHS} epochs...")
    history = []
    
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
            
            if torch.isnan(loss):
                continue
                
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 0.5)
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
                
                for i in range(len(preds)):
                    if labels[i, preds[i]] > 0.5:
                        correct += 1
                    total += 1
        
        acc = correct / total
        avg_loss = total_loss / len(train_loader)
        history.append({'epoch': epoch+1, 'loss': avg_loss, 'acc': acc})
        print(f"📊 Epoch {epoch+1}: loss={avg_loss:.4f}, acc={acc:.1%}")
    
    # Save
    print(f"\n💾 Saving to {OUTPUT_DIR}...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    import shutil
    shutil.copy(DATA_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")
    
    with open(OUTPUT_DIR / "history.json", 'w') as f:
        json.dump(history, f, indent=2)
    
    # Test
    print("\n🧪 Testing:")
    id_to_label = {v: k for k, v in label_map.items()}
    tests = ["play jazz", "weather", "set timer", "turn off lights", "feeling stressed"]
    
    model.eval()
    for q in tests:
        enc = tokenizer(q, return_tensors='pt', truncation=True, max_length=MAX_LEN)
        enc = {k: v.to(device) for k, v in enc.items()}
        
        with torch.no_grad():
            out = model(**enc)
            probs = torch.sigmoid(out.logits[0])
            top = torch.topk(probs, 3)
        
        print(f"\n'{q}'")
        for s, i in zip(top.values.tolist(), top.indices.tolist()):
            marker = "🟢" if s > 0.5 else "🟡" if s > 0.2 else "⚪"
            print(f"  {marker} {id_to_label[i]}: {s:.1%}")
    
    print(f"\n✅ Done! Model saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
