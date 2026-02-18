"""
Kyutai STT MLX WebSocket Server.

Wraps moshi-mlx STT inference with the moshi-server WebSocket protocol.
Accepts binary PCM audio chunks, returns JSON transcript + VAD events.

Protocol (matches moshi-server /api/asr-streaming):
  Client -> Server: binary PCM (16-bit mono, 16kHz)
  Server -> Client: JSON { "text": str, "is_final": bool }
  Server -> Client: JSON { "vad": bool, "is_speaking": bool }

Usage:
  python stt_server.py [--port 8089] [--hf-repo kyutai/stt-1b-en_fr-mlx]
"""

import argparse
import asyncio
import json
import signal
import time
from pathlib import Path

import mlx.core as mx
import mlx.nn as nn
import numpy as np
import rustymimi
import sentencepiece
import sphn
import websockets
from huggingface_hub import hf_hub_download
from moshi_mlx import models, utils


# ─── Model loading ──────────────────────────────────────────

class KyutaiSTTEngine:
    """Manages the Kyutai STT model for streaming inference."""

    def __init__(self, hf_repo: str, quantize: int = 0):
        self.hf_repo = hf_repo
        self.quantize = quantize
        self.model = None
        self.text_tokenizer = None
        self.audio_tokenizer = None
        self.lm_config = None
        self.stt_config = None

    def load(self):
        """Load model weights, tokenizers, and warm up."""
        t0 = time.time()

        config_path = hf_hub_download(self.hf_repo, "config.json")
        with open(config_path) as f:
            raw_config = json.load(f)

        self.stt_config = raw_config.get("stt_config", {})
        self.lm_config = models.LmConfig.from_config_dict(raw_config)

        moshi_name = raw_config.get("moshi_name", "model.safetensors")
        moshi_weights = hf_hub_download(self.hf_repo, moshi_name)
        tokenizer_path = hf_hub_download(self.hf_repo, raw_config["tokenizer_name"])
        mimi_path = hf_hub_download(self.hf_repo, raw_config["mimi_name"])

        self.model = models.Lm(self.lm_config)
        self.model.set_dtype(mx.bfloat16)

        if self.quantize == 4 or moshi_weights.endswith(".q4.safetensors"):
            nn.quantize(self.model, bits=4, group_size=32)
        elif self.quantize == 8 or moshi_weights.endswith(".q8.safetensors"):
            nn.quantize(self.model, bits=8, group_size=64)

        print(f"[STT] Loading model weights from {moshi_weights}")
        self.model.load_weights(moshi_weights, strict=True)

        print(f"[STT] Loading text tokenizer from {tokenizer_path}")
        self.text_tokenizer = sentencepiece.SentencePieceProcessor(tokenizer_path)

        other_codebooks = self.lm_config.other_codebooks
        generated_codebooks = self.lm_config.generated_codebooks
        mimi_codebooks = max(generated_codebooks, other_codebooks)
        print(f"[STT] Loading audio tokenizer from {mimi_path}")
        self.audio_tokenizer = rustymimi.Tokenizer(mimi_path, num_codebooks=mimi_codebooks)

        # Warm up
        ct = None
        if self.model.condition_provider is not None:
            ct = self.model.condition_provider.condition_tensor("description", "very_good")
        self.condition_tensor = ct
        print("[STT] Warming up model...")
        self.model.warmup(ct)

        elapsed = time.time() - t0
        print(f"[STT] Model loaded and warmed up in {elapsed:.1f}s")

    def create_session(self):
        """Create a new inference session (one per WebSocket connection).

        Each session gets a fresh LmGen with reset state, ensuring
        independent per-connection inference.
        """
        return STTSession(self)

    def create_fresh_gen(self):
        """Create a fresh LmGen for a new session."""
        return models.LmGen(
            model=self.model,
            max_steps=100_000,
            text_sampler=utils.Sampler(top_k=50, temp=0.0),
            audio_sampler=utils.Sampler(top_k=250, temp=0.0),
            cfg_coef=1.0,
            check=False,
        )


class STTSession:
    """Per-connection streaming STT session."""

    STEP_SAMPLES_24K = 1920  # 80ms at 24kHz (moshi's native frame size)
    INPUT_SAMPLE_RATE = 16000
    MODEL_SAMPLE_RATE = 24000

    def __init__(self, engine: KyutaiSTTEngine):
        self.engine = engine
        self.gen = engine.create_fresh_gen()
        self.pcm_buffer = np.array([], dtype=np.float32)
        self.accumulated_text = ""
        self.is_speaking = False
        self.silence_frames = 0
        self.speech_frames = 0
        self.step_count = 0
        # Audio delay from the model (0.5s = ~6 steps at 80ms).
        # Text tokens emitted during this period are from the silence
        # prefix and should be discarded.
        audio_delay = engine.stt_config.get("audio_delay_seconds", 0.5)
        self.warmup_steps = int(audio_delay / 0.08) + 1  # Model delay + 1 safety step
        self.warmed_up = False

    def feed_audio(self, pcm_16k_int16: bytes) -> list[dict]:
        """Feed PCM audio and return transcript/VAD events.

        Args:
            pcm_16k_int16: Raw PCM bytes (16-bit mono, 16kHz)

        Returns:
            List of JSON-serializable event dicts.
        """
        events = []

        # Convert 16-bit int16 to float32
        audio_int16 = np.frombuffer(pcm_16k_int16, dtype=np.int16)
        audio_f32 = audio_int16.astype(np.float32) / 32768.0

        # Resample 16kHz -> 24kHz (simple linear interpolation)
        ratio = self.MODEL_SAMPLE_RATE / self.INPUT_SAMPLE_RATE
        n_out = int(len(audio_f32) * ratio)
        if n_out > 0:
            indices = np.arange(n_out) / ratio
            indices = np.clip(indices, 0, len(audio_f32) - 1)
            idx_floor = np.floor(indices).astype(int)
            idx_ceil = np.minimum(idx_floor + 1, len(audio_f32) - 1)
            frac = indices - idx_floor
            resampled = audio_f32[idx_floor] * (1 - frac) + audio_f32[idx_ceil] * frac
        else:
            resampled = np.array([], dtype=np.float32)

        self.pcm_buffer = np.concatenate([self.pcm_buffer, resampled])

        # Process complete frames
        while len(self.pcm_buffer) >= self.STEP_SAMPLES_24K:
            frame = self.pcm_buffer[:self.STEP_SAMPLES_24K]
            self.pcm_buffer = self.pcm_buffer[self.STEP_SAMPLES_24K:]
            frame_events = self._process_frame(frame)
            events.extend(frame_events)

        return events

    def _process_frame(self, frame_f32: np.ndarray) -> list[dict]:
        """Process one 80ms audio frame through the model."""
        events = []
        self.step_count += 1

        # Encode audio -> tokens (must be contiguous float32 with shape (1, 1, 1920))
        pcm_for_mimi = np.ascontiguousarray(
            frame_f32.reshape(1, 1, -1), dtype=np.float32
        )
        other_codebooks = self.engine.lm_config.other_codebooks

        audio_tokens = self.engine.audio_tokenizer.encode_step(pcm_for_mimi)
        audio_tokens = mx.array(audio_tokens).transpose(0, 2, 1)[:, :, :other_codebooks]

        # Run LM step
        text_token = self.gen.step(audio_tokens[0], self.engine.condition_tensor)
        text_token = text_token[0].item()

        # Skip tokens emitted during the model's audio delay warmup
        if not self.warmed_up:
            if self.step_count < self.warmup_steps:
                return events
            self.warmed_up = True

        # Decode text token
        if text_token not in (0, 3):  # 0=padding, 3=existing_text_padding
            piece = self.engine.text_tokenizer.id_to_piece(text_token)
            piece = piece.replace("\u2581", " ")
            self.accumulated_text += piece
            self.speech_frames += 1
            self.silence_frames = 0

            # VAD: speech detected
            if not self.is_speaking:
                self.is_speaking = True
                events.append({"vad": True, "is_speaking": True})

            # Send interim transcript every few tokens
            if self.speech_frames % 3 == 0 or len(piece.strip()) > 0:
                events.append({
                    "text": self.accumulated_text.strip(),
                    "is_final": False,
                })
        else:
            self.silence_frames += 1

            # After ~480ms of silence (6 frames at 80ms), send final transcript.
            # This must be long enough to not trigger on natural speech pauses
            # but short enough for responsive turn-taking.
            if self.is_speaking and self.silence_frames >= 6:
                if self.accumulated_text.strip():
                    events.append({
                        "text": self.accumulated_text.strip(),
                        "is_final": True,
                    })
                events.append({"vad": False, "is_speaking": False})
                self.is_speaking = False
                self.accumulated_text = ""
                self.speech_frames = 0

        return events

    def flush(self) -> list[dict]:
        """Flush any remaining text as final transcript."""
        events = []
        if self.accumulated_text.strip():
            events.append({
                "text": self.accumulated_text.strip(),
                "is_final": True,
            })
        if self.is_speaking:
            events.append({"vad": False, "is_speaking": False})
        return events


# ─── WebSocket Server ───────────────────────────────────────

async def handle_stt_connection(websocket, engine: KyutaiSTTEngine):
    """Handle a single STT WebSocket connection."""
    session = engine.create_session()
    client_addr = websocket.remote_address
    print(f"[STT] Client connected: {client_addr}")

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                events = session.feed_audio(message)
                for event in events:
                    await websocket.send(json.dumps(event))
            elif isinstance(message, str):
                # Could be a control message; ignore for now
                pass
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        # Flush remaining text
        events = session.flush()
        for event in events:
            try:
                await websocket.send(json.dumps(event))
            except Exception:
                pass
        print(f"[STT] Client disconnected: {client_addr}")


def health_handler(connection, request):
    """Handle HTTP health check requests before WebSocket upgrade."""
    if request.path == "/health":
        from websockets.http11 import Response
        body = json.dumps({"status": "ok", "model": "kyutai-stt-1b", "backend": "mlx"}).encode()
        return Response(200, "OK", websockets.datastructures.Headers({
            "Content-Type": "application/json",
            "Content-Length": str(len(body)),
        }), body)
    return None


async def run_server(engine: KyutaiSTTEngine, host: str, port: int):
    """Run the STT WebSocket server."""
    print(f"[STT] Starting server on ws://{host}:{port}")

    async def handler(websocket):
        path = websocket.request.path if hasattr(websocket, 'request') else '/'
        if path == '/api/asr-streaming' or path.startswith('/api/asr-streaming'):
            await handle_stt_connection(websocket, engine)
        else:
            await websocket.close()

    stop_event = asyncio.Event()

    def signal_handler():
        print("\n[STT] Shutting down...")
        stop_event.set()

    loop = asyncio.get_event_loop()
    loop.add_signal_handler(signal.SIGINT, signal_handler)
    loop.add_signal_handler(signal.SIGTERM, signal_handler)

    async with websockets.serve(
        handler,
        host,
        port,
        process_request=health_handler,
    ):
        print(f"[STT] Server ready at ws://{host}:{port}/api/asr-streaming")
        print(f"[STT] Health check at http://{host}:{port}/health")
        await stop_event.wait()


def main():
    parser = argparse.ArgumentParser(description="Kyutai STT MLX WebSocket Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind host")
    parser.add_argument("--port", type=int, default=8089, help="Bind port")
    parser.add_argument("--hf-repo", default="kyutai/stt-1b-en_fr-mlx",
                        help="HuggingFace model repo")
    parser.add_argument("--quantize", type=int, default=0, choices=[0, 4, 8],
                        help="Quantize model (0=none, 4=INT4, 8=INT8)")
    args = parser.parse_args()

    engine = KyutaiSTTEngine(hf_repo=args.hf_repo, quantize=args.quantize)
    engine.load()

    asyncio.run(run_server(engine, args.host, args.port))


if __name__ == "__main__":
    main()
