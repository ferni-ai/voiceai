"""
Higgs Audio V2 MLX WebSocket Server — real-time TTS.

Provides WebSocket endpoint for streaming TTS synthesis using
Higgs Audio V2 on Apple MLX with INT4 quantization (74+ tok/s).

Protocol (matches rust-higgs-pipeline WebSocket protocol):
  Client -> Server:
    {"type": "StartSession"}
    {"type": "Synthesize", "text": "...", "request_id": 1, "voice_id": "ferni"}
    {"type": "SynthesizeStreaming", "text": "...", "request_id": 2, "voice_id": "maya"}
    {"type": "EndSession"}

  Server -> Client:
    {"type": "SessionStarted", "available_voices": ["default", "ferni", ...]}
    {"type": "SynthesisComplete", "request_id": 1, "audio_tokens": N, ...}
    {"type": "AudioChunk", "request_id": 2}  + binary audio data
    {"type": "StreamComplete", "request_id": 2, "audio_tokens": N}
    {"type": "SessionEnded"}
    {"type": "Error", "message": "..."}

Persona Voices:
  Ferni personas can specify a voice_id to use persona-specific scene descriptions
  that influence the generated voice characteristics. Available voices:
    - "default" — neutral, clean room recording
    - "ferni" — warm, grounded male life coach
    - "peter-john" — calm, authoritative researcher
    - "alex" — clear, energetic communicator
    - "maya" — warm, encouraging habits coach
    - "jordan" — enthusiastic, expressive planner
    - "nayan-patel" — deep, contemplative philosopher
"""

import asyncio
import json
import struct
import time
import wave
import io
from pathlib import Path
from typing import Optional

import mlx.core as mx
import mlx.nn as nn
import numpy as np

try:
    import websockets
except ImportError:
    print("Install websockets: pip install websockets")
    raise


# Global model state
_model = None
_config = None
_tokenizer = None
_decoder = None

# Persona voice scene descriptions — these influence the generated voice
# characteristics by describing the recording environment and speaker style.
# Higgs Audio V2 uses scene descriptions as conditioning for generation.
PERSONA_VOICES: dict[str, str] = {
    "default": "Audio is recorded from a quiet room.",
    "ferni": (
        "Audio is recorded in a warm, intimate setting. "
        "The speaker is a grounded male life coach with a mid-range pitch, "
        "steady cadence, and warm tone. Speech is calm and reassuring."
    ),
    "peter-john": (
        "Audio is recorded in a quiet study. "
        "The speaker is a calm, authoritative male researcher with a measured, "
        "thoughtful pace. Speech is precise and considered."
    ),
    "alex": (
        "Audio is recorded in a bright, professional space. "
        "The speaker is clear and energetic with quick, articulate delivery. "
        "Speech is confident and direct."
    ),
    "maya": (
        "Audio is recorded in a cozy, supportive environment. "
        "The speaker is a warm, encouraging female habits coach with an upbeat tone "
        "and steady rhythm. Speech is motivating and gentle."
    ),
    "jordan": (
        "Audio is recorded in a lively, celebratory setting. "
        "The speaker is enthusiastic and expressive with dynamic energy. "
        "Speech is animated and joyful."
    ),
    "nayan-patel": (
        "Audio is recorded in a serene, contemplative space. "
        "The speaker is a deep-voiced male philosopher with slow, deliberate pacing. "
        "Speech is wise and unhurried."
    ),
}


def get_available_voices() -> list[str]:
    """Return list of available voice IDs."""
    return list(PERSONA_VOICES.keys())


def load_model(model_dir: Path, quantize_bits: int = 4, group_size: int = 64):
    """Load and quantize the Higgs Audio V2 model."""
    global _model, _config, _tokenizer, _decoder

    from model import load_config, load_weights, HiggsAudioModel
    from generate import XCodecDecoder

    print(f"Loading Higgs Audio V2 from {model_dir}...")
    _config = load_config(model_dir / "config.json")
    _model = HiggsAudioModel(_config)
    load_weights(_model, model_dir, dtype=mx.float16)

    if quantize_bits > 0:
        print(f"Quantizing to INT{quantize_bits} (group_size={group_size})...")
        nn.quantize(_model, bits=quantize_bits, group_size=group_size)
        print("Quantization complete.")

    # Warm up with a dummy forward pass
    print("Warming up model (JIT compilation)...")
    dummy = mx.zeros((1, 1, _config.text_config.hidden_size), dtype=mx.float16)
    _ = _model.forward(dummy)
    mx.eval(_model.parameters())
    print("Model warmed up.")

    # Load tokenizer
    from tokenizers import Tokenizer
    _tokenizer = Tokenizer.from_file(str(model_dir / "tokenizer.json"))

    # Load xCodec decoder
    xcodec_path = model_dir / "xcodec_decoder.onnx"
    if xcodec_path.exists():
        _decoder = XCodecDecoder(xcodec_path, _config.audio_num_codebooks)
    else:
        print(f"Warning: xCodec decoder not found at {xcodec_path}")

    print("Server ready.")


def tokenize_for_tts(text: str, voice_id: str = "default") -> list[int]:
    """Tokenize text for TTS generation with persona-specific scene description."""
    scene_desc = PERSONA_VOICES.get(voice_id, PERSONA_VOICES["default"])
    system_prompt = (
        "Generate audio following instruction.\n\n"
        f"<|scene_desc_start|>\n{scene_desc}\n<|scene_desc_end|>"
    )
    full_prompt = (
        f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
        f"{system_prompt}<|eot_id|>"
        f"<|start_header_id|>user<|end_header_id|>\n\n"
        f"{text}<|eot_id|>"
    )
    encoding = _tokenizer.encode(full_prompt)
    return encoding.ids


def synthesize(text: str, temperature: float = 0.3, max_tokens: int = 750, voice_id: str = "default") -> dict:
    """Synthesize audio from text (non-streaming)."""
    from generate import generate_audio, GenerationConfig

    text_tokens = tokenize_for_tts(text, voice_id=voice_id)
    gen_config = GenerationConfig(
        max_audio_tokens=max_tokens,
        temperature=temperature,
    )
    result = generate_audio(_model, text_tokens, gen_config, _decoder)

    # Decode to audio
    audio = None
    if _decoder and result["codes"] and result["codes"][0]:
        audio = _decoder.decode(result["codes"])

    return {
        "codes": result["codes"],
        "stats": result["stats"],
        "audio": audio,
    }


def synthesize_streaming(text: str, temperature: float = 0.3, max_tokens: int = 750, chunk_size: int = 25, voice_id: str = "default"):
    """Generator that yields (audio_chunk, stats) tuples during generation."""
    from generate import GenerationConfig, revert_delay_pattern, sample_top_k_top_p

    text_tokens = tokenize_for_tts(text, voice_id=voice_id)
    config = _config
    num_codebooks = config.audio_num_codebooks
    audio_out_bos = config.audio_out_bos_token_id
    stream_bos = config.audio_stream_bos_id
    stream_eos = config.audio_stream_eos_id

    _model.reset_caches()

    # Prefill
    t0 = time.time()
    text_ids = mx.array([text_tokens])
    text_embeds = _model.embed_text(text_ids)
    hidden = _model.forward(text_embeds, audio_mask=None)
    mx.eval(hidden)

    # Force audio_out_bos
    bos_ids = mx.array([[audio_out_bos]])
    bos_embed = _model.embed_text(bos_ids)
    _ = _model.forward(bos_embed, audio_mask=None)

    prefill_ms = (time.time() - t0) * 1000

    # Audio generation with streaming
    t_gen = time.time()
    raw_codes = [[] for _ in range(num_codebooks)]
    audio_steps = 0
    num_remaining_delays = None
    audio_mask = mx.ones((1, 1), dtype=mx.uint8)
    decoded_up_to = 0
    warmup_steps = num_codebooks

    while audio_steps < max_tokens:
        codes_for_embed = []
        for cb in range(num_codebooks):
            if audio_steps == 0:
                codes_for_embed.append(stream_bos)
            elif raw_codes[cb]:
                codes_for_embed.append(raw_codes[cb][-1])
            else:
                codes_for_embed.append(stream_bos)

        audio_embed = _model.embed_audio_codes(codes_for_embed)
        hidden = _model.forward(audio_embed, audio_mask=audio_mask)
        logits = _model.audio_logits(hidden)
        logits = logits[0, 0]
        mx.eval(logits)

        step_codes = []
        for cb in range(num_codebooks):
            if audio_steps < cb:
                step_codes.append(stream_bos)
                continue
            cb_logits = logits[cb]
            if temperature <= 0.0:
                code = int(mx.argmax(cb_logits).item())
            else:
                code = sample_top_k_top_p(cb_logits, temperature, 50, 0.95)
            step_codes.append(code)

        # EOS detection
        should_terminate = False
        if num_remaining_delays is not None:
            if num_remaining_delays > 0:
                num_remaining_delays -= 1
            if num_remaining_delays == 0:
                should_terminate = True
        elif step_codes[0] == stream_eos:
            num_remaining_delays = num_codebooks - 1

        for cb, code in enumerate(step_codes):
            raw_codes[cb].append(code)
        audio_steps += 1

        # Streaming: emit chunks after warmup
        if audio_steps >= warmup_steps and (audio_steps - warmup_steps) % chunk_size == 0 and not should_terminate:
            available = audio_steps - (num_codebooks - 1)
            if available > decoded_up_to and _decoder:
                chunk_codes = _extract_aligned_chunk(raw_codes, num_codebooks, decoded_up_to, available)
                if chunk_codes[0]:
                    audio_chunk = _decoder.decode(chunk_codes)
                    if len(audio_chunk) > 0:
                        gen_ms = (time.time() - t_gen) * 1000
                        tps = audio_steps / (gen_ms / 1000) if gen_ms > 0 else 0
                        yield audio_chunk, {"audio_steps": audio_steps, "tokens_per_sec": tps}
                decoded_up_to = available

        if should_terminate:
            break

    # Final tail
    final_available = audio_steps - (num_codebooks - 1) if audio_steps >= num_codebooks else 0
    if final_available > decoded_up_to and _decoder:
        tail_codes = _extract_aligned_chunk(raw_codes, num_codebooks, decoded_up_to, final_available)
        if tail_codes[0]:
            audio_chunk = _decoder.decode(tail_codes)
            if len(audio_chunk) > 0:
                gen_ms = (time.time() - t_gen) * 1000
                tps = audio_steps / (gen_ms / 1000) if gen_ms > 0 else 0
                yield audio_chunk, {"audio_steps": audio_steps, "tokens_per_sec": tps, "done": True}


def _extract_aligned_chunk(raw_codes, num_codebooks, start, end):
    """Extract aligned codes for positions [start, end)."""
    aligned = []
    for cb in range(num_codebooks):
        codes = []
        for pos in range(start, end):
            raw_idx = pos + cb
            if raw_idx >= len(raw_codes[cb]):
                break
            code = raw_codes[cb][raw_idx]
            if code >= 1024:
                break
            codes.append(code)
        aligned.append(codes)
    min_len = min(len(c) for c in aligned)
    return [c[:min_len] for c in aligned]


def audio_to_pcm16_bytes(audio: np.ndarray) -> bytes:
    """Convert float32 audio to 16-bit PCM bytes."""
    clipped = np.clip(audio, -1.0, 1.0)
    int16 = (clipped * 32767).astype(np.int16)
    return int16.tobytes()


async def handle_websocket(websocket):
    """Handle a WebSocket connection."""
    session_active = False

    try:
        async for message in websocket:
            if isinstance(message, bytes):
                continue

            try:
                msg = json.loads(message)
            except json.JSONDecodeError:
                await websocket.send(json.dumps({"type": "Error", "message": "Invalid JSON"}))
                continue

            msg_type = msg.get("type", "")

            if msg_type == "StartSession":
                session_active = True
                await websocket.send(json.dumps({
                    "type": "SessionStarted",
                    "available_voices": get_available_voices(),
                }))

            elif msg_type == "Synthesize":
                if not session_active:
                    await websocket.send(json.dumps({"type": "Error", "message": "No active session"}))
                    continue

                text = msg.get("text", "")
                request_id = msg.get("request_id", 0)
                temperature = msg.get("temperature", 0.3)
                max_tokens = msg.get("max_tokens", 750)
                voice_id = msg.get("voice_id", "default")

                result = synthesize(text, temperature, max_tokens, voice_id=voice_id)
                stats = result["stats"]

                # Send audio as binary
                if result["audio"] is not None and len(result["audio"]) > 0:
                    pcm_bytes = audio_to_pcm16_bytes(result["audio"])
                    await websocket.send(pcm_bytes)

                await websocket.send(json.dumps({
                    "type": "SynthesisComplete",
                    "request_id": request_id,
                    "audio_tokens": result["stats"]["gen_ms"] and int(stats.get("tokens_per_sec", 0) * stats["gen_ms"] / 1000) or 0,
                    "tokens_per_sec": round(stats["tokens_per_sec"], 1),
                    "rtf": round(stats["rtf"], 3),
                    "audio_duration_s": round(stats["audio_duration_s"], 2),
                }))

            elif msg_type == "SynthesizeStreaming":
                if not session_active:
                    await websocket.send(json.dumps({"type": "Error", "message": "No active session"}))
                    continue

                text = msg.get("text", "")
                request_id = msg.get("request_id", 0)
                temperature = msg.get("temperature", 0.3)
                max_tokens = msg.get("max_tokens", 750)
                chunk_size = msg.get("chunk_size", 25)
                voice_id = msg.get("voice_id", "default")

                total_tokens = 0
                for audio_chunk, chunk_stats in synthesize_streaming(text, temperature, max_tokens, chunk_size, voice_id=voice_id):
                    pcm_bytes = audio_to_pcm16_bytes(audio_chunk)
                    # Send chunk metadata then binary
                    await websocket.send(json.dumps({
                        "type": "AudioChunk",
                        "request_id": request_id,
                        "samples": len(audio_chunk),
                    }))
                    await websocket.send(pcm_bytes)
                    total_tokens = chunk_stats.get("audio_steps", 0)

                await websocket.send(json.dumps({
                    "type": "StreamComplete",
                    "request_id": request_id,
                    "audio_tokens": total_tokens,
                }))

            elif msg_type == "EndSession":
                session_active = False
                _model.reset_caches()
                await websocket.send(json.dumps({"type": "SessionEnded"}))

            else:
                await websocket.send(json.dumps({
                    "type": "Error",
                    "message": f"Unknown message type: {msg_type}",
                }))

    except websockets.ConnectionClosed:
        pass
    finally:
        if session_active:
            _model.reset_caches()


async def run_health_server(host: str, port: int):
    """Run a simple HTTP health check server on port+1."""
    from http.server import HTTPServer, BaseHTTPRequestHandler
    import threading

    health_port = port + 1

    class HealthHandler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/health":
                body = json.dumps({
                    "status": "ok",
                    "model": "higgs-audio-v2",
                    "backend": "mlx-python",
                    "quantization": "int4",
                    "ws_port": port,
                }).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(body)
            else:
                self.send_response(404)
                self.end_headers()

        def log_message(self, format, *args):
            pass  # Suppress access logs

    server = HTTPServer((host, health_port), HealthHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    print(f"  Health: http://{host}:{health_port}/health")


async def run_server(host: str = "0.0.0.0", port: int = 8700):
    """Run the WebSocket server."""
    print(f"\nStarting Higgs MLX WebSocket server on ws://{host}:{port}")
    print(f"  WebSocket: ws://{host}:{port}")

    # Start health check HTTP server on port+1
    await run_health_server(host, port)

    async with websockets.serve(
        handle_websocket,
        host,
        port,
        max_size=10 * 1024 * 1024,  # 10MB max message
    ):
        await asyncio.Future()  # Run forever


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Higgs Audio V2 MLX WebSocket Server")
    parser.add_argument("--model-dir", type=str, default="../../models/higgs-audio-v2")
    parser.add_argument("--port", type=int, default=8700)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    parser.add_argument("--quantize", type=int, default=4, choices=[0, 4, 8],
                        help="Quantization bits (0=none, 4=INT4, 8=INT8)")
    parser.add_argument("--group-size", type=int, default=64)
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    load_model(model_dir, quantize_bits=args.quantize, group_size=args.group_size)
    asyncio.run(run_server(args.host, args.port))


if __name__ == "__main__":
    main()
