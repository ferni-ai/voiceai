#!/usr/bin/env python3
"""
Ferni Router Model ONNX Export Script

Exports trained PyTorch model to ONNX format for inference in Node.js.

Usage:
    python export_onnx.py --model_dir ./outputs/ferni-router/final --output ./models/router.onnx
"""

import argparse
import json
import logging
import os
from pathlib import Path

import torch
from optimum.onnxruntime import ORTModelForSequenceClassification
from peft import PeftModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ferni-router-export")


def merge_lora_weights(model_dir: str) -> str:
    """Merge LoRA weights into base model for export."""
    logger.info("Checking for LoRA adapter...")
    
    adapter_config_path = Path(model_dir) / "adapter_config.json"
    
    if not adapter_config_path.exists():
        logger.info("No LoRA adapter found, using model directly")
        return model_dir
    
    # Load adapter config
    with open(adapter_config_path) as f:
        adapter_config = json.load(f)
    
    base_model_name = adapter_config.get("base_model_name_or_path")
    num_labels = len(json.load(open(Path(model_dir).parent / "label_map.json")))
    
    logger.info(f"Loading base model: {base_model_name}")
    base_model = AutoModelForSequenceClassification.from_pretrained(
        base_model_name,
        num_labels=num_labels,
        torch_dtype=torch.float32,  # Use float32 for ONNX export
    )
    
    logger.info("Loading and merging LoRA weights...")
    model = PeftModel.from_pretrained(base_model, model_dir)
    merged_model = model.merge_and_unload()
    
    # Save merged model
    merged_dir = Path(model_dir).parent / "merged"
    merged_dir.mkdir(exist_ok=True)
    
    merged_model.save_pretrained(merged_dir)
    
    # Also save tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    tokenizer.save_pretrained(merged_dir)
    
    # Copy label map
    label_map_src = Path(model_dir).parent / "label_map.json"
    label_map_dst = merged_dir / "label_map.json"
    if label_map_src.exists():
        import shutil
        shutil.copy(label_map_src, label_map_dst)
    
    logger.info(f"Merged model saved to {merged_dir}")
    return str(merged_dir)


def export_to_onnx(
    model_dir: str,
    output_path: str,
    opset_version: int = 14,
    optimize: bool = True,
    quantize: bool = False,
):
    """Export model to ONNX format."""
    logger.info(f"Exporting model from {model_dir} to ONNX...")
    
    # Ensure output directory exists
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Use optimum for export
    try:
        # Export using optimum
        model = ORTModelForSequenceClassification.from_pretrained(
            model_dir,
            export=True,
            provider="CPUExecutionProvider",
        )
        
        # Save ONNX model
        model.save_pretrained(output_dir)
        
        # Rename to desired output name
        onnx_model_path = output_dir / "model.onnx"
        if onnx_model_path.exists() and str(onnx_model_path) != output_path:
            os.rename(onnx_model_path, output_path)
        
        logger.info(f"ONNX model exported to {output_path}")
        
    except Exception as e:
        logger.warning(f"Optimum export failed, trying manual export: {e}")
        manual_onnx_export(model_dir, output_path, opset_version)
    
    # Apply optimizations
    if optimize:
        optimize_onnx(output_path)
    
    # Apply quantization
    if quantize:
        quantize_onnx(output_path)
    
    # Verify export
    verify_onnx(output_path)


def manual_onnx_export(model_dir: str, output_path: str, opset_version: int):
    """Manual ONNX export using torch.onnx."""
    import torch.onnx
    
    logger.info("Performing manual ONNX export...")
    
    # Load model
    model = AutoModelForSequenceClassification.from_pretrained(model_dir)
    tokenizer = AutoTokenizer.from_pretrained(model_dir)
    
    model.eval()
    
    # Create dummy inputs
    dummy_text = "Help me with my habits"
    inputs = tokenizer(
        dummy_text,
        return_tensors="pt",
        padding="max_length",
        max_length=512,
        truncation=True,
    )
    
    # Export
    torch.onnx.export(
        model,
        (inputs["input_ids"], inputs["attention_mask"]),
        output_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "sequence_length"},
            "attention_mask": {0: "batch_size", 1: "sequence_length"},
            "logits": {0: "batch_size"},
        },
        opset_version=opset_version,
        do_constant_folding=True,
    )
    
    logger.info(f"Manual ONNX export complete: {output_path}")


def optimize_onnx(model_path: str):
    """Apply ONNX optimizations."""
    try:
        from onnxruntime.transformers import optimizer
        
        logger.info("Applying ONNX optimizations...")
        
        optimized_path = model_path.replace(".onnx", "_optimized.onnx")
        
        opt_model = optimizer.optimize_model(
            model_path,
            model_type="bert",
            num_heads=12,
            hidden_size=768,
        )
        opt_model.save_model_to_file(optimized_path)
        
        # Replace original with optimized
        os.replace(optimized_path, model_path)
        
        logger.info("ONNX optimizations applied")
        
    except Exception as e:
        logger.warning(f"ONNX optimization failed (non-critical): {e}")


def quantize_onnx(model_path: str):
    """Apply int8 quantization to ONNX model."""
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        
        logger.info("Applying int8 quantization...")
        
        quantized_path = model_path.replace(".onnx", "_quantized.onnx")
        
        quantize_dynamic(
            model_path,
            quantized_path,
            weight_type=QuantType.QInt8,
        )
        
        # Replace original with quantized
        os.replace(quantized_path, model_path)
        
        logger.info("Quantization complete")
        
    except Exception as e:
        logger.warning(f"Quantization failed (non-critical): {e}")


def verify_onnx(model_path: str):
    """Verify ONNX model is valid."""
    import onnx
    import onnxruntime as ort
    
    logger.info("Verifying ONNX model...")
    
    # Check model is valid
    model = onnx.load(model_path)
    onnx.checker.check_model(model)
    
    # Test inference
    session = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    
    # Get input shapes
    inputs = session.get_inputs()
    logger.info(f"Model inputs: {[inp.name for inp in inputs]}")
    logger.info(f"Model outputs: {[out.name for out in session.get_outputs()]}")
    
    # Get model size
    model_size_mb = os.path.getsize(model_path) / (1024 * 1024)
    logger.info(f"Model size: {model_size_mb:.2f} MB")
    
    logger.info("ONNX verification passed!")


def main():
    parser = argparse.ArgumentParser(description="Export Ferni Router Model to ONNX")
    parser.add_argument("--model_dir", type=str, required=True, help="Model directory")
    parser.add_argument("--output", type=str, required=True, help="Output ONNX path")
    parser.add_argument("--opset", type=int, default=14, help="ONNX opset version")
    parser.add_argument("--no-optimize", action="store_true", help="Skip optimization")
    parser.add_argument("--quantize", action="store_true", help="Apply int8 quantization")
    args = parser.parse_args()
    
    # Merge LoRA weights if needed
    model_dir = merge_lora_weights(args.model_dir)
    
    # Export to ONNX
    export_to_onnx(
        model_dir=model_dir,
        output_path=args.output,
        opset_version=args.opset,
        optimize=not args.no_optimize,
        quantize=args.quantize,
    )
    
    logger.info("Export complete!")


if __name__ == "__main__":
    main()
