#!/usr/bin/env python3
"""
Merge all training data sources into the final V6 training dataset.

Sources:
1. train_v5_860.jsonl (399,452 examples) - base dataset with all 860 tools
2. hard_negatives_v6.jsonl (~600 examples) - disambiguation for confusion pairs
3. open_intent_boost_v6.jsonl (~50,000 examples) - boost __no_tool__ to ~25%

Output:
- data/train_v6.jsonl - merged training set
- data/validation_v6.jsonl - validation set (uses existing + samples)

Usage:
  python3 merge_v6_dataset.py
  python3 merge_v6_dataset.py --dry-run
"""

import argparse
import json
import random
import sys
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

BASE_FILE = DATA_DIR / "train_v5_860.jsonl"
HARD_NEGATIVES = DATA_DIR / "hard_negatives_v6.jsonl"
OPEN_INTENT_BOOST = DATA_DIR / "open_intent_boost_v6.jsonl"
VALIDATION_BASE = DATA_DIR / "validation_v5_860.jsonl"

OUTPUT_TRAIN = DATA_DIR / "train_v6.jsonl"
OUTPUT_VALIDATION = DATA_DIR / "validation_v6.jsonl"

# Validation split ratio from hard negatives and open intent
VALIDATION_SPLIT = 0.1  # 10% of new data goes to validation


def load_jsonl(path: Path) -> list[dict]:
    """Load JSONL file."""
    if not path.exists():
        print(f"  WARNING: {path} not found, skipping")
        return []
    records = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                records.append(json.loads(line))
    return records


def write_jsonl(path: Path, records: list[dict]):
    """Write JSONL file."""
    with open(path, "w") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")


def analyze_dataset(records: list[dict], name: str):
    """Print dataset statistics."""
    tool_counts = Counter()
    open_count = 0
    sources = Counter()

    for rec in records:
        tools = rec.get("selected_tools", [])
        if not tools or rec.get("is_open_intent", False):
            open_count += 1
            tool_counts["__no_tool__"] += 1
        else:
            for t in tools:
                tool_counts[t] += 1
        sources[rec.get("source", "unknown")] += 1

    total = len(records)
    unique_tools = len(tool_counts)
    open_pct = open_count / total * 100 if total > 0 else 0

    print(f"\n  === {name} ===")
    print(f"  Total examples: {total:,}")
    print(f"  Unique tools: {unique_tools}")
    print(f"  Open intent: {open_count:,} ({open_pct:.1f}%)")

    # Zero-example check
    label_map_path = Path(__file__).parent.parent.parent.parent / "models/ferni-router-v5-860/label_map.json"
    if label_map_path.exists():
        with open(label_map_path) as f:
            label_map = json.load(f)
        zero_tools = [t for t in label_map if t != "__no_tool__" and tool_counts.get(t, 0) == 0]
        print(f"  Zero-example tools: {len(zero_tools)}")
        if zero_tools:
            print(f"    First 10: {zero_tools[:10]}")

    # Min/max examples per tool
    non_open = {k: v for k, v in tool_counts.items() if k != "__no_tool__"}
    if non_open:
        min_tool = min(non_open, key=non_open.get)
        max_tool = max(non_open, key=non_open.get)
        print(f"  Min examples: {min_tool} ({non_open[min_tool]})")
        print(f"  Max examples: {max_tool} ({non_open[max_tool]})")

    print(f"  Sources:")
    for src, count in sources.most_common():
        print(f"    {src}: {count:,} ({count/total*100:.1f}%)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()

    print("=" * 60)
    print("FTIS V6: Dataset Merger")
    print("=" * 60)

    # Load sources
    print("\nLoading data sources...")
    base = load_jsonl(BASE_FILE)
    print(f"  Base (train_v5_860): {len(base):,}")

    hard_neg = load_jsonl(HARD_NEGATIVES)
    print(f"  Hard negatives: {len(hard_neg):,}")

    open_boost = load_jsonl(OPEN_INTENT_BOOST)
    print(f"  Open intent boost: {len(open_boost):,}")

    validation_base = load_jsonl(VALIDATION_BASE)
    print(f"  Validation base: {len(validation_base):,}")

    # Split new data into train/validation
    random.seed(42)

    hn_val_count = int(len(hard_neg) * VALIDATION_SPLIT)
    random.shuffle(hard_neg)
    hn_train = hard_neg[hn_val_count:]
    hn_val = hard_neg[:hn_val_count]

    oi_val_count = int(len(open_boost) * VALIDATION_SPLIT)
    random.shuffle(open_boost)
    oi_train = open_boost[oi_val_count:]
    oi_val = open_boost[:oi_val_count]

    # Merge training
    train_records = base + hn_train + oi_train
    random.shuffle(train_records)

    # Merge validation
    val_records = validation_base + hn_val + oi_val
    random.shuffle(val_records)

    # Analyze
    analyze_dataset(train_records, "TRAINING SET (V6)")
    analyze_dataset(val_records, "VALIDATION SET (V6)")

    if args.dry_run:
        print("\n[DRY RUN] Would write:")
        print(f"  {OUTPUT_TRAIN}: {len(train_records):,} records")
        print(f"  {OUTPUT_VALIDATION}: {len(val_records):,} records")
        return

    # Write
    print(f"\nWriting {OUTPUT_TRAIN}...")
    write_jsonl(OUTPUT_TRAIN, train_records)
    print(f"Writing {OUTPUT_VALIDATION}...")
    write_jsonl(OUTPUT_VALIDATION, val_records)

    print(f"\n{'=' * 60}")
    print(f"Done! Files written:")
    print(f"  Train: {OUTPUT_TRAIN} ({len(train_records):,} records)")
    print(f"  Validation: {OUTPUT_VALIDATION} ({len(val_records):,} records)")
    print(f"\nNext steps:")
    print(f"  1. Update config.yaml to point to train_v6.jsonl / validation_v6.jsonl")
    print(f"  2. Upload to GCE training VM")
    print(f"  3. Run training: python train.py --config config.yaml")


if __name__ == "__main__":
    main()
