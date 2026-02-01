"""
V7 Relabel: Transform V6 flat-label data → V7 hierarchical labels

Reads V6 JSONL files and produces two new datasets:
  1. Stage 1 data: query → domain (44 classes)
  2. Stage 2 data: query → meta_tool (per-domain, 2-8 classes each)

Usage:
    python v7_relabel.py --input data/train_v6.jsonl --output-dir data/v7/

Output files:
    data/v7/stage1_train.jsonl       # query → domain
    data/v7/stage2_train.jsonl       # query → meta_tool (with domain field)
    data/v7/domain_label_map.json    # domain → index
    data/v7/meta_label_maps.json     # {domain: {meta_tool: index}}
    data/v7/stats.json               # Statistics
"""

import argparse
import json
import sys
from pathlib import Path
from collections import Counter

# Allow import from same directory
sys.path.insert(0, str(Path(__file__).parent))
from v7_taxonomy import TAXONOMY, DOMAINS, META_TOOLS_BY_DOMAIN, ALL_META_TOOLS


def relabel_file(input_path: str, output_dir: str, split_name: str) -> dict:
    """Relabel a single JSONL file into stage1 + stage2 formats."""

    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    stage1_path = out / f"stage1_{split_name}.jsonl"
    stage2_path = out / f"stage2_{split_name}.jsonl"

    stats = {
        "total": 0,
        "unmapped": 0,
        "unmapped_tools": [],
        "domain_counts": Counter(),
        "meta_counts": Counter(),
    }

    with (
        open(input_path) as fin,
        open(stage1_path, "w") as f_s1,
        open(stage2_path, "w") as f_s2,
    ):
        for line in fin:
            line = line.strip()
            if not line:
                continue

            row = json.loads(line)
            stats["total"] += 1

            # V6 format: {"query": "...", "selected_tools": ["toolName"]}
            query = row.get("query", "")
            tools_list = row.get("selected_tools", [])

            # Handle list format: empty list = __no_tool__, otherwise first element
            if not tools_list:
                tool = "__no_tool__"
            elif isinstance(tools_list, list):
                tool = tools_list[0]
            else:
                tool = str(tools_list)

            if tool not in TAXONOMY:
                stats["unmapped"] += 1
                if tool not in stats["unmapped_tools"]:
                    stats["unmapped_tools"].append(tool)
                continue

            mapping = TAXONOMY[tool]
            domain = mapping.domain
            meta_tool = mapping.meta_tool

            stats["domain_counts"][domain] += 1
            stats["meta_counts"][meta_tool] += 1

            # Stage 1: query → domain (selected_tools format for train.py compatibility)
            f_s1.write(json.dumps({
                "query": query,
                "selected_tools": [domain],
                "original_tool": tool,
            }) + "\n")

            # Stage 2: [domain] query → meta_tool (selected_tools format for train.py)
            f_s2.write(json.dumps({
                "query": f"[{domain}] {query}",
                "selected_tools": [meta_tool],
                "domain": domain,
                "original_tool": tool,
            }) + "\n")

    return stats


def build_label_maps(output_dir: str):
    """Create label index mappings for training."""

    out = Path(output_dir)

    # Stage 1: domain → index
    domain_map = {d: i for i, d in enumerate(DOMAINS)}
    with open(out / "domain_label_map.json", "w") as f:
        json.dump(domain_map, f, indent=2)

    # Stage 2: per-domain meta_tool → index
    meta_maps = {}
    for domain, meta_tools in META_TOOLS_BY_DOMAIN.items():
        meta_maps[domain] = {mt: i for i, mt in enumerate(meta_tools)}
    with open(out / "meta_label_maps.json", "w") as f:
        json.dump(meta_maps, f, indent=2)

    # Global meta-tool map (for single multi-head model approach)
    global_meta_map = {mt: i for i, mt in enumerate(ALL_META_TOOLS)}
    with open(out / "global_meta_label_map.json", "w") as f:
        json.dump(global_meta_map, f, indent=2)

    return domain_map, meta_maps


def main():
    parser = argparse.ArgumentParser(description="Relabel V6 data for V7 hierarchical training")
    parser.add_argument("--input", default="data/train_v6.jsonl", help="Input JSONL")
    parser.add_argument("--validation", default="data/validation_v6.jsonl", help="Validation JSONL")
    parser.add_argument("--test", default="data/test_v5_860.jsonl", help="Test JSONL")
    parser.add_argument("--output-dir", default="data/v7", help="Output directory")
    args = parser.parse_args()

    print("V7 Hierarchical Relabeling")
    print("=" * 50)

    # Build label maps
    domain_map, meta_maps = build_label_maps(args.output_dir)
    print(f"Domains: {len(domain_map)}")
    print(f"Meta-tools: {sum(len(v) for v in meta_maps.values())}")
    print(f"Max meta-tools in one domain: {max(len(v) for v in meta_maps.values())}")

    # Process each split
    for split_name, path in [
        ("train", args.input),
        ("validation", args.validation),
        ("test", args.test),
    ]:
        if not Path(path).exists():
            print(f"\n⚠️  Skipping {split_name}: {path} not found")
            continue

        print(f"\nProcessing {split_name}: {path}")
        stats = relabel_file(path, args.output_dir, split_name)

        print(f"  Total:    {stats['total']:,}")
        print(f"  Unmapped: {stats['unmapped']}")
        if stats['unmapped_tools']:
            print(f"  Unmapped tools: {stats['unmapped_tools'][:10]}")

        # Save stats
        stats_path = Path(args.output_dir) / f"stats_{split_name}.json"
        serializable = {
            "total": stats["total"],
            "unmapped": stats["unmapped"],
            "unmapped_tools": stats["unmapped_tools"],
            "domain_counts": dict(stats["domain_counts"].most_common()),
            "meta_counts": dict(stats["meta_counts"].most_common()),
        }
        with open(stats_path, "w") as f:
            json.dump(serializable, f, indent=2)

    print(f"\n✅ Output written to {args.output_dir}/")
    print(f"   stage1_*.jsonl  → Domain classification (44 classes)")
    print(f"   stage2_*.jsonl  → Meta-tool classification (112 meta-tools)")
    print(f"   *_label_map.json → Label indices for training")


if __name__ == "__main__":
    main()
