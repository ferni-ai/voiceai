#!/usr/bin/env python3
"""
Merge suggested training data from dynamic validation into the training set.
Converts from {input, labels} format to {query, selected_tools, ...} format.
"""

import json
import os
from datetime import datetime

DATA_DIR = os.path.dirname(os.path.abspath(__file__)) + '/data'
SUGGESTED_FILE = f'{DATA_DIR}/suggested_training_data.jsonl'
TRAIN_FILE = f'{DATA_DIR}/train.jsonl'
HARD_NEGATIVES_FILE = f'{DATA_DIR}/hard_negatives_v4.jsonl'

def load_jsonl(filepath):
    """Load JSONL file."""
    data = []
    with open(filepath, 'r') as f:
        for line in f:
            if line.strip():
                data.append(json.loads(line))
    return data

def save_jsonl(data, filepath):
    """Save data to JSONL file."""
    with open(filepath, 'w') as f:
        for item in data:
            f.write(json.dumps(item) + '\n')

def convert_suggested_to_training(suggested_data, start_id=0):
    """Convert suggested data format to training format."""
    converted = []
    timestamp = int(datetime.now().timestamp() * 1000)

    for i, item in enumerate(suggested_data):
        converted.append({
            'id': f'suggested_{timestamp}_{start_id + i}',
            'query': item['input'],
            'selected_tools': item['labels'],
            'is_open_intent': False,
            'source': 'suggested_from_validation'
        })

    return converted

def main():
    print("Loading suggested training data...")
    suggested = load_jsonl(SUGGESTED_FILE)
    print(f"  Found {len(suggested)} suggested examples")

    print("\nLoading existing training data...")
    train_data = load_jsonl(TRAIN_FILE)
    print(f"  Found {len(train_data)} existing training examples")

    # Check for duplicates
    existing_queries = set(item['query'].lower().strip() for item in train_data)

    # Convert and filter duplicates
    converted = convert_suggested_to_training(suggested)
    new_examples = []
    duplicates = 0

    for item in converted:
        if item['query'].lower().strip() not in existing_queries:
            new_examples.append(item)
            existing_queries.add(item['query'].lower().strip())
        else:
            duplicates += 1

    print(f"\nFiltered {duplicates} duplicate queries")
    print(f"Adding {len(new_examples)} new training examples")

    # Append to training data
    train_data.extend(new_examples)

    # Save updated training data
    print(f"\nSaving updated training data ({len(train_data)} total examples)...")
    save_jsonl(train_data, TRAIN_FILE)

    # Also save to hard negatives for reference
    print(f"Appending to hard_negatives_v4.jsonl...")
    hard_negatives = load_jsonl(HARD_NEGATIVES_FILE) if os.path.exists(HARD_NEGATIVES_FILE) else []
    hard_negatives.extend(new_examples)
    save_jsonl(hard_negatives, HARD_NEGATIVES_FILE)

    print("\n✅ Done! Training data updated.")
    print(f"   Total training examples: {len(train_data)}")
    print(f"   New examples added: {len(new_examples)}")

    # Show sample of added data
    print("\nSample of added examples:")
    for item in new_examples[:5]:
        print(f"  • \"{item['query'][:60]}...\" → {item['selected_tools']}")

if __name__ == '__main__':
    main()
