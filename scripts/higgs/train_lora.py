#!/usr/bin/env python3
"""Fine-tune Higgs Audio V2 with LoRA for voice identity.

Trains a lightweight adapter (~4MB) on top of the 12GB base model
to clone a specific voice (e.g., Ferni). Targets the audio FFN
layers and attention Q/V projections.

Prerequisites:
    pip install torch transformers peft datasets soundfile accelerate

Usage:
    # Basic training
    python scripts/higgs/train_lora.py \
        --model-path models/higgs-audio-v2 \
        --dataset data/ferni-training/dataset.jsonl \
        --audio-dir data/ferni-training/ \
        --output models/higgs-v2-ferni-lora

    # Full options
    python scripts/higgs/train_lora.py \
        --model-path models/higgs-audio-v2 \
        --dataset data/ferni-training/dataset.jsonl \
        --audio-dir data/ferni-training/ \
        --output models/higgs-v2-ferni-lora \
        --rank 16 \
        --alpha 32 \
        --epochs 5 \
        --batch-size 4 \
        --lr 1e-4 \
        --warmup-ratio 0.1

After training:
    python scripts/higgs/merge_lora.py \
        --base models/higgs-audio-v2 \
        --lora models/higgs-v2-ferni-lora \
        --output models/higgs-v2-ferni
"""

import argparse
import json
import sys
from pathlib import Path

import torch


def check_dependencies():
    """Check that all required packages are installed."""
    missing = []
    for pkg in ["transformers", "peft", "datasets", "soundfile", "accelerate"]:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)

    if missing:
        print(f"Missing packages: {', '.join(missing)}")
        print(f"Install with: pip install {' '.join(missing)}")
        sys.exit(1)


def load_dataset(dataset_path: Path, audio_base_dir: Path):
    """Load the JSONL dataset with audio references."""
    from datasets import Dataset
    import soundfile as sf

    entries = []
    with open(dataset_path) as f:
        for line in f:
            entry = json.loads(line.strip())
            audio_path = audio_base_dir / entry["audio_path"]
            if audio_path.exists():
                entry["audio_file"] = str(audio_path)
                entries.append(entry)

    print(f"Loaded {len(entries)} training examples")

    # Load audio data
    audio_data = []
    for entry in entries:
        data, sr = sf.read(entry["audio_file"])
        audio_data.append({
            "text": entry["prompt"],  # Use the chat-template formatted prompt
            "audio": {"array": data.tolist(), "sampling_rate": sr},
            "transcript": entry["text"],
            "duration": entry["duration_s"],
        })

    return Dataset.from_list(audio_data)


def setup_lora(model, rank: int, alpha: int, dropout: float):
    """Configure LoRA adapters targeting audio FFN + attention."""
    from peft import LoraConfig, get_peft_model, TaskType

    # Target modules for TTS voice identity:
    # - Audio FFN layers (voice characteristics)
    # - Attention Q/V projections (how the model attends to audio patterns)
    target_modules = [
        # Audio FFN (DualFFN audio path — voice identity lives here)
        "audio_mlp.gate_proj",
        "audio_mlp.up_proj",
        "audio_mlp.down_proj",
        # Attention (shared, but Q/V affect voice pattern recognition)
        "self_attn.q_proj",
        "self_attn.v_proj",
    ]

    # Verify target modules exist in the model
    found_modules = set()
    for name, _ in model.named_modules():
        for target in target_modules:
            if target in name:
                found_modules.add(target)

    if not found_modules:
        print("Warning: No target modules found! Trying broader pattern...")
        # Fallback: target all linear layers in audio path
        target_modules = []
        for name, module in model.named_modules():
            if "audio" in name and isinstance(module, torch.nn.Linear):
                # Extract the leaf module name
                parts = name.split(".")
                target_modules.append(parts[-1])
        target_modules = list(set(target_modules))
        print(f"  Found modules: {target_modules}")

    lora_config = LoraConfig(
        r=rank,
        lora_alpha=alpha,
        target_modules=target_modules,
        lora_dropout=dropout,
        bias="none",
        task_type=TaskType.CAUSAL_LM,
    )

    model = get_peft_model(model, lora_config)

    # Print trainable parameters
    trainable = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total = sum(p.numel() for p in model.parameters())
    print(f"Trainable parameters: {trainable:,} / {total:,} ({100 * trainable / total:.2f}%)")
    print(f"Adapter size estimate: {trainable * 4 / 1024 / 1024:.1f} MB (fp32)")

    return model


def train(
    model,
    tokenizer,
    dataset,
    output_dir: Path,
    epochs: int,
    batch_size: int,
    lr: float,
    warmup_ratio: float,
    gradient_accumulation: int,
):
    """Run LoRA fine-tuning."""
    from transformers import TrainingArguments, Trainer

    training_args = TrainingArguments(
        output_dir=str(output_dir),
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation,
        learning_rate=lr,
        warmup_ratio=warmup_ratio,
        weight_decay=0.01,
        logging_steps=10,
        save_steps=100,
        save_total_limit=3,
        fp16=torch.cuda.is_available(),
        bf16=False,
        dataloader_num_workers=2,
        remove_unused_columns=False,
        report_to="none",
        seed=42,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        tokenizer=tokenizer,
    )

    print(f"\nStarting training: {epochs} epochs, batch_size={batch_size}, lr={lr}")
    print(f"Output: {output_dir}")
    print()

    trainer.train()

    # Save the final adapter
    model.save_pretrained(str(output_dir))
    print(f"\nLoRA adapter saved to: {output_dir}")

    # Save training config for reference
    config = {
        "base_model": str(model.config._name_or_path) if hasattr(model.config, "_name_or_path") else "higgs-audio-v2",
        "epochs": epochs,
        "batch_size": batch_size,
        "learning_rate": lr,
        "warmup_ratio": warmup_ratio,
        "dataset_size": len(dataset),
    }
    with open(output_dir / "training_config.json", "w") as f:
        json.dump(config, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Higgs Audio V2 with LoRA")
    parser.add_argument("--model-path", type=Path, default=Path("models/higgs-audio-v2"),
                        help="Path to base Higgs Audio V2 model")
    parser.add_argument("--dataset", type=Path, required=True,
                        help="Path to dataset.jsonl from prepare_training_data.py")
    parser.add_argument("--audio-dir", type=Path, required=True,
                        help="Base directory for audio file paths in dataset")
    parser.add_argument("--output", type=Path, default=Path("models/higgs-v2-ferni-lora"),
                        help="Output directory for LoRA adapter")
    parser.add_argument("--rank", type=int, default=16, help="LoRA rank (default: 16)")
    parser.add_argument("--alpha", type=int, default=32, help="LoRA alpha (default: 32)")
    parser.add_argument("--dropout", type=float, default=0.05, help="LoRA dropout (default: 0.05)")
    parser.add_argument("--epochs", type=int, default=5, help="Training epochs (default: 5)")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size (default: 4)")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate (default: 1e-4)")
    parser.add_argument("--warmup-ratio", type=float, default=0.1, help="Warmup ratio (default: 0.1)")
    parser.add_argument("--gradient-accumulation", type=int, default=4,
                        help="Gradient accumulation steps (default: 4)")
    args = parser.parse_args()

    print("=" * 60)
    print("  Higgs Audio V2 — LoRA Fine-Tuning")
    print("=" * 60)
    print(f"  Base model:  {args.model_path}")
    print(f"  Dataset:     {args.dataset}")
    print(f"  Output:      {args.output}")
    print(f"  LoRA rank:   {args.rank}, alpha: {args.alpha}")
    print(f"  Epochs:      {args.epochs}, batch: {args.batch_size}, lr: {args.lr}")
    print()

    check_dependencies()

    from transformers import AutoModelForCausalLM, AutoTokenizer

    # Load base model
    print("Loading base model...")
    model = AutoModelForCausalLM.from_pretrained(
        str(args.model_path),
        trust_remote_code=True,
        torch_dtype=torch.float32,
        device_map="auto",
    )

    tokenizer = AutoTokenizer.from_pretrained(str(args.model_path), trust_remote_code=True)

    # Setup LoRA
    print("\nConfiguring LoRA adapters...")
    model = setup_lora(model, args.rank, args.alpha, args.dropout)

    # Load dataset
    print("\nLoading dataset...")
    dataset = load_dataset(args.dataset, args.audio_dir)

    # Train
    args.output.mkdir(parents=True, exist_ok=True)
    train(
        model=model,
        tokenizer=tokenizer,
        dataset=dataset,
        output_dir=args.output,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        warmup_ratio=args.warmup_ratio,
        gradient_accumulation=args.gradient_accumulation,
    )

    print()
    print("=" * 60)
    print("  Training complete!")
    print()
    print("  Next steps:")
    print(f"    1. Merge adapter:  python scripts/higgs/merge_lora.py --lora {args.output}")
    print(f"    2. Test quality:   Listen to samples and compare with base model")
    print(f"    3. A/B test:       Compare merged model vs Cartesia TTS")
    print("=" * 60)


if __name__ == "__main__":
    main()
