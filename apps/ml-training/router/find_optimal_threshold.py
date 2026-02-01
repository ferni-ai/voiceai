#!/usr/bin/env python3
"""Find optimal confidence threshold for FTIS V3 model."""
import sys
import json
import torch
import numpy as np
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
print(f"Model on {device}\n")

def predict(query):
    inputs = tokenizer(query, padding='max_length', truncation=True, max_length=MAX_LENGTH, return_tensors='pt')
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.sigmoid(outputs.logits).cpu().numpy()[0]
    return probs

# Tool test cases - use actual labels from training data
# Accept ANY music-related tool for music queries
TOOL_TEST_CASES = [
    ("play some music", ["playMusic", "music_play", "spotify_play"]),
    ("put on jazz", ["playMusic", "music_play", "spotify_play"]),
    ("play taylor swift", ["playMusic", "music_play", "spotify_play"]),
    ("pause the music", ["pauseMusic"]),
    ("skip this song", ["skipTrack"]),
    ("turn it up", ["adjustVolume"]),
    ("what's on my calendar today", ["getCalendarEvents"]),
    ("schedule a meeting tomorrow at 3", ["createCalendarEvent", "scheduleEvent"]),
    ("am I free on Friday", ["checkAvailability"]),
    ("remind me to call mom", ["createReminder", "setReminder"]),
    ("set an alarm for 7am", ["createAlarm", "setAlarm"]),
    ("set a timer for 10 minutes", ["createTimer", "setTimer"]),
    ("remember that I like coffee", ["saveMemory", "storeInfo", "rememberThis"]),
    ("what did I tell you about my preferences", ["recallMemory", "getMemory"]),
    ("what do you know about me", ["whatDoYouKnow"]),
    ("I did my meditation", ["logHabit", "trackHabit", "markHabitComplete"]),
    ("how's my exercise streak", ["viewStreak", "getHabitProgress"]),
    ("my habit stats", ["habitStats"]),
    ("text mom I'll be late", ["sendMessage", "sendSMS", "textContact"]),
    ("call john", ["callContact", "makeCall"]),
    ("what's the weather", ["getWeather", "weatherForecast"]),
    ("news headlines", ["headlines", "getNews"]),
    ("search for python tutorials", ["search", "webSearch", "lookup"]),
]

OPEN_INTENT_CASES = [
    "how are you doing",
    "that's interesting",
    "tell me more",
    "I see what you mean",
    "thank you",
    "goodbye",
    "I just need to vent",
    "life is hard sometimes",
    "I don't know what to do",
    "what do you think about that",
    "hmm let me think",
    "yeah",
    "okay",
    "makes sense",
    "fair enough",
    "I appreciate that",
]

def evaluate_at_threshold(threshold):
    """Evaluate model at given threshold."""
    tool_correct = 0
    for query, expected_tools in TOOL_TEST_CASES:
        probs = predict(query)
        # Get predictions above threshold
        predictions = [(id_to_label[i], float(p)) for i, p in enumerate(probs) if p >= threshold]
        predictions = sorted(predictions, key=lambda x: -x[1])[:3]
        pred_tools = [p[0] for p in predictions]
        if any(t in pred_tools for t in expected_tools):
            tool_correct += 1

    open_correct = 0
    for query in OPEN_INTENT_CASES:
        probs = predict(query)
        predictions = [(id_to_label[i], float(p)) for i, p in enumerate(probs) if p >= threshold]
        if len(predictions) == 0:
            open_correct += 1

    tool_accuracy = tool_correct / len(TOOL_TEST_CASES)
    open_accuracy = open_correct / len(OPEN_INTENT_CASES)

    return tool_accuracy, open_accuracy

print("=" * 60)
print("THRESHOLD OPTIMIZATION")
print("=" * 60)
print("\nThreshold | Tool Acc | Open Acc | Combined")
print("-" * 50)

best_threshold = 0.5
best_combined = 0

for threshold in [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]:
    tool_acc, open_acc = evaluate_at_threshold(threshold)
    # Weight open intent accuracy higher (false positives are worse)
    combined = (tool_acc * 0.6) + (open_acc * 0.4)
    print(f"  {threshold:.2f}    | {tool_acc:6.1%}  | {open_acc:6.1%}  | {combined:.1%}")

    if combined > best_combined:
        best_combined = combined
        best_threshold = threshold

print("-" * 50)
print(f"\n✅ Optimal threshold: {best_threshold:.2f}")
print(f"   Tool Accuracy: {evaluate_at_threshold(best_threshold)[0]:.1%}")
print(f"   Open Intent: {evaluate_at_threshold(best_threshold)[1]:.1%}")

# Show detailed results at optimal threshold
print("\n" + "=" * 60)
print(f"DETAILED RESULTS AT THRESHOLD = {best_threshold}")
print("=" * 60)

tool_correct = 0
print("\nTool Classification:")
for query, expected_tools in TOOL_TEST_CASES:
    probs = predict(query)
    predictions = [(id_to_label[i], float(p)) for i, p in enumerate(probs) if p >= best_threshold]
    predictions = sorted(predictions, key=lambda x: -x[1])[:3]
    pred_tools = [p[0] for p in predictions]
    hit = any(t in pred_tools for t in expected_tools)
    if hit:
        tool_correct += 1
        conf = predictions[0][1] if predictions else 0
        print(f"  ✅ \"{query}\" → {pred_tools[0]} ({conf:.0%})")
    else:
        print(f"  ❌ \"{query}\" → {pred_tools[:2] if pred_tools else 'none'}")

print(f"\nTool Accuracy: {tool_correct}/{len(TOOL_TEST_CASES)} = {tool_correct/len(TOOL_TEST_CASES):.1%}")

open_correct = 0
print("\nOpen Intent Detection:")
for query in OPEN_INTENT_CASES:
    probs = predict(query)
    predictions = [(id_to_label[i], float(p)) for i, p in enumerate(probs) if p >= best_threshold]
    if len(predictions) == 0:
        open_correct += 1
        print(f"  ✅ \"{query}\" → no tools")
    else:
        print(f"  ❌ \"{query}\" → FALSE POSITIVE: {predictions[0]}")

print(f"\nOpen Intent: {open_correct}/{len(OPEN_INTENT_CASES)} = {open_correct/len(OPEN_INTENT_CASES):.1%}")
