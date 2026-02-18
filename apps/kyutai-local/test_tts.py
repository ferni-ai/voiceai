"""Test Kyutai TTS MLX inference."""

import json
import time
import numpy as np
import mlx.core as mx
import mlx.nn as nn
import sentencepiece
import sphn
from moshi_mlx import models
from moshi_mlx.models.tts import TTSModel, DEFAULT_DSM_TTS_REPO, DEFAULT_DSM_TTS_VOICE_REPO
from moshi_mlx.utils.loaders import hf_get


def main():
    quantize_bits = 8  # INT8 quantization for speed

    print(f"[TTS] Loading model from {DEFAULT_DSM_TTS_REPO} (INT{quantize_bits})")
    t0 = time.time()

    raw_config_path = hf_get("config.json", DEFAULT_DSM_TTS_REPO)
    with open(hf_get(raw_config_path), "r") as f:
        raw_config = json.load(f)

    mimi_weights = hf_get(raw_config["mimi_name"], DEFAULT_DSM_TTS_REPO)
    moshi_name = raw_config.get("moshi_name", "model.safetensors")
    moshi_weights = hf_get(moshi_name, DEFAULT_DSM_TTS_REPO)
    tokenizer_path = hf_get(raw_config["tokenizer_name"], DEFAULT_DSM_TTS_REPO)

    lm_config = models.LmConfig.from_config_dict(raw_config)
    lm_config.transformer.max_seq_len = lm_config.transformer.context

    model = models.Lm(lm_config)
    model.set_dtype(mx.bfloat16)
    print(f"[TTS] Loading weights...")
    model.load_pytorch_weights(str(moshi_weights), lm_config, strict=True)

    if quantize_bits:
        print(f"[TTS] Quantizing to INT{quantize_bits}...")
        nn.quantize(model.depformer, bits=quantize_bits)
        for layer in model.transformer.layers:
            nn.quantize(layer.self_attn, bits=quantize_bits)
            nn.quantize(layer.gating, bits=quantize_bits)

    text_tokenizer = sentencepiece.SentencePieceProcessor(str(tokenizer_path))

    generated_codebooks = lm_config.generated_codebooks
    audio_tokenizer = models.mimi.Mimi(models.mimi_202407(generated_codebooks))
    audio_tokenizer.load_pytorch_weights(str(mimi_weights), strict=True)

    tts_model = TTSModel(
        model,
        audio_tokenizer,
        text_tokenizer,
        voice_repo=DEFAULT_DSM_TTS_VOICE_REPO,
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
        cfg_is_no_text = False
        cfg_is_no_prefix = False
    else:
        cfg_is_no_text = True
        cfg_is_no_prefix = True

    load_time = time.time() - t0
    print(f"[TTS] Model loaded in {load_time:.1f}s")

    # Generate audio for a test sentence
    text = "Hey there! I had the most amazing day today. Let me tell you all about it."
    voice = "expresso/ex03-ex01_happy_001_channel1_334s.wav"

    print(f"\n[TTS] Generating: \"{text}\"")
    print(f"[TTS] Voice: {voice}")

    all_entries = [tts_model.prepare_script([text])]
    if tts_model.multi_speaker:
        voices = [tts_model.get_voice_path(voice)]
    else:
        voices = []
    all_attributes = [tts_model.make_condition_attributes(voices, cfg_coef_conditioning if tts_model.valid_cfg_conditionings else None)]

    frames = []
    frame_count = 0
    first_frame_time = None

    def on_frame(frame):
        nonlocal frame_count, first_frame_time
        if (frame == -1).any():
            return
        pcm = tts_model.mimi.decode_step(frame[:, :, None])
        pcm = np.array(mx.clip(pcm[0, 0], -1, 1))
        frames.append(pcm)
        frame_count += 1
        if first_frame_time is None:
            first_frame_time = time.time()

    gen_start = time.time()
    result = tts_model.generate(
        all_entries,
        all_attributes,
        cfg_is_no_prefix=cfg_is_no_prefix,
        cfg_is_no_text=cfg_is_no_text,
        on_frame=on_frame,
    )
    gen_time = time.time() - gen_start

    if frames:
        audio = np.concatenate(frames, axis=-1)
        audio_duration = len(audio) / tts_model.mimi.sample_rate
        ttfb = (first_frame_time - gen_start) * 1000 if first_frame_time else None

        print(f"\n[TTS] Results:")
        print(f"  Audio duration: {audio_duration:.2f}s")
        print(f"  Generation time: {gen_time:.2f}s")
        print(f"  Speed: {audio_duration/gen_time:.2f}x real-time")
        print(f"  TTFB: {ttfb:.0f}ms" if ttfb else "  TTFB: N/A")
        print(f"  Frames: {frame_count}")
        print(f"  Sample rate: {tts_model.mimi.sample_rate}Hz")

        # Save to file
        out_path = "test_tts_output.wav"
        sphn.write_wav(out_path, audio, tts_model.mimi.sample_rate)
        print(f"  Saved to: {out_path}")
    else:
        print("[TTS] No audio generated!")


if __name__ == "__main__":
    mx.random.seed(299792458)
    main()
