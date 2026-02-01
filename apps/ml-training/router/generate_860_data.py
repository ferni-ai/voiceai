#!/usr/bin/env python3 -u
"""
FTIS V5-860: LLM-Based Training Data Generator

Generates training data for 860 tool labels using Gemini Flash.

Target: ~430k training examples (860 tools × 500+ examples each)
- 80% base tool queries (varied phrasing, ASR noise, emotions)
- 15% open-intent queries (no tool should trigger)
- 5% hard negatives (similar tools, must distinguish)

Usage:
  # Generate all data (takes ~2-4 hours)
  python3 generate_860_data.py --output-dir data --per-tool 500

  # Generate for a single category (for testing)
  python3 generate_860_data.py --output-dir data --category grief --per-tool 50

  # Dry run (show what would be generated)
  python3 generate_860_data.py --dry-run

Requirements:
  - GOOGLE_API_KEY environment variable
  - pip install google-generativeai

Author: Ferni AI
Date: January 2026
"""

import argparse
import asyncio
import json
import os
import random
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from collections import defaultdict
import time

# ==============================================================================
# CONFIGURATION
# ==============================================================================

DEFAULT_LABEL_MAP = Path(__file__).parent / "outputs/ferni-router-v5-boosted/label_map.json"
DEFAULT_OUTPUT_DIR = Path(__file__).parent / "data"

# Generation settings
DEFAULT_EXAMPLES_PER_TOOL = 500
BATCH_SIZE = 5  # Tools per LLM call (smaller for reliable JSON parsing)
RETRY_ATTEMPTS = 3
RETRY_DELAY = 2

# Dataset composition targets
OPEN_INTENT_RATIO = 0.15  # 15% should be no-tool queries
HARD_NEGATIVE_RATIO = 0.05  # 5% should be hard negatives

# ==============================================================================
# TOOL CATEGORY MAPPING (for generating domain-aware examples)
# ==============================================================================

TOOL_CATEGORIES = {
    "grief": {
        "keywords": ["grief", "loss", "death", "bereave", "mourn", "loss", "dying", "funeral"],
        "context": "emotional support for processing loss and grief",
        "emotions": ["sad", "overwhelmed", "numb", "angry", "lost"],
    },
    "anxiety": {
        "keywords": ["anxious", "anxiety", "panic", "worry", "stress", "overwhelm", "escalate"],
        "context": "help with anxiety, stress, and worry",
        "emotions": ["anxious", "stressed", "panicked", "worried", "nervous"],
    },
    "coaching": {
        "keywords": ["coach", "habit", "goal", "progress", "track", "motivation", "encourage"],
        "context": "habit tracking, goal setting, and life coaching",
        "emotions": ["motivated", "stuck", "hopeful", "discouraged", "determined"],
    },
    "dating": {
        "keywords": ["dating", "date", "relationship", "love", "partner", "romantic", "match"],
        "context": "dating advice, relationship guidance, and romantic support",
        "emotions": ["hopeful", "nervous", "excited", "rejected", "confused"],
    },
    "music": {
        "keywords": ["music", "play", "song", "spotify", "sonos", "track", "album", "artist"],
        "context": "music playback, discovery, and control",
        "emotions": ["neutral", "relaxed", "energetic", "melancholy", "happy"],
    },
    "calendar": {
        "keywords": ["calendar", "event", "schedule", "meeting", "appointment", "reminder"],
        "context": "calendar management and scheduling",
        "emotions": ["neutral", "busy", "stressed", "organized", "rushed"],
    },
    "home": {
        "keywords": ["light", "thermostat", "lock", "scene", "device", "smart", "control"],
        "context": "smart home device control",
        "emotions": ["neutral", "tired", "comfortable", "cold", "hot"],
    },
    "wellness": {
        "keywords": ["sleep", "exercise", "hydration", "meal", "symptom", "health", "wellness"],
        "context": "physical wellness tracking and health",
        "emotions": ["tired", "energized", "sick", "healthy", "exhausted"],
    },
    "communication": {
        "keywords": ["call", "message", "email", "text", "contact", "send", "broadcast"],
        "context": "communication with contacts",
        "emotions": ["neutral", "urgent", "caring", "worried", "excited"],
    },
    "productivity": {
        "keywords": ["task", "todo", "project", "priority", "deadline", "organize"],
        "context": "task management and productivity",
        "emotions": ["focused", "overwhelmed", "motivated", "procrastinating", "urgent"],
    },
    "memory": {
        "keywords": ["remember", "memory", "recall", "save", "note", "capture", "store"],
        "context": "personal memory and note storage",
        "emotions": ["nostalgic", "curious", "important", "forgetful", "sentimental"],
    },
    "identity": {
        "keywords": ["identity", "self", "purpose", "values", "meaning", "who", "become"],
        "context": "self-discovery and identity exploration",
        "emotions": ["lost", "curious", "hopeful", "confused", "searching"],
    },
    "family": {
        "keywords": ["family", "parent", "child", "sibling", "elder", "care", "co-parent"],
        "context": "family relationships and caregiving",
        "emotions": ["loving", "frustrated", "worried", "grateful", "exhausted"],
    },
    "career": {
        "keywords": ["job", "career", "work", "interview", "salary", "resume", "layoff"],
        "context": "career guidance and job search",
        "emotions": ["anxious", "hopeful", "discouraged", "ambitious", "burnt out"],
    },
    "handoff": {
        "keywords": ["handoff", "transfer", "alex", "maya", "peter", "jordan", "nayan", "ferni"],
        "context": "transferring conversation to another AI team member",
        "emotions": ["neutral"],
    },
    "game": {
        "keywords": ["game", "play", "trivia", "quiz", "fun", "headline"],
        "context": "games and interactive fun",
        "emotions": ["playful", "competitive", "bored", "curious", "excited"],
    },
    "research": {
        "keywords": ["search", "lookup", "find", "research", "web", "weather", "news"],
        "context": "information lookup and research",
        "emotions": ["curious", "urgent", "casual", "focused"],
    },
}

# Similar tool groups for hard negative generation
SIMILAR_TOOL_GROUPS = [
    # Grief-related
    ["processGrief", "griefSupport", "navigateGriefWave", "validateGrief", "companionInGrief", "grieveWhatWas"],
    # Habit-related
    ["addHabit", "createHabit", "logHabit", "trackHabit", "markHabitComplete", "habitCoaching", "habitStats"],
    # Music-related
    ["playMusic", "pauseMusic", "resumeMusic", "musicControl", "playSonosMusic", "searchMusic", "playMoodMusic"],
    # Calendar-related
    ["createCalendarEvent", "getCalendarEvents", "modifyEvent", "cancelEvent", "rescheduleEvent", "scheduleEvent"],
    # Reminder-related
    ["createReminder", "setReminder", "scheduleReminder", "cancelReminder", "listReminders"],
    # Communication
    ["sendMessage", "sendEmail", "sendSMS", "callContact", "textContact", "scheduleMessage"],
    # Anxiety/grounding
    ["deEscalateAnxiety", "groundingExercise", "breatheWithMe", "calmingTechnique", "groundInBody"],
    # Alarm/timer
    ["createAlarm", "setAlarm", "cancelAlarm", "snoozeAlarm", "setTimer", "createTimer", "checkTimer", "stopTimer"],
    # Handoffs
    ["handoffToAlex", "handoffToMaya", "handoffToPeter", "handoffToJordan", "handoffToNayan", "handoffToFerni"],
    # Identity/self
    ["rebuildIdentity", "rediscoverSelf", "whoAmIBecoming", "exploreIdentityShift", "embraceNewIdentity"],
    # Boundary-related
    ["setBoundary", "maintainBoundary", "boundaryCoaching", "identifyBoundaryNeeds", "setWorkBoundary"],
]

# ==============================================================================
# AUGMENTATION UTILITIES
# ==============================================================================

ASR_SUBSTITUTIONS = {
    "play": ["pray", "plate", "plane"],
    "music": ["muse sick", "musics"],
    "weather": ["whether", "wether"],
    "calendar": ["calender", "colander"],
    "remind": ["remain", "remand"],
    "call": ["coal", "col"],
    "text": ["techs", "tax"],
    "email": ["e mail", "e-mail"],
    "lights": ["lites", "light's"],
    "habit": ["habbit", "have it"],
    "meditation": ["mediation", "medication"],
    "anxious": ["anchous"],
    "therapy": ["their a pee", "the rapy"],
    "grief": ["greef", "grieve"],
    "schedule": ["skedule", "schedual"],
    "alarm": ["a larm", "alerm"],
    "timer": ["tima", "time her"],
    "reminder": ["reminda", "remind her"],
}

FILLER_WORDS = [
    "um", "uh", "like", "you know", "so", "well", "I mean",
    "basically", "actually", "hmm", "let me think", "okay so",
]

EMOTIONAL_MARKERS = {
    "sad": ["I'm feeling down", "it's been hard", "I'm struggling with", "really sad about"],
    "anxious": ["I'm worried about", "freaking out about", "stressed about", "nervous about"],
    "happy": ["I'm so excited about", "great news about", "really happy about", "thrilled about"],
    "angry": ["I'm frustrated with", "really annoyed by", "so mad about"],
    "tired": ["I'm exhausted", "so tired", "barely awake", "can't stay up"],
    "neutral": ["I need to", "can you help with", "let me", "I want to"],
}

URGENCY_MARKERS = {
    "urgent": ["right now", "immediately", "asap", "quick", "hurry"],
    "casual": ["when you get a chance", "no rush", "sometime", "eventually"],
}


def add_asr_noise(text: str, probability: float = 0.1) -> str:
    """Add voice transcription errors."""
    words = text.split()
    result = []
    for word in words:
        if random.random() < probability and word.lower() in ASR_SUBSTITUTIONS:
            result.append(random.choice(ASR_SUBSTITUTIONS[word.lower()]))
        else:
            result.append(word)
    return " ".join(result)


def add_filler_words(text: str, probability: float = 0.2) -> str:
    """Add speech disfluencies."""
    if random.random() < probability:
        filler = random.choice(FILLER_WORDS)
        position = random.choice(["start", "middle"])
        if position == "start":
            return f"{filler}, {text}"
        else:
            words = text.split()
            if len(words) > 3:
                mid = len(words) // 2
                words.insert(mid, f", {filler},")
                return " ".join(words)
    return text


def add_emotional_context(text: str, emotion: str) -> str:
    """Add emotional markers to query."""
    if emotion != "neutral" and emotion in EMOTIONAL_MARKERS and random.random() < 0.3:
        marker = random.choice(EMOTIONAL_MARKERS[emotion])
        return f"{marker} {text}"
    return text


def add_urgency(text: str, urgency: str = "normal") -> str:
    """Add urgency markers."""
    if urgency in URGENCY_MARKERS and random.random() < 0.3:
        marker = random.choice(URGENCY_MARKERS[urgency])
        if urgency == "urgent":
            return f"{text} {marker}"
        else:
            return f"{marker}, {text}"
    return text


def augment_query(query: str, emotion: str = "neutral") -> str:
    """Apply random augmentations to a query."""
    if random.random() < 0.15:
        query = add_asr_noise(query)
    if random.random() < 0.20:
        query = add_filler_words(query)
    if random.random() < 0.25:
        query = add_emotional_context(query, emotion)
    if random.random() < 0.15:
        urgency = random.choice(["urgent", "casual", "normal"])
        query = add_urgency(query, urgency)
    return query.strip()


# ==============================================================================
# OPEN-INTENT EXAMPLES (no tool should trigger)
# ==============================================================================

OPEN_INTENT_TEMPLATES = [
    # Chitchat
    "how are you doing today",
    "what do you think about that",
    "that's interesting",
    "tell me more",
    "I see what you mean",
    "makes sense",
    "go on",
    "yeah",
    "okay",
    "right",
    "uh huh",
    "I guess so",
    "that's a good point",
    "interesting perspective",
    "never thought of it that way",

    # Questions about Ferni
    "who are you",
    "what can you do",
    "are you an AI",
    "how do you work",
    "what's your name",
    "do you have feelings",
    "tell me about yourself",
    "what makes you different",

    # Emotional processing (not tool calls)
    "I just need to vent",
    "can you just listen",
    "I don't know what to do",
    "I'm not sure how I feel",
    "it's complicated",
    "I've been thinking a lot",
    "life is hard sometimes",
    "everything feels overwhelming",
    "I need to process this",
    "can we just talk",
    "I want to think out loud",
    "help me work through this",

    # Hypotheticals
    "what if I...",
    "I was wondering about...",
    "have you ever thought about...",
    "do you think I should...",
    "what would you do if...",
    "how would you handle...",

    # Acknowledgments
    "thank you",
    "thanks",
    "I appreciate that",
    "that helps",
    "perfect",
    "great",
    "awesome",
    "sounds good",
    "got it",
    "understood",

    # Farewells
    "goodbye",
    "see you later",
    "talk to you soon",
    "gotta go",
    "bye for now",
    "catch you later",
    "signing off",

    # Continuation/follow-up
    "and then what",
    "what happened next",
    "keep going",
    "more please",
    "continue",
    "yes and",
    "but wait",
    "hold on",

    # Clarification requests
    "what do you mean",
    "can you explain that",
    "I'm confused",
    "say that again",
    "could you clarify",
    "in other words",
]


def generate_open_intent_examples(count: int) -> List[Dict]:
    """Generate examples that should NOT trigger any tool."""
    examples = []

    # Use templates with variations
    for _ in range(count):
        base = random.choice(OPEN_INTENT_TEMPLATES)
        query = base

        # Add variations
        if random.random() < 0.3:
            query = add_filler_words(query)
        if random.random() < 0.2:
            prefix = random.choice(["So", "Well", "Yeah", "Hmm", "Actually"])
            query = f"{prefix}, {query}"
        if random.random() < 0.1:
            query = add_asr_noise(query)

        examples.append({
            "query": query,
            "selected_tools": [],
            "is_open_intent": True,
        })

    return examples


# ==============================================================================
# GEMINI LLM INTEGRATION
# ==============================================================================

def get_gemini_model():
    """Initialize Gemini model."""
    try:
        import google.generativeai as genai
    except ImportError:
        print("ERROR: google-generativeai not installed. Run: pip install google-generativeai")
        sys.exit(1)

    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("ERROR: GOOGLE_API_KEY environment variable not set")
        sys.exit(1)

    genai.configure(api_key=api_key)
    return genai.GenerativeModel("gemini-2.0-flash")


def categorize_tool(tool_name: str) -> Tuple[str, Dict]:
    """Determine the category of a tool based on its name."""
    tool_lower = tool_name.lower()

    for category, info in TOOL_CATEGORIES.items():
        for keyword in info["keywords"]:
            if keyword in tool_lower:
                return category, info

    # Default category
    return "general", {
        "context": "general assistance",
        "emotions": ["neutral"],
    }


def camel_to_words(name: str) -> str:
    """Convert camelCase to words: playMusic -> play music"""
    return re.sub(r'([A-Z])', r' \1', name).strip().lower()


async def generate_examples_for_tools_batch(
    model,
    tools: List[str],
    examples_per_tool: int,
    category_info: Dict[str, Dict],
) -> Dict[str, List[str]]:
    """Generate examples for a batch of tools using Gemini."""

    # Build the prompt
    tool_descriptions = []
    for tool in tools:
        readable = camel_to_words(tool)
        cat, info = category_info.get(tool, ("general", {"context": "general", "emotions": ["neutral"]}))
        tool_descriptions.append(f"- {tool}: {readable} ({info.get('context', 'general assistance')})")

    prompt = f"""Generate diverse user queries for voice AI tool routing.

For each tool below, generate 50 unique queries that a user might say to trigger that tool.

TOOLS:
{chr(10).join(tool_descriptions)}

REQUIREMENTS:
1. Vary phrasing: commands, questions, requests, casual speech
2. Include slang, abbreviations, incomplete sentences
3. Add emotional context when relevant (e.g., "I'm stressed and need to...")
4. Include time context (e.g., "this morning", "tonight", "before bed")
5. Some should be indirect (e.g., "I can't sleep" → sleepSupport)
6. Include typos/speech errors occasionally (e.g., "calender" for "calendar")
7. Make them sound like real voice transcriptions

OUTPUT FORMAT (JSON):
{{
  "toolName1": ["query1", "query2", ...],
  "toolName2": ["query1", "query2", ...],
  ...
}}

Generate ONLY the JSON, no explanation."""

    for attempt in range(RETRY_ATTEMPTS):
        try:
            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={"temperature": 0.9, "max_output_tokens": 8192}
            )

            # Parse JSON from response
            text = response.text.strip()
            # Remove markdown code blocks if present
            if text.startswith("```"):
                text = re.sub(r'^```(?:json)?\n?', '', text)
                text = re.sub(r'\n?```$', '', text)

            result = json.loads(text)
            return result

        except Exception as e:
            if attempt < RETRY_ATTEMPTS - 1:
                print(f"  Retry {attempt + 1}/{RETRY_ATTEMPTS} after error: {e}")
                await asyncio.sleep(RETRY_DELAY)
            else:
                print(f"  Failed after {RETRY_ATTEMPTS} attempts: {e}")
                return {}


def generate_hard_negatives(tools: List[str]) -> List[Dict]:
    """Generate hard negative examples - similar queries for different tools."""
    examples = []

    for group in SIMILAR_TOOL_GROUPS:
        # Only include tools that exist in our label map
        existing = [t for t in group if t in tools]
        if len(existing) < 2:
            continue

        # Generate confusing pairs
        for i, tool1 in enumerate(existing):
            for tool2 in existing[i + 1:]:
                action1 = camel_to_words(tool1)
                action2 = camel_to_words(tool2)

                # Create queries that are specific to each tool
                examples.append({
                    "query": f"I want to {action1}",
                    "selected_tools": [tool1],
                    "is_hard_negative": True,
                })
                examples.append({
                    "query": f"help me {action2}",
                    "selected_tools": [tool2],
                    "is_hard_negative": True,
                })

                # Create slightly more complex versions
                if random.random() < 0.5:
                    examples.append({
                        "query": augment_query(f"can you {action1}", "neutral"),
                        "selected_tools": [tool1],
                        "is_hard_negative": True,
                    })

    return examples


# ==============================================================================
# MAIN GENERATION PIPELINE
# ==============================================================================

@dataclass
class GenerationStats:
    total_examples: int = 0
    tool_examples: int = 0
    open_intent_examples: int = 0
    hard_negative_examples: int = 0
    tools_processed: int = 0
    errors: int = 0


async def generate_all_data(
    label_map_path: Path,
    output_dir: Path,
    examples_per_tool: int,
    category_filter: Optional[str] = None,
    dry_run: bool = False,
) -> GenerationStats:
    """Generate training data for all tools."""

    stats = GenerationStats()

    # Load label map
    print(f"📦 Loading label map from {label_map_path}")
    with open(label_map_path) as f:
        label_map = json.load(f)

    all_tools = list(label_map.keys())
    print(f"   Found {len(all_tools)} tools")

    # Categorize tools
    category_info = {}
    tools_by_category = defaultdict(list)
    for tool in all_tools:
        cat, info = categorize_tool(tool)
        category_info[tool] = (cat, info)
        tools_by_category[cat].append(tool)

    print(f"\n📊 Tool categories:")
    for cat, tools in sorted(tools_by_category.items(), key=lambda x: -len(x[1])):
        print(f"   {cat}: {len(tools)} tools")

    # Filter by category if specified
    if category_filter:
        if category_filter not in tools_by_category:
            print(f"ERROR: Category '{category_filter}' not found")
            sys.exit(1)
        all_tools = tools_by_category[category_filter]
        print(f"\n🔍 Filtering to category '{category_filter}': {len(all_tools)} tools")

    if dry_run:
        print(f"\n🔍 DRY RUN - would generate:")
        print(f"   Tool examples: {len(all_tools)} × {examples_per_tool} = {len(all_tools) * examples_per_tool:,}")
        total_target = len(all_tools) * examples_per_tool
        print(f"   Open intent: ~{int(total_target * OPEN_INTENT_RATIO):,}")
        print(f"   Hard negatives: ~{int(total_target * HARD_NEGATIVE_RATIO):,}")
        print(f"   Total: ~{int(total_target * (1 + OPEN_INTENT_RATIO + HARD_NEGATIVE_RATIO)):,}")
        return stats

    # Initialize Gemini
    print("\n🤖 Initializing Gemini Flash...")
    model = get_gemini_model()

    # Prepare output directory
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate examples in batches
    all_examples = []
    print(f"\n🚀 Generating {examples_per_tool} examples per tool...")

    batches = [all_tools[i:i + BATCH_SIZE] for i in range(0, len(all_tools), BATCH_SIZE)]

    for batch_idx, batch in enumerate(batches):
        print(f"\n   Batch {batch_idx + 1}/{len(batches)}: {batch[:3]}{'...' if len(batch) > 3 else ''}")

        result = await generate_examples_for_tools_batch(
            model, batch, examples_per_tool, category_info
        )

        for tool in batch:
            if tool in result:
                queries = result[tool]
                _, info = category_info.get(tool, ("general", {"emotions": ["neutral"]}))
                emotions = info.get("emotions", ["neutral"])

                # Calculate expansion factor: 50 base → target examples
                base_count = len(queries)
                expansion_factor = max(1, examples_per_tool // max(base_count, 1))

                for query in queries:
                    # Create multiple augmented versions of each base query
                    for _ in range(expansion_factor):
                        emotion = random.choice(emotions)
                        augmented = augment_query(query, emotion)

                        all_examples.append({
                            "query": augmented,
                            "selected_tools": [tool],
                        })
                        stats.tool_examples += 1

                stats.tools_processed += 1
                print(f"      ✓ {tool}: {base_count} base → {base_count * expansion_factor} augmented")
            else:
                print(f"      ⚠️ No examples for {tool}")
                stats.errors += 1

        # Rate limiting
        if batch_idx < len(batches) - 1:
            await asyncio.sleep(1)

    # Generate open-intent examples
    target_open = int(len(all_examples) * OPEN_INTENT_RATIO / (1 - OPEN_INTENT_RATIO - HARD_NEGATIVE_RATIO))
    print(f"\n📝 Generating {target_open:,} open-intent examples...")
    open_examples = generate_open_intent_examples(target_open)
    all_examples.extend(open_examples)
    stats.open_intent_examples = len(open_examples)

    # Generate hard negatives
    print(f"\n🎯 Generating hard negatives...")
    hard_examples = generate_hard_negatives(all_tools)
    all_examples.extend(hard_examples)
    stats.hard_negative_examples = len(hard_examples)

    # Shuffle
    random.shuffle(all_examples)
    stats.total_examples = len(all_examples)

    # Split into train/val/test (80/10/10)
    n = len(all_examples)
    train_end = int(n * 0.8)
    val_end = int(n * 0.9)

    train = all_examples[:train_end]
    val = all_examples[train_end:val_end]
    test = all_examples[val_end:]

    # Save datasets
    print(f"\n💾 Saving datasets to {output_dir}")

    for name, data in [("train", train), ("validation", val), ("test", test)]:
        path = output_dir / f"{name}_v5_860.jsonl"
        with open(path, 'w') as f:
            for ex in data:
                f.write(json.dumps(ex) + '\n')
        print(f"   {name}: {len(data):,} examples → {path.name}")

    # Copy label map
    label_map_out = output_dir / "label_map_v5_860.json"
    with open(label_map_out, 'w') as f:
        json.dump(label_map, f, indent=2)
    print(f"   label_map: {len(label_map)} labels → {label_map_out.name}")

    # Save metadata
    metadata = {
        "total_examples": stats.total_examples,
        "tool_examples": stats.tool_examples,
        "open_intent_examples": stats.open_intent_examples,
        "hard_negative_examples": stats.hard_negative_examples,
        "tools_processed": stats.tools_processed,
        "examples_per_tool_target": examples_per_tool,
        "num_labels": len(label_map),
        "splits": {
            "train": len(train),
            "validation": len(val),
            "test": len(test),
        },
    }
    with open(output_dir / "metadata_v5_860.json", 'w') as f:
        json.dump(metadata, f, indent=2)

    return stats


def main():
    parser = argparse.ArgumentParser(description="Generate FTIS V5-860 training data")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory for generated data"
    )
    parser.add_argument(
        "--label-map",
        type=Path,
        default=DEFAULT_LABEL_MAP,
        help="Path to label_map.json"
    )
    parser.add_argument(
        "--per-tool",
        type=int,
        default=DEFAULT_EXAMPLES_PER_TOOL,
        help=f"Examples per tool (default: {DEFAULT_EXAMPLES_PER_TOOL})"
    )
    parser.add_argument(
        "--category",
        type=str,
        default=None,
        help="Only generate for specific category (for testing)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be generated without generating"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("🚀 FTIS V5-860 Training Data Generator")
    print("=" * 60)

    start_time = time.time()

    stats = asyncio.run(generate_all_data(
        label_map_path=args.label_map,
        output_dir=args.output_dir,
        examples_per_tool=args.per_tool,
        category_filter=args.category,
        dry_run=args.dry_run,
    ))

    elapsed = time.time() - start_time

    if not args.dry_run:
        print(f"\n✅ Generation complete in {elapsed:.1f}s")
        print(f"\n📊 Final statistics:")
        print(f"   Total examples: {stats.total_examples:,}")
        print(f"   Tool examples: {stats.tool_examples:,}")
        print(f"   Open intent: {stats.open_intent_examples:,}")
        print(f"   Hard negatives: {stats.hard_negative_examples:,}")
        print(f"   Tools processed: {stats.tools_processed}")
        if stats.errors:
            print(f"   ⚠️ Errors: {stats.errors}")


if __name__ == "__main__":
    main()
