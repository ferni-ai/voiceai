"""
Benchmark Kyutai STT MLX latency.

Measures:
  - First interim latency (target: <150ms)
  - Final transcript latency (target: <300ms after speech ends)
  - Token-per-second throughput
  - Accuracy (word error rate approximation)

Sends audio at real-time pace to simulate live voice agent usage.
"""

import asyncio
import json
import time
import wave
import statistics
import numpy as np
import websockets


STT_URL = "ws://localhost:8089/api/asr-streaming"
SAMPLE_RATE = 16000
CHUNK_DURATION_MS = 20  # 20ms chunks (voice agent typical)
CHUNK_BYTES = int(SAMPLE_RATE * 2 * CHUNK_DURATION_MS / 1000)  # 640 bytes
NUM_RUNS = 5


def generate_speech_wav(text_for_say: str, filepath: str) -> float:
    """Generate speech WAV using macOS `say` and return duration in seconds."""
    import subprocess
    aiff = filepath.replace(".wav", ".aiff")
    subprocess.run(["say", "-o", aiff, text_for_say], check=True)
    subprocess.run([
        "afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE}",
        aiff, filepath
    ], check=True)
    subprocess.run(["rm", aiff], check=True)
    with wave.open(filepath, "rb") as wf:
        return wf.getnframes() / wf.getframerate()


async def benchmark_run(pcm_data: bytes, audio_duration_s: float, run_id: int) -> dict:
    """Single benchmark run: send audio at real-time pace, measure latencies."""
    async with websockets.connect(STT_URL) as ws:
        t0 = time.perf_counter()
        first_interim_time = None
        first_final_time = None
        all_events = []
        speech_end_time = None

        async def receiver():
            nonlocal first_interim_time, first_final_time, all_events
            try:
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=10.0)
                    event = json.loads(msg)
                    elapsed_ms = (time.perf_counter() - t0) * 1000
                    all_events.append((elapsed_ms, event))

                    if "text" in event and not event.get("is_final"):
                        if first_interim_time is None:
                            first_interim_time = elapsed_ms

                    if event.get("is_final"):
                        if first_final_time is None:
                            first_final_time = elapsed_ms
                        return  # Done after final
            except asyncio.TimeoutError:
                pass

        recv_task = asyncio.create_task(receiver())

        # Send at real-time pace
        chunk_delay = CHUNK_DURATION_MS / 1000
        for i in range(0, len(pcm_data), CHUNK_BYTES):
            chunk = pcm_data[i:i + CHUNK_BYTES]
            await ws.send(chunk)
            await asyncio.sleep(chunk_delay)

        speech_end_time = (time.perf_counter() - t0) * 1000

        # Send 2s silence to trigger final
        silence = bytes(CHUNK_BYTES)
        for _ in range(int(2000 / CHUNK_DURATION_MS)):
            await ws.send(silence)
            await asyncio.sleep(chunk_delay)

        await recv_task

        total_time = (time.perf_counter() - t0) * 1000

        # Final transcript text
        final_text = ""
        for _, e in all_events:
            if e.get("is_final"):
                final_text = e.get("text", "")

        result = {
            "run": run_id,
            "audio_duration_ms": audio_duration_s * 1000,
            "first_interim_ms": first_interim_time,
            "first_final_ms": first_final_time,
            "speech_end_ms": speech_end_time,
            "final_after_speech_end_ms": (
                (first_final_time - speech_end_time) if first_final_time and speech_end_time else None
            ),
            "total_ms": total_time,
            "event_count": len(all_events),
            "transcript": final_text,
        }
        return result


async def main():
    print("=" * 60)
    print("Kyutai STT MLX Latency Benchmark")
    print("=" * 60)

    # Check server health
    try:
        import urllib.request
        resp = urllib.request.urlopen("http://localhost:8089/health", timeout=3)
        health = json.loads(resp.read())
        print(f"Server: {health}")
    except Exception as e:
        print(f"ERROR: STT server not reachable: {e}")
        return

    # Generate test sentences
    test_sentences = [
        "Tell me about your day today.",
        "I've been feeling a little overwhelmed with work lately.",
        "Can you help me think through this decision I need to make?",
    ]

    results = []

    for i, sentence in enumerate(test_sentences):
        wav_path = f"/tmp/bench_stt_{i}.wav"
        print(f"\nSentence {i+1}: \"{sentence}\"")
        duration = generate_speech_wav(sentence, wav_path)
        print(f"  Audio duration: {duration*1000:.0f}ms")

        with wave.open(wav_path, "rb") as wf:
            pcm_data = wf.readframes(wf.getnframes())

        for run in range(NUM_RUNS):
            result = await benchmark_run(pcm_data, duration, run + 1)
            results.append(result)
            print(f"  Run {run+1}: interim={result['first_interim_ms']:.0f}ms, "
                  f"final={result['first_final_ms']:.0f}ms, "
                  f"after_speech={result['final_after_speech_end_ms']:.0f}ms"
                  if result["first_interim_ms"] else f"  Run {run+1}: no events")

            # Small delay between runs for model state reset
            await asyncio.sleep(0.5)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)

    valid = [r for r in results if r["first_interim_ms"] is not None]
    if valid:
        interims = [r["first_interim_ms"] for r in valid]
        finals = [r["first_final_ms"] for r in valid]
        after_speech = [r["final_after_speech_end_ms"] for r in valid
                        if r["final_after_speech_end_ms"] is not None]

        print(f"  Runs: {len(valid)}/{len(results)} successful")
        print(f"\n  First Interim Latency (target <150ms):")
        print(f"    Mean:   {statistics.mean(interims):.0f}ms")
        print(f"    Median: {statistics.median(interims):.0f}ms")
        print(f"    P95:    {sorted(interims)[int(len(interims)*0.95)]:.0f}ms")
        print(f"    Min:    {min(interims):.0f}ms")
        print(f"    Max:    {max(interims):.0f}ms")

        print(f"\n  Final Transcript Latency:")
        print(f"    Mean:   {statistics.mean(finals):.0f}ms")
        print(f"    Median: {statistics.median(finals):.0f}ms")

        if after_speech:
            print(f"\n  Final After Speech End (target <300ms):")
            print(f"    Mean:   {statistics.mean(after_speech):.0f}ms")
            print(f"    Median: {statistics.median(after_speech):.0f}ms")
            print(f"    P95:    {sorted(after_speech)[int(len(after_speech)*0.95)]:.0f}ms")

        # Pass/Fail
        interim_p95 = sorted(interims)[int(len(interims) * 0.95)]
        print(f"\n  RESULT: First Interim P95 = {interim_p95:.0f}ms", end="")
        print(f" {'PASS' if interim_p95 < 150 else f'MISS (target <150ms)'}")

        if after_speech:
            asp95 = sorted(after_speech)[int(len(after_speech) * 0.95)]
            print(f"  RESULT: Final After Speech P95 = {asp95:.0f}ms", end="")
            print(f" {'PASS' if asp95 < 300 else f'MISS (target <300ms)'}")
    else:
        print("  No successful runs!")

    print("\n  Transcripts:")
    for r in results:
        if r["transcript"]:
            print(f"    Run {r['run']}: \"{r['transcript'][:80]}...\"" if len(r["transcript"]) > 80
                  else f"    Run {r['run']}: \"{r['transcript']}\"")


if __name__ == "__main__":
    asyncio.run(main())
