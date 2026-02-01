#!/usr/bin/env python3
"""
Generate hard negative training examples for FTIS V6 retraining.

Targets the 14 specific confusion pairs identified in V5-860 validation.
Uses Gemini Flash to generate diverse, natural queries.

Usage:
  export GOOGLE_API_KEY=...
  python3 generate_hard_negatives_v6.py
"""

import json
import os
import sys
import time
import uuid
from pathlib import Path

try:
    import google.generativeai as genai
except ImportError:
    print("Installing google-generativeai...")
    os.system(f"{sys.executable} -m pip install -q google-generativeai")
    import google.generativeai as genai

# Load API key from .env if not in environment
api_key = os.environ.get("GOOGLE_API_KEY")
if not api_key:
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("GOOGLE_API_KEY="):
                api_key = line.split("=", 1)[1].strip().strip('"').strip("'")
                break

if not api_key:
    print("ERROR: GOOGLE_API_KEY not found")
    sys.exit(1)

genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.0-flash")

OUTPUT_FILE = Path(__file__).parent / "data" / "hard_negatives_v6.jsonl"

# ==============================================================================
# CONFUSION PAIRS TO DISAMBIGUATE
# ==============================================================================

CONFUSION_PAIRS = [
    {
        "id": "calendar_vs_maintenance",
        "correct_tool": "getCalendarEvents",
        "confused_with": "getMaintenanceSchedule",
        "count": 60,
        "prompt": """Generate {count} diverse voice queries where the user wants to CHECK THEIR PERSONAL CALENDAR or see what events they have today/this week.

These should be natural spoken phrases like someone talking to a voice assistant. Examples:
- "what's on my calendar today"
- "do I have any meetings this afternoon"
- "what's my schedule look like tomorrow"
- "am I free on Thursday"

CRITICAL: These are about PERSONAL CALENDAR EVENTS (meetings, appointments, social plans), NOT about maintenance schedules, home repairs, or vehicle service.

Vary the phrasing, include casual/informal speech, ASR-style errors, different time references.
Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "create_calendar_vs_block",
        "correct_tool": "createCalendarEvent",
        "confused_with": "blockSender",
        "count": 60,
        "prompt": """Generate {count} diverse voice queries where the user wants to CREATE or BLOCK TIME on their personal calendar.

These should be natural spoken phrases like someone talking to a voice assistant. Examples:
- "block off Friday afternoon for deep work"
- "schedule a meeting with Tom on Tuesday"
- "set up a recurring standup every morning"
- "put lunch with Sarah on my calendar"
- "reserve next Monday for planning"

CRITICAL: These are about CREATING CALENDAR EVENTS or BLOCKING TIME, NOT about blocking email senders or contacts.

Include various phrasings: "block off", "set up", "schedule", "put on calendar", "reserve time", "book a slot".
Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "read_messages_inbound",
        "correct_tool": "analyzeMessage",
        "confused_with": "broadcastMessage",
        "count": 50,
        "prompt": """Generate {count} diverse voice queries where the user wants to READ, CHECK, or REVIEW their incoming messages or emails.

These should be natural spoken phrases like someone talking to a voice assistant. Examples:
- "read my messages"
- "check my email"
- "any new messages"
- "what emails did I get today"
- "read the latest from my boss"
- "summarize my inbox"

CRITICAL: These are about READING/RECEIVING messages (inbound), NOT about sending or broadcasting messages (outbound).

Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "mark_done_vs_groceries",
        "correct_tool": "markDone",
        "confused_with": "orderGroceries",
        "count": 50,
        "prompt": """Generate {count} diverse voice queries where the user wants to MARK A TASK AS DONE or COMPLETE A TO-DO ITEM.

These should be natural spoken phrases like someone talking to a voice assistant. Examples:
- "mark groceries as done"
- "check off the laundry"
- "I finished the report, mark it complete"
- "done with the dishes"
- "cross off buying milk from my list"
- "that task is finished"

CRITICAL: These are about COMPLETING/MARKING tasks as done, NOT about ordering or buying groceries.

Include both explicit ("mark X as done") and implicit ("I finished X", "X is done") phrasings.
Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "create_reminder",
        "correct_tool": "createReminder",
        "confused_with": "setTimer",
        "count": 50,
        "prompt": """Generate {count} diverse voice queries where the user wants to SET A REMINDER for a specific time or event.

These should be natural spoken phrases like someone talking to a voice assistant. Examples:
- "remind me to call mom at 5pm"
- "set a reminder for my dentist appointment"
- "remind me to pick up dry cleaning tomorrow"
- "don't let me forget to send that email"
- "remind me about the meeting in 2 hours"

CRITICAL: These are about REMINDERS (future notifications about tasks), NOT about timers (countdown for cooking, exercise, etc.).

Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "emotional_no_tool",
        "correct_tool": "__no_tool__",
        "confused_with": "betrayalTrauma",
        "count": 120,
        "prompt": """Generate {count} diverse voice queries where the user is SHARING AN EMOTION or FEELING in a casual, conversational way. These should NOT trigger any specific tool - they're just the user talking, venting, or sharing.

These should be natural spoken phrases. Examples:
- "I'm feeling stressed today"
- "I had a really great day"
- "I'm kind of anxious about tomorrow"
- "ugh I'm so tired"
- "I feel really happy right now"
- "just feeling a bit down"
- "man today was rough"
- "I'm excited about this weekend"
- "feeling grateful today"

CRITICAL: These are CASUAL EMOTIONAL SHARING that should result in empathetic conversation, NOT be routed to specific therapy/wellness tools like betrayalTrauma, jobSearchMentalHealth, etc. The AI should just TALK to the person, not invoke a specialized tool.

Include: happiness, sadness, stress, excitement, tiredness, gratitude, anxiety, frustration, contentment, nervousness, boredom, enthusiasm.
Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "knowledge_no_tool",
        "correct_tool": "__no_tool__",
        "confused_with": "dailyMeaningPractice",
        "count": 60,
        "prompt": """Generate {count} diverse voice queries where the user is asking a GENERAL KNOWLEDGE question, definition, or translation that should just be answered conversationally (no tool needed).

These should be natural spoken phrases. Examples:
- "define serendipity"
- "what does ephemeral mean"
- "translate hello to Spanish"
- "how do you say thank you in French"
- "what's the capital of Brazil"
- "who wrote Romeo and Juliet"
- "read me a bedtime story"
- "tell me a fun fact"
- "what's the difference between affect and effect"

CRITICAL: These are GENERAL KNOWLEDGE questions the AI should answer directly through conversation, NOT route to specialized tools.

Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "find_documents",
        "correct_tool": "search",
        "confused_with": "analyzeInboxPriority",
        "count": 50,
        "prompt": """Generate {count} diverse voice queries where the user wants to FIND or SEARCH for specific documents, files, or information.

These should be natural spoken phrases. Examples:
- "find my tax documents"
- "search for the quarterly report"
- "where did I save that PDF"
- "look up the meeting notes from last week"
- "find that article about machine learning"
- "search for recipes with chicken"

Include various contexts: work documents, personal files, web searches, recipes, articles.
Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "smart_home_security",
        "correct_tool": "controlLock",
        "confused_with": "cancelAlarm",
        "count": 40,
        "prompt": """Generate {count} diverse voice queries where the user wants to control SMART HOME SECURITY (locks, security system, cameras).

These should be natural spoken phrases. Examples:
- "arm the security system"
- "lock the front door"
- "is the house locked"
- "turn on the security cameras"
- "disarm the alarm"
- "check if the garage door is closed"

Return ONLY a JSON array of strings, no other text."""
    },
    {
        "id": "fitness_tracking",
        "correct_tool": "trackFitnessGoal",
        "confused_with": "viewStreak",
        "count": 40,
        "prompt": """Generate {count} diverse voice queries where the user wants to CHECK FITNESS PROGRESS or LOG EXERCISE.

These should be natural spoken phrases. Examples:
- "how many steps today"
- "what's my step count"
- "log a 30 minute run"
- "track my workout"
- "how many calories did I burn"
- "did I hit my exercise goal"

Return ONLY a JSON array of strings, no other text."""
    },
]

# ==============================================================================
# GENERATOR
# ==============================================================================

def generate_examples(pair: dict) -> list[dict]:
    """Generate hard negative examples for a confusion pair."""
    prompt = pair["prompt"].format(count=pair["count"])

    for attempt in range(3):
        try:
            response = model.generate_content(prompt)
            text = response.text.strip()

            # Parse JSON array from response
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()

            queries = json.loads(text)

            if not isinstance(queries, list):
                print(f"  WARNING: Expected list, got {type(queries)}")
                continue

            # Create training records
            records = []
            for query in queries:
                if not isinstance(query, str) or len(query.strip()) < 3:
                    continue

                tool = pair["correct_tool"]
                is_open = tool == "__no_tool__"

                records.append({
                    "id": f"hn_v6_{pair['id']}_{uuid.uuid4().hex[:8]}",
                    "query": query.strip(),
                    "selected_tools": [] if is_open else [tool],
                    "is_open_intent": is_open,
                    "source": "hard_negative_v6",
                    "confusion_pair": f"{pair['correct_tool']}_vs_{pair['confused_with']}",
                })

            return records

        except Exception as e:
            print(f"  Attempt {attempt+1} failed: {e}")
            time.sleep(2)

    return []


def main():
    print("=" * 60)
    print("FTIS V6: Hard Negative Generator")
    print("=" * 60)

    all_records = []

    for i, pair in enumerate(CONFUSION_PAIRS):
        print(f"\n[{i+1}/{len(CONFUSION_PAIRS)}] Generating: {pair['id']} ({pair['count']} examples)")
        print(f"  Correct: {pair['correct_tool']}")
        print(f"  Confused with: {pair['confused_with']}")

        records = generate_examples(pair)
        all_records.extend(records)
        print(f"  Generated: {len(records)} examples")

        # Rate limit
        if i < len(CONFUSION_PAIRS) - 1:
            time.sleep(1)

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        for rec in all_records:
            f.write(json.dumps(rec) + "\n")

    print(f"\n{'=' * 60}")
    print(f"Total hard negatives generated: {len(all_records)}")
    print(f"Output: {OUTPUT_FILE}")

    # Stats
    from collections import Counter
    tools = Counter(r["selected_tools"][0] if r["selected_tools"] else "__no_tool__" for r in all_records)
    print(f"\nBy tool:")
    for tool, count in tools.most_common():
        print(f"  {tool}: {count}")


if __name__ == "__main__":
    main()
