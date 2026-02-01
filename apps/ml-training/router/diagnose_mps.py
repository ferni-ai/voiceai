#!/usr/bin/env python3
"""Diagnose MPS (Apple Silicon GPU) inference issues."""
import sys
import torch
from pathlib import Path

sys.stdout.reconfigure(line_buffering=True)

CHECKPOINT_DIR = Path('outputs/ferni-router-v3/final')
BASE_MODEL = 'Qwen/Qwen3-1.7B'

print("=" * 60)
print("MPS DIAGNOSTIC")
print("=" * 60)

print(f"\n1. PyTorch Version: {torch.__version__}")
print(f"   MPS Available: {torch.backends.mps.is_available()}")
print(f"   MPS Built: {torch.backends.mps.is_built()}")

# Test basic MPS operations
print("\n2. Testing basic MPS tensor operations...")
try:
    x = torch.randn(10, 10, device='mps')
    y = torch.randn(10, 10, device='mps')
    z = x @ y
    print(f"   ✅ Basic matmul works: {z.shape}")
except Exception as e:
    print(f"   ❌ Basic matmul failed: {e}")

# Test loading tokenizer
print("\n3. Loading tokenizer...")
try:
    from transformers import AutoTokenizer
    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    print(f"   ✅ Tokenizer loaded: {tokenizer.__class__.__name__}")
except Exception as e:
    print(f"   ❌ Tokenizer failed: {e}")

# Test loading base model
print("\n4. Loading base model (this may take a while)...")
try:
    from transformers import AutoModelForSequenceClassification
    import json

    with open(Path('data/label_map.json'), 'r') as f:
        label_map = json.load(f)

    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(label_map),
        problem_type='multi_label_classification',
        trust_remote_code=True,
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id
    print(f"   ✅ Base model loaded: {base_model.__class__.__name__}")
    print(f"   Model params: {sum(p.numel() for p in base_model.parameters()):,}")
except Exception as e:
    print(f"   ❌ Base model failed: {e}")
    sys.exit(1)

# Test loading PEFT adapter
print("\n5. Loading PEFT adapter...")
try:
    from peft import PeftModel
    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    model.eval()
    print(f"   ✅ PEFT model loaded")
    print(f"   Trainable params: {sum(p.numel() for p in model.parameters() if p.requires_grad):,}")
except Exception as e:
    print(f"   ❌ PEFT adapter failed: {e}")
    sys.exit(1)

# Test CPU inference first
print("\n6. Testing CPU inference...")
try:
    model_cpu = model.to('cpu')
    test_input = "play some music"
    inputs = tokenizer(test_input, padding='max_length', truncation=True, max_length=128, return_tensors='pt')
    inputs = {k: v.to('cpu') for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model_cpu(**inputs)
        probs = torch.sigmoid(outputs.logits).cpu().numpy()[0]

    print(f"   ✅ CPU inference works!")
    print(f"   Output shape: {outputs.logits.shape}")
    print(f"   Max probability: {probs.max():.4f}")
except Exception as e:
    print(f"   ❌ CPU inference failed: {e}")
    sys.exit(1)

# Test MPS inference
print("\n7. Testing MPS inference...")
try:
    print("   Moving model to MPS...")
    model_mps = model.to('mps')
    print("   Model moved successfully")

    print("   Moving inputs to MPS...")
    inputs_mps = {k: v.to('mps') for k, v in inputs.items()}
    print("   Inputs moved successfully")

    print("   Running forward pass...")
    with torch.no_grad():
        outputs_mps = model_mps(**inputs_mps)
    print("   Forward pass completed")

    print("   Computing sigmoid...")
    probs_mps = torch.sigmoid(outputs_mps.logits).cpu().numpy()[0]

    print(f"   ✅ MPS inference works!")
    print(f"   Output shape: {outputs_mps.logits.shape}")
    print(f"   Max probability: {probs_mps.max():.4f}")
except Exception as e:
    print(f"   ❌ MPS inference failed: {e}")
    import traceback
    traceback.print_exc()

# Test with merged LoRA weights
print("\n8. Testing MPS with merged LoRA weights...")
try:
    # Reload fresh model
    base_model2 = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(label_map),
        problem_type='multi_label_classification',
        trust_remote_code=True,
    )
    base_model2.config.pad_token_id = tokenizer.pad_token_id

    model2 = PeftModel.from_pretrained(base_model2, str(CHECKPOINT_DIR))

    print("   Merging LoRA weights into base model...")
    merged_model = model2.merge_and_unload()
    print(f"   ✅ Merged model: {merged_model.__class__.__name__}")

    print("   Moving merged model to MPS...")
    merged_model = merged_model.to('mps')
    merged_model.eval()
    print("   Merged model on MPS")

    print("   Running inference...")
    inputs_mps = {k: v.to('mps') for k, v in inputs.items()}
    with torch.no_grad():
        outputs_merged = merged_model(**inputs_mps)
    probs_merged = torch.sigmoid(outputs_merged.logits).cpu().numpy()[0]

    print(f"   ✅ MPS inference with merged model works!")
    print(f"   Max probability: {probs_merged.max():.4f}")
except Exception as e:
    print(f"   ❌ Merged model MPS failed: {e}")
    import traceback
    traceback.print_exc()

print("\n" + "=" * 60)
print("DIAGNOSTIC COMPLETE")
print("=" * 60)
