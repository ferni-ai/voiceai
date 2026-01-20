#!/usr/bin/env python3
"""
FTIS Stress Test - Edge Cases

Tests the FTIS system with challenging edge cases:
- Ambiguous queries
- Typos and misspellings  
- Short/terse queries
- Long/complex queries
- Slang and casual language
- Queries that could match multiple categories

Usage: python scripts/ftis-stress-test.py
"""

import json
from pathlib import Path
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

MODELS_DIR = Path(__file__).parent.parent / "models" / "ftis-merged"
TOKENIZER_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MAX_LENGTH = 64

# Edge case test queries
EDGE_CASES = [
    # === AMBIGUOUS QUERIES ===
    {"query": "play", "category": "ambiguous", "note": "Could be music, games, etc."},
    {"query": "help", "category": "ambiguous", "note": "Could be emotional, capabilities, etc."},
    {"query": "stop", "category": "ambiguous", "note": "Could be music, timer, alarm, etc."},
    {"query": "more", "category": "ambiguous", "note": "Context dependent"},
    {"query": "yes", "category": "ambiguous", "note": "Confirmation"},
    {"query": "no thanks", "category": "ambiguous", "note": "Rejection"},
    
    # === TYPOS AND MISSPELLINGS ===
    {"query": "plya some muzic", "expected": "media", "note": "Typos in play music"},
    {"query": "set a alram for 6am", "expected": "calendar", "note": "Typo in alarm"},
    {"query": "whats teh wether", "expected": "travel", "note": "Typos in weather"},
    {"query": "cal mom", "expected": "communication", "note": "Abbreviated call"},
    {"query": "txt sarah hi", "expected": "communication", "note": "Abbreviated text"},
    {"query": "remindme to workout", "expected": "calendar", "note": "No space"},
    
    # === SHORT/TERSE QUERIES ===
    {"query": "lights", "expected": "home", "note": "Single word"},
    {"query": "music", "expected": "media", "note": "Single word"},
    {"query": "weather", "expected": "travel", "note": "Single word"},
    {"query": "call", "expected": "communication", "note": "Single word"},
    {"query": "alarm", "expected": "calendar", "note": "Single word"},
    {"query": "joke", "expected": "media", "note": "Single word"},
    {"query": "sad", "expected": "emotional", "note": "Single word emotion"},
    {"query": "anxious", "expected": "emotional", "note": "Single word emotion"},
    
    # === LONG/COMPLEX QUERIES ===
    {"query": "Hey I was wondering if you could maybe play some relaxing music for me because I'm feeling a bit stressed out after work today", 
     "expected": "media", "note": "Long request with context"},
    {"query": "Can you set an alarm for tomorrow morning at 6:30 AM and also remind me to take my vitamins when I wake up",
     "expected": "calendar", "note": "Multiple requests"},
    {"query": "I've been feeling really overwhelmed lately with everything going on at work and I think I need someone to talk to about it",
     "expected": "emotional", "note": "Long emotional context"},
    {"query": "What's the weather going to be like this weekend because I'm planning a trip to the beach with my family",
     "expected": "travel", "note": "Long with context"},
     
    # === SLANG AND CASUAL LANGUAGE ===
    {"query": "yo play some beats", "expected": "media", "note": "Slang"},
    {"query": "gimme directions to the mall", "expected": "travel", "note": "Casual"},
    {"query": "hit up john for me", "expected": "communication", "note": "Slang for call"},
    {"query": "im freaking out rn", "expected": "emotional", "note": "Casual anxiety"},
    {"query": "whats poppin today", "expected": "calendar", "note": "Slang for schedule"},
    {"query": "throw on some tunes", "expected": "media", "note": "Casual music"},
    {"query": "hmu when its 5", "expected": "calendar", "note": "Slang reminder"},
    
    # === QUERIES THAT COULD MATCH MULTIPLE CATEGORIES ===
    {"query": "I want to track my run", "ambiguous_between": ["health", "productivity"], "note": "Exercise vs habit"},
    {"query": "note to self buy groceries", "ambiguous_between": ["productivity", "calendar"], "note": "Note vs reminder"},
    {"query": "how am I doing", "ambiguous_between": ["health", "emotional", "productivity"], "note": "Check-in"},
    {"query": "play something to help me focus", "ambiguous_between": ["media", "productivity"], "note": "Music for productivity"},
    {"query": "what should I do today", "ambiguous_between": ["calendar", "productivity", "emotional"], "note": "Planning"},
    {"query": "I need a break", "ambiguous_between": ["emotional", "calendar", "health"], "note": "Rest need"},
    
    # === CONTEXT-DEPENDENT QUERIES ===
    {"query": "next", "category": "context", "note": "Skip song? Next event? Next task?"},
    {"query": "louder", "expected": "media", "note": "Volume control"},
    {"query": "again", "category": "context", "note": "Repeat what?"},
    {"query": "cancel that", "category": "context", "note": "Cancel what?"},
    {"query": "undo", "category": "context", "note": "Undo what?"},
    
    # === NEGATIONS AND MODIFICATIONS ===
    {"query": "don't remind me about that", "expected": "calendar", "note": "Negative reminder"},
    {"query": "stop the alarm", "expected": "calendar", "note": "Cancel alarm"},
    {"query": "nevermind the call", "expected": "communication", "note": "Cancel call"},
    {"query": "actually make it 7am instead", "expected": "calendar", "note": "Modification"},
    
    # === QUESTIONS VS COMMANDS ===
    {"query": "can you play music", "expected": "media", "note": "Question form"},
    {"query": "would you set an alarm", "expected": "calendar", "note": "Polite request"},
    {"query": "is it possible to call john", "expected": "communication", "note": "Question form"},
    {"query": "do you know what time it is", "expected": "system", "note": "Question form"},
    
    # === EMOTIONAL EDGE CASES ===
    {"query": "I'm fine", "expected": "emotional", "note": "Denial pattern"},
    {"query": "whatever", "expected": "emotional", "note": "Dismissive"},
    {"query": "I don't want to talk about it", "expected": "emotional", "note": "Avoidance"},
    {"query": "everything sucks", "expected": "emotional", "note": "Negative sentiment"},
    {"query": "I'm so happy right now", "expected": "emotional", "note": "Positive sentiment"},
    
    # === MERGED CATEGORY TESTS ===
    {"query": "I went for a jog", "expected": "health", "fine": "activity_log", "note": "Merged habit+exercise"},
    {"query": "drank my water", "expected": "health", "fine": "hydration_nutrition", "note": "Merged nutrition+water"},
    {"query": "save this thought", "expected": "productivity", "fine": "save_info", "note": "Merged memo+memory"},
    {"query": "add eggs to list", "expected": "productivity", "fine": "item_add", "note": "Merged todo+list"},
    {"query": "dear diary today was good", "expected": "productivity", "fine": "reflection", "note": "Merged journal+gratitude"},
    {"query": "I need to breathe", "expected": "emotional", "fine": "calm_support", "note": "Merged grounding+wellness"},
    {"query": "why do I always mess up", "expected": "emotional", "fine": "self_worth", "note": "Merged compassion+imposter"},
    {"query": "shuffle my playlist", "expected": "media", "fine": "play_music", "note": "Merged play+mood"},
    {"query": "will it rain tomorrow", "expected": "travel", "fine": "weather", "note": "Merged current+forecast"},
]


def softmax(x):
    exp_x = np.exp(x - np.max(x))
    return exp_x / exp_x.sum()


def classify(session, tokenizer, text, label_map):
    encoded = tokenizer(text, max_length=MAX_LENGTH, truncation=True, padding='max_length', return_tensors='np')
    feeds = {'input_ids': encoded['input_ids'].astype(np.int64), 'attention_mask': encoded['attention_mask'].astype(np.int64)}
    outputs = session.run(None, feeds)
    logits = outputs[0][0]
    probs = softmax(logits)
    id_to_label = {v: k for k, v in label_map.items()}
    best_idx = int(np.argmax(probs))
    
    # Get top 3
    top_indices = np.argsort(probs)[-3:][::-1]
    top_3 = [(id_to_label.get(i, f'unk_{i}'), float(probs[i])) for i in top_indices]
    
    return {
        'label': id_to_label.get(best_idx, f'unknown_{best_idx}'),
        'confidence': float(probs[best_idx]),
        'top_3': top_3
    }


def main():
    print("🧪 FTIS Stress Test - Edge Cases\n")
    print("=" * 100)
    
    # Load models
    tokenizer = AutoTokenizer.from_pretrained(TOKENIZER_NAME)
    stage1_session = ort.InferenceSession(str(MODELS_DIR / "stage1" / "model.onnx"))
    with open(MODELS_DIR / "stage1" / "label_map.json") as f:
        stage1_label_map = json.load(f)
    
    stage2_models = {}
    for super_cat in stage1_label_map.keys():
        model_path = MODELS_DIR / "stage2" / super_cat / "model.onnx"
        if model_path.exists():
            session = ort.InferenceSession(str(model_path))
            with open(MODELS_DIR / "stage2" / super_cat / "label_map.json") as f:
                label_map = json.load(f)
            stage2_models[super_cat] = {'session': session, 'label_map': label_map}
    
    print(f"✓ Loaded models\n")
    
    # Run tests
    results = {'correct': 0, 'incorrect': 0, 'ambiguous': 0, 'low_conf': 0}
    
    for test in EDGE_CASES:
        query = test['query']
        
        # Classify
        s1 = classify(stage1_session, tokenizer, query, stage1_label_map)
        predicted_super = s1['label']
        
        s2_label = 'N/A'
        s2_conf = 0
        if predicted_super in stage2_models:
            m = stage2_models[predicted_super]
            s2 = classify(m['session'], tokenizer, query, m['label_map'])
            s2_label = s2['label']
            s2_conf = s2['confidence']
        
        # Check correctness
        status = '?'
        if 'expected' in test:
            if predicted_super == test['expected']:
                status = '✓'
                results['correct'] += 1
                if 'fine' in test and s2_label != test['fine']:
                    status = '~'  # Super correct, fine wrong
            else:
                status = '✗'
                results['incorrect'] += 1
        elif 'ambiguous_between' in test:
            if predicted_super in test['ambiguous_between']:
                status = '~'
                results['ambiguous'] += 1
            else:
                status = '✗'
                results['incorrect'] += 1
        else:
            status = '?'
            results['ambiguous'] += 1
        
        if s1['confidence'] < 0.85:
            results['low_conf'] += 1
        
        conf_warn = '⚠️' if s1['confidence'] < 0.85 else ''
        
        # Print result
        print(f'{status} "{query[:50]}"{"..." if len(query) > 50 else ""}')
        print(f'  → {predicted_super} ({s1["confidence"]*100:.0f}%) → {s2_label} ({s2_conf*100:.0f}%) {conf_warn}')
        print(f'  Note: {test.get("note", "")}')
        if status == '✗':
            expected = test.get('expected', test.get('ambiguous_between', 'N/A'))
            print(f'  Expected: {expected}')
        print()
    
    # Summary
    total = len(EDGE_CASES)
    print("=" * 100)
    print("📊 Stress Test Summary\n")
    print(f"  Correct: {results['correct']}/{total} ({results['correct']/total*100:.1f}%)")
    print(f"  Incorrect: {results['incorrect']}/{total}")
    print(f"  Ambiguous (acceptable): {results['ambiguous']}/{total}")
    print(f"  Low Confidence (<85%): {results['low_conf']}/{total}")
    print()


if __name__ == "__main__":
    main()
