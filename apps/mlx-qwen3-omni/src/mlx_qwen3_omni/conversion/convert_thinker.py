"""
Convert Hugging Face Qwen3-Omni Thinker weights to MLX format.

Usage:
    python -m mlx_qwen3_omni.conversion.convert_thinker --repo Qwen/Qwen3-Omni-30B-A3B-Thinking --output ./mlx_thinker
    # Or use Instruct model; we extract thinker text weights only.
"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import re
import shutil
from pathlib import Path

import mlx.core as mx

from mlx_qwen3_omni.config import load_thinker_config
from mlx_qwen3_omni.thinker import Qwen3OmniThinker

LOG = logging.getLogger(__name__)


def _locate_model_path(repo_or_path: str) -> Path:
    path = Path(repo_or_path)
    if path.exists():
        if path.is_file():
            return path.parent
        return path
    try:
        from huggingface_hub import snapshot_download
        return Path(
            snapshot_download(
                repo_id=repo_or_path,
                allow_patterns=["*.json", "*.safetensors"],
            )
        )
    except Exception as e:
        raise FileNotFoundError(
            f"Cannot load from {repo_or_path}. Provide a path or HF model id."
        ) from e


def _load_safetensors(model_path: Path) -> dict[str, mx.array]:
    weights: dict[str, mx.array] = {}
    for fp in sorted(glob.glob(str(model_path / "model*.safetensors"))):
        w = mx.load(fp)
        if isinstance(w, dict):
            weights.update(w)
        else:
            weights.update(dict(w))
    return weights


def _map_hf_to_mlx(weights: dict[str, mx.array]) -> dict[str, mx.array]:
    """Map HF thinker keys to our MLX names: model.* (backbone) and lm_head.*."""
    out: dict[str, mx.array] = {}
    # HF may use: model.thinker.text_model.*, model.model.* (Thinking), or model.thinker.*
    # Our MLX Qwen3OmniThinker has .model (ThinkerModel) and .lm_head, so keys are model.* and lm_head.*
    prefixes = [
        ("model.thinker.text_model.", "model."),
        ("model.thinker.", "model."),
        ("model.model.", "model."),
    ]
    for k, v in weights.items():
        # lm_head: HF may have "lm_head.weight" or "model.thinker.lm_head.weight"
        if k == "lm_head.weight" or k.endswith(".lm_head.weight"):
            out["lm_head.weight"] = v
            continue
        if k.startswith("lm_head."):
            out["lm_head." + k.split("lm_head.")[-1]] = v
            continue
        # Map thinker audio_encoder.* (HF: model.thinker.audio_encoder.* -> audio_encoder.*)
        # HF uses layers.0., ...; our MLX encoder uses layer_0., ...
        if k.startswith("model.thinker.audio_encoder."):
            rest = k[len("model.thinker.audio_encoder."):]
            m = re.match(r"^layers\.(\d+)\.(.*)$", rest)
            if m:
                out["audio_encoder.layer_" + m.group(1) + "." + m.group(2)] = v
            else:
                out["audio_encoder." + rest] = v
            continue
        mapped = None
        for hf_prefix, mlx_prefix in prefixes:
            if k.startswith(hf_prefix):
                mapped = mlx_prefix + k[len(hf_prefix):]
                break
        if mapped is not None:
            out[mapped] = v
    return out


def convert_thinker(
    repo_or_path: str,
    output_dir: str | Path,
    *,
    quantize: bool = False,
    q_bits: int = 4,
) -> None:
    """
    Convert HF Qwen3-Omni Thinker (Thinker only) to MLX weights.

    Args:
        repo_or_path: HF model id or path to local model dir.
        output_dir: Directory to write MLX weights and config.
        quantize: If True, quantize Thinker to q_bits using mlx.nn.quantize (saves quantized weights).
        q_bits: 4 or 8 for quantization.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    thinker_config = load_thinker_config(repo_or_path)
    with open(output_dir / "thinker_config.json", "w") as f:
        json.dump(thinker_config, f, indent=2)

    model_path = _locate_model_path(repo_or_path)
    weights = _load_safetensors(model_path)
    if not weights:
        raise FileNotFoundError(
            f"No model*.safetensors found in {model_path}. "
            "Use a local dir with safetensors or a HF repo that has them."
        )

    # Map HF keys to our model keys (thinker text backbone)
    mlx_weights = _map_hf_to_mlx(weights)
    if not mlx_weights:
        raise ValueError(
            "No thinker text weights found. Keys might use a different prefix. "
            "Try Qwen/Qwen3-Omni-30B-A3B-Thinking (thinker-only) or check HF model layout."
        )
    LOG.info("Mapped %d HF keys to %d MLX keys", len(weights), len(mlx_weights))

    # Build model and sanitize (experts.0..N -> switch_mlp)
    model = Qwen3OmniThinker(thinker_config)
    if hasattr(model, "sanitize"):
        mlx_weights = model.sanitize(mlx_weights)

    # Load into model (strict=False so we can have extra or missing)
    model.load_weights(list(mlx_weights.items()), strict=False)
    mx.eval(model.parameters())

    if quantize:
        import mlx.nn as nn
        group_size = 64
        LOG.info("Quantizing Thinker to %d-bit (group_size=%d) ...", q_bits, group_size)
        nn.quantize(model, bits=q_bits, group_size=group_size)
        mx.eval(model.parameters())
        LOG.info("Quantization done")

    # Save MLX weights (use save_weights for correct flat format)
    model.save_weights(str(output_dir / "model.safetensors"))

    # Save tokenizer: from HF repo or copy from local path
    repo_path = Path(repo_or_path)
    if repo_path.exists() and repo_path.is_dir():
        # Copy tokenizer files from local dir if present
        for name in ("tokenizer.json", "tokenizer_config.json", "special_tokens_map.json"):
            src = repo_path / name
            if src.exists():
                shutil.copy2(src, output_dir / name)
                LOG.info("Copied %s to %s", name, output_dir)
        # Merge tokenizer.model if present (sentencepiece)
        for name in ("tokenizer.model", "vocab.json", "merges.txt"):
            src = repo_path / name
            if src.exists():
                shutil.copy2(src, output_dir / name)
                LOG.info("Copied %s to %s", name, output_dir)
    else:
        try:
            from transformers import AutoTokenizer
            tok = AutoTokenizer.from_pretrained(repo_or_path, trust_remote_code=True)
            tok.save_pretrained(str(output_dir))
            LOG.info("Saved tokenizer to %s", output_dir)
        except Exception as e:
            LOG.warning("Tokenizer not saved (install transformers): %s", e)

    LOG.info("Saved config and weights to %s", output_dir)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(
        description="Convert Qwen3-Omni Thinker from Hugging Face to MLX"
    )
    parser.add_argument(
        "--repo",
        required=True,
        help="Hugging Face model id or path to model dir (e.g. Qwen/Qwen3-Omni-30B-A3B-Instruct)",
    )
    parser.add_argument(
        "--output",
        "-o",
        default="./mlx_thinker",
        help="Output directory for MLX weights (default: ./mlx_thinker)",
    )
    parser.add_argument(
        "--quantize",
        "-q",
        action="store_true",
        help="Quantize to 4-bit (or --q-bits)",
    )
    parser.add_argument(
        "--q-bits",
        type=int,
        default=4,
        choices=(4, 8),
        help="Quantization bits (default: 4)",
    )
    args = parser.parse_args()
    convert_thinker(
        args.repo,
        args.output,
        quantize=args.quantize,
        q_bits=args.q_bits,
    )


if __name__ == "__main__":
    main()
