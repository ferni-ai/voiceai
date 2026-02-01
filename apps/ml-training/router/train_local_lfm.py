#!/usr/bin/env python3
"""Train Ferni Tool Router with Liquid AI LFM2.5-1.2B locally on Apple Silicon (MPS)"""

import json
import torch
import torch.nn as nn
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from transformers import AutoTokenizer, AutoModel
from peft import LoraConfig, get_peft_model, TaskType
from tqdm import tqdm

# Paths
DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-lfm")

# Config
MODEL_NAME = "LiquidAI/LFM2.5-1.2B-Base"  # Liquid AI model
EPOCHS = 3
BATCH_SIZE = 8  # Smaller for 1.2B model
LR = 3e-5
MAX_LEN = 64

class LFMClassifier(nn.Module):
    """Custom classifier head for LFM (doesn't have built-in sequence classification)"""
    def __init__(self, base_model, num_labels, hidden_size):
        super().__init__()
        self.base = base_model
        self.dropout = nn.Dropout(0.1)
        self.classifier = nn.Linear(hidden_size, num_labels)
        
    def forward(self, input_ids, attention_mask=None, labels=None):
        outputs = self.base(input_ids=input_ids, attention_mask=attention_mask, return_dict=True)
        
        # Pool last token (like GPT-style models)
        hidden = outputs.last_hidden_state
        if attention_mask is not None:
            # Get position of last non-pad token
            seq_lens = attention_mask.sum(dim=1) - 1
            batch_idx = torch.arange(hidden.size(0), device=hidden.device)
            pooled = hidden[batch_idx, seq_lens]
        else:
            pooled = hidden[:, -1]
        
        pooled = self.dropout(pooled)
        logits = self.classifier(pooled)
        
        loss = None
        if labels is not None:
            loss_fn = nn.BCEWithLogitsLoss()
            loss = loss_fn(logits, labels)
        
        return type('Output', (), {'loss': loss, 'logits': logits})()

def main():
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
    print("📥 Loading Liquid LFM2.5-1.2B tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Model
    print("📥 Loading Liquid LFM2.5-1.2B model (this may take a minute)...")
    base_model = AutoModel.from_pretrained(
        MODEL_NAME,
        trust_remote_code=True,
        torch_dtype=torch.float32,
    )
    
    # Get hidden size from config
    hidden_size = base_model.config.hidden_size
    print(f"   Hidden size: {hidden_size}")
    
    # Wrap with classifier
    model = LFMClassifier(base_model, num_labels, hidden_size)
    
    # LoRA on base model
    lora_config = LoraConfig(
        r=8,
        lora_alpha=16,
        lora_dropout=0.05,
        target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
        bias="none",
    )
    model.base = get_peft_model(model.base, lora_config)
    model.base.print_trainable_parameters()
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
    
    print(f"\n🚀 Training Liquid LFM for {EPOCHS} epochs...")
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
            
            out = model(input_ids=ids, attention_mask=mask, labels=labels)
            loss = out.loss
            
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
    
    # Save base model with LoRA
    model.base.save_pretrained(OUTPUT_DIR / "base_lora")
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    # Save classifier head
    torch.save(model.classifier.state_dict(), OUTPUT_DIR / "classifier.pt")
    
    import shutil
    shutil.copy(DATA_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")
    
    with open(OUTPUT_DIR / "history.json", 'w') as f:
        json.dump(history, f, indent=2)
    
    with open(OUTPUT_DIR / "config.json", 'w') as f:
        json.dump({
            'base_model': MODEL_NAME,
            'hidden_size': hidden_size,
            'num_labels': num_labels,
        }, f, indent=2)
    
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
    
    print(f"\n✅ Done! LFM model saved to {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
