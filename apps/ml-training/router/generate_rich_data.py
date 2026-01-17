#!/usr/bin/env python3
"""Generate RICH training data with many variations per tool."""

import json
import random
import re
from pathlib import Path

# Variations for richer data
PREFIXES = [
    "", "Hey, ", "Um, ", "So, ", "Actually, ", "I think ", "Maybe ", 
    "Can you ", "Would you ", "Please ", "I need to ", "Help me ",
    "I want to ", "I'd like to ", "Let's ", "Can we ", "I'm trying to ",
]

SUFFIXES = [
    "", " please", " for me", " right now", " if you can", " when you get a chance",
    ", thanks", " asap", " real quick", " today", " soon",
]

ACTION_TEMPLATES = [
    "{action}",
    "help me {action}",
    "I need to {action}",
    "can you {action}",
    "let's {action}",
    "I want to {action}",
    "how do I {action}",
    "assist me with {action}",
    "guide me through {action}",
    "help with {action}",
    "support me in {action}",
    "{action} for me",
]

DOMAIN_KEYWORDS = {
    "grief": ["loss", "grieving", "lost", "passed away", "died", "mourning", "bereavement"],
    "anger": ["angry", "mad", "frustrated", "furious", "rage", "irritated", "upset"],
    "anxiety": ["anxious", "worried", "stressed", "nervous", "panicking", "overwhelmed"],
    "habit": ["habit", "routine", "daily", "track", "log", "streak", "practice"],
    "career": ["job", "work", "career", "interview", "salary", "promotion", "professional"],
    "relationship": ["relationship", "partner", "spouse", "friend", "family", "connection"],
    "health": ["health", "exercise", "sleep", "diet", "wellness", "fitness", "medical"],
    "music": ["music", "song", "playlist", "play", "listen", "tune", "track"],
    "calendar": ["calendar", "schedule", "meeting", "appointment", "event", "reminder"],
    "memory": ["remember", "recall", "told you", "mentioned", "know about"],
}

def camel_to_words(name):
    return re.sub(r'([A-Z])', r' \1', name).strip().lower()

def generate_queries(tool_id, target=50):
    queries = set()
    action = camel_to_words(tool_id)
    
    # Handoff special case
    if tool_id.startswith("handoffTo"):
        persona = tool_id.replace("handoffTo", "")
        base = [
            f"transfer to {persona}", f"talk to {persona}", f"speak with {persona}",
            f"switch to {persona}", f"connect me with {persona}", f"let me talk to {persona}",
            f"can I talk to {persona}", f"I want {persona}", f"get {persona}",
        ]
        for b in base:
            for p in PREFIXES[:8]:
                for s in SUFFIXES[:5]:
                    queries.add(f"{p}{b}{s}".strip())
                    if len(queries) >= target:
                        return list(queries)[:target]
        return list(queries)[:target]
    
    # Detect domain for context words
    tool_lower = tool_id.lower()
    domain_words = []
    for domain, keywords in DOMAIN_KEYWORDS.items():
        if domain in tool_lower:
            domain_words = keywords
            break
    
    # Generate from templates
    for template in ACTION_TEMPLATES:
        base = template.format(action=action)
        for prefix in PREFIXES:
            for suffix in SUFFIXES:
                q = f"{prefix}{base}{suffix}".strip()
                if q:
                    queries.add(q)
                if len(queries) >= target * 2:
                    break
            if len(queries) >= target * 2:
                break
    
    # Add domain-specific variants
    for word in domain_words[:3]:
        queries.add(f"I'm {word} about something")
        queries.add(f"Help me with {word}")
        queries.add(f"I need support with {word}")
    
    # Dedupe and return
    return list(queries)[:target]

def main():
    tool_file = Path("/tmp/all-tools.txt")
    all_tools = [l.strip() for l in tool_file.read_text().split("\n") if l.strip()]
    print(f"Generating rich data for {len(all_tools)} tools...")
    
    examples = []
    target_per_tool = 50
    
    for i, tool in enumerate(all_tools):
        queries = generate_queries(tool, target_per_tool)
        for q in queries:
            examples.append({"query": q, "selected_tools": [tool]})
        if (i + 1) % 100 == 0:
            print(f"  Processed {i+1}/{len(all_tools)} tools...")
    
    print(f"Generated {len(examples)} examples ({len(examples)/len(all_tools):.1f} per tool)")
    random.shuffle(examples)
    
    n = len(examples)
    train = examples[:int(n*0.85)]
    val = examples[int(n*0.85):int(n*0.925)]
    test = examples[int(n*0.925):]
    
    out_dir = Path("/Users/sethford/Documents/voiceai/data/ftis-training-rich")
    out_dir.mkdir(parents=True, exist_ok=True)
    
    for name, data in [("train", train), ("validation", val), ("test", test)]:
        with open(out_dir / f"{name}.jsonl", 'w') as f:
            for item in data:
                f.write(json.dumps(item) + '\n')
    
    label_map = {t: i for i, t in enumerate(sorted(all_tools))}
    with open(out_dir / "label_map.json", 'w') as f:
        json.dump(label_map, f, indent=2)
    
    print(f"\nSaved to {out_dir}")
    print(f"Train: {len(train)}, Val: {len(val)}, Test: {len(test)}")
    print(f"Labels: {len(label_map)}")

if __name__ == "__main__":
    main()
