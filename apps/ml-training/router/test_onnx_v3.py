#!/usr/bin/env python3
"""Test ONNX V3 model inference."""
import sys
import json
import time
import numpy as np

sys.stdout.reconfigure(line_buffering=True)

print("=" * 60)
print("🧪 FTIS V3 ONNX Inference Test")
print("=" * 60)

MODEL_DIR = "/Users/sethford/Documents/voiceai/models/ferni-router-v3"

print("\n📦 Loading model...")
import onnxruntime as ort
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
session = ort.InferenceSession(
    f"{MODEL_DIR}/model.onnx",
    providers=['CoreMLExecutionProvider', 'CPUExecutionProvider']
)
print(f"   ✅ Session created")
print(f"   Providers: {session.get_providers()}")

with open(f"{MODEL_DIR}/label_map.json") as f:
    label_map = json.load(f)
id_to_label = {v: k for k, v in label_map.items()}

def predict(query, threshold=0.05):
    inputs = tokenizer(query, return_tensors="np", padding="max_length", max_length=128, truncation=True)
    outputs = session.run(None, dict(inputs))
    probs = 1 / (1 + np.exp(-outputs[0][0]))  # Sigmoid

    predictions = [(id_to_label[i], float(p)) for i, p in enumerate(probs) if p >= threshold]
    predictions = sorted(predictions, key=lambda x: -x[1])[:5]
    return predictions

# Test cases
TEST_CASES = [
    ("play some music", ["playMusic", "music_play"]),
    ("what's the weather", ["getWeather"]),
    ("remind me to call mom", ["createReminder"]),
    ("how are you doing", []),  # Open intent
    ("set a timer for 5 minutes", ["createTimer"]),
    ("call john", ["callContact", "makeCall"]),
]

print("\n📊 Running tests...\n")

# Warmup
predict("warmup")

latencies = []
correct = 0

for query, expected in TEST_CASES:
    start = time.perf_counter()
    preds = predict(query)
    latency = (time.perf_counter() - start) * 1000
    latencies.append(latency)

    pred_tools = [p[0] for p in preds]

    if len(expected) == 0:
        # Open intent - should have no predictions
        hit = len(preds) == 0
        marker = "✅" if hit else "❌"
        print(f"{marker} \"{query}\"")
        print(f"   Expected: no tools | Got: {pred_tools if preds else 'none'}")
    else:
        hit = any(t in pred_tools for t in expected)
        marker = "✅" if hit else "❌"
        print(f"{marker} \"{query}\"")
        if preds:
            print(f"   Top: {preds[0][0]} ({preds[0][1]:.0%})")
        else:
            print(f"   No predictions")

    if hit:
        correct += 1
    print(f"   Latency: {latency:.1f}ms\n")

print("=" * 60)
print("📊 SUMMARY")
print("=" * 60)
print(f"Accuracy: {correct}/{len(TEST_CASES)} = {correct/len(TEST_CASES):.0%}")
print(f"Avg Latency: {np.mean(latencies):.1f}ms")
print(f"P95 Latency: {np.percentile(latencies, 95):.1f}ms")
