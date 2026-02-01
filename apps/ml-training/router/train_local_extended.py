#!/usr/bin/env python3
"""Extended training: 15 epochs with early stopping for both Qwen and LFM"""

import json
import torch
import torch.nn as nn
import numpy as np
from pathlib import Path
from torch.utils.data import Dataset, DataLoader
from torch.optim import AdamW
from torch.optim.lr_scheduler import CosineAnnealingLR
from transformers import AutoTokenizer, AutoModelForSequenceClassification, AutoModel
from peft import LoraConfig, get_peft_model, TaskType
from tqdm import tqdm
import sys

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
EPOCHS = 15
PATIENCE = 3  # Early stopping patience

class ToolDataset(Dataset):
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
        tools = item.get('selected_tools', item.get('tools', []))
        if isinstance(tools, str):
            tools = [tools]
        
        enc = self.tokenizer(query, truncation=True, max_length=self.max_len, 
                          padding='max_length', return_tensors='pt')
        
        labels = np.zeros(self.num_labels, dtype=np.float32)
        for t in tools:
            if t in self.label_map:
                labels[self.label_map[t]] = 1.0
        
        return {
            'input_ids': enc['input_ids'].squeeze(),
            'attention_mask': enc['attention_mask'].squeeze(),
            'labels': torch.tensor(labels, dtype=torch.float32)
        }

def train_qwen():
    """Train Qwen with extended epochs"""
    OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-qwen-v4")
    MODEL_NAME = "Qwen/Qwen2.5-0.5B"
    BATCH_SIZE = 16
    LR = 3e-5
    
    device = torch.device("mps")
    print(f"🚀 Training Qwen 2.5 0.5B - {EPOCHS} epochs")
    
    # Load data
    with open(DATA_DIR / "label_map.json") as f:
        label_map = json.load(f)
    train_data = [json.loads(l) for l in open(DATA_DIR / "train.jsonl")]
    val_data = [json.loads(l) for l in open(DATA_DIR / "validation.jsonl")]
    
    # Model
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, num_labels=len(label_map), trust_remote_code=True, torch_dtype=torch.float32
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    
    lora_config = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.1,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        bias="none", task_type=TaskType.SEQ_CLS, modules_to_save=["score"],
    )
    model = get_peft_model(model, lora_config)
    model.to(device)
    
    # Data
    train_loader = DataLoader(ToolDataset(train_data, tokenizer, label_map), batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(ToolDataset(val_data, tokenizer, label_map), batch_size=BATCH_SIZE)
    
    # Training
    optimizer = AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    scheduler = CosineAnnealingLR(optimizer, T_max=EPOCHS)
    loss_fn = nn.BCEWithLogitsLoss()
    
    best_acc = 0
    patience_counter = 0
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
            
            if not torch.isnan(loss):
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                total_loss += loss.item()
            
            pbar.set_postfix({'loss': f"{loss.item():.4f}"})
        
        scheduler.step()
        
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
        
        # Early stopping
        if acc > best_acc:
            best_acc = acc
            patience_counter = 0
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(OUTPUT_DIR)
            tokenizer.save_pretrained(OUTPUT_DIR)
            print(f"   💾 New best: {acc:.1%}")
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"⏹️ Early stopping at epoch {epoch+1}")
                break
    
    # Save final
    import shutil
    shutil.copy(DATA_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")
    with open(OUTPUT_DIR / "history.json", 'w') as f:
        json.dump(history, f, indent=2)
    
    print(f"\n✅ Qwen done! Best accuracy: {best_acc:.1%}")
    return best_acc

def train_lfm():
    """Train LFM with extended epochs"""
    OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ferni-router-lfm-v2")
    MODEL_NAME = "LiquidAI/LFM2.5-1.2B-Base"
    BATCH_SIZE = 8
    LR = 2e-5
    
    device = torch.device("mps")
    print(f"\n🚀 Training Liquid LFM 1.2B - {EPOCHS} epochs")
    
    # Load data
    with open(DATA_DIR / "label_map.json") as f:
        label_map = json.load(f)
    train_data = [json.loads(l) for l in open(DATA_DIR / "train.jsonl")]
    val_data = [json.loads(l) for l in open(DATA_DIR / "validation.jsonl")]
    
    # Model
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token
    
    base = AutoModel.from_pretrained(MODEL_NAME, trust_remote_code=True, torch_dtype=torch.float32)
    hidden_size = base.config.hidden_size
    
    # Custom classifier
    class LFMClassifier(nn.Module):
        def __init__(self, base_model, num_labels, hidden_size):
            super().__init__()
            self.base = base_model
            self.dropout = nn.Dropout(0.1)
            self.classifier = nn.Linear(hidden_size, num_labels)
            
        def forward(self, input_ids, attention_mask=None, labels=None):
            outputs = self.base(input_ids=input_ids, attention_mask=attention_mask, return_dict=True)
            hidden = outputs.last_hidden_state
            if attention_mask is not None:
                seq_lens = attention_mask.sum(dim=1) - 1
                batch_idx = torch.arange(hidden.size(0), device=hidden.device)
                pooled = hidden[batch_idx, seq_lens]
            else:
                pooled = hidden[:, -1]
            pooled = self.dropout(pooled)
            logits = self.classifier(pooled)
            loss = None
            if labels is not None:
                loss = nn.BCEWithLogitsLoss()(logits, labels)
            return type('O', (), {'loss': loss, 'logits': logits})()
    
    lora_config = LoraConfig(
        r=16, lora_alpha=32, lora_dropout=0.1,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        bias="none",
    )
    base = get_peft_model(base, lora_config)
    model = LFMClassifier(base, len(label_map), hidden_size)
    model.to(device)
    
    # Data
    train_loader = DataLoader(ToolDataset(train_data, tokenizer, label_map), batch_size=BATCH_SIZE, shuffle=True)
    val_loader = DataLoader(ToolDataset(val_data, tokenizer, label_map), batch_size=BATCH_SIZE)
    
    # Training
    optimizer = AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    scheduler = CosineAnnealingLR(optimizer, T_max=EPOCHS)
    
    best_acc = 0
    patience_counter = 0
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
            
            if not torch.isnan(loss):
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
                optimizer.step()
                total_loss += loss.item()
            
            pbar.set_postfix({'loss': f"{loss.item():.4f}"})
        
        scheduler.step()
        
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
        
        # Early stopping
        if acc > best_acc:
            best_acc = acc
            patience_counter = 0
            OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
            model.base.save_pretrained(OUTPUT_DIR / "base_lora")
            tokenizer.save_pretrained(OUTPUT_DIR)
            torch.save(model.classifier.state_dict(), OUTPUT_DIR / "classifier.pt")
            with open(OUTPUT_DIR / "config.json", 'w') as f:
                json.dump({'base_model': MODEL_NAME, 'hidden_size': hidden_size, 'num_labels': len(label_map)}, f)
            print(f"   💾 New best: {acc:.1%}")
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                print(f"⏹️ Early stopping at epoch {epoch+1}")
                break
    
    import shutil
    shutil.copy(DATA_DIR / "label_map.json", OUTPUT_DIR / "label_map.json")
    with open(OUTPUT_DIR / "history.json", 'w') as f:
        json.dump(history, f, indent=2)
    
    print(f"\n✅ LFM done! Best accuracy: {best_acc:.1%}")
    return best_acc

if __name__ == "__main__":
    print("=" * 60)
    print("🏋️ Extended Training: 15 epochs with early stopping")
    print("=" * 60)
    
    qwen_acc = train_qwen()
    lfm_acc = train_lfm()
    
    print("\n" + "=" * 60)
    print("🎉 FINAL RESULTS")
    print("=" * 60)
    print(f"Qwen 2.5 0.5B (v4): {qwen_acc:.1%}")
    print(f"Liquid LFM 1.2B (v2): {lfm_acc:.1%}")
