"""
Benchmark Higgs Audio V2 on MLX with various dtypes and quantization levels.

Tests: BFloat16, Float16, INT8, INT4
Reports: tok/s, RTF, TTFB, memory usage
"""

import time
import gc
from pathlib import Path

import mlx.core as mx
import numpy as np


def benchmark_dtype(model_dir: Path, dtype, dtype_name: str, max_tokens: int = 200):
    """Run a single benchmark with the given dtype."""
    from model import load_config, load_weights, HiggsAudioModel
    from generate import build_text_tokens, generate_audio, GenerationConfig

    print(f"\n{'='*60}")
    print(f" Benchmarking: {dtype_name}")
    print(f"{'='*60}")

    config = load_config(model_dir / "config.json")
    model = HiggsAudioModel(config)
    load_weights(model, model_dir, dtype=dtype)

    # Force eval to measure actual load
    for name, param in model.parameters().items():
        if isinstance(param, mx.array):
            mx.eval(param)

    text = "The sun rises in the east and sets in the west. This simple fact has been observed by humans for thousands of years."
    tokenizer_path = model_dir / "tokenizer.json"
    text_tokens = build_text_tokens(text, tokenizer_path, config)

    gen_config = GenerationConfig(max_audio_tokens=max_tokens, temperature=0.3)
    result = generate_audio(model, text_tokens, gen_config)

    stats = result["stats"]
    print(f"\n  Result: {stats['tokens_per_sec']:.1f} tok/s, RTF={stats['rtf']:.2f}x")

    # Cleanup
    del model
    gc.collect()

    return stats


def benchmark_quantized(model_dir: Path, bits: int, group_size: int = 64, max_tokens: int = 200):
    """Run a benchmark with quantized model."""
    from model import load_config, load_weights, HiggsAudioModel
    from generate import build_text_tokens, generate_audio, GenerationConfig

    print(f"\n{'='*60}")
    print(f" Benchmarking: INT{bits} (group_size={group_size})")
    print(f"{'='*60}")

    config = load_config(model_dir / "config.json")
    model = HiggsAudioModel(config)
    load_weights(model, model_dir, dtype=mx.float16)

    # Quantize the model
    print(f"  Quantizing to {bits}-bit (group_size={group_size})...")
    t0 = time.time()

    # Quantize linear layers
    import mlx.nn as nn
    nn.quantize(model, bits=bits, group_size=group_size)

    quant_ms = (time.time() - t0) * 1000
    print(f"  Quantization done in {quant_ms:.0f}ms")

    # Count parameters
    total_params = 0
    quantized_params = 0
    for name, module in model.named_modules():
        if hasattr(module, "weight"):
            w = module.weight
            if isinstance(w, mx.array):
                total_params += w.size
                if hasattr(module, "scales"):
                    quantized_params += w.size

    text = "The sun rises in the east and sets in the west. This simple fact has been observed by humans for thousands of years."
    tokenizer_path = model_dir / "tokenizer.json"
    text_tokens = build_text_tokens(text, tokenizer_path, config)

    gen_config = GenerationConfig(max_audio_tokens=max_tokens, temperature=0.3)
    result = generate_audio(model, text_tokens, gen_config)

    stats = result["stats"]
    stats["quantization"] = f"INT{bits}"
    print(f"\n  Result: {stats['tokens_per_sec']:.1f} tok/s, RTF={stats['rtf']:.2f}x")

    del model
    gc.collect()

    return stats


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Benchmark Higgs Audio V2 on MLX")
    parser.add_argument("--model-dir", type=str, default="../../models/higgs-audio-v2")
    parser.add_argument("--max-tokens", type=int, default=200)
    parser.add_argument("--skip-fp", action="store_true", help="Skip FP16/BF16 benchmarks")
    args = parser.parse_args()

    model_dir = Path(args.model_dir)
    results = []

    # Full precision benchmarks
    if not args.skip_fp:
        stats = benchmark_dtype(model_dir, mx.bfloat16, "BFloat16", args.max_tokens)
        results.append(("BFloat16", stats))

        stats = benchmark_dtype(model_dir, mx.float16, "Float16", args.max_tokens)
        results.append(("Float16", stats))

    # Quantized benchmarks
    for bits in [8, 4]:
        stats = benchmark_quantized(model_dir, bits=bits, max_tokens=args.max_tokens)
        results.append((f"INT{bits}", stats))

    # Summary table
    print(f"\n{'='*70}")
    print(f" BENCHMARK SUMMARY")
    print(f"{'='*70}")
    print(f"{'Dtype':<12} {'tok/s':>8} {'RTF':>8} {'Prefill':>10} {'Gen Time':>10} {'Audio':>8}")
    print(f"{'-'*12} {'-'*8} {'-'*8} {'-'*10} {'-'*10} {'-'*8}")

    for name, stats in results:
        print(f"{name:<12} {stats['tokens_per_sec']:>7.1f} {stats['rtf']:>7.2f}x "
              f"{stats['prefill_ms']:>9.0f}ms {stats['gen_ms']:>9.0f}ms "
              f"{stats['audio_duration_s']:>6.1f}s")

    # Real-time assessment
    print(f"\n  Target: >= 50 tok/s for real-time (RTF < 0.80x)")
    for name, stats in results:
        status = "PASS" if stats['tokens_per_sec'] >= 50 else ("CLOSE" if stats['tokens_per_sec'] >= 40 else "FAIL")
        print(f"  {name}: {status} ({stats['tokens_per_sec']:.1f} tok/s)")


if __name__ == "__main__":
    main()
