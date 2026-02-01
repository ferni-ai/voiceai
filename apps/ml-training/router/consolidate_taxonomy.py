#!/usr/bin/env python3
"""Consolidate 71 categories into ~30 for optimal hierarchical classification."""

import json
from pathlib import Path
from collections import defaultdict

OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-full")

# Merge map: old_category -> new_category
MERGE_MAP = {
    # PRODUCTIVITY (~150 tools)
    "calendar": "productivity",
    "tasks": "productivity",
    "reminders": "productivity",
    "notes": "productivity",
    "planning": "productivity",
    "journal": "productivity",
    "organization": "productivity",
    
    # COMMUNICATION (~80 tools)
    "calls": "communication",
    "messaging": "communication",
    "email": "communication",
    "contacts": "communication",
    "conversation": "communication",
    "communication_style": "communication",
    "social_skills": "communication",
    "language": "communication",
    
    # ENTERTAINMENT (~50 tools)
    "music": "entertainment",
    "media": "entertainment",
    "games": "entertainment",
    "random": "entertainment",
    
    # SMART HOME (~45 tools)
    "smart_home": "home",
    "shopping": "home",
    "lifestyle_design": "home",
    
    # HEALTH (~100 tools)
    "fitness": "health",
    "nutrition": "health",
    "sleep": "health",
    "wellness": "health",
    "habits": "health",
    
    # EMOTIONAL SUPPORT (~120 tools)
    "emotional_support": "emotional_support",
    "stress_anxiety": "emotional_support",
    "grief_loss": "emotional_support",
    "coping": "emotional_support",
    "crisis": "emotional_support",
    
    # COACHING (~80 tools)
    "coaching": "personal_growth",
    "mindfulness": "personal_growth",
    "reflection": "personal_growth",
    "self_care": "personal_growth",
    "relationships": "personal_growth",
    "slowdown": "personal_growth",
    "values": "personal_growth",
    "transitions": "personal_growth",
    "wisdom": "personal_growth",
    
    # FINANCE (~60 tools)
    "budget": "finance",
    "bills": "finance",
    "investments": "finance",
    "financial_education": "finance",
    "account": "finance",
    "economic_data": "finance",
    
    # TRAVEL (~15 tools)
    "travel": "travel",
    "navigation": "travel",
    
    # INFORMATION (~60 tools)
    "weather": "information",
    "search": "information",
    "news": "information",
    "time_date": "information",
    "general_knowledge": "information",
    "sports_data": "information",
    
    # SYSTEM (~30 tools)
    "handoff": "system",
    "system": "system",
    "file_operations": "system",
    "consent": "system",
    
    # GAMIFICATION (~60 tools)
    "celebration": "gamification",
    "challenges": "gamification",
    "gamification_badges": "gamification",
    "gratitude": "gamification",
    
    # DECISIONS & ANALYSIS (~30 tools)
    "decisions": "analysis",
    "analysis": "analysis",
    "assessment": "analysis",
    "suggestions": "analysis",
    "proactive": "analysis",
    "practice": "analysis",
    "conversion": "analysis",
    
    # OTHER (catch-all)
    "other": "other",
}

def main():
    # Load current taxonomy
    with open(OUTPUT_DIR / "taxonomy.json") as f:
        old_taxonomy = json.load(f)
    
    # Build new taxonomy
    new_tool_to_category = {}
    new_category_to_tools = defaultdict(list)
    
    for tool, old_cat in old_taxonomy["tool_to_category"].items():
        new_cat = MERGE_MAP.get(old_cat, old_cat)
        new_tool_to_category[tool] = new_cat
        new_category_to_tools[new_cat].append(tool)
    
    # New category descriptions
    CATEGORY_INFO = {
        "productivity": "Calendar, tasks, reminders, notes, planning, and organization",
        "communication": "Calls, messages, email, contacts, and conversation management",
        "entertainment": "Music, movies, games, and fun activities",
        "home": "Smart home control, shopping, and household management",
        "health": "Fitness, nutrition, sleep, wellness, and habits",
        "emotional_support": "Emotional support, stress relief, grief, and crisis help",
        "personal_growth": "Coaching, mindfulness, reflection, self-care, and values",
        "finance": "Budget, bills, investments, and financial education",
        "travel": "Travel planning, directions, and navigation",
        "information": "Weather, search, news, time, and general knowledge",
        "system": "Handoffs, settings, files, and system commands",
        "gamification": "Achievements, badges, celebrations, and gratitude",
        "analysis": "Decisions, analysis, assessments, and suggestions",
        "other": "Miscellaneous tools",
    }
    
    # Create final taxonomy
    taxonomy = {
        "categories": {cat: {"description": CATEGORY_INFO.get(cat, "Uncategorized")} 
                       for cat in new_category_to_tools.keys()},
        "tool_to_category": new_tool_to_category,
        "category_to_tools": dict(new_category_to_tools),
    }
    
    # Print summary
    print("📊 Consolidated Category Distribution:")
    print("=" * 60)
    total = 0
    for cat in sorted(taxonomy["category_to_tools"].keys()):
        tools = taxonomy["category_to_tools"][cat]
        print(f"  {cat}: {len(tools)} tools")
        total += len(tools)
    
    print(f"\n✅ Total tools: {total}")
    print(f"📁 Total categories: {len(taxonomy['category_to_tools'])}")
    
    # Save
    with open(OUTPUT_DIR / "taxonomy_consolidated.json", "w") as f:
        json.dump(taxonomy, f, indent=2)
    
    print(f"\n💾 Saved to {OUTPUT_DIR / 'taxonomy_consolidated.json'}")
    
    # Also create hierarchy file for training
    hierarchy = {cat: tools for cat, tools in taxonomy["category_to_tools"].items()}
    with open(OUTPUT_DIR / "hierarchy.json", "w") as f:
        json.dump(hierarchy, f, indent=2)
    
    print(f"💾 Saved hierarchy to {OUTPUT_DIR / 'hierarchy.json'}")

if __name__ == "__main__":
    main()
