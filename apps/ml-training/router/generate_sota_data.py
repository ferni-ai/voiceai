#!/usr/bin/env python3
"""
STATE-OF-THE-ART Training Data Generator for Ferni Router (2026)

This generator creates training data with advanced techniques:
1. Hard Negatives - Confusing similar queries that route to different tools
2. Multi-tool Queries - "play jazz and dim the lights"
3. Conversational Negatives - Queries that should NOT trigger tools
4. Voice Transcription Noise - ASR errors, homophones, mumbling
5. Emotional Context - Queries with emotional state signals
6. Persona-aware Variants - Different phrasings per persona
7. Natural Speech Patterns - Incomplete sentences, filler words, interruptions
8. Temporal Context - Time-of-day, urgency variations

Usage:
  python generate_sota_data.py
"""

import json
import random
import re
from pathlib import Path
from typing import List, Dict, Set, Tuple
from dataclasses import dataclass, asdict

# ==============================================================================
# CONFIGURATION
# ==============================================================================

DATA_DIR = Path("/Users/sethford/Documents/voiceai/data/ftis-training-sota")
TOOL_DESCRIPTIONS_PATH = Path("/Users/sethford/Documents/voiceai/src/tools/config/tool-descriptions.json")
TOOL_LIST_PATH = Path("/tmp/all-tools.txt")

# Examples per tool for different categories
EXAMPLES_PER_TOOL = 30        # Base examples
HARD_NEGATIVES_PER_TOOL = 5   # Confusing similar queries
MULTI_TOOL_EXAMPLES = 5000    # Multi-tool combinations
CONVERSATIONAL_NEGATIVES = 8000  # Non-tool queries

# ==============================================================================
# NATURAL SPEECH PATTERNS (2026 SOTA)
# ==============================================================================

# Voice transcription errors (ASR mistakes)
ASR_SUBSTITUTIONS = {
    "play": ["pray", "plate", "plane"],
    "music": ["muse sick", "music", "musics"],
    "weather": ["whether", "wether"],
    "calendar": ["calender", "colander"],
    "remind": ["remain", "remand"],
    "call": ["coal", "col"],
    "text": ["techs", "tax"],
    "email": ["e mail", "e-mail"],
    "lights": ["lites", "light's"],
    "habit": ["habbit", "have it"],
    "meditation": ["mediation", "medication"],
    "anxious": ["anchous", "anxious"],
    "therapy": ["their a pee", "the rapy"],
}

# Filler words and speech disfluencies
FILLER_WORDS = [
    "um", "uh", "like", "you know", "so", "well", "I mean",
    "basically", "actually", "hmm", "let me think", "okay so",
]

# Incomplete/interrupted patterns
INCOMPLETE_PATTERNS = [
    "{query}... wait, {query}",
    "{query} no wait {alt_query}",
    "I was gonna... {query}",
    "What was I... oh yeah, {query}",
    "{query} actually never mind... {query}",
]

# Emotional markers
EMOTIONAL_MARKERS = {
    "sad": ["I'm feeling down", "it's been hard", "I'm struggling with", "really sad about"],
    "anxious": ["I'm worried about", "freaking out about", "stressed about", "nervous about"],
    "happy": ["I'm so excited about", "great news about", "really happy about", "thrilled about"],
    "angry": ["I'm frustrated with", "really annoyed by", "so mad about", "pissed about"],
    "neutral": ["I need to", "can you help with", "let me", "I want to"],
}

# Time-of-day context
TIME_CONTEXTS = {
    "morning": ["this morning", "for today", "to start my day", "first thing"],
    "afternoon": ["this afternoon", "later today", "for lunch", "midday"],
    "evening": ["tonight", "this evening", "for dinner", "after work"],
    "night": ["before bed", "late night", "can't sleep", "at this hour"],
}

# Urgency markers
URGENCY_MARKERS = {
    "urgent": ["right now", "immediately", "asap", "quick", "hurry", "emergency"],
    "casual": ["when you get a chance", "no rush", "sometime", "eventually"],
    "normal": ["please", "can you", "I'd like to", "help me"],
}

# ==============================================================================
# TOOL SIMILARITY GROUPS (for hard negatives)
# ==============================================================================

SIMILAR_TOOL_GROUPS = {
    "music": ["playMusic", "pauseMusic", "stopMusic", "resumeMusic", "searchMusic", 
              "playSonosMusic", "musicControl", "discoverMusic"],
    "calendar": ["createCalendarEvent", "getCalendar", "modifyCalendarEvent", 
                 "deleteCalendarEvent", "checkDateConflicts"],
    "habit": ["addHabit", "logHabit", "getHabitStats", "habitCoaching", "conductHabitAutopsy"],
    "reminder": ["scheduleReminder", "getReminders", "cancelReminder", "snoozeReminder"],
    "memory": ["saveMemory", "recallMemory", "forgetMemory", "searchMemories"],
    "handoff": ["handoffToMaya", "handoffToPeter", "handoffToAlex", "handoffToJordan", 
                "handoffToNayan", "handoffToFerni"],
    "emotion": ["processGrief", "angerCoaching", "deEscalateAnxiety", "selfCompassionCoaching",
                "groundingExercise", "breatheWithMe"],
    "communication": ["callUser", "sendMessage", "draftEmail", "scheduleCall"],
    "home": ["controlLight", "setThermostat", "controlLock", "activateScene"],
    "wellness": ["logExercise", "trackHydration", "logSymptom", "sleepSupport"],
}

# ==============================================================================
# CONVERSATIONAL NEGATIVES (should NOT trigger tools)
# ==============================================================================

CONVERSATIONAL_QUERIES = [
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
    
    # Questions about Ferni
    "who are you",
    "what can you do",
    "are you an AI",
    "how do you work",
    "what's your name",
    "do you have feelings",
    
    # Emotional processing (not tool calls)
    "I just need to vent",
    "can you just listen",
    "I don't know what to do",
    "I'm not sure how I feel",
    "it's complicated",
    "I've been thinking a lot",
    "life is hard sometimes",
    "everything feels overwhelming",
    
    # Hypotheticals
    "what if I...",
    "I was wondering about...",
    "have you ever thought about...",
    "do you think I should...",
    
    # Acknowledgments
    "thank you",
    "thanks",
    "I appreciate that",
    "that helps",
    "perfect",
    "great",
    "awesome",
    "sounds good",
    
    # Farewells
    "goodbye",
    "see you later",
    "talk to you soon",
    "gotta go",
    "bye for now",
]

# ==============================================================================
# DATA CLASSES
# ==============================================================================

@dataclass
class TrainingExample:
    query: str
    selected_tools: List[str]
    is_negative: bool = False
    is_hard_negative: bool = False
    is_multi_tool: bool = False
    emotion: str = "neutral"
    time_context: str = "any"
    urgency: str = "normal"
    
    def to_dict(self) -> dict:
        return {
            "query": self.query,
            "selected_tools": self.selected_tools,
            "is_negative": self.is_negative,
            "is_hard_negative": self.is_hard_negative,
            "is_multi_tool": self.is_multi_tool,
            "emotion": self.emotion,
            "time_context": self.time_context,
            "urgency": self.urgency,
        }

# ==============================================================================
# GENERATORS
# ==============================================================================

def camel_to_words(name: str) -> str:
    """Convert camelCase to words: playMusic -> play music"""
    return re.sub(r'([A-Z])', r' \1', name).strip().lower()

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
    if emotion != "neutral" and random.random() < 0.3:
        marker = random.choice(EMOTIONAL_MARKERS.get(emotion, EMOTIONAL_MARKERS["neutral"]))
        return f"{marker} {text}"
    return text

def add_time_context(text: str, time_ctx: str) -> str:
    """Add time-of-day context."""
    if time_ctx != "any" and random.random() < 0.3:
        marker = random.choice(TIME_CONTEXTS.get(time_ctx, TIME_CONTEXTS["morning"]))
        return f"{text} {marker}"
    return text

def add_urgency(text: str, urgency: str) -> str:
    """Add urgency markers."""
    if urgency != "normal" and random.random() < 0.4:
        marker = random.choice(URGENCY_MARKERS.get(urgency, URGENCY_MARKERS["normal"]))
        if urgency == "urgent":
            return f"{text} {marker}"
        else:
            return f"{marker}, {text}"
    return text

def generate_tool_queries(tool_id: str, n: int = 30) -> List[TrainingExample]:
    """Generate varied queries for a single tool."""
    examples = []
    action = camel_to_words(tool_id)
    
    # Base templates
    templates = [
        f"{action}",
        f"help me {action}",
        f"I need to {action}",
        f"can you {action}",
        f"let's {action}",
        f"I want to {action}",
        f"{action} please",
        f"I'd like to {action}",
        f"could you {action}",
        f"time to {action}",
    ]
    
    emotions = list(EMOTIONAL_MARKERS.keys())
    times = list(TIME_CONTEXTS.keys()) + ["any"] * 3  # Bias toward no context
    urgencies = list(URGENCY_MARKERS.keys())
    
    for _ in range(n):
        base = random.choice(templates)
        emotion = random.choice(emotions)
        time_ctx = random.choice(times)
        urgency = random.choice(urgencies)
        
        # Apply transformations
        query = base
        if random.random() < 0.3:
            query = add_emotional_context(query, emotion)
        if random.random() < 0.2:
            query = add_time_context(query, time_ctx)
        if random.random() < 0.2:
            query = add_urgency(query, urgency)
        if random.random() < 0.15:
            query = add_filler_words(query)
        if random.random() < 0.1:
            query = add_asr_noise(query)
        
        examples.append(TrainingExample(
            query=query.strip(),
            selected_tools=[tool_id],
            emotion=emotion,
            time_context=time_ctx,
            urgency=urgency,
        ))
    
    return examples

def generate_hard_negatives(all_tools: List[str]) -> List[TrainingExample]:
    """Generate hard negative examples - similar queries, different tools."""
    examples = []
    
    for group_name, tools in SIMILAR_TOOL_GROUPS.items():
        # Only include tools that exist
        existing = [t for t in tools if t in all_tools]
        if len(existing) < 2:
            continue
        
        # Generate confusing pairs
        for i, tool1 in enumerate(existing):
            for tool2 in existing[i+1:]:
                action1 = camel_to_words(tool1)
                action2 = camel_to_words(tool2)
                
                # Create queries that could be confused
                confusing_queries = [
                    f"I want to {action1}",  # Should be tool1
                    f"actually, {action2}",   # Should be tool2
                    f"can you {action1} or {action2}",  # Ambiguous
                ]
                
                examples.append(TrainingExample(
                    query=confusing_queries[0],
                    selected_tools=[tool1],
                    is_hard_negative=True,
                ))
                examples.append(TrainingExample(
                    query=confusing_queries[1],
                    selected_tools=[tool2],
                    is_hard_negative=True,
                ))
    
    return examples

def generate_multi_tool_queries(all_tools: List[str], n: int = 5000) -> List[TrainingExample]:
    """Generate queries that require multiple tools."""
    examples = []
    
    # Common multi-tool patterns
    patterns = [
        (["playMusic", "controlLight"], "play some {music} and dim the lights"),
        (["setThermostat", "controlLight"], "make it cozy - {temp} and {lights}"),
        (["createCalendarEvent", "scheduleReminder"], "schedule {event} and remind me {time}"),
        (["callUser", "sendMessage"], "call {person} and if they don't answer text them"),
        (["playMusic", "setThermostat"], "set the mood with {music} and {temp}"),
        (["logHabit", "addHabit"], "track my {habit} and add {new_habit}"),
        (["getWeather", "suggestWorkout"], "what's the weather and suggest a workout"),
        (["createCalendarEvent", "callUser"], "schedule a call with {person} for {time}"),
    ]
    
    music_words = ["jazz", "lo-fi", "classical", "ambient", "chill beats"]
    temp_words = ["warmer", "cooler", "72 degrees", "comfortable"]
    light_words = ["dimmer", "brighter", "off", "on"]
    habit_words = ["meditation", "exercise", "reading", "water intake"]
    
    count = 0
    while count < n:
        for tools, template in patterns:
            if all(t in all_tools for t in tools):
                query = template.format(
                    music=random.choice(music_words),
                    temp=random.choice(temp_words),
                    lights=random.choice(light_words),
                    event="meeting",
                    time="tomorrow",
                    person="mom",
                    habit=random.choice(habit_words),
                    new_habit=random.choice(habit_words),
                )
                
                examples.append(TrainingExample(
                    query=query,
                    selected_tools=tools,
                    is_multi_tool=True,
                ))
                count += 1
                if count >= n:
                    break
    
    return examples

def generate_conversational_negatives(n: int = 8000) -> List[TrainingExample]:
    """Generate queries that should NOT trigger any tool."""
    examples = []
    
    # Start with base conversational queries
    for query in CONVERSATIONAL_QUERIES:
        for _ in range(n // len(CONVERSATIONAL_QUERIES)):
            # Add variations
            variant = query
            if random.random() < 0.3:
                variant = add_filler_words(variant)
            if random.random() < 0.2:
                variant = f"{random.choice(['So', 'Well', 'Yeah', 'Hmm'])}, {variant}"
            
            examples.append(TrainingExample(
                query=variant,
                selected_tools=[],  # No tools!
                is_negative=True,
            ))
    
    return examples[:n]

def generate_music_specific_examples(n: int = 500) -> List[TrainingExample]:
    """Generate extra music-specific examples since this is a pain point."""
    examples = []
    
    music_requests = [
        "play some music",
        "play music",
        "put on some tunes",
        "I want to hear music",
        "can you play something",
        "play some jazz",
        "play afternoon jazz",
        "some chill music please",
        "play relaxing music",
        "put on background music",
        "I need some music",
        "music please",
        "play my favorite songs",
        "some music would be nice",
        "let's have some music",
        "turn on music",
        "start playing music",
        "I wanna listen to something",
        "play me a song",
        "can we have some music",
        "throw on some tunes",
        "hit me with some beats",
        "play some vibes",
        "music time",
        "how about some music",
    ]
    
    genres = ["jazz", "lo-fi", "classical", "rock", "pop", "ambient", "electronic", "indie"]
    moods = ["relaxing", "upbeat", "chill", "energetic", "calm", "happy", "mellow"]
    times = ["morning", "afternoon", "evening", "night", "work", "study", "sleep"]
    
    for base in music_requests:
        # Plain version
        examples.append(TrainingExample(
            query=base,
            selected_tools=["playMusic"],
        ))
        
        # With genre
        genre = random.choice(genres)
        examples.append(TrainingExample(
            query=base.replace("music", f"{genre} music").replace("some", f"some {genre}"),
            selected_tools=["playMusic"],
        ))
        
        # With mood
        mood = random.choice(moods)
        examples.append(TrainingExample(
            query=f"play something {mood}",
            selected_tools=["playMusic"],
        ))
        
        # With time context
        time_ctx = random.choice(times)
        examples.append(TrainingExample(
            query=f"play some {time_ctx} music",
            selected_tools=["playMusic"],
        ))
    
    return examples[:n]

# ==============================================================================
# MAIN
# ==============================================================================

def main():
    print("=" * 60)
    print("🚀 SOTA Training Data Generator (2026)")
    print("=" * 60)
    
    # Load tools
    all_tools = [l.strip() for l in TOOL_LIST_PATH.read_text().split("\n") if l.strip()]
    print(f"\n📦 Loaded {len(all_tools)} tools")
    
    all_examples: List[TrainingExample] = []
    
    # 1. Base examples per tool
    print(f"\n1️⃣ Generating base examples ({EXAMPLES_PER_TOOL} per tool)...")
    for i, tool in enumerate(all_tools):
        examples = generate_tool_queries(tool, EXAMPLES_PER_TOOL)
        all_examples.extend(examples)
        if (i + 1) % 100 == 0:
            print(f"   Processed {i+1}/{len(all_tools)} tools...")
    print(f"   Generated {len(all_examples)} base examples")
    
    # 2. Hard negatives
    print(f"\n2️⃣ Generating hard negatives...")
    hard_negatives = generate_hard_negatives(all_tools)
    all_examples.extend(hard_negatives)
    print(f"   Generated {len(hard_negatives)} hard negatives")
    
    # 3. Multi-tool queries
    print(f"\n3️⃣ Generating multi-tool queries...")
    multi_tool = generate_multi_tool_queries(all_tools, MULTI_TOOL_EXAMPLES)
    all_examples.extend(multi_tool)
    print(f"   Generated {len(multi_tool)} multi-tool examples")
    
    # 4. Conversational negatives
    print(f"\n4️⃣ Generating conversational negatives...")
    conv_negatives = generate_conversational_negatives(CONVERSATIONAL_NEGATIVES)
    all_examples.extend(conv_negatives)
    print(f"   Generated {len(conv_negatives)} conversational negatives")
    
    # 5. Extra music examples (since this is a known pain point)
    print(f"\n5️⃣ Generating extra music examples...")
    music_examples = generate_music_specific_examples(500)
    all_examples.extend(music_examples)
    print(f"   Generated {len(music_examples)} music-specific examples")
    
    # Shuffle and split
    print(f"\n📊 Total examples: {len(all_examples):,}")
    random.shuffle(all_examples)
    
    n = len(all_examples)
    train = all_examples[:int(n*0.85)]
    val = all_examples[int(n*0.85):int(n*0.925)]
    test = all_examples[int(n*0.925):]
    
    # Create output directory
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    
    # Save datasets
    for name, data in [("train", train), ("validation", val), ("test", test)]:
        with open(DATA_DIR / f"{name}.jsonl", 'w') as f:
            for ex in data:
                f.write(json.dumps(ex.to_dict()) + '\n')
    
    # Create label map (including empty for negatives)
    all_tool_set = set(all_tools)
    label_map = {t: i for i, t in enumerate(sorted(all_tool_set))}
    with open(DATA_DIR / "label_map.json", 'w') as f:
        json.dump(label_map, f, indent=2)
    
    # Print statistics
    print(f"\n✅ Saved to {DATA_DIR}")
    print(f"   Train: {len(train):,}")
    print(f"   Validation: {len(val):,}")
    print(f"   Test: {len(test):,}")
    print(f"   Labels: {len(label_map)}")
    
    # Count categories
    base_count = sum(1 for ex in all_examples if not ex.is_negative and not ex.is_hard_negative and not ex.is_multi_tool)
    hard_neg_count = sum(1 for ex in all_examples if ex.is_hard_negative)
    multi_count = sum(1 for ex in all_examples if ex.is_multi_tool)
    neg_count = sum(1 for ex in all_examples if ex.is_negative)
    
    print(f"\n📈 Dataset composition:")
    print(f"   Base examples: {base_count:,} ({100*base_count/n:.1f}%)")
    print(f"   Hard negatives: {hard_neg_count:,} ({100*hard_neg_count/n:.1f}%)")
    print(f"   Multi-tool: {multi_count:,} ({100*multi_count/n:.1f}%)")
    print(f"   Conversational: {neg_count:,} ({100*neg_count/n:.1f}%)")
    
    print("\n🎯 Ready for training!")

if __name__ == "__main__":
    main()
