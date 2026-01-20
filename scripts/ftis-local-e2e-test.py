#!/usr/bin/env python3
"""
FTIS Local E2E Test

Tests the hierarchical classification system end-to-end using proper tokenizer.

Usage: python scripts/ftis-local-e2e-test.py
"""

import json
import os
from pathlib import Path
import numpy as np

# Use ONNX Runtime
import onnxruntime as ort
from transformers import AutoTokenizer

# ============================================================================
# CONFIGURATION
# ============================================================================

MODELS_DIR = Path(__file__).parent.parent / "models" / "ftis-merged"
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MAX_LENGTH = 64
CONFIDENCE_THRESHOLD = 0.85

# Test queries
TEST_QUERIES = [
    # Media
    {"query": "Play some jazz music", "expectedSuper": "media", "expectedFine": "play_music"},
    {"query": "What song is this?", "expectedSuper": "media", "expectedFine": "music_control"},
    {"query": "Tell me a joke", "expectedSuper": "media", "expectedFine": "joke"},
    
    # Calendar
    {"query": "Set an alarm for 7am", "expectedSuper": "calendar", "expectedFine": "alarm_set"},
    {"query": "What's on my calendar today?", "expectedSuper": "calendar", "expectedFine": "calendar_view"},
    {"query": "Remind me to call mom at 5pm", "expectedSuper": "calendar", "expectedFine": "reminder_set"},
    
    # Productivity
    {"query": "Add milk to my shopping list", "expectedSuper": "productivity", "expectedFine": "item_add"},
    {"query": "Save this idea for later", "expectedSuper": "productivity", "expectedFine": "save_info"},
    {"query": "What are my priorities today?", "expectedSuper": "productivity", "expectedFine": "priorities"},
    {"query": "I'm grateful for my family", "expectedSuper": "productivity", "expectedFine": "reflection"},
    
    # Communication
    {"query": "Call John", "expectedSuper": "communication", "expectedFine": "call_make"},
    {"query": "Send a text to Sarah", "expectedSuper": "communication", "expectedFine": "message_send"},
    {"query": "Read my emails", "expectedSuper": "communication", "expectedFine": "email_read"},
    
    # Health
    {"query": "I did my morning run", "expectedSuper": "health", "expectedFine": "activity_log"},
    {"query": "Log 8 glasses of water", "expectedSuper": "health", "expectedFine": "hydration_nutrition"},
    {"query": "How's my sleep been?", "expectedSuper": "health", "expectedFine": "sleep"},
    {"query": "Start my morning routine", "expectedSuper": "health", "expectedFine": "routine_run"},
    
    # Emotional
    {"query": "I'm feeling anxious", "expectedSuper": "emotional", "expectedFine": "calm_support"},
    {"query": "I need help with grief", "expectedSuper": "emotional", "expectedFine": "grief_support"},
    {"query": "I feel like a fraud at work", "expectedSuper": "emotional", "expectedFine": "self_worth"},
    {"query": "Motivate me", "expectedSuper": "emotional", "expectedFine": "coaching_motivation"},
    
    # Home
    {"query": "Turn on the lights", "expectedSuper": "home", "expectedFine": "lights"},
    {"query": "Set the thermostat to 72", "expectedSuper": "home", "expectedFine": "thermostat"},
    
    # Travel
    {"query": "What's the weather like?", "expectedSuper": "travel", "expectedFine": "weather"},
    {"query": "Get me directions to the airport", "expectedSuper": "travel", "expectedFine": "directions"},
    {"query": "Find flights to New York", "expectedSuper": "travel", "expectedFine": "flights"},
    
    # Finance
    {"query": "What's my budget for this month?", "expectedSuper": "finance", "expectedFine": "budget"},
    {"query": "When are my bills due?", "expectedSuper": "finance", "expectedFine": "bills"},
    
    # System
    {"query": "Transfer me to Maya", "expectedSuper": "system", "expectedFine": "handoff_maya"},
    {"query": "What time is it?", "expectedSuper": "system", "expectedFine": "time"},
    {"query": "What can you do?", "expectedSuper": "system", "expectedFine": "capabilities"},
]


def softmax(x):
    exp_x = np.exp(x - np.max(x))
    return exp_x / exp_x.sum()


def classify(session, tokenizer, text, label_map):
    """Classify text using ONNX model."""
    # Tokenize
    encoded = tokenizer(
        text,
        max_length=MAX_LENGTH,
        truncation=True,
        padding='max_length',
        return_tensors='np'
    )
    
    # Run inference
    feeds = {
        'input_ids': encoded['input_ids'].astype(np.int64),
        'attention_mask': encoded['attention_mask'].astype(np.int64),
    }
    
    outputs = session.run(None, feeds)
    logits = outputs[0][0]  # First output, first batch item
    
    # Softmax
    probs = softmax(logits)
    
    # Get label names
    id_to_label = {v: k for k, v in label_map.items()}
    
    # Find best
    best_idx = int(np.argmax(probs))
    best_prob = float(probs[best_idx])
    
    return {
        'label': id_to_label.get(best_idx, f'unknown_{best_idx}'),
        'confidence': best_prob,
        'all_scores': {id_to_label.get(i, f'unk_{i}'): float(p) for i, p in enumerate(probs)}
    }


def main():
    print("🧪 FTIS Local E2E Test (Python)\n")
    print("=" * 80)
    
    # Check models exist
    if not (MODELS_DIR / "stage1" / "model.onnx").exists():
        print(f"❌ Models not found at {MODELS_DIR}")
        print("   Run training first: cd models/ftis-merged && python train_all.py")
        return
    
    # Load tokenizer
    print("\n📦 Loading tokenizer...")
    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
    print(f"   ✓ Loaded {TOKENIZER_NAME}")
    
    # Load Stage 1 model
    print("\n📦 Loading Stage 1 model...")
    stage1_session = ort.InferenceSession(str(MODELS_DIR / "stage1" / "model.onnx"))
    with open(MODELS_DIR / "stage1" / "label_map.json") as f:
        stage1_label_map = json.load(f)
    print(f"   ✓ Stage 1 loaded with {len(stage1_label_map)} super-categories")
    
    # Load Stage 2 models
    print("\n📦 Loading Stage 2 models...")
    stage2_models = {}
    for super_cat in stage1_label_map.keys():
        model_path = MODELS_DIR / "stage2" / super_cat / "model.onnx"
        if model_path.exists():
            session = ort.InferenceSession(str(model_path))
            with open(MODELS_DIR / "stage2" / super_cat / "label_map.json") as f:
                label_map = json.load(f)
            stage2_models[super_cat] = {'session': session, 'label_map': label_map}
            print(f"   ✓ {super_cat}: {len(label_map)} fine categories")
        else:
            print(f"   ✗ {super_cat}: model not found")
    
    # Load tool mapping
    print("\n📦 Loading tool mapping...")
    with open(MODELS_DIR / "category_to_tools.json") as f:
        category_to_tools = json.load(f)
    print(f"   ✓ Loaded mapping for {len(category_to_tools)} categories")
    
    # Run tests
    print("\n" + "=" * 80)
    print("🧪 Running Classification Tests\n")
    
    correct = 0
    total = 0
    correct_super = 0
    low_confidence = 0
    
    for test in TEST_QUERIES:
        total += 1
        query = test['query']
        expected_super = test['expectedSuper']
        expected_fine = test['expectedFine']
        
        # Stage 1: Super-category
        stage1_result = classify(stage1_session, tokenizer, query, stage1_label_map)
        predicted_super = stage1_result['label']
        super_correct = predicted_super == expected_super
        if super_correct:
            correct_super += 1
        
        # Stage 2: Fine category
        predicted_fine = 'unknown'
        fine_confidence = 0
        fine_correct = False
        
        if predicted_super in stage2_models:
            model_info = stage2_models[predicted_super]
            stage2_result = classify(model_info['session'], tokenizer, query, model_info['label_map'])
            predicted_fine = stage2_result['label']
            fine_confidence = stage2_result['confidence']
            fine_correct = predicted_fine == expected_fine
        
        if super_correct and fine_correct:
            correct += 1
        if fine_confidence < CONFIDENCE_THRESHOLD:
            low_confidence += 1
        
        # Get mapped tools
        tools = category_to_tools.get(predicted_fine, ['(no tools mapped)'])
        
        # Display result
        super_icon = '✓' if super_correct else '✗'
        fine_icon = '✓' if fine_correct else '✗'
        conf_icon = '' if fine_confidence >= CONFIDENCE_THRESHOLD else '⚠️'
        
        print(f'Query: "{query}"')
        print(f'  Stage 1: {super_icon} {predicted_super} ({stage1_result["confidence"]*100:.1f}%) [expected: {expected_super}]')
        print(f'  Stage 2: {fine_icon} {predicted_fine} ({fine_confidence*100:.1f}%) {conf_icon} [expected: {expected_fine}]')
        print(f'  Tools: {", ".join(tools[:3])}{"..." if len(tools) > 3 else ""}')
        print()
    
    # Summary
    print("=" * 80)
    print("📊 Results Summary\n")
    print(f"  Stage 1 Accuracy: {correct_super}/{total} ({correct_super/total*100:.1f}%)")
    print(f"  Combined Accuracy: {correct}/{total} ({correct/total*100:.1f}%)")
    print(f"  Low Confidence (<{CONFIDENCE_THRESHOLD*100:.0f}%): {low_confidence}/{total}")
    
    if low_confidence > 0:
        print(f"\n  💡 {low_confidence} queries would benefit from Gemini fallback")
    
    print("\n" + "=" * 80)


if __name__ == "__main__":
    main()
