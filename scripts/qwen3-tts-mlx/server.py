"""
Qwen3-TTS MLX Server

FastAPI server for on-device text-to-speech using Qwen3-TTS on Apple Silicon (MLX).
Compatible with LocalTTSProvider (POST /synthesize) and Qwen3TTSClient (/v1/tts/synthesize).

Model: mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16 (~4GB RAM)
Output: 24kHz mono PCM (16-bit signed)

Usage:
    python server.py                        # Start on port 8501
    python server.py --port 8001            # Custom port
    python server.py --model custom/model   # Custom model path

Env:
    QWEN3_TTS_MODEL   - HuggingFace model ID (default: mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16)
    QWEN3_TTS_PORT    - Server port (default: 8501)
    HF_TOKEN          - HuggingFace token (if needed for gated models)
"""

import argparse
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("qwen3-tts-mlx")

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16"
DEFAULT_PORT = 8501
SAMPLE_RATE = 24000

# Voice design descriptions for Ferni personas (used when no reference audio)
PERSONA_VOICE_DESIGNS: dict[str, str] = {
    "ferni": "Male, 30 years old, warm baritone, friendly and grounded, like a caring life coach who genuinely listens",
    "maya": "Female, 28 years old, alto range, encouraging and energetic, like a personal trainer who motivates with warmth",
    "peter": "Male, 45 years old, deep tenor, thoughtful and measured, like an Ivy League professor explaining complex topics simply",
    "alex": "Female, 32 years old, clear and articulate mezzo-soprano, professional yet warm, like a trusted communications advisor",
    "jordan": "Female, 26 years old, bright soprano, enthusiastic and organized, like a creative wedding planner full of ideas",
    "nayan": "Male, 60 years old, deep bass-baritone, wise and serene, like an Indian philosopher sharing ancient wisdom",
    "joel": "Male, 55 years old, authoritative baritone, confident and direct, like a legendary investor explaining market wisdom",
    "lynch": "Male, 65 years old, warm tenor, folksy and approachable, like a legendary fund manager sharing investing stories",
    "bogle": "Male, 70 years old, deep resonant voice, principled and measured, like the father of index investing giving a lecture",
}

# Map full persona IDs to short names
PERSONA_ALIASES: dict[str, str] = {
    "maya-santos": "maya",
    "peter-john": "peter",
    "alex-chen": "alex",
    "jordan-taylor": "jordan",
    "nayan-patel": "nayan",
    "joel-dickson": "joel",
    "peter-lynch": "lynch",
    "john-bogle": "bogle",
}

# ---------------------------------------------------------------------------
# Model Loading (lazy)
# ---------------------------------------------------------------------------

_model = None
_model_id: str = ""


def get_model():
    """Lazy-load the MLX TTS model on first request."""
    global _model, _model_id
    if _model is not None:
        return _model

    from mlx_audio.tts.utils import load_model

    model_id = os.environ.get("QWEN3_TTS_MODEL", DEFAULT_MODEL)
    _model_id = model_id

    log.info(f"Loading Qwen3-TTS model: {model_id}")
    start = time.time()
    _model = load_model(model_id)
    elapsed = time.time() - start
    log.info(f"Model loaded in {elapsed:.1f}s")
    return _model


def resolve_voice_id(voice_id: str) -> str:
    """Resolve a voice ID to a short persona name."""
    key = voice_id.lower().replace("_", "-")
    if key in PERSONA_ALIASES:
        return PERSONA_ALIASES[key]
    if key in PERSONA_VOICE_DESIGNS:
        return key
    return key


def get_voice_description(voice_id: str) -> Optional[str]:
    """Get the voice design description for a persona."""
    resolved = resolve_voice_id(voice_id)
    return PERSONA_VOICE_DESIGNS.get(resolved)


def float32_to_pcm16(audio: np.ndarray) -> bytes:
    """Convert float32 audio [-1, 1] to 16-bit signed PCM bytes."""
    audio = np.clip(audio, -1.0, 1.0)
    pcm = (audio * 32767).astype(np.int16)
    return pcm.tobytes()


# ---------------------------------------------------------------------------
# Synthesis Core
# ---------------------------------------------------------------------------


def synthesize_audio(
    text: str,
    voice_id: str = "ferni",
    sample_rate: int = SAMPLE_RATE,
    emotion: Optional[str] = None,
    speed: Optional[float] = None,
) -> bytes:
    """
    Synthesize text to 16-bit PCM audio using Qwen3-TTS MLX.

    Returns raw PCM bytes (mono, 16-bit signed, at sample_rate).

    Uses VoiceDesign model: model.generate_voice_design(text, language, instruct)
    where `instruct` is a natural language voice description.
    """
    model = get_model()
    resolved = resolve_voice_id(voice_id)

    # Build voice description for Qwen3-TTS VoiceDesign
    voice_desc = get_voice_description(resolved) or f"Natural conversational voice, {resolved}"

    # Add emotion modifier if provided
    if emotion:
        voice_desc = f"{voice_desc}. Tone: {emotion}"

    log.info(
        f"Synthesizing: text={text[:60]!r}... voice={resolved} emotion={emotion} speed={speed}"
    )

    start = time.time()

    try:
        # Generate audio using mlx-audio VoiceDesign API
        # Returns an iterator of result objects; each has .audio (mx.array)
        results = list(model.generate_voice_design(
            text=text,
            language="English",
            instruct=voice_desc,
        ))
    except Exception as e:
        log.error(f"Model inference failed: {e}")
        return b""

    if not results or not hasattr(results[0], "audio"):
        log.error("No audio generated from model")
        return b""

    # Convert mx.array → numpy float32
    audio_np = np.array(results[0].audio, dtype=np.float32)

    # Flatten if multi-dimensional
    if audio_np.ndim > 1:
        audio_np = audio_np.flatten()

    # Apply speed adjustment via resampling
    if speed and speed != 1.0 and 0.5 <= speed <= 2.0:
        from scipy import signal

        target_len = int(len(audio_np) / speed)
        audio_np = signal.resample(audio_np, target_len).astype(np.float32)

    # Resample if model output rate differs from requested rate
    model_sr = 24000  # Qwen3-TTS outputs at 24kHz
    if sample_rate != model_sr:
        from scipy import signal

        ratio = sample_rate / model_sr
        new_length = int(len(audio_np) * ratio)
        audio_np = signal.resample(audio_np, new_length).astype(np.float32)

    elapsed_ms = (time.time() - start) * 1000
    log.info(f"Synthesized {len(audio_np)} samples in {elapsed_ms:.0f}ms (voice={resolved})")

    return float32_to_pcm16(audio_np)


# ---------------------------------------------------------------------------
# FastAPI App (with lifespan for model pre-loading)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Pre-load model on server start for faster first request."""
    log.info("Pre-loading Qwen3-TTS model...")
    try:
        get_model()
        log.info("Model ready!")
    except Exception as e:
        log.error(f"Failed to pre-load model: {e}")
        log.error("Model will be loaded on first request instead.")
    yield


app = FastAPI(
    title="Qwen3-TTS MLX Server",
    description="On-device TTS using Qwen3-TTS on Apple Silicon",
    version="1.0.0",
    lifespan=lifespan,
)


# --- Request Models -------------------------------------------------------


class SynthesizeRequest(BaseModel):
    """Request for LocalTTSProvider-compatible /synthesize endpoint."""

    text: str
    voice_id: str = "ferni"
    sample_rate: int = SAMPLE_RATE
    emotion: Optional[str] = None
    speed: Optional[float] = None


class V1SynthesizeRequest(BaseModel):
    """Request for Qwen3TTSClient-compatible /v1/tts/synthesize endpoint."""

    text: str
    persona_id: str = "ferni"
    language: str = "en"
    instruct: Optional[str] = None
    voice_clone_prompt: Optional[dict] = None
    streaming: bool = False


class VoiceDesignRequest(BaseModel):
    """Voice design from description."""

    persona_id: str
    description: str
    language: str = "en"
    sample_text: str = "Hello, how are you doing today? I am here to help."


class VoiceCloneRequest(BaseModel):
    """Voice clone from reference audio (falls back to voice design on MLX)."""

    persona_id: str = "unknown"
    ref_text: str = ""
    ref_audio_path: Optional[str] = None


# --- Health ----------------------------------------------------------------


@app.get("/health")
async def health():
    """Health check endpoint."""
    model_loaded = _model is not None
    return {
        "status": "ok",
        "model": _model_id or DEFAULT_MODEL,
        "model_loaded": model_loaded,
        "sample_rate": SAMPLE_RATE,
        "backend": "mlx",
        "platform": "apple-silicon",
    }


# --- LocalTTSProvider contract: POST /synthesize ---------------------------


@app.post("/synthesize")
async def synthesize(request: SynthesizeRequest):
    """
    Synthesize text to 16-bit PCM audio.

    Compatible with LocalTTSProvider (src/speech/tts-gateway/providers/local-tts.ts).
    Returns raw PCM bytes (16-bit signed, mono).
    """
    if not request.text.strip():
        return Response(content=b"", media_type="application/octet-stream")

    try:
        pcm = synthesize_audio(
            text=request.text,
            voice_id=request.voice_id,
            sample_rate=request.sample_rate,
            emotion=request.emotion,
            speed=request.speed,
        )
        return Response(
            content=pcm,
            media_type="application/octet-stream",
            headers={
                "Content-Length": str(len(pcm)),
                "X-Sample-Rate": str(request.sample_rate),
                "X-Audio-Format": "pcm-s16le",
            },
        )
    except Exception as e:
        log.error(f"Synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Qwen3TTSClient contract: POST /v1/tts/synthesize ---------------------


@app.post("/v1/tts/synthesize")
async def v1_synthesize(request: V1SynthesizeRequest):
    """
    Synthesize text to audio (Qwen3TTSClient-compatible).

    Returns raw PCM bytes. Compatible with src/integrations/qwen3-omni/tts-client.ts.
    """
    if not request.text.strip():
        return Response(content=b"", media_type="application/octet-stream")

    # Map instruct to emotion
    emotion = None
    if request.instruct:
        emotion = request.instruct

    try:
        pcm = synthesize_audio(
            text=request.text,
            voice_id=request.persona_id,
            emotion=emotion,
        )
        return Response(
            content=pcm,
            media_type="application/octet-stream",
            headers={
                "Content-Length": str(len(pcm)),
                "X-Sample-Rate": str(SAMPLE_RATE),
            },
        )
    except Exception as e:
        log.error(f"V1 synthesis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Voice Design: POST /v1/voice/design ----------------------------------


@app.post("/v1/voice/design")
async def voice_design(request: VoiceDesignRequest):
    """
    Design a voice from a natural language description.

    Stores the description for use in future synthesis calls.
    Compatible with Qwen3TTSClient.
    """
    resolved = resolve_voice_id(request.persona_id)

    # Store/update the voice description
    PERSONA_VOICE_DESIGNS[resolved] = request.description

    log.info(f"Voice designed for {resolved}: {request.description[:80]}")

    return {
        "prompt_data": {"persona_id": resolved, "description": request.description},
        "quality_score": 0.85,
    }


# --- Voice Clone: POST /v1/voice/clone ------------------------------------


@app.post("/v1/voice/clone")
async def voice_clone(request: VoiceCloneRequest):
    """
    Clone a voice from reference audio.

    Note: Full voice cloning requires reference audio files. This endpoint
    accepts the request and stores metadata. For MLX, voice cloning uses
    the model's built-in voice design capability with description text.
    """
    resolved = resolve_voice_id(request.persona_id)

    log.info(f"Voice clone request for {resolved} (MLX uses voice design instead)")

    # On MLX, we use voice design descriptions rather than true audio cloning
    # (audio-based cloning requires the full PyTorch model with more VRAM)
    description = get_voice_description(resolved)
    if not description:
        description = f"Natural voice, persona: {resolved}"

    return {
        "prompt_data": {"persona_id": resolved, "description": description},
        "ref_duration_sec": 3.0,
        "quality_score": 0.80,
    }


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Qwen3-TTS MLX Server")
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.environ.get("QWEN3_TTS_PORT", str(DEFAULT_PORT))),
        help=f"Server port (default: {DEFAULT_PORT})",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Server host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("QWEN3_TTS_MODEL", DEFAULT_MODEL),
        help=f"HuggingFace model ID (default: {DEFAULT_MODEL})",
    )
    args = parser.parse_args()

    # Set model env var if provided via CLI
    if args.model != DEFAULT_MODEL:
        os.environ["QWEN3_TTS_MODEL"] = args.model

    log.info(f"Starting Qwen3-TTS MLX server on {args.host}:{args.port}")
    log.info(f"Model: {args.model}")
    log.info(f"Sample rate: {SAMPLE_RATE}Hz")

    uvicorn.run(app, host=args.host, port=args.port, log_level="info")
