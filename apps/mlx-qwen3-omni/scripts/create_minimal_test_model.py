#!/usr/bin/env python3
"""
Create a minimal MLX test model (Thinker-only, 2 layers) for local live testing.

Use this when you don't have a full converted Qwen3-Omni checkpoint. The server
will load and /v1/chat/completions will work; /v1/audio/speech and
/v1/audio/transcriptions will return 501 until you add Talker+Code2Wav and
audio encoder weights.

Usage:
    cd apps/mlx-qwen3-omni && PYTHONPATH=src python scripts/create_minimal_test_model.py
    # Writes to .test-model/ by default, or:
    PYTHONPATH=src python scripts/create_minimal_test_model.py -o /path/to/output
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

# Add src to path when run as script
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import mlx.core as mx
from mlx_qwen3_omni.thinker import Qwen3OmniThinker


def main() -> None:
    parser = argparse.ArgumentParser(description="Create minimal MLX test model (Thinker only)")
    parser.add_argument(
        "-o", "--output",
        type=Path,
        default=Path(__file__).resolve().parent.parent / ".test-model",
        help="Output directory (default: .test-model)",
    )
    args = parser.parse_args()
    out = args.output
    out.mkdir(parents=True, exist_ok=True)

    config = {
        "text_config": {
            "model_type": "qwen3_omni_moe_thinker",
            "hidden_size": 64,
            "num_hidden_layers": 2,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "num_experts": 4,
            "num_experts_per_tok": 2,
            "moe_intermediate_size": 32,
            "shared_expert_intermediate_size": 0,
            "rms_norm_eps": 1e-6,
            "vocab_size": 256,
            "rope_theta": 10000.0,
            "attention_bias": False,
            "tie_word_embeddings": False,
        }
    }
    (out / "thinker_config.json").write_text(json.dumps(config, indent=2))
    model = Qwen3OmniThinker(config)
    model.save_weights(str(out / "model.safetensors"))
    mx.eval(model.parameters())
    print(f"Minimal test model written to {out}")
    print("Start server with:")
    print(f"  PYTHONPATH=src python -m mlx_qwen3_omni.server --model {out} --tokenizer Qwen/Qwen2.5-0.5B-Instruct --port 8800")
    print("(Tokenizer from HF; no Talker/Code2Wav so /v1/audio/speech will return 501.)")


if __name__ == "__main__":
    main()
