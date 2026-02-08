"""
Full Qwen3-Omni pipeline: raw audio (16 kHz) → 24 kHz waveform.

Mel → AuT → Thinker (layer-18 hidden) → Talker (codec logits) → argmax → Code2Wav → waveform.
Reference: apps/rust-perf/src/full_omni_pipeline.rs
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator, Optional

import mlx.core as mx
import numpy as np

from mlx_qwen3_omni.audio.mel import MelSpectrogram
from mlx_qwen3_omni.encoders.audio import AudioEncoderConfig, Qwen3OmniAudioEncoder
from mlx_qwen3_omni.thinker import Qwen3OmniThinker
from mlx_qwen3_omni.talker import Qwen3OmniTalker, TalkerConfig
from mlx_qwen3_omni.code2wav import Qwen3OmniCode2Wav, Code2WavConfig


def load_pipeline(
    model_path: Path | str,
    load_talker: bool = True,
    load_code2wav: bool = True,
) -> "FullOmniPipeline":
    """Load Thinker, optional AuT, optional Talker, optional Code2Wav from model dir."""
    from mlx_qwen3_omni.generate import load_model_and_config

    model_path = Path(model_path)
    model, config, audio_encoder = load_model_and_config(
        model_path, load_audio_encoder=True
    )
    mel = MelSpectrogram()
    talker = None
    code2wav = None
    talker_config = config.get("talker_config") or config
    if load_talker:
        talker_cfg = TalkerConfig.from_dict(talker_config)
        talker = Qwen3OmniTalker(talker_cfg)
        weights = dict(mx.load(str(model_path / "model.safetensors")))
        talker_keys = {k[len("talker."):]: v for k, v in weights.items() if k.startswith("talker.")}
        if talker_keys:
            talker.load_weights(list(talker_keys.items()), strict=False)
            mx.eval(talker.parameters())
    if load_code2wav:
        c2w_config = config.get("code2wav_config") or {}
        if isinstance(c2w_config, dict):
            c2w_config = Code2WavConfig.from_dict(c2w_config)
        else:
            c2w_config = Code2WavConfig()
        code2wav = Qwen3OmniCode2Wav(c2w_config)
        weights = dict(mx.load(str(model_path / "model.safetensors")))
        c2w_keys = {k[len("code2wav."):]: v for k, v in weights.items() if k.startswith("code2wav.")}
        if c2w_keys:
            code2wav.load_weights(list(c2w_keys.items()), strict=False)
            mx.eval(code2wav.parameters())
    accept_layer = (talker_config.get("accept_hidden_layer", 18) if isinstance(talker_config, dict) else 18)
    return FullOmniPipeline(
        mel=mel,
        audio_encoder=audio_encoder,
        thinker=model,
        talker=talker,
        code2wav=code2wav,
        accept_hidden_layer=accept_layer,
    )


class FullOmniPipeline:
    """
    Full pipeline: raw audio (16 kHz mono) → 24 kHz waveform.

    Mel → AuT → Thinker (hidden at layer 18) → Talker → codec tokens → Code2Wav.
    """

    def __init__(
        self,
        mel: MelSpectrogram,
        audio_encoder: Optional[Qwen3OmniAudioEncoder],
        thinker: Qwen3OmniThinker,
        talker: Optional[Qwen3OmniTalker] = None,
        code2wav: Optional[Qwen3OmniCode2Wav] = None,
        accept_hidden_layer: int = 18,
    ) -> None:
        self.mel = mel
        self.audio_encoder = audio_encoder
        self.thinker = thinker
        self.talker = talker
        self.code2wav = code2wav
        self.accept_hidden_layer = accept_hidden_layer

    def process_audio(
        self,
        samples: np.ndarray | list[float],
        stream: bool = False,
    ) -> np.ndarray | Iterator[np.ndarray]:
        """
        Raw audio (16 kHz mono float32) → 24 kHz waveform.

        If stream=True, yields audio chunks as they're generated (when Talker+Code2Wav loaded).
        Otherwise returns full waveform.
        """
        if len(samples) == 0:
            return np.array([], dtype=np.float32)
        samples = np.asarray(samples, dtype=np.float32)
        if samples.ndim != 1:
            raise ValueError("samples must be 1D (mono)")

        mel_np = self.mel.compute(samples)
        mel_mx = mx.array(mel_np)
        if self.audio_encoder is None:
            raise RuntimeError("Audio encoder not loaded; cannot process audio")
        audio_features = self.audio_encoder(mel_mx)

        input_ids = mx.array([[0]], dtype=mx.int32)
        logits, hidden_18 = self.thinker.forward_with_hidden_states(
            input_ids,
            cache=None,
            audio_features=audio_features,
            extract_layer=self.accept_hidden_layer,
        )
        if self.talker is None or self.code2wav is None:
            return np.array([], dtype=np.float32)

        codec_logits = self.talker(hidden_18)
        codec_tokens = mx.argmax(codec_logits, axis=-1)
        waveform = self.code2wav(codec_tokens)
        out = np.array(waveform, dtype=np.float32).ravel()
        if stream:
            chunk_size = 4096
            for start in range(0, out.size, chunk_size):
                yield out[start : start + chunk_size]
            return  # generator exhausted
        return out


def run_pipeline_cli(model_path: str, audio_path: str, output_path: str) -> None:
    """CLI: load pipeline, process audio file, write 24 kHz wav."""
    from scipy.io import wavfile

    pipeline = load_pipeline(model_path, load_talker=True, load_code2wav=True)
    from mlx_qwen3_omni.generate import _load_audio_16k_mono
    samples = _load_audio_16k_mono(Path(audio_path))
    waveform = pipeline.process_audio(samples)
    waveform = np.asarray(waveform, dtype=np.float32)
    rate = pipeline.code2wav.sample_rate if pipeline.code2wav else 24_000
    wavfile.write(output_path, rate, waveform)
