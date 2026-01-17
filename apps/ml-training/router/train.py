#!/usr/bin/env python3
"""
Ferni Router Model Training Script

Fine-tunes Qwen 2.5 1.5B for multi-label tool classification using LoRA.

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
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    EarlyStoppingCallback,
    Trainer,
    TrainingArguments,
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


def build_label_mapping(data_dir: str) -> Dict[str, int]:
    """Build mapping from tool IDs to label indices."""
    tool_ids = set()
    
    for split in ["train", "validation", "test"]:
        file_path = Path(data_dir) / f"{split}.jsonl"
        if file_path.exists():
            with open(file_path, "r") as f:
                for line in f:
                    example = json.loads(line)
                    tools = example.get("selected_tools", [])
                    tool_ids.update(tools)
    
    # Sort for reproducibility
    sorted_tools = sorted(tool_ids)
    return {tool: idx for idx, tool in enumerate(sorted_tools)}


def preprocess_function(
    examples: Dict,
    tokenizer,
    label_map: Dict[str, int],
    max_length: int,
    num_labels: int,
):
    """Preprocess examples for training."""
    # Tokenize queries
    tokenized = tokenizer(
        examples["query"],
        padding="max_length",
        truncation=True,
        max_length=max_length,
    )
    
    # Create multi-hot label vectors
    labels = []
    for tools in examples["selected_tools"]:
        label_vec = [0.0] * num_labels
        for tool in tools:
            if tool in label_map:
                label_vec[label_map[tool]] = 1.0
        labels.append(label_vec)
    
    tokenized["labels"] = labels
    return tokenized


def compute_metrics(eval_pred):
    """Compute metrics for evaluation."""
    predictions, labels = eval_pred
    
    # Apply sigmoid and threshold
    probs = torch.sigmoid(torch.tensor(predictions)).numpy()
    preds = (probs > 0.5).astype(int)
    
    # Compute metrics
    f1_micro = f1_score(labels, preds, average="micro", zero_division=0)
    f1_macro = f1_score(labels, preds, average="macro", zero_division=0)
    precision = precision_score(labels, preds, average="micro", zero_division=0)
    recall = recall_score(labels, preds, average="micro", zero_division=0)
    
    # Top-1 and Top-3 accuracy
    top1_correct = 0
    top3_correct = 0
    total = 0
    
    for prob_row, label_row in zip(probs, labels):
        true_tools = set(np.where(label_row == 1)[0])
        if not true_tools:
            continue
            
        total += 1
        top_indices = np.argsort(prob_row)[::-1]
        
        if top_indices[0] in true_tools:
            top1_correct += 1
        if any(idx in true_tools for idx in top_indices[:3]):
            top3_correct += 1
    
    return {
        "f1": f1_micro,
        "f1_macro": f1_macro,
        "precision": precision,
        "recall": recall,
        "top1_accuracy": top1_correct / total if total > 0 else 0,
        "top3_accuracy": top3_correct / total if total > 0 else 0,
    }


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
    
    # Build label mapping
    label_map = build_label_mapping(args.data_dir)
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
    
    # Load datasets
    data_files = {
        "train": f"{args.data_dir}/train.jsonl",
        "validation": f"{args.data_dir}/validation.jsonl",
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
    
    # Load model
    model = AutoModelForSequenceClassification.from_pretrained(
        config["model"]["base_model"],
        num_labels=num_labels,
        problem_type="multi_label_classification",
        torch_dtype=torch.float16 if config["training"]["fp16"] else torch.float32,
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    
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
        fp16=config["training"]["fp16"],
        dataloader_num_workers=config["training"]["dataloader_num_workers"],
        logging_dir=config["output"]["logging_dir"],
        report_to=config["output"]["report_to"],
        logging_steps=10,
        remove_unused_columns=False,
    )
    
    # Data collator
    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)
    
    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset["train"],
        eval_dataset=tokenized_dataset["validation"],
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
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
    test_file = f"{args.data_dir}/test.jsonl"
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
