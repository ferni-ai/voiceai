"""
End-to-end pipeline test: STT -> (simulated LLM) -> TTS

Tests the full self-hosted voice pipeline:
1. Generate speech audio (macOS say)
2. Send to Kyutai STT -> get transcript
3. (Would normally go to Gemini Flash LLM)
4. Send LLM response text to Kyutai TTS -> get audio
5. Measure total latency
"""

import asyncio
import json
import time
import wave
import subprocess
import numpy as np
import websockets
import sphn


STT_URL = "ws://localhost:8089/api/asr-streaming"
TTS_URL = "ws://localhost:8090/api/tts_streaming"
SAMPLE_RATE_STT = 16000
SAMPLE_RATE_TTS = 24000


async def stt_transcribe(pcm_data: bytes) -> tuple[str, float, float]:
    """Send audio to STT, return (transcript, first_interim_ms, final_ms)."""
    async with websockets.connect(STT_URL) as ws:
        t0 = time.perf_counter()
        first_interim = None
        final_text = ""
        final_time = None

        async def receiver():
            nonlocal first_interim, final_text, final_time
            try:
                while True:
                    msg = await asyncio.wait_for(ws.recv(), timeout=15.0)
                    event = json.loads(msg)
                    elapsed = (time.perf_counter() - t0) * 1000
                    if "text" in event and not event.get("is_final"):
                        if first_interim is None:
                            first_interim = elapsed
                    if event.get("is_final"):
                        final_text = event.get("text", "")
                        final_time = elapsed
                        return
            except asyncio.TimeoutError:
                pass

        recv = asyncio.create_task(receiver())

        # Send at real-time pace
        chunk = 3200  # 100ms
        for i in range(0, len(pcm_data), chunk):
            await ws.send(pcm_data[i:i + chunk])
            await asyncio.sleep(0.1)

        # Silence to trigger final
        silence = bytes(chunk)
        for _ in range(15):
            await ws.send(silence)
            await asyncio.sleep(0.1)

        await recv
        return final_text, first_interim or 0, final_time or 0


async def tts_synthesize(text: str) -> tuple[bytes, float, float]:
    """Send text to TTS, return (pcm_bytes, ttfb_ms, total_ms)."""
    async with websockets.connect(TTS_URL) as ws:
        t0 = time.perf_counter()
        first_audio = None
        chunks = []

        await ws.send(json.dumps({"text": text, "voice_id": "ferni"}))

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
    print("=" * 60)
    print("Self-Hosted Voice Pipeline E2E Test")
    print("STT: Kyutai 1B (MLX) | TTS: Kyutai 1.6B (MLX INT8)")
    print("=" * 60)

    # Check both servers
    for name, url in [("STT", "http://localhost:8089/health"), ("TTS", "http://localhost:8090/health")]:
        import urllib.request
        try:
            resp = urllib.request.urlopen(url, timeout=3)
            health = json.loads(resp.read())
            print(f"  {name}: {health['status']} ({health['model']})")
        except Exception as e:
            print(f"  {name}: UNREACHABLE ({e})")
            return

    # Generate test audio
    test_input = "I've been feeling a bit stressed about my upcoming presentation."
    print(f"\n[User]: \"{test_input}\"")

    # Create WAV
    aiff = "/tmp/e2e_test.aiff"
    wav = "/tmp/e2e_test.wav"
    subprocess.run(["say", "-o", aiff, test_input], check=True)
    subprocess.run(["afconvert", "-f", "WAVE", "-d", f"LEI16@{SAMPLE_RATE_STT}", aiff, wav], check=True)

    with wave.open(wav, "rb") as wf:
        pcm_data = wf.readframes(wf.getnframes())
        audio_dur = wf.getnframes() / wf.getframerate()

    print(f"  Audio: {audio_dur:.1f}s")

    # Pipeline timing
    pipeline_start = time.perf_counter()

    # Step 1: STT
    print("\n--- Step 1: STT (Kyutai 1B MLX) ---")
    stt_start = time.perf_counter()
    transcript, stt_interim_ms, stt_final_ms = await stt_transcribe(pcm_data)
    stt_time = (time.perf_counter() - stt_start) * 1000
    print(f"  Transcript: \"{transcript}\"")
    print(f"  First interim: {stt_interim_ms:.0f}ms")
    print(f"  Final: {stt_final_ms:.0f}ms")
    print(f"  Total STT time: {stt_time:.0f}ms")

    # Step 2: Simulated LLM response
    llm_response = "I hear you. Presentations can be stressful. Let's talk about what's worrying you most."
    print(f"\n--- Step 2: LLM Response (simulated) ---")
    print(f"  [Ferni]: \"{llm_response}\"")

    # Step 3: TTS
    print(f"\n--- Step 3: TTS (Kyutai 1.6B MLX INT8) ---")
    tts_start = time.perf_counter()
    tts_pcm, tts_ttfb_ms, tts_total_ms = await tts_synthesize(llm_response)
    tts_time = (time.perf_counter() - tts_start) * 1000
    tts_audio_dur = len(tts_pcm) / (SAMPLE_RATE_TTS * 2)
    print(f"  TTFB: {tts_ttfb_ms:.0f}ms")
    print(f"  Audio: {tts_audio_dur:.1f}s")
    print(f"  Speed: {tts_audio_dur/(tts_total_ms/1000):.2f}x real-time")
    print(f"  Total TTS time: {tts_time:.0f}ms")

    # Save TTS output
    tts_audio = np.frombuffer(tts_pcm, dtype=np.int16).astype(np.float32) / 32768.0
    sphn.write_wav("e2e_output.wav", tts_audio, SAMPLE_RATE_TTS)

    pipeline_total = (time.perf_counter() - pipeline_start) * 1000

    # Summary
    print(f"\n{'=' * 60}")
    print(f"PIPELINE SUMMARY")
    print(f"{'=' * 60}")
    print(f"  STT first interim:  {stt_interim_ms:.0f}ms")
    print(f"  STT total:          {stt_time:.0f}ms (includes {audio_dur:.1f}s real-time audio)")
    print(f"  TTS TTFB:           {tts_ttfb_ms:.0f}ms")
    print(f"  TTS total:          {tts_time:.0f}ms")
    print(f"  Pipeline total:     {pipeline_total:.0f}ms")
    print(f"  TTS output:         {tts_audio_dur:.1f}s audio")
    print(f"  Saved to:           e2e_output.wav")
    print(f"\n  All self-hosted, zero cloud cost for STT+TTS!")


if __name__ == "__main__":
    asyncio.run(main())
