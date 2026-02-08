"""
Text generation entrypoint for Qwen3-Omni Thinker (MLX).

Usage:
    python -m mlx_qwen3_omni.generate --model ./mlx_thinker --prompt "Hello, world."
    python -m mlx_qwen3_omni.generate --model ./mlx_thinker --prompt "What did I say?" --audio speech.wav
    # Tokenizer: either in model dir (from convert) or --tokenizer <path|HF repo>
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path
from typing import Optional

import mlx.core as mx
import numpy as np

from mlx_qwen3_omni.thinker import Qwen3OmniThinker

LOG = logging.getLogger(__name__)


def _load_audio_16k_mono(path: Path) -> np.ndarray:
    """Load audio file and return 16 kHz mono float32 samples."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {path}")
    suffix = path.suffix.lower()
    if suffix == ".wav":
        try:
            import wave
            with wave.open(str(path), "rb") as w:
                nch = w.getnchannels()
                sr = w.getframerate()
                n = w.getnframes()
                raw = w.readframes(n)
            import struct
            fmt = "<" + "h" * (n * nch)
            samples = np.array(struct.unpack(fmt, raw), dtype=np.float32) / 32768.0
            if nch == 2:
                samples = (samples[::2] + samples[1::2]) / 2.0
            if sr != 16000:
                # Simple resample: linear interpolation
                from scipy import signal
                num = int(len(samples) * 16000 / sr)
                samples = signal.resample(samples, num).astype(np.float32)
            return samples
        except Exception as e:
            raise RuntimeError(f"Failed to load wav {path}: {e}") from e
    try:
        from scipy.io import wavfile
        sr, data = wavfile.read(str(path))
        if data.dtype != np.float32:
            data = data.astype(np.float32) / (np.iinfo(data.dtype).max or 1)
        if data.ndim > 1:
            data = data.mean(axis=1)
        if sr != 16000:
            from scipy import signal
            data = signal.resample(data, int(len(data) * 16000 / sr)).astype(np.float32)
        return data
    except ImportError:
        raise ImportError("Install scipy for audio loading: pip install scipy") from None


def load_model_and_config(
    model_path: Path,
    load_audio_encoder: bool = False,
) -> tuple[Qwen3OmniThinker, dict, Optional[any]]:
    """Load Thinker and config; optionally load audio encoder if weights present."""
    config_path = model_path / "thinker_config.json"
    weights_path = model_path / "model.safetensors"
    if not config_path.exists():
        raise FileNotFoundError(f"Config not found: {config_path}")
    if not weights_path.exists():
        raise FileNotFoundError(f"Weights not found: {weights_path}")

    with open(config_path) as f:
        thinker_config = json.load(f)

    weights = dict(mx.load(str(weights_path)))
    thinker_keys = {k: v for k, v in weights.items() if not k.startswith("audio_encoder.")}
    model = Qwen3OmniThinker(thinker_config)
    model.load_weights(list(thinker_keys.items()), strict=False)
    mx.eval(model.parameters())

    audio_encoder = None
    if load_audio_encoder:
        audio_keys = {k[len("audio_encoder."):]: v for k, v in weights.items() if k.startswith("audio_encoder.")}
        if audio_keys:
            from mlx_qwen3_omni.encoders.audio import AudioEncoderConfig, Qwen3OmniAudioEncoder
            audio_config = AudioEncoderConfig.from_dict(thinker_config)
            audio_encoder = Qwen3OmniAudioEncoder(audio_config)
            audio_encoder.load_weights(list(audio_keys.items()), strict=False)
            mx.eval(audio_encoder.parameters())
            LOG.info("Loaded audio encoder (%d keys)", len(audio_keys))
        else:
            LOG.warning("--audio requested but no audio_encoder.* weights in checkpoint")

    return model, thinker_config, audio_encoder


def load_tokenizer(model_path: Path, tokenizer_path: str | None = None):
    """Load tokenizer from model_path or tokenizer_path (HF repo or path)."""
    try:
        from transformers import AutoTokenizer
    except ImportError:
        raise ImportError("Install transformers to use generate: pip install transformers")

    path = tokenizer_path or str(model_path)
    # If model_path has tokenizer files, use it; else use as HF repo id
    if (model_path / "tokenizer.json").exists() or (model_path / "tokenizer_config.json").exists():
        return AutoTokenizer.from_pretrained(str(model_path), trust_remote_code=True)
    return AutoTokenizer.from_pretrained(path, trust_remote_code=True)


def sample(logits: mx.array, temperature: float = 0.6) -> mx.array:
    """Sample next token from logits (last position). Returns shape (1,) for input_ids."""
    logits = logits[:, -1, :]
    if temperature > 0:
        logits = logits / temperature
        probs = mx.softmax(logits, axis=-1)
        out = mx.random.categorical(probs)
    else:
        out = mx.argmax(logits, axis=-1)
    return mx.reshape(out, (-1,))


def generate(
    model: Qwen3OmniThinker,
    tokenizer,
    prompt: str,
    max_new_tokens: int = 256,
    temperature: float = 0.6,
    eos_token_id: int | None = None,
    audio_features: Optional[mx.array] = None,
) -> str:
    """Autoregressive generation. Returns decoded text. Optional audio_features (1, seq, 2048) for audio-in."""
    if max_new_tokens <= 0:
        ids = tokenizer.encode(prompt, add_special_tokens=True)
        if hasattr(ids, "tolist"):
            ids = ids.tolist()
        return tokenizer.decode(ids, skip_special_tokens=True)

    messages = [{"role": "user", "content": prompt}]
    if hasattr(tokenizer, "apply_chat_template"):
        text = tokenizer.apply_chat_template(
            messages, add_generation_prompt=True, tokenize=False
        )
    else:
        text = prompt
    if not text or not text.strip():
        text = prompt or " "
    encoded = tokenizer(text, return_tensors="np")
    input_ids = mx.array(encoded["input_ids"])
    if input_ids.size == 0:
        raise ValueError("Tokenized input is empty; check prompt and tokenizer.")

    cache = model.make_cache()
    generated = list(input_ids[0].tolist())
    eos = eos_token_id
    if eos is None and hasattr(tokenizer, "eos_token_id"):
        eos = getattr(tokenizer, "eos_token_id", None)

    for _ in range(max_new_tokens):
        logits = model(input_ids, cache=cache, audio_features=audio_features)
        next_token = sample(logits, temperature)
        next_id = int(mx.squeeze(next_token).item())
        generated.append(next_id)
        if eos is not None and next_id == eos:
            break
        input_ids = mx.reshape(next_token, (1, 1))
        audio_features = None  # only first step uses audio
        for c in cache:
            if c.keys is not None:
                mx.eval(c.keys)
            if c.values is not None:
                mx.eval(c.values)

    return tokenizer.decode(generated, skip_special_tokens=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate text with Qwen3-Omni Thinker (MLX)"
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
        "--prompt",
        "-p",
        default="Hello, world.",
        help="Text prompt (default: Hello, world.)",
    )
    parser.add_argument(
        "--max-tokens",
        type=int,
        default=256,
        help="Max new tokens (default: 256)",
    )
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.6,
        help="Sampling temperature (default: 0.6)",
    )
    parser.add_argument(
        "--audio",
        "-a",
        default=None,
        metavar="PATH",
        help="Audio file (16 kHz mono wav or resampled) for audio-in generation",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable logging",
    )
    args = parser.parse_args()
    if args.verbose:
        logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    model_path = Path(args.model)
    if not model_path.exists():
        raise FileNotFoundError(f"Model path not found: {model_path}")

    load_audio_enc = args.audio is not None
    model, config, audio_encoder = load_model_and_config(model_path, load_audio_encoder=load_audio_enc)
    tokenizer = load_tokenizer(model_path, args.tokenizer)

    audio_features = None
    if args.audio:
        from mlx_qwen3_omni.audio.mel import MelSpectrogram
        if audio_encoder is None:
            raise RuntimeError("No audio encoder weights in checkpoint; cannot use --audio")
        samples = _load_audio_16k_mono(Path(args.audio))
        mel = MelSpectrogram()
        mel_np = mel.compute(samples)
        mel_mx = mx.array(mel_np)
        audio_features = audio_encoder(mel_mx)

    text_cfg = config.get("text_config") if isinstance(config.get("text_config"), dict) else {}
    eos = text_cfg.get("eos_token_id") or config.get("eos_token_id")

    out = generate(
        model,
        tokenizer,
        args.prompt,
        max_new_tokens=args.max_tokens,
        temperature=args.temperature,
        eos_token_id=eos,
        audio_features=audio_features,
    )
    if args.verbose:
        LOG.info("Generation complete")
    print(out)


if __name__ == "__main__":
    main()
