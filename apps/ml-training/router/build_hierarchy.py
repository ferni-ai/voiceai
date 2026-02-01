#!/usr/bin/env python3
"""
Build a clean hierarchical tool taxonomy for FTIS.

Categories are organized by DOMAIN (area of life), not action verbs.
Names are human-readable and follow consistent patterns.
"""

import json
import re
from pathlib import Path
from collections import defaultdict

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
OUTPUT_DIR = Path("/Users/sethford/Documents/voiceai/models/ftis-hierarchical-full")

# Clean, human-readable category definitions
CATEGORIES = {
    # ===== PRODUCTIVITY =====
    "calendar": {
        "description": "Scheduling, appointments, events, and time management",
        "keywords": ["calendar", "schedule", "appointment", "event", "meeting", "booking", "availability", "reservation"],
    },
    "tasks": {
        "description": "To-do lists, tasks, checklists, and task management",
        "keywords": ["task", "todo", "checklist", "item", "complete", "deadline", "step", "action"],
    },
    "reminders": {
        "description": "Reminders, alarms, timers, and time-based notifications",
        "keywords": ["reminder", "alarm", "timer", "alert", "notify", "snooze"],
    },
    "notes": {
        "description": "Notes, memos, voice recordings, and memory",
        "keywords": ["note", "memo", "voice", "record", "remember", "memory", "capture", "quick"],
    },
    "planning": {
        "description": "Goal setting, planning, strategy, and long-term thinking",
        "keywords": ["plan", "goal", "milestone", "strategy", "vision", "annual", "quarterly", "legacy", "purpose"],
    },
    
    # ===== COMMUNICATION =====
    "calls": {
        "description": "Phone calls, video calls, and voice communication",
        "keywords": ["call", "phone", "dial", "voicemail", "ring"],
    },
    "messaging": {
        "description": "Text messages, chat, and instant messaging",
        "keywords": ["message", "text", "sms", "chat", "send", "reply", "respond"],
    },
    "email": {
        "description": "Email sending, reading, and management",
        "keywords": ["email", "mail", "inbox", "draft"],
    },
    "contacts": {
        "description": "Contact management and address book",
        "keywords": ["contact", "person", "friend", "family", "connection", "circle"],
    },
    
    # ===== LIFESTYLE =====
    "music": {
        "description": "Music playback, playlists, and audio entertainment",
        "keywords": ["music", "song", "playlist", "artist", "album", "spotify", "sonos", "volume", "pause", "resume", "skip", "playing"],
    },
    "media": {
        "description": "Movies, TV, podcasts, books, and entertainment recommendations",
        "keywords": ["movie", "show", "tv", "podcast", "book", "video", "stream", "watch", "watchlist"],
    },
    "games": {
        "description": "Games, puzzles, trivia, and entertainment activities",
        "keywords": ["game", "trivia", "quiz", "puzzle", "joke", "fun"],
    },
    
    # ===== HOME =====
    "smart_home": {
        "description": "Lights, thermostat, locks, and home automation",
        "keywords": ["light", "thermostat", "lock", "door", "garage", "scene", "room"],
    },
    "shopping": {
        "description": "Shopping lists, orders, and purchases",
        "keywords": ["shop", "buy", "order", "cart", "list", "purchase", "delivery", "package", "registry", "gift"],
    },
    
    # ===== HEALTH =====
    "fitness": {
        "description": "Exercise, workouts, and physical activity tracking",
        "keywords": ["exercise", "workout", "fitness", "gym", "activity", "steps", "run"],
    },
    "nutrition": {
        "description": "Food, meals, diet, and nutrition tracking",
        "keywords": ["food", "meal", "eat", "diet", "nutrition", "calorie", "recipe", "restaurant", "cook"],
    },
    "sleep": {
        "description": "Sleep tracking and bedtime routines",
        "keywords": ["sleep", "bedtime", "wake", "rest", "nap", "dream"],
    },
    "wellness": {
        "description": "General health, medication, and wellness checks",
        "keywords": ["health", "medication", "medicine", "doctor", "symptom", "water", "hydration", "body"],
    },
    "habits": {
        "description": "Habit tracking, streaks, and behavior patterns",
        "keywords": ["habit", "streak", "routine", "daily", "track", "log", "behavior"],
    },
    
    # ===== MENTAL HEALTH =====
    "emotional_support": {
        "description": "Emotional support, validation, and comfort",
        "keywords": ["feeling", "emotion", "support", "comfort", "validate", "acknowledge", "listen", "empathy", "express"],
    },
    "stress_anxiety": {
        "description": "Stress management, anxiety relief, and grounding",
        "keywords": ["stress", "anxiety", "calm", "relax", "breathe", "ground", "panic", "overwhelm"],
    },
    "mindfulness": {
        "description": "Meditation, mindfulness, and presence",
        "keywords": ["meditat", "mindful", "focus", "present", "awareness", "moment", "notice"],
    },
    "coaching": {
        "description": "Life coaching, motivation, and personal growth",
        "keywords": ["coach", "motivat", "inspire", "growth", "potential", "strength", "encourage", "accountable"],
    },
    "grief_loss": {
        "description": "Grief support, loss processing, and healing",
        "keywords": ["grief", "loss", "mourn", "death", "heal", "cope", "ending"],
    },
    "relationships": {
        "description": "Relationship advice, breakups, and interpersonal support",
        "keywords": ["relationship", "partner", "breakup", "dating", "love", "conflict", "amend"],
    },
    "self_care": {
        "description": "Self-compassion, boundaries, and personal care",
        "keywords": ["self", "compassion", "boundary", "care", "worth", "imposter", "critic", "permission"],
    },
    "reflection": {
        "description": "Self-reflection, insights, and personal understanding",
        "keywords": ["reflect", "insight", "understand", "explore", "discover", "identity", "chapter", "who"],
    },
    "celebration": {
        "description": "Celebrations, achievements, and positive moments",
        "keywords": ["celebrat", "achieve", "win", "success", "accomplish", "pride", "congratulat", "badge", "xp"],
    },
    "gratitude": {
        "description": "Gratitude practices and appreciation",
        "keywords": ["gratitude", "grateful", "thankful", "appreciat", "thank"],
    },
    
    # ===== FINANCE =====
    "budget": {
        "description": "Budgeting, spending tracking, and financial planning",
        "keywords": ["budget", "spend", "expense", "money", "cost", "saving", "cash", "afford"],
    },
    "bills": {
        "description": "Bill management and payments",
        "keywords": ["bill", "pay", "due", "payment", "subscription", "debt"],
    },
    "investments": {
        "description": "Investments, portfolio, and financial markets",
        "keywords": ["invest", "stock", "portfolio", "market", "fund", "return", "retire", "fire"],
    },
    "financial_education": {
        "description": "Financial concepts and education",
        "keywords": ["explain", "concept", "banking", "mortgage", "interest", "compound", "calculate"],
    },
    
    # ===== TRAVEL =====
    "travel": {
        "description": "Travel planning, flights, hotels, and trips",
        "keywords": ["travel", "trip", "flight", "hotel", "vacation", "booking", "airport", "pack", "accommodation"],
    },
    "navigation": {
        "description": "Directions, maps, and location services",
        "keywords": ["direction", "map", "route", "location", "traffic", "commute", "navigate"],
    },
    
    # ===== INFORMATION =====
    "weather": {
        "description": "Weather forecasts and conditions",
        "keywords": ["weather", "forecast", "rain", "sun", "climate"],
    },
    "search": {
        "description": "Web search, information lookup, and research",
        "keywords": ["search", "find", "look", "google", "web", "info", "research", "business"],
    },
    "news": {
        "description": "News, current events, and updates",
        "keywords": ["news", "headline", "current"],
    },
    "time_date": {
        "description": "Time, date, timezone, and clock functions",
        "keywords": ["time", "date", "clock", "timezone", "day", "week", "month", "year", "age", "until"],
    },
    "general_knowledge": {
        "description": "Facts, quotes, and general information",
        "keywords": ["fact", "quote", "bogle", "philly", "wisdom", "parallel", "story", "ancient"],
    },
    
    # ===== SYSTEM =====
    "handoff": {
        "description": "Transfer to another team member or persona",
        "keywords": ["handoff", "transfer", "maya", "peter", "alex", "jordan", "nayan", "ferni", "team"],
    },
    "system": {
        "description": "System commands, settings, and capabilities",
        "keywords": ["system", "setting", "config", "capability", "status", "language", "git", "bash"],
    },
    "conversation": {
        "description": "Conversation flow, greetings, and meta-conversation",
        "keywords": ["greet", "goodbye", "clarify", "repeat", "conversation", "hello", "defer", "what", "know"],
    },
    "crisis": {
        "description": "Crisis support and emergency resources",
        "keywords": ["crisis", "emergency", "resource", "hotline", "urgent", "safe"],
    },
    "assessment": {
        "description": "Assessments, evaluations, and check-ins",
        "keywords": ["assess", "evaluat", "check", "level", "score", "tendenc", "domain", "readiness"],
    },
    "suggestions": {
        "description": "Recommendations and suggestions",
        "keywords": ["suggest", "recommend", "offer", "provide", "tip"],
    },
    "analysis": {
        "description": "Analysis and pattern detection",
        "keywords": ["analyz", "pattern", "detect", "pros", "cons", "compare"],
    },
    "conversion": {
        "description": "Unit conversions and calculations",
        "keywords": ["convert", "unit", "temperature", "currency"],
    },
    "organization": {
        "description": "Organization and decluttering",
        "keywords": ["organiz", "document", "space", "declutter", "clean"],
    },
    "practice": {
        "description": "Practice, preparation, and rehearsal",
        "keywords": ["practice", "prepar", "interview", "rehearse", "second"],
    },
    "challenges": {
        "description": "Challenges, gamification, and progress tracking",
        "keywords": ["challenge", "leaderboard", "xp", "badge", "reward", "level", "master", "halfway"],
    },
    "consent": {
        "description": "Consent and permissions",
        "keywords": ["consent", "permission", "privacy", "notification", "enable"],
    },
    "coping": {
        "description": "Coping strategies and emotional processing",
        "keywords": ["embrace", "hold", "process", "setback", "shame", "barrier", "resistance", "anchor"],
    },
    "proactive": {
        "description": "Proactive outreach and follow-ups",
        "keywords": ["proactive", "opportunity", "followup", "cameo", "anticipat", "build"],
    },
    "wisdom": {
        "description": "Wisdom, perspective, and life lessons",
        "keywords": ["wisdom", "perspective", "conclude", "takeaway", "deep", "truth"],
    },
    "account": {
        "description": "Account management and balances",
        "keywords": ["account", "balance", "bank", "link"],
    },
    "communication_style": {
        "description": "Communication patterns and preferences",
        "keywords": ["communicat", "summary", "preference", "style"],
    },
    "decisions": {
        "description": "Decision making and major choices",
        "keywords": ["decisi", "decide", "framework", "choice", "frame", "walk"],
    },
    "journal": {
        "description": "Journaling and morning briefings",
        "keywords": ["journal", "briefing", "prompt", "morning", "write"],
    },
    "language": {
        "description": "Translation and language learning",
        "keywords": ["translat", "phrase", "pronounc", "language", "term", "define"],
    },
    "random": {
        "description": "Random selections and chance",
        "keywords": ["random", "coin", "dice", "pick", "roll", "flip"],
    },
    "lifestyle_design": {
        "description": "Life design and environment optimization",
        "keywords": ["environment", "design", "space", "quiet", "target", "preview"],
    },
    "social_skills": {
        "description": "Social interactions and communication skills",
        "keywords": ["pushback", "opening", "tone", "negotiat", "roleplay", "announce", "introduce", "vibe"],
    },
    "slowdown": {
        "description": "Slowing down and presence",
        "keywords": ["slow", "silence", "sit", "enough", "release", "protect"],
    },
    "transitions": {
        "description": "Life transitions and new beginnings",
        "keywords": ["adapt", "normal", "transit", "begin", "shift", "chapter", "lost", "reclaim"],
    },
    "values": {
        "description": "Values exploration and alignment",
        "keywords": ["value", "align", "giving", "ethical", "will", "beneficiar"],
    },
    "sports_data": {
        "description": "Sports scores and information",
        "keywords": ["sport", "score", "game"],
    },
    "economic_data": {
        "description": "Economic indicators and data",
        "keywords": ["inflation", "treasury", "yield", "unemploy", "gdp", "fed", "rate"],
    },
    "file_operations": {
        "description": "File reading and editing",
        "keywords": ["file", "read", "edit", "import", "export"],
    },
    "gamification_badges": {
        "description": "Achievement badges and gamification profiles",
        "keywords": ["club", "fighter", "bird", "owl", "tamer", "newcomer", "established", "fighter", "rounded", "start"],
    },
}

def categorize_tool(tool_name: str) -> str:
    """Categorize a tool based on its name."""
    tool_lower = tool_name.lower()
    
    # Score each category
    scores = {}
    for category, config in CATEGORIES.items():
        score = 0
        for keyword in config["keywords"]:
            if keyword in tool_lower:
                # Exact word match scores higher
                if re.search(rf'\b{keyword}\b', tool_lower):
                    score += 3
                else:
                    score += 1
        scores[category] = score
    
    # Return highest scoring category, or 'other' if no match
    best = max(scores.items(), key=lambda x: x[1])
    if best[1] > 0:
        return best[0]
    return "other"

def main():
    # Load tools
    with open(DATA_DIR / "label_map.json") as f:
        tools = list(json.load(f).keys())
    
    print(f"📊 Categorizing {len(tools)} tools into {len(CATEGORIES)} categories...")
    
    # Categorize all tools
    categorized = defaultdict(list)
    for tool in tools:
        category = categorize_tool(tool)
        categorized[category].append(tool)
    
    # Print summary
    print("\n" + "=" * 60)
    print("📋 TOOL TAXONOMY")
    print("=" * 60)
    
    total = 0
    for cat in sorted(categorized.keys()):
        tool_list = categorized[cat]
        desc = CATEGORIES.get(cat, {}).get("description", "Uncategorized")
        print(f"\n{cat.upper()} ({len(tool_list)} tools)")
        print(f"  {desc}")
        for t in tool_list[:5]:
            print(f"    - {t}")
        if len(tool_list) > 5:
            print(f"    ... and {len(tool_list) - 5} more")
        total += len(tool_list)
    
    print("\n" + "=" * 60)
    print(f"✅ Total categorized: {total} tools")
    print(f"📁 Categories: {len(categorized)}")
    
    # Check for 'other' category
    if "other" in categorized:
        print(f"\n⚠️ {len(categorized['other'])} tools in 'other' - need review:")
        for t in categorized["other"][:20]:
            print(f"  - {t}")
    
    # Save taxonomy
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    taxonomy = {
        "categories": {cat: CATEGORIES.get(cat, {"description": "Uncategorized"}) 
                       for cat in categorized.keys()},
        "tool_to_category": {tool: categorize_tool(tool) for tool in tools},
        "category_to_tools": dict(categorized),
    }
    
    with open(OUTPUT_DIR / "taxonomy.json", "w") as f:
        json.dump(taxonomy, f, indent=2)
    
    print(f"\n💾 Saved taxonomy to {OUTPUT_DIR / 'taxonomy.json'}")
    
    return categorized

if __name__ == "__main__":
    main()
