"""
OpenAI-compatible API server for Qwen3-Omni Thinker on Apple Silicon (MLX).

Provides:
- POST /v1/chat/completions  (OpenAI chat completions format)
- GET  /health               (health check)
- GET  /v1/models            (list loaded model)

Usage:
    python -m mlx_qwen3_omni.server --model ./mlx_thinker --port 8800
    # Or with pip install -e ".[server]":
    mlx-qwen3-omni-server --model ./mlx_thinker
"""

from __future__ import annotations

import argparse
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Any, Optional

import mlx.core as mx
import numpy as np

LOG = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models for OpenAI-compatible API
# ---------------------------------------------------------------------------


def _make_pydantic_models():
    """Lazy import to avoid hard dep on pydantic at module level."""
    from pydantic import BaseModel, Field

    class ChatMessage(BaseModel):
        role: str
        content: Optional[str] = None
        tool_calls: Optional[list[dict[str, Any]]] = None
        tool_call_id: Optional[str] = None

    class FunctionDef(BaseModel):
        name: str
        description: Optional[str] = None
        parameters: Optional[dict[str, Any]] = None

    class ToolDef(BaseModel):
        type: str = "function"
        function: FunctionDef

    class ChatCompletionRequest(BaseModel):
        model: str = "qwen3-omni-thinker"
        messages: list[ChatMessage]
        temperature: float = Field(default=0.6, ge=0.0, le=2.0)
        max_tokens: Optional[int] = Field(default=512, ge=1, le=65536)
        stream: bool = False
        tools: Optional[list[ToolDef]] = None
        tool_choice: Optional[str | dict] = None
        top_p: float = Field(default=1.0, ge=0.0, le=1.0)
        stop: Optional[list[str] | str] = None

    class AudioSpeechRequest(BaseModel):
        input: str
        voice: Optional[str] = None
        model: Optional[str] = None
        response_format: Optional[dict[str, Any]] = None

    return ChatMessage, ChatCompletionRequest, AudioSpeechRequest


# ---------------------------------------------------------------------------
# Model manager (singleton)
# ---------------------------------------------------------------------------


class ModelManager:
    """Loads and caches the Thinker model + tokenizer + optional audio encoder + Talker + Code2Wav."""

    def __init__(self) -> None:
        self.model = None
        self.tokenizer = None
        self.audio_encoder = None
        self.talker = None
        self.code2wav = None
        self.config: dict[str, Any] = {}
        self.model_id: str = "qwen3-omni-thinker"
        self._model_path: Optional[Path] = None
        self._accept_hidden_layer: int = 18

    def load(self, model_path: str | Path, tokenizer_path: str | None = None) -> None:
        """Load Thinker model, tokenizer, and optional audio encoder, Talker, Code2Wav from disk."""
        from mlx_qwen3_omni.generate import load_model_and_config, load_tokenizer

        model_path = Path(model_path)
        self._model_path = model_path

        LOG.info("Loading model from %s ...", model_path)
        t0 = time.monotonic()
        self.model, self.config, self.audio_encoder = load_model_and_config(
            model_path, load_audio_encoder=True
        )
        t1 = time.monotonic()
        LOG.info("Model loaded in %.2fs", t1 - t0)

        weights_path = model_path / "model.safetensors"
        if weights_path.exists():
            weights = dict(mx.load(str(weights_path)))
            talker_keys = {k: v for k, v in weights.items() if k.startswith("talker.")}
            if talker_keys:
                from mlx_qwen3_omni.talker import Qwen3OmniTalker, TalkerConfig
                talker_cfg = TalkerConfig.from_dict(self.config)
                self.talker = Qwen3OmniTalker(talker_cfg)
                strip = {k[len("talker."):]: v for k, v in talker_keys.items()}
                self.talker.load_weights(list(strip.items()), strict=False)
                mx.eval(self.talker.parameters())
                self._accept_hidden_layer = talker_cfg.accept_hidden_layer
                LOG.info("Loaded Talker (%d keys)", len(talker_keys))
            c2w_keys = {k: v for k, v in weights.items() if k.startswith("code2wav.")}
            if c2w_keys:
                from mlx_qwen3_omni.code2wav import Qwen3OmniCode2Wav, Code2WavConfig
                c2w_cfg = Code2WavConfig.from_dict(self.config.get("code2wav_config") or {})
                self.code2wav = Qwen3OmniCode2Wav(c2w_cfg)
                strip = {k[len("code2wav."):]: v for k, v in c2w_keys.items()}
                self.code2wav.load_weights(list(strip.items()), strict=False)
                mx.eval(self.code2wav.parameters())
                LOG.info("Loaded Code2Wav (%d keys)", len(c2w_keys))

        LOG.info("Loading tokenizer ...")
        self.tokenizer = load_tokenizer(model_path, tokenizer_path)
        t2 = time.monotonic()
        LOG.info("Tokenizer loaded in %.2fs", t2 - t1)

        # Report Metal memory
        try:
            active = mx.metal.get_active_memory() / (1024**3)
            peak = mx.metal.get_peak_memory() / (1024**3)
            LOG.info("Metal memory: active=%.2f GB, peak=%.2f GB", active, peak)
        except Exception:
            pass

    @property
    def is_loaded(self) -> bool:
        return self.model is not None and self.tokenizer is not None

    @property
    def eos_token_id(self) -> int | None:
        text_cfg = self.config.get("text_config", {})
        eos = text_cfg.get("eos_token_id") or self.config.get("eos_token_id")
        if eos is None and hasattr(self.tokenizer, "eos_token_id"):
            eos = self.tokenizer.eos_token_id
        return eos


_manager = ModelManager()


# ---------------------------------------------------------------------------
# Generation logic
# ---------------------------------------------------------------------------


def _tokenize_messages(tokenizer, messages: list[dict]) -> mx.array:
    """Convert chat messages to token IDs using the tokenizer's chat template."""
    msg_dicts = []
    for m in messages:
        d: dict[str, Any] = {"role": m["role"]}
        if m.get("content") is not None:
            d["content"] = m["content"]
        msg_dicts.append(d)

    if hasattr(tokenizer, "apply_chat_template"):
        text = tokenizer.apply_chat_template(
            msg_dicts, add_generation_prompt=True, tokenize=False
        )
    else:
        text = "\n".join(
            f"{m['role']}: {m.get('content', '')}" for m in msg_dicts
        )

    if not text or not text.strip():
        text = " "

    encoded = tokenizer(text, return_tensors="np")
    return mx.array(encoded["input_ids"])


def _sample(logits: mx.array, temperature: float = 0.6) -> int:
    """Sample next token from logits (last position)."""
    logits = logits[:, -1, :]
    if temperature > 0:
        logits = logits / temperature
        probs = mx.softmax(logits, axis=-1)
        token = mx.random.categorical(probs)
    else:
        token = mx.argmax(logits, axis=-1)
    return int(mx.squeeze(token).item())


def generate_response(
    messages: list[dict],
    max_tokens: int = 512,
    temperature: float = 0.6,
    stop: list[str] | None = None,
) -> tuple[str, int, int]:
    """Generate a full response (non-streaming). Returns (content, prompt_tokens, completion_tokens)."""
    model = _manager.model
    tokenizer = _manager.tokenizer
    eos = _manager.eos_token_id

    input_ids = _tokenize_messages(tokenizer, messages)
    prompt_tokens = int(input_ids.size)
    cache = model.make_cache()
    generated: list[int] = []

    for _ in range(max_tokens):
        logits = model(input_ids, cache=cache)
        next_id = _sample(logits, temperature)
        generated.append(next_id)
        if eos is not None and next_id == eos:
            break
        input_ids = mx.array([[next_id]])
        # Evaluate cache to free graph memory
        for c in cache:
            if c.keys is not None:
                mx.eval(c.keys)
            if c.values is not None:
                mx.eval(c.values)

        # Check stop sequences
        if stop:
            partial = tokenizer.decode(generated, skip_special_tokens=True)
            if any(s in partial for s in stop):
                break

    content = tokenizer.decode(generated, skip_special_tokens=True)
    completion_tokens = len(generated)
    return content, prompt_tokens, completion_tokens


def generate_response_streaming(
    messages: list[dict],
    max_tokens: int = 512,
    temperature: float = 0.6,
    stop: list[str] | None = None,
):
    """Yield (delta, prompt_tokens, completion_tokens) for SSE streaming.
    First yields have prompt_tokens=None, completion_tokens=None; final yield has both set."""
    model = _manager.model
    tokenizer = _manager.tokenizer
    eos = _manager.eos_token_id

    input_ids = _tokenize_messages(tokenizer, messages)
    prompt_tokens = int(input_ids.size)
    cache = model.make_cache()
    generated: list[int] = []
    prev_len = 0

    for _ in range(max_tokens):
        logits = model(input_ids, cache=cache)
        next_id = _sample(logits, temperature)
        generated.append(next_id)

        if eos is not None and next_id == eos:
            break

        input_ids = mx.array([[next_id]])
        for c in cache:
            if c.keys is not None:
                mx.eval(c.keys)
            if c.values is not None:
                mx.eval(c.values)

        new_tokens = generated[prev_len:]
        prev_len = len(generated)
        delta = ""
        if new_tokens:
            delta = tokenizer.decode(new_tokens, skip_special_tokens=True)
        yield (delta, None, None)

        if stop:
            full_text = tokenizer.decode(generated, skip_special_tokens=True)
            if any(s in full_text for s in stop):
                break

    completion_tokens = len(generated)
    yield ("", prompt_tokens, completion_tokens)


def _transcribe_audio_bytes(audio_bytes: bytes, suffix: str = ".wav") -> str:
    """Transcribe audio bytes using loaded audio encoder + Thinker. Requires audio_encoder loaded."""
    if _manager.audio_encoder is None:
        raise ValueError("Audio encoder not loaded; cannot transcribe audio in chat")
    import tempfile
    from pathlib import Path as PathLib
    from mlx_qwen3_omni.audio.mel import MelSpectrogram
    from mlx_qwen3_omni.generate import _load_audio_16k_mono, generate
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = PathLib(tmp.name)
    try:
        samples = _load_audio_16k_mono(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)
    mel = MelSpectrogram()
    mel_np = mel.compute(samples)
    mel_mx = mx.array(mel_np)
    audio_features = _manager.audio_encoder(mel_mx)
    text_cfg = _manager.config.get("text_config") or {}
    eos = text_cfg.get("eos_token_id") or _manager.config.get("eos_token_id")
    content = generate(
        _manager.model,
        _manager.tokenizer,
        "Transcribe the following audio.",
        max_new_tokens=512,
        temperature=0.2,
        eos_token_id=eos,
        audio_features=audio_features,
    )
    return content.strip()


def _normalize_messages_with_audio(messages: list[dict]) -> list[dict]:
    """Convert OpenAI-style messages: replace audio parts with transcribed text. Returns messages with string content."""
    import base64
    result: list[dict] = []
    for m in messages:
        m = dict(m)
        content = m.get("content")
        if content is None:
            result.append(m)
            continue
        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    if item.get("type") == "text":
                        parts.append(item.get("text", ""))
                    elif item.get("type") in ("input_audio", "audio_url") or "audio_url" in item:
                        url = item.get("audio_url") or item
                        url_str = url.get("url", "") if isinstance(url, dict) else str(url)
                        if isinstance(url_str, str) and url_str.startswith("data:"):
                            b64 = url_str.split(",", 1)[-1]
                            try:
                                audio_bytes = base64.b64decode(b64)
                                suffix = ".wav"
                                if "mpeg" in url_str or "mp3" in url_str:
                                    suffix = ".mp3"
                                text = _transcribe_audio_bytes(audio_bytes, suffix)
                                parts.append(f"[Transcribed]: {text}")
                            except Exception as e:
                                LOG.warning("Transcription of inline audio failed: %s", e)
                                parts.append("[Transcribed: error]")
                        else:
                            parts.append("[Audio: use data URL with base64]")
                    else:
                        parts.append("")
                else:
                    parts.append(str(item))
            m["content"] = "\n".join(parts) if parts else ""
        result.append(m)
    return result


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------


def create_app() -> "FastAPI":
    """Build the FastAPI application."""
    from fastapi import FastAPI, File, HTTPException, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse

    ChatMessage, ChatCompletionRequest, AudioSpeechRequest = _make_pydantic_models()

    app = FastAPI(
        title="MLX Qwen3-Omni Thinker",
        version="0.1.0",
        description="OpenAI-compatible API for Qwen3-Omni Thinker on Apple Silicon",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health():
        loaded = _manager.is_loaded
        info: dict[str, Any] = {"status": "ok" if loaded else "loading", "model_loaded": loaded}
        if loaded:
            try:
                info["metal_active_gb"] = round(
                    mx.metal.get_active_memory() / (1024**3), 2
                )
                info["metal_peak_gb"] = round(
                    mx.metal.get_peak_memory() / (1024**3), 2
                )
            except Exception:
                pass
        return info

    @app.get("/v1/models")
    async def list_models():
        return {
            "object": "list",
            "data": [
                {
                    "id": _manager.model_id,
                    "object": "model",
                    "owned_by": "local",
                    "created": int(time.time()),
                }
            ],
        }

    @app.post("/v1/chat/completions")
    async def chat_completions(request: ChatCompletionRequest):
        if not _manager.is_loaded:
            raise HTTPException(status_code=503, detail="Model not loaded yet")
        if request.tools is not None and len(request.tools) > 0:
            raise HTTPException(
                status_code=400,
                detail="Function calling (tools) is not implemented; omit 'tools' for text-only chat.",
            )

        messages = [m.model_dump(exclude_none=True) for m in request.messages]
        messages = _normalize_messages_with_audio(messages)
        stop_seqs = None
        if request.stop:
            stop_seqs = (
                [request.stop] if isinstance(request.stop, str) else request.stop
            )

        request_id = f"chatcmpl-{uuid.uuid4().hex[:12]}"
        created = int(time.time())

        if request.stream:
            return _stream_response(
                request_id=request_id,
                created=created,
                model=request.model,
                messages=messages,
                max_tokens=request.max_tokens or 512,
                temperature=request.temperature,
                stop=stop_seqs,
            )

        # Non-streaming
        t0 = time.monotonic()
        content, prompt_tokens, completion_tokens = generate_response(
            messages=messages,
            max_tokens=request.max_tokens or 512,
            temperature=request.temperature,
            stop=stop_seqs,
        )
        latency = time.monotonic() - t0
        LOG.info("Generated %d chars in %.2fs (prompt=%d, completion=%d)", len(content), latency, prompt_tokens, completion_tokens)

        return {
            "id": request_id,
            "object": "chat.completion",
            "created": created,
            "model": request.model,
            "choices": [
                {
                    "index": 0,
                    "message": {"role": "assistant", "content": content},
                    "finish_reason": "stop",
                }
            ],
            "usage": {
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
            },
        }

    def _stream_response(
        request_id: str,
        created: int,
        model: str,
        messages: list[dict],
        max_tokens: int,
        temperature: float,
        stop: list[str] | None,
    ):
        """Return an SSE streaming response."""
        from sse_starlette.sse import EventSourceResponse

        async def event_generator():
            prompt_tokens = None
            completion_tokens = None
            for delta, pt, ct in generate_response_streaming(
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=stop,
            ):
                if pt is not None and ct is not None:
                    prompt_tokens, completion_tokens = pt, ct
                    break
                if delta:
                    chunk = {
                        "id": request_id,
                        "object": "chat.completion.chunk",
                        "created": created,
                        "model": model,
                        "choices": [
                            {
                                "index": 0,
                                "delta": {"content": delta},
                                "finish_reason": None,
                            }
                        ],
                    }
                    yield {"data": json.dumps(chunk)}

            final: dict[str, Any] = {
                "id": request_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model,
                "choices": [
                    {
                        "index": 0,
                        "delta": {},
                        "finish_reason": "stop",
                    }
                ],
            }
            if prompt_tokens is not None and completion_tokens is not None:
                final["usage"] = {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens,
                }
            yield {"data": json.dumps(final)}
            yield {"data": "[DONE]"}

        return EventSourceResponse(event_generator())

    @app.post("/v1/audio/transcriptions")
    async def audio_transcriptions(file: UploadFile = File(..., alias="file")):
        """OpenAI-compatible: audio file in, text out (via AuT + Thinker). Requires multipart form 'file'."""
        from pathlib import Path as PathLib
        import tempfile
        from mlx_qwen3_omni.audio.mel import MelSpectrogram
        from mlx_qwen3_omni.generate import _load_audio_16k_mono, generate
        if not _manager.is_loaded:
            raise HTTPException(status_code=503, detail="Model not loaded yet")
        if _manager.audio_encoder is None:
            raise HTTPException(
                status_code=501,
                detail="Audio encoder not in checkpoint; cannot transcribe",
            )
        contents = await file.read()
        suffix = PathLib(file.filename or "").suffix or ".wav"
        if not suffix.startswith("."):
            suffix = "." + suffix
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(contents)
            tmp_path = PathLib(tmp.name)
        try:
            samples = _load_audio_16k_mono(tmp_path)
        except Exception as e:
            tmp_path.unlink(missing_ok=True)
            raise HTTPException(400, f"Invalid or unsupported audio: {e}") from e
        tmp_path.unlink(missing_ok=True)

        mel = MelSpectrogram()
        mel_np = mel.compute(samples)
        mel_mx = mx.array(mel_np)
        audio_features = _manager.audio_encoder(mel_mx)

        prompt = "Transcribe the following audio."
        text_cfg = _manager.config.get("text_config") or {}
        eos = text_cfg.get("eos_token_id") or _manager.config.get("eos_token_id")
        content = generate(
            _manager.model,
            _manager.tokenizer,
            prompt,
            max_new_tokens=512,
            temperature=0.2,
            eos_token_id=eos,
            audio_features=audio_features,
        )
        return {"text": content.strip()}

    @app.post("/v1/audio/speech")
    async def audio_speech(request: AudioSpeechRequest):
        """OpenAI-compatible: text in, audio out (via Thinker hidden at layer 18 + Talker + Code2Wav)."""
        if not _manager.is_loaded:
            raise HTTPException(status_code=503, detail="Model not loaded yet")
        if _manager.talker is None or _manager.code2wav is None:
            raise HTTPException(
                status_code=501,
                detail="Talker/Code2Wav not in checkpoint; cannot synthesize speech",
            )
        text = (request.input or "").strip()
        if not text:
            raise HTTPException(400, "input is required and must be non-empty")
        if request.voice:
            LOG.debug("Voice requested: %s (speaker conditioning not yet in model)", request.voice)
        encoded = _manager.tokenizer(text, return_tensors="np")
        input_ids = mx.array(encoded["input_ids"])
        logits, hidden_18 = _manager.model.forward_with_hidden_states(
            input_ids,
            cache=None,
            audio_features=None,
            extract_layer=_manager._accept_hidden_layer,
        )
        codec_logits = _manager.talker(hidden_18)
        codec_tokens = mx.argmax(codec_logits, axis=-1)
        waveform = _manager.code2wav(codec_tokens)
        wav_np = np.array(waveform, dtype=np.float32)
        sample_rate = _manager.code2wav.sample_rate
        import io
        import struct
        buf = io.BytesIO()
        n_frames = wav_np.size
        buf.write(b"RIFF")
        buf.write(struct.pack("<I", 36 + n_frames * 2))
        buf.write(b"WAVEfmt ")
        buf.write(struct.pack("<I", 16))
        buf.write(struct.pack("<HHI", 1, 1, sample_rate))
        buf.write(struct.pack("<IH", sample_rate * 2, 2))
        buf.write(b"data")
        buf.write(struct.pack("<I", n_frames * 2))
        for s in np.clip(wav_np.ravel(), -1.0, 1.0):
            buf.write(struct.pack("<h", int(s * 32767)))
        buf.seek(0)
        from fastapi.responses import Response
        return Response(
            content=buf.getvalue(),
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"},
        )

    return app


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="OpenAI-compatible server for Qwen3-Omni Thinker (MLX)"
    )
    parser.add_argument(
        "--model",
        "-m",
        required=True,
        help="Path to MLX Thinker dir (thinker_config.json + model.safetensors)",
    )
    parser.add_argument(
        "--tokenizer",
        "-t",
        default=None,
        help="Tokenizer path or HF repo (default: same as --model)",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Host to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8800,
        help="Port to listen on (default: 8800)",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model path not found: {model_path}")

    _manager.load(model_path, args.tokenizer)

    app = create_app()

    import uvicorn

    LOG.info("Starting server on %s:%d", args.host, args.port)
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
