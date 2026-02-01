#!/usr/bin/env python3
"""
Generate additional open intent (no-tool) training examples to boost
the __no_tool__ ratio from 15.8% to ~25% in the final training dataset.

The train_v5_860.jsonl has 399,452 total with 62,964 open intent (15.8%).
To reach 25%, we need: (62,964 + X) / (399,452 + X) = 0.25
Solving: X ≈ 48,659 additional open intent examples.

We'll generate ~50,000 additional no-tool queries across diverse categories.

Usage:
  export GOOGLE_API_KEY=...
  python3 generate_open_intent_boost.py
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

# Load API key
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

OUTPUT_FILE = Path(__file__).parent / "data" / "open_intent_boost_v6.jsonl"

# ==============================================================================
# OPEN INTENT CATEGORIES (no tool should trigger)
# ==============================================================================

CATEGORIES = [
    {
        "id": "casual_emotional",
        "count": 6000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse things someone might say to their AI voice assistant that are just CASUAL EMOTIONAL SHARING - not requesting any action. These should be natural, spoken phrases.

Categories to cover:
- Sharing feelings (happy, sad, stressed, tired, excited, anxious, grateful)
- Venting about the day
- Expressing frustration
- Sharing good news
- Processing difficult emotions
- General mood statements
- Physical state ("I'm exhausted", "feeling under the weather")

Examples:
"I'm having a rough day"
"you know what, today was actually really good"
"ugh I'm so stressed about this deadline"
"I can't believe how tired I am"
"I'm feeling really grateful right now"
"man this week has been crazy"
"I just feel blah today"
"I'm excited about my trip next month"

CRITICAL: These should NOT trigger any tool. The AI should just respond conversationally with empathy.
Include ASR-style speech patterns (ums, likes, you know).
Return ONLY a JSON array of strings."""
    },
    {
        "id": "small_talk",
        "count": 5000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse SMALL TALK phrases someone might say to their AI voice assistant. These are conversational, not requesting any specific action.

Categories to cover:
- Greetings and goodbyes
- How are you exchanges
- Commenting on weather
- Talking about weekend plans (without requesting scheduling)
- Sharing opinions
- Random observations
- Jokes and banter
- "Tell me about yourself"
- Philosophical musings
- Daily life commentary

Examples:
"hey how are you doing"
"good morning"
"what a beautiful day outside"
"I was just thinking about something"
"so what do you think about that"
"tell me something interesting"
"I had the weirdest dream last night"
"you know what's funny"
"anyway"
"that reminds me of something"
"hmm let me think"

CRITICAL: These are pure conversation, NO tool should trigger.
Return ONLY a JSON array of strings."""
    },
    {
        "id": "stories_sharing",
        "count": 5000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse phrases where someone is TELLING A STORY or SHARING AN EXPERIENCE with their AI voice assistant. Not requesting any action.

Categories:
- "So today at work..."
- "You won't believe what happened"
- "I was talking to my friend and..."
- "Remember when I told you about..."
- "Something funny happened"
- "I learned something new today"
- "My kid said the funniest thing"
- "I tried that restaurant you suggested" (just sharing, not requesting)
- Sharing achievements
- Describing experiences

Examples:
"so get this, my coworker just quit"
"I finally talked to my mom about it"
"you won't believe what happened at the store"
"I've been thinking about what you said last time"
"so I tried that meditation thing"
"my dog did the cutest thing today"
"I had a really interesting conversation with my neighbor"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "questions_general",
        "count": 5000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse GENERAL QUESTIONS someone might ask their AI voice assistant that should be answered conversationally (no tool needed).

Categories:
- Definitions ("what does ephemeral mean")
- General knowledge ("who invented the telephone")
- Opinions ("what do you think about remote work")
- Explanations ("why is the sky blue")
- Comparisons ("what's the difference between a latte and cappuccino")
- Translations ("how do you say thank you in Japanese")
- Trivia ("what's the tallest building in the world")
- Life advice (general, not specialized coaching)
- Hypotheticals ("what would you do if...")
- Philosophy ("what is the meaning of life")

Examples:
"what does serendipity mean"
"translate hello to mandarin"
"who wrote the great gatsby"
"what's your opinion on that"
"explain quantum computing like I'm five"
"what would you do in my situation"
"is it better to rent or buy"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "acknowledgments",
        "count": 4000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse ACKNOWLEDGMENT and RESPONSE phrases someone might say during a conversation with their AI voice assistant. These are conversational turn-taking phrases, not commands.

Categories:
- Agreements ("yeah that makes sense", "totally")
- Disagreements ("hmm I'm not sure about that", "I don't think so")
- Thinking phrases ("let me think about that", "hmm")
- Follow-ups ("tell me more", "and then what")
- Gratitude ("thanks", "that's helpful")
- Confirmations ("exactly", "that's what I was thinking")
- Filler/backchanneling ("uh huh", "right", "okay")
- Topic changes ("anyway, so...")
- Corrections ("no I meant...", "wait actually...")
- Reactions ("oh wow", "no way", "seriously?", "that's crazy")

Examples:
"yeah that's a good point"
"hmm I never thought of it that way"
"okay cool"
"wait really"
"oh that makes sense"
"can you explain that differently"
"yeah I see what you mean"
"interesting"
"huh I didn't know that"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "work_life_sharing",
        "count": 4000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse phrases where someone is sharing about WORK or DAILY LIFE without requesting any specific action. Just talking and processing.

Categories:
- Work updates ("my meeting went well")
- Career thoughts ("I'm thinking about switching jobs")
- Relationship updates ("things are going better with my partner")
- Health sharing ("I started eating better")
- Hobby talk ("I picked up painting")
- Travel plans discussion (not scheduling)
- Family updates
- Life reflections

Examples:
"my boss actually liked my presentation"
"I'm not sure if this job is right for me anymore"
"things have been going really well with Sarah"
"I've been trying to eat healthier"
"I started reading that book you mentioned"
"my kids are driving me crazy today"
"I'm thinking about going back to school"
"I finally cleaned out the garage this weekend"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "meta_conversation",
        "count": 3000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse META-CONVERSATIONAL phrases - things people say ABOUT the conversation itself or about the AI assistant.

Categories:
- About the AI ("you're pretty smart", "how do you know all this")
- About the conversation ("this is a good conversation")
- About themselves ("I talk too much", "sorry I'm rambling")
- Self-reflection during convo ("actually now that I say that out loud...")
- Topic navigation ("going back to what we were talking about")
- Corrections and clarifications
- Checking understanding ("does that make sense")
- Emotional processing ("I needed to hear that")

Examples:
"you know you're actually really helpful"
"sorry I keep going off on tangents"
"actually let me rephrase that"
"does that make sense"
"I think I needed to hear that"
"going back to what you said earlier"
"how do you always know what to say"
"I didn't even realize I felt that way until now"
"you're easy to talk to"
"I'm probably overthinking this"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "silence_and_pauses",
        "count": 2000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse SHORT UTTERANCES and FILLER phrases that people say during natural conversation pauses. These represent speech fragments that an ASR system might capture.

Categories:
- Thinking sounds ("hmm", "um", "let me see")
- Hesitation ("well...", "so...", "I mean...")
- Partial sentences ("I was going to say...", "never mind")
- Restarts ("wait no", "actually", "hold on")
- Self-corrections ("I mean", "no wait", "sorry what I meant was")
- Very short responses ("yeah", "no", "okay", "sure", "right")
- Trailing thoughts ("but then again...", "I don't know...")

Examples:
"hmm"
"uh let me think"
"well"
"um"
"so anyway"
"wait what was I saying"
"oh right"
"yeah no definitely"
"I mean I guess"
"huh"
"like I don't know"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "opinions_debates",
        "count": 3000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse phrases where someone is sharing OPINIONS, PERSPECTIVES, or having a light DEBATE with their AI. No tool needed.

Categories:
- Hot takes ("I think pineapple on pizza is great")
- Movie/show opinions ("that movie was terrible")
- News reactions ("can you believe what happened")
- Sports talk ("my team finally won")
- Food opinions ("nothing beats a good burger")
- Tech opinions ("AI is going to change everything")
- Pop culture ("did you see what happened on that show")
- Lifestyle debates ("morning person vs night owl")

Examples:
"I honestly think remote work is better"
"don't even get me started on that movie"
"coffee is way better than tea fight me"
"I can't believe they cancelled that show"
"my team is going to win this year I can feel it"
"I think people overthink things"
"best pizza I ever had was in New York"
"I don't get the hype around that"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "planning_thinking_aloud",
        "count": 3000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse phrases where someone is THINKING OUT LOUD or BRAINSTORMING without requesting the AI to take any specific action. They're using the AI as a sounding board.

Categories:
- Decision making ("should I take this job or not")
- Pro/con weighing ("on one hand... on the other hand")
- Future planning (thinking, not scheduling)
- Problem solving ("how do I approach this")
- Processing decisions ("I keep going back and forth")
- Weighing options
- Seeking perspective (conversational, not coaching-tool)

Examples:
"I'm trying to figure out if I should move to a new city"
"okay so here's what I'm thinking"
"I keep going back and forth on this"
"what if I just do nothing"
"I mean the pros are obvious but the cons..."
"I need to think about this differently"
"help me think through this"
"so the options are basically A or B"
"I don't know which is the right call"
"part of me wants to just go for it"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "past_reflections",
        "count": 3000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse phrases where someone is REFLECTING ON THE PAST - memories, regrets, lessons learned, nostalgia. No tool needed, just conversation.

Categories:
- Nostalgia ("I miss college", "remember when things were simpler")
- Lessons learned ("I wish I had known that earlier")
- Relationship reflections ("my dad always used to say")
- Growth ("I've changed so much in the last year")
- Regrets (mild, conversational)
- Gratitude for past events
- Childhood memories
- Past mistakes and learning

Examples:
"I was just thinking about when I was a kid"
"you know my grandmother always said that"
"if I could go back I would do things differently"
"I've come a long way from where I started"
"I miss the way things used to be sometimes"
"looking back I think that was the right decision"
"I learned that lesson the hard way"
"things were so much simpler back then"

Return ONLY a JSON array of strings."""
    },
    {
        "id": "gratitude_celebration",
        "count": 2000,
        "batch_size": 200,
        "prompt": """Generate {count} diverse phrases where someone is expressing GRATITUDE or CELEBRATING something without requesting any tool. Just sharing joy.

Categories:
- Appreciation for the AI ("thanks for listening")
- Celebrating wins ("I got the promotion!")
- Gratitude for life ("I'm so lucky")
- Celebrating others ("my friend did amazing")
- Small victories ("I actually woke up early today")
- Milestone recognition ("one year sober today")
- Simple joys ("my coffee is perfect today")

Examples:
"I just wanted to say thanks for always being here"
"I got the job!"
"I can't believe how lucky I am"
"my daughter took her first steps today"
"I finally finished that project"
"I feel so blessed"
"today is a good day"
"I'm proud of myself for sticking with it"

Return ONLY a JSON array of strings."""
    },
]


def generate_batch(category: dict, batch_num: int, batch_size: int) -> list[dict]:
    """Generate a batch of open intent examples."""
    prompt = category["prompt"].format(count=batch_size)

    for attempt in range(3):
        try:
            response = model.generate_content(prompt)
            text = response.text.strip()

            if "```json" in text:
                text = text.split("```json")[1].split("```")[0].strip()
            elif "```" in text:
                text = text.split("```")[1].split("```")[0].strip()

            queries = json.loads(text)

            if not isinstance(queries, list):
                continue

            records = []
            for query in queries:
                if not isinstance(query, str) or len(query.strip()) < 2:
                    continue
                records.append({
                    "id": f"oi_v6_{category['id']}_{uuid.uuid4().hex[:8]}",
                    "query": query.strip(),
                    "selected_tools": [],
                    "is_open_intent": True,
                    "source": "open_intent_boost_v6",
                    "category": category["id"],
                })

            return records

        except Exception as e:
            print(f"    Attempt {attempt+1} failed: {e}")
            time.sleep(2)

    return []


def main():
    print("=" * 60)
    print("FTIS V6: Open Intent Boost Generator")
    print(f"Target: ~50,000 additional open intent examples")
    print("=" * 60)

    all_records = []

    for i, category in enumerate(CATEGORIES):
        target = category["count"]
        batch_size = category["batch_size"]
        num_batches = (target + batch_size - 1) // batch_size

        print(f"\n[{i+1}/{len(CATEGORIES)}] {category['id']}: generating {target} examples ({num_batches} batches)")

        cat_records = []
        for batch_num in range(num_batches):
            remaining = target - len(cat_records)
            this_batch = min(batch_size, remaining)

            records = generate_batch(category, batch_num, this_batch)
            cat_records.extend(records)

            # Progress
            pct = len(cat_records) / target * 100
            print(f"  Batch {batch_num+1}/{num_batches}: +{len(records)} (total: {len(cat_records)}/{target}, {pct:.0f}%)")

            # Rate limit
            time.sleep(0.5)

            if len(cat_records) >= target:
                break

        all_records.extend(cat_records)
        print(f"  Done: {len(cat_records)} examples")

    # Write output
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        for rec in all_records:
            f.write(json.dumps(rec) + "\n")

    print(f"\n{'=' * 60}")
    print(f"Total open intent examples: {len(all_records)}")
    print(f"Output: {OUTPUT_FILE}")

    # Category breakdown
    from collections import Counter
    cats = Counter(r["category"] for r in all_records)
    print(f"\nBy category:")
    for cat, count in cats.most_common():
        print(f"  {cat}: {count}")


if __name__ == "__main__":
    main()
