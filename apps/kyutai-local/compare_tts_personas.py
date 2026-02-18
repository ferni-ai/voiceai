"""
Generate Kyutai TTS samples for all 6 Ferni personas for quality comparison.

Generates audio for the same test sentences across all personas.
Output: WAV files in compare_output/ directory.

Note: Kyutai currently uses the same default voice for all personas
(custom Ferni voice embeddings not yet trained). Cartesia comparison
requires the Cartesia API key and running agent.
"""

import asyncio
import json
import os
import time
import numpy as np
import websockets
import sphn

TTS_URL = "ws://localhost:8090/api/tts_streaming"
OUTPUT_DIR = "compare_output"
SAMPLE_RATE = 24000

# Ferni personas
PERSONAS = [
    ("ferni", "Ferni (Life Coach)"),
    ("maya", "Maya (Habits/Routines)"),
    ("peter-john", "Peter (Research)"),
    ("alex", "Alex (Communications)"),
    ("jordan", "Jordan (Event Planning)"),
    ("nayan-patel", "Nayan (Wisdom/Philosophy)"),
]

# Test sentences covering different emotional tones
TEST_SENTENCES = [
    ("warm_greeting", "Hey there! It's so good to see you today. How have you been?"),
    ("empathetic", "I hear you. That sounds really tough. I want you to know I'm here for you."),
    ("enthusiastic", "Oh wow, that's amazing! You should be really proud of what you've accomplished!"),
    ("reflective", "Sometimes the best thing we can do is take a step back and breathe. Let's think about this together."),
    ("practical", "Okay, so here's what I think we should do. First, let's make a list of your priorities for the week."),
]


async def synthesize(text: str, voice_id: str) -> tuple[bytes, float, float]:
    """Send text to TTS, return (pcm_bytes, ttfb_ms, total_ms)."""
    async with websockets.connect(TTS_URL) as ws:
        t0 = time.perf_counter()
        first_audio = None
        chunks = []

        await ws.send(json.dumps({"text": text, "voice_id": voice_id}))

        done = False
        while not done:
            msg = await asyncio.wait_for(ws.recv(), timeout=30.0)
            elapsed = (time.perf_counter() - t0) * 1000
            if isinstance(msg, bytes):
                if first_audio is None:
                    first_audio = elapsed
                chunks.append(msg)
            elif isinstance(msg, str):
                data = json.loads(msg)
                if data.get("done"):
                    done = True

        total = (time.perf_counter() - t0) * 1000
        pcm = b"".join(chunks)
        return pcm, first_audio or 0, total


async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    print("=" * 70)
    print("Kyutai TTS Persona Quality Comparison")
    print("=" * 70)

    # Check server
    import urllib.request
    try:
        resp = urllib.request.urlopen("http://localhost:8090/health", timeout=3)
        health = json.loads(resp.read())
        print(f"TTS Server: {health['model']} ({health['backend']})")
    except Exception as e:
        print(f"ERROR: TTS server unreachable: {e}")
        return

    results = []
    total_audio = 0

    for persona_id, persona_name in PERSONAS:
        print(f"\n--- {persona_name} (voice_id={persona_id}) ---")

        for sent_id, text in TEST_SENTENCES:
            pcm, ttfb, total_ms = await synthesize(text, persona_id)

            if len(pcm) > 0:
                audio_f32 = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
                duration = len(audio_f32) / SAMPLE_RATE
                speed = duration / (total_ms / 1000)

                filename = f"{persona_id}_{sent_id}.wav"
                filepath = os.path.join(OUTPUT_DIR, filename)
                sphn.write_wav(filepath, audio_f32, SAMPLE_RATE)

                total_audio += duration
                results.append({
                    "persona": persona_id,
                    "sentence": sent_id,
                    "ttfb_ms": ttfb,
                    "total_ms": total_ms,
                    "duration_s": duration,
                    "speed_x": speed,
                    "file": filename,
                })

                print(f"  {sent_id}: {duration:.1f}s audio, TTFB={ttfb:.0f}ms, {speed:.2f}x RT -> {filename}")
            else:
                print(f"  {sent_id}: NO AUDIO (error)")
                results.append({
                    "persona": persona_id,
                    "sentence": sent_id,
                    "error": "no audio",
                })

    # Summary
    print(f"\n{'=' * 70}")
    print("SUMMARY")
    print(f"{'=' * 70}")

    valid = [r for r in results if "error" not in r]
    if valid:
        avg_ttfb = sum(r["ttfb_ms"] for r in valid) / len(valid)
        avg_speed = sum(r["speed_x"] for r in valid) / len(valid)
        print(f"  Total samples: {len(valid)}")
        print(f"  Total audio: {total_audio:.1f}s")
        print(f"  Avg TTFB: {avg_ttfb:.0f}ms")
        print(f"  Avg speed: {avg_speed:.2f}x real-time")
        print(f"  Output dir: {OUTPUT_DIR}/")

    errors = [r for r in results if "error" in r]
    if errors:
        print(f"  Errors: {len(errors)}")

    # Note about voice differentiation
    print(f"\n  NOTE: All personas currently use the same default voice")
    print(f"  (expresso/ex03-ex01_happy_001_channel1_334s.wav)")
    print(f"  Custom Ferni voice embeddings need to be trained and placed in")
    print(f"  the kyutai/tts-voices HuggingFace repo for persona-specific voices.")
    print(f"\n  To compare vs Cartesia:")
    print(f"  1. Start the voice agent with TTS_PROVIDER=cartesia")
    print(f"  2. Record the same sentences through each persona")
    print(f"  3. Compare naturalness, prosody, and persona distinctiveness")

    # Save results JSON
    results_path = os.path.join(OUTPUT_DIR, "results.json")
    with open(results_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved to: {results_path}")


if __name__ == "__main__":
    asyncio.run(main())
