#!/usr/bin/env python3
"""
Kyutai MLX Bridge Server

WebSocket server that exposes the same protocol as moshi-server for STT and TTS,
so the Ferni voice agent can connect to real Kyutai models on Mac (Apple Silicon)
via MLX instead of requiring CUDA/GCE.

Protocol (matches mock and production moshi-server):
  - STT: /api/asr-streaming — accept binary PCM (16kHz mono Int16), respond with
    JSON { text, is_final, words?, vad?, is_speaking? }
  - TTS: /api/tts_streaming — accept JSON { text, voice_id }, respond with
    binary PCM chunks (24kHz Int16) then optional { done: true }, then close.

Usage:
  python scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090

With real models (requires moshi-mlx and deps):
  pip install -r scripts/kyutai/requirements-mlx.txt
  python scripts/kyutai/mlx-bridge-server.py --stt-port 8089 --tts-port 8090 --use-mlx

Without --use-mlx, returns mock responses so you can test the pipeline without models.
"""

import argparse
import asyncio
import json
import struct
import sys
from concurrent.futures import ThreadPoolExecutor

try:
    import websockets
    from websockets.server import serve
except ImportError:
    print("Install dependencies: pip install -r scripts/kyutai/requirements-mlx.txt", file=sys.stderr)
    sys.exit(1)

# Optional: real inference via moshi_mlx
USE_MLX = False
STT_MODEL = None  # dict: lm, audio_tokenizer, text_tokenizer, lm_config
TTS_MODEL = None  # TTSModel instance
_executor = ThreadPoolExecutor(max_workers=2)


def _load_stt_model(hf_repo: str = "kyutai/stt-1b-en_fr-mlx"):
    """Load STT model (Lm, Mimi, tokenizer). Same pattern as DSM stt_from_file_mlx."""
    import json as _json
    import mlx.core as mx
    import mlx.nn as nn
    import sentencepiece
    from huggingface_hub import hf_hub_download
    from moshi_mlx import models, utils

    lm_config_path = hf_hub_download(hf_repo, "config.json")
    with open(lm_config_path, "r") as f:
        lm_config_dict = _json.load(f)
    mimi_weights = hf_hub_download(hf_repo, lm_config_dict["mimi_name"])
    moshi_name = lm_config_dict.get("moshi_name", "model.safetensors")
    moshi_weights = hf_hub_download(hf_repo, moshi_name)
    tokenizer_path = hf_hub_download(hf_repo, lm_config_dict["tokenizer_name"])

    lm_config = models.LmConfig.from_config_dict(lm_config_dict)
    model = models.Lm(lm_config)
    model.set_dtype(mx.bfloat16)
    if moshi_weights.endswith(".q4.safetensors"):
        nn.quantize(model, bits=4, group_size=32)
    elif moshi_weights.endswith(".q8.safetensors"):
        nn.quantize(model, bits=8, group_size=64)
    model.load_weights(moshi_weights, strict=True)

    text_tokenizer = sentencepiece.SentencePieceProcessor(tokenizer_path)
    audio_tokenizer = models.mimi.Mimi(models.mimi_202407(32))
    audio_tokenizer.load_pytorch_weights(str(mimi_weights), strict=True)
    model.warmup()

    return {
        "model": model,
        "audio_tokenizer": audio_tokenizer,
        "text_tokenizer": text_tokenizer,
        "lm_config": lm_config,
        "utils": utils,
    }


def _create_stt_gen(stt_model):
    """Create a new LmGen for one STT connection (stateful)."""
    from moshi_mlx import models

    return models.LmGen(
        model=stt_model["model"],
        max_steps=4096,
        text_sampler=stt_model["utils"].Sampler(top_k=25, temp=0),
        audio_sampler=stt_model["utils"].Sampler(top_k=250, temp=0.8),
        check=False,
    )


def _resample_16k_to_24k(pcm_float_16k):
    """Upsample 16kHz float to 24kHz (ratio 3/2)."""
    import numpy as np
    n_16 = len(pcm_float_16k)
    n_24 = int(n_16 * 24 / 16)
    x_old = np.linspace(0, n_16 - 1, n_16)
    x_new = np.linspace(0, n_16 - 1, n_24)
    return np.interp(x_new, x_old, pcm_float_16k).astype(np.float32)


def _run_stt_on_buffer(stt_model, gen, audio_24k_float):
    """
    Run STT on 24kHz float audio chunk. Processes 1920-sample blocks; returns
    text for this chunk only (one step per block). Used incrementally.
    """
    import mlx.core as mx
    import numpy as np

    block_size = 1920
    transcript = []
    audio = np.array(audio_24k_float, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio[None, :]
    n_samples = audio.shape[-1]
    n_blocks = n_samples // block_size
    if n_blocks == 0:
        return ""
    audio = audio[..., : n_blocks * block_size]
    audio_mx = mx.array(audio)

    text_tokenizer = stt_model["text_tokenizer"]
    audio_tokenizer = stt_model["audio_tokenizer"]
    other_codebooks = stt_model["lm_config"].other_codebooks

    for start_idx in range(0, n_blocks * block_size, block_size):
        block = audio_mx[:, None, start_idx : start_idx + block_size]
        other_audio_tokens = audio_tokenizer.encode_step(block).transpose(0, 2, 1)
        other_audio_tokens = other_audio_tokens[:, :, :other_codebooks]
        text_token = gen.step(other_audio_tokens[0])
        text_token = text_token[0].item()
        if text_token not in (0, 3):
            _text = text_tokenizer.id_to_piece(text_token)
            _text = _text.replace("▁", " ")
            transcript.append(_text)
    return "".join(transcript)


def _load_tts_model(hf_repo=None, voice_repo=None, voice=None, quantize=None):
    """Load TTS model. Same pattern as DSM tts_mlx.py."""
    import json as _json
    import mlx.core as mx
    import mlx.nn as nn
    import sentencepiece
    from moshi_mlx.models.tts import (
        DEFAULT_DSM_TTS_REPO,
        DEFAULT_DSM_TTS_VOICE_REPO,
        TTSModel,
    )
    from moshi_mlx.utils.loaders import hf_get
    from moshi_mlx import models

    if hf_repo is None:
        hf_repo = DEFAULT_DSM_TTS_REPO
    if voice_repo is None:
        voice_repo = DEFAULT_DSM_TTS_VOICE_REPO
    if voice is None:
        voice = "expresso/ex03-ex01_happy_001_channel1_334s.wav"

    mx.random.seed(299792458)
    raw_config = hf_get("config.json", hf_repo)
    with open(hf_get(raw_config), "r") as f:
        raw_config = _json.load(f)
    mimi_weights = hf_get(raw_config["mimi_name"], hf_repo)
    moshi_name = raw_config.get("moshi_name", "model.safetensors")
    moshi_weights = hf_get(moshi_name, hf_repo)
    tokenizer = hf_get(raw_config["tokenizer_name"], hf_repo)
    lm_config = models.LmConfig.from_config_dict(raw_config)
    lm_config.transformer.max_seq_len = lm_config.transformer.context
    model = models.Lm(lm_config)
    model.set_dtype(mx.bfloat16)
    model.load_pytorch_weights(str(moshi_weights), lm_config, strict=True)
    if quantize is not None:
        nn.quantize(model.depformer, bits=quantize)
        for layer in model.transformer.layers:
            nn.quantize(layer.self_attn, bits=quantize)
            nn.quantize(layer.gating, bits=quantize)
    text_tokenizer = sentencepiece.SentencePieceProcessor(str(tokenizer))
    generated_codebooks = lm_config.generated_codebooks
    audio_tokenizer = models.mimi.Mimi(models.mimi_202407(generated_codebooks))
    audio_tokenizer.load_pytorch_weights(str(mimi_weights), strict=True)
    cfg_coef_conditioning = None
    tts_model = TTSModel(
        model,
        audio_tokenizer,
        text_tokenizer,
        voice_repo=voice_repo,
        temp=0.6,
        cfg_coef=1,
        max_padding=8,
        initial_padding=2,
        final_padding=2,
        padding_bonus=0,
        raw_config=raw_config,
    )
    if tts_model.valid_cfg_conditionings:
        cfg_coef_conditioning = tts_model.cfg_coef
        tts_model.cfg_coef = 1.0
    else:
        cfg_coef_conditioning = None
    tts_model._cfg_coef_conditioning = cfg_coef_conditioning
    return tts_model


DEFAULT_VOICE = "expresso/ex03-ex01_happy_001_channel1_334s.wav"


def _run_tts_sync(tts_model, text: str, voice_id: str):
    """
    Run TTS for text; returns list of float32 PCM arrays (24kHz).
    voice_id can map to a voice file or use default. Falls back to default
    if the requested voice path is not available (e.g. ferni/ferni-voice.safetensors).
    """
    import numpy as np

    voice = voice_id or DEFAULT_VOICE
    cfg_coef = getattr(tts_model, "_cfg_coef_conditioning", None)
    all_entries = [tts_model.prepare_script([text])]
    if tts_model.multi_speaker:
        try:
            voices = [tts_model.get_voice_path(voice)]
        except Exception:
            # Ferni sends paths like ferni/ferni-voice.safetensors; MLX model expects
            # expresso .wav refs. Use default so we always get audio.
            voices = [tts_model.get_voice_path(DEFAULT_VOICE)]
    else:
        voices = []
    all_attributes = [tts_model.make_condition_attributes(voices, cfg_coef)]
    cfg_is_no_prefix = not (tts_model.valid_cfg_conditionings)
    cfg_is_no_text = cfg_is_no_prefix
    frames_out = []

    def on_frame(frame):
        import mlx.core as mx
        if (frame == -1).any():
            return
        _pcm = tts_model.mimi.decode_step(frame[:, :, None])
        _pcm = np.array(mx.clip(_pcm[0, 0], -1, 1))
        frames_out.append(_pcm)

    tts_model.generate(
        all_entries,
        all_attributes,
        cfg_is_no_prefix=cfg_is_no_prefix,
        cfg_is_no_text=cfg_is_no_text,
        on_frame=on_frame,
    )
    return frames_out


def _maybe_import_mlx():
    global USE_MLX
    try:
        import moshi_mlx  # noqa: F401
        USE_MLX = True
        return True
    except ImportError:
        return False


# ---------------------------------------------------------------------------
# STT handler
# ---------------------------------------------------------------------------

STT_IN_RATE = 16000
STT_OUT_RATE = 24000
STT_BLOCK_SAMPLES_24K = 1920  # one STT step
STT_BYTES_PER_BLOCK = 1280 * 2  # 1280 samples at 16k -> 1920 at 24k; 1280 * 2 bytes

STT_SAMPLE_RATE = 16000
STT_CHUNK_BYTES = 320


async def handle_stt(ws):
    """Accept binary PCM (16kHz Int16), send JSON transcript events."""
    received = 0
    interim_sent = False
    final_sent = False

    if USE_MLX and STT_MODEL is not None:
        loop = asyncio.get_event_loop()
        gen = _create_stt_gen(STT_MODEL)
        buffer = bytearray()
        full_transcript = []
        try:
            async for message in ws:
                if isinstance(message, bytes):
                    buffer.extend(message)
                else:
                    continue

                while len(buffer) >= STT_BYTES_PER_BLOCK:
                    chunk_bytes = bytes(buffer[:STT_BYTES_PER_BLOCK])
                    del buffer[:STT_BYTES_PER_BLOCK]
                    import numpy as np
                    pcm_i16 = np.frombuffer(chunk_bytes, dtype=np.int16)
                    pcm_float = pcm_i16.astype(np.float32) / 32768.0
                    audio_24k = _resample_16k_to_24k(pcm_float)
                    try:
                        text = await loop.run_in_executor(
                            _executor,
                            _run_stt_on_buffer,
                            STT_MODEL,
                            gen,
                            audio_24k,
                        )
                        if text:
                            full_transcript.append(text)
                            await ws.send(json.dumps({"text": text, "is_final": False}))
                    except Exception as e:
                        await ws.send(json.dumps({"text": "", "is_final": False, "error": str(e)}))

            if buffer:
                import numpy as np
                pcm_i16 = np.frombuffer(bytes(buffer), dtype=np.int16)
                pcm_float = pcm_i16.astype(np.float32) / 32768.0
                if len(pcm_float) > 0:
                    audio_24k = _resample_16k_to_24k(pcm_float)
                    try:
                        text = await loop.run_in_executor(
                            _executor,
                            _run_stt_on_buffer,
                            STT_MODEL,
                            gen,
                            audio_24k,
                        )
                        if text:
                            full_transcript.append(text)
                    except Exception:
                        pass
        except Exception:
            pass
        finally:
            full = "".join(full_transcript)
            try:
                await ws.send(json.dumps({"text": full, "is_final": True}))
                await ws.send(json.dumps({"vad": False, "is_speaking": False}))
            except Exception:
                pass
        return

    async for message in ws:
        if isinstance(message, bytes):
            received += len(message)
        else:
            continue

        if received >= STT_CHUNK_BYTES and not interim_sent:
            interim_sent = True
            await ws.send(json.dumps({"text": "mock", "is_final": False}))
        if received >= STT_CHUNK_BYTES and not final_sent:
            final_sent = True
            await ws.send(json.dumps({"text": "mock transcript", "is_final": True}))
            await ws.send(json.dumps({"vad": False, "is_speaking": False}))


# ---------------------------------------------------------------------------
# TTS handler
# ---------------------------------------------------------------------------

TTS_SAMPLE_RATE = 24000
TTS_CHUNK_SAMPLES = 240


async def handle_tts(ws):
    """Accept JSON { text, voice_id }, send binary PCM (24kHz Int16) then { done: true }."""
    async for message in ws:
        if isinstance(message, str):
            try:
                obj = json.loads(message)
                text = obj.get("text", "")
                voice_id = obj.get("voice_id", "")
            except json.JSONDecodeError:
                continue
        else:
            continue

        if not text:
            await ws.send(json.dumps({"done": True}))
            await ws.close()
            return

        if USE_MLX and TTS_MODEL is not None:
            loop = asyncio.get_event_loop()
            try:
                frames = await loop.run_in_executor(
                    _executor,
                    _run_tts_sync,
                    TTS_MODEL,
                    text,
                    voice_id,
                )
            except Exception as e:
                print(f"TTS error (will send no audio): {e}", flush=True)
                await ws.send(json.dumps({"done": True, "error": str(e)}))
                await ws.close()
                return
            if not frames:
                print("TTS returned no frames; sending short silence", flush=True)
                import numpy as np
                silence = np.zeros(2400, dtype=np.int16)
                await ws.send(silence.tobytes())
            for pcm_float in frames:
                import numpy as np
                pcm_i16 = (np.clip(pcm_float, -1, 1) * 32767).astype(np.int16)
                await ws.send(pcm_i16.tobytes())
            await ws.send(json.dumps({"done": True}))
            await ws.close()
            return

        pcm_chunks = [
            struct.pack(f"{TTS_CHUNK_SAMPLES}h", *([0] * TTS_CHUNK_SAMPLES))
            for _ in range(5)
        ]
        for chunk in pcm_chunks:
            await ws.send(chunk)
        await ws.send(json.dumps({"done": True}))
        await ws.close()
        return


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------

async def run_stt(port: int):
    async with serve(handle_stt, "127.0.0.1", port) as server:
        print(f"STT WebSocket: ws://127.0.0.1:{port}/api/asr-streaming", flush=True)
        await asyncio.Future()


async def run_tts(port: int):
    async with serve(handle_tts, "127.0.0.1", port) as server:
        print(f"TTS WebSocket: ws://127.0.0.1:{port}/api/tts_streaming", flush=True)
        await asyncio.Future()


def main():
    global STT_MODEL, TTS_MODEL
    parser = argparse.ArgumentParser(description="Kyutai MLX bridge (moshi-server protocol)")
    parser.add_argument("--stt-port", type=int, default=8089, help="STT WebSocket port")
    parser.add_argument("--tts-port", type=int, default=8090, help="TTS WebSocket port")
    parser.add_argument("--use-mlx", action="store_true", help="Use moshi-mlx for real inference")
    parser.add_argument("--stt-repo", type=str, default="kyutai/stt-1b-en_fr-mlx", help="HuggingFace STT model repo")
    parser.add_argument("--tts-quantize", type=int, default=8, help="TTS model quantization bits (e.g. 8)")
    args = parser.parse_args()

    if args.use_mlx:
        if not _maybe_import_mlx():
            print("--use-mlx set but moshi-mlx not installed; using mock", flush=True)
        else:
            print("Loading STT model (may download weights on first run)...", flush=True)
            try:
                STT_MODEL = _load_stt_model(args.stt_repo)
                print("STT model ready.", flush=True)
            except Exception as e:
                print(f"STT model load failed: {e}; STT will use mock.", flush=True)
            print("Loading TTS model (may download weights on first run)...", flush=True)
            try:
                TTS_MODEL = _load_tts_model(quantize=args.tts_quantize)
                print("TTS model ready.", flush=True)
            except Exception as e:
                print(f"TTS model load failed: {e}; TTS will use mock.", flush=True)

    async def run():
        await asyncio.gather(
            run_stt(args.stt_port),
            run_tts(args.tts_port),
        )

    try:
        asyncio.run(run())
    except KeyboardInterrupt:
        pass
    finally:
        _executor.shutdown(wait=False)


if __name__ == "__main__":
    main()
