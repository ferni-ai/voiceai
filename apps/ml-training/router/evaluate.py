#!/usr/bin/env python3
"""
Ferni Router Model Evaluation Script

Evaluates trained model on test set with detailed metrics.

Usage:
    python evaluate.py --model_dir ./outputs/ferni-router/final --data_dir ./data
"""

import argparse
import json
import logging
from pathlib import Path
from typing import Dict, List

import numpy as np
import torch
from datasets import load_dataset
from peft import PeftModel
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from tqdm import tqdm

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ferni-router-evaluate")


def load_label_map(model_dir: str) -> Dict[str, int]:
    """Load label mapping from model directory."""
    label_map_path = Path(model_dir).parent / "label_map.json"
    if not label_map_path.exists():
        label_map_path = Path(model_dir) / "label_map.json"
    
    with open(label_map_path, "r") as f:
        return json.load(f)


def evaluate_model(
    model,
    tokenizer,
    test_data,
    label_map: Dict[str, int],
    device: str = "cuda",
    batch_size: int = 16,
) -> Dict:
    """Evaluate model on test data."""
    model.eval()
    model.to(device)
    
    id_to_label = {v: k for k, v in label_map.items()}
    
    all_predictions = []
    all_labels = []
    all_top1_correct = 0
    all_top3_correct = 0
    total = 0
    
    # Collect predictions
    for i in tqdm(range(0, len(test_data), batch_size), desc="Evaluating"):
        batch = test_data[i:i + batch_size]
        
        # Tokenize
        inputs = tokenizer(
            batch["query"],
            padding=True,
            truncation=True,
            max_length=512,
            return_tensors="pt",
        ).to(device)
        
        # Get predictions
        with torch.no_grad():
            outputs = model(**inputs)
            probs = torch.sigmoid(outputs.logits).cpu().numpy()
        
        # Process each example
        for j, prob_row in enumerate(probs):
            example = batch[j] if isinstance(batch, list) else {
                k: batch[k][j] for k in batch.keys()
            }
            
            # Get true labels
            true_tools = example.get("selected_tools", [])
            true_indices = set(label_map.get(t, -1) for t in true_tools if t in label_map)
            true_indices.discard(-1)
            
            if not true_indices:
                continue
            
            total += 1
            
            # Multi-hot prediction (threshold 0.5)
            pred_indices = set(np.where(prob_row > 0.5)[0])
            
            # Top-k accuracy
            top_indices = np.argsort(prob_row)[::-1]
            if top_indices[0] in true_indices:
                all_top1_correct += 1
            if any(idx in true_indices for idx in top_indices[:3]):
                all_top3_correct += 1
            
            # Store for aggregate metrics
            label_vec = np.zeros(len(label_map))
            for idx in true_indices:
                label_vec[idx] = 1
            all_labels.append(label_vec)
            
            pred_vec = np.zeros(len(label_map))
            for idx in pred_indices:
                pred_vec[idx] = 1
            all_predictions.append(pred_vec)
    
    # Calculate metrics
    all_labels = np.array(all_labels)
    all_predictions = np.array(all_predictions)
    
    results = {
        "total_examples": total,
        "top1_accuracy": all_top1_correct / total if total > 0 else 0,
        "top3_accuracy": all_top3_correct / total if total > 0 else 0,
        "f1_micro": f1_score(all_labels, all_predictions, average="micro", zero_division=0),
        "f1_macro": f1_score(all_labels, all_predictions, average="macro", zero_division=0),
        "f1_weighted": f1_score(all_labels, all_predictions, average="weighted", zero_division=0),
    }
    
    # Per-tool metrics (top 20 most common)
    tool_counts = all_labels.sum(axis=0)
    top_tools = np.argsort(tool_counts)[::-1][:20]
    
    per_tool_f1 = f1_score(all_labels, all_predictions, average=None, zero_division=0)
    
    results["per_tool_metrics"] = {}
    for idx in top_tools:
        if idx < len(id_to_label):
            tool_name = id_to_label[idx]
            results["per_tool_metrics"][tool_name] = {
                "f1": float(per_tool_f1[idx]),
                "support": int(tool_counts[idx]),
            }
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Evaluate Ferni Router Model")
    parser.add_argument("--model_dir", type=str, required=True, help="Model directory")
    parser.add_argument("--data_dir", type=str, required=True, help="Data directory")
    parser.add_argument("--output", type=str, default="eval_results.json", help="Output file")
    parser.add_argument("--batch_size", type=int, default=16, help="Batch size")
    parser.add_argument("--device", type=str, default="cuda", help="Device")
    args = parser.parse_args()
    
    # Check device
    if args.device == "cuda" and not torch.cuda.is_available():
        logger.warning("CUDA not available, falling back to CPU")
        args.device = "cpu"
    
    # Load label map
    label_map = load_label_map(args.model_dir)
    logger.info(f"Loaded {len(label_map)} labels")
    
    # Load model and tokenizer
    logger.info(f"Loading model from {args.model_dir}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_dir)
    
    # Try loading as PEFT model first
    try:
        base_model = AutoModelForSequenceClassification.from_pretrained(
            args.model_dir,
            num_labels=len(label_map),
            torch_dtype=torch.float16 if args.device == "cuda" else torch.float32,
        )
        model = base_model
    except Exception as e:
        logger.warning(f"Failed to load directly, trying PEFT: {e}")
        # This might be a LoRA checkpoint
        config_path = Path(args.model_dir) / "adapter_config.json"
        if config_path.exists():
            with open(config_path) as f:
                adapter_config = json.load(f)
            base_model_name = adapter_config.get("base_model_name_or_path")
            base_model = AutoModelForSequenceClassification.from_pretrained(
                base_model_name,
                num_labels=len(label_map),
                torch_dtype=torch.float16 if args.device == "cuda" else torch.float32,
            )
            model = PeftModel.from_pretrained(base_model, args.model_dir)
        else:
            raise
    
    # Load test data
    test_file = Path(args.data_dir) / "test.jsonl"
    if not test_file.exists():
        logger.error(f"Test file not found: {test_file}")
        return
    
    test_data = load_dataset("json", data_files={"test": str(test_file)})["test"]
    logger.info(f"Loaded {len(test_data)} test examples")
    
    # Evaluate
    results = evaluate_model(
        model,
        tokenizer,
        test_data,
        label_map,
        device=args.device,
        batch_size=args.batch_size,
    )
    
    # Print results
    logger.info("\n" + "=" * 50)
    logger.info("EVALUATION RESULTS")
    logger.info("=" * 50)
    logger.info(f"Total examples: {results['total_examples']}")
    logger.info(f"Top-1 Accuracy: {results['top1_accuracy']:.4f}")
    logger.info(f"Top-3 Accuracy: {results['top3_accuracy']:.4f}")
    logger.info(f"F1 (micro): {results['f1_micro']:.4f}")
    logger.info(f"F1 (macro): {results['f1_macro']:.4f}")
    logger.info(f"F1 (weighted): {results['f1_weighted']:.4f}")
    
    logger.info("\nTop tools by support:")
    for tool, metrics in list(results["per_tool_metrics"].items())[:10]:
        logger.info(f"  {tool}: F1={metrics['f1']:.3f}, support={metrics['support']}")
    
    # Save results
    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)
    logger.info(f"\nResults saved to {args.output}")


if __name__ == "__main__":
    main()
