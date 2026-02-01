#!/usr/bin/env python3
"""
Ferni Router Model Training Script

Fine-tunes Qwen3-1.7B for single-label tool classification using LoRA.
Each query maps to exactly one tool (or "no_tool" for conversation).

Usage:
    python train.py --config config.yaml --data_dir ./data --output_dir ./outputs
"""

import argparse
import json
import logging
import os
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import torch
import yaml
from datasets import Dataset, load_dataset
from peft import LoraConfig, TaskType, get_peft_model
from sklearn.metrics import f1_score, precision_score, recall_score
from torch.optim import AdamW
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
    get_cosine_schedule_with_warmup,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("ferni-router-training")


def load_config(config_path: str) -> dict:
    """Load training configuration from YAML file."""
    with open(config_path, "r") as f:
        return yaml.safe_load(f)


def resolve_data_path(config_path: str, data_dir: str) -> str:
    """Resolve a data file path from config.

    If the config path is absolute, use it directly.
    If it starts with 'data/', treat it as relative to the config's directory
    (i.e., strip the 'data/' prefix and prepend data_dir).
    Otherwise, join with data_dir.
    """
    if os.path.isabs(config_path):
        return config_path
    # Strip leading "data/" since data_dir already points there
    if config_path.startswith("data/"):
        return os.path.join(data_dir, config_path[len("data/"):])
    return os.path.join(data_dir, config_path)


def build_label_mapping(data_dir: str, config: Optional[dict] = None) -> Dict[str, int]:
    """Build mapping from tool IDs to label indices.

    Adds a special 'no_tool' class for queries that don't map to any tool.
    """
    tool_ids = set()

    # Get file paths from config if provided
    data_config = config.get("data", {}) if config else {}
    file_mapping = {
        "train": resolve_data_path(data_config.get("train_file", "train.jsonl"), data_dir),
        "validation": resolve_data_path(data_config.get("validation_file", "validation.jsonl"), data_dir),
        "test": resolve_data_path(data_config.get("test_file", "test.jsonl"), data_dir),
    }

    for split, file_path_str in file_mapping.items():
        file_path = Path(file_path_str)
        if file_path.exists():
            logger.info(f"Building labels from: {file_path}")
            with open(file_path, "r") as f:
                for line in f:
                    example = json.loads(line)
                    tools = example.get("selected_tools", [])
                    tool_ids.update(tools)

    # Sort for reproducibility
    sorted_tools = sorted(tool_ids)

    # Add no_tool class for queries with empty selected_tools
    # (if __no_tool__ already appears in the data, it keeps its sorted index)
    label_map = {tool: idx for idx, tool in enumerate(sorted_tools)}
    if "__no_tool__" not in label_map:
        label_map["__no_tool__"] = len(sorted_tools)

    logger.info(f"Found {len(label_map)} labels ({len(sorted_tools)} from data, __no_tool__={'exists' if '__no_tool__' in sorted_tools else 'added'})")
    return label_map


def preprocess_function(
    examples: Dict,
    tokenizer,
    label_map: Dict[str, int],
    max_length: int,
    num_labels: int,
):
    """Preprocess examples for single-label classification.

    Each example maps to exactly one tool class (the first selected tool),
    or the __no_tool__ class if no tools are selected.
    """
    # Tokenize queries
    tokenized = tokenizer(
        examples["query"],
        padding="max_length",
        truncation=True,
        max_length=max_length,
    )

    # Single integer label per example
    labels = []
    no_tool_idx = label_map.get("__no_tool__", num_labels - 1)
    for tools in examples["selected_tools"]:
        if tools and tools[0] in label_map:
            labels.append(label_map[tools[0]])
        else:
            labels.append(no_tool_idx)

    tokenized["labels"] = labels
    return tokenized


def compute_metrics(eval_pred):
    """Compute metrics for single-label classification."""
    logits, labels = eval_pred

    # logits shape: (N, num_classes), labels shape: (N,)
    preds = np.argmax(logits, axis=-1)

    # Top-1 accuracy
    top1_accuracy = np.mean(preds == labels)

    # Top-3 accuracy
    top3_indices = np.argsort(logits, axis=-1)[:, -3:]  # top 3 per row
    top3_correct = np.array([label in top3 for label, top3 in zip(labels, top3_indices)])
    top3_accuracy = np.mean(top3_correct)

    # Top-5 accuracy
    top5_indices = np.argsort(logits, axis=-1)[:, -5:]
    top5_correct = np.array([label in top5 for label, top5 in zip(labels, top5_indices)])
    top5_accuracy = np.mean(top5_correct)

    # F1 (weighted handles class imbalance better)
    f1_weighted = f1_score(labels, preds, average="weighted", zero_division=0)
    f1_macro = f1_score(labels, preds, average="macro", zero_division=0)

    return {
        "top1_accuracy": float(top1_accuracy),
        "top3_accuracy": float(top3_accuracy),
        "top5_accuracy": float(top5_accuracy),
        "f1_weighted": float(f1_weighted),
        "f1_macro": float(f1_macro),
    }


class RouterTrainer(Trainer):
    """Custom Trainer with separate learning rates for classification head vs LoRA.

    The classification head (score layer) produces gradient norms ~43 while
    LoRA adapters produce ~0.3 (140:1 ratio). Global gradient clipping
    starves LoRA of signal. We fix this by:
    1. Separate parameter groups with different LRs
    2. Disabling global gradient clipping (AdamW handles per-param scaling)
    """

    def create_optimizer(self):
        score_params = []
        lora_params = []
        for name, param in self.model.named_parameters():
            if not param.requires_grad:
                continue
            if "score" in name or "classifier" in name:
                score_params.append(param)
            else:
                lora_params.append(param)

        score_lr = self.args.learning_rate * 0.05  # 20x smaller for head
        logger.info(
            f"Optimizer groups: LoRA ({len(lora_params)} tensors, lr={self.args.learning_rate}), "
            f"Score ({len(score_params)} tensors, lr={score_lr})"
        )

        self.optimizer = AdamW(
            [
                {"params": lora_params, "lr": self.args.learning_rate},
                {"params": score_params, "lr": score_lr},
            ],
            weight_decay=self.args.weight_decay,
        )
        return self.optimizer


def main():
    parser = argparse.ArgumentParser(description="Train Ferni Router Model")
    parser.add_argument("--config", type=str, default="config.yaml", help="Config file path")
    parser.add_argument("--data_dir", type=str, default="./data", help="Data directory")
    parser.add_argument("--output_dir", type=str, default=None, help="Output directory")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    args = parser.parse_args()
    
    # Load configuration
    config = load_config(args.config)
    logger.info(f"Loaded config from {args.config}")
    
    # Build label mapping (pass config so it uses the right file names)
    label_map = build_label_mapping(args.data_dir, config)
    num_labels = len(label_map)
    logger.info(f"Found {num_labels} unique tools")
    
    # Save label mapping
    output_dir = args.output_dir or config["output"]["output_dir"]
    os.makedirs(output_dir, exist_ok=True)
    with open(f"{output_dir}/label_map.json", "w") as f:
        json.dump(label_map, f, indent=2)
    
    # Load tokenizer
    tokenizer = AutoTokenizer.from_pretrained(config["model"]["base_model"])
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    
    # Load datasets - use config paths if specified, otherwise default
    data_config = config.get("data", {})
    train_file = resolve_data_path(data_config.get("train_file", "train.jsonl"), args.data_dir)
    val_file = resolve_data_path(data_config.get("validation_file", "validation.jsonl"), args.data_dir)
    
    logger.info(f"Loading train data from: {train_file}")
    logger.info(f"Loading validation data from: {val_file}")
    
    data_files = {
        "train": train_file,
        "validation": val_file,
    }
    dataset = load_dataset("json", data_files=data_files)
    
    # Preprocess
    max_length = config["data"]["max_length"]
    
    def preprocess(examples):
        return preprocess_function(
            examples, tokenizer, label_map, max_length, num_labels
        )
    
    tokenized_dataset = dataset.map(
        preprocess,
        batched=True,
        remove_columns=dataset["train"].column_names,
    )
    
    logger.info(f"Train size: {len(tokenized_dataset['train'])}")
    logger.info(f"Validation size: {len(tokenized_dataset['validation'])}")
    
    # Load model (single-label classification uses CrossEntropyLoss)
    model = AutoModelForSequenceClassification.from_pretrained(
        config["model"]["base_model"],
        num_labels=num_labels,
        problem_type="single_label_classification",
        torch_dtype=torch.bfloat16 if config["training"].get("bf16") else (torch.float16 if config["training"].get("fp16") else torch.float32),
    )
    model.config.pad_token_id = tokenizer.pad_token_id

    # Re-initialize classification head with moderate weights.
    # Qwen3 hidden states have std~2.5. The score head gradient flow is:
    #   d(loss)/d(LoRA) ∝ score.weight^T → bigger weights = more LoRA signal
    # With std=0.001: LoRA grad_norm≈0.3, score≈43 (starves LoRA)
    # With std=0.1:   LoRA grad_norm≈30, score≈43 (balanced)
    # RouterTrainer uses separate LRs to prevent score head from diverging.
    init_std = 0.1
    if hasattr(model, "score"):
        torch.nn.init.normal_(model.score.weight, mean=0.0, std=init_std)
        if model.score.bias is not None:
            torch.nn.init.zeros_(model.score.bias)
        logger.info(f"Re-initialized classification head (std={init_std})")
    elif hasattr(model, "classifier"):
        torch.nn.init.normal_(model.classifier.weight, mean=0.0, std=init_std)
        if model.classifier.bias is not None:
            torch.nn.init.zeros_(model.classifier.bias)
        logger.info(f"Re-initialized classification head (std={init_std})")
    
    # Configure LoRA
    lora_config = LoraConfig(
        r=config["lora"]["r"],
        lora_alpha=config["lora"]["lora_alpha"],
        target_modules=config["lora"]["target_modules"],
        lora_dropout=config["lora"]["lora_dropout"],
        bias=config["lora"]["bias"],
        task_type=TaskType.SEQ_CLS,
    )
    
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()
    
    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        learning_rate=config["training"]["learning_rate"],
        num_train_epochs=config["training"]["num_train_epochs"],
        per_device_train_batch_size=config["training"]["per_device_train_batch_size"],
        per_device_eval_batch_size=config["training"]["per_device_eval_batch_size"],
        gradient_accumulation_steps=config["training"]["gradient_accumulation_steps"],
        warmup_ratio=config["training"]["warmup_ratio"],
        weight_decay=config["training"]["weight_decay"],
        max_grad_norm=config["training"]["max_grad_norm"],
        lr_scheduler_type=config["training"]["lr_scheduler_type"],
        eval_strategy=config["training"]["eval_strategy"],
        eval_steps=config["training"]["eval_steps"],
        save_strategy=config["training"]["save_strategy"],
        save_steps=config["training"]["save_steps"],
        save_total_limit=config["training"]["save_total_limit"],
        load_best_model_at_end=config["training"]["load_best_model_at_end"],
        metric_for_best_model=config["training"]["metric_for_best_model"],
        greater_is_better=config["training"]["greater_is_better"],
        fp16=config["training"].get("fp16", False),
        bf16=config["training"].get("bf16", False),
        dataloader_num_workers=config["training"]["dataloader_num_workers"],
        logging_dir=config["output"]["logging_dir"],
        report_to=config["output"]["report_to"],
        logging_steps=config["training"].get("logging_steps", 10),
        label_smoothing_factor=config["training"].get("label_smoothing_factor", 0.0),
        remove_unused_columns=False,
    )
    
    # Data collator
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Trainer with separate LRs for LoRA vs classification head
    trainer = RouterTrainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset["train"],
        eval_dataset=tokenized_dataset["validation"],
        processing_class=tokenizer,  # Changed from tokenizer= for transformers 5.0+
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=10)],
    )
    
    # Train
    logger.info("Starting training...")
    if args.resume:
        trainer.train(resume_from_checkpoint=args.resume)
    else:
        trainer.train()
    
    # Save final model
    trainer.save_model(f"{output_dir}/final")
    tokenizer.save_pretrained(f"{output_dir}/final")
    
    # Evaluate on test set if available
    test_file = resolve_data_path(data_config.get("test_file", "test.jsonl"), args.data_dir)
    
    if os.path.exists(test_file):
        test_dataset = load_dataset("json", data_files={"test": test_file})
        tokenized_test = test_dataset.map(
            preprocess,
            batched=True,
            remove_columns=test_dataset["test"].column_names,
        )
        
        results = trainer.evaluate(tokenized_test["test"])
        logger.info(f"Test results: {results}")
        
        with open(f"{output_dir}/test_results.json", "w") as f:
            json.dump(results, f, indent=2)
    
    logger.info(f"Training complete! Model saved to {output_dir}/final")


if __name__ == "__main__":
    main()
