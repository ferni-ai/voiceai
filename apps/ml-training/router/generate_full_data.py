#!/usr/bin/env python3
"""Generate training data for ALL tools."""

import json
import random
import re
from pathlib import Path

GENERIC_TEMPLATES = [
    "Help me {action}",
    "I need help with {action}",
    "Can you {action}",
    "I want to {action}",
    "{action} please",
    "Let's {action}",
    "I'd like to {action}",
    "How do I {action}",
]

def camel_to_words(name):
    return re.sub(r'([A-Z])', r' \1', name).strip().lower()

def generate_queries(tool_id, n=12):
    queries = []
    action = camel_to_words(tool_id)
    
    # Special case: handoffs
    if tool_id.startswith("handoffTo"):
        persona = tool_id.replace("handoffTo", "")
        return [
            f"Transfer me to {persona}",
            f"I want to talk to {persona}",
            f"Let me speak with {persona}",
            f"Can {persona} help me",
            f"Switch to {persona}",
            f"Connect me with {persona}",
        ][:n]
    
    for t in GENERIC_TEMPLATES:
        queries.append(t.format(action=action))
    
    queries.extend([
        f"I need to {action}",
        f"Help with {action}",
        f"{action.capitalize()}",
        f"Can we {action}",
    ])
    
    return list(set(queries))[:n]

def main():
    tool_file = Path("/tmp/all-tools.txt")
    all_tools = [l.strip() for l in tool_file.read_text().split("\n") if l.strip()]
    print(f"Generating for {len(all_tools)} tools...")
    
    examples = []
    for tool in all_tools:
        queries = generate_queries(tool)
        for q in queries:
            examples.append({"query": q, "selected_tools": [tool]})
    
    print(f"Generated {len(examples)} examples")
    random.shuffle(examples)
    
    n = len(examples)
    train = examples[:int(n*0.8)]
    val = examples[int(n*0.8):int(n*0.9)]
    test = examples[int(n*0.9):]
    
    out_dir = Path("/Users/sethford/Documents/voiceai/data/ftis-training-full")
    out_dir.mkdir(parents=True, exist_ok=True)
    
    for name, data in [("train", train), ("validation", val), ("test", test)]:
        with open(out_dir / f"{name}.jsonl", 'w') as f:
            for item in data:
                f.write(json.dumps(item) + '\n')
    
    label_map = {t: i for i, t in enumerate(sorted(all_tools))}
    with open(out_dir / "label_map.json", 'w') as f:
        json.dump(label_map, f, indent=2)
    
    print(f"Saved to {out_dir}")
    print(f"Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")
    print(f"Labels: {len(label_map)}")

if __name__ == "__main__":
    main()
