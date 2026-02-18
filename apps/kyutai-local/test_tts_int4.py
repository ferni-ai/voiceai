"""Test Kyutai TTS MLX with INT4 quantization."""

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

mx.random.seed(299792458)

print("[TTS] Loading model INT4...")
t0 = time.time()

raw_config_path = hf_get("config.json", DEFAULT_DSM_TTS_REPO)
with open(hf_get(raw_config_path), "r") as f:
    raw_config = json.load(f)

mimi_weights = hf_get(raw_config["mimi_name"], DEFAULT_DSM_TTS_REPO)
moshi_weights = hf_get(raw_config.get("moshi_name", "model.safetensors"), DEFAULT_DSM_TTS_REPO)
tokenizer_path = hf_get(raw_config["tokenizer_name"], DEFAULT_DSM_TTS_REPO)

lm_config = models.LmConfig.from_config_dict(raw_config)
lm_config.transformer.max_seq_len = lm_config.transformer.context
model = models.Lm(lm_config)
model.set_dtype(mx.bfloat16)
model.load_pytorch_weights(str(moshi_weights), lm_config, strict=True)

nn.quantize(model.depformer, bits=4)
for layer in model.transformer.layers:
    nn.quantize(layer.self_attn, bits=4)
    nn.quantize(layer.gating, bits=4)

text_tokenizer = sentencepiece.SentencePieceProcessor(str(tokenizer_path))
generated_codebooks = lm_config.generated_codebooks
audio_tokenizer = models.mimi.Mimi(models.mimi_202407(generated_codebooks))
audio_tokenizer.load_pytorch_weights(str(mimi_weights), strict=True)

tts_model = TTSModel(
    model, audio_tokenizer, text_tokenizer,
    voice_repo=DEFAULT_DSM_TTS_VOICE_REPO, temp=0.6, cfg_coef=1,
    max_padding=8, initial_padding=2, final_padding=2, padding_bonus=0,
    raw_config=raw_config,
)

if tts_model.valid_cfg_conditionings:
    cfg_coef_conditioning = tts_model.cfg_coef
    tts_model.cfg_coef = 1.0
    cfg_no_text = False
    cfg_no_prefix = False
else:
    cfg_coef_conditioning = None
    cfg_no_text = True
    cfg_no_prefix = True

print(f"[TTS] Loaded in {time.time()-t0:.1f}s")

sentences = [
    "Hey there! How are you doing today?",
    "I have been feeling a little overwhelmed with work lately.",
    "That sounds like a great idea. Let me know when you want to get started.",
]
voice = "expresso/ex03-ex01_happy_001_channel1_334s.wav"

for i, text in enumerate(sentences):
    all_entries = [tts_model.prepare_script([text])]
    if tts_model.multi_speaker:
        voices = [tts_model.get_voice_path(voice)]
    else:
        voices = []
    all_attributes = [tts_model.make_condition_attributes(voices, cfg_coef_conditioning)]

    wav_frames = []
    first_frame_time = [None]  # Use list for closure

    def on_frame(frame, _fft=first_frame_time, _wf=wav_frames):
        if (frame == -1).any():
            return
        pcm = tts_model.mimi.decode_step(frame[:, :, None])
        pcm = np.array(mx.clip(pcm[0, 0], -1, 1))
        _wf.append(pcm)
        if _fft[0] is None:
            _fft[0] = time.time()

    gen_start = time.time()
    tts_model.generate(
        all_entries, all_attributes,
        cfg_is_no_prefix=cfg_no_prefix, cfg_is_no_text=cfg_no_text,
        on_frame=on_frame,
    )
    gen_time = time.time() - gen_start

    if wav_frames:
        audio = np.concatenate(wav_frames, axis=-1)
        dur = len(audio) / tts_model.mimi.sample_rate
        ttfb = (first_frame_time[0] - gen_start) * 1000 if first_frame_time[0] else 0
        speed = dur / gen_time
        print(f'  [{i+1}] "{text[:60]}" -> {dur:.1f}s, {speed:.2f}x RT, TTFB={ttfb:.0f}ms')
        sphn.write_wav(f"tts_int4_{i}.wav", audio, tts_model.mimi.sample_rate)
    else:
        print(f"  [{i+1}] No audio!")
