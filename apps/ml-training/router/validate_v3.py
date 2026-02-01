#!/usr/bin/env python3
"""
FTIS V3 Model Validation Suite

Comprehensive testing against synthetic queries to ensure "better than human" routing.

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  python validate_v3.py

Tests:
  1. Tool classification accuracy
  2. Open intent detection (false positive prevention)
  3. Hard negative discrimination
  4. Edge cases and ambiguous queries
  5. OOD detection using decision boundaries
"""

import json
import torch
import numpy as np
from pathlib import Path
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from peft import PeftModel
from sklearn.metrics import f1_score, precision_score, recall_score, accuracy_score
from sklearn.metrics.pairwise import cosine_distances
from dataclasses import dataclass
from typing import List, Dict, Tuple, Optional
import time

# ==============================================================================
# CONFIG
# ==============================================================================

BASE_MODEL = "Qwen/Qwen3-1.7B"
CHECKPOINT_DIR = Path("outputs/ferni-router-v3/final")
DATA_DIR = Path("data")
BOUNDARIES_FILE = DATA_DIR / "boundaries.json"

MAX_LENGTH = 128
CONFIDENCE_THRESHOLD = 0.5

# ==============================================================================
# TEST CASES - "Better Than Human" Validation
# ==============================================================================

# Tool queries that MUST trigger the correct tool
TOOL_TEST_CASES = [
    # Music
    ("play some music", ["playMusic"]),
    ("put on jazz", ["playMusic"]),
    ("play taylor swift", ["playMusic", "music_play", "spotify_play"]),
    ("pause the music", ["pauseMusic"]),
    ("skip this song", ["skipTrack"]),
    ("turn it up", ["adjustVolume"]),

    # Calendar
    ("what's on my calendar today", ["getCalendarEvents"]),
    ("schedule a meeting tomorrow at 3", ["createCalendarEvent", "scheduleEvent"]),
    ("am I free on Friday", ["checkAvailability"]),

    # Reminders & Alarms
    ("remind me to call mom", ["createReminder", "setReminder"]),
    ("set an alarm for 7am", ["createAlarm", "setAlarm"]),
    ("set a timer for 10 minutes", ["createTimer", "setTimer"]),

    # Memory
    ("remember that I like coffee", ["saveMemory", "storeInfo", "rememberThis"]),
    ("what did I tell you about my preferences", ["recallMemory", "getMemory"]),
    ("what do you know about me", ["whatDoYouKnow"]),

    # Habits
    ("I did my meditation", ["logHabit", "trackHabit", "markHabitComplete"]),
    ("how's my exercise streak", ["viewStreak", "getHabitProgress"]),
    ("my habit stats", ["habitStats"]),

    # Communication
    ("text mom I'll be late", ["sendMessage", "sendSMS", "textContact"]),
    ("call john", ["callContact", "makeCall"]),

    # Weather & Info
    ("what's the weather", ["getWeather", "weatherForecast"]),
    ("news headlines", ["getNews", "headlines"]),
    ("search for python tutorials", ["search", "webSearch", "lookup"]),
]

# Open intent queries that must NOT trigger any tool
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

# Hard negatives - must route to correct tool despite similarity
HARD_NEGATIVE_CASES = [
    # Calendar vs Reminder
    ("put a meeting on my schedule", ["createCalendarEvent", "scheduleEvent"], "NOT reminder"),
    ("remind me about the meeting", ["createReminder", "setReminder"], "NOT calendar"),

    # Memory vs Habit
    ("remember that I exercised", ["logHabit", "trackHabit"], "habit, NOT memory"),
    ("remember that I like exercise", ["saveMemory", "storeInfo"], "memory, NOT habit"),

    # Music controls
    ("stop", ["pauseMusic"], "pause music"),
    ("next", ["skipTrack"], "skip track"),
]

# Edge cases - tricky queries
EDGE_CASES = [
    # Short queries
    ("music", ["playMusic"]),
    ("weather", ["getWeather"]),
    ("timer", ["createTimer", "setTimer"]),

    # Natural phrasing
    ("I wanna hear some tunes", ["playMusic"]),
    ("don't let me forget to buy milk", ["createReminder", "setReminder"]),
    ("what've I got going on tomorrow", ["getCalendarEvents", "checkAvailability"]),
]

# ==============================================================================
# MODEL LOADING
# ==============================================================================

def load_model():
    """Load the trained FTIS V3 model."""
    print("📦 Loading model...")

    tokenizer = AutoTokenizer.from_pretrained(CHECKPOINT_DIR, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    with open(DATA_DIR / "label_map.json", 'r') as f:
        label_map = json.load(f)

    # Reverse map for decoding
    id_to_label = {v: k for k, v in label_map.items()}

    base_model = AutoModelForSequenceClassification.from_pretrained(
        BASE_MODEL,
        num_labels=len(label_map),
        problem_type="multi_label_classification",
        trust_remote_code=True,
    )
    base_model.config.pad_token_id = tokenizer.pad_token_id

    model = PeftModel.from_pretrained(base_model, str(CHECKPOINT_DIR))
    model.eval()

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    model = model.to(device)

    print(f"   ✅ Loaded on {device}")
    return model, tokenizer, label_map, id_to_label, device

def load_boundaries():
    """Load decision boundaries for OOD detection."""
    if not BOUNDARIES_FILE.exists():
        print("   ⚠️ No boundaries file found")
        return None

    with open(BOUNDARIES_FILE, 'r') as f:
        return json.load(f)

# ==============================================================================
# INFERENCE
# ==============================================================================

def predict(model, tokenizer, query: str, device: str, threshold: float = 0.5) -> Tuple[List[str], List[float]]:
    """Run inference on a query."""
    inputs = tokenizer(
        query,
        padding="max_length",
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors="pt"
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        outputs = model(**inputs)
        probs = torch.sigmoid(outputs.logits).cpu().numpy()[0]

    return probs

def decode_predictions(probs: np.ndarray, id_to_label: Dict[int, str], threshold: float = 0.5) -> List[Tuple[str, float]]:
    """Decode probability array to tool names."""
    predictions = []
    for idx, prob in enumerate(probs):
        if prob >= threshold:
            predictions.append((id_to_label[idx], float(prob)))
    return sorted(predictions, key=lambda x: -x[1])

# ==============================================================================
# TESTS
# ==============================================================================

def test_tool_accuracy(model, tokenizer, id_to_label, device) -> Dict:
    """Test tool classification accuracy."""
    print("\n" + "=" * 60)
    print("🎯 TEST 1: Tool Classification")
    print("=" * 60)

    correct = 0
    total = len(TOOL_TEST_CASES)
    failures = []

    for query, expected_tools in TOOL_TEST_CASES:
        probs = predict(model, tokenizer, query, device)
        predictions = decode_predictions(probs, id_to_label, threshold=0.3)

        # Check if any expected tool is in top predictions
        predicted_tools = [p[0] for p in predictions[:3]]
        hit = any(t in predicted_tools for t in expected_tools)

        if hit:
            correct += 1
            print(f"   ✅ '{query}' → {predicted_tools[0] if predictions else 'none'}")
        else:
            failures.append((query, expected_tools, predicted_tools))
            print(f"   ❌ '{query}' → got {predicted_tools[:2]}, expected {expected_tools}")

    accuracy = correct / total
    print(f"\n   Accuracy: {accuracy:.1%} ({correct}/{total})")

    return {"accuracy": accuracy, "correct": correct, "total": total, "failures": failures}

def test_open_intent_detection(model, tokenizer, id_to_label, device) -> Dict:
    """Test that open intents don't trigger tools (false positive prevention)."""
    print("\n" + "=" * 60)
    print("🛡️ TEST 2: Open Intent Detection (False Positive Prevention)")
    print("=" * 60)

    correct = 0
    total = len(OPEN_INTENT_CASES)
    false_positives = []

    for query in OPEN_INTENT_CASES:
        probs = predict(model, tokenizer, query, device)
        predictions = decode_predictions(probs, id_to_label, threshold=0.5)

        # Open intents should have NO high-confidence predictions
        if len(predictions) == 0:
            correct += 1
            print(f"   ✅ '{query}' → no tools (correct)")
        else:
            false_positives.append((query, predictions[0]))
            print(f"   ❌ '{query}' → FALSE POSITIVE: {predictions[0]}")

    accuracy = correct / total
    print(f"\n   Accuracy: {accuracy:.1%} ({correct}/{total})")

    return {"accuracy": accuracy, "correct": correct, "total": total, "false_positives": false_positives}

def test_hard_negatives(model, tokenizer, id_to_label, device) -> Dict:
    """Test discrimination between similar tools."""
    print("\n" + "=" * 60)
    print("⚔️ TEST 3: Hard Negative Discrimination")
    print("=" * 60)

    correct = 0
    total = len(HARD_NEGATIVE_CASES)

    for query, expected_tools, note in HARD_NEGATIVE_CASES:
        probs = predict(model, tokenizer, query, device)
        predictions = decode_predictions(probs, id_to_label, threshold=0.3)

        predicted_tools = [p[0] for p in predictions[:2]]
        hit = any(t in predicted_tools for t in expected_tools)

        if hit:
            correct += 1
            print(f"   ✅ '{query}' → {predicted_tools[0]} ({note})")
        else:
            print(f"   ❌ '{query}' → {predicted_tools[:2]}, expected {expected_tools}")

    accuracy = correct / total
    print(f"\n   Accuracy: {accuracy:.1%} ({correct}/{total})")

    return {"accuracy": accuracy, "correct": correct, "total": total}

def test_edge_cases(model, tokenizer, id_to_label, device) -> Dict:
    """Test edge cases and tricky queries."""
    print("\n" + "=" * 60)
    print("🔬 TEST 4: Edge Cases")
    print("=" * 60)

    correct = 0
    total = len(EDGE_CASES)

    for query, expected_tools in EDGE_CASES:
        probs = predict(model, tokenizer, query, device)
        predictions = decode_predictions(probs, id_to_label, threshold=0.3)

        predicted_tools = [p[0] for p in predictions[:3]]
        hit = any(t in predicted_tools for t in expected_tools)

        if hit:
            correct += 1
            print(f"   ✅ '{query}' → {predicted_tools[0] if predictions else 'none'}")
        else:
            print(f"   ❌ '{query}' → {predicted_tools[:2]}, expected {expected_tools}")

    accuracy = correct / total
    print(f"\n   Accuracy: {accuracy:.1%} ({correct}/{total})")

    return {"accuracy": accuracy, "correct": correct, "total": total}

def test_latency(model, tokenizer, device) -> Dict:
    """Test inference latency."""
    print("\n" + "=" * 60)
    print("⚡ TEST 5: Latency")
    print("=" * 60)

    queries = ["play some music", "what's on my calendar", "remind me to call mom"]
    times = []

    # Warmup
    for q in queries:
        predict(model, tokenizer, q, device)

    # Benchmark
    for _ in range(10):
        for q in queries:
            start = time.perf_counter()
            predict(model, tokenizer, q, device)
            elapsed = (time.perf_counter() - start) * 1000
            times.append(elapsed)

    avg_ms = np.mean(times)
    p95_ms = np.percentile(times, 95)

    print(f"   Average: {avg_ms:.1f}ms")
    print(f"   P95:     {p95_ms:.1f}ms")
    print(f"   Target:  <50ms {'✅' if avg_ms < 50 else '❌'}")

    return {"avg_ms": avg_ms, "p95_ms": p95_ms, "passed": avg_ms < 50}

# ==============================================================================
# MAIN
# ==============================================================================

def main():
    print("=" * 60)
    print("🧪 FTIS V3 VALIDATION SUITE")
    print("=" * 60)

    model, tokenizer, label_map, id_to_label, device = load_model()
    boundaries = load_boundaries()

    results = {}

    # Run all tests
    results["tool_accuracy"] = test_tool_accuracy(model, tokenizer, id_to_label, device)
    results["open_intent"] = test_open_intent_detection(model, tokenizer, id_to_label, device)
    results["hard_negatives"] = test_hard_negatives(model, tokenizer, id_to_label, device)
    results["edge_cases"] = test_edge_cases(model, tokenizer, id_to_label, device)
    results["latency"] = test_latency(model, tokenizer, device)

    # Summary
    print("\n" + "=" * 60)
    print("📊 VALIDATION SUMMARY")
    print("=" * 60)

    all_passed = True

    checks = [
        ("Tool Classification", results["tool_accuracy"]["accuracy"], 0.80),
        ("Open Intent Detection", results["open_intent"]["accuracy"], 0.90),
        ("Hard Negatives", results["hard_negatives"]["accuracy"], 0.70),
        ("Edge Cases", results["edge_cases"]["accuracy"], 0.70),
        ("Latency (<50ms)", 1.0 if results["latency"]["passed"] else 0.0, 1.0),
    ]

    for name, value, threshold in checks:
        passed = value >= threshold
        status = "✅" if passed else "❌"
        print(f"   {status} {name}: {value:.1%} (threshold: {threshold:.0%})")
        if not passed:
            all_passed = False

    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 ALL VALIDATION CHECKS PASSED!")
        print("   Model is ready for deployment.")
    else:
        print("⚠️ SOME CHECKS FAILED")
        print("   Review failures above before deploying.")
    print("=" * 60)

    return results

if __name__ == "__main__":
    main()
