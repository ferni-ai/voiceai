"""
Autoregressive audio generation for Higgs Audio V2 on MLX.

Handles the full TTS pipeline:
  1. Tokenize text input
  2. Forward through model in text mode until <|audio_out_bos|>
  3. Switch to audio mode, generating 8-codebook tokens per step
  4. Apply delay pattern (codebook i offset by i positions)
  5. Decode audio tokens via xcodec to 24kHz PCM

Reference: apps/rust-higgs-pipeline/src/tts/generation.rs
"""

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import mlx.core as mx
import numpy as np

from model import HiggsAudioModel, HiggsAudioConfig


@dataclass
class GenerationConfig:
    max_audio_tokens: int = 1500
    temperature: float = 0.3
    top_p: float = 0.95
    top_k: int = 50
    repetition_penalty: float = 1.0


def sample_top_k_top_p(logits: mx.array, temperature: float, top_k: int, top_p: float) -> int:
    """Combined top-k + top-p sampling with temperature."""
    logits_f32 = logits.astype(mx.float32)
    mx.eval(logits_f32)
    logits_np = np.array(logits_f32)

    # Apply temperature
    if temperature != 1.0:
        logits_np = logits_np / temperature

    # Sort descending for top-k
    sorted_indices = np.argsort(-logits_np)
    k = min(top_k, len(logits_np)) if top_k > 0 else len(logits_np)
    top_k_indices = sorted_indices[:k]
    top_k_logits = logits_np[top_k_indices]

    # Softmax over top-k
    max_logit = top_k_logits[0]
    probs = np.exp(top_k_logits - max_logit)
    probs /= probs.sum()

    # Top-p nucleus
    cumsum = np.cumsum(probs)
    nucleus_size = int(np.searchsorted(cumsum, top_p)) + 1
    nucleus_size = min(nucleus_size, len(probs))

    # Renormalize and sample
    nucleus_probs = probs[:nucleus_size]
    nucleus_probs /= nucleus_probs.sum()
    nucleus_indices = top_k_indices[:nucleus_size]

    chosen = np.random.choice(nucleus_indices, p=nucleus_probs)
    return int(chosen)


def generate_audio(
    model: HiggsAudioModel,
    text_tokens: list[int],
    gen_config: GenerationConfig,
    decoder=None,
) -> dict:
    """Generate audio from text tokens.

    Returns dict with 'codes' (aligned codebook sequences) and 'stats'.
    """
    config = model.config
    num_codebooks = config.audio_num_codebooks
    audio_out_bos = config.audio_out_bos_token_id
    stream_bos = config.audio_stream_bos_id
    stream_eos = config.audio_stream_eos_id

    model.reset_caches()

    # ── Phase 1: Text prefill ──
    t0 = time.time()
    text_ids = mx.array([text_tokens])
    text_embeds = model.embed_text(text_ids)
    hidden = model.forward(text_embeds, audio_mask=None)
    mx.eval(hidden)
    prefill_ms = (time.time() - t0) * 1000
    print(f"Text prefill: {len(text_tokens)} tokens in {prefill_ms:.0f}ms "
          f"({prefill_ms/len(text_tokens):.1f}ms/tok)")

    # Get text logits from last position
    last_hidden = hidden[:, -1:, :]
    text_logits = model.text_logits(last_hidden)
    mx.eval(text_logits)
    next_token = int(mx.argmax(text_logits.reshape(-1)).item())

    if next_token != audio_out_bos:
        print(f"Model predicted token {next_token}, forcing audio_out_bos={audio_out_bos}")
    else:
        print("Model naturally predicted audio_out_bos")

    # Feed audio_out_bos
    bos_ids = mx.array([[audio_out_bos]])
    bos_embed = model.embed_text(bos_ids)
    _ = model.forward(bos_embed, audio_mask=None)

    # ── Phase 2: Audio generation with delay pattern ──
    t_gen = time.time()
    raw_codes = [[] for _ in range(num_codebooks)]
    audio_steps = 0
    num_remaining_delays = None
    audio_mask = mx.ones((1, 1), dtype=mx.uint8)

    while audio_steps < gen_config.max_audio_tokens:
        step_start = time.time()

        # Prepare input embedding
        codes_for_embed = []
        for cb in range(num_codebooks):
            if audio_steps == 0:
                codes_for_embed.append(stream_bos)
            elif raw_codes[cb]:
                codes_for_embed.append(raw_codes[cb][-1])
            else:
                codes_for_embed.append(stream_bos)

        audio_embed = model.embed_audio_codes(codes_for_embed)
        hidden = model.forward(audio_embed, audio_mask=audio_mask)

        # Get audio logits: (1, 1, num_codebooks, vocab_per_cb)
        logits = model.audio_logits(hidden)
        logits = logits[0, 0]  # (num_codebooks, vocab_per_cb)
        mx.eval(logits)

        # Sample each codebook
        step_codes = []
        for cb in range(num_codebooks):
            if audio_steps < cb:
                step_codes.append(stream_bos)
                continue

            cb_logits = logits[cb]
            if gen_config.temperature <= 0.0:
                code = int(mx.argmax(cb_logits).item())
            else:
                code = sample_top_k_top_p(
                    cb_logits, gen_config.temperature,
                    gen_config.top_k, gen_config.top_p,
                )
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
            print(f"  CB0 EOS at step {audio_steps + 1}, cascade {num_remaining_delays} more")

        for cb, code in enumerate(step_codes):
            raw_codes[cb].append(code)
        audio_steps += 1

        step_ms = (time.time() - step_start) * 1000
        if audio_steps <= 3 or audio_steps % 50 == 0:
            total_ms = (time.time() - t_gen) * 1000
            avg_ms = total_ms / audio_steps
            tps = 1000.0 / avg_ms if avg_ms > 0 else 0
            print(f"  Step {audio_steps}: {step_ms:.1f}ms (avg {avg_ms:.1f}ms, {tps:.1f} tok/s)")

        if should_terminate:
            print(f"  EOS cascade complete at step {audio_steps}")
            break

    gen_ms = (time.time() - t_gen) * 1000
    total_ms = (time.time() - t0) * 1000
    tps = audio_steps / (gen_ms / 1000) if gen_ms > 0 else 0

    print(f"\nGeneration complete:")
    print(f"  {audio_steps} audio tokens in {gen_ms:.0f}ms ({tps:.1f} tok/s)")
    print(f"  Total time: {total_ms:.0f}ms")
    print(f"  Audio duration: ~{audio_steps * 40 / 1000:.1f}s (at 25fps)")
    print(f"  Real-time factor: {gen_ms / (audio_steps * 40):.2f}x" if audio_steps > 0 else "")

    # Revert delay pattern
    aligned = revert_delay_pattern(raw_codes, num_codebooks)

    return {
        "codes": aligned,
        "raw_steps": audio_steps,
        "stats": {
            "prefill_ms": prefill_ms,
            "gen_ms": gen_ms,
            "total_ms": total_ms,
            "tokens_per_sec": tps,
            "audio_duration_s": audio_steps * 0.04,
            "rtf": gen_ms / (audio_steps * 40) if audio_steps > 0 else 0,
        },
    }


def revert_delay_pattern(raw_codes: list[list[int]], num_codebooks: int) -> list[list[int]]:
    """Revert the delay pattern to align all codebooks."""
    if not raw_codes or not raw_codes[0]:
        return [[] for _ in range(num_codebooks)]

    raw_len = len(raw_codes[0])
    common_len = raw_len - (num_codebooks - 1)
    if common_len <= 0:
        return [[] for _ in range(num_codebooks)]

    aligned = []
    for cb in range(num_codebooks):
        codes = []
        for c in raw_codes[cb][cb:cb + common_len]:
            if c >= 1024:
                break
            codes.append(c)
        aligned.append(codes)

    min_len = min(len(c) for c in aligned)
    return [c[:min_len] for c in aligned]


# ─── xCodec ONNX Decoder ──────────────────────────────────────


class XCodecDecoder:
    """xCodec audio decoder via ONNX Runtime."""

    def __init__(self, model_path: Path, num_codebooks: int = 8):
        import onnxruntime as ort
        print(f"Loading xCodec ONNX decoder from {model_path}...")
        self.session = ort.InferenceSession(
            str(model_path),
            providers=["CoreMLExecutionProvider", "CPUExecutionProvider"],
        )
        self.num_codebooks = num_codebooks
        print("xCodec decoder loaded.")

    def decode(self, codes: list[list[int]]) -> np.ndarray:
        """Decode aligned codebook sequences to PCM f32 audio at 24kHz."""
        if not codes or not codes[0]:
            return np.array([], dtype=np.float32)

        time_steps = min(len(c) for c in codes)
        flat = np.zeros((1, self.num_codebooks, time_steps), dtype=np.int64)
        for cb in range(self.num_codebooks):
            for t in range(time_steps):
                flat[0, cb, t] = codes[cb][t] if t < len(codes[cb]) else 0

        result = self.session.run(None, {"codes": flat})
        return result[0].flatten().astype(np.float32)


# ─── Tokenizer Helper ─────────────────────────────────────────


def build_text_tokens(text: str, tokenizer_path: Path, config: HiggsAudioConfig) -> list[int]:
    """Build the full token sequence for TTS generation.

    Format (from reference code):
    <|begin_of_text|> system_prompt <|audio_out_bos|> text <|eot_id|>

    The system prompt tells the model to generate audio.
    """
    import json

    # Load tokenizer
    with open(tokenizer_path) as f:
        tokenizer_data = json.load(f)

    # Build a simple token lookup from the tokenizer vocab
    vocab = tokenizer_data.get("model", {}).get("vocab", {})

    # For Higgs, use the text_config's bos_token_id
    bos_token_id = config.text_config.bos_token_id  # 128000

    # System prompt (from reference code)
    system_prompt = (
        "Generate audio following instruction.\n\n"
        "<|scene_desc_start|>\nAudio is recorded from a quiet room.\n<|scene_desc_end|>"
    )

    # We need to tokenize the text. Since we don't have a full tokenizer lib,
    # use a simple approach: encode with the tokenizer's byte-pair encoding
    # For now, use a basic approach that works with the HF tokenizer format

    # Actually, let's just use the tokenizers library
    try:
        from tokenizers import Tokenizer
        tokenizer = Tokenizer.from_file(str(tokenizer_path))

        # Build the full prompt
        # Format: <|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n{system_prompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{text}<|eot_id|>
        full_prompt = (
            f"<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n"
            f"{system_prompt}<|eot_id|>"
            f"<|start_header_id|>user<|end_header_id|>\n\n"
            f"{text}<|eot_id|>"
        )

        encoding = tokenizer.encode(full_prompt)
        return encoding.ids

    except ImportError:
        # Fallback: manual token construction
        print("Warning: 'tokenizers' not installed, using fallback tokenization")

        # Just use the bos token + a simple encoding
        # This won't produce great results but lets us test the pipeline
        tokens = [bos_token_id]
        for char in text:
            # Rough byte-level encoding
            for b in char.encode("utf-8"):
                if b < len(vocab):
                    tokens.append(b)
        return tokens


# ─── Main Entry Point ─────────────────────────────────────────


def main():
    import argparse
    import struct
    import wave

    parser = argparse.ArgumentParser(description="Higgs Audio V2 TTS on MLX")
    parser.add_argument("--model-dir", type=str,
                        default="../../models/higgs-audio-v2",
                        help="Path to model directory")
    parser.add_argument("--text", type=str,
                        default="The sun rises in the east and sets in the west.",
                        help="Text to synthesize")
    parser.add_argument("--output", type=str, default="output.wav",
                        help="Output WAV file path")
    parser.add_argument("--temperature", type=float, default=0.3)
    parser.add_argument("--top-k", type=int, default=50)
    parser.add_argument("--top-p", type=float, default=0.95)
    parser.add_argument("--max-tokens", type=int, default=750)
    parser.add_argument("--dtype", type=str, default="bfloat16",
                        choices=["bfloat16", "float16", "float32"])
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    dtype_map = {"bfloat16": mx.bfloat16, "float16": mx.float16, "float32": mx.float32}
    dtype = dtype_map[args.dtype]

    # Load config
    print(f"Loading config from {model_dir / 'config.json'}...")
    from model import load_config, load_weights
    config = load_config(model_dir / "config.json")
    print(f"  Model: {config.text_config.num_hidden_layers} layers, "
          f"{config.text_config.hidden_size} hidden, "
          f"{config.audio_num_codebooks} codebooks")

    # Create model
    print("Creating model...")
    model = HiggsAudioModel(config)

    # Load weights
    print(f"Loading weights ({args.dtype})...")
    t0 = time.time()
    load_weights(model, model_dir, dtype=dtype)
    load_ms = (time.time() - t0) * 1000
    print(f"  Weights loaded in {load_ms:.0f}ms")

    # Tokenize text
    tokenizer_path = model_dir / "tokenizer.json"
    print(f"\nTokenizing: \"{args.text}\"")
    text_tokens = build_text_tokens(args.text, tokenizer_path, config)
    print(f"  {len(text_tokens)} tokens")

    # Generate
    gen_config = GenerationConfig(
        max_audio_tokens=args.max_tokens,
        temperature=args.temperature,
        top_k=args.top_k,
        top_p=args.top_p,
    )

    # Load xCodec decoder
    xcodec_path = model_dir / "xcodec_decoder.onnx"
    decoder = None
    if xcodec_path.exists():
        decoder = XCodecDecoder(xcodec_path, config.audio_num_codebooks)

    print(f"\nGenerating audio (max {args.max_tokens} tokens, temp={args.temperature})...")
    result = generate_audio(model, text_tokens, gen_config, decoder)

    # Decode to audio
    if decoder and result["codes"] and result["codes"][0]:
        print(f"\nDecoding {len(result['codes'][0])} aligned frames to audio...")
        audio = decoder.decode(result["codes"])
        print(f"  {len(audio)} samples ({len(audio)/24000:.2f}s at 24kHz)")

        # Save WAV
        output_path = Path(args.output)
        with wave.open(str(output_path), "w") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(24000)
            # Convert f32 to int16
            audio_clipped = np.clip(audio, -1.0, 1.0)
            audio_int16 = (audio_clipped * 32767).astype(np.int16)
            wf.writeframes(audio_int16.tobytes())
        print(f"  Saved to {output_path}")
    else:
        print("No audio generated or no decoder available.")

    print(f"\n=== Summary ===")
    stats = result["stats"]
    print(f"  Prefill: {stats['prefill_ms']:.0f}ms")
    print(f"  Generation: {stats['gen_ms']:.0f}ms ({stats['tokens_per_sec']:.1f} tok/s)")
    print(f"  Audio: {stats['audio_duration_s']:.1f}s")
    print(f"  RTF: {stats['rtf']:.2f}x (< 1.0 = faster than real-time)")
    print(f"  Total: {stats['total_ms']:.0f}ms")


if __name__ == "__main__":
    main()
