"""Quick test client for the Higgs MLX WebSocket server."""

import asyncio
import json
import wave
import numpy as np

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    raise


async def test_synthesize(text: str = "Hello world, this is a test.", port: int = 8700):
    """Test non-streaming synthesis."""
    uri = f"ws://localhost:{port}"
    print(f"Connecting to {uri}...")

    async with websockets.connect(uri, ping_timeout=120) as ws:
        # Start session
        await ws.send(json.dumps({"type": "StartSession"}))
        resp = json.loads(await ws.recv())
        print(f"  {resp}")
        assert resp["type"] == "SessionStarted"

        # Synthesize
        print(f"  Synthesizing: \"{text}\"")
        await ws.send(json.dumps({
            "type": "Synthesize",
            "text": text,
            "request_id": 1,
            "max_tokens": 200,
        }))

        # Receive audio (binary) then completion (JSON)
        audio_data = b""
        while True:
            msg = await ws.recv()
            if isinstance(msg, bytes):
                audio_data += msg
                print(f"  Received {len(msg)} bytes of audio")
            else:
                resp = json.loads(msg)
                print(f"  {resp}")
                if resp["type"] in ("SynthesisComplete", "Error"):
                    break

        # Save audio
        if audio_data:
            samples = np.frombuffer(audio_data, dtype=np.int16)
            print(f"  Total: {len(samples)} samples ({len(samples)/24000:.2f}s at 24kHz)")

            with wave.open("test_output.wav", "w") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(audio_data)
            print("  Saved to test_output.wav")

        # End session
        await ws.send(json.dumps({"type": "EndSession"}))
        resp = json.loads(await ws.recv())
        print(f"  {resp}")


async def test_streaming(text: str = "Hello world, this is a streaming test.", port: int = 8700):
    """Test streaming synthesis."""
    uri = f"ws://localhost:{port}"
    print(f"\nStreaming test to {uri}...")

    async with websockets.connect(uri, ping_timeout=120) as ws:
        await ws.send(json.dumps({"type": "StartSession"}))
        resp = json.loads(await ws.recv())
        assert resp["type"] == "SessionStarted"

        print(f"  Synthesizing (streaming): \"{text}\"")
        await ws.send(json.dumps({
            "type": "SynthesizeStreaming",
            "text": text,
            "request_id": 2,
            "max_tokens": 200,
            "chunk_size": 25,
        }))

        chunk_count = 0
        total_samples = 0
        all_audio = b""

        while True:
            msg = await ws.recv()
            if isinstance(msg, bytes):
                all_audio += msg
                samples = len(msg) // 2
                total_samples += samples
                chunk_count += 1
                print(f"  Chunk {chunk_count}: {samples} samples ({samples/24000*1000:.0f}ms)")
            else:
                resp = json.loads(msg)
                if resp["type"] == "AudioChunk":
                    continue  # Next message is the binary data
                print(f"  {resp}")
                if resp["type"] in ("StreamComplete", "Error"):
                    break

        print(f"  Total: {chunk_count} chunks, {total_samples} samples ({total_samples/24000:.2f}s)")

        if all_audio:
            with wave.open("test_streaming_output.wav", "w") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(all_audio)
            print("  Saved to test_streaming_output.wav")

        await ws.send(json.dumps({"type": "EndSession"}))
        resp = json.loads(await ws.recv())
        print(f"  {resp}")


async def main():
    await test_synthesize()
    await test_streaming()


if __name__ == "__main__":
    asyncio.run(main())
