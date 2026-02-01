#!/usr/bin/env python3
"""Quick validation on CPU."""
import sys
import torch
from pathlib import Path
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from peft import PeftModel
import json

sys.stdout.reconfigure(line_buffering=True)

print('Loading model (CPU)...')
CHECKPOINT_DIR = Path('outputs/ferni-router-v3/final')
DATA_DIR = Path('data')
BASE_MODEL = 'Qwen/Qwen3-1.7B'
MAX_LENGTH = 128

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

device = 'cpu'
model = model.to(device)
print(f'Model loaded on {device}')

def predict(query):
    inputs = tokenizer(query, padding='max_length', truncation=True, max_length=MAX_LENGTH, return_tensors='pt')
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.sigmoid(outputs.logits).cpu().numpy()[0]
    return probs

def decode(probs, threshold=0.5):
    return sorted([(id_to_label[i], float(p)) for i, p in enumerate(probs) if p >= threshold], key=lambda x: -x[1])

# Test cases
TOOL_TEST_CASES = [
    ('play some music', ['playMusic']),
    ('put on jazz', ['playMusic']),
    ("what's on my calendar today", ['getCalendarEvents']),
    ('schedule a meeting tomorrow at 3', ['createCalendarEvent', 'scheduleEvent']),
    ('remind me to call mom', ['createReminder', 'setReminder']),
    ('set an alarm for 7am', ['createAlarm', 'setAlarm']),
    ('remember that I like coffee', ['saveMemory', 'storeInfo', 'rememberThis']),
    ('I did my meditation', ['logHabit', 'trackHabit', 'markHabitComplete']),
    ("text mom I'll be late", ['sendMessage', 'sendSMS', 'textContact']),
    ("what's the weather", ['getWeather', 'weatherForecast']),
]

OPEN_INTENT_CASES = [
    'how are you doing',
    "that's interesting",
    'tell me more',
    'thank you',
    'goodbye',
    'life is hard sometimes',
    'yeah',
    'okay',
]

print('\n' + '='*60)
print('TEST 1: Tool Classification')
print('='*60)
correct = 0
for query, expected in TOOL_TEST_CASES:
    probs = predict(query)
    preds = decode(probs, threshold=0.3)
    pred_tools = [p[0] for p in preds[:3]]
    hit = any(t in pred_tools for t in expected)
    if hit:
        correct += 1
        print(f'   ✅ "{query}" → {pred_tools[0] if preds else "none"} ({preds[0][1]:.2f})')
    else:
        print(f'   ❌ "{query}" → got {pred_tools[:2]}, expected {expected}')
print(f'\n   Tool Accuracy: {correct}/{len(TOOL_TEST_CASES)} = {correct/len(TOOL_TEST_CASES):.1%}')

print('\n' + '='*60)
print('TEST 2: Open Intent Detection')
print('='*60)
correct_open = 0
for query in OPEN_INTENT_CASES:
    probs = predict(query)
    preds = decode(probs, threshold=0.5)
    if len(preds) == 0:
        correct_open += 1
        print(f'   ✅ "{query}" → no tools')
    else:
        print(f'   ❌ "{query}" → FALSE POSITIVE: {preds[0]}')
print(f'\n   Open Intent Accuracy: {correct_open}/{len(OPEN_INTENT_CASES)} = {correct_open/len(OPEN_INTENT_CASES):.1%}')

print('\n' + '='*60)
print('VALIDATION SUMMARY')
print('='*60)
print(f'   Tool Classification: {correct/len(TOOL_TEST_CASES):.1%}')
print(f'   Open Intent:        {correct_open/len(OPEN_INTENT_CASES):.1%}')
print('='*60)
