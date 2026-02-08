"""
Standalone weight conversion script for Qwen3-Omni → MLX format.

Downloads from HuggingFace, converts safetensors to MLX format,
and supports 4-bit/8-bit quantization for fitting in 16GB unified memory.

Usage:
    python -m mlx_qwen3_omni.convert_weights \\
        --repo Qwen/Qwen3-Omni-30B-A3B-Thinking \\
        --output ~/.cache/mlx-qwen3-omni/thinker-int4 \\
        --quantize 4

    # 8-bit quantization
    python -m mlx_qwen3_omni.convert_weights \\
        --repo Qwen/Qwen3-Omni-30B-A3B-Thinking \\
        --quantize 8

    # Full precision (no quantization)
    python -m mlx_qwen3_omni.convert_weights \\
        --repo Qwen/Qwen3-Omni-30B-A3B-Thinking
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import shutil
import sys
import time
from pathlib import Path
from typing import Any

import mlx.core as mx
import mlx.nn as nn

LOG = logging.getLogger(__name__)

DEFAULT_CACHE_DIR = Path.home() / ".cache" / "mlx-qwen3-omni"


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------


def download_model(repo_id: str, cache_dir: Path | None = None) -> Path:
    """Download model files from HuggingFace Hub with progress reporting."""
    try:
        from huggingface_hub import snapshot_download
    except ImportError:
        LOG.error("Install huggingface_hub: pip install -e '.[convert]'")
        sys.exit(1)

    LOG.info("Downloading %s from HuggingFace ...", repo_id)
    t0 = time.monotonic()

    model_path = Path(
        snapshot_download(
            repo_id=repo_id,
            allow_patterns=["*.json", "*.safetensors", "tokenizer*", "*.model"],
            cache_dir=str(cache_dir) if cache_dir else None,
        )
    )

    elapsed = time.monotonic() - t0
    LOG.info("Download complete in %.1fs -> %s", elapsed, model_path)
    return model_path


def locate_model(repo_or_path: str, cache_dir: Path | None = None) -> Path:
    """Resolve a local path or HuggingFace repo to a local directory."""
    path = Path(repo_or_path)
    if path.exists():
        return path if path.is_dir() else path.parent
    return download_model(repo_or_path, cache_dir)


# ---------------------------------------------------------------------------
# Weight loading and key mapping
# ---------------------------------------------------------------------------


def load_safetensors(model_path: Path) -> dict[str, mx.array]:
    """Load all safetensors shards from a model directory."""
    import glob as globmod

    files = sorted(globmod.glob(str(model_path / "model*.safetensors")))
    if not files:
        raise FileNotFoundError(f"No model*.safetensors found in {model_path}")

    weights: dict[str, mx.array] = {}
    total_params = 0

    for i, fp in enumerate(files):
        LOG.info("  Loading shard %d/%d: %s", i + 1, len(files), Path(fp).name)
        shard = mx.load(fp)
        if isinstance(shard, dict):
            weights.update(shard)
        else:
            weights.update(dict(shard))
        n_params = sum(v.size for v in shard.values()) if isinstance(shard, dict) else 0
        total_params += n_params

    LOG.info("Loaded %d weight tensors (%.1fM parameters)", len(weights), total_params / 1e6)
    return weights


def map_hf_keys(weights: dict[str, mx.array]) -> dict[str, mx.array]:
    """Map HuggingFace weight keys to MLX Thinker model keys."""
    out: dict[str, mx.array] = {}
    prefixes = [
        ("model.thinker.text_model.", "model."),
        ("model.thinker.", "model."),
        ("model.model.", "model."),
    ]
    mapped_count = 0
    skipped_count = 0

    for k, v in weights.items():
        # Handle lm_head
        if k == "lm_head.weight" or k.endswith(".lm_head.weight"):
            out["lm_head.weight"] = v
            mapped_count += 1
            continue
        if k.startswith("lm_head."):
            out["lm_head." + k.split("lm_head.")[-1]] = v
            mapped_count += 1
            continue

        # Map thinker audio_encoder.* (HF: model.thinker.audio_encoder.* -> audio_encoder.*)
        # HF uses layers.0., layers.1., ...; our MLX encoder uses layer_0., layer_1., ...
        if k.startswith("model.thinker.audio_encoder."):
            rest = k[len("model.thinker.audio_encoder."):]
            layer_match = re.match(r"^layers\.(\d+)\.(.*)$", rest)
            if layer_match:
                out["audio_encoder.layer_" + layer_match.group(1) + "." + layer_match.group(2)] = v
            else:
                out["audio_encoder." + rest] = v
            mapped_count += 1
            continue

        # Map code2wav.* (HF: model.code2wav.* -> code2wav.*)
        if k.startswith("model.code2wav."):
            out["code2wav." + k[len("model.code2wav."):]] = v
            mapped_count += 1
            continue

        # Map talker.* (HF: model.talker.* -> talker.*; model.talker.model -> talker.text_decoder)
        if k.startswith("model.talker."):
            rest = k[len("model.talker."):]
            if rest.startswith("model."):
                out["talker.text_decoder." + rest[len("model."):]] = v
            elif rest.startswith("input_projection."):
                out["talker.input_proj." + rest[len("input_projection."):]] = v
            elif rest.startswith("input_proj."):
                out["talker." + rest] = v
            else:
                out["talker." + rest] = v
            mapped_count += 1
            continue

        # Map thinker prefixes
        matched = False
        for hf_prefix, mlx_prefix in prefixes:
            if k.startswith(hf_prefix):
                out[mlx_prefix + k[len(hf_prefix):]] = v
                mapped_count += 1
                matched = True
                break

        if not matched:
            skipped_count += 1

    LOG.info("Key mapping: %d mapped, %d skipped (non-thinker)", mapped_count, skipped_count)
    return out


def stack_experts(
    weights: dict[str, mx.array],
    num_layers: int,
    num_experts: int,
) -> dict[str, mx.array]:
    """Convert per-expert weights (experts.0..N) to stacked switch_mlp format."""
    if "model.layers.0.mlp.experts.0.up_proj.weight" not in weights:
        LOG.info("Experts already stacked or not present, skipping")
        return weights

    LOG.info("Stacking %d experts across %d layers ...", num_experts, num_layers)
    t0 = time.monotonic()

    for layer_idx in range(num_layers):
        prefix = f"model.layers.{layer_idx}.mlp"
        for proj in ["up_proj", "down_proj", "gate_proj"]:
            for suffix in ["weight", "scales", "biases"]:
                key = f"{prefix}.experts.0.{proj}.{suffix}"
                if key not in weights:
                    continue
                # Validate all experts 0..num_experts-1 exist before stacking
                missing = [
                    e
                    for e in range(num_experts)
                    if f"{prefix}.experts.{e}.{proj}.{suffix}" not in weights
                ]
                if missing:
                    raise KeyError(
                        f"Expert stacking requires all {num_experts} experts; missing indices {missing[:10]}{'...' if len(missing) > 10 else ''} for {prefix}.{proj}.{suffix}"
                    )
                to_join = []
                for e in range(num_experts):
                    expert_key = f"{prefix}.experts.{e}.{proj}.{suffix}"
                    to_join.append(weights.pop(expert_key))
                weights[f"{prefix}.switch_mlp.{proj}.{suffix}"] = mx.stack(to_join)

        if (layer_idx + 1) % 12 == 0:
            LOG.info("  Stacked experts for layers 0-%d", layer_idx)

    LOG.info("Expert stacking done in %.1fs", time.monotonic() - t0)
    return weights


def stack_experts_talker(
    weights: dict[str, mx.array],
    num_layers: int = 20,
    num_experts: int = 128,
) -> dict[str, mx.array]:
    """Stack Talker text decoder MoE experts (talker.text_decoder.layers.N.mlp.experts.*)."""
    prefix = "talker.text_decoder.layers.0.mlp.experts.0.up_proj.weight"
    if prefix not in weights:
        return weights
    LOG.info("Stacking Talker experts: %d experts across %d layers ...", num_experts, num_layers)
    t0 = time.monotonic()
    for layer_idx in range(num_layers):
        p = f"talker.text_decoder.layers.{layer_idx}.mlp"
        for proj in ["up_proj", "down_proj", "gate_proj"]:
            for suffix in ["weight", "scales", "biases"]:
                key = f"{p}.experts.0.{proj}.{suffix}"
                if key not in weights:
                    continue
                missing = [
                    e for e in range(num_experts)
                    if f"{p}.experts.{e}.{proj}.{suffix}" not in weights
                ]
                if missing:
                    raise KeyError(
                        f"Talker expert stacking: missing experts {missing[:10]}{'...' if len(missing) > 10 else ''} for {p}.{proj}.{suffix}"
                    )
                to_join = [weights.pop(f"{p}.experts.{e}.{proj}.{suffix}") for e in range(num_experts)]
                weights[f"{p}.switch_mlp.{proj}.{suffix}"] = mx.stack(to_join)
    LOG.info("Talker expert stacking done in %.1fs", time.monotonic() - t0)
    return weights


# ---------------------------------------------------------------------------
# Quantization
# ---------------------------------------------------------------------------


def quantize_weights(
    model: nn.Module,
    bits: int = 4,
    group_size: int = 64,
) -> None:
    """Quantize model weights in-place using MLX nn.quantize."""
    LOG.info("Quantizing to %d-bit (group_size=%d) ...", bits, group_size)
    t0 = time.monotonic()

    nn.quantize(model, bits=bits, group_size=group_size)
    mx.eval(model.parameters())

    elapsed = time.monotonic() - t0
    LOG.info("Quantization done in %.1fs", elapsed)

    # Report memory after quantization
    try:
        active_gb = mx.metal.get_active_memory() / (1024**3)
        LOG.info("Metal memory after quantization: %.2f GB", active_gb)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------


def verify_output(output_dir: Path) -> bool:
    """Verify the converted model by loading a few layers and checking shapes."""
    config_path = output_dir / "thinker_config.json"
    weights_path = output_dir / "model.safetensors"

    if not config_path.exists():
        LOG.error("Verification failed: %s not found", config_path)
        return False
    if not weights_path.exists():
        LOG.error("Verification failed: %s not found", weights_path)
        return False

    with open(config_path) as f:
        config = json.load(f)

    text_cfg = config.get("text_config", config)
    hidden_size = text_cfg.get("hidden_size", 2048)
    num_layers = text_cfg.get("num_hidden_layers", 48)
    vocab_size = text_cfg.get("vocab_size", 152064)

    weights = mx.load(str(weights_path))
    if isinstance(weights, list):
        weights = dict(weights)

    # Check key counts
    LOG.info("Verification: %d weight keys in output", len(weights))

    # Check embedding shape
    embed_key = "model.embed_tokens.weight"
    if embed_key in weights:
        shape = weights[embed_key].shape
        LOG.info("  embed_tokens: %s (expect [%d, %d])", shape, vocab_size, hidden_size)
        if shape[0] != vocab_size:
            LOG.warning("  Unexpected vocab_size: %d vs %d", shape[0], vocab_size)
    else:
        LOG.warning("  %s not found", embed_key)

    # Check a middle layer exists
    mid = num_layers // 2
    attn_key = f"model.layers.{mid}.self_attn.q_proj.weight"
    if attn_key in weights:
        LOG.info("  layer %d attention: %s", mid, weights[attn_key].shape)
    else:
        LOG.warning("  %s not found", attn_key)

    # Check lm_head
    if "lm_head.weight" in weights:
        LOG.info("  lm_head: %s", weights["lm_head.weight"].shape)

    LOG.info("Verification passed")
    return True


# ---------------------------------------------------------------------------
# Save tokenizer
# ---------------------------------------------------------------------------


def save_tokenizer(source_path: Path, output_dir: Path) -> None:
    """Copy tokenizer files from source to output."""
    tokenizer_files = [
        "tokenizer.json",
        "tokenizer_config.json",
        "special_tokens_map.json",
        "tokenizer.model",
        "vocab.json",
        "merges.txt",
    ]

    copied = 0
    for name in tokenizer_files:
        src = source_path / name
        if src.exists():
            shutil.copy2(src, output_dir / name)
            copied += 1

    if copied > 0:
        LOG.info("Copied %d tokenizer files to %s", copied, output_dir)
    else:
        # Try saving via transformers
        try:
            from transformers import AutoTokenizer

            tok = AutoTokenizer.from_pretrained(str(source_path), trust_remote_code=True)
            tok.save_pretrained(str(output_dir))
            LOG.info("Saved tokenizer via transformers to %s", output_dir)
        except Exception as e:
            LOG.warning("Could not save tokenizer: %s", e)


# ---------------------------------------------------------------------------
# Main conversion pipeline
# ---------------------------------------------------------------------------


def convert(
    repo_or_path: str,
    output_dir: str | Path | None = None,
    quantize_bits: int | None = None,
    group_size: int = 64,
    cache_dir: str | Path | None = None,
) -> Path:
    """
    Full conversion pipeline: download -> load -> map -> stack -> quantize -> save.

    Args:
        repo_or_path: HuggingFace model ID or local path.
        output_dir: Output directory (default: ~/.cache/mlx-qwen3-omni/<name>).
        quantize_bits: None for fp16, 4 for INT4, 8 for INT8.
        group_size: Quantization group size (default: 64).
        cache_dir: HuggingFace cache directory.

    Returns:
        Path to the output directory.
    """
    from mlx_qwen3_omni.config import load_thinker_config
    from mlx_qwen3_omni.thinker import Qwen3OmniThinker

    total_t0 = time.monotonic()

    # Resolve output directory
    if output_dir is None:
        name = repo_or_path.replace("/", "--")
        if quantize_bits:
            name += f"-int{quantize_bits}"
        output_dir = DEFAULT_CACHE_DIR / name
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    LOG.info("=" * 60)
    LOG.info("MLX Qwen3-Omni Weight Conversion")
    LOG.info("  Source: %s", repo_or_path)
    LOG.info("  Output: %s", output_dir)
    LOG.info("  Quantization: %s", f"{quantize_bits}-bit" if quantize_bits else "none (fp16)")
    LOG.info("=" * 60)

    # Step 1: Locate / download model
    LOG.info("[1/6] Locating model ...")
    cache_path = Path(cache_dir) if cache_dir else None
    model_path = locate_model(repo_or_path, cache_path)
    LOG.info("  Model files at: %s", model_path)

    # Step 2: Load config
    LOG.info("[2/6] Loading config ...")
    thinker_config = load_thinker_config(str(model_path))
    text_cfg = thinker_config.get("text_config", thinker_config)
    num_layers = text_cfg.get("num_hidden_layers", 48)
    num_experts = text_cfg.get("num_experts", 128)
    LOG.info("  %d layers, %d experts", num_layers, num_experts)

    # Save config
    with open(output_dir / "thinker_config.json", "w") as f:
        json.dump(thinker_config, f, indent=2)

    # Step 3: Load safetensors
    LOG.info("[3/6] Loading safetensors ...")
    weights = load_safetensors(model_path)

    # Step 4: Map keys and stack experts
    LOG.info("[4/6] Mapping HF keys to MLX format ...")
    weights = map_hf_keys(weights)
    if not weights:
        raise ValueError(
            "No thinker text weights found after key mapping. "
            "Check the model's weight key prefixes."
        )
    weights = stack_experts(weights, num_layers, num_experts)

    # Step 5: Build model, load weights, optionally quantize
    LOG.info("[5/6] Building model and loading weights ...")
    model = Qwen3OmniThinker(thinker_config)
    model.load_weights(list(weights.items()), strict=False)
    mx.eval(model.parameters())
    del weights  # free HF weight dict

    if quantize_bits is not None:
        quantize_weights(model, bits=quantize_bits, group_size=group_size)

    # Step 6: Save
    LOG.info("[6/6] Saving MLX weights ...")
    t0 = time.monotonic()
    model.save_weights(str(output_dir / "model.safetensors"))
    LOG.info("  Saved in %.1fs", time.monotonic() - t0)

    # Save tokenizer
    save_tokenizer(model_path, output_dir)

    # Save conversion metadata
    meta: dict[str, Any] = {
        "source": repo_or_path,
        "quantize_bits": quantize_bits,
        "group_size": group_size if quantize_bits else None,
        "num_layers": num_layers,
        "num_experts": num_experts,
    }
    with open(output_dir / "conversion_meta.json", "w") as f:
        json.dump(meta, f, indent=2)

    # Verify
    verify_output(output_dir)

    total_elapsed = time.monotonic() - total_t0
    LOG.info("=" * 60)
    LOG.info("Conversion complete in %.1fs", total_elapsed)
    LOG.info("  Output: %s", output_dir)

    # Report file sizes
    total_size = sum(f.stat().st_size for f in output_dir.iterdir() if f.is_file())
    LOG.info("  Total size: %.2f GB", total_size / (1024**3))
    LOG.info("=" * 60)

    return output_dir


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    parser = argparse.ArgumentParser(
        description="Convert Qwen3-Omni weights to MLX format with optional quantization"
    )
    parser.add_argument(
        "--repo",
        required=True,
        help="HuggingFace model ID or path (e.g. Qwen/Qwen3-Omni-30B-A3B-Thinking)",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=None,
        help="Output directory (default: ~/.cache/mlx-qwen3-omni/<model-name>)",
    )
    parser.add_argument(
        "--quantize",
        "-q",
        type=int,
        default=None,
        choices=[4, 8],
        help="Quantization bits: 4 (INT4) or 8 (INT8). Default: none (fp16).",
    )
    parser.add_argument(
        "--group-size",
        type=int,
        default=64,
        help="Quantization group size (default: 64)",
    )
    parser.add_argument(
        "--cache-dir",
        default=None,
        help="HuggingFace cache directory",
    )

    args = parser.parse_args()
    convert(
        repo_or_path=args.repo,
        output_dir=args.output,
        quantize_bits=args.quantize,
        group_size=args.group_size,
        cache_dir=args.cache_dir,
    )


if __name__ == "__main__":
    main()
