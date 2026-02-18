#!/usr/bin/env python3
"""
Generate Reference Audio for Persona Voice Embeddings

Creates synthetic reference audio for each Ferni persona using Google Cloud TTS
or system speech synthesis. The generated audio files can then be used with
train-persona-voices.sh to extract voice embeddings for Kyutai TTS.

This is a bootstrapping tool — for production quality, replace synthetic audio
with real voice actor recordings.

Usage:
    python3 scripts/kyutai/generate-persona-reference-audio.py
    python3 scripts/kyutai/generate-persona-reference-audio.py --persona ferni
    python3 scripts/kyutai/generate-persona-reference-audio.py --method gtts

Methods:
    gtts   — Google Cloud TTS (requires google-cloud-texttospeech)
    pyttsx — System TTS via pyttsx3 (offline, lower quality)
    edge   — Edge TTS (requires edge-tts, free, good quality)

Prerequisites:
    pip install edge-tts  # Recommended (free, good quality)
    # OR
    pip install gTTS      # Google TTS (requires internet)
    # OR
    pip install pyttsx3   # Offline system TTS
"""

import asyncio
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
VOICES_DIR = PROJECT_ROOT / "configs" / "voices"

# Persona definitions: voice characteristics and sample scripts
PERSONAS = {
    "ferni": {
        "description": "Warm, grounded male life coach. Mid-range pitch, steady cadence.",
        "edge_voice": "en-US-GuyNeural",  # Warm male voice
        "scripts": [
            "Hey, I'm really glad you're here. Let's take a moment together.",
            "You know, growth doesn't have to be dramatic. Sometimes the smallest step is the bravest.",
            "I've been thinking about what you shared last time. It stayed with me.",
            "There's no rush. We can sit with this for as long as you need.",
            "What matters most to you right now? Not what should matter. What actually does.",
        ],
    },
    "peter-john": {
        "description": "Calm, authoritative male researcher. Measured, thoughtful pace.",
        "edge_voice": "en-US-DavisNeural",  # Measured male voice
        "scripts": [
            "The data suggests an interesting pattern here. Let me walk you through it.",
            "Based on my analysis, there are three key factors to consider.",
            "Research shows that consistency matters more than intensity.",
            "Let me provide some context before we dive into the details.",
            "The evidence is compelling. Here's what the numbers tell us.",
        ],
    },
    "alex": {
        "description": "Clear, energetic communicator. Quick, articulate delivery.",
        "edge_voice": "en-US-JennyNeural",  # Clear, energetic voice
        "scripts": [
            "Great news! I've drafted that message for you. Take a look.",
            "Communication is all about clarity. Let me help you sharpen this.",
            "Here's what I'd suggest: lead with the impact, then the details.",
            "Your calendar's looking packed. Let me help you prioritize.",
            "Perfect! That's exactly the right tone. Confident but approachable.",
        ],
    },
    "maya": {
        "description": "Warm, encouraging female habits coach. Upbeat, steady rhythm.",
        "edge_voice": "en-US-AriaNeural",  # Warm, encouraging female
        "scripts": [
            "You're building something amazing, one small habit at a time.",
            "Let's check in on your morning routine. How did it feel today?",
            "Remember, tiny steps lead to big changes. You've already started.",
            "I'm proud of your consistency this week. That takes real strength.",
            "What if we tried stacking this habit onto something you already do?",
        ],
    },
    "jordan": {
        "description": "Enthusiastic, expressive event planner. Dynamic, celebratory.",
        "edge_voice": "en-US-JasonNeural",  # Enthusiastic male
        "scripts": [
            "This is going to be incredible! Let me help you plan every detail.",
            "Your anniversary is coming up. I've got some amazing ideas for you.",
            "The venue is perfect, the timing is right. This will be unforgettable.",
            "Let's make this celebration something everyone will remember.",
            "I love how thoughtful you are about this. The personal touches make it special.",
        ],
    },
    "nayan-patel": {
        "description": "Deep, contemplative male philosopher. Slow, deliberate pacing.",
        "edge_voice": "en-GB-RyanNeural",  # Deep, contemplative British voice
        "scripts": [
            "There is a certain wisdom in stillness. Let us sit with this question.",
            "The ancient Stoics would remind us: we cannot control events, only our response.",
            "Consider this perspective. What would your future self think about this choice?",
            "Life is not a problem to be solved, but a mystery to be lived.",
            "The journey inward is often the longest journey. But it is the most rewarding.",
        ],
    },
}


async def generate_with_edge_tts(persona_id: str, persona: dict, output_dir: Path):
    """Generate reference audio using Edge TTS (recommended, free, good quality)."""
    import edge_tts

    voice = persona["edge_voice"]
    print(f"  Using Edge TTS voice: {voice}")

    for i, script in enumerate(persona["scripts"], 1):
        output_file = output_dir / f"reference_{i:02d}.wav"
        communicate = edge_tts.Communicate(script, voice)
        # Edge TTS outputs mp3, convert to wav
        mp3_file = output_dir / f"reference_{i:02d}.mp3"
        await communicate.save(str(mp3_file))

        # Convert mp3 to wav using ffmpeg or just keep mp3 if no ffmpeg
        try:
            proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-i", str(mp3_file), "-ar", "24000", "-ac", "1",
                str(output_file),
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await proc.wait()
            mp3_file.unlink()
            print(f"    [{i}/{len(persona['scripts'])}] {output_file.name}")
        except FileNotFoundError:
            # No ffmpeg — rename mp3 with note
            mp3_file.rename(output_file.with_suffix(".mp3"))
            print(f"    [{i}/{len(persona['scripts'])}] {output_file.with_suffix('.mp3').name} (install ffmpeg for WAV)")


async def generate_with_gtts(persona_id: str, persona: dict, output_dir: Path):
    """Generate reference audio using Google TTS (requires gTTS)."""
    from gtts import gTTS
    import subprocess

    for i, script in enumerate(persona["scripts"], 1):
        output_file = output_dir / f"reference_{i:02d}.wav"
        mp3_file = output_dir / f"reference_{i:02d}.mp3"

        tts = gTTS(text=script, lang="en", slow=False)
        tts.save(str(mp3_file))

        # Convert to WAV
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", str(mp3_file), "-ar", "24000", "-ac", "1", str(output_file)],
                capture_output=True, check=True,
            )
            mp3_file.unlink()
            print(f"    [{i}/{len(persona['scripts'])}] {output_file.name}")
        except (FileNotFoundError, subprocess.CalledProcessError):
            print(f"    [{i}/{len(persona['scripts'])}] {mp3_file.name} (install ffmpeg for WAV)")


def generate_with_pyttsx(persona_id: str, persona: dict, output_dir: Path):
    """Generate reference audio using system TTS (offline)."""
    import pyttsx3

    engine = pyttsx3.init()
    # Try to match persona voice characteristics
    voices = engine.getProperty("voices")
    if voices:
        # Simple heuristic: pick male/female voice based on persona
        female_personas = {"maya", "alex"}
        for v in voices:
            if persona_id in female_personas and "female" in str(v.name).lower():
                engine.setProperty("voice", v.id)
                break
            elif persona_id not in female_personas and "male" in str(v.name).lower():
                engine.setProperty("voice", v.id)
                break

    # Adjust rate for persona
    slow_personas = {"nayan-patel"}
    fast_personas = {"alex", "jordan"}
    if persona_id in slow_personas:
        engine.setProperty("rate", 140)
    elif persona_id in fast_personas:
        engine.setProperty("rate", 180)
    else:
        engine.setProperty("rate", 160)

    for i, script in enumerate(persona["scripts"], 1):
        output_file = output_dir / f"reference_{i:02d}.wav"
        engine.save_to_file(script, str(output_file))
        engine.runAndWait()
        print(f"    [{i}/{len(persona['scripts'])}] {output_file.name}")


async def main():
    import argparse

    parser = argparse.ArgumentParser(description="Generate persona reference audio")
    parser.add_argument("--persona", type=str, help="Generate for specific persona only")
    parser.add_argument("--method", type=str, default="edge", choices=["edge", "gtts", "pyttsx"],
                        help="TTS method (default: edge)")
    parser.add_argument("--dry-run", action="store_true", help="Preview without generating")
    args = parser.parse_args()

    personas_to_process = {args.persona: PERSONAS[args.persona]} if args.persona else PERSONAS

    print("🎤 Persona Reference Audio Generator")
    print("=" * 40)
    print(f"Method: {args.method}")
    print(f"Output: {VOICES_DIR}/")
    print()

    for persona_id, persona in personas_to_process.items():
        ref_dir = VOICES_DIR / persona_id / "reference"
        print(f"🎭 {persona_id}")
        print(f"   {persona['description']}")
        print(f"   Scripts: {len(persona['scripts'])}")
        print(f"   Output: {ref_dir}")

        if args.dry_run:
            print("   [DRY RUN] Would generate audio")
            print()
            continue

        ref_dir.mkdir(parents=True, exist_ok=True)

        try:
            if args.method == "edge":
                await generate_with_edge_tts(persona_id, persona, ref_dir)
            elif args.method == "gtts":
                await generate_with_gtts(persona_id, persona, ref_dir)
            elif args.method == "pyttsx":
                generate_with_pyttsx(persona_id, persona, ref_dir)
        except ImportError as e:
            print(f"   ❌ Missing dependency: {e}")
            print(f"   Install: pip install {'edge-tts' if args.method == 'edge' else args.method}")
        except Exception as e:
            print(f"   ❌ Error: {e}")

        print()

    print("=" * 40)
    print("Next steps:")
    print("  1. Review generated audio in configs/voices/*/reference/")
    print("  2. Replace with real voice actor recordings for production quality")
    print("  3. Run: ./scripts/kyutai/train-persona-voices.sh")
    print("  4. Test: TTS_PROVIDER=kyutai pnpm dev")


if __name__ == "__main__":
    asyncio.run(main())
