#!/usr/bin/env python3
"""Debug failing test cases to understand why confidence is low."""
import sys
import json
import torch
from pathlib import Path
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from peft import PeftModel

sys.stdout.reconfigure(line_buffering=True)

CHECKPOINT_DIR = Path('outputs/ferni-router-v3/final')
DATA_DIR = Path('data')
BASE_MODEL = 'Qwen/Qwen3-1.7B'
MAX_LENGTH = 128

# Load model
print("Loading model...")
tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

with open(DATA_DIR / 'label_map.json', 'r') as f:
    label_map = json.load(f)
id_to_label = {v: k for k, v in label_map.items()}

base_model = AutoModelForSequenceClassification.from_pretrained(
    BASE_MODEL,
    num_labels=len(label_map),
    problem_type='multi_label_classification',
    trust_remote_code=True,
)
base_model.config.pad_token_id = tokenizer.pad_token_id
model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
model.eval()

device = 'mps' if torch.backends.mps.is_available() else 'cpu'
model = model.to(device)
print(f"Model on {device}")

def predict(query):
    inputs = tokenizer(query, padding='max_length', truncation=True, max_length=MAX_LENGTH, return_tensors='pt')
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.sigmoid(outputs.logits).cpu().numpy()[0]
    return probs

def analyze(query, expected_tools):
    print(f"\n{'='*60}")
    print(f"Query: \"{query}\"")
    print(f"Expected: {expected_tools}")
    print("-" * 60)

    probs = predict(query)

    # Show top 5 predictions
    top_indices = probs.argsort()[-5:][::-1]
    print("Top 5 predictions:")
    for idx in top_indices:
        label = id_to_label[idx]
        prob = probs[idx]
        marker = "✓" if label in expected_tools else " "
        print(f"  {marker} {label}: {prob:.4f}")

    # Show expected tool probabilities
    print("\nExpected tool probabilities:")
    for tool in expected_tools:
        if tool in label_map:
            idx = label_map[tool]
            print(f"  → {tool}: {probs[idx]:.4f}")
        else:
            print(f"  → {tool}: NOT IN LABEL MAP!")

# Analyze failing cases
FAILURES = [
    ("put on jazz", ["playMusic"]),
    ("play taylor swift", ["playMusic", "music_play", "spotify_play"]),
    ("schedule a meeting tomorrow at 3", ["createCalendarEvent", "scheduleEvent"]),
    ("text mom I'll be late", ["sendMessage", "sendSMS", "textContact"]),
    ("call john", ["callContact", "makeCall"]),
    ("music", ["playMusic"]),
    ("weather", ["getWeather"]),
    ("timer", ["createTimer", "setTimer"]),
    ("stop", ["pauseMusic"]),
    ("next", ["skipTrack"]),
    ("remember that I exercised", ["logHabit", "trackHabit"]),
]

print("\n" + "="*60)
print("FAILURE ANALYSIS")
print("="*60)

for query, expected in FAILURES:
    analyze(query, expected)

# Also check training data for these tools
print("\n" + "="*60)
print("TRAINING DATA CHECK")
print("="*60)

def load_jsonl(path):
    with open(path, 'r') as f:
        return [json.loads(line) for line in f]

train_data = load_jsonl(DATA_DIR / 'train.jsonl')

for tool in ['sendMessage', 'textContact', 'callContact', 'makeCall', 'playMusic', 'pauseMusic', 'skipTrack']:
    examples = [d for d in train_data if tool in d.get('selected_tools', [])]
    print(f"\n{tool}: {len(examples)} training examples")
    if examples:
        print(f"  Sample: \"{examples[0]['query']}\"")
