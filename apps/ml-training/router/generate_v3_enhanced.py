#!/usr/bin/env python3
"""
Enhanced FTIS V3 Training Data Generator

Generates 5,000+ high-quality training examples for the Ferni Router model.
Key improvements over previous generator:
1. Better balance: More tool examples, fewer but higher quality open intents
2. Hard negatives for similar tools (calendar/reminder, music controls, etc.)
3. Voice transcription noise and natural speech patterns
4. No formatting bugs (proper spacing, complete sentences)

Usage:
  cd apps/ml-training/router
  source .venv/bin/activate
  python generate_v3_enhanced.py

Output:
  - data/train.jsonl (85%)
  - data/validation.jsonl (7.5%)
  - data/test.jsonl (7.5%)
  - data/label_map.json
"""

import json
import random
import time
from pathlib import Path
from typing import List, Dict, Set
from dataclasses import dataclass

# ==============================================================================
# CONFIG
# ==============================================================================

DATA_DIR = Path(__file__).parent / "data"
SEED = 42
random.seed(SEED)

# Target dataset sizes
TARGET_TOOL_EXAMPLES = 4000     # More tool examples (60% of dataset)
TARGET_OPEN_INTENTS = 2500      # Open intents (40% of dataset)
TARGET_TOTAL = TARGET_TOOL_EXAMPLES + TARGET_OPEN_INTENTS

# ==============================================================================
# TOOL DEFINITIONS - Matching label_map.json
# ==============================================================================

TOOLS = [
    "adjustVolume", "callContact", "checkAvailability", "createAlarm",
    "createCalendarEvent", "createReminder", "createTimer", "getCalendarEvents",
    "getHabitProgress", "getMemory", "getNews", "getWeather", "habitStats",
    "headlines", "logHabit", "lookup", "makeCall", "markHabitComplete",
    "music_play", "pauseMusic", "playMusic", "recallMemory", "rememberThis",
    "saveMemory", "scheduleEvent", "search", "sendMessage", "sendSMS",
    "setAlarm", "setReminder", "setTimer", "skipTrack", "spotify_play",
    "storeInfo", "textContact", "trackHabit", "viewStreak", "weatherForecast",
    "webSearch", "whatDoYouKnow"
]

# Similar tool groups for hard negatives
SIMILAR_TOOL_GROUPS = {
    "music": ["playMusic", "music_play", "spotify_play", "pauseMusic", "skipTrack", "adjustVolume"],
    "calendar": ["createCalendarEvent", "scheduleEvent", "checkAvailability", "getCalendarEvents"],
    "reminder": ["createReminder", "setReminder", "createAlarm", "setAlarm", "createTimer", "setTimer"],
    "memory": ["saveMemory", "storeInfo", "rememberThis", "recallMemory", "getMemory", "whatDoYouKnow"],
    "habit": ["logHabit", "trackHabit", "markHabitComplete", "getHabitProgress", "habitStats", "viewStreak"],
    "communication": ["sendMessage", "sendSMS", "textContact", "callContact", "makeCall"],
    "info": ["getNews", "headlines", "getWeather", "weatherForecast", "search", "webSearch", "lookup"],
}

# ==============================================================================
# QUERY TEMPLATES PER TOOL
# ==============================================================================

TOOL_TEMPLATES = {
    # Music tools
    "playMusic": [
        "play some music", "play music", "put on some tunes", "I want to hear music",
        "can you play something", "play some {genre}", "some music please",
        "play relaxing music", "put on background music", "I need some music",
        "music please", "play my favorite songs", "let's have some music",
        "turn on music", "start playing music", "I wanna listen to something",
        "play me a song", "throw on some tunes", "hit me with some beats",
        "how about some music", "play some {mood} music", "put on {genre}",
    ],
    "music_play": [
        "play {artist}", "play songs by {artist}", "put on {song}",
        "I want to hear {artist}", "can you play {song}", "play the song {song}",
    ],
    "spotify_play": [
        "play on spotify", "open spotify and play", "spotify {genre}",
        "play my spotify playlist", "spotify shuffle", "spotify play {artist}",
    ],
    "pauseMusic": [
        "pause the music", "stop the music", "pause", "stop playing",
        "hold the music", "pause this song", "stop this", "quiet please",
    ],
    "skipTrack": [
        "skip this song", "next song", "skip", "next track", "skip to next",
        "play the next one", "I don't like this song", "next please",
    ],
    "adjustVolume": [
        "turn it up", "turn it down", "louder", "quieter", "volume up",
        "volume down", "make it louder", "too loud", "too quiet", "increase volume",
    ],

    # Calendar tools
    "createCalendarEvent": [
        "schedule a meeting for {time}", "add event {event} on {day}",
        "create a calendar event", "put {event} on my calendar",
        "schedule {event} for {day}", "add to calendar {event}",
        "block off {time} for {event}", "calendar event for {event}",
    ],
    "scheduleEvent": [
        "schedule {event}", "book {time} for {event}", "set up {event}",
        "plan a {event}", "arrange {event} for {day}", "schedule time for {event}",
    ],
    "getCalendarEvents": [
        "what's on my calendar", "show my schedule", "any events today",
        "what do I have today", "calendar for {day}", "my schedule for {day}",
        "am I free {day}", "what meetings do I have", "show today's events",
    ],
    "checkAvailability": [
        "am I free on {day}", "any conflicts on {day}", "when am I available",
        "check my availability", "do I have anything on {day}", "is {time} free",
        "can I schedule something for {time}", "open slots this week",
    ],

    # Reminder tools
    "createReminder": [
        "remind me to {task}", "set a reminder for {task}", "don't let me forget {task}",
        "reminder for {task} at {time}", "remind me about {task}",
        "I need to remember to {task}", "remind me {time} to {task}",
    ],
    "setReminder": [
        "set reminder {task}", "reminder at {time}", "remind me at {time}",
        "set a reminder", "create reminder for {task}", "reminder to {task}",
    ],
    "createAlarm": [
        "set an alarm for {time}", "wake me up at {time}", "alarm at {time}",
        "I need an alarm for {time}", "set alarm {time}", "morning alarm for {time}",
    ],
    "setAlarm": [
        "alarm for {time}", "set my alarm", "alarm at {time}", "wake up alarm {time}",
    ],
    "createTimer": [
        "set a timer for {duration}", "timer for {duration}", "{duration} timer",
        "start a timer for {duration}", "I need a timer", "countdown for {duration}",
    ],
    "setTimer": [
        "timer {duration}", "set timer {duration}", "{duration} please",
        "countdown {duration}", "start timer for {duration}",
    ],

    # Memory tools
    "saveMemory": [
        "remember that {fact}", "save this: {fact}", "store this information",
        "remember {fact} for me", "keep in mind that {fact}", "note that {fact}",
    ],
    "storeInfo": [
        "store {fact}", "save {fact}", "keep track of {fact}", "record {fact}",
    ],
    "rememberThis": [
        "remember this", "save this for later", "don't forget this",
        "keep this in memory", "remember what I just said",
    ],
    "recallMemory": [
        "what did I say about {topic}", "recall {topic}", "what do you remember about {topic}",
        "tell me what I told you about {topic}", "remind me about {topic}",
    ],
    "getMemory": [
        "what do you know about {topic}", "do you remember {topic}",
        "what was that thing about {topic}", "get memory about {topic}",
    ],
    "whatDoYouKnow": [
        "what do you know about me", "what have I told you", "my preferences",
        "things you know about me", "what do you remember", "my information",
    ],

    # Habit tools
    "logHabit": [
        "I did my {habit}", "log {habit}", "track that I did {habit}",
        "I completed {habit}", "mark {habit} done", "I finished {habit}",
    ],
    "trackHabit": [
        "track my {habit}", "add {habit} to tracking", "monitor my {habit}",
        "start tracking {habit}", "track {habit} for me",
    ],
    "markHabitComplete": [
        "done with {habit}", "finished {habit}", "completed {habit} today",
        "check off {habit}", "mark {habit} complete",
    ],
    "getHabitProgress": [
        "how am I doing with {habit}", "my {habit} progress", "{habit} stats",
        "how many times did I {habit}", "show my {habit} history",
    ],
    "habitStats": [
        "my habit statistics", "all my habits", "habit dashboard",
        "show habit progress", "how are my habits", "habit summary",
    ],
    "viewStreak": [
        "my streak", "current streak", "how long is my streak",
        "streak for {habit}", "am I on a streak", "check my streak",
    ],

    # Communication tools
    "sendMessage": [
        "send a message to {person}", "message {person}", "text {person}",
        "tell {person} that {message}", "send {person} a message",
    ],
    "sendSMS": [
        "SMS {person}", "text message to {person}", "send SMS to {person}",
        "SMS to {person} saying {message}",
    ],
    "textContact": [
        "text {person}", "send text to {person}", "message {person}",
    ],
    "callContact": [
        "call {person}", "phone {person}", "dial {person}", "ring {person}",
        "give {person} a call", "I need to call {person}",
    ],
    "makeCall": [
        "make a call to {person}", "place a call", "start a call with {person}",
    ],

    # Info tools
    "getWeather": [
        "what's the weather", "weather today", "is it going to rain",
        "how's the weather", "temperature outside", "weather forecast",
    ],
    "weatherForecast": [
        "weather for {day}", "forecast for {day}", "will it rain {day}",
        "weather this week", "weekend weather", "forecast",
    ],
    "getNews": [
        "what's in the news", "any news", "today's news", "latest news",
        "news updates", "what's happening in the world",
    ],
    "headlines": [
        "headlines", "top stories", "breaking news", "main headlines",
    ],
    "search": [
        "search for {query}", "look up {query}", "find {query}",
        "search {query}", "I need info about {query}",
    ],
    "webSearch": [
        "google {query}", "search the web for {query}", "web search {query}",
        "internet search for {query}",
    ],
    "lookup": [
        "look up {query}", "what is {query}", "tell me about {query}",
        "define {query}", "info on {query}",
    ],
}

# Fill-in values
FILL_VALUES = {
    "genre": ["jazz", "classical", "rock", "pop", "lo-fi", "ambient", "electronic", "indie", "hip hop", "r&b"],
    "mood": ["relaxing", "upbeat", "chill", "energetic", "calm", "happy", "mellow", "focused", "romantic"],
    "artist": ["Taylor Swift", "The Beatles", "Drake", "Adele", "Ed Sheeran", "Billie Eilish", "Coldplay"],
    "song": ["Bohemian Rhapsody", "Shape of You", "Blinding Lights", "Bad Guy", "Uptown Funk"],
    "time": ["3pm", "tomorrow at 2", "in an hour", "next Monday", "at noon", "6:30pm", "in 30 minutes"],
    "day": ["today", "tomorrow", "Monday", "next week", "this weekend", "Friday", "next Tuesday"],
    "duration": ["5 minutes", "10 minutes", "30 minutes", "an hour", "15 minutes", "1 hour", "45 minutes"],
    "event": ["meeting", "doctor appointment", "call with mom", "lunch", "dentist", "haircut", "interview"],
    "task": ["take medicine", "call mom", "pick up groceries", "submit report", "water plants", "exercise"],
    "fact": ["I like coffee", "my favorite color is blue", "I have a meeting tomorrow", "allergic to peanuts"],
    "topic": ["coffee", "my preferences", "that meeting", "my allergies", "work stuff"],
    "habit": ["meditation", "exercise", "reading", "water intake", "sleep", "journaling", "stretching"],
    "person": ["mom", "John", "Sarah", "my boss", "the doctor", "Mike", "Lisa"],
    "message": ["I'll be late", "on my way", "call me back", "thanks", "running behind"],
    "query": ["Python tutorials", "best restaurants nearby", "how to cook pasta", "weather tomorrow"],
}

# ==============================================================================
# OPEN INTENT EXAMPLES - High quality, no formatting bugs
# ==============================================================================

OPEN_INTENTS = [
    # Pure chitchat
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
    "fair enough",

    # About Ferni
    "who are you",
    "what can you do",
    "are you an AI",
    "how do you work",
    "what's your name",
    "do you have feelings",
    "are you real",
    "can you think",
    "what are you",

    # Emotional processing (NOT tool calls)
    "I just need to vent",
    "can you just listen",
    "I don't know what to do",
    "I'm not sure how I feel",
    "it's complicated",
    "I've been thinking a lot",
    "life is hard sometimes",
    "everything feels overwhelming",
    "I'm feeling lost",
    "I need some advice",
    "things have been tough",
    "I'm going through something",
    "I just want to talk",
    "I need someone to listen",
    "can I share something with you",
    "I'm struggling lately",
    "it's been a rough day",
    "I don't know where to start",
    "I'm feeling a bit down",
    "I'm worried about something",

    # Opinions and preferences
    "I think cats are better than dogs",
    "I prefer mornings to nights",
    "I've always been a coffee person",
    "I'm not a fan of crowds",
    "I love rainy days",
    "I enjoy cooking",
    "I'm more of an introvert",
    "I like to read before bed",
    "I prefer texting to calling",
    "I'm a night owl",

    # Hypotheticals
    "what if I tried something new",
    "I was wondering about life choices",
    "have you ever thought about happiness",
    "do you think I should change careers",
    "what would you do in my situation",
    "I'm considering something big",
    "should I take a risk",
    "what matters most in life",

    # Acknowledgments
    "thank you",
    "thanks",
    "I appreciate that",
    "that helps",
    "perfect",
    "great",
    "awesome",
    "sounds good",
    "that's helpful",
    "you're the best",
    "thanks for listening",
    "I appreciate you",

    # Farewells
    "goodbye",
    "see you later",
    "talk to you soon",
    "gotta go",
    "bye for now",
    "have a good one",
    "take care",
    "catch you later",
    "until next time",
    "see ya",

    # Processing/thinking
    "hmm let me think",
    "I'm not sure yet",
    "give me a moment",
    "let me consider that",
    "I need to think about it",
    "that's a lot to process",
    "I hadn't thought of that",
    "interesting point",
    "you might be right",
    "I see your perspective",

    # Clarifications
    "what do you mean",
    "can you explain that",
    "I don't understand",
    "say that again",
    "what was that",
    "could you clarify",
    "I didn't catch that",
    "one more time",
]

# Additional open intent templates with variations
OPEN_INTENT_TEMPLATES = [
    "honestly, {base}",
    "you know, {base}",
    "I mean, {base}",
    "{base}, I guess",
    "{base}, you know what I mean?",
    "so {base}",
    "well, {base}",
    "I think {base}",
    "{base}, if that makes sense",
    "like, {base}",
]

# ==============================================================================
# NOISE AND VARIATIONS
# ==============================================================================

def add_filler(text: str) -> str:
    """Add natural speech fillers."""
    fillers = ["um", "uh", "like", "you know", "so", "well", "I mean", "basically", "actually"]
    if random.random() < 0.15:
        filler = random.choice(fillers)
        if random.random() < 0.5:
            return f"{filler}, {text}"
        else:
            words = text.split()
            if len(words) > 3:
                pos = random.randint(1, len(words) - 1)
                words.insert(pos, f"{filler}")
                return " ".join(words)
    return text

def add_typo(text: str) -> str:
    """Add realistic voice transcription errors."""
    typos = {
        "play": ["pray", "plate"],
        "weather": ["whether"],
        "calendar": ["calender"],
        "remind": ["remain"],
        "call": ["coal"],
        "text": ["techs"],
        "timer": ["time her"],
        "alarm": ["a larm"],
    }
    words = text.split()
    if random.random() < 0.08:
        for i, word in enumerate(words):
            if word.lower() in typos and random.random() < 0.3:
                words[i] = random.choice(typos[word.lower()])
                break
    return " ".join(words)

def fill_template(template: str) -> str:
    """Fill in template placeholders."""
    result = template
    for key, values in FILL_VALUES.items():
        placeholder = "{" + key + "}"
        while placeholder in result:
            result = result.replace(placeholder, random.choice(values), 1)
    return result

# ==============================================================================
# GENERATION
# ==============================================================================

@dataclass
class Example:
    query: str
    selected_tools: List[str]
    is_open_intent: bool
    source: str

def generate_tool_examples() -> List[Example]:
    """Generate tool-triggering examples."""
    examples = []

    # Generate base examples for each tool
    for tool in TOOLS:
        templates = TOOL_TEMPLATES.get(tool, [f"use {tool}", f"do {tool}", f"please {tool}"])

        # Generate multiple variations per tool (target: ~100 per tool)
        num_examples = max(80, TARGET_TOOL_EXAMPLES // len(TOOLS))

        for _ in range(num_examples):
            template = random.choice(templates)
            query = fill_template(template)

            # Apply variations
            if random.random() < 0.3:
                query = add_filler(query)
            if random.random() < 0.1:
                query = add_typo(query)

            # Determine related tools (multi-label)
            selected_tools = [tool]
            group = None
            for g, tools in SIMILAR_TOOL_GROUPS.items():
                if tool in tools:
                    group = g
                    break

            # Sometimes add related tool as multi-label
            if group and random.random() < 0.2:
                other_tools = [t for t in SIMILAR_TOOL_GROUPS[group] if t != tool and t in TOOLS]
                if other_tools:
                    selected_tools.append(random.choice(other_tools))

            examples.append(Example(
                query=query,
                selected_tools=selected_tools,
                is_open_intent=False,
                source="synthetic"
            ))

    return examples

def generate_open_intent_examples() -> List[Example]:
    """Generate non-tool-triggering examples."""
    examples = []

    # Base open intents
    for intent in OPEN_INTENTS:
        examples.append(Example(
            query=intent,
            selected_tools=[],
            is_open_intent=True,
            source="open_intent"
        ))

    # Add variations using templates
    for _ in range(TARGET_OPEN_INTENTS - len(OPEN_INTENTS)):
        base = random.choice(OPEN_INTENTS)

        if random.random() < 0.4:
            template = random.choice(OPEN_INTENT_TEMPLATES)
            query = template.format(base=base)
        else:
            query = base

        # Add fillers
        if random.random() < 0.2:
            query = add_filler(query)

        examples.append(Example(
            query=query,
            selected_tools=[],
            is_open_intent=True,
            source="open_intent"
        ))

    return examples

def generate_hard_negatives() -> List[Example]:
    """Generate hard negative examples - similar queries, specific tool."""
    examples = []

    hard_negative_pairs = [
        # Calendar vs Reminder
        ("schedule a reminder", ["setReminder"], False),  # Not calendar!
        ("put a meeting on my schedule", ["createCalendarEvent"], False),
        ("remind me about the meeting", ["setReminder", "createReminder"], False),
        ("add meeting to calendar", ["createCalendarEvent", "scheduleEvent"], False),

        # Music controls
        ("stop", ["pauseMusic"], False),  # Could be confused as alarm/timer
        ("next", ["skipTrack"], False),
        ("pause", ["pauseMusic"], False),
        ("volume", ["adjustVolume"], False),

        # Memory vs general question
        ("what did I tell you about coffee", ["recallMemory", "getMemory"], False),
        ("what is coffee", ["lookup", "search"], False),  # General question, not memory

        # Habit vs Memory
        ("remember I exercised", ["logHabit", "trackHabit"], False),  # Habit, not memory
        ("remember that I like exercise", ["saveMemory", "storeInfo"], False),  # Memory, not habit
    ]

    for query, tools, is_open in hard_negative_pairs:
        for _ in range(3):  # Multiple variations each
            q = query
            if random.random() < 0.3:
                q = add_filler(q)
            examples.append(Example(
                query=q,
                selected_tools=tools,
                is_open_intent=is_open,
                source="hard_negative"
            ))

    return examples

def main():
    print("=" * 60)
    print("🚀 Enhanced FTIS V3 Training Data Generator")
    print("=" * 60)

    all_examples: List[Example] = []

    # 1. Tool examples
    print(f"\n1️⃣ Generating tool examples...")
    tool_examples = generate_tool_examples()
    all_examples.extend(tool_examples)
    print(f"   Generated {len(tool_examples)} tool examples")

    # 2. Open intent examples
    print(f"\n2️⃣ Generating open intent examples...")
    open_examples = generate_open_intent_examples()
    all_examples.extend(open_examples)
    print(f"   Generated {len(open_examples)} open intent examples")

    # 3. Hard negatives
    print(f"\n3️⃣ Generating hard negatives...")
    hard_negatives = generate_hard_negatives()
    all_examples.extend(hard_negatives)
    print(f"   Generated {len(hard_negatives)} hard negatives")

    # Shuffle
    random.shuffle(all_examples)

    # Split
    n = len(all_examples)
    train_end = int(n * 0.85)
    val_end = int(n * 0.925)

    train = all_examples[:train_end]
    val = all_examples[train_end:val_end]
    test = all_examples[val_end:]

    # Create output directory
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # Generate unique IDs and save
    timestamp = int(time.time() * 1000)

    for split_name, data in [("train", train), ("validation", val), ("test", test)]:
        output_path = DATA_DIR / f"{split_name}.jsonl"
        with open(output_path, 'w') as f:
            for i, ex in enumerate(data):
                record = {
                    "id": f"ftis_v3_{timestamp}_{i}",
                    "query": ex.query,
                    "selected_tools": ex.selected_tools,
                    "is_open_intent": ex.is_open_intent,
                    "source": ex.source,
                }
                f.write(json.dumps(record) + '\n')

    # Create label map
    label_map = {tool: i for i, tool in enumerate(sorted(TOOLS))}
    with open(DATA_DIR / "label_map.json", 'w') as f:
        json.dump(label_map, f, indent=2)

    # Statistics
    tool_count = sum(1 for ex in all_examples if not ex.is_open_intent)
    open_count = sum(1 for ex in all_examples if ex.is_open_intent)

    print(f"\n{'=' * 60}")
    print(f"✅ DATASET GENERATED!")
    print(f"{'=' * 60}")
    print(f"   Total examples: {n:,}")
    print(f"   Tool examples:  {tool_count:,} ({100*tool_count/n:.1f}%)")
    print(f"   Open intents:   {open_count:,} ({100*open_count/n:.1f}%)")
    print(f"\n   Train:      {len(train):,}")
    print(f"   Validation: {len(val):,}")
    print(f"   Test:       {len(test):,}")
    print(f"\n   Labels: {len(label_map)}")
    print(f"   Output: {DATA_DIR}")
    print(f"\n🎯 Ready for training! Run:")
    print(f"   python train_mps.py")
    print(f"{'=' * 60}")

if __name__ == "__main__":
    main()
