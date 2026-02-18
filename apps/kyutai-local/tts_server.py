"""
Kyutai TTS MLX WebSocket Server.

Wraps moshi-mlx TTS inference with the moshi-server WebSocket protocol.
Accepts JSON text requests, returns streaming binary PCM audio.

Protocol (matches moshi-server /api/tts_streaming):
  Client -> Server: JSON { "text": str, "voice_id": str (optional) }
  Server -> Client: binary PCM (24kHz, 16-bit mono) chunks
  Server -> Client: JSON { "done": true }

Usage:
  python tts_server.py [--port 8090] [--quantize 8]
"""

import argparse
import asyncio
import json
import signal
import struct
import time

import mlx.core as mx
import mlx.nn as nn
import numpy as np
import sentencepiece
import sphn
import websockets
from moshi_mlx import models
from moshi_mlx.models.tts import TTSModel, DEFAULT_DSM_TTS_REPO, DEFAULT_DSM_TTS_VOICE_REPO
from moshi_mlx.utils.loaders import hf_get


# ─── Model loading ──────────────────────────────────────────

class KyutaiTTSEngine:
    """Manages the Kyutai TTS model for streaming inference."""

    def __init__(self, hf_repo: str, voice_repo: str, quantize: int = 8):
        self.hf_repo = hf_repo
        self.voice_repo = voice_repo
        self.quantize = quantize
        self.tts_model = None
        self.cfg_coef_conditioning = None
        self.cfg_no_text = True
        self.cfg_no_prefix = True

    def load(self):
        """Load TTS model weights and tokenizers."""
        t0 = time.time()

        raw_config_path = hf_get("config.json", self.hf_repo)
        with open(hf_get(raw_config_path), "r") as f:
            raw_config = json.load(f)

        mimi_weights = hf_get(raw_config["mimi_name"], self.hf_repo)
        moshi_name = raw_config.get("moshi_name", "model.safetensors")
        moshi_weights = hf_get(moshi_name, self.hf_repo)
        tokenizer_path = hf_get(raw_config["tokenizer_name"], self.hf_repo)

        lm_config = models.LmConfig.from_config_dict(raw_config)
        lm_config.transformer.max_seq_len = lm_config.transformer.context

        model = models.Lm(lm_config)
        model.set_dtype(mx.bfloat16)
        print(f"[TTS] Loading model weights from {moshi_weights}")
        model.load_pytorch_weights(str(moshi_weights), lm_config, strict=True)

        if self.quantize:
            print(f"[TTS] Quantizing to INT{self.quantize}")
            nn.quantize(model.depformer, bits=self.quantize)
            for layer in model.transformer.layers:
                nn.quantize(layer.self_attn, bits=self.quantize)
                nn.quantize(layer.gating, bits=self.quantize)

        print(f"[TTS] Loading text tokenizer from {tokenizer_path}")
        text_tokenizer = sentencepiece.SentencePieceProcessor(str(tokenizer_path))

        generated_codebooks = lm_config.generated_codebooks
        print(f"[TTS] Loading audio tokenizer from {mimi_weights}")
        audio_tokenizer = models.mimi.Mimi(models.mimi_202407(generated_codebooks))
        audio_tokenizer.load_pytorch_weights(str(mimi_weights), strict=True)

        self.tts_model = TTSModel(
            model, audio_tokenizer, text_tokenizer,
            voice_repo=self.voice_repo,
            temp=0.6,
            cfg_coef=1,
            max_padding=8,
            initial_padding=2,
            final_padding=2,
            padding_bonus=0,
            raw_config=raw_config,
        )

        if self.tts_model.valid_cfg_conditionings:
            self.cfg_coef_conditioning = self.tts_model.cfg_coef
            self.tts_model.cfg_coef = 1.0
            self.cfg_no_text = False
            self.cfg_no_prefix = False
        else:
            self.cfg_coef_conditioning = None
            self.cfg_no_text = True
            self.cfg_no_prefix = True

        self.sample_rate = self.tts_model.mimi.sample_rate
        elapsed = time.time() - t0
        print(f"[TTS] Model loaded in {elapsed:.1f}s (sample_rate={self.sample_rate}Hz)")


# ─── WebSocket Server ───────────────────────────────────────

# Default voice if none specified
DEFAULT_VOICE = "expresso/ex03-ex01_happy_001_channel1_334s.wav"

# Map Ferni persona voice_id paths to available voices
# The existing provider sends paths like "ferni/ferni-voice.safetensors"
# For now, we map all to the default voice since custom voice embeddings
# require training. In production, trained voice .safetensors files would
# be placed in the voice_repo.
PERSONA_VOICE_FALLBACK = DEFAULT_VOICE

# Known Ferni persona IDs
FERNI_PERSONAS = {"ferni", "maya", "peter-john", "alex", "jordan", "nayan-patel"}


def resolve_voice(voice_id: str) -> str:
    """Map persona voice_id to an available voice embedding.

    The Ferni TTS provider sends paths like "ferni/ferni-voice.safetensors"
    or plain persona IDs like "ferni". Since custom Ferni voice embeddings
    are not yet trained for Kyutai, fall back to the default voice.
    """
    if not voice_id:
        return DEFAULT_VOICE
    # Check if it's a Ferni persona path
    base = voice_id.split("/")[0].lower().replace("_", "-")
    if base in FERNI_PERSONAS:
        return PERSONA_VOICE_FALLBACK
    if voice_id.endswith(".safetensors"):
        return PERSONA_VOICE_FALLBACK
    # Otherwise use as-is (could be a valid voice repo path)
    return voice_id


async def handle_tts_connection(websocket, engine: KyutaiTTSEngine):
    """Handle a single TTS WebSocket connection."""
    client_addr = websocket.remote_address
    print(f"[TTS] Client connected: {client_addr}")

    try:
        async for message in websocket:
            if isinstance(message, str):
                try:
                    request = json.loads(message)
                except json.JSONDecodeError:
                    await websocket.send(json.dumps({"error": "Invalid JSON"}))
                    continue

                text = request.get("text", "").strip()
                voice_id = request.get("voice_id", DEFAULT_VOICE)

                if not text:
                    await websocket.send(json.dumps({"done": True}))
                    continue

                # Resolve voice: persona IDs -> available voice embed
                # Ferni personas send paths like "ferni/ferni-voice.safetensors"
                # or just "ferni". Map all to default available voice.
                voice_id = resolve_voice(voice_id)

                print(f"[TTS] Synthesizing: \"{text[:60]}\" voice={voice_id}")

                try:
                    await synthesize_and_stream(websocket, engine, text, voice_id)
                except Exception as e:
                    print(f"[TTS] Generation error: {e}")
                    try:
                        await websocket.send(json.dumps({"done": True, "error": str(e)}))
                    except Exception:
                        pass
            # Ignore binary messages
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print(f"[TTS] Client disconnected: {client_addr}")


async def synthesize_and_stream(
    websocket,
    engine: KyutaiTTSEngine,
    text: str,
    voice_id: str,
):
    """Generate TTS audio and stream PCM chunks over WebSocket."""
    tts = engine.tts_model
    loop = asyncio.get_event_loop()

    all_entries = [tts.prepare_script([text])]
    if tts.multi_speaker:
        voices = [tts.get_voice_path(voice_id)]
    else:
        voices = []
    all_attributes = [tts.make_condition_attributes(voices, engine.cfg_coef_conditioning)]

    # Collect frames and send asynchronously
    frame_queue = asyncio.Queue()
    generation_done = asyncio.Event()

    def on_frame(frame):
        """Called by the model for each generated audio frame."""
        if (frame == -1).any():
            return
        pcm = tts.mimi.decode_step(frame[:, :, None])
        pcm_np = np.array(mx.clip(pcm[0, 0], -1, 1))
        # Convert float32 PCM to int16 PCM bytes
        pcm_int16 = (pcm_np * 32767).astype(np.int16)
        pcm_bytes = pcm_int16.tobytes()
        loop.call_soon_threadsafe(frame_queue.put_nowait, pcm_bytes)

    async def send_frames():
        """Send PCM frames as they become available."""
        while True:
            try:
                pcm_bytes = await asyncio.wait_for(frame_queue.get(), timeout=0.1)
                await websocket.send(pcm_bytes)
            except asyncio.TimeoutError:
                if generation_done.is_set() and frame_queue.empty():
                    break
            except websockets.exceptions.ConnectionClosed:
                break

    # Run generation in a thread to avoid blocking the event loop
    def generate():
        tts.generate(
            all_entries,
            all_attributes,
            cfg_is_no_prefix=engine.cfg_no_prefix,
            cfg_is_no_text=engine.cfg_no_text,
            on_frame=on_frame,
        )
        loop.call_soon_threadsafe(generation_done.set)

    # Start sender task and generation in parallel
    sender = asyncio.create_task(send_frames())
    await loop.run_in_executor(None, generate)

    # Wait for all frames to be sent
    generation_done.set()
    await sender

    # Send done signal
    await websocket.send(json.dumps({"done": True}))


def health_handler(connection, request):
    """Handle HTTP health check requests."""
    if request.path == "/health":
        body = json.dumps({
            "status": "ok",
            "model": "kyutai-tts-1.6b",
            "backend": "mlx",
        }).encode()
        from websockets.http11 import Response
        return Response(200, "OK", websockets.datastructures.Headers({
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        }), body)
    return None


async def run_server(engine: KyutaiTTSEngine, host: str, port: int):
    """Run the TTS WebSocket server."""
    print(f"[TTS] Starting server on ws://{host}:{port}")

    async def handler(websocket):
        path = websocket.request.path if hasattr(websocket, "request") else "/"
        if path == "/api/tts_streaming" or path.startswith("/api/tts_streaming"):
            await handle_tts_connection(websocket, engine)
        else:
            await websocket.close()

    stop_event = asyncio.Event()

    def signal_handler():
        print("\n[TTS] Shutting down...")
        stop_event.set()

    loop = asyncio.get_event_loop()
    loop.add_signal_handler(signal.SIGINT, signal_handler)
    loop.add_signal_handler(signal.SIGTERM, signal_handler)

    async with websockets.serve(
        handler,
        host,
        port,
        process_request=health_handler,
        max_size=2**20,  # 1MB max message
    ):
        print(f"[TTS] Server ready at ws://{host}:{port}/api/tts_streaming")
        print(f"[TTS] Health check at http://{host}:{port}/health")
        await stop_event.wait()


def main():
    parser = argparse.ArgumentParser(description="Kyutai TTS MLX WebSocket Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host")
    parser.add_argument("--port", type=int, default=8090, help="Bind port")
    parser.add_argument("--hf-repo", default=DEFAULT_DSM_TTS_REPO,
                        help="HuggingFace model repo")
    parser.add_argument("--voice-repo", default=DEFAULT_DSM_TTS_VOICE_REPO,
                        help="HuggingFace voice repo")
    parser.add_argument("--quantize", type=int, default=8, choices=[0, 4, 8],
                        help="Quantize model (0=none, 4=INT4, 8=INT8)")
    args = parser.parse_args()

    mx.random.seed(299792458)

    engine = KyutaiTTSEngine(
        hf_repo=args.hf_repo,
        voice_repo=args.voice_repo,
        quantize=args.quantize,
    )
    engine.load()

    asyncio.run(run_server(engine, args.host, args.port))


if __name__ == "__main__":
    main()
